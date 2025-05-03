import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Send } from "lucide-react";
import type { RagManager } from "../search/chat.js";

type Msg = { role: "user" | "bot"; content: string; loading?: boolean };

export const ChatApp: React.FC<{ chat: RagManager }> = ({ chat }) => {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Msg[]>([]);
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(
		() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
		[messages]
	);

	const appendBotBubble = (initial = "") =>
		setMessages((p) => [
			...p,
			{ role: "bot", content: initial, loading: true },
		]);

	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim()) return;
		const question = input.trim();
		setInput("");
		setMessages((p) => [...p, { role: "user", content: question }]);
		appendBotBubble();

		try {
			const {
				answer: { stream },
			} = await chat.search(question);
			const reader = stream.getReader();
			let buf = "";

			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buf += value.content;
				setMessages((p) =>
					p.map((m, i) =>
						i === p.length - 1 && m.role === "bot"
							? { ...m, content: buf }
							: m
					)
				);
			}

			setMessages((p) =>
				p.map((m, i) =>
					i === p.length - 1 && m.role === "bot"
						? { ...m, loading: false }
						: m
				)
			);
		} catch (err) {
			appendBotBubble(`Error: ${String(err)}`);
		}
	};

	return (
		<div className="flex flex-col h-full bg-surface text-text font-sans">
			<div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
				<AnimatePresence initial={false}>
					{messages.map((m, i) => (
						<motion.div
							key={i}
							initial={{ opacity: 0, y: 10 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
							className={`max-w-2xl whitespace-pre-wrap shadow
                ${
					m.role === "user"
						? "self-end bg-primary/25 text-text rounded-xl px-4 py-2"
						: "self-start bg-surfaceAlt border border-surface rounded-xl px-4 py-2"
				}`}
						>
							{m.content}
							{m.loading && (
								<span className="inline-flex ml-1 animate-pulse">
									...
								</span>
							)}
						</motion.div>
					))}
				</AnimatePresence>
				<div ref={bottomRef} />
			</div>

			<form
				onSubmit={submit}
				className="border-t border-surface flex items-center gap-3 p-4 bg-surface/80 backdrop-blur"
			>
				<input
					className="flex-1 bg-transparent border border-surface rounded-lg px-3 py-2 outline-none focus:border-primary"
					placeholder="Ask me anything…"
					value={input}
					onChange={(e) => setInput(e.target.value)}
				/>
				<button
					type="submit"
					disabled={!input.trim()}
					className="grid place-items-center rounded-lg bg-primary text-white w-10 h-10 disabled:opacity-40"
				>
					{messages.at(-1)?.loading ? (
						<Loader2 className="animate-spin w-5 h-5" />
					) : (
						<Send className="w-5 h-5" />
					)}
				</button>
			</form>
		</div>
	);
};
