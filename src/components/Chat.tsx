import React from "react";
import { Stack, Divider, Snackbar } from "@mui/material";
import type { ChatService } from "../search/chatService.js";
import { useChatStream } from "src/hooks/useChatStream.js";
import { MessageList } from "./MessageList.js";
import { ChatInput } from "./ChatInput.js";

export const ChatApp: React.FC<{ chat: ChatService }> = ({ chat }) => {
	const { messages, isLoading, ask, error } = useChatStream(chat);

	return (
		<Stack height="100%" bgcolor="transparent">
			<MessageList messages={messages} />
			<Divider />
			<ChatInput onSend={ask} loading={isLoading} />
			<Snackbar
				open={!!error}
				message={error}
				anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
				autoHideDuration={6000}
			/>
		</Stack>
	);
};
