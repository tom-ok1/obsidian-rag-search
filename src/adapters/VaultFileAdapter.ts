import { FileStats, Vault } from "obsidian";
import { FileAdapter } from "./fileAdapter";

export class VaultFileAdapter implements FileAdapter {
	constructor(private readonly vault: Vault) {}

	async read(filePath: string): Promise<string> {
		return this.vault.adapter.read(filePath);
	}
	async write(filePath: string, content: string): Promise<void> {
		return this.vault.adapter.write(filePath, content);
	}
	async delete(filePath: string): Promise<void> {
		return this.vault.adapter.remove(filePath);
	}
	async exists(filePath: string): Promise<boolean> {
		return this.vault.adapter.exists(filePath);
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
}
