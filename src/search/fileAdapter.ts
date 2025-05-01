import { FileStats } from "obsidian";

export interface FileAdapter {
	read(filePath: string): Promise<string>;
	write(filename: string, dirname: string, content: string): Promise<void>;
	delete(filePath: string): Promise<void>;
	exists(filePath: string): Promise<boolean>;
	basename(filePath: string): Promise<string>;
	extname(filePath: string): Promise<string>;
	stat(filePath: string): Promise<FileStats>;
	join(...paths: string[]): string;
}
