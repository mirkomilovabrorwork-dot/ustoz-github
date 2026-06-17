"use client";

import { Button } from "@cap/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Timeline } from "./Timeline";
import { type TrimMode, useFFmpeg } from "./useFFmpeg";

function fmtBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB"];
	let v = bytes / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

type Props = {
	file: File;
	onConfirm: (trimmedFile: File) => void;
	onCancel: () => void;
};

export function PreUploadTrimmer({ file, onConfirm, onCancel }: Props) {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [duration, setDuration] = useState(0);
	const [currentSec, setCurrentSec] = useState(0);
	const [inSec, setInSec] = useState(0);
	const [outSec, setOutSec] = useState(0);
	const [mode, setMode] = useState<TrimMode>("lossless");
	const [trimming, setTrimming] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const { trim, loading: ffmpegLoading, progress } = useFFmpeg();

	const videoUrl = useMemo(() => URL.createObjectURL(file), [file]);
	useEffect(() => () => URL.revokeObjectURL(videoUrl), [videoUrl]);

	const onLoadedMetadata = () => {
		const v = videoRef.current;
		if (!v) return;
		setDuration(v.duration);
		setOutSec(v.duration);
	};

	const onTimeUpdate = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		const t = v.currentTime;
		setCurrentSec(t);
		if (t >= outSec) {
			v.pause();
			v.currentTime = inSec;
		} else if (t < inSec) {
			v.currentTime = inSec;
		}
	}, [inSec, outSec]);

	const seek = (s: number) => {
		const v = videoRef.current;
		if (!v) return;
		v.currentTime = s;
		setCurrentSec(s);
	};

	const togglePlay = useCallback(() => {
		const v = videoRef.current;
		if (!v) return;
		if (v.paused) v.play().catch(() => {});
		else v.pause();
	}, []);

	const handleConfirm = useCallback(async () => {
		setError(null);
		setTrimming(true);
		try {
			const trimmedFile = await trim(file, inSec, outSec, mode);
			onConfirm(trimmedFile);
		} catch (e) {
			console.error("Trim failed:", e);
			setError(e instanceof Error ? e.message : "Trim failed");
			setTrimming(false);
		}
	}, [trim, file, inSec, outSec, mode, onConfirm]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement) return;
			if (e.key === "i" || e.key === "I")
				setInSec(Math.min(currentSec, outSec - 0.5));
			else if (e.key === "o" || e.key === "O")
				setOutSec(Math.max(currentSec, inSec + 0.5));
			else if (e.key === " ") {
				e.preventDefault();
				togglePlay();
			} else if (e.key === "Escape") onCancel();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [currentSec, inSec, outSec, onCancel, togglePlay]);

	const trimmedDuration = outSec - inSec;
	const originalBytes = file.size;
	const estTrimmedBytes =
		duration > 0
			? Math.round(originalBytes * (trimmedDuration / duration))
			: originalBytes;

	return (
		<div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
			<div className="bg-gray-1 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
				<div className="p-4 border-b border-gray-4 flex justify-between items-center">
					<h2 className="text-lg font-semibold text-gray-12">
						Trim before upload
					</h2>
					<button
						type="button"
						onClick={onCancel}
						className="text-gray-10 hover:text-gray-12"
						aria-label="Close"
					>
						✕
					</button>
				</div>
				<div className="p-4 space-y-4 overflow-auto">
					<video
						ref={videoRef}
						src={videoUrl}
						className="w-full max-h-[50vh] bg-black rounded"
						onLoadedMetadata={onLoadedMetadata}
						onTimeUpdate={onTimeUpdate}
						onClick={togglePlay}
						controls={false}
					>
						<track kind="captions" />
					</video>
					<Timeline
						duration={duration}
						inSec={inSec}
						outSec={outSec}
						currentSec={currentSec}
						onInChange={setInSec}
						onOutChange={setOutSec}
						onSeek={seek}
					/>
					<div className="flex items-center gap-4 text-sm">
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								checked={mode === "lossless"}
								onChange={() => setMode("lossless")}
							/>
							<span>Lossless (instant)</span>
						</label>
						<label className="flex items-center gap-2 cursor-pointer">
							<input
								type="radio"
								checked={mode === "precise"}
								onChange={() => setMode("precise")}
							/>
							<span>Precise (frame-accurate)</span>
						</label>
					</div>
					<div className="text-xs text-gray-10">
						Original: {Math.floor(duration / 60)}:
						{String(Math.floor(duration % 60)).padStart(2, "0")} (
						{fmtBytes(originalBytes)})
						{trimmedDuration > 0 && trimmedDuration < duration && (
							<>
								{" → "}
								After trim: {Math.floor(trimmedDuration / 60)}:
								{String(Math.floor(trimmedDuration % 60)).padStart(2, "0")} (~
								{fmtBytes(estTrimmedBytes)})
								{originalBytes > estTrimmedBytes && (
									<> — save ~{fmtBytes(originalBytes - estTrimmedBytes)}</>
								)}
							</>
						)}
					</div>
					<p className="text-[11px] text-gray-9">
						Shortcuts: <kbd>I</kbd> set in, <kbd>O</kbd> set out,{" "}
						<kbd>Space</kbd> play, <kbd>Esc</kbd> cancel
					</p>
					{trimming && (
						<div className="text-xs text-gray-10">
							{ffmpegLoading
								? "Loading trimmer…"
								: `Trimming… ${Math.round(progress * 100)}%`}
						</div>
					)}
					{error && <div className="text-xs text-red-600">{error}</div>}
				</div>
				<div className="p-4 border-t border-gray-4 flex justify-end gap-2">
					<Button
						type="button"
						variant="gray"
						onClick={onCancel}
						disabled={trimming}
					>
						Cancel
					</Button>
					<Button
						type="button"
						variant="dark"
						onClick={handleConfirm}
						disabled={trimming || trimmedDuration < 0.5}
					>
						{trimming ? "Working…" : "Upload trimmed video"}
					</Button>
				</div>
			</div>
		</div>
	);
}
