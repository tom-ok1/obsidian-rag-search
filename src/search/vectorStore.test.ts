import { MarkDownDoc, MdDocRawSchema, OramaStore } from "./vectorStore.js";
import { Embeddings } from "@langchain/core/embeddings";
import * as fs from "fs";
import * as path from "path";
import { create, count } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";
import { localFile } from "../utils/LocalFile.js";
import { storeFilename } from "./oramaDb.js";

class MockEmbeddings extends Embeddings {
	private dimensions: number;

	constructor(dimensions: number) {
		super({});
		this.dimensions = dimensions;
	}

	async embedDocuments(documents: string[]): Promise<number[][]> {
		const vector = Array(this.dimensions).fill(0.1);
		return documents.map(() => vector);
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
			ctime: "number",
			mtime: "number",
			tags: "string[]",
			extension: "string",
		} satisfies MdDocRawSchema,
	});
}

describe("OramaStore", () => {
	const file = new localFile();
	const testDbPath = path.join(__dirname, "test-db");
	const testDbFilePath = (id: number) => testDbPath + "/" + storeFilename(id);
	afterEach(() => {
		if (fs.existsSync(testDbPath)) {
			fs.rmSync(testDbPath, { recursive: true });
		}
	});

	describe("create", () => {
		it("should load a db from a binary file", async () => {
			const mockEmbeddingDimensions = 128;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const mockOramaDb = await createMockDb(mockEmbeddingDimensions);
			const binaryData = await persist(mockOramaDb, "binary");

			fs.mkdirSync(testDbPath);
			fs.writeFileSync(testDbFilePath(1), binaryData, "binary");
			expect(fs.existsSync(testDbFilePath(1))).toBe(true);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const loadedDb = (store as any).db;
			expect(loadedDb).toBeDefined();
			const shard = await loadedDb.getShard(0);
			expect(shard.schema).toEqual(mockOramaDb.schema);
		});

		it("should create a new db", async () => {
			const mockEmbeddingDimensions = 256;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			expect(store).toBeDefined();
			expect(fs.existsSync(testDbPath)).toBe(true);

			// Verify by loading the database directly
			const loadedDb = await restore(
				"binary",
				fs.readFileSync(testDbFilePath(1))
			);
			expect(loadedDb).toBeDefined();
			expect(loadedDb.schema).toBeDefined();
		});

		it("should create *n* shard files", async () => {
			const SHARDS = 3;
			const mockEmbeddingDimensions = 128;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);
			await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: SHARDS,
				file,
			});

			for (let i = 0; i < SHARDS; i++) {
				expect(fs.existsSync(testDbFilePath(i + 1))).toBe(true);
			}
		});
	});

	describe("addDocuments", () => {
		it("should add documents to the database", async () => {
			const mockEmbeddingDimensions = 128;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);
			const testDocs = [
				new MarkDownDoc({
					id: "doc1",
					pageContent: "Test document 1",
					metadata: {
						title: "Test 1",
						path: "/test/1",
						extension: "md",
						tags: ["test"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc2",
					pageContent: "Test document 2",
					metadata: {
						title: "Test 2",
						path: "/test/2",
						extension: "md",
						tags: ["test"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
			];

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const docIds = await store.addDocuments(testDocs);

			expect(docIds).toBeDefined();
			expect(docIds).toHaveLength(2);

			// Verify by loading the database and counting docs
			const loadedDb = await restore(
				"binary",
				fs.readFileSync(testDbFilePath(1))
			);
			// Verify documents were added by checking count
			expect(await count(loadedDb)).toBe(2);
		});
	});

	describe("addVectors", () => {
		it("should add vectors with correct dimensions to the database", async () => {
			const mockEmbeddingDimensions = 128;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const testDocs = [
				new MarkDownDoc({
					id: "vec1",
					pageContent: "Vector document 1",
					metadata: {
						title: "Vector 1",
						path: "/vector/1",
						extension: "md",
						tags: ["vector"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "vec2",
					pageContent: "Vector document 2",
					metadata: {
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

			// Verify by loading the database and counting docs
			const loadedDb = await restore(
				"binary",
				fs.readFileSync(testDbFilePath(1))
			);
			// Verify documents were added by checking count
			expect(await count(loadedDb)).toBe(2);
		});

		it("should throw a validation error when adding vectors with incorrect dimensions", async () => {
			const mockEmbeddingDimensions = 128;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const testDocs = [
				new MarkDownDoc({
					id: "vec3",
					pageContent: "Vector document 3",
					metadata: {
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
		});
	});

	describe("similaritySearchVectorWithScore", () => {
		it("should return k results sorted by similarity score", async () => {
			const mockEmbeddingDimensions = 3;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const docs = [
				new MarkDownDoc({
					id: "doc1",
					pageContent: "Test document 1",
					metadata: {
						title: "Test 1",
						path: "/test/1",
						extension: "md",
						tags: ["test"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc2",
					pageContent: "Test document 2",
					metadata: {
						title: "Test 2",
						path: "/test/2",
						extension: "md",
						tags: ["test"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc3",
					pageContent: "Test document 3",
					metadata: {
						title: "Test 3",
						path: "/test/3",
						extension: "md",
						tags: ["test"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
			];

			// Create vectors with different similarities to query
			// Using cosine similarity logic, vectors that are more aligned will have higher similarity
			const vectors = [
				[1, 0, 0],
				[0.9, 0, 0.1],
				[0, 1, 0],
			];

			await store.addVectors(vectors, docs);

			// Our query vector - most similar to the second document
			const queryVector = [1, 0, 0];
			const k = 2;

			const results = await store.similaritySearchVectorWithScore(
				queryVector,
				k
			);
			expect(results).toHaveLength(k);

			// Verify results are sorted by descending similarity (highest score first)
			expect(results[0][1]).toBeGreaterThan(results[1][1]);
		});

		it("should filter results by metadata", async () => {
			const mockEmbeddingDimensions = 3;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const docs = [
				new MarkDownDoc({
					id: "doc1",
					pageContent: "Test document 1",
					metadata: {
						title: "Test 1",
						path: "/test/1",
						extension: "md",
						tags: ["test", "important"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc2",
					pageContent: "Test document 2",
					metadata: {
						title: "Test 2",
						path: "/test/2",
						extension: "txt",
						tags: ["test"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc3",
					pageContent: "Test document 3",
					metadata: {
						title: "Test 3",
						path: "/test/3",
						extension: "md",
						tags: ["test", "important"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
			];

			// All vectors have the same similarity for simplicity
			const vectors = [
				[0.1, 0.1, 0.1],
				[0.1, 0.1, 0.1],
				[0.1, 0.1, 0.1],
			];

			await store.addVectors(vectors, docs);

			const queryVector = [0.1, 0.1, 0.1];
			const k = 10;

			// Filter by extension
			const resultsFilteredByExtension =
				await store.similaritySearchVectorWithScore(queryVector, k, {
					extension: "md",
				});

			expect(resultsFilteredByExtension).toHaveLength(2);
			const mdIds = resultsFilteredByExtension.map(([doc]) => doc.id);
			expect(mdIds).toContain("doc1");
			expect(mdIds).toContain("doc3");
			expect(mdIds).not.toContain("doc2");

			// Filter by tags
			const resultsFilteredByTags =
				await store.similaritySearchVectorWithScore(queryVector, k, {
					tags: ["important"],
				});

			expect(resultsFilteredByTags).toHaveLength(2);
			const taggedIds = resultsFilteredByTags.map(([doc]) => doc.id);
			expect(taggedIds).toContain("doc1");
			expect(taggedIds).toContain("doc3");
			expect(taggedIds).not.toContain("doc2");
		});

		it("should combine k limit with filtering", async () => {
			const mockEmbeddingDimensions = 3;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const docs = [
				new MarkDownDoc({
					id: "doc1",
					pageContent: "Test document 1",
					metadata: {
						title: "Test 1",
						path: "/test/1",
						extension: "md",
						tags: ["test", "important"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc2",
					pageContent: "Test document 2",
					metadata: {
						title: "Test 2",
						path: "/test/2",
						extension: "md",
						tags: ["test", "important"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc3",
					pageContent: "Test document 3",
					metadata: {
						title: "Test 3",
						path: "/test/3",
						extension: "md",
						tags: ["test", "important"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
				new MarkDownDoc({
					id: "doc4",
					pageContent: "Test document 4",
					metadata: {
						title: "Test 4",
						path: "/test/4",
						extension: "txt",
						tags: ["test", "important"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
			];

			const vectors = [
				[0.3, 0.3, 0.3],
				[0.5, 0.5, 0.5],
				[1, 0.7, 0.7],
				[1, 0.6, 0.6], // second highest similarity but should be filtered by extension
			];

			await store.addVectors(vectors, docs);

			const queryVector = [0.5, 0.5, 0.5];
			const k = 2;

			// Filter by extension and limit to top k
			const results = await store.similaritySearchVectorWithScore(
				queryVector,
				k,
				{ extension: "md" }
			);

			expect(results).toHaveLength(k);

			const resultIds = results.map(([doc]) => doc.id);
			expect(resultIds[0]).toBe("doc2");
			expect(resultIds[1]).toBe("doc1");
			expect(resultIds).not.toContain("doc3"); // Excluded by k limit
			expect(resultIds).not.toContain("doc4"); // Excluded by extension filter
		});

		it("should return empty array when no documents match filter", async () => {
			const mockEmbeddingDimensions = 3;
			const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

			const store = await OramaStore.create(mockEmbeddings, {
				dirPath: testDbPath,
				numOfShards: 1,
				file,
			});

			const docs = [
				new MarkDownDoc({
					id: "doc1",
					pageContent: "Test document 1",
					metadata: {
						title: "Test 1",
						path: "/test/1",
						extension: "md",
						tags: ["test"],
						ctime: Date.now(),
						mtime: Date.now(),
					},
				}),
			];

			const vectors = [[0.1, 0.1, 0.1]];

			await store.addVectors(vectors, docs);

			const queryVector = [0.1, 0.1, 0.1];
			const k = 10;

			const results = await store.similaritySearchVectorWithScore(
				queryVector,
				k,
				{ extension: "non-existent-extension" }
			);

			expect(results).toHaveLength(0);
		});
	});
});
