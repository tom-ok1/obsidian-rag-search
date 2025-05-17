import fetch from "node-fetch";
import { Readable } from "stream";
import {
	AbstractStream,
	ensureAuthOptionScopes,
	GoogleAbstractedClient,
	GoogleAbstractedClientOps,
	GoogleConnectionParams,
	JsonStream,
	SseJsonStream,
	SseStream,
} from "@langchain/google-common";
import { GoogleAuth, GoogleAuthOptions } from "google-auth-library";
import { Gaxios, GaxiosOptions, GaxiosResponse } from "gaxios";

class NodeAbstractStream implements AbstractStream {
	private baseStream: AbstractStream;

	constructor(baseStream: AbstractStream, data: Readable) {
		this.baseStream = baseStream;
		const decoder = new TextDecoder("utf-8");
		data.on("data", (data) => {
			const text = decoder.decode(data, { stream: true });
			this.appendBuffer(text);
		});
		data.on("end", () => {
			const rest = decoder.decode();
			this.appendBuffer(rest);
			this.closeBuffer();
		});
	}

	appendBuffer(data: string): void {
		return this.baseStream.appendBuffer(data);
	}

	closeBuffer(): void {
		return this.baseStream.closeBuffer();
	}

	nextChunk(): Promise<any> {
		return this.baseStream.nextChunk();
	}

	get streamDone(): boolean {
		return this.baseStream.streamDone;
	}
}

export class NodeJsonStream extends NodeAbstractStream {
	constructor(data: Readable) {
		super(new JsonStream(), data);
	}
}

export class NodeSseStream extends NodeAbstractStream {
	constructor(data: Readable) {
		super(new SseStream(), data);
	}
}

export class NodeSseJsonStream extends NodeAbstractStream {
	constructor(data: Readable) {
		super(new SseJsonStream(), data);
	}
}

export class GAuthClient implements GoogleAbstractedClient {
	gauth: GoogleAuth;

	constructor(fields?: GoogleConnectionParams<GoogleAuthOptions>) {
		const options = ensureAuthOptionScopes<GoogleAuthOptions>(
			fields?.authOptions,
			"scopes",
			fields?.platformType
		);
		this.gauth = new GoogleAuth({
			...options,
			clientOptions: { transporter: new NodeFetchTransporter() },
		});
	}

	async request(opts: GoogleAbstractedClientOps): Promise<unknown> {
		const ret = await this.gauth.request(opts);
		const [contentType] = ret?.headers?.["content-type"]?.split(/;/) ?? [
			"",
		];
		if (opts.responseType !== "stream") {
			return ret;
		} else if (contentType === "text/event-stream") {
			return {
				...ret,
				data: new NodeSseJsonStream(ret.data),
			};
		} else {
			return {
				...ret,
				data: new NodeJsonStream(ret.data),
			};
		}
	}

	get clientType(): string {
		return "gauth";
	}

	async getProjectId(): Promise<string> {
		return this.gauth.getProjectId();
	}
}

/**
 * A custom transporter to avoid cors with node-fetch
 */
export class NodeFetchTransporter extends Gaxios {
	async request<T = any>(opts: GaxiosOptions): Promise<GaxiosResponse<T>> {
		const init: RequestInit = {
			method: opts.method || "GET",
			headers: this.normalizeHeaders(opts.headers),
		};

		if (opts.data) {
			if (opts.data instanceof URLSearchParams) {
				init.headers = {
					...init.headers,
					"Content-Type": "application/x-www-form-urlencoded",
				};
				init.body = opts.data.toString();
			} else if (typeof opts.data === "string") {
				init.body = opts.data;
			} else {
				init.headers = {
					...init.headers,
					"Content-Type": "application/json",
				};
				init.body = JSON.stringify(opts.data);
			}
		}

		const res = await fetch(opts.url!, init as any);

		const status = res.status;
		const statusText = res.statusText;

		const headers: Record<string, string> =
			typeof (res.headers as any).raw === "function"
				? Object.fromEntries(
						Object.entries((res.headers as any).raw()).map(
							([k, v]) => [
								k.toLowerCase(),
								Array.isArray(v) ? v.join(", ") : String(v),
							]
						)
				  )
				: Object.fromEntries(res.headers.entries());

		let data: any;
		if (opts.responseType === "stream") {
			data = res.body as Readable;
		} else {
			const text = await res.text();
			const contentType = res.headers.get("content-type") || "";
			if (contentType.includes("application/json")) {
				data = JSON.parse(text);
			} else {
				data = text;
			}
		}

		return {
			data,
			status,
			statusText,
			headers,
			config: opts,
			request: {
				responseURL: res.url,
			},
		};
	}

	private normalizeHeaders(
		h?: GaxiosOptions["headers"]
	): Record<string, string> | undefined {
		if (!h) return undefined;

		if (h instanceof Headers) {
			const obj: Record<string, string> = {};
			h.forEach((value, key) => {
				obj[key] = value;
			});
			return obj;
		}
		if (Array.isArray(h)) {
			return Object.fromEntries(h);
		}
		return { ...h };
	}
}
