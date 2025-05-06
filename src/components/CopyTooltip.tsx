import React, { useState } from "react";
import { Tooltip, IconButton } from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";

interface CopyTooltipProps {
	content: string;
}

export const CopyTooltip: React.FC<CopyTooltipProps> = ({ content }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = async () => {
		await navigator.clipboard.writeText(content);
		setCopied(true);
		setTimeout(() => setCopied(false), 1500);
	};

	return (
		<Tooltip
			title={copied ? "Copied!" : "Copy"}
			arrow
			placement="top"
			disableInteractive
		>
			<IconButton
				size="small"
				onClick={handleCopy}
				sx={{
					position: "absolute",
					top: 4,
					right: 4,
					opacity: 0,
					transition: "opacity 0.2s",
					":hover": { bgcolor: "transparent" },
					".MuiPaper-root:hover &": { opacity: 1 },
				}}
			>
				<ContentCopyIcon fontSize="inherit" />
			</IconButton>
		</Tooltip>
	);
};
