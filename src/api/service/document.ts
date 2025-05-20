import { OramaStore } from "src/api/infrastructure/vectorStore.js";
import { MarkdownProcessor } from "../infrastructure/markdownProcessor.js";
import { IDocumentService } from "src/api/modules.js";

export class DocumentService implements IDocumentService {
	constructor(
		private readonly vectorStore: OramaStore,
		private readonly markdownProcessor: MarkdownProcessor
	) {}

	async reindex(filePaths: string[]) {
		try {
			await this.vectorStore.reset();

			// Process files in batches of 500
			const BATCH_SIZE = 500;
			const batches = this.splitIntoBatches(filePaths, BATCH_SIZE);

			for (const batch of batches) {
				const processedMarkdownFiles =
					await this.markdownProcessor.processMarkdownFiles(batch);
				const documents = processedMarkdownFiles.map((file) => ({
					id: file.id,
					pageContent: file.content,
					metadata: file.documentMetadata,
				}));
				await this.vectorStore.addDocuments(documents);
			}
		} catch (error) {
			await this.vectorStore.reset();
			throw new Error(`Reindexing failed: ${error.message}`);
		}
	}

	private splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
		const batches: T[][] = [];
		for (let i = 0; i < items.length; i += batchSize) {
			batches.push(items.slice(i, i + batchSize));
		}
		return batches;
	}
}
