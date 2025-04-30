import { VectorStore } from "@langchain/core/vectorstores";
import {
	Document,
	DocumentInput,
	DocumentInterface,
} from "@langchain/core/documents";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { WhereCondition } from "@orama/orama";
import { FileAdapter } from "../services/fileAdapter";
import { OramaDb } from "./oramaDb";
import { HashRing } from "./hashring";
import { MdDocMetadata } from "src/infrastructures/markdownProcessor";

type MdDocRawSchema = Awaited<ReturnType<OramaStore["documentSchema"]>>;

type MdDocInterface = DocumentInterface<MdDocMetadata>;

export class MarkDownDoc extends Document<MdDocMetadata> {
	constructor(fields: DocumentInput<MdDocMetadata>) {
		super(fields);
	}
}

interface OramaStoreConfig {
	dirPath: string;
	numOfShards: number;
	model?: string;
}

export class OramaStore extends VectorStore {
	private db: OramaDb<MdDocRawSchema>;
	private readonly dbConfig: OramaStoreConfig;

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
	) {
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
				metadata: {
					title: document.title,
					path: document.path,
					extension: document.extension,
					tags: document.tags,
					ctime: document.ctime,
					mtime: document.mtime,
					embeddingModel: this.dbConfig.model,
				},
			},
			score,
		]);
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
			embeddingModel: this.dbConfig.model,
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
