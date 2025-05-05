import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MD5 } from "crypto-js";
import { FileAdapter } from "../utils/fileAdapter.js";

const CHUNK_SIZE = 500;

export type MdDocMetadata = {
	title?: string;
	path?: string;
	extension?: string;
	tags?: string[];
	ctime?: number;
	mtime?: number;
};

export class MarkdownProcessor {
	constructor(private readonly file: FileAdapter) {}

	async readMarkdownFile(filePath: string) {
		const extension = await this.file.extname(filePath);
		if (extension !== "md") {
			throw new Error("Not a markdown file");
		}
		return await this.file.read(filePath);
	}

	async splitIntoChunks(content: string, documentMetadata: MdDocMetadata) {
		const textSplitter = RecursiveCharacterTextSplitter.fromLanguage(
			"markdown",
			{
				chunkSize: CHUNK_SIZE,
			}
		);

		// Add chunk header
		const chunks = await textSplitter.createDocuments([content], [], {
			chunkHeader: `\n\nNOTE TITLE: [[${
				documentMetadata.title
			}]]\n\nMETADATA:${JSON.stringify(
				documentMetadata
			)}\n\nNOTE BLOCK CONTENT:\n\n`,
			appendChunkOverlapHeader: true,
		});

		// Format results
		return chunks
			.map((chunk) => ({
				content: chunk.pageContent,
				documentMetadata,
			}))
			.filter((chunk) => chunk.content.trim());
	}

	private extractTags(content: string) {
		const tagRegex = /#([a-zA-Z0-9_-]+)/g;
		const tags: string[] = [];
		let match: RegExpExecArray | null;

		while ((match = tagRegex.exec(content)) !== null) {
			tags.push(match[0]);
		}

		return [...new Set(tags)]; // Remove duplicates
	}

	async getFileInfo(filePath: string, content: string) {
		const basename = await this.file.basename(filePath);
		const extension = await this.file.extname(filePath);
		const stats = await this.file.stat(filePath);
		const tags = this.extractTags(content);

		return {
			title: basename,
			path: filePath,
			ctime: stats.ctime,
			mtime: stats.mtime,
			tags: tags,
			extension: extension,
		};
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

			// Add ID to each chunk to partition the data
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
