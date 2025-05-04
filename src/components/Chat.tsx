import React, { useState, useRef, useEffect, FormEvent } from "react";
import {
	Box,
	Stack,
	Paper,
	TextField,
	IconButton,
	CircularProgress,
	Skeleton,
	useTheme,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import { motion, AnimatePresence } from "framer-motion";
import type { ChatService } from "../search/chatService.js";
import { Msg, useChatStream } from "src/hooks/useChatStream.js";

const MessageBubble: React.FC<{ message: Msg }> = ({ message }) => {
	const theme = useTheme();
	const isUser = message.role === "user";
	const bg = isUser
		? theme.palette.primary.main
		: "var(--background-primary)";
	const color = isUser
		? theme.palette.getContrastText(theme.palette.primary.main)
		: "var(--text-normal)";
	const showSkeleton = message.loading && message.content === "";

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
		>
			<Paper
				elevation={1}
				sx={{
					maxWidth: 640,
					px: 2,
					py: 1.5,
					alignSelf: isUser ? "flex-end" : "flex-start",
					bgcolor: bg,
					color,
					whiteSpace: "pre-wrap",
					backgroundImage: "none",
				}}
			>
				{showSkeleton ? (
					<Stack spacing={0.5}>
						{[...Array(2)].map((_, i) => (
							<Skeleton
								key={i}
								variant="text"
								width={`${60 + Math.random() * 30}%`}
								sx={{
									bgcolor: "var(--background-modifier-hover)",
								}}
							/>
						))}
					</Stack>
				) : (
					message.content
				)}
			</Paper>
		</motion.div>
	);
};

const MessageList: React.FC<{ messages: Msg[] }> = ({ messages }) => {
	const bottomRef = useRef<HTMLDivElement>(null);
	useEffect(
		() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
		[messages]
	);
	return (
		<Stack flex={1} overflow="auto" px={2} py={3} spacing={2}>
			<AnimatePresence initial={false}>
				{messages.map((m, i) => (
					<MessageBubble key={i} message={m} />
				))}
			</AnimatePresence>
			<div ref={bottomRef} />
		</Stack>
	);
};

export const ChatApp: React.FC<{ chat: ChatService }> = ({ chat }) => {
	const { messages, isLoading, ask } = useChatStream(chat);
	const [input, setInput] = useState("");

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		ask(input);
		setInput("");
	};

	return (
		<Box
			display="flex"
			flexDirection="column"
			height="100%"
			bgcolor="transparent"
		>
			<MessageList messages={messages} />
			<Box
				component="form"
				onSubmit={handleSubmit}
				display="flex"
				alignItems="center"
				gap={1.5}
				p={2}
				borderTop={1}
				borderColor="var(--background-modifier-border)"
				bgcolor="transparent"
			>
				<TextField
					fullWidth
					size="small"
					placeholder="Ask me anything…"
					variant="outlined"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					slotProps={{
						input: {
							sx: { bgcolor: "var(--background-secondary)" },
						},
					}}
				/>
				<IconButton
					type="submit"
					color="primary"
					disabled={isLoading || input.trim() === ""}
					sx={{ width: 40, height: 40 }}
				>
					{isLoading ? <CircularProgress size={20} /> : <SendIcon />}
				</IconButton>
			</Box>
		</Box>
	);
};
