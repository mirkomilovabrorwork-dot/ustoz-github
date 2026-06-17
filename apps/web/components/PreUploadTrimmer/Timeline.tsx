"use client";

import { useCallback, useEffect, useRef } from "react";

type Props = {
	duration: number;
	inSec: number;
	outSec: number;
	currentSec: number;
	onInChange: (s: number) => void;
	onOutChange: (s: number) => void;
	onSeek: (s: number) => void;
};

function fmt(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${String(s).padStart(2, "0")}`;
}

export function Timeline({
	duration,
	inSec,
	outSec,
	currentSec,
	onInChange,
	onOutChange,
	onSeek,
}: Props) {
	const trackRef = useRef<HTMLDivElement>(null);
	const draggingRef = useRef<null | "in" | "out" | "playhead">(null);

	const pct = (s: number) => (duration > 0 ? (s / duration) * 100 : 0);

	const onPointerMove = useCallback(
		(e: PointerEvent) => {
			if (!draggingRef.current || !trackRef.current) return;
			const rect = trackRef.current.getBoundingClientRect();
			const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
			const sec = (x / rect.width) * duration;
			if (draggingRef.current === "in") onInChange(Math.min(sec, outSec - 0.5));
			else if (draggingRef.current === "out")
				onOutChange(Math.max(sec, inSec + 0.5));
			else if (draggingRef.current === "playhead")
				onSeek(Math.max(inSec, Math.min(outSec, sec)));
		},
		[duration, inSec, outSec, onInChange, onOutChange, onSeek],
	);

	useEffect(() => {
		const up = () => {
			draggingRef.current = null;
		};
		window.addEventListener("pointermove", onPointerMove);
		window.addEventListener("pointerup", up);
		return () => {
			window.removeEventListener("pointermove", onPointerMove);
			window.removeEventListener("pointerup", up);
		};
	}, [onPointerMove]);

	const start =
		(which: "in" | "out" | "playhead") => (e: React.PointerEvent) => {
			e.preventDefault();
			draggingRef.current = which;
		};

	return (
		<div className="w-full select-none">
			<div className="flex justify-between text-xs text-gray-10 mb-2">
				<span>In: {fmt(inSec)}</span>
				<span>
					{fmt(currentSec)} / {fmt(duration)}
				</span>
				<span>Out: {fmt(outSec)}</span>
			</div>
			<div
				ref={trackRef}
				className="relative h-10 bg-gray-3 rounded-md cursor-pointer"
				onPointerDown={(e) => {
					if (!trackRef.current) return;
					const rect = trackRef.current.getBoundingClientRect();
					const x = e.clientX - rect.left;
					const sec = Math.max(
						inSec,
						Math.min(outSec, (x / rect.width) * duration),
					);
					onSeek(sec);
				}}
			>
				<div
					className="absolute top-0 h-full bg-blue-3 rounded"
					style={{
						left: `${pct(inSec)}%`,
						width: `${pct(outSec) - pct(inSec)}%`,
					}}
				/>
				<div
					className="absolute top-0 h-full w-1 bg-red-500"
					style={{ left: `calc(${pct(currentSec)}% - 2px)` }}
					onPointerDown={start("playhead")}
				/>
				<button
					type="button"
					className="absolute top-0 h-full w-2 bg-blue-500 rounded-l cursor-ew-resize"
					style={{ left: `calc(${pct(inSec)}% - 4px)` }}
					onPointerDown={start("in")}
					aria-label="In handle"
				/>
				<button
					type="button"
					className="absolute top-0 h-full w-2 bg-blue-500 rounded-r cursor-ew-resize"
					style={{ left: `calc(${pct(outSec)}% - 4px)` }}
					onPointerDown={start("out")}
					aria-label="Out handle"
				/>
			</div>
		</div>
	);
}
