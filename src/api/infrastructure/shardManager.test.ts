import { NodeFsAdapter } from "../utils/NodeFsAdapter.js";
import { ShardManager, storeFilename } from "./shardManager.js";
import * as path from "path";
import * as fs from "fs";
import { AnySchema, create, insert, getByID } from "@orama/orama";
import { persist } from "@orama/plugin-data-persistence";

describe("ShardManager", () => {
	const fileAdapter = new NodeFsAdapter();
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
			// Create a directory that doesn't exist to force init to use create path
			const newDirPath = path.join(testDirPath, "new_shards");
			const shardMgr = await ShardManager.init(
				fileAdapter,
				newDirPath,
				testSchema,
				"english"
			);

			// Default number of shards should be 1 for new ShardManager
			expect(shardMgr.numOfShards).toBe(1);

			for (let i = 0; i < shardMgr.numOfShards; i++) {
				const shard = await shardMgr.getShard(i);
				expect(shard).toBeDefined();
				expect(shard.schema).toEqual(testSchema);
			}
		});

		it("should create a database with japanese tokenizer", async () => {
			// Create a directory that doesn't exist to force init to use create path
			const newDirPath = path.join(testDirPath, "japanese_shards");
			const shardMgr = await ShardManager.init(
				fileAdapter,
				newDirPath,
				testSchema,
				"japanese"
			);

			// Default number of shards should be 1 for new ShardManager
			expect(shardMgr.numOfShards).toBe(1);

			for (let i = 0; i < shardMgr.numOfShards; i++) {
				const shard = await shardMgr.getShard(i);
				expect(shard).toBeDefined();
				expect(shard.schema).toEqual(testSchema);
				expect(shard.tokenizer.language).toBe("japanese");
			}
		});

		describe("reset method", () => {
			it("should delete all shards and reset to initial state", async () => {
				// First create with multiple shards
				const newDirPath = path.join(testDirPath, "reset_shards_test");
				const shardMgr = await ShardManager.init(
					fileAdapter,
					newDirPath,
					testSchema,
					"english"
				);

				// Rebalance to 3 shards
				await shardMgr.rebalance(3);
				expect(shardMgr.numOfShards).toBe(3);

				// Insert test documents into shards
				for (const doc of testDocuments) {
					const shardIdx = parseInt(shardMgr.getNode(doc.id), 10);
					const shard = await shardMgr.getShard(shardIdx);
					await insert(shard, doc);
				}

				// Reset shards
				await shardMgr.reset();

				// Should be back to 1 shard (default)
				expect(shardMgr.numOfShards).toBe(1);

				// Check that only one shard file exists
				const files = fs.readdirSync(newDirPath);
				expect(files.length).toBe(1);
				expect(files[0]).toBe(storeFilename(1));

				// New shard should be empty (no documents)
				const shard = await shardMgr.getShard(0);
				for (const doc of testDocuments) {
					const retrievedDoc = getByID(shard, doc.id);
					expect(retrievedDoc).toBeUndefined();
				}
			});
		});
	});
	describe("Loading a ShardManager", () => {
		it("should load all database shards", async () => {
			const existingShards = 5;

			// Arrange - Create and save multiple shards
			for (let i = 1; i <= existingShards; i++) {
				const db = await createTestDb();
				const data = await persist(db, "binary");

				const dbFilePath = path.join(testDirPath, storeFilename(i));
				fs.writeFileSync(dbFilePath, data, "binary");

				expect(fs.existsSync(dbFilePath)).toBe(true);
			}

			// Use init to load existing shards
			const shardMgr = await ShardManager.init(
				fileAdapter,
				testDirPath,
				testSchema
			);

			expect(shardMgr).toBeDefined();
			// Should automatically detect 5 shards
			expect(shardMgr.numOfShards).toBe(existingShards);

			const randomIdx = Math.floor(Math.random() * existingShards);
			const shard = await shardMgr.getShard(randomIdx);
			expect(shard.schema).toEqual(testSchema);
		});

		it("should automatically detect shard count when loading", async () => {
			// Create 3 shard files
			const existingShards = 3;
			for (let i = 1; i <= existingShards; i++) {
				const db = await createTestDb();
				const data = await persist(db, "binary");

				const dbFilePath = path.join(testDirPath, storeFilename(i));
				fs.writeFileSync(dbFilePath, data, "binary");
			}

			// Initialize without specifying shard count
			const shardMgr = await ShardManager.init(
				fileAdapter,
				testDirPath,
				testSchema
			);

			// Should automatically detect the correct number of shards
			expect(shardMgr.numOfShards).toBe(existingShards);
		});
	});

	describe("Shard operations", () => {
		it("should persist shards correctly", async () => {
			// Create a directory that doesn't exist to force init to use create path
			const newDirPath = path.join(testDirPath, "persist_test");
			const shardMgr = await ShardManager.init(
				fileAdapter,
				newDirPath,
				testSchema,
				"english"
			);

			// Get a shard and verify it exists
			const shard = await shardMgr.getShard(0);
			expect(shard).toBeDefined();

			// Persist the shard and check that the file exists
			await shardMgr.persistShard(shard, 0);
			const filePath = path.join(newDirPath, storeFilename(1));
			expect(fs.existsSync(filePath)).toBe(true);
		});

		it("should get node based on id", async () => {
			// Create a directory that doesn't exist to force init to use create path
			const newDirPath = path.join(testDirPath, "node_test");
			const shardMgr = await ShardManager.init(
				fileAdapter,
				newDirPath,
				testSchema,
				"english"
			);

			const testId = "docX";
			const node = shardMgr.getNode(testId);

			// The node should be a string containing a valid shard index
			expect(parseInt(node)).toBeGreaterThanOrEqual(0);
			expect(parseInt(node)).toBeLessThan(shardMgr.numOfShards);
		});
	});

	describe("rebalance methods", () => {
		it("should redistribute documents when increasing shards", async () => {
			const finalShards = 4;

			// Create ShardManager with default initial shard (1)
			const newDirPath = path.join(testDirPath, "rebalance_increase");
			const shardMgr = await ShardManager.init(
				fileAdapter,
				newDirPath,
				testSchema,
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
			const files = fs.readdirSync(newDirPath);
			expect(files.length).toBe(finalShards);
		});

		it("should redistribute documents when decreasing shards", async () => {
			const finalShards = 2;

			// First create with 5 shards manually
			const newDirPath = path.join(testDirPath, "rebalance_decrease");
			let shardMgr = await ShardManager.init(
				fileAdapter,
				newDirPath,
				testSchema,
				"english"
			);

			// Rebalance to 5 shards first
			await shardMgr.rebalance(5);
			expect(shardMgr.numOfShards).toBe(5);

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
			const files = fs.readdirSync(newDirPath);
			expect(files.length).toBe(finalShards);
		});

		it("should handle rebalancing to the same number of shards (no-op)", async () => {
			// Create ShardManager with default 1 shard
			const newDirPath = path.join(testDirPath, "rebalance_noop");
			const shardMgr = await ShardManager.init(
				fileAdapter,
				newDirPath,
				testSchema,
				"english"
			);

			// First rebalance to 3 shards
			await shardMgr.rebalance(3);
			const currentShards = 3;
			expect(shardMgr.numOfShards).toBe(currentShards);

			const persistShardSpy = vi.spyOn(shardMgr, "persistShard");

			// Rebalance to the same number of shards
			await shardMgr.rebalance(currentShards);

			expect(shardMgr.numOfShards).toBe(currentShards);
			expect(persistShardSpy).not.toHaveBeenCalled();
		});

		describe("autoRebalance method", () => {
			it("should scale out when shard sizes exceed 500MB", async () => {
				const expectedShards = 2; // Double the default 1 shard

				// Create ShardManager with default 1 shard
				const newDirPath = path.join(
					testDirPath,
					"rebalance_scale_out"
				);
				const shardMgr = await ShardManager.init(
					fileAdapter,
					newDirPath,
					testSchema,
					"english"
				);

				// Mock file sizes (1.1GB total, ~550MB per shard)
				const statSpy = vi.spyOn(fileAdapter, "stat");
				statSpy.mockImplementation(async () => {
					// Return mock sizes exceeding 500MB per shard
					return {
						type: "file",
						ctime: Date.now(),
						mtime: Date.now(),
						size: 550 * 1024 * 1024, // 550MB
					};
				});

				const rebalanceSpy = vi.spyOn(shardMgr, "rebalance");

				await shardMgr.autoRebalance();

				// Should have called rebalance with double the shards
				expect(rebalanceSpy).toHaveBeenCalledWith(expectedShards);
				expect(shardMgr.numOfShards).toBe(expectedShards);
			});

			it("should scale in when there are too many small shards", async () => {
				const expectedShards = 4; // Halve from 8 shards

				// Create ShardManager and then manually set to 8 shards
				const newDirPath = path.join(testDirPath, "rebalance_scale_in");
				const shardMgr = await ShardManager.init(
					fileAdapter,
					newDirPath,
					testSchema,
					"english"
				);

				// Set to 8 shards first
				await shardMgr.rebalance(8);
				expect(shardMgr.numOfShards).toBe(8);

				// Mock small file sizes (80MB total, ~10MB per shard)
				const statSpy = vi.spyOn(fileAdapter, "stat");
				statSpy.mockImplementation(async (filePath) => {
					return {
						type: "file",
						ctime: Date.now(),
						mtime: Date.now(),
						size: 10 * 1024 * 1024, // 10MB
					};
				});

				const rebalanceSpy = vi.spyOn(shardMgr, "rebalance");

				await shardMgr.autoRebalance();

				// Should have called rebalance to reduce shards
				expect(rebalanceSpy).toHaveBeenCalledWith(expectedShards);
				expect(shardMgr.numOfShards).toBe(expectedShards);
			});

			it("should not rebalance when shard sizes are optimal", async () => {
				// Create ShardManager and then set to 4 shards
				const newDirPath = path.join(testDirPath, "rebalance_optimal");
				const shardMgr = await ShardManager.init(
					fileAdapter,
					newDirPath,
					testSchema,
					"english"
				);

				// Set to 4 shards first
				await shardMgr.rebalance(4);
				const optimalShards = 4;
				expect(shardMgr.numOfShards).toBe(optimalShards);

				// Mock optimal file sizes (1GB total, 250MB per shard)
				const statSpy = vi.spyOn(fileAdapter, "stat");
				statSpy.mockImplementation(async (filePath) => {
					return {
						type: "file",
						ctime: Date.now(),
						mtime: Date.now(),
						size: 250 * 1024 * 1024, // 250MB
					};
				});

				const rebalanceSpy = vi.spyOn(shardMgr, "rebalance");

				await shardMgr.autoRebalance();

				// Should not have called rebalance as size is optimal
				expect(rebalanceSpy).not.toHaveBeenCalled();
				expect(shardMgr.numOfShards).toBe(optimalShards);
			});
		});
	});
});
