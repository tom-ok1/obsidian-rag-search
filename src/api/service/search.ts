import { ISearchService } from "src/api/modules.js";
import { createChatGraph } from "../infrastructure/chatGraph.js";
import { ChatHistory } from "./chatHistory.js";

type ChatGraph = ReturnType<typeof createChatGraph>;

export class SearchService implements ISearchService {
	constructor(
		private readonly chatGraph: ChatGraph,
		private readonly chatHistory: ChatHistory
	) {}

	async search(question: string) {
		const res = await this.chatGraph.invoke({
			question,
			history: this.chatHistory.formatHistoryText(),
		});

		this.chatHistory.addMessage({
			role: "user",
			content: question,
		});

		return { answer: res.answer.stream, docs: res.context };
	}
}
