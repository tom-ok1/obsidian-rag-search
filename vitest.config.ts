import { defineConfig } from "vitest/config";
import path, { resolve } from "path";

export default defineConfig({
	test: {
		globals: true,
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
			obsidian: path.resolve(__dirname, "test/empty-obsidian.js"),
		},
	},
});
