import React from "react";
import { Stack, Divider, Snackbar } from "@mui/material";
import type { RagService } from "../search/ragService.js";
import { useChatStream } from "src/hooks/useChatStream.js";
import { MessageList } from "./MessageList.js";
import { ChatInput } from "./ChatInput.js";

export const ChatApp: React.FC<{ chat: RagService }> = ({ chat }) => {
	const { messages, isLoading, ask, error } = useChatStream(chat);

	return (
		<Stack height="100%" bgcolor="transparent">
			<MessageList messages={messages} />
			<Divider />
			<ChatInput onSend={ask} loading={isLoading} />
		</Stack>
	);
};
