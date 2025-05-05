import React from "react";
import { Paper, Stack, Skeleton, Typography, useTheme } from "@mui/material";
import { motion } from "framer-motion";
import { ChatContent } from "../types/messages.js";

interface MessageBubbleProps {
	msg: ChatContent;
	style?: React.CSSProperties;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ msg, style }) => {
	const theme = useTheme();
	const isUser = msg.role === "user";
	const bg = isUser ? theme.palette.primary.main : "var(--backgound-primary)";
	const color = isUser
		? theme.palette.getContrastText(theme.palette.primary.main)
		: "var(--text-normal)";
	const showSkeleton = msg.loading && msg.content === "";

	const skeletonWidths = [70, 85];

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
						{skeletonWidths.map((width, i) => (
							<Skeleton
								key={i}
								variant="text"
								width={`${width}%`}
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
