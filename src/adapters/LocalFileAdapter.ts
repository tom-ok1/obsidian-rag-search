import { FileAdapter } from "./fileAdapter";
import * as fs from "fs";
import * as path from "path";
import { FileStats } from "obsidian";

export class LocalFileAdapter implements FileAdapter {
	async read(filePath: string): Promise<string> {
		return fs.readFileSync(filePath, "utf-8");
	}
	async write(filePath: string, content: string): Promise<void> {
		fs.writeFileSync(filePath, content, "utf-8");
	}
	async delete(filePath: string): Promise<void> {
		fs.unlinkSync(filePath);
	}
	async exists(filePath: string): Promise<boolean> {
		return fs.existsSync(filePath);
	}
	async basename(filePath: string): Promise<string> {
		return path.basename(filePath);
	}
	async extname(filePath: string): Promise<string> {
		return path.extname(filePath).slice(1);
	}
	async stat(filePath: string): Promise<FileStats> {
		const stats = fs.statSync(filePath);
		return {
			ctime: stats.ctimeMs,
			mtime: stats.mtimeMs,
			size: stats.size,
		};
	}
}
