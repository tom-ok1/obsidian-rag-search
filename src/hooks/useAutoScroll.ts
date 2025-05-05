import { useRef, useLayoutEffect } from "react";

export const useAutoScroll = (dep: unknown[]) => {
	const ref = useRef<HTMLDivElement>(null);
	useLayoutEffect(() => {
		ref.current?.scrollIntoView({ behavior: "smooth" });
	}, dep);
	return ref;
};
