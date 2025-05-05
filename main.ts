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
import { ChatService } from "src/search/chatService.js";
import { VaultFile } from "src/utils/VaultFile.js";
import { corslessFetch } from "src/utils/corslessFetcher.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChatApp } from "src/components/Chat.js";

globalThis.fetch = corslessFetch;

export default class MyPlugin extends Plugin {
	private chat!: ChatService;
	private readonly STORAGE_KEY = "rag-search-fileMtimeMap";

	async onload() {
		this.registerView(
			VIEW_TYPE_CHAT,
			(leaf) => new ChatView(leaf, this.chat)
		);
		this.addSettingTab(new ExampleSettingTab(this.app, this));

		const file = new VaultFile(this.app);
		this.chat = await ChatService.create({
			file,
			dirPath: "test",
			numOfShards: 1,
			language: "japanese",
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

	constructor(leaf: WorkspaceLeaf, private chat: ChatService) {
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
