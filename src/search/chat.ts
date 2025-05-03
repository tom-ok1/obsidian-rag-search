import { FileAdapter } from "src/utils/fileAdapter.js";
import { OramaStore } from "./vectorStore.js";
import { createChatGraph } from "./createChatGraph.js";
import { MarkdownProcessor } from "./markdownProcessor.js";
type ChatGraph = ReturnType<typeof createChatGraph>;

export class RagManager {
	private constructor(
		private readonly chatGraph: ChatGraph,
		private readonly vectorStore: OramaStore,
		private readonly markdownProcessor: MarkdownProcessor
	) {}

	static async create(params: {
		file: FileAdapter;
		dirPath: string;
		numOfShards: number;
	}) {
		const { file, dirPath, numOfShards } = params;
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

		const vectorStore = await OramaStore.create(embeddings, {
			file,
			dirPath,
			numOfShards,
			modelName: model._modelType(),
		});
		const markdownProcessor = new MarkdownProcessor(file);
		const chatGraph = createChatGraph(vectorStore, model);
		return new RagManager(chatGraph, vectorStore, markdownProcessor);
	}

	async search(question: string) {
		const res = await this.chatGraph.invoke({
			question,
		});
		return { answer: res.answer, docs: res.context };
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
