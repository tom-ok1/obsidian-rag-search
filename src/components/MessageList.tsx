import React, { FC, memo } from "react";
import { Stack } from "@mui/material";
import { AnimatePresence } from "framer-motion";
import { ChatContent } from "../types/messages.js";
import { MessageBubble } from "./MessageBubble.js";
import { useAutoScroll } from "../hooks/useAutoScroll.js";

interface MessageListProps {
	messages: ChatContent[];
}

export const MessageList: FC<MessageListProps> = memo(({ messages }) => {
	const bottomRef = useAutoScroll([messages.length]);

	return (
		<Stack flex={1} overflow="auto" px={2} py={3} spacing={2}>
			<AnimatePresence initial={false}>
				{messages.map((msg) => (
					<MessageBubble key={msg.id} msg={msg} />
				))}
			</AnimatePresence>
			<div ref={bottomRef} />
		</Stack>
	);
});
