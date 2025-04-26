import * as fs from "fs";
import * as path from "path";
import { FileStats, Vault } from "obsidian";

export interface FileAdapter {
	read(filePath: string): Promise<string>;
	write(filePath: string, content: string): Promise<void>;
	delete(filePath: string): Promise<void>;
	exists(filePath: string): Promise<boolean>;
	basename(filePath: string): Promise<string>;
	extname(filePath: string): Promise<string>;
	stat(filePath: string): Promise<FileStats>;
}
