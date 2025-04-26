import { VectorStore } from "@langchain/core/vectorstores";
import { Document, DocumentInterface } from "@langchain/core/documents";
import { Embeddings, EmbeddingsInterface } from "@langchain/core/embeddings";
import { create, load, Orama, save } from "@orama/orama";
import { FileAdapter } from "./adapters/fileAdapter";

export class OramaStore extends VectorStore {
	constructor(
		private readonly file: FileAdapter,
		embeddings: EmbeddingsInterface,
		dbConfig: Record<string, any>
	) {
		super(embeddings, dbConfig);
	}

	_vectorstoreType(): string {
		return "orama";
	}

	async createNewDb(path: string): Promise<Orama<any>> {
		const sampleText = "Sample text for embedding";
		const sampleEmbedding = await this.embeddings.embedQuery(sampleText);
		const vectorLength = sampleEmbedding.length;
		const db = await create({
			schema: {
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
			},
		});
		const rawdata = await save(db);
		const jsonData = JSON.stringify(
			{ ...rawdata, schema: db.schema },
			null,
			2
		);
		this.file.write(path, jsonData);
		return db;
	}

	async loadDb(path: string): Promise<Orama<any>> {
		const rawdata = await this.file.read(path);
		const parsedData = JSON.parse(rawdata);
		const db = await create({
			schema: parsedData.schema,
		});
		await load(db, parsedData);
		return db;
	}

	addVectors(
		vectors: number[][],
		documents: DocumentInterface[],
		options?: { [x: string]: any }
	): Promise<string[] | void> {
		return new Promise((resolve) => {
			resolve(["resolved"]);
		});
	}

	addDocuments(
		documents: DocumentInterface[],
		options?: { [x: string]: any }
	): Promise<string[] | void> {
		return new Promise((resolve) => {
			resolve(["resolved"]);
		});
	}

	similaritySearchVectorWithScore(
		query: number[],
		k: number,
		filter?: this["FilterType"] | undefined
	): Promise<[DocumentInterface, number][]> {
		return new Promise((resolve) => {
			const doc = new Document({
				pageContent: "test",
			});
			resolve([[doc, 1.0]]);
		});
	}
}
