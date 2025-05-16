import { DataAdapter, DataWriteOptions, ListedFiles, Stat } from "obsidian";
import * as fs from "fs/promises";
import * as path from "path";
import { existsSync } from "fs";

/**
 * A file adapter for Node.js filesystem operations
 * Used for testing purposes
 */
export class NodeFsAdapter implements DataAdapter {
	getName(): string {
		return "localFile";
	}

	async exists(
		normalizedPath: string,
		sensitive?: boolean
	): Promise<boolean> {
		return existsSync(normalizedPath);
	}

	async stat(normalizedPath: string): Promise<Stat | null> {
		const stats = await fs.stat(normalizedPath);
		const type = stats.isDirectory() ? "folder" : "file";
		return {
			type,
			ctime: stats.ctimeMs,
			mtime: stats.mtimeMs,
			size: stats.size,
		};
	}

	async list(normalizedPath: string): Promise<ListedFiles> {
		const files: string[] = [];
		const folders: string[] = [];

		const dirEntries = await fs.readdir(normalizedPath, {
			withFileTypes: true,
		});

		for (const entry of dirEntries) {
			const fullPath = path.join(normalizedPath, entry.name);
			if (entry.isDirectory()) {
				folders.push(fullPath + "/");
			} else {
				files.push(fullPath);
			}
		}

		return { files, folders };
	}

	async read(normalizedPath: string): Promise<string> {
		return await fs.readFile(normalizedPath, "utf-8");
	}

	async readBinary(normalizedPath: string): Promise<ArrayBuffer> {
		const buffer = await fs.readFile(normalizedPath);
		return buffer.buffer.slice(
			buffer.byteOffset,
			buffer.byteOffset + buffer.byteLength
		);
	}

	async write(
		normalizedPath: string,
		data: string,
		options?: DataWriteOptions
	): Promise<void> {
		await this.mkdir(path.dirname(normalizedPath));
		await fs.writeFile(normalizedPath, data, "utf-8");
	}

	async writeBinary(
		normalizedPath: string,
		data: ArrayBuffer,
		options?: DataWriteOptions
	): Promise<void> {
		await this.mkdir(path.dirname(normalizedPath));
		await fs.writeFile(normalizedPath, Buffer.from(data));
	}

	async append(
		normalizedPath: string,
		data: string,
		options?: DataWriteOptions
	): Promise<void> {
		await this.mkdir(path.dirname(normalizedPath));
		await fs.appendFile(normalizedPath, data, "utf-8");
	}

	async process(
		normalizedPath: string,
		fn: (data: string) => string,
		options?: DataWriteOptions
	): Promise<string> {
		const data = await this.read(normalizedPath);
		const result = fn(data);
		await this.write(normalizedPath, result, options);
		return result;
	}

	getResourcePath(normalizedPath: string): string {
		return normalizedPath;
	}

	async mkdir(normalizedPath: string): Promise<void> {
		await fs.mkdir(normalizedPath, { recursive: true });
	}

	async trashSystem(normalizedPath: string): Promise<boolean> {
		try {
			await fs.rm(normalizedPath, { recursive: true });
			return true;
		} catch {
			return false;
		}
	}

	async trashLocal(normalizedPath: string): Promise<void> {
		await this.remove(normalizedPath);
	}

	async rmdir(normalizedPath: string, recursive: boolean): Promise<void> {
		await fs.rm(normalizedPath, { recursive });
	}

	async remove(normalizedPath: string): Promise<void> {
		await fs.unlink(normalizedPath);
	}

	async rename(
		normalizedPath: string,
		normalizedNewPath: string
	): Promise<void> {
		await this.mkdir(path.dirname(normalizedNewPath));
		await fs.rename(normalizedPath, normalizedNewPath);
	}

	async copy(
		normalizedPath: string,
		normalizedNewPath: string
	): Promise<void> {
		await this.mkdir(path.dirname(normalizedNewPath));
		await fs.copyFile(normalizedPath, normalizedNewPath);
	}
}
