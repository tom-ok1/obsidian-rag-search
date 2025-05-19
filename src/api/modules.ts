import { Document } from "@langchain/core/documents";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk } from "@langchain/core/messages";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { App } from "obsidian";
import { createChatGraph } from "src/api/infrastructure/chatGraph.js";
import { ChatHistory, ChatMessage } from "src/api/service/chatHistory.js";
import { MarkdownProcessor } from "src/api/infrastructure/markdownProcessor.js";
import { OramaStore } from "src/api/infrastructure/vectorStore.js";
import { DocumentService } from "src/api/service/document.js";
import { SearchService } from "src/api/service/search.js";

export interface ISearchService {
	search(question: string): Promise<{
		answer: IterableReadableStream<AIMessageChunk>;
		docs: Document[];
	}>;
}

export interface IDocumentService {
	reindex(filePaths: string[]): Promise<void>;
}

export interface IChatHistory {
	addMessage(message: ChatMessage): void;
	getMessages(): ChatMessage[];
}

interface ServiceMap {
	search: ISearchService;
	document: IDocumentService;
	history: IChatHistory;
}

type Nullable<T> = {
	[P in keyof T]: T[P] | null;
};

export class ServiceManager {
	private static instance: ServiceManager | null = null;

	private app: App | null = null;
	private dirPath: string = "";

	// Services
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
	}

	public async initializeServices(
		embeddings: EmbeddingsInterface,
		model: BaseChatModel
	) {
		if (!this.app) {
			throw new Error("Context not initialized. Call initContext first.");
		}

		this.vectorStore = await OramaStore.init(embeddings, {
			dirPath: this.dirPath,
			file: this.app.vault.adapter,
		});

		// private services
		const chatGraph = createChatGraph({
			model,
			vectorStore: this.vectorStore,
		});
		this.markdownProcessor = new MarkdownProcessor(this.app.vault.adapter);

		// public services
		this.chatHistory = new ChatHistory();
		this.searchService = new SearchService(chatGraph, this.chatHistory);
		this.documentService = new DocumentService(
			this.vectorStore,
			this.markdownProcessor
		);
	}

	public getService<K extends keyof ServiceMap>(name: K): ServiceMap[K] {
		const serviceMap: Nullable<ServiceMap> = {
			search: this.searchService,
			document: this.documentService,
			history: this.chatHistory,
		};

		const service = serviceMap[name];
		if (!service) {
			throw new Error(`Service ${name} is not initialized.`);
		}
		return service;
	}
}
