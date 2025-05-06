import React from "react";
import { Paper, Stack, Skeleton, Typography, useTheme } from "@mui/material";
import { CopyTooltip } from "./CopyTooltip.js";
import { motion } from "framer-motion";
import { ChatContent } from "../types/messages.js";

interface MessageBubbleProps {
	msg: ChatContent;
	style?: React.CSSProperties;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, style }) => {
	const theme = useTheme();
	const isUser = msg.role === "user";

	const bg = isUser
		? theme.palette.primary.main
		: "var(--background-primary)";
	const color = isUser
		? theme.palette.getContrastText(theme.palette.primary.main)
		: "var(--text-normal)";
	const showSkeleton = msg.loading && msg.content === "";

	return (
		<motion.div
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0 }}
			style={style}
		>
			<Paper
				elevation={1}
				sx={{
					position: "relative",
					maxWidth: 640,
					px: 2,
					py: 1.5,
					alignSelf: isUser ? "flex-end" : "flex-start",
					bgcolor: bg,
					color,
					whiteSpace: "pre-wrap",
					backgroundImage: "none",
					userSelect: "text",
				}}
			>
				{!isUser && !showSkeleton && (
					<CopyTooltip content={msg.content} />
				)}

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
