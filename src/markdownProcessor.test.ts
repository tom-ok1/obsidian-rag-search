import { beforeEach, describe, expect, it } from "vitest";
import { LocalFileAdapter } from "./adapters/LocalFileAdapter";
import { MarkdownProcessor } from "./markdownProcessor";
import { MD5 } from "crypto-js";
import * as path from "path";

describe("MarkdownProcessor", () => {
	let adapter: LocalFileAdapter;
	let processor: MarkdownProcessor;
	const sampleFilePath = path.join(__dirname, "test/sample.md");

	beforeEach(() => {
		adapter = new LocalFileAdapter();
		processor = new MarkdownProcessor(adapter);
	});

	it("readMarkdownFile returns content for .md files", async () => {
		const content = await processor.readMarkdownFile(sampleFilePath);
		expect(content.startsWith("# Title")).toBe(true);
	});

	it("processMarkdownFile splits into chunks and carries metadata", async () => {
		const chunks = await processor.processMarkdownFile(sampleFilePath);

		expect(chunks.length).toBeGreaterThan(1);
		expect(chunks[0].content).toContain("NOTE TITLE: [[sample.md]]");
		expect(chunks[0].fileInfo.tags).toContain("#tag1");
		expect(chunks[0].fileInfo.extension).toBe("md");
	});

	it("processMarkdownFile assigns deterministic MD5 ids", async () => {
		const chunks1 = await processor.processMarkdownFile(sampleFilePath);
		const chunks2 = await processor.processMarkdownFile(sampleFilePath);

		const ids1 = chunks1.map((c) => c.id);
		const ids2 = chunks2.map((c) => c.id);

		expect(ids1).toEqual(ids2); // same content => same hashes
		// sanity check that hash really matches MD5(content)
		expect(ids1[0]).toBe(MD5(chunks1[0].content).toString());
	});
});
