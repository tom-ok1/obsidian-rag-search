import React from "react";
import { Stack, Divider, Box, IconButton } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useChatStream } from "src/hooks/useChatStream.js";
import { MessageList } from "./MessageList.js";
import { ChatInput } from "./ChatInput.js";

export const ChatApp: React.FC = () => {
	const { messages, isLoading, ask, resetChat } = useChatStream();

	return (
		<Stack height="100%" bgcolor="transparent">
			<Box
				display="flex"
				alignItems="center"
				justifyContent="space-between"
				px={1}
				pt={1}
			>
				<Box />
				<IconButton
					aria-label="新しい会話"
					onClick={resetChat}
					size="small"
				>
					<AddIcon />
				</IconButton>
			</Box>
			<MessageList messages={messages} />
			<Divider />
			<ChatInput onSend={ask} loading={isLoading} />
		</Stack>
	);
};
