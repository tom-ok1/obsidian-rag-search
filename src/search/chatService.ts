import { FileAdapter } from "src/utils/fileAdapter.js";
import { OramaStore } from "../infrastructure/vectorStore.js";
import { ChatMessage, createChatGraph } from "../infrastructure/chatGraph.js";
import { MarkdownProcessor } from "../infrastructure/markdownProcessor.js";

type ChatGraph = ReturnType<typeof createChatGraph>;

export class ChatService {
	private history: ChatMessage[] = [];

	private constructor(
		private readonly chatGraph: ChatGraph,
		private readonly vectorStore: OramaStore,
		private readonly markdownProcessor: MarkdownProcessor
	) {}

	static async create(params: {
		file: FileAdapter;
		dirPath: string;
		numOfShards: number;
		language?: string;
	}) {
		const { file, dirPath, numOfShards, language } = params;
		const { ChatVertexAI, VertexAIEmbeddings } = await import(
			"@langchain/google-vertexai"
		);

		const model = new ChatVertexAI({
			model: "claude-3-5-sonnet-v2@20241022",
			streaming: true,
			streamUsage: false,
			authOptions: {
				projectId:
					process.env.GOOGLE_PROJECT_ID || "tomoya-oki-sandbox",
			},
		});
		const embeddings = new VertexAIEmbeddings({
			model: "text-embedding-004",
			authOptions: {
				projectId:
					process.env.GOOGLE_PROJECT_ID || "tomoya-oki-sandbox",
			},
		});

		const vectorStore = await OramaStore.init(embeddings, {
			file,
			dirPath,
			numOfShards,
			modelName: model._modelType(),
			language,
		});
		const markdownProcessor = new MarkdownProcessor(file);
		const chatGraph = createChatGraph(vectorStore, model);
		return new ChatService(chatGraph, vectorStore, markdownProcessor);
	}

	async search(question: string) {
		const res = await this.chatGraph.invoke({
			question,
			history: this.history,
		});
		this.history.concat(res.history);
		this.history.push({
			role: "user",
			content: question,
		});
		return { answer: res.answer, docs: res.context };
	}

	/**
	 *  Add chat history from finished readable stream
	 * @param history assistant's chat history
	 */
	async addChatHistory(history: ChatMessage) {
		this.history.push(history);
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
}
