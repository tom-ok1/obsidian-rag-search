import { IChatHistory } from "../modules.js";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export class ChatHistory implements IChatHistory {
	private messages: ChatMessage[] = [];

	addMessage(message: ChatMessage): ChatMessage {
		this.messages.push(message);
		return message;
	}

	getMessages(): ChatMessage[] {
		return [...this.messages];
	}

	formatHistoryText(): string {
		if (this.messages.length === 0) {
			return "";
		}

		return this.messages
			.map((msg) => `${msg.role}: ${msg.content}`)
			.join("\n");
	}

	clear(): void {
		this.messages = [];
	}
}
