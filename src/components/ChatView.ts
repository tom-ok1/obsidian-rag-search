import { ItemView, WorkspaceLeaf } from "obsidian";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChatApp } from "./Chat.js";
import { RagManager } from "src/search/chat.js";

export const VIEW_TYPE_CHAT = "rag-chat-react";

export class ChatView extends ItemView {
	private root?: ReactDOM.Root;

	constructor(leaf: WorkspaceLeaf, private chat: RagManager) {
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
