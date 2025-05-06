import { localFile } from "../utils/LocalFile.js";
import { ShardManager, storeFilename } from "./shardManager.js";
import * as path from "path";
import * as fs from "fs";
import { AnySchema, create } from "@orama/orama";
import { persist } from "@orama/plugin-data-persistence";

describe("ShardManager", () => {
	const fileAdapter = new localFile();
	const testDirPath = path.join(__dirname, "test_shard_manager");
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

	describe("Creating a new ShardManager", () => {
		it("should create the specified number of database shards", async () => {
			const numOfShards = 5;
			const shardMgr = await ShardManager.create(
				fileAdapter,
				testDirPath,
				testSchema,
				numOfShards,
				"english"
			);

			for (let i = 0; i < numOfShards; i++) {
				const shard = await shardMgr.getShard(i);
				expect(shard).toBeDefined();
				expect(shard.schema).toEqual(testSchema);
			}
		});

		it("should create a database with japanese tokenizer", async () => {
			const numOfShards = 5;
			const shardMgr = await ShardManager.create(
				fileAdapter,
				testDirPath,
				testSchema,
				numOfShards,
				"japanese"
			);

			for (let i = 0; i < numOfShards; i++) {
				const shard = await shardMgr.getShard(i);
				expect(shard).toBeDefined();
				expect(shard.schema).toEqual(testSchema);
				expect(shard.tokenizer.language).toBe("japanese");
			}
		});
	});

	describe("Loading a ShardManager", () => {
		it("should load all database shards", async () => {
			const numOfShards = 5;

			// Arrange - Create and save multiple shards
			for (let i = 1; i <= numOfShards; i++) {
				const db = await createTestDb();
				const data = await persist(db, "binary");

				const dbFilePath = path.join(testDirPath, storeFilename(i));
				fs.writeFileSync(dbFilePath, data, "binary");

				expect(fs.existsSync(dbFilePath)).toBe(true);
			}

			const shardMgr = await ShardManager.load(
				fileAdapter,
				testDirPath,
				testSchema,
				numOfShards
			);

			expect(shardMgr).toBeDefined();
			const randomIdx = Math.floor(Math.random() * numOfShards);
			const shard = await shardMgr.getShard(randomIdx);
			expect(shard.schema).toEqual(testSchema);
		});
	});

	describe("Shard operations", () => {
		it("should persist shards correctly", async () => {
			const numOfShards = 3;
			const shardMgr = await ShardManager.create(
				fileAdapter,
				testDirPath,
				testSchema,
				numOfShards,
				"english"
			);

			// Get a shard and verify it exists
			const shard = await shardMgr.getShard(0);
			expect(shard).toBeDefined();

			// Persist the shard and check that the file exists
			await shardMgr.persistShard(shard, 0);
			const filePath = path.join(testDirPath, storeFilename(1));
			expect(fs.existsSync(filePath)).toBe(true);
		});

		it("should get node based on id", async () => {
			const numOfShards = 5;
			const shardMgr = await ShardManager.create(
				fileAdapter,
				testDirPath,
				testSchema,
				numOfShards,
				"english"
			);

			const testId = "docX";
			const node = shardMgr.getNode(testId);

			// The node should be a string containing a number between 0 and numOfShards-1
			expect(parseInt(node)).toBeGreaterThanOrEqual(0);
			expect(parseInt(node)).toBeLessThan(numOfShards);
		});
	});

	describe("rebalance methods", () => {
		it("should redistribute documents when increasing shards", async () => {
			const initialShards = 2;
			const finalShards = 4;

			// Create ShardManager with initial shards
			const shardMgr = await ShardManager.create(
				fileAdapter,
				testDirPath,
				testSchema,
				initialShards,
				"english"
			);

			// Insert test documents into shards
			for (const doc of testDocuments) {
				const shardIdx = parseInt(shardMgr.getNode(doc.id), 10);
				const shard = await shardMgr.getShard(shardIdx);
				await create(shard);
			}

			// Rebalance to increase number of shards
			await shardMgr.rebalance(finalShards);

			expect(shardMgr.numOfShards).toBe(finalShards);

			// Check number of shard files
			const files = fs.readdirSync(testDirPath);
			expect(files.length).toBe(finalShards);
		});

		it("should redistribute documents when decreasing shards", async () => {
			const initialShards = 5;
			const finalShards = 2;

			// Create ShardManager with initial shards
			const shardMgr = await ShardManager.create(
				fileAdapter,
				testDirPath,
				testSchema,
				initialShards,
				"english"
			);

			// Insert test documents into shards
			for (const doc of testDocuments) {
				const shardIdx = parseInt(shardMgr.getNode(doc.id), 10);
				const shard = await shardMgr.getShard(shardIdx);
				await create(shard);
			}

			// Rebalance to decrease number of shards
			await shardMgr.rebalance(finalShards);

			expect(shardMgr.numOfShards).toBe(finalShards);

			// Check number of shard files (should delete old ones)
			const files = fs.readdirSync(testDirPath);
			expect(files.length).toBe(finalShards);
		});

		it("should handle rebalancing to the same number of shards (no-op)", async () => {
			const numOfShards = 3;

			// Create ShardManager
			const shardMgr = await ShardManager.create(
				fileAdapter,
				testDirPath,
				testSchema,
				numOfShards,
				"english"
			);

			const persistShardSpy = vi.spyOn(shardMgr, "persistShard");

			// Rebalance to the same number of shards
			await shardMgr.rebalance(numOfShards);

			expect(shardMgr.numOfShards).toBe(numOfShards);
			expect(persistShardSpy).not.toHaveBeenCalled();
		});

		describe("autoRebalance method", () => {
			it("should scale out when shard sizes exceed 500MB", async () => {
				const initialShards = 2;
				const expectedShards = 4; // Double the shards to halve the size per shard

				// Create ShardManager with initial shards
				const shardMgr = await ShardManager.create(
					fileAdapter,
					testDirPath,
					testSchema,
					initialShards,
					"english"
				);

				// Mock file sizes (1.1GB total, ~550MB per shard)
				const statSpy = vi.spyOn(fileAdapter, "stat");
				statSpy.mockImplementation(async () => {
					// Return mock sizes exceeding 500MB per shard
					return {
						ctime: Date.now(),
						mtime: Date.now(),
						size: 550 * 1024 * 1024, // 550MB
					};
				});

				// Spy on the rebalance method
				const rebalanceSpy = vi.spyOn(shardMgr, "rebalance");

				// Call autoRebalance
				await shardMgr.autoRebalance();

				// Should have called rebalance with double the shards
				expect(rebalanceSpy).toHaveBeenCalledWith(expectedShards);
				expect(shardMgr.numOfShards).toBe(expectedShards);
			});

			it("should scale in when there are too many small shards", async () => {
				const initialShards = 8;
				const expectedShards = 4; // Halve the shards if they're too small

				// Create ShardManager with initial shards
				const shardMgr = await ShardManager.create(
					fileAdapter,
					testDirPath,
					testSchema,
					initialShards,
					"english"
				);

				// Mock small file sizes (80MB total, ~10MB per shard)
				const statSpy = vi.spyOn(fileAdapter, "stat");
				statSpy.mockImplementation(async (filePath) => {
					return {
						ctime: Date.now(),
						mtime: Date.now(),
						size: 10 * 1024 * 1024, // 10MB
					};
				});

				// Spy on the rebalance method
				const rebalanceSpy = vi.spyOn(shardMgr, "rebalance");

				// Call autoRebalance
				await shardMgr.autoRebalance();

				// Should have called rebalance to reduce shards
				expect(rebalanceSpy).toHaveBeenCalledWith(expectedShards);
				expect(shardMgr.numOfShards).toBe(expectedShards);
			});

			it("should not rebalance when shard sizes are optimal", async () => {
				const initialShards = 4;

				// Create ShardManager with initial shards
				const shardMgr = await ShardManager.create(
					fileAdapter,
					testDirPath,
					testSchema,
					initialShards,
					"english"
				);

				// Mock optimal file sizes (1GB total, 250MB per shard)
				const statSpy = vi.spyOn(fileAdapter, "stat");
				statSpy.mockImplementation(async (filePath) => {
					return {
						ctime: Date.now(),
						mtime: Date.now(),
						size: 250 * 1024 * 1024, // 250MB
					};
				});

				// Spy on the rebalance method
				const rebalanceSpy = vi.spyOn(shardMgr, "rebalance");

				// Call autoRebalance
				await shardMgr.autoRebalance();

				// Should not have called rebalance as size is optimal
				expect(rebalanceSpy).not.toHaveBeenCalled();
				expect(shardMgr.numOfShards).toBe(initialShards);
			});
		});
	});
});
