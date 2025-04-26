import { VectorStore } from "@langchain/core/vectorstores";
import { Document, DocumentInterface } from "@langchain/core/documents";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { create, insertMultiple, load, Orama, save } from "@orama/orama";
import { FileAdapter } from "./adapters/fileAdapter";

type DocumentRawSchema = {
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

// Extracted metadata fields for Orama documents
type DocumentMetadata = {
	title?: string;
	path?: string;
	extension?: string;
	tags?: string[];
	created_at?: number;
	ctime?: number;
	mtime?: number;
	embeddingModel?: string;
};

// Complete document schema for Orama, combining metadata and content fields
type DocumentSchema = {
	id?: string;
	content?: string;
	embedding?: number[];
} & DocumentMetadata;

type ObsidianDocumentInterface = DocumentInterface<DocumentMetadata>;

interface OramaStoreConfig {
	dbPath: string;
}

export class OramaStore extends VectorStore {
	private readonly dbConfig: OramaStoreConfig;
	private db: Orama<ReturnType<typeof this.documentSchema>>;

	private constructor(
		private readonly file: FileAdapter,
		embeddings: EmbeddingsInterface,
		dbConfig: OramaStoreConfig
	) {
		super(embeddings, dbConfig);
		this.dbConfig = dbConfig;
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

		const isExists = await store.file.exists(dbConfig.dbPath);
		if (isExists) {
			store.db = await store.loadDb(dbConfig.dbPath);
		} else {
			store.db = await store.createNewDb();
		}

		return store;
	}

	private async createNewDb() {
		const sampleText = "Sample text for embedding";
		const sampleEmbedding = await this.embeddings.embedQuery(sampleText);
		const vectorLength = sampleEmbedding.length;
		const schema = this.documentSchema(vectorLength);
		const db = await create({ schema });
		const rawdata = await save(db);
		const jsonData = JSON.stringify(
			{ ...rawdata, schema: db.schema },
			null,
			2
		);
		this.file.write(this.dbConfig.dbPath, jsonData);
		return db;
	}

	private async loadDb(path: string) {
		const rawdata = await this.file.read(path);
		const parsedData = JSON.parse(rawdata);
		const db = await create({
			schema: parsedData.schema as DocumentRawSchema,
		});
		await load(db, parsedData);
		return db;
	}

	async addVectors(
		vectors: number[][],
		documents: ObsidianDocumentInterface[]
	): Promise<string[] | void> {
		if (vectors.length !== documents.length) {
			throw new Error(
				`The number of vectors (${vectors.length}) must match the number of documents (${documents.length}).`
			);
		}
		const documentsWithEmbeddings = documents.map((doc, index) =>
			this.mapDocumentToSchema(doc, vectors[index])
		);
		await insertMultiple(this.db, documentsWithEmbeddings);
		return documents.map(({ id }) => id).filter((id) => id !== undefined);
	}

	async addDocuments(
		documents: ObsidianDocumentInterface[]
	): Promise<string[] | void> {
		const vectorizedDocuments = await this.embeddings.embedDocuments(
			documents.map((doc) => doc.pageContent)
		);
		const documentsWithEmbeddings = documents.map((doc, index) =>
			this.mapDocumentToSchema(doc, vectorizedDocuments[index])
		);
		await insertMultiple(this.db, documentsWithEmbeddings);
		return documents.map(({ id }) => id).filter((id) => id !== undefined);
	}

	similaritySearchVectorWithScore(
		query: number[],
		k: number,
		filter?: this["FilterType"] | undefined
	): Promise<[ObsidianDocumentInterface, number][]> {
		return new Promise((resolve) => {
			const doc = new Document({
				pageContent: "test",
			});
			resolve([[doc, 1.0]]);
		});
	}

	private mapDocumentToSchema(
		doc: ObsidianDocumentInterface,
		embedding: number[]
	): DocumentSchema {
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

	private documentSchema(vectorLength: number): DocumentRawSchema {
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
