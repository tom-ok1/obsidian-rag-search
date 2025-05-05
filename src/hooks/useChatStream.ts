import { useState, useCallback } from "react";
import { ChatService } from "src/search/chatService.js";
import { ChatMsg } from "src/search/createChatGraph.js";

export type Msg = ChatMsg & {
	loading?: boolean;
};

export function useChatStream(chat: ChatService) {
	const [messages, setMessages] = useState<Msg[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	const ask = useCallback(
		async (question: string) => {
			const trimmed = question.trim();
			if (!trimmed || isLoading) return;

			setMessages((prev) => [
				...prev,
				{ role: "user", content: trimmed },
			]);
			// Add assistant bubble
			setMessages((prev) => [
				...prev,
				{ role: "assistant", content: "", loading: true },
			]);
			setIsLoading(true);

			try {
				const {
					answer: { stream },
				} = await chat.search(trimmed);
				const reader = stream.getReader();
				let buf = "";
				let firstChunk = true;

				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						await chat.addChatHistory({
							role: "assistant",
							content: buf,
						});
						break;
					}

					buf += extractText(value?.content ?? value);
					setMessages((prev) =>
						prev.map((m, i) =>
							i === prev.length - 1 && m.role === "assistant"
								? {
										...m,
										content: buf,
										loading: firstChunk ? false : m.loading,
								  }
								: m
						)
					);
					firstChunk = false;
				}
			} catch (err) {
				console.error("Chat error", err);
				setMessages((prev) => [
					...prev.slice(0, -1),
					{
						role: "assistant",
						content: "⚠️ Something went wrong. Please try again.",
						loading: false,
					},
				]);
			} finally {
				setIsLoading(false);
			}
		},
		[chat, isLoading]
	);

	return { messages, isLoading, ask };
}

function extractText(node: any): string {
	if (node == null) return "";
	if (typeof node === "string") return node;
	if (Array.isArray(node)) return node.map(extractText).join("");
	if (typeof node === "object") {
		if ("text" in node) return extractText(node.text);
		if ("content" in node) return extractText(node.content);
		return Object.values(node as Record<string, unknown>)
			.map(extractText)
			.join("");
	}
	return String(node);
}
