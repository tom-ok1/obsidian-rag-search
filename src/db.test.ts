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

	it("should add vectors with correct dimensions to the database", async () => {
		const mockEmbeddingDimensions = 128;
		const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

		const store = await OramaStore.create(
			localFileAdapter,
			mockEmbeddings,
			{
				dbPath: testDbPath,
			}
		);

		const testDocs = [
			new Document({
				id: "vec1",
				pageContent: "Vector document 1",
				metadata: {
					id: "vec1",
					title: "Vector 1",
					path: "/vector/1",
					extension: "md",
					tags: ["vector"],
					ctime: Date.now(),
					mtime: Date.now(),
				},
			}),
			new Document({
				id: "vec2",
				pageContent: "Vector document 2",
				metadata: {
					id: "vec2",
					title: "Vector 2",
					path: "/vector/2",
					extension: "md",
					tags: ["vector"],
					ctime: Date.now(),
					mtime: Date.now(),
				},
			}),
		];

		// Create vectors with the correct dimensions
		const vectors = [
			Array(mockEmbeddingDimensions).fill(0.2),
			Array(mockEmbeddingDimensions).fill(0.3),
		];

		const docIds = await store.addVectors(vectors, testDocs);

		expect(docIds).toBeDefined();
		expect(docIds).toHaveLength(2);
		expect(docIds).toContain("vec1");
		expect(docIds).toContain("vec2");

		// Verify the vectors were added to the database
		const db = (store as any).db as Orama<any>;
		const results = await search(db, {
			mode: "fulltext",
			term: "Vector",
		});
		expect(results.hits).toHaveLength(2);

		// We can also verify the embeddings were stored correctly, but this
		// would depend on how you access the vector data in your implementation
	});

	it("should throw a validation error when adding vectors with incorrect dimensions", async () => {
		const mockEmbeddingDimensions = 128;
		const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

		const store = await OramaStore.create(
			localFileAdapter,
			mockEmbeddings,
			{
				dbPath: testDbPath,
			}
		);

		const testDocs = [
			new Document({
				id: "vec3",
				pageContent: "Vector document 3",
				metadata: {
					id: "vec3",
					title: "Vector 3",
					path: "/vector/3",
					extension: "md",
					tags: ["vector"],
					ctime: Date.now(),
					mtime: Date.now(),
				},
			}),
		];

		// Create vectors with incorrect dimensions (different from mockEmbeddingDimensions)
		const incorrectVectors = [
			Array(mockEmbeddingDimensions + 10).fill(0.5), // Intentionally wrong size
		];

		// Expect the addVectors call to throw a validation error
		await expect(
			store.addVectors(incorrectVectors, testDocs)
		).rejects.toThrow();

		// Optional: Check that nothing was added to the database
		const db = (store as any).db as Orama<any>;
		const results = await search(db, {
			mode: "fulltext",
			term: "Vector document 3",
		});
		expect(results.hits).toHaveLength(0);
	});
});
