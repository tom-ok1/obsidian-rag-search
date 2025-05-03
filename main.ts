import { Plugin } from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./src/components/ChatView";
import { RagManager } from "src/search/chat";
import { VaultFile } from "src/utils/VaultFile";
import { corslessFetch } from "src/utils/corslessFetcher";
globalThis.fetch = corslessFetch;

export default class MyPlugin extends Plugin {
	private chat!: RagManager;

	async onload() {
		this.registerView(
			VIEW_TYPE_CHAT,
			(leaf) => new ChatView(leaf, this.chat)
		);

		const file = new VaultFile(this.app);
		this.chat = await RagManager.create({
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
