import path from "path";
import builtins from "builtin-modules";
import react from "@vitejs/plugin-react";
import { defineConfig, UserConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(async ({ mode }) => {
	const { resolve } = path;
	const prod = mode === "production";

	return {
		plugins: [react(), tailwindcss()],
		resolve: {
			alias: {
				src: resolve(__dirname, "src"),
			},
		},
		build: {
			lib: {
				entry: resolve(__dirname, "./main.ts"),
				name: "main",
				fileName: () => "main.js",
				formats: ["cjs"],
			},
			minify: prod,
			sourcemap: prod ? false : "inline",
			outDir: "./",
			cssCodeSplit: false,
			emptyOutDir: false,
			rollupOptions: {
				input: {
					main: resolve(__dirname, "./main.ts"),
				},
				output: {
					entryFileNames: "main.js",
					assetFileNames: "styles.css",
					inlineDynamicImports: true,
				},
				external: [
					"obsidian",
					"electron",
					"@codemirror/autocomplete",
					"@codemirror/collab",
					"@codemirror/commands",
					"@codemirror/language",
					"@codemirror/lint",
					"@codemirror/search",
					"@codemirror/state",
					"@codemirror/view",
					"@lezer/common",
					"@lezer/highlight",
					"@lezer/lr",
					/^node:.*/,
					...builtins,
				],
			},
		},
	} as UserConfig;
});
