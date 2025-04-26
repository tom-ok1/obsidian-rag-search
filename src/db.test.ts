import { describe, it, expect, afterEach } from "vitest";
import { OramaStore } from "./db";
import { Embeddings } from "@langchain/core/embeddings";
import * as fs from "fs";
import * as path from "path";
import { Orama, create, save } from "@orama/orama";
import { LocalFileAdapter } from "./adapters/LocalFileAdapter";

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

		// Create a proper Orama instance using the create function
		const mockOramaDb = await create({
			schema: {
				id: "string",
				title: "string",
				path: "string",
				content: "string",
				embedding: `vector[${mockEmbeddingDimensions}]`,
				embeddingModel: "string",
				created_at: "number",
				ctime: "number",
				mtime: "number",
				tags: "string[]",
				extension: "string",
			},
		});

		// Save the properly created Orama instance
		const rawdata = await save(mockOramaDb);
		const jsonData = JSON.stringify(
			{ ...rawdata, schema: mockOramaDb.schema },
			null,
			2
		);
		fs.writeFileSync(testDbPath, jsonData);
		expect(fs.existsSync(testDbPath)).toBe(true);

		const store = new OramaStore(localFileAdapter, mockEmbeddings, {
			dbPath: testDbPath,
		});

		const loadedDb = await store.loadDb(testDbPath);

		expect(loadedDb).toBeDefined();
		expect(loadedDb.schema).toEqual(mockOramaDb.schema);
		expect(loadedDb.schema.embedding).toBe(
			`vector[${mockEmbeddingDimensions}]`
		);
	});

	it("should create a new db with the correct vector length", async () => {
		const mockEmbeddingDimensions = 256;
		const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

		const store = new OramaStore(localFileAdapter, mockEmbeddings, {
			dbPath: testDbPath,
		});
		const db = await store.createNewDb(testDbPath);

		expect(db).toBeDefined();
		expect(fs.existsSync(testDbPath)).toBe(true);

		const dbContent: Orama<any> = JSON.parse(
			fs.readFileSync(testDbPath, "utf-8")
		);
		expect(dbContent.schema.embedding).toBe(
			`vector[${mockEmbeddingDimensions}]`
		);
	});
});
