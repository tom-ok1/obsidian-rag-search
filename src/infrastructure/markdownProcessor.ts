import { MD5 } from "crypto-js";
import { FileAdapter } from "../utils/fileAdapter.js";
import { ObsidianMetadataExtractor } from "./obsidianMetadataExtractor.js";
import { MarkdownTextSplitter } from "@langchain/textsplitters";

export type MdDocMetadata = {
	title?: string;
	path?: string;
	extension?: string;
	tags?: string[];
	ctime?: number;
	mtime?: number;
	description?: string;
	[key: string]: any;
};

export class MarkdownProcessor {
	constructor(private readonly file: FileAdapter) {}

	async readMarkdownFile(filePath: string): Promise<string | undefined> {
		const extension = await this.file.extname(filePath);
		if (extension !== "md") return;
		return (await this.file.read(filePath, "utf-8")) as string;
	}

	async getFileInfo(
		filePath: string,
		content: string
	): Promise<MdDocMetadata> {
		const basename = await this.file.basename(filePath);
		const extension = await this.file.extname(filePath);
		const stats = await this.file.stat(filePath);

		const obsidianMeta = ObsidianMetadataExtractor.extractMetadata(content);

		return {
			title: basename,
			path: filePath,
			extension: extension,
			ctime: stats.ctime,
			mtime: stats.mtime,

			...(obsidianMeta.frontMatter.title && {
				title: obsidianMeta.frontMatter.title,
			}),
			...(obsidianMeta.frontMatter.description && {
				description: obsidianMeta.frontMatter.description,
			}),
			...obsidianMeta.frontMatter,
			...obsidianMeta.dataviewFields,

			tags: obsidianMeta.tags,
		};
	}

	async splitIntoChunks(content: string, documentMetadata: MdDocMetadata) {
		const contentWithoutFrontMatter =
			ObsidianMetadataExtractor.removeFrontMatter(content);
		const textSplitter = new MarkdownTextSplitter({
			chunkSize: 500,
			chunkOverlap: 0,
		});
		const chunkHeader = `\n\nNOTE TITLE: [[${
			documentMetadata.title
		}]]\n\nMETADATA:${JSON.stringify(
			documentMetadata
		)}\n\nNOTE BLOCK CONTENT:\n\n`;
		const chunks = await textSplitter.createDocuments(
			[contentWithoutFrontMatter],
			[],
			{
				chunkHeader,
				appendChunkOverlapHeader: true,
			}
		);
		return chunks
			.map((chunk) => ({
				content: chunk.pageContent,
				documentMetadata,
			}))
			.filter((chunk) => chunk.content.trim());
	}

	getDocHash(content: string) {
		return MD5(content).toString();
	}

	async processMarkdownFile(filePath: string) {
		try {
			const content = await this.readMarkdownFile(filePath);
			if (!content?.trim()) return [];

			const fileInfo = await this.getFileInfo(filePath, content);
			const chunks = await this.splitIntoChunks(content, fileInfo);

			return chunks.map((chunk) => ({
				id: this.getDocHash(chunk.content),
				content: chunk.content,
				documentMetadata: chunk.documentMetadata,
			}));
		} catch (error) {
			console.error(`Error processing file ${filePath}:`, error);
			return [];
		}
	}

	async processMarkdownFiles(filePaths: string[]) {
		const results = [];
		for (const filePath of filePaths) {
			const chunks = await this.processMarkdownFile(filePath);
			results.push(...chunks);
		}
		return results;
	}
}
