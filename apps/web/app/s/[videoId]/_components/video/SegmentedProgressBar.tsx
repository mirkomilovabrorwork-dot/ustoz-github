"use client";

import {
	MediaActionTypes,
	useMediaDispatch,
} from "media-chrome/react/media-store";
import * as React from "react";

interface Chapter {
	startSec: number;
	title: string;
}

interface Props {
	chapters: Chapter[];
	duration: number;
	videoRef: React.RefObject<HTMLVideoElement | null>;
	fallbackDuration?: number | null;
}

function formatMmSs(sec: number): string {
	const m = Math.floor(sec / 60);
	const s = Math.floor(sec % 60);
	return `${m}:${s.toString().padStart(2, "0")}`;
}

interface TooltipState {
	visible: boolean;
	x: number;
	label: string;
}

export function SegmentedProgressBar({
	chapters,
	duration,
	videoRef,
	fallbackDuration,
}: Props) {
	const dispatch = useMediaDispatch();
	const barRef = React.useRef<HTMLDivElement>(null);
	const dotRef = React.useRef<HTMLDivElement>(null);
	const fillRefsRef = React.useRef<(HTMLDivElement | null)[]>([]);
	const rafRef = React.useRef<number | null>(null);
	const isDraggingRef = React.useRef(false);

	const [tooltip, setTooltip] = React.useState<TooltipState>({
		visible: false,
		x: 0,
		label: "",
	});

	const effectiveDuration = duration > 0 ? duration : (fallbackDuration ?? 0);

	const normalizedChapters: Chapter[] = React.useMemo(() => {
		if (chapters.length === 0 || effectiveDuration <= 0) return [];
		return [...chapters].sort((a, b) => a.startSec - b.startSec);
	}, [chapters, effectiveDuration]);

	const segments = React.useMemo(() => {
		if (effectiveDuration <= 0)
			return [{ startSec: 0, endSec: 0, title: "", flex: 1 }];

		if (normalizedChapters.length === 0) {
			return [{ startSec: 0, endSec: effectiveDuration, title: "", flex: 1 }];
		}

		return normalizedChapters.map((ch, i) => {
			const endSec =
				i + 1 < normalizedChapters.length
					? (normalizedChapters[i + 1]?.startSec ?? effectiveDuration)
					: effectiveDuration;
			return {
				startSec: ch.startSec,
				endSec,
				title: ch.title,
				flex: Math.max(endSec - ch.startSec, 0.001),
			};
		});
	}, [normalizedChapters, effectiveDuration]);

	const seekToTime = React.useCallback(
		(time: number) => {
			const clamped = Math.max(0, Math.min(time, effectiveDuration));
			dispatch({
				type: MediaActionTypes.MEDIA_SEEK_REQUEST,
				detail: clamped,
			});
			if (videoRef.current) {
				videoRef.current.currentTime = clamped;
			}
		},
		[dispatch, effectiveDuration, videoRef],
	);

	const getTimeFromPointer = React.useCallback(
		(clientX: number): number => {
			const bar = barRef.current;
			if (!bar || effectiveDuration <= 0) return 0;
			const rect = bar.getBoundingClientRect();
			const ratio = Math.max(
				0,
				Math.min((clientX - rect.left) / rect.width, 1),
			);
			return ratio * effectiveDuration;
		},
		[effectiveDuration],
	);

	const getTooltipLabel = React.useCallback(
		(time: number): string => {
			const mmss = formatMmSs(time);
			if (normalizedChapters.length === 0) return mmss;
			let active = normalizedChapters[0];
			for (const ch of normalizedChapters) {
				if (time >= ch.startSec) active = ch;
				else break;
			}
			return active?.title ? `${mmss} — ${active.title}` : mmss;
		},
		[normalizedChapters],
	);

	React.useEffect(() => {
		const loop = () => {
			const video = videoRef.current;
			const dot = dotRef.current;
			if (!video || !dot || effectiveDuration <= 0) {
				rafRef.current = requestAnimationFrame(loop);
				return;
			}

			const t = isDraggingRef.current ? video.currentTime : video.currentTime;
			const progress = t / effectiveDuration;

			dot.style.left = `calc(${progress * 100}% - 6px)`;

			const fills = fillRefsRef.current;
			for (let i = 0; i < segments.length; i++) {
				const fill = fills[i];
				if (!fill) continue;
				const seg = segments[i];
				if (!seg) continue;
				let pct: number;
				if (t <= seg.startSec) {
					pct = 0;
				} else if (t >= seg.endSec) {
					pct = 100;
				} else {
					pct = ((t - seg.startSec) / (seg.endSec - seg.startSec)) * 100;
				}
				fill.style.width = `${pct}%`;
			}

			rafRef.current = requestAnimationFrame(loop);
		};

		rafRef.current = requestAnimationFrame(loop);

		return () => {
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		};
	}, [effectiveDuration, segments, videoRef]);

	const onPointerMove = React.useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			const time = getTimeFromPointer(e.clientX);
			const bar = barRef.current;
			if (!bar) return;
			const rect = bar.getBoundingClientRect();
			const localX = e.clientX - rect.left;
			setTooltip({ visible: true, x: localX, label: getTooltipLabel(time) });

			if (isDraggingRef.current) {
				seekToTime(time);
			}
		},
		[getTimeFromPointer, getTooltipLabel, seekToTime],
	);

	const onPointerLeave = React.useCallback(() => {
		setTooltip((prev) => ({ ...prev, visible: false }));
	}, []);

	const onPointerDown = React.useCallback(
		(e: React.PointerEvent<HTMLDivElement>) => {
			e.currentTarget.setPointerCapture(e.pointerId);
			isDraggingRef.current = true;
			seekToTime(getTimeFromPointer(e.clientX));
		},
		[getTimeFromPointer, seekToTime],
	);

	const onPointerUp = React.useCallback(() => {
		isDraggingRef.current = false;
	}, []);

	return (
		<div
			ref={barRef}
			className="relative w-full cursor-pointer select-none"
			style={{ height: "20px", display: "flex", alignItems: "center" }}
			onPointerMove={onPointerMove}
			onPointerLeave={onPointerLeave}
			onPointerDown={onPointerDown}
			onPointerUp={onPointerUp}
		>
			<div className="flex w-full gap-[2px]" style={{ height: "4px" }}>
				{segments.map((seg, i) => (
					<div
						key={seg.startSec}
						className="relative rounded-full overflow-hidden bg-white/40"
						style={{ flex: seg.flex }}
					>
						<div
							ref={(el) => {
								fillRefsRef.current[i] = el;
							}}
							className="absolute inset-y-0 left-0 bg-white will-change-[width]"
							style={{ width: "0%" }}
						/>
					</div>
				))}
			</div>

			<div
				ref={dotRef}
				className="absolute top-1/2 size-3 rounded-full bg-white shadow pointer-events-none will-change-[left]"
				style={{
					left: "calc(0% - 6px)",
					transform: "translateY(-50%)",
				}}
			/>

			{tooltip.visible && (
				<div
					className="pointer-events-none absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900/90 px-2 py-0.5 text-xs text-white z-50"
					style={{ left: tooltip.x }}
				>
					{tooltip.label}
				</div>
			)}
		</div>
	);
}
