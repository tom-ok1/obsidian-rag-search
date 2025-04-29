import { VectorStore } from "@langchain/core/vectorstores";
import {
	Document,
	DocumentInput,
	DocumentInterface,
} from "@langchain/core/documents";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { WhereCondition } from "@orama/orama";
import { FileAdapter } from "../adapters/fileAdapter";
import { OramaDb } from "./oramaDb";
import { HashRing } from "./hashring";

type MdDocRawSchema = {
	id: "string";
	title: "string";
	path: "string";
	content: "string";
	embedding: `vector[${number}]`;
	embeddingModel: "string";
	created_at: "number";
	ctime: "number";
	mtime: "number";
	tags: "string[]";
	extension: "string";
};

type MdDocMetadata = {
	title?: string;
	path?: string;
	extension?: string;
	tags?: string[];
	created_at?: number;
	ctime?: number;
	mtime?: number;
	embeddingModel?: string;
};

/**
 * @param id - MD5 hash
 */
type MdDocSchema = {
	id?: string;
	content?: string;
	embedding?: number[];
} & MdDocMetadata;

type MdDocInterface = DocumentInterface<MdDocMetadata>;

export class MarkDownDoc extends Document<MdDocMetadata> {
	constructor(fields: DocumentInput<MdDocMetadata>) {
		super(fields);
	}
}

interface OramaStoreConfig {
	dirPath: string;
	numOfShards: number;
}

export class OramaStore extends VectorStore {
	private db: OramaDb<MdDocRawSchema>;

	private constructor(
		private readonly file: FileAdapter,
		embeddings: EmbeddingsInterface,
		dbConfig: OramaStoreConfig
	) {
		super(embeddings, dbConfig);
	}

	_vectorstoreType(): string {
		return "orama";
	}

	static async create(
		file: FileAdapter,
		embeddings: EmbeddingsInterface,
		dbConfig: OramaStoreConfig
	): Promise<OramaStore> {
		const store = new OramaStore(file, embeddings, dbConfig);
		const schema = await store.documentSchema();
		const isExists = await store.file.exists(dbConfig.dirPath);
		if (isExists) {
			store.db = await OramaDb.load(
				file,
				{
					dirPath: dbConfig.dirPath,
					numOfShards: dbConfig.numOfShards,
					schema,
				},
				new HashRing()
			);
		} else {
			store.db = await OramaDb.create(
				file,
				{
					dirPath: dbConfig.dirPath,
					numOfShards: dbConfig.numOfShards,
					schema,
				},
				new HashRing()
			);
		}

		return store;
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
		const results = this.db.search(query, k, filter);
		return results.map(({ document, score }) => [
			{
				id: document.id,
				pageContent: document.content,
				metadata: document.metadata,
			},
			score,
		]);
	}

	private mapDocumentToSchema(
		doc: MdDocInterface,
		embedding: number[]
	): MdDocSchema {
		return {
			id: doc.id,
			content: doc.pageContent,
			embedding,
			title: doc.metadata.title,
			path: doc.metadata.path,
			extension: doc.metadata.extension,
			tags: doc.metadata.tags,
			created_at: doc.metadata.created_at,
			ctime: doc.metadata.ctime,
			mtime: doc.metadata.mtime,
			embeddingModel: doc.metadata.embeddingModel,
		};
	}

	private async documentSchema(): Promise<MdDocRawSchema> {
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
			created_at: "number",
			ctime: "number",
			mtime: "number",
			tags: "string[]",
			extension: "string",
		};
	}
}
