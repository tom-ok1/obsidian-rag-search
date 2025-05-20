import { describe, it, expect, vi, beforeEach } from "vitest";
import { DocumentService } from "./document.js";
import { OramaStore } from "../infrastructure/vectorStore.js";
import { MarkdownProcessor } from "../infrastructure/markdownProcessor.js";

// Mocks
const mockReset = vi.fn();
const mockAddDocuments = vi.fn();
const mockProcessMarkdownFiles = vi.fn();

const MockOramaStore = vi.fn(() => ({
	reset: mockReset,
	addDocuments: mockAddDocuments,
}));

const MockMarkdownProcessor = vi.fn(() => ({
	processMarkdownFiles: mockProcessMarkdownFiles,
}));

describe("DocumentService", () => {
	let service: DocumentService;
	let vectorStore: OramaStore;
	let markdownProcessor: MarkdownProcessor;

	beforeEach(() => {
		mockReset.mockClear();
		mockAddDocuments.mockClear();
		mockProcessMarkdownFiles.mockClear();
		vectorStore = new MockOramaStore() as any;
		markdownProcessor = new MockMarkdownProcessor() as any;
		service = new DocumentService(vectorStore, markdownProcessor);
	});

	it("should reset the vector store and add documents in batches", async () => {
		const filePaths = ["a.md", "b.md", "c.md"];
		mockProcessMarkdownFiles.mockResolvedValue([
			{ id: "1", content: "foo", documentMetadata: { title: "A" } },
			{ id: "2", content: "bar", documentMetadata: { title: "B" } },
		]);
		mockAddDocuments.mockResolvedValue(undefined);

		await service.reindex(filePaths);

		expect(mockReset).toHaveBeenCalledTimes(1);
		expect(mockProcessMarkdownFiles).toHaveBeenCalled();
		expect(mockAddDocuments).toHaveBeenCalledWith([
			{ id: "1", pageContent: "foo", metadata: { title: "A" } },
			{ id: "2", pageContent: "bar", metadata: { title: "B" } },
		]);
	});

	it("should reset the vector store again and throw if an error occurs", async () => {
		mockProcessMarkdownFiles.mockRejectedValue(new Error("fail"));
		mockAddDocuments.mockResolvedValue(undefined);
		const filePaths = ["a.md"];

		await expect(service.reindex(filePaths)).rejects.toThrow(
			"Reindexing failed: fail"
		);
		expect(mockReset).toHaveBeenCalledTimes(2);
	});
});
