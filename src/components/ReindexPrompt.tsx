import React, { useState } from "react";
import { Box, Typography, Button, CircularProgress } from "@mui/material";

interface ReindexPromptProps {
	onReindex: () => Promise<void>;
}

export const ReindexPrompt: React.FC<ReindexPromptProps> = ({ onReindex }) => {
	const [loading, setLoading] = useState(false);

	const handleClick = async () => {
		setLoading(true);
		await onReindex();
		setLoading(false);
	};

	return (
		<Box
			display="flex"
			flexDirection="column"
			alignItems="center"
			justifyContent="center"
			height="100%"
			p={4}
		>
			<Typography variant="h6" gutterBottom>
				To enable the RAG function, please reindex the data.
			</Typography>
			<Button
				variant="contained"
				color="primary"
				onClick={handleClick}
				disabled={loading}
				startIcon={loading ? <CircularProgress size={20} /> : null}
			>
				{loading ? "reindexing..." : "reindex"}
			</Button>
		</Box>
	);
};
