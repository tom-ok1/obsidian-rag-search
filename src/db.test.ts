import { describe, it, expect, afterEach } from "vitest";
import { OramaStore } from "./db";
import { Embeddings } from "@langchain/core/embeddings";
import * as fs from "fs";
import * as path from "path";
import { Orama } from "@orama/orama";
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

	it("should create a new db with the correct vector length", async () => {
		const mockEmbeddingDimensions = 256;
		const mockEmbeddings = new MockEmbeddings(mockEmbeddingDimensions);

		const store = new OramaStore(localFileAdapter, mockEmbeddings, {
			dbPath: testDbPath,
		});
		const db = await store.createNewDb(mockEmbeddings, testDbPath);

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
