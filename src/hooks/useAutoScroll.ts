import { useRef, useEffect, useCallback } from "react";

const THRESHOLD = 32; // px

export const useAutoScroll = (dep: unknown) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const bottomRef = useRef<HTMLDivElement>(null);

	const isPinnedBottom = useCallback(() => {
		const el = containerRef.current;
		if (!el) return false;
		const { scrollTop, clientHeight, scrollHeight } = el;
		return scrollHeight - (scrollTop + clientHeight) < THRESHOLD;
	}, []);

	useEffect(() => {
		if (isPinnedBottom()) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [dep, isPinnedBottom]);

	return { containerRef, bottomRef };
};
