import "./styles.css";
import { ItemView, Plugin, WorkspaceLeaf } from "obsidian";
import { ChatService } from "src/search/chatService.js";
import { VaultFile } from "src/utils/VaultFile.js";
import { corslessFetch } from "src/utils/corslessFetcher.js";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChatApp } from "src/components/Chat.js";

globalThis.fetch = corslessFetch;

export default class MyPlugin extends Plugin {
	private chat!: ChatService;

	async onload() {
		this.registerView(
			VIEW_TYPE_CHAT,
			(leaf) => new ChatView(leaf, this.chat)
		);

		const file = new VaultFile(this.app);
		this.chat = await ChatService.create({
			file,
			dirPath: "test",
			numOfShards: 1,
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
			// should be inserted after workspace is ready
			// path should be relative to vault root
			// await this.chat.insert([
			// "Resources/Tech/Obsidian/Obsidian上でVimを実現している方法.md",
			// "Resources/Tech/Obsidian/Obsidianにおけるnvim-treeライクなファイルエクスプローラー操作の実現可能性調査.md",
			// ]);
		});
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
