import "./styles.css";
import {
	App,
	ItemView,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import { RagService } from "src/search/ragService.js";
import { VaultFile } from "src/utils/VaultFile.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChatApp } from "src/components/Chat.js";
import {
	ObsidianChatVertexAI,
	ObsidianVertexAIEmbeddings,
} from "src/api/vertex.js";

export default class MyPlugin extends Plugin {
	private chat!: RagService;
	private readonly STORAGE_KEY = "rag-search-fileMtimeMap";

	async onload() {
		this.registerView(
			VIEW_TYPE_CHAT,
			(leaf) => new ChatView(leaf, this.chat)
		);
		this.addSettingTab(new ExampleSettingTab(this.app, this));

		const model = new ObsidianChatVertexAI({
			model: "claude-3-5-sonnet-v2@20241022",
			streaming: true,
			streamUsage: false,
			authOptions: {
				projectId:
					process.env.GOOGLE_PROJECT_ID || "tomoya-oki-sandbox",
			},
		});
		const embeddings = new ObsidianVertexAIEmbeddings({
			model: "text-embedding-004",
			authOptions: {
				projectId:
					process.env.GOOGLE_PROJECT_ID || "tomoya-oki-sandbox",
			},
		});

		const file = new VaultFile(this.app);
		this.chat = await RagService.create({
			model,
			embeddings,
			file,
			config: {
				dirPath: "test",
				language: "japanese",
			},
		});

		this.addCommand({
			id: "open-rag-chat-react",
			name: "Open RAG Chat (React)",
			callback: () => this.openChatView(),
		});

		this.addRibbonIcon("message-square", "RAG Chat (React)", () =>
			this.openChatView()
		);

		this.app.workspace.onLayoutReady(async () => {
			// Files are available after the layout is ready
			this.addCommand({
				id: "rag-chat-react-search",
				name: "insert documents",
				callback: this.insertDocuments.bind(this),
			});
		});
	}

	private async insertDocuments() {
		const files: TFile[] = this.app.vault.getFiles();
		const rawData = window.localStorage.getItem(this.STORAGE_KEY);
		const fileMtimeMap: Record<string, number | undefined> = rawData
			? JSON.parse(rawData)
			: {};
		const updatedFiles = files
			.filter((f) => {
				const lastInsertedMtime = fileMtimeMap[f.path];
				if (!lastInsertedMtime) return true;
				return f.stat.mtime > Number(lastInsertedMtime);
			})
			.map(({ path }) => path);

		await this.chat.insert(updatedFiles);

		const updatedFilesMtime = files.reduce(
			(acc, f) => ({
				...acc,
				[f.path]: f.stat.mtime,
			}),
			{} as Record<string, number>
		);
		window.localStorage.setItem(
			this.STORAGE_KEY,
			JSON.stringify(updatedFilesMtime)
		);
	}

	openChatView() {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);
		const leaf = this.app.workspace.getRightLeaf(false);
		if (!leaf) return;
		leaf.setViewState({ type: VIEW_TYPE_CHAT, active: true });
		this.app.workspace.revealLeaf(leaf);
	}

	onunload() {
		this.app.workspace
			.getLeavesOfType(VIEW_TYPE_CHAT)
			.forEach((l) => l.detach());
	}
}

const VIEW_TYPE_CHAT = "rag-chat-react";

export class ChatView extends ItemView {
	private root?: ReactDOM.Root;

	constructor(leaf: WorkspaceLeaf, private chat: RagService) {
		super(leaf);
	}
	getViewType() {
		return VIEW_TYPE_CHAT;
	}
	getDisplayText() {
		return "RAG Chat (React)";
	}

	async onOpen() {
		const container = this.containerEl.children[1];
		container.empty();

		this.root = ReactDOM.createRoot(container);
		this.root.render(React.createElement(ChatApp, { chat: this.chat }));
	}

	async onClose() {
		this.root?.unmount();
	}
}

class ExampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
	}

	display(): void {
		let { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("Date format")
			.setDesc("Default date format")
			.addText((text) =>
				text
					.setPlaceholder("MMMM dd, yyyy")
					.setValue("dummy")
					.onChange(async (value) => {
						console.log("Setting updated: " + value);
					})
			);
	}
}
