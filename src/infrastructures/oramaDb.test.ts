import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { LocalFileAdapter } from "../adapters/LocalFileAdapter";
import { OramaDb } from "./oramaDb";
import * as path from "path";
import * as fs from "fs";
import { storeFilename } from "./vectorStore";
import { AnySchema, create, save, load, search } from "@orama/orama";
import { HashRing } from "./hashring";

describe("OramaDb", () => {
	const fileAdapter = new LocalFileAdapter();
	const hashRing = new HashRing({ replicas: 20 });
	const testDirPath = path.join(__dirname, "test_db");
	const testSchema = {
		id: "string",
		content: "string",
		embedding: "vector[3]",
	} satisfies AnySchema;

	const testDocuments = [
		{ id: "docX", content: "Document X axis", embedding: [1, 0, 0] },
		{ id: "docY", content: "Document Y axis", embedding: [0, 1, 0] },
		{ id: "docZ", content: "Document Z axis", embedding: [0, 0, 1] },
		{
			id: "doc111",
			content: "Document in first octant",
			embedding: [1, 1, 1],
		},
		{
			id: "docX2",
			content: "Document close to X",
			embedding: [0.9, 0.1, 0.1],
		},
		{
			id: "docY2",
			content: "Document close to Y",
			embedding: [0.1, 0.9, 0.1],
		},
		{
			id: "docZ2",
			content: "Document close to Z",
			embedding: [0.1, 0.1, 0.9],
		},
		{
			id: "docX3",
			content: "Document with large magnitude in X",
			embedding: [5, 0, 0],
		},
		{
			id: "docXY",
			content: "Document in XY plane",
			embedding: [0.7071, 0.7071, 0],
		},
		{
			id: "docXZ",
			content: "Document in XZ plane",
			embedding: [0.7071, 0, 0.7071],
		},
		{
			id: "simA1",
			content: "Similar document A1",
			embedding: [0.5, 0.5, 0.7071],
		},
		{
			id: "simA2",
			content: "Similar document A2",
			embedding: [0.5, 0.5, 0.7071],
		},
		{
			id: "simB1",
			content: "Similar document B1",
			embedding: [0.7071, 0.7071, 0.1],
		},
		{
			id: "simB2",
			content: "Similar document B2",
			embedding: [0.7071, 0.7071, 0.1],
		},
	];

	async function createTestDb() {
		return await create({
			schema: {
				id: "string",
				content: "string",
				embedding: "vector[3]",
			},
		});
	}

	async function loadTestDb(idx: number) {
		const testDb = await createTestDb();
		const data = await fs.readFileSync(
			path.join(testDirPath, storeFilename(idx)),
			"utf-8"
		);
		const parsedData = JSON.parse(data);
		await load(testDb, parsedData);
		return testDb;
	}

	beforeEach(() => {
		if (fs.existsSync(testDirPath)) {
			fs.rmSync(testDirPath, { recursive: true, force: true });
		}
		fs.mkdirSync(testDirPath, { recursive: true });
	});

	afterEach(() => {
		if (fs.existsSync(testDirPath)) {
			fs.rmSync(testDirPath, { recursive: true, force: true });
		}
	});

	describe("Creating a new partitioned database", () => {
		it("should create the specified number of database shards", async () => {
			const numOfShards = 3;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			const oramaDb = await OramaDb.create(fileAdapter, config, hashRing);

			// Assert - Should create the expected number of files
			for (let i = 1; i <= numOfShards; i++) {
				const dbFilePath = path.join(testDirPath, storeFilename(i));
				expect(fs.existsSync(dbFilePath)).toBe(true);

				const fileContent = await fileAdapter.read(dbFilePath);
				const parsedContent = JSON.parse(fileContent);

				expect(parsedContent).toBeDefined();
				expect(parsedContent.schema).toStrictEqual(testSchema);
			}
		});
	});

	describe("Loading a partitioned database", () => {
		it("should load all database shards", async () => {
			const numOfShards = 3;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			// Arrange - Create and save multiple shards
			for (let i = 1; i <= numOfShards; i++) {
				const db = await createTestDb();

				const rawdata = await save(db);
				const jsonData = JSON.stringify(rawdata, null, 2);

				const dbFilePath = path.join(testDirPath, storeFilename(i));
				fs.writeFileSync(dbFilePath, jsonData, "utf-8");

				expect(fs.existsSync(dbFilePath)).toBe(true);
			}

			const loadedDb = await OramaDb.load(fileAdapter, config, hashRing);

			expect(loadedDb).toBeDefined();
			expect((loadedDb as any).shards.length).toBe(numOfShards);
		});
	});

	describe("insertMany method", () => {
		it("should distribute documents to correct partitions and insert them", async () => {
			const numOfShards = 3;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			const oramaDb = await OramaDb.create(fileAdapter, config, hashRing);
			await oramaDb.insertMany(testDocuments);

			let resultDocuments: any[] = [];

			for (let i = 0; i < numOfShards; i++) {
				const testDb = await loadTestDb(i + 1);
				const res = await search(testDb, {});
				resultDocuments = resultDocuments.concat(res.hits);

				expect(res.hits.length).toBeGreaterThanOrEqual(0);
			}
			expect(resultDocuments.length).toBe(testDocuments.length);
			expect(resultDocuments[0].document).toBeDefined();
		});
	});

	describe("search method", () => {
		it("should search across all shards and return top k results ordered by score", async () => {
			const numOfShards = 3;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};
			const documents = JSON.parse(JSON.stringify(testDocuments));

			const oramaDb = await OramaDb.create(fileAdapter, config, hashRing);
			await oramaDb.insertMany(documents);

			// Query vector along Z axis direction
			const queryVector = [0, 0, 1];
			const k = 3;

			const results = await oramaDb.search(queryVector, k);
			expect(results.length).toBeLessThanOrEqual(k);
			expect(results[0].id).toBe("docZ");
			expect(results[1].id).toBe("docZ2");
			// Scores should be in ascending order (lower score = more similar)
			expect(results[0].score).toBeGreaterThan(results[1].score);
		});

		it("should respect the filter parameter when searching", async () => {
			const numOfShards = 3;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};
			const documents = JSON.parse(JSON.stringify(testDocuments));

			const oramaDb = await OramaDb.create(fileAdapter, config, hashRing);
			await oramaDb.insertMany(documents);

			const queryVector = [0.6, 0.7, 0.8];
			const k = 5;

			// Execute search with filter
			const results = await oramaDb.search(queryVector, k, {
				content: "close to",
			});

			// Should only return docs matching the filter, still ordered by similarity
			expect(results.length).toBeLessThanOrEqual(3); // At most 3 docs (docX2, docY2, docZ2)
			results.forEach((result) => {
				expect(["docX2", "docY2", "docZ2"]).toContain(result.id);
			});
		});
	});
});
