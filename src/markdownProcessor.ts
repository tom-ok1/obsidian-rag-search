import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { MD5 } from "crypto-js";
import { FileAdapter } from "./adapters/fileAdapter";

const CHUNK_SIZE = 1000;

interface FileInfo {
	title: string;
	path: string;
	ctime: number;
	mtime: number;
	tags: string[];
	extension: string;
	metadata: {
		created: string;
		modified: string;
		[key: string]: any;
	};
}

export class MarkdownProcessor {
	constructor(private readonly file: FileAdapter) {}

	async readMarkdownFile(filePath: string): Promise<string> {
		const extension = await this.file.extname(filePath);
		if (extension !== ".md") {
			throw new Error("Not a markdown file");
		}
		return await this.file.read(filePath);
	}

	/**
	 * Split content into chunks
	 * @param content File content
	 * @param fileInfo File information
	 * @returns Array of chunks
	 */
	async splitIntoChunks(
		content: string,
		fileInfo: FileInfo
	): Promise<Array<{ content: string; fileInfo: FileInfo }>> {
		const textSplitter = RecursiveCharacterTextSplitter.fromLanguage(
			"markdown",
			{
				chunkSize: CHUNK_SIZE,
			}
		);

		// Add chunk header
		const chunks = await textSplitter.createDocuments([content], [], {
			chunkHeader: `\n\nNOTE TITLE: [[${
				fileInfo.title
			}]]\n\nMETADATA:${JSON.stringify(
				fileInfo.metadata
			)}\n\nNOTE BLOCK CONTENT:\n\n`,
			appendChunkOverlapHeader: true,
		});

		// Format results
		return chunks
			.map((chunk) => ({
				content: chunk.pageContent,
				fileInfo: fileInfo,
			}))
			.filter((chunk) => chunk.content.trim());
	}

	/**
	 * Extract tags from markdown content
	 * @param content File content
	 * @returns Array of tags
	 */
	private extractTags(content: string): string[] {
		const tagRegex = /#([a-zA-Z0-9_-]+)/g;
		const tags: string[] = [];
		let match: RegExpExecArray | null;

		while ((match = tagRegex.exec(content)) !== null) {
			tags.push(match[0]);
		}

		return [...new Set(tags)]; // Remove duplicates
	}

	/**
	 * Extract frontmatter from markdown content
	 * @param content File content
	 * @returns Frontmatter object
	 */
	private extractFrontmatter(content: string): Record<string, any> {
		const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
		const match = content.match(frontmatterRegex);

		if (!match) return {};

		const frontmatterText = match[1];
		const frontmatter: Record<string, any> = {};

		frontmatterText.split("\n").forEach((line) => {
			const colonIndex = line.indexOf(":");
			if (colonIndex !== -1) {
				const key = line.slice(0, colonIndex).trim();
				const value = line.slice(colonIndex + 1).trim();

				// Try to parse as JSON if possible, otherwise keep as string
				try {
					frontmatter[key] = JSON.parse(value);
				} catch {
					frontmatter[key] = value;
				}
			}
		});

		return frontmatter;
	}

	/**
	 * Get file information
	 * @param filePath Path to the file
	 * @param stats File stats
	 * @param content File content
	 * @returns File information
	 */
	async getFileInfo(filePath: string, content: string): Promise<FileInfo> {
		const basename = await this.file.basename(filePath);
		const extension = await this.file.extname(filePath);
		const stats = await this.file.stat(filePath);
		const tags = this.extractTags(content);
		const frontmatter = this.extractFrontmatter(content);

		return {
			title: basename,
			path: filePath,
			ctime: stats.ctime,
			mtime: stats.mtime,
			tags: tags,
			extension: extension,
			metadata: {
				...frontmatter,
				created: new Date(stats.ctime).toISOString(),
				modified: new Date(stats.mtime).toISOString(),
			},
		};
	}

	getDocHash(content: string): string {
		return MD5(content).toString();
	}

	async processMarkdownFile(
		filePath: string
	): Promise<Array<{ id: string; content: string; fileInfo: FileInfo }>> {
		try {
			const content = await this.readMarkdownFile(filePath);
			if (!content?.trim()) return [];

			const fileInfo = await this.getFileInfo(filePath, content);
			const chunks = await this.splitIntoChunks(content, fileInfo);

			// Add ID to each chunk to partition the data
			return chunks.map((chunk) => ({
				id: this.getDocHash(chunk.content),
				content: chunk.content,
				fileInfo: chunk.fileInfo,
			}));
		} catch (error) {
			console.error(`Error processing file ${filePath}:`, error);
			return [];
		}
	}

	async processMarkdownFiles(
		filePaths: string[]
	): Promise<Array<{ id: string; content: string; fileInfo: FileInfo }>> {
		const results = [];
		for (const filePath of filePaths) {
			const chunks = await this.processMarkdownFile(filePath);
			results.push(...chunks);
		}
		return results;
	}
}
