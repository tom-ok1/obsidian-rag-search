import React, { useState } from "react";
import { RagManager } from "../search/chat";

type Message = { role: "user" | "bot"; content: string };

export const ChatApp: React.FC<{ chat: RagManager }> = ({ chat }) => {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Message[]>([]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim()) return;
		setMessages((prev) => [...prev, { role: "user", content: input }]);
		const question = input;
		setInput("");
		try {
			const {
				answer: { stream },
			} = await chat.search(question);

			const reader = stream.getReader();
			let botText = "";

			setMessages((prev) => [...prev, { role: "bot", content: "" }]);

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				botText += value.content;

				setMessages((prev) =>
					prev.map((msg, i) =>
						i === prev.length - 1 && msg.role === "bot"
							? { role: "bot", content: botText }
							: msg
					)
				);
			}
		} catch (err) {
			setMessages((prev) => [
				...prev,
				{ role: "bot", content: `Error: ${String(err)}` },
			]);
		}
	};

	return (
		<div className="rc-container">
			<div className="rc-messages">
				{messages.map((msg, i) => (
					<div key={i} className={`rc-${msg.role}`}>
						{msg.content}
					</div>
				))}
			</div>
			<form className="rc-form" onSubmit={handleSubmit}>
				<input
					className="rc-input"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					placeholder="質問を入力…"
				/>
			</form>
		</div>
	);
};
