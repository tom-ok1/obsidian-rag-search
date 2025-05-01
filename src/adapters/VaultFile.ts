import { FileStats, normalizePath, Vault } from "obsidian";
import { FileAdapter } from "./fileAdapter";

export class VaultFile implements FileAdapter {
	constructor(private readonly vault: Vault) {}

	async read(filePath: string): Promise<string> {
		this.vault.adapter.mkdir;
		const normalizedPath = normalizePath(filePath);
		return this.vault.adapter.read(normalizedPath);
	}
	async write(
		filename: string,
		dirname: string,
		content: string
	): Promise<void> {
		const filePath = filename + dirname;
		const normalizedPath = normalizePath(filePath);
		this.vault.adapter.mkdir(dirname);
		return this.vault.adapter.write(normalizedPath, content);
	}
	async delete(filePath: string): Promise<void> {
		const normalizedPath = normalizePath(filePath);
		return this.vault.adapter.remove(normalizedPath);
	}
	async exists(filePath: string): Promise<boolean> {
		const normalizedPath = normalizePath(filePath);
		return this.vault.adapter.exists(normalizedPath);
	}
	async basename(filePath: string): Promise<string> {
		const file = await this.vault.getFileByPath(filePath);
		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}
		return file.basename;
	}
	async extname(filePath: string): Promise<string> {
		const file = await this.vault.getFileByPath(filePath);
		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}
		return file.extension;
	}
	async stat(filePath: string): Promise<FileStats> {
		const file = await this.vault.getFileByPath(filePath);
		if (!file) {
			throw new Error(`File not found: ${filePath}`);
		}
		return file.stat;
	}
	join(...paths: string[]): string {
		const path = paths.map((path) => normalizePath(path)).join("/");
		return normalizePath(path);
	}
}
