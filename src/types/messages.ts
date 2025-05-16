import { ChatMessage } from "src/api/infrastructure/chatGraph.js";

export type ChatContent = ChatMessage & {
	id: string;
	createdAt: number;
	loading?: boolean;
	error?: string;
};
