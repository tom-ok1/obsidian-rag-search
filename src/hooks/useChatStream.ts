import { useState } from "react";
import type { RagService } from "../search/ragService.js";
import { ChatContent } from "../types/messages.js";
import { MessageContent } from "@langchain/core/messages";

export type { ChatContent as Msg };

export function useChatStream(chatService: RagService) {
	const [messages, setMessages] = useState<ChatContent[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const ask = async (question: string) => {
		if (!question.trim()) return;

		setError(null);
		setIsLoading(true);

		// Create user message with timestamp as id
		const userMsg: ChatContent = {
			id: Date.now().toString(),
			role: "user",
			content: question,
			createdAt: Date.now(),
		};

		// Create initial assistant message (will be streamed)
		const assistantMsg: ChatContent = {
			id: (Date.now() + 1).toString(),
			role: "assistant",
			content: "",
			createdAt: Date.now(),
			loading: true,
		};

		// Add both messages
		setMessages((prev) => [...prev, userMsg, assistantMsg]);

		try {
			const {
				answer: { stream },
			} = await chatService.search(question);

			for await (const chunk of stream) {
				const { content } = chunk;

				setMessages((prev) => {
					const newMessages = [...prev];
					const assistantMsgIndex = newMessages.length - 1;
					newMessages[assistantMsgIndex] = {
						...newMessages[assistantMsgIndex],
						content:
							newMessages[assistantMsgIndex].content +
							formatChatContent(content),
					};

					return newMessages;
				});
			}

			// Mark streaming as complete
			setMessages((prev) => {
				const newMessages = [...prev];
				const assistantMsgIndex = newMessages.length - 1;

				newMessages[assistantMsgIndex] = {
					...newMessages[assistantMsgIndex],
					loading: false,
				};
				return newMessages;
			});
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to get response"
			);

			setMessages((prev) => {
				const newMessages = [...prev];
				const assistantMsgIndex = newMessages.length - 1;

				newMessages[assistantMsgIndex] = {
					...newMessages[assistantMsgIndex],
					loading: false,
					error:
						err instanceof Error
							? err.message
							: "An error occurred",
				};

				return newMessages;
			});
		} finally {
			setIsLoading(false);
		}
	};

	return { messages, isLoading, ask, error };
}

function formatChatContent(content: MessageContent) {
	if (!Array.isArray(content)) return content;

	return content
		.map((c) => {
			if (typeof c === "string") {
				return c;
			} else if (c.type === "text") {
				return c.text;
			} else {
				return "";
			}
		})
		.join("");
}
