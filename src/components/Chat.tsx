import React from "react";
import { Stack, Divider } from "@mui/material";
import { useChatStream } from "src/hooks/useChatStream.js";
import { MessageList } from "./MessageList.js";
import { ChatInput } from "./ChatInput.js";

export const ChatApp: React.FC = () => {
	const { messages, isLoading, ask } = useChatStream();

	return (
		<Stack height="100%" bgcolor="transparent">
			<MessageList messages={messages} />
			<Divider />
			<ChatInput onSend={ask} loading={isLoading} />
		</Stack>
	);
};
