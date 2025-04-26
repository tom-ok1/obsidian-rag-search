import { describe, it, expect, afterEach, vi } from "vitest";
import { OramaStore } from "./db";
import { Embeddings } from "@langchain/core/embeddings";
import * as fs from "fs";
import * as path from "path";
import { Orama, create, save, search } from "@orama/orama";
import { LocalFileAdapter } from "./adapters/LocalFileAdapter";
import { Document } from "@langchain/core/documents";

class MockEmbeddings extends Embeddings {
	private dimensions: number;

	constructor(dimensions: number) {
		super({});
		this.dimensions = dimensions;
	}

	async embedDocuments(documents: string[]): Promise<number[][]> {
		return documents.map(() => Array(this.dimensions).fill(0.1));
	}

	async embedQuery(_: string): Promise<number[]> {
		return Array(this.dimensions).fill(0.1);
	}
}

async function createMockDb(embeddingDimensions: number) {
	return await create({
		schema: {
			id: "string",
			title: "string",
			path: "string",
			content: "string",
			embedding: `vector[${embeddingDimensions}]`,
			embeddingModel: "string",
			created_at: "number",
			ctime: "number",
			mtime: "number",
			tags: "string[]",
			extension: "string",
		},
	});
}

describe("OramaStore", () => {
	const testDbPath = path.join(__dirname, "test-orama-db.json");
	const localFileAdapter = new LocalFileAdapter();

	afterEach(() => {
		if (fs.existsSync(testDbPath)) {
			fs.rmSync(testDbPath);
		}
	});

	it("should load a db from a JSON file", async () => {
		const mockEmbeddingDimensions = 128;
		const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

		const mockOramaDb = await createMockDb(mockEmbeddingDimensions);
		const rawdata = await save(mockOramaDb);
		const jsonData = JSON.stringify(
			{ ...rawdata, schema: mockOramaDb.schema },
			null,
			2
		);
		fs.writeFileSync(testDbPath, jsonData);
		expect(fs.existsSync(testDbPath)).toBe(true);

		const store = await OramaStore.create(
			localFileAdapter,
			mockEmbeddings,
			{
				dbPath: testDbPath,
			}
		);

		const db = (store as any).db as Orama<any>;

		expect(store).toBeDefined();
		expect(db.schema).toEqual(mockOramaDb.schema);
	});

	it("should create a new db with the correct vector length", async () => {
		const mockEmbeddingDimensions = 256;
		const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

		const store = await OramaStore.create(
			localFileAdapter,
			mockEmbeddings,
			{
				dbPath: testDbPath,
			}
		);

		expect(store).toBeDefined();
		expect(fs.existsSync(testDbPath)).toBe(true);

		const dbContent: Orama<any> = JSON.parse(
			fs.readFileSync(testDbPath, "utf-8")
		);
		expect(dbContent.schema.embedding).toBe(
			`vector[${mockEmbeddingDimensions}]`
		);
	});

	it("should add documents to the database", async () => {
		const mockEmbeddingDimensions = 128;
		const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);
		const testDocs = [
			new Document({
				id: "doc1",
				pageContent: "Test document 1",
				metadata: {
					id: "doc1",
					title: "Test 1",
					path: "/test/1",
					extension: "md",
					tags: ["test"],
					ctime: Date.now(),
					mtime: Date.now(),
				},
			}),
			new Document({
				id: "doc2",
				pageContent: "Test document 2",
				metadata: {
					id: "doc2",
					title: "Test 2",
					path: "/test/2",
					extension: "md",
					tags: ["test"],
					ctime: Date.now(),
					mtime: Date.now(),
				},
			}),
		];

		const store = await OramaStore.create(
			localFileAdapter,
			mockEmbeddings,
			{
				dbPath: testDbPath,
			}
		);

		const docIds = await store.addDocuments(testDocs);

		expect(docIds).toBeDefined();
		expect(docIds).toHaveLength(2);

		const db = (store as any).db as Orama<any>;

		// Check if documents are added to the db
		const results = await search(db, {
			mode: "fulltext",
			term: "Test",
		});
		expect(results.hits).toHaveLength(2);
	});
});
