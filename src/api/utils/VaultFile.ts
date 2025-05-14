import { App, FileStats, normalizePath } from "obsidian";
import { FileAdapter } from "./fileAdapter.js";

export class VaultFile implements FileAdapter {
	constructor(private readonly app: App) {}

	async read(filePath: string, bufferEncoding: BufferEncoding) {
		const normalizedPath = normalizePath(filePath);
		if (bufferEncoding === "binary") {
			return this.app.vault.adapter.readBinary(normalizedPath);
		}
		return this.app.vault.adapter.read(normalizedPath);
	}
	async write(
		filename: string,
		dirname: string,
		content: string | ArrayBuffer
	): Promise<void> {
		const normalizedDir = normalizePath(dirname);
		const normalizedPath = normalizePath(filename);
		await this.app.vault.adapter.mkdir(normalizedDir);
		const fullPath = normalizePath(`${normalizedDir}/${normalizedPath}`);
		if (typeof content === "string") {
			return this.app.vault.adapter.write(fullPath, content);
		}
		return this.app.vault.adapter.writeBinary(fullPath, content);
	}
	async delete(filePath: string): Promise<void> {
		const normalizedPath = normalizePath(filePath);
		return this.app.vault.adapter.remove(normalizedPath);
	}
	async exists(filePath: string): Promise<boolean> {
		const normalizedPath = normalizePath(filePath);
		return this.app.vault.adapter.exists(normalizedPath);
	}
	async basename(filePath: string): Promise<string> {
		const normalizedPath = normalizePath(filePath);
		const file = await this.app.vault.getFileByPath(normalizedPath);
		if (!file) {
			throw new Error(`File not found: ${normalizedPath}`);
		}
		return file.basename;
	}
	async extname(filePath: string): Promise<string> {
		const normalizedPath = normalizePath(filePath);
		const file = await this.app.vault.getFileByPath(normalizedPath);
		if (!file) {
			throw new Error(`File not found: ${normalizedPath}`);
		}
		return file.extension;
	}
	async stat(filePath: string): Promise<FileStats> {
		const normalizedPath = normalizePath(filePath);
		const file = await this.app.vault.getFileByPath(normalizedPath);
		if (!file) {
			throw new Error(`File not found: ${normalizedPath}`);
		}
		return file.stat;
	}
	join(...paths: string[]): string {
		const path = paths.map((path) => normalizePath(path)).join("/");
		return normalizePath(path);
	}
}
