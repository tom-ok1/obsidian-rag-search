import { FileAdapter } from "src/adapters/fileAdapter";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { OramaStore } from "./vectorStore";
import { createChatGraph } from "./createChatGraph";
import { MarkdownProcessor } from "./markdownProcessor";

type ChatGraph = ReturnType<typeof createChatGraph>;

export class RagManager {
	private constructor(
		private readonly chatGraph: ChatGraph,
		private readonly vectorStore: OramaStore,
		private readonly markdownProcessor: MarkdownProcessor
	) {}

	static async create(params: {
		file: FileAdapter;
		embeddings: EmbeddingsInterface;
		model: BaseChatModel;
		dirPath: string;
		numOfShards: number;
	}) {
		const { file, embeddings, model, dirPath, numOfShards } = params;
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
