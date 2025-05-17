import { ChatMessage } from "src/api/service/chatHistory.js";

export type ChatContent = ChatMessage & {
	id: string;
	createdAt: number;
	loading?: boolean;
	error?: string;
};
