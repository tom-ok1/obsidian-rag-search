import {
	MaxMarginalRelevanceSearchOptions,
	VectorStore,
} from "@langchain/core/vectorstores";
import {
	Document,
	DocumentInput,
	DocumentInterface,
} from "@langchain/core/documents";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { InternalTypedDocument, Schema, WhereCondition } from "@orama/orama";
import { DocumentRepository } from "../infrastructure/documentRepository.js";
import { MdDocMetadata } from "./markdownProcessor.js";
import { Callbacks } from "@langchain/core/callbacks/manager";
import { DataAdapter } from "obsidian";

export type MdDocRawSchema = Awaited<ReturnType<OramaStore["documentSchema"]>>;
type MdDocInterface = DocumentInterface<Partial<Schema<MdDocRawSchema>>>;

export class MarkDownDoc extends Document<MdDocMetadata> {
	constructor(fields: DocumentInput<MdDocMetadata>) {
		super(fields);
	}
}

interface OramaStoreConfig {
	dirPath: string;
	file: DataAdapter;
	modelName?: string;
	language?: string;
}

export class OramaStore extends VectorStore {
	private db: DocumentRepository<MdDocRawSchema>;
	private modelName?: string;

	private constructor(
		embeddings: EmbeddingsInterface,
		dbConfig: OramaStoreConfig
	) {
		super(embeddings, dbConfig);
	}

	_vectorstoreType(): string {
		return "orama";
	}

	static async init(
		embeddings: EmbeddingsInterface,
		dbConfig: OramaStoreConfig
	) {
		const store = new OramaStore(embeddings, dbConfig);
		const { file, dirPath, modelName, language } = dbConfig;
		store.modelName = modelName;

		const schema = await store.documentSchema();
		store.db = await DocumentRepository.init(
			file,
			{
				dirPath,
				schema,
			},
			language
		);

		return store;
	}

	async reset() {
		await this.db.reset();
	}

	async addVectors(
		vectors: number[][],
		documents: MdDocInterface[]
	): Promise<string[] | void> {
		if (vectors.length !== documents.length) {
			throw new Error(
				`The number of vectors (${vectors.length}) must match the number of documents (${documents.length}).`
			);
		}
		const documentsWithEmbeddings = documents.map((doc, index) =>
			this.mapDocumentToSchema(doc, vectors[index])
		);
		await this.db.insertMany(documentsWithEmbeddings);
		await this.db.rebalance();
		return documents.map(({ id }) => id).filter((id) => id !== undefined);
	}

	async addDocuments(documents: MdDocInterface[]): Promise<string[] | void> {
		const vectorizedDocuments = await this.embeddings.embedDocuments(
			documents.map((doc) => doc.pageContent)
		);
		const documentsWithEmbeddings = documents.map((doc, index) =>
			this.mapDocumentToSchema(doc, vectorizedDocuments[index])
		);
		await this.db.insertMany(documentsWithEmbeddings);
		return documents.map(({ id }) => id).filter((id) => id !== undefined);
	}

	async similaritySearchVectorWithScore(
		query: number[],
		k: number,
		filter?: Partial<WhereCondition<MdDocRawSchema>>
	): Promise<[MdDocInterface, number][]> {
		const results = await this.db.search(query, { k, filter });
		return results.map(({ document, score }) => [
			this.toDocument(document),
			score,
		]);
	}

	async maxMarginalRelevanceSearch(
		query: string,
		options: MaxMarginalRelevanceSearchOptions<
			WhereCondition<MdDocRawSchema>
		>,
		_callbacks: Callbacks | undefined
	): Promise<MdDocInterface[]> {
		const { k, fetchK, lambda, filter } = options;
		const embedding = await this.embeddings.embedQuery(query);
		const results = await this.db.search(embedding, {
			k,
			fetchK,
			lambda,
			filter,
		});
		return results.map(({ document }) => this.toDocument(document));
	}

	private toDocument(
		document: InternalTypedDocument<Schema<MdDocRawSchema>>
	): MdDocInterface {
		return {
			id: document.id,
			pageContent: document.content,
			metadata: {
				title: document.title,
				path: document.path,
				extension: document.extension,
				tags: document.tags,
				ctime: document.ctime,
				mtime: document.mtime,
				embeddingModel: this.modelName,
			},
		};
	}

	private mapDocumentToSchema(doc: MdDocInterface, embedding: number[]) {
		return {
			id: doc.id,
			content: doc.pageContent,
			embedding,
			title: doc.metadata.title,
			path: doc.metadata.path,
			extension: doc.metadata.extension,
			tags: doc.metadata.tags,
			ctime: doc.metadata.ctime,
			mtime: doc.metadata.mtime,
			embeddingModel: this.modelName,
		};
	}

	private async documentSchema() {
		const sampleText = "Sample text for embedding";
		const { length: vectorLength } = await this.embeddings.embedQuery(
			sampleText
		);
		return {
			id: "string",
			title: "string",
			path: "string",
			content: "string",
			embedding: `vector[${vectorLength}]`,
			embeddingModel: "string",
			ctime: "number",
			mtime: "number",
			tags: "string[]",
			extension: "string",
		} as const;
	}
}
