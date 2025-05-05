import React, { useState, FormEvent, FC } from "react";
import {
	Paper,
	InputBase,
	IconButton,
	CircularProgress,
	Box,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";

interface ChatInputProps {
	onSend: (q: string) => void;
	loading: boolean;
}

export const ChatInput: FC<ChatInputProps> = ({ onSend, loading }) => {
	const [value, setValue] = useState("");

	const handleSubmit = (e: FormEvent) => {
		e.preventDefault();
		if (!value.trim()) return;
		onSend(value.trim());
		setValue("");
	};

	return (
		<Box
			component="form"
			onSubmit={handleSubmit}
			sx={{
				display: "flex",
				p: 1.5,
				gap: 1.5,
				borderTop: 1,
				borderColor: (theme) => theme.palette.divider,
				bgcolor: "transparent",
			}}
		>
			<InputBase
				sx={{ ml: 1, flex: 1 }}
				placeholder="Ask me anything…"
				value={value}
				onChange={(e) => setValue(e.target.value)}
				inputProps={{
					"aria-label": "chat input",
				}}
			/>
			<IconButton
				type="submit"
				disabled={loading || value.trim() === ""}
				aria-label="send"
				aria-busy={loading}
				color="primary"
				sx={{ width: 40, height: 40 }}
			>
				{loading ? <CircularProgress size={20} /> : <SendIcon />}
			</IconButton>
		</Box>
	);
};
