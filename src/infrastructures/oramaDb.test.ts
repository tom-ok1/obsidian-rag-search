import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { LocalFileAdapter } from "../adapters/LocalFileAdapter";
import { OramaDb, getPartitionIndex } from "./oramaDb";
import * as path from "path";
import * as fs from "fs";
import { storeFilename } from "./oramaStore";
import { AnySchema, create, save, load, search } from "@orama/orama";

describe("OramaDb", () => {
	const fileAdapter = new LocalFileAdapter();
	const testDirPath = path.join(__dirname, "test_db");
	const testSchema = {
		id: "string",
		content: "string",
		embedding: "vector[3]",
	} satisfies AnySchema;

	// Sample test documents
	const testDocuments = [
		{
			id: "doc1",
			content: "Document 1 content",
			embedding: [0.1, 0.2, 0.3],
		},
		{
			id: "doc2",
			content: "Document 2 content",
			embedding: [0.4, 0.5, 0.6],
		},
		{
			id: "doc3",
			content: "Document 3 content",
			embedding: [0.7, 0.8, 0.9],
		},
		{
			id: "doc4",
			content: "Document 4 content",
			embedding: [0.2, 0.3, 0.4],
		},
		{
			id: "doc5",
			content: "Document 5 content",
			embedding: [0.5, 0.6, 0.7],
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

			const oramaDb = await OramaDb.create(fileAdapter, config);

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

			const loadedDb = await OramaDb.load(fileAdapter, config);

			expect(loadedDb).toBeDefined();
			expect((loadedDb as any).shards.length).toBe(numOfShards);
		});
	});

	describe("Partition function", () => {
		it("should consistently map the same ID to the same partition", () => {
			const numOfShards = 5;
			const id = "document123";

			const results = Array.from({ length: 10 }, () =>
				getPartitionIndex(id, numOfShards)
			);

			const firstResult = results[0];
			results.forEach((result) => {
				expect(result).toBe(firstResult);
			});
		});

		it("should distribute IDs across available partitions", () => {
			const numOfShards = 5;
			const ids = [
				"document1",
				"document2",
				"document3",
				"document4",
				"document5",
				"document6",
				"document7",
			];

			const partitions = ids.map((id) =>
				getPartitionIndex(id, numOfShards)
			);

			// There should be at least 2 different partition indices
			const uniquePartitions = new Set(partitions);
			expect(uniquePartitions.size).toBeGreaterThan(1);

			// All partitions should be within valid range
			partitions.forEach((partition) => {
				expect(partition).toBeGreaterThanOrEqual(0);
				expect(partition).toBeLessThan(numOfShards);
			});
		});

		it("should handle edge cases gracefully", () => {
			const numOfShards = 3;

			expect(getPartitionIndex("", numOfShards)).toBe(0);
			expect(getPartitionIndex("any-id", 1)).toBe(0);
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

			const oramaDb = await OramaDb.create(fileAdapter, config);
			await oramaDb.insertMany(testDocuments);

			let resultDocuments: any[] = [];

			for (let i = 0; i < numOfShards; i++) {
				const testDb = await loadTestDb(i + 1);
				const res = await search(testDb, {});
				resultDocuments = resultDocuments.concat(res.hits);

				expect(res.hits.length).toBeGreaterThan(0);
				expect(res.hits[0].document).toBeDefined();
			}
			expect(resultDocuments.length).toBe(testDocuments.length);
		});
	});
});
