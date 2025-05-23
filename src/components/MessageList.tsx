import { FC, memo } from "react";
import { Stack } from "@mui/material";
import { AnimatePresence } from "framer-motion";
import { ChatContent } from "../types/messages.js";
import { MessageBubbleUser, MessageBubbleAssistant } from "./MessageBubble.js";
import { useAutoScroll } from "../hooks/useAutoScroll.js";

interface MessageListProps {
	messages: ChatContent[];
}

export const MessageList: FC<MessageListProps> = memo(({ messages }) => {
	const { containerRef, bottomRef } = useAutoScroll(messages.length);

	return (
		<Stack
			ref={containerRef}
			flex={1}
			overflow="auto"
			px={2}
			py={3}
			spacing={2}
		>
			<AnimatePresence initial={false}>
				{messages.map((msg) =>
					msg.role === "user" ? (
						<MessageBubbleUser key={msg.id} msg={msg} />
					) : (
						<MessageBubbleAssistant key={msg.id} msg={msg} />
					)
				)}
			</AnimatePresence>
			<div ref={bottomRef} />
		</Stack>
	);
});
