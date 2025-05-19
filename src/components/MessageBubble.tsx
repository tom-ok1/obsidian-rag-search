import React from "react";
import { Paper, Stack, Skeleton, Typography } from "@mui/material";
import { CopyTooltip } from "./CopyTooltip.js";
import { motion } from "framer-motion";
import { ChatContent } from "../types/messages.js";

interface MessageBubbleUserProps {
	msg: ChatContent;
	style?: React.CSSProperties;
}

export const MessageBubbleUser: React.FC<MessageBubbleUserProps> = ({
	msg,
	style,
}) => {
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			style={style}
		>
			<Paper
				elevation={0}
				sx={{
					position: "relative",
					maxWidth: 640,
					px: 2,
					py: 1.5,
					alignSelf: "flex-end",
					bgcolor: "var(--background-primary)",
					color: "var(--text-normal)",
					whiteSpace: "pre-wrap",
					backgroundImage: "none",
					userSelect: "text",
				}}
			>
				{msg.content}
				{msg.error && (
					<Typography
						variant="caption"
						color="error"
						sx={{ display: "block", mt: 1 }}
					>
						{msg.error}
					</Typography>
				)}
			</Paper>
		</motion.div>
	);
};

interface MessageBubbleAssistantProps {
	msg: ChatContent;
	style?: React.CSSProperties;
}

export const MessageBubbleAssistant: React.FC<MessageBubbleAssistantProps> = ({
	msg,
	style,
}) => {
	const showSkeleton = msg.loading && msg.content === "";
	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			style={style}
		>
			<Paper
				elevation={0}
				sx={{
					position: "relative",
					maxWidth: 640,
					px: 2,
					py: 1.5,
					alignSelf: "flex-start",
					bgcolor: "transparent",
					color: "var(--text-normal)",
					whiteSpace: "pre-wrap",
					backgroundImage: "none",
					userSelect: "text",
				}}
			>
				{!showSkeleton && <CopyTooltip content={msg.content} />}
				{showSkeleton ? (
					<Stack spacing={0.5}>
						{[70, 85].map((w, i) => (
							<Skeleton
								key={i}
								variant="text"
								width={`${w}%`}
								sx={{
									bgcolor: "var(--background-modifier-hover)",
								}}
							/>
						))}
					</Stack>
				) : (
					msg.content
				)}
				{msg.error && (
					<Typography
						variant="caption"
						color="error"
						sx={{ display: "block", mt: 1 }}
					>
						{msg.error}
					</Typography>
				)}
			</Paper>
		</motion.div>
	);
};
