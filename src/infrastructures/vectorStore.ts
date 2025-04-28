import { VectorStore } from "@langchain/core/vectorstores";
import {
	Document,
	DocumentInput,
	DocumentInterface,
} from "@langchain/core/documents";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import {
	create,
	insertMultiple,
	load,
	Orama,
	save,
	search,
	WhereCondition,
} from "@orama/orama";
import { FileAdapter } from "../adapters/fileAdapter";

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

/**
 * @param id - MD5 hash
 */
type DocumentSchema = {
	id?: string;
	content?: string;
	embedding?: number[];
} & DocumentMetadata;

type ObsidianDocumentInterface = DocumentInterface<DocumentMetadata>;

export class ObsidianDocument extends Document<DocumentMetadata> {
	constructor(fields: DocumentInput<DocumentMetadata>) {
		super(fields);
	}
}

interface OramaStoreConfig {
	dirPath: string;
	numOfShards: number;
}

export const storeFilename = (id: number) => `vectorstore-${id}.json`;

export class OramaStore extends VectorStore {
	private readonly dbConfig: OramaStoreConfig;
	private db: Orama<DocumentRawSchema>;

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
		const isExists = await store.file.exists(dbConfig.dirPath);
		if (isExists) {
			store.db = await store.loadDb();
		} else {
			store.db = await store.createNewDb();
		}

		return store;
	}

	private async createNewDb() {
		const schema = await this.documentSchema();
		let db: Orama<DocumentRawSchema>;
		for (let i = 0; i < this.dbConfig.numOfShards; i++) {
			db = await create({ schema });
			const rawdata = await save(db);
			const jsonData = JSON.stringify({ ...rawdata }, null, 2);
			this.file.write(
				storeFilename(i + 1),
				this.dbConfig.dirPath,
				jsonData
			);
		}
		return db!;
	}

	private async loadDb() {
		const schema = await this.documentSchema();
		const path = this.dbConfig.dirPath + "/" + storeFilename(1); // TODO: refactor me
		const rawdata = await this.file.read(path);
		const parsedData = JSON.parse(rawdata);
		const db = await create({ schema });
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

	async similaritySearchVectorWithScore(
		query: number[],
		k: number,
		filter?: Partial<WhereCondition<DocumentRawSchema>>
	): Promise<[ObsidianDocumentInterface, number][]> {
		const results = await search(this.db, {
			mode: "vector",
			vector: { value: query, property: "embedding" },
			limit: k,
			where: filter,
		});
		return results.hits.map(({ document, score }) => [
			{
				id: document.id,
				pageContent: document.content,
				metadata: document.metadata,
			},
			score,
		]);
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

	private async documentSchema(): Promise<DocumentRawSchema> {
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
