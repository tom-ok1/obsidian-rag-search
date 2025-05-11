import { FileAdapter } from "src/utils/fileAdapter.js";
import { OramaStore } from "../infrastructure/vectorStore.js";
import { ChatMessage, createChatGraph } from "../infrastructure/chatGraph.js";
import { MarkdownProcessor } from "../infrastructure/markdownProcessor.js";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { ChatHistory } from "../infrastructure/chatHistory.js";

type ChatGraph = ReturnType<typeof createChatGraph>;
/**
 * @param dirPath - Directory path to store the database files
 * @param file - File adapter for file operations
 * @param language - Language for the database, defaults to "english", japanese tokenizer is used if language is "japanese"
 */
type RagConfig = {
	dirPath: string;
	language?: string;
};

export class RagService {
	private chatHistory: ChatHistory;

	private constructor(
		private readonly chatGraph: ChatGraph,
		private readonly vectorStore: OramaStore,
		private readonly markdownProcessor: MarkdownProcessor
	) {
		this.chatHistory = new ChatHistory();
	}

	static async create(params: {
		model: BaseChatModel;
		embeddings: EmbeddingsInterface;
		file: FileAdapter;
		config: RagConfig;
	}) {
		const { file, model, embeddings, config } = params;

		const vectorStore = await OramaStore.init(embeddings, {
			...config,
			file,
			modelName: model._modelType(),
		});
		const markdownProcessor = new MarkdownProcessor(file);
		const chatGraph = createChatGraph(vectorStore, model);
		return new RagService(chatGraph, vectorStore, markdownProcessor);
	}

	async search(question: string) {
		const res = await this.chatGraph.invoke({
			question,
			history: this.chatHistory,
		});

		this.chatHistory.addMessage({
			role: "user",
			content: question,
		});

		return { answer: res.answer, docs: res.context };
	}

	/**
	 *  Add chat history from finished readable stream
	 * @param message assistant's chat history
	 */
	async addChatHistory(message: ChatMessage) {
		this.chatHistory.addMessage(message);
	}

	async insert(filePaths: string[]) {
		const processedMarkdownFiles =
			await this.markdownProcessor.processMarkdownFiles(filePaths);
		const documents = processedMarkdownFiles.map((file) => ({
			id: file.id,
			pageContent: file.content,
			metadata: file.documentMetadata,
		}));
		await this.vectorStore.addDocuments(documents);
	}

	async reset() {
		await this.vectorStore.reset();
	}
}
