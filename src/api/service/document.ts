import { OramaStore } from "src/api/infrastructure/vectorStore.js";
import { MarkdownProcessor } from "../infrastructure/markdownProcessor.js";
import { IDocumentService } from "src/api/modules.js";

export class DocumentService implements IDocumentService {
	constructor(
		private readonly vectorStore: OramaStore,
		private readonly markdownProcessor: MarkdownProcessor
	) {}

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
