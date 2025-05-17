import { DocumentRepository } from "./documentRepository.js";
import { ShardManager } from "./shardManager.js";
import { NodeFsAdapter } from "../utils/NodeFsAdapter.js";
import { AnySchema, create, insertMultiple, Orama } from "@orama/orama";
import path from "path";
import os from "os";
import { existsSync } from "fs";
import fs from "fs/promises";
import { MockedObject } from "vitest";

vi.mock("./shardManager.js", () => {
	return {
		ShardManager: {
			init: vi.fn(),
		},
	};
});

const testSchema = {
	id: "string",
	title: "string",
	content: "string",
	embedding: "vector[3]",
} as const;

const testDocs = [
	{
		id: "1",
		title: "Doc 1",
		content: "Content 1",
		embedding: [0.1, 0.2, 0.3],
	},
	{
		id: "2",
		title: "Doc 2",
		content: "Content 2",
		embedding: [0.4, 0.5, 0.6],
	},
];

describe("DocumentRepository", () => {
	let fileAdapter: NodeFsAdapter;
	let mockShardManager: MockedObject<ShardManager<AnySchema>>;
	let testDbPath: string;
	let mockDb1: Orama<AnySchema>;
	let mockDb2: Orama<AnySchema>;

	beforeEach(async () => {
		// Set up test directory
		testDbPath = path.join(os.tmpdir(), "orama-test-" + Date.now());
		await fs.mkdir(testDbPath, { recursive: true });

		fileAdapter = new NodeFsAdapter();

		// Create mock Orama databases
		mockDb1 = await create({ schema: testSchema });
		mockDb2 = await create({ schema: testSchema });

		// Set up mock shard manager
		mockShardManager = {
			numOfShards: 2,
			getNode: vi.fn(),
			getShard: vi.fn(),
			persistShard: vi.fn(),
			autoRebalance: vi.fn(),
			reset: vi.fn(),
		} as any;

		// Default mock implementation
		mockShardManager.getNode.mockImplementation((id: string) => {
			return id === "1" ? "0" : "1"; // Route to different shards based on ID
		});

		mockShardManager.getShard.mockImplementation(async (idx: number) => {
			return idx === 0 ? mockDb1 : mockDb2;
		});

		vi.spyOn(ShardManager, "init").mockResolvedValue(mockShardManager);
	});

	afterEach(async () => {
		// Clean up test directory
		if (existsSync(testDbPath)) {
			await fs.rm(testDbPath, { recursive: true, force: true });
		}
		vi.clearAllMocks();
	});

	it("should initialize properly", async () => {
		const repo = await DocumentRepository.init(fileAdapter, {
			dirPath: testDbPath,
			schema: testSchema,
		});

		expect(ShardManager.init).toHaveBeenCalledWith(
			fileAdapter,
			testDbPath,
			testSchema,
			"english"
		);

		expect(repo).toBeInstanceOf(DocumentRepository);
	});

	it("should insert documents", async () => {
		const repo = await DocumentRepository.init(fileAdapter, {
			dirPath: testDbPath,
			schema: testSchema,
		});

		await repo.insertMany([testDocs[0]]);

		expect(mockShardManager.getNode).toHaveBeenCalledWith("1");
		expect(mockShardManager.getShard).toHaveBeenCalledWith(0);
		expect(mockShardManager.persistShard).toHaveBeenCalledWith(mockDb1, 0);
	});

	it("should insert documents across different shards", async () => {
		const repo = await DocumentRepository.init(fileAdapter, {
			dirPath: testDbPath,
			schema: testSchema,
		});

		await repo.insertMany(testDocs);

		// Check if getNode was called for each document
		expect(mockShardManager.getNode).toHaveBeenCalledWith("1");
		expect(mockShardManager.getNode).toHaveBeenCalledWith("2");

		// Check if getShard was called for both shards
		expect(mockShardManager.getShard).toHaveBeenCalledWith(0);
		expect(mockShardManager.getShard).toHaveBeenCalledWith(1);

		// Check if persistShard was called for both shards
		expect(mockShardManager.persistShard).toHaveBeenCalledWith(mockDb1, 0);
		expect(mockShardManager.persistShard).toHaveBeenCalledWith(mockDb2, 1);
	});

	it("should search documents", async () => {
		const documents = structuredClone(testDocs);
		const repo = await DocumentRepository.init(fileAdapter, {
			dirPath: testDbPath,
			schema: testSchema,
		});

		// Add test documents to mock databases
		await insertMultiple(mockDb1, [documents[0]]);

		const queryVector = [0.1, 0.2, 0.3];
		const searchOptions = {
			filter: { title: "Doc 1" },
			k: 10,
			fetchK: 20,
			lambda: 0.7,
		};

		const results = await repo.search(queryVector, searchOptions);

		expect(mockShardManager.getShard).toHaveBeenCalledWith(0);
		expect(mockShardManager.getShard).toHaveBeenCalledWith(1);
		expect(results.length).toBe(1);
		expect(results[0].document.id).toBe("1");
	});

	it("should search documents across different shards", async () => {
		const documents = structuredClone(testDocs);
		const repo = await DocumentRepository.init(fileAdapter, {
			dirPath: testDbPath,
			schema: testSchema,
		});

		// Add test documents to mock databases
		await insertMultiple(mockDb1, [documents[0]]);
		await insertMultiple(mockDb2, [documents[1]]);

		const queryVector = [0.1, 0.2, 0.3];
		const searchOptions = {
			k: 10,
			fetchK: 20,
			lambda: 0.7,
		};

		const results = await repo.search(queryVector, searchOptions);

		expect(mockShardManager.getShard).toHaveBeenCalledWith(0);
		expect(mockShardManager.getShard).toHaveBeenCalledWith(1);

		// Results should be sorted by score in descending order
		expect(results.length).toBe(2);
		expect(results[0].document.id).toBe("1");
		expect(results[1].document.id).toBe("2");
	});
});
