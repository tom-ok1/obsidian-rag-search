import { request as httpsRequest } from "node:https";
import { requestUrl } from "obsidian";

// override fetch to avoid CORS
export const corslessFetch: typeof fetch = async (input, init = {}) => {
	// 1. get url
	let url: string;
	if (typeof input === "string") url = input;
	else if (input instanceof URL) url = input.href;
	else url = input.url;

	const method = init.method ?? "GET";
	const headers: Record<string, string> = {};
	new Headers(init.headers).forEach((v, k) => (headers[k] = v));
	let body: any = init.body;

	// 2. get body
	let wantsStream = false;
	if (typeof body !== "string" && body) {
		body = await (body instanceof Blob ? body.text() : body);
	}
	if (typeof body === "string") {
		try {
			const json = JSON.parse(body);
			wantsStream = !!json.stream;
		} catch (e) {
			console.warn("Failed to parse JSON body", e);
			// do nothing
		}
	}

	// 3-1. if not stream, use requestUrl
	if (!wantsStream) {
		const res = await requestUrl({
			url,
			method,
			headers,
			body,
		});

		return new Response(res.arrayBuffer, {
			status: res.status,
			headers: new Headers(res.headers),
		});
	}

	// 3-2. if stream, use https.request
	return new Promise<Response>((resolve, reject) => {
		const { hostname, pathname, search, protocol, port } = new URL(url);

		const req = httpsRequest(
			{
				protocol,
				hostname,
				port,
				path: pathname + search,
				method,
				headers,
			},
			(res) => {
				resolve({
					ok: res.statusCode! >= 200 && res.statusCode! < 300,
					status: res.statusCode!,
					headers: new Headers(res.headers as Record<string, string>),
					body: res as any,
				} as any);
			}
		);

		req.on("error", reject);
		if (body) req.write(body);
		req.end();
	});
};
