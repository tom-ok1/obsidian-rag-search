import { localFile } from "../utils/LocalFile.js";
import { OramaDb } from "./oramaDb.js";
import { storeFilename } from "./shardManager.js";
import * as path from "path";
import * as fs from "fs";
import { AnySchema, create, search } from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";

describe("OramaDb", () => {
	const fileAdapter = new localFile();
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

	function createTestDb() {
		return create({
			schema: {
				id: "string",
				content: "string",
				embedding: "vector[3]",
			},
		});
	}

	async function loadTestDb(idx: number) {
		const data = await fs.readFileSync(
			path.join(testDirPath, storeFilename(idx + 1))
		);
		const db = await restore("binary", data);
		return db;
	}

	beforeEach(() => {
		if (fs.existsSync(testDirPath)) {
			fs.rmSync(testDirPath, { recursive: true, force: true });
		}
	});

	afterEach(() => {
		if (fs.existsSync(testDirPath)) {
			fs.rmSync(testDirPath, { recursive: true, force: true });
		}
	});

	describe("Creating a new partitioned database", () => {
		it("should create the specified number of database shards", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			const oramadb = await OramaDb.init(fileAdapter, config);

			for (let i = 0; i < numOfShards; i++) {
				const shard = await oramadb["shardMgr"]["getShard"](i);
				expect(shard).toBeDefined();
				expect(shard.schema).toEqual(testSchema);
			}
		});

		it("should create a database with japanese tokenizer", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			const oramadb = await OramaDb.init(fileAdapter, config, "japanese");

			for (let i = 0; i < numOfShards; i++) {
				const shard = await oramadb["shardMgr"]["getShard"](i);
				expect(shard).toBeDefined();
				expect(shard.schema).toEqual(testSchema);
				// Check language through OramaDb class since we can't directly check binary data
				expect(shard.tokenizer.language).toBe("japanese");
			}
		});
	});

	describe("Loading a partitioned database", () => {
		it("should load all database shards", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			fs.mkdirSync(testDirPath, { recursive: true });

			// Arrange - Create and save multiple shards
			for (let i = 1; i <= numOfShards; i++) {
				const db = await createTestDb();
				const data = await persist(db, "binary");

				const dbFilePath = path.join(testDirPath, storeFilename(i));
				fs.writeFileSync(dbFilePath, data, "binary");

				expect(fs.existsSync(dbFilePath)).toBe(true);
			}

			const loadedDb = await OramaDb.init(fileAdapter, config);

			expect(loadedDb).toBeDefined();
			const randomIdx = Math.floor(Math.random() * numOfShards);
			const shard = await loadedDb["shardMgr"]["getShard"](randomIdx);
			expect(shard.schema).toEqual(testSchema);
		});

		it("should be able to search after loading", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			fs.mkdirSync(testDirPath, { recursive: true });

			for (let i = 1; i <= numOfShards; i++) {
				const db = await createTestDb();
				const data = await persist(db, "binary");

				const dbFilePath = path.join(testDirPath, storeFilename(i));
				fs.writeFileSync(dbFilePath, data, "binary");

				expect(fs.existsSync(dbFilePath)).toBe(true);
			}

			const loadedDb = await OramaDb.init(fileAdapter, config);

			const queryVector = [0.5, 0.5, 0.5];
			const k = 3;
			const results = await loadedDb.search(queryVector, { k });

			expect(results.length).toBeLessThanOrEqual(k);
		});
	});

	describe("saveMany method", () => {
		it("should distribute documents to correct partitions and insert them", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			const oramaDb = await OramaDb.init(fileAdapter, config);
			await oramaDb.saveMany(testDocuments);

			let resultDocuments: any[] = [];

			for (let i = 0; i < numOfShards; i++) {
				const testDb = await loadTestDb(i);
				const res = await search(testDb, {});
				resultDocuments = resultDocuments.concat(res.hits);

				expect(res.hits.length).toBeGreaterThanOrEqual(0);
			}
			expect(resultDocuments.length).toBe(testDocuments.length);
			expect(resultDocuments[0].document).toBeDefined();
		});

		it("should remove already existing documents with the same Id and insert new ones(save)", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};

			const oramaDb = await OramaDb.init(fileAdapter, config);
			await oramaDb.saveMany(testDocuments);

			const newDocuments = [
				{
					id: "docX",
					content: "Updated Document X axis",
					embedding: [1, 0, 0],
				},
				{
					id: "docY",
					content: "Updated Document Y axis",
					embedding: [0, 1, 0],
				},
			];

			await oramaDb.saveMany(newDocuments);

			let resultDocuments: any[] = [];

			for (let i = 0; i < numOfShards; i++) {
				const testDb = await loadTestDb(i);
				const res = await search(testDb, { includeVectors: true });
				resultDocuments = resultDocuments.concat(res.hits);
			}

			expect(resultDocuments.length).toBe(testDocuments.length);

			// Verify the updated documents exist in the results (order doesn't matter)
			const documents = resultDocuments.map((r) => r.document);
			const updatedXDoc = documents.find((doc: any) => doc.id === "docX");
			const updatedYDoc = documents.find((doc: any) => doc.id === "docY");
			expect(updatedXDoc.content).toBe("Updated Document X axis");
			expect(updatedYDoc.content).toBe("Updated Document Y axis");
			// Check that the other documents remain unchanged
			const remainingDocs = documents.filter(
				(doc: any) => doc.id !== "docX" && doc.id !== "docY"
			);
			const randomIndex = Math.floor(
				Math.random() * remainingDocs.length
			);
			const randomDoc = remainingDocs[randomIndex];
			const originalDoc = testDocuments.find(
				(doc: any) => doc.id === randomDoc.id
			);
			expect(randomDoc.content).toBe(originalDoc?.content);
		});
	});

	describe("search method", () => {
		it("should search across all shards and return top k results ordered by score", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};
			const documents = JSON.parse(JSON.stringify(testDocuments));

			const oramaDb = await OramaDb.init(fileAdapter, config);
			await oramaDb.saveMany(documents);

			// Query vector along Z axis direction
			const queryVector = [0, 0, 1];
			const k = 3;

			const results = await oramaDb.search(queryVector, { k });
			expect(results.length).toBeLessThanOrEqual(k);
			expect(results[0].id).toBe("docZ");
			expect(results[1].id).toBe("docZ2");
			// Scores should be in ascending order (lower score = more similar)
			expect(results[0].score).toBeGreaterThan(results[1].score);
		});

		it("should respect the filter parameter when searching", async () => {
			const numOfShards = 5;
			const config = {
				dirPath: testDirPath,
				numOfShards,
				schema: testSchema,
			};
			const documents = JSON.parse(JSON.stringify(testDocuments));

			const oramaDb = await OramaDb.init(fileAdapter, config);
			await oramaDb.saveMany(documents);

			const queryVector = [0.6, 0.7, 0.8];
			const k = 5;

			// Execute search with filter
			const results = await oramaDb.search(queryVector, {
				k,
				filter: { content: "close to" },
			});

			// Should only return docs matching the filter, still ordered by similarity
			expect(results.length).toBeLessThanOrEqual(3); // At most 3 docs (docX2, docY2, docZ2)
			results.forEach((result) => {
				expect(["docX2", "docY2", "docZ2"]).toContain(result.id);
			});
		});
	});
});
