import { ChatMessage } from "src/search/createChatGraph.js";

export type ChatContent = ChatMessage & {
	id: string;
	createdAt: number;
	loading?: boolean;
	error?: string;
};
