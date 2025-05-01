import { createChatGraph } from "./createChatGraph";
import { VectorStore } from "@langchain/core/vectorstores";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Document } from "@langchain/core/documents";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
class MockVectorStore extends VectorStore {
	private documents: Document[];

	_vectorstoreType(): string {
		return "mock-vectorstore";
	}

	constructor(documents: Document[] = []) {
		// Create mock embeddings interface
		const mockEmbeddings = {
			embedDocuments: async (texts: string[]) =>
				texts.map(() => [0.1, 0.2, 0.3]),
			embedQuery: async (text: string) => [0.1, 0.2, 0.3],
		};
		super(mockEmbeddings, {});
		this.documents = documents;
	}

	async similaritySearch(_: string, k: number): Promise<Document[]> {
		return this.documents.slice(0, k);
	}

	async similaritySearchVectorWithScore(
		_: number[],
		k: number
	): Promise<[Document, number][]> {
		// Just return documents with dummy scores
		return this.documents.slice(0, k).map((doc) => [doc, 0.9]);
	}

	async addVectors(_: number[][], documents: Document[]): Promise<void> {
		// Simulate adding vectors
		this.documents = [...this.documents, ...documents];
	}

	async addDocuments(documents: Document[]): Promise<void> {
		// Simulate adding documents
		this.documents = [...this.documents, ...documents];
	}

	static async fromTexts(): Promise<any> {
		throw new Error("Not implemented");
	}

	static async fromDocuments(): Promise<any> {
		throw new Error("Not implemented");
	}
}

class MockAIMessageChunk extends AIMessage implements AIMessageChunk {
	concat(chunk: AIMessageChunk): AIMessageChunk {
		// Handle concatenation safely by converting content to string if needed
		const content =
			typeof this.content === "string" &&
			typeof chunk.content === "string"
				? this.content + chunk.content
				: "Concatenated content";

		return new MockAIMessageChunk({
			content: content,
		});
	}
}

// Mock implementation of BaseChatModel
class MockChatModel extends BaseChatModel<any, AIMessageChunk> {
	_llmType(): string {
		return "mock-chat-model";
	}

	async _generate(_: BaseLanguageModelInput): Promise<any> {
		return {
			generations: [
				{
					message: new MockAIMessageChunk({
						content:
							"This is a mock response based on the provided context.",
					}),
					text: "This is a mock response based on the provided context.",
				},
			],
		};
	}

	withStructuredOutput<T>(_: any): any {
		return {
			invoke: async (input: string): Promise<T> => {
				return {
					query: "mock search query from " + input,
				} as unknown as T;
			},
		};
	}

	invoke(_: BaseLanguageModelInput): Promise<AIMessageChunk> {
		return Promise.resolve(
			new MockAIMessageChunk({
				content:
					"This is a mock response based on the provided context.",
			})
		);
	}
}

describe("createChatGraph", () => {
	// Test data
	const testDocuments = [
		new Document({
			pageContent: "This is test document 1",
			metadata: { source: "test1" },
		}),
		new Document({
			pageContent: "This is test document 2",
			metadata: { source: "test2" },
		}),
		new Document({
			pageContent: "This is test document 3",
			metadata: { source: "test3" },
		}),
	];

	let mockVectorStore: MockVectorStore;
	let mockChatModel: MockChatModel;

	beforeEach(() => {
		mockVectorStore = new MockVectorStore(testDocuments);
		mockChatModel = new MockChatModel({});
	});

	it("should create a graph that can be invoked with a question", async () => {
		const graph = createChatGraph(mockVectorStore, mockChatModel, 2);

		const result = await graph.invoke({
			question: "What is a test question?",
		});

		expect(result).toHaveProperty("answer");
		expect(result.question).toEqual("What is a test question?");
		expect(result.search.query).toEqual(
			"mock search query from What is a test question?"
		);
		expect(result.context).toEqual(testDocuments.slice(0, 2));
		expect(result.answer).toEqual(
			"This is a mock response based on the provided context."
		);
	});
});
