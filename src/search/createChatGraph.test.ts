import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { createChatGraph } from "./createChatGraph";
import { Document } from "@langchain/core/documents";
import type { VectorStore } from "@langchain/core/vectorstores";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";
import { IterableReadableStream } from "@langchain/core/utils/stream";

const makeDocs = (n: number, prefix = "doc") =>
	Array.from(
		{ length: n },
		(_, i) =>
			new Document({
				pageContent: `content ${i}`,
				metadata: { source: `${prefix}${i}` },
			})
	);

function mockVectorStore(docs: Document[]) {
	return {
		similaritySearch: vi.fn(async (_q: string, k: number) =>
			docs.slice(0, k)
		),
	} as unknown as VectorStore;
}

function mockChatModel() {
	const analyse = vi.fn();
	const evaluate = vi.fn();

	const instance: Partial<BaseChatModel> = {
		withStructuredOutput: ((_schema: any, _config?: any) => {
			return {
				invoke: vi.fn(async (input: any) => {
					if (typeof input === "string") return analyse(input);
					return evaluate(input);
				}),
			};
		}) as unknown as BaseChatModel["withStructuredOutput"],

		stream: vi.fn(
			async (_input: any) =>
				"dummy" as unknown as IterableReadableStream<AIMessageChunk>
		),
	};
	return {
		instance: instance as BaseChatModel,
		analyse,
		evaluate,
	};
}

const initialDocs = makeDocs(3, "init");
const extraDocs = makeDocs(2, "extra");

describe("createChatGraph", () => {
	let store: VectorStore;
	let cm: ReturnType<typeof mockChatModel>;
	beforeEach(() => {
		store = mockVectorStore(initialDocs);
		cm = mockChatModel();
		// default behaviour every test can override
		cm.analyse.mockResolvedValue({
			query: "q",
			searchType: "similarity",
			k: 2,
		});
		cm.evaluate.mockResolvedValue({ isEnough: true });
	});

	it("returns answer with initial context", async () => {
		const graph = createChatGraph(store, cm.instance);
		const res = await graph.invoke({ question: "What is foo?" });

		expect(res.context).toEqual(initialDocs.slice(0, 2));
		expect(cm.analyse).toHaveBeenCalledTimes(1);
		expect(cm.evaluate).toHaveBeenCalledTimes(1);
		expect(cm.instance.stream).toHaveBeenCalledTimes(1);
	});

	it("skips extra retrieval when context is enough", async () => {
		cm.evaluate.mockResolvedValueOnce({ isEnough: true });
		const graph = createChatGraph(store, cm.instance);
		await graph.invoke({ question: "bar?" });

		// similaritySearch is called only once
		expect((store.similaritySearch as Mock).mock.calls).toHaveLength(1);
	});

	it("stop evaluating when exceeding max attempts", async () => {
		cm.evaluate.mockResolvedValue({
			isEnough: false,
			nextParams: {
				query: "q",
				searchType: "similarity",
				k: 2,
			},
		});
		const graph = createChatGraph(store, cm.instance);
		await graph.invoke({ question: "foo?" });
		expect(cm.evaluate).toHaveBeenCalledTimes(3);
		expect(cm.instance.stream).toHaveBeenCalledTimes(1);
		expect((store.similaritySearch as Mock).mock.calls).toHaveLength(4);
	});

	it("performs an additional search when context is insufficient", async () => {
		// 1st evaluation -> not enough, 2nd -> enough
		cm.evaluate
			.mockResolvedValueOnce({
				isEnough: false,
				nextParams: {
					query: "refined",
					searchType: "similarity",
					k: 3,
				},
			})
			.mockResolvedValueOnce({ isEnough: true });

		// Make vector store return different docs for the refined query
		(store.similaritySearch as Mock).mockImplementation(
			async (q: string, k: number) =>
				q === "refined"
					? extraDocs.slice(0, k)
					: initialDocs.slice(0, k)
		);

		const graph = createChatGraph(store, cm.instance);
		const res = await graph.invoke({ question: "baz?" });

		expect((store.similaritySearch as Mock).mock.calls).toHaveLength(2);
		expect(res.context).toEqual(extraDocs.slice(0, 3));
		expect(cm.instance.stream).toHaveBeenCalledTimes(1);
	});
});
