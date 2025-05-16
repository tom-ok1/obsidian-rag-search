import { createChatGraph, GraphDependencies } from "./chatGraph.js";
import { Document } from "@langchain/core/documents";
import { ChatHistory } from "./chatHistory.js";

describe("chatGraph acceptance", () => {
	const mockVectorStore = {
		similaritySearch: vi.fn(async (_query, _k) => [
			new Document({ pageContent: "doc1 content" }),
			new Document({ pageContent: "doc2 content" }),
		]),
		maxMarginalRelevanceSearch: vi.fn(),
	};

	const mockModel = {
		withStructuredOutput: vi.fn(() => ({
			invoke: vi.fn(async () => ({
				isEnough: true,
				nextParams: null,
			})),
		})),
		stream: vi.fn(async () => ({
			[Symbol.asyncIterator]: async function* () {
				yield { content: "answer" };
			},
		})),
	};

	const deps: GraphDependencies = {
		vectorStore: mockVectorStore as any,
		model: mockModel as any,
	};

	it("should answer a user question with sufficient context", async () => {
		const graph = createChatGraph(deps);
		const history = new ChatHistory();
		const result = await graph.invoke({
			question: "What is doc1?",
			history,
			search: {
				searchType: "similarity",
				query: "doc1",
				k: 8,
			},
			context: [],
			isEnough: false,
		});
		expect(result.answer).toBeDefined();
	});

	it("should retry if model returns invalid JSON", async () => {
		let callCount = 0;
		const model = {
			withStructuredOutput: vi.fn(() => ({
				invoke: vi.fn(async () => {
					callCount++;
					if (callCount === 1)
						throw new SyntaxError("Unexpected token");
					return { isEnough: true, nextParams: null };
				}),
			})),
			stream: vi.fn(),
		};
		const graph = createChatGraph({
			vectorStore: mockVectorStore as any,
			model: model as any,
		});
		const history = new ChatHistory();
		const result = await graph.invoke({
			question: "What is doc1?",
			history,
			search: { searchType: "similarity", query: "doc1", k: 8 },
			context: [],
			isEnough: false,
		});
		expect(result.answer).toBeDefined();
		expect(callCount).toBeGreaterThan(1);
	});
});
