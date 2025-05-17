import "./styles.css";
import {
	App,
	ItemView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
	WorkspaceLeaf,
} from "obsidian";
import React from "react";
import ReactDOM from "react-dom/client";
import { ChatApp } from "src/components/Chat.js";
import {
	ChatModelProviders,
	EmbeddingModelProviders,
	getChatModel,
	getEmbeddingModel,
} from "src/api/infrastructure/models.js";
import { ServiceManager } from "src/api/modules.js";

interface EmbeddingModel {
	name: string;
	provider: EmbeddingModelProviders;
	enabled: boolean;
}

interface PluginSettings {
	// API Keys
	openaiApiKey: string;
	googleApiKey: string;
	anthropicApiKey: string;

	// Chat Model Settings
	chatModelName: string;
	chatModelProvider: ChatModelProviders;

	// Embedding Model Settings
	embeddingModel: string;
	embeddingModelProvider: EmbeddingModelProviders;
	availableEmbeddingModels: EmbeddingModel[];

	// Google Project ID for Vertex AI
	googleProjectId: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	openaiApiKey: "",
	googleApiKey: "",
	anthropicApiKey: "",

	chatModelName: "gpt-4o",
	chatModelProvider: ChatModelProviders.OPENAI,

	embeddingModel: "text-embedding-3-small",
	embeddingModelProvider: EmbeddingModelProviders.OPENAI,
	availableEmbeddingModels: [
		{
			name: "text-embedding-3-small",
			provider: EmbeddingModelProviders.OPENAI,
			enabled: true,
		},
		{
			name: "text-embedding-3-large",
			provider: EmbeddingModelProviders.OPENAI,
			enabled: true,
		},
		{
			name: "text-embedding-004",
			provider: EmbeddingModelProviders.VERTEXAI,
			enabled: true,
		},
	],
	googleProjectId: "",
};

export default class MyPlugin extends Plugin {
	private serviceManager!: ServiceManager;
	private chatView: ChatView | null;
	private readonly STORAGE_KEY = "rag-search-fileMtimeMap";
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		this.serviceManager = ServiceManager.getInstance();
		this.serviceManager.initContext(this.app, "test");
		await this.initializeChatModel();

		this.registerView(VIEW_TYPE_CHAT, (leaf) => {
			this.chatView = new ChatView(leaf, this.serviceManager);
			return this.chatView;
		});
		this.addSettingTab(new RAGSearchSettingsTab(this.app, this));

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
				name: "reindex documents",
				callback: this.reindexDocuments.bind(this),
			});
		});
	}

	private async initializeChatModel() {
		try {
			const model = getChatModel(
				this.settings.chatModelProvider,
				this.settings.chatModelName,
				{
					OPENAI: this.settings.openaiApiKey,
					GOOGLE: this.settings.googleApiKey,
					ANTHROPIC: this.settings.anthropicApiKey,
				},
				this.settings.googleProjectId
			);

			const embeddings = getEmbeddingModel(
				this.settings.embeddingModelProvider,
				this.settings.embeddingModel,
				this.settings.googleProjectId,
				this.settings.openaiApiKey
			);
			await this.serviceManager.initializeServices(embeddings, model);

			// update react component state
			if (this.chatView) {
				this.chatView.resetSearchService();
			}
		} catch (error) {
			console.error("Error initializing chat model:", error);
			new Notice(`Failed to initialize chat model. ${error.message}`);
		}
	}

	private async reindexDocuments() {
		try {
			const filePaths = this.app.vault.getFiles().map(({ path }) => path);
			const docService = this.serviceManager.getService("document");
			await docService.reindex(filePaths);
			new Notice(`Reindex ${filePaths.length} documents successfully.`);
		} catch (error) {
			console.error("Error inserting documents:", error);
			new Notice(`Failed to insert documents. ${error.message}`);
		}
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

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
		await this.initializeChatModel();
	}
}

const VIEW_TYPE_CHAT = "rag-chat-react";

export class ChatView extends ItemView {
	private root?: ReactDOM.Root;

	constructor(
		leaf: WorkspaceLeaf,
		private readonly serviceManager: ServiceManager
	) {
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
		this.resetSearchService();
	}

	async resetSearchService() {
		const searchService = this.serviceManager.getService("search");
		this.root?.render(
			React.createElement(ChatApp, { chat: searchService })
		);
	}

	async onClose() {
		this.root?.unmount();
	}
}

class RAGSearchSettingsTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "RAG Search Settings" });

		containerEl.createEl("h3", { text: "API Keys" });

		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("API key for OpenAI services")
			.addText((text) =>
				text
					.setPlaceholder("Enter your OpenAI API key")
					.setValue(this.plugin.settings.openaiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openaiApiKey = value;
						await this.plugin.saveSettings();
					})
					.inputEl.setAttribute("type", "password")
			);

		new Setting(containerEl)
			.setName("Google API Key")
			.setDesc("API key for Google/Gemini services")
			.addText((text) =>
				text
					.setPlaceholder("Enter your Google API key")
					.setValue(this.plugin.settings.googleApiKey)
					.onChange(async (value) => {
						this.plugin.settings.googleApiKey = value;
						await this.plugin.saveSettings();
					})
					.inputEl.setAttribute("type", "password")
			);

		new Setting(containerEl)
			.setName("Anthropic API Key")
			.setDesc("API key for Anthropic services")
			.addText((text) =>
				text
					.setPlaceholder("Enter your Anthropic API key")
					.setValue(this.plugin.settings.anthropicApiKey)
					.onChange(async (value) => {
						this.plugin.settings.anthropicApiKey = value;
						await this.plugin.saveSettings();
					})
					.inputEl.setAttribute("type", "password")
			);

		new Setting(containerEl)
			.setName("Google Project ID for Vertex AI")
			.setDesc("Project ID for Google services")
			.addText((text) =>
				text
					.setPlaceholder("Enter your Google Project ID")
					.setValue(this.plugin.settings.googleProjectId)
					.onChange(async (value) => {
						this.plugin.settings.googleProjectId = value;
					})
			)
			.addExtraButton((btn) => {
				btn.setIcon("refresh-cw");
				btn.setTooltip("Refresh");
				if (!this.plugin.settings.googleProjectId) {
					btn.setDisabled(true);
				}
				btn.onClick(async () => {
					const projectId = this.plugin.settings.googleProjectId;
					if (projectId) {
						this.plugin.settings.googleProjectId = projectId;
						await this.plugin.saveSettings();
					}
				});
			});

		containerEl.createEl("h3", { text: "Chat Model Settings" });

		new Setting(containerEl)
			.setName("Chat Model Provider")
			.setDesc("Select the provider for chat model")
			.addDropdown((dropdown) => {
				Object.values(ChatModelProviders).forEach((provider) => {
					dropdown.addOption(provider, provider);
				});
				dropdown
					.setValue(this.plugin.settings.chatModelProvider)
					.onChange(async (value: ChatModelProviders) => {
						this.plugin.settings.chatModelProvider = value;
					});
			})
			.addExtraButton((btn) => {
				btn.setIcon("refresh-cw");
				btn.setTooltip("Apply changes");
				btn.onClick(async () => {
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Chat Model Name")
			.setDesc("Enter the model name (e.g., gpt-4o, claude-3-opus)")
			.addText((text) =>
				text
					.setPlaceholder("Enter model name")
					.setValue(this.plugin.settings.chatModelName)
					.onChange(async (value) => {
						this.plugin.settings.chatModelName = value;
					})
			)
			.addExtraButton((btn) => {
				btn.setIcon("refresh-cw");
				btn.setTooltip("Refresh");
				if (!this.plugin.settings.chatModelName) {
					btn.setDisabled(true);
				}
				btn.onClick(async () => {
					const modelName = this.plugin.settings.chatModelName;
					if (modelName) {
						this.plugin.settings.chatModelName = modelName;
						await this.plugin.saveSettings();
					}
				});
			});

		containerEl.createEl("h3", { text: "Embedding Model Settings" });

		new Setting(containerEl)
			.setName("Embedding Model Provider")
			.setDesc("Select the provider for embedding model")
			.addDropdown((dropdown) => {
				Object.values(EmbeddingModelProviders).forEach((provider) => {
					dropdown.addOption(provider, provider);
				});
				dropdown
					.setValue(this.plugin.settings.embeddingModelProvider)
					.onChange(async (value: EmbeddingModelProviders) => {
						this.plugin.settings.embeddingModelProvider = value;
					});
			})
			.addExtraButton((btn) => {
				btn.setIcon("refresh-cw");
				btn.setTooltip("Apply changes");
				btn.onClick(async () => {
					await this.plugin.saveSettings();
				});
			});

		new Setting(containerEl)
			.setName("Embedding Model")
			.setDesc("Select the embedding model to use")
			.addDropdown((dropdown) => {
				this.plugin.settings.availableEmbeddingModels.forEach(
					(model) => {
						dropdown.addOption(
							model.name,
							`${model.name} (${model.provider})`
						);
					}
				);

				dropdown
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value;
					});
			})
			.addExtraButton((btn) => {
				btn.setIcon("refresh-cw");
				btn.setTooltip("Apply changes");
				btn.onClick(async () => {
					await this.plugin.saveSettings();
				});
			});
	}
}
