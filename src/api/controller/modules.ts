import { Document } from "@langchain/core/documents";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { App } from "obsidian";
import { createChatGraph } from "src/api/infrastructure/chatGraph.js";
import { ChatHistory } from "src/api/infrastructure/chatHistory.js";
import { MarkdownProcessor } from "src/api/infrastructure/markdownProcessor.js";
import { OramaStore } from "src/api/infrastructure/vectorStore.js";
import { DocumentService } from "src/api/service/document.js";
import { SearchService } from "src/api/service/search.js";
import { VaultFile } from "src/api/utils/VaultFile.js";

export interface ISearchService {
	search(question: string): Promise<{
		answer: IterableReadableStream<AIMessageChunk>;
		docs: Document[];
	}>;
}

export interface IDocumentService {
	insert(filePaths: string[]): Promise<void>;
	reset(): Promise<void>;
}

interface ServiceMap {
	search: ISearchService;
	document: IDocumentService;
}

type NullableServiceMap = {
	[K in keyof ServiceMap]: ServiceMap[K] | null;
};

export class ServiceManager {
	private static instance: ServiceManager | null = null;

	private app: App | null = null;
	private dirPath: string = "";
	private file: VaultFile | null = null;
	private vectorStore: OramaStore | null = null;
	private chatHistory: ChatHistory | null = null;
	private markdownProcessor: MarkdownProcessor | null = null;

	private searchService: SearchService | null = null;
	private documentService: DocumentService | null = null;

	private constructor() {
		this.chatHistory = new ChatHistory();
	}

	public static getInstance(): ServiceManager {
		if (!ServiceManager.instance) {
			ServiceManager.instance = new ServiceManager();
		}
		return ServiceManager.instance;
	}

	public initContext(app: App, dirPath: string): void {
		this.app = app;
		this.dirPath = dirPath;
		this.file = new VaultFile(app);
		this.markdownProcessor = new MarkdownProcessor(this.file);
	}

	public async initializeServices(
		embeddings: EmbeddingsInterface,
		model: BaseChatModel
	) {
		if (!this.app || !this.file) {
			throw new Error("Context not initialized. Call initContext first.");
		}

		this.vectorStore = await OramaStore.init(embeddings, {
			dirPath: this.dirPath,
			file: this.file,
		});

		const chatGraph = createChatGraph(this.vectorStore, model);

		if (!this.chatHistory) {
			this.chatHistory = new ChatHistory();
		}

		this.searchService = new SearchService(chatGraph, this.chatHistory);
		this.documentService = new DocumentService(
			this.vectorStore,
			this.markdownProcessor!
		);
	}

	public getService<K extends keyof ServiceMap>(name: K): ServiceMap[K] {
		const serviceMap: NullableServiceMap = {
			search: this.searchService,
			document: this.documentService,
		};

		const service = serviceMap[name];
		if (!service) {
			throw new Error(`Service ${name} is not initialized.`);
		}
		return service;
	}
}
