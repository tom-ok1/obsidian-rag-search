import { createChatGraph, type ChatMessage, MAX_RETRIES } from "./chatGraph.js";
import { ChatHistory } from "./chatHistory.js";
import { Document } from "@langchain/core/documents";
import type { VectorStore } from "@langchain/core/vectorstores";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { Mock } from "vitest";

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

function chunkStream(
	text = "Mock assistant response"
): ReadableStream<AIMessageChunk> {
	return new ReadableStream<AIMessageChunk>({
		start(c) {
			c.enqueue({ content: text } as AIMessageChunk);
			c.close();
		},
	});
}

function mockChatModel() {
	const analyse = vi.fn();
	const evaluate = vi.fn();
	const stream = vi.fn(
		async () =>
			chunkStream() as unknown as IterableReadableStream<AIMessageChunk>
	);

	const instance: Partial<BaseChatModel> = {
		withStructuredOutput: ((schema: any) => {
			const isSearch = "query" in (schema.shape ?? {});
			return {
				invoke: vi.fn(async (input: any) =>
					isSearch ? analyse(input) : evaluate(input)
				),
			};
		}) as unknown as BaseChatModel["withStructuredOutput"],

		stream,
	};
	return {
		instance: instance as BaseChatModel,
		analyse,
		evaluate,
		stream,
	};
}

const initialDocs = makeDocs(3, "init");
const extraDocs = makeDocs(2, "extra");

describe("createChatGraph", () => {
	let store: VectorStore;
	let cm: ReturnType<typeof mockChatModel>;
	let chatHistory: ChatHistory;
	beforeEach(() => {
		store = mockVectorStore(initialDocs);
		cm = mockChatModel();
		chatHistory = new ChatHistory();
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
		const res = await graph.invoke({
			question: "What is foo?",
			history: chatHistory,
		});

		expect(res.context).toEqual(initialDocs.slice(0, 2));
		expect(cm.analyse).toHaveBeenCalledTimes(1);
		expect(cm.evaluate).toHaveBeenCalledTimes(1);
		expect(cm.instance.stream).toHaveBeenCalledTimes(1);
	});

	it("skips extra retrieval when context is enough", async () => {
		cm.evaluate.mockResolvedValueOnce({ isEnough: true });
		const graph = createChatGraph(store, cm.instance);
		await graph.invoke({
			question: "bar?",
			history: chatHistory,
		});

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
		await graph.invoke({
			question: "foo?",
			history: chatHistory,
		});
		expect(cm.evaluate).toHaveBeenCalledTimes(MAX_RETRIES);
		expect(cm.instance.stream).toHaveBeenCalledTimes(1);
		expect((store.similaritySearch as Mock).mock.calls).toHaveLength(
			MAX_RETRIES + 1
		);
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
		const res = await graph.invoke({
			question: "baz?",
			history: chatHistory,
		});

		expect((store.similaritySearch as Mock).mock.calls).toHaveLength(2);
		expect(res.context).toEqual(extraDocs.slice(0, 3));
		expect(cm.instance.stream).toHaveBeenCalledTimes(1);
	});

	it("retries when LLM returns un‑structured output first and succeeds on second try", async () => {
		cm.analyse
			.mockRejectedValueOnce(new Error("Invalid JSON"))
			.mockResolvedValueOnce({
				query: "q",
				searchType: "similarity",
				k: 2,
			});

		cm.evaluate.mockResolvedValueOnce({ isEnough: true });

		const graph = createChatGraph(store, cm.instance);
		const res = await graph.invoke({
			question: "broken json?",
			history: chatHistory,
		});

		expect(cm.analyse).toHaveBeenCalledTimes(2);
		expect(res.context).toEqual(initialDocs.slice(0, 2));
		expect(cm.instance.stream).toHaveBeenCalledTimes(1);
	});

	it("add chat history to the context", async () => {
		const testHistory = new ChatHistory();
		testHistory.addMessage({ role: "user", content: "Who is Einstein?" });
		testHistory.addMessage({
			role: "assistant",
			content: "Albert Einstein was a theoretical physicist.",
		});

		const graph = createChatGraph(store, cm.instance);
		const res = await graph.invoke({
			question: "What did he discover?",
			history: testHistory,
		});

		// Check that history was formatted properly and passed to the model
		const expectedFormattedHistory =
			"user: Who is Einstein?\nassistant: Albert Einstein was a theoretical physicist.";
		const promptCallArg = (cm.stream as Mock).mock.calls[0][0];
		expect(promptCallArg.toString()).toContain(expectedFormattedHistory);

		// Verify history was returned in the response
		expect(res.history).toBe(testHistory);
	});
});
