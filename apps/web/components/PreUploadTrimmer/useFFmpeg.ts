"use client";

import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { useCallback, useRef, useState } from "react";

export type TrimMode = "lossless" | "precise";

const CORE_BASE = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd";

export function useFFmpeg() {
	const ffmpegRef = useRef<FFmpeg | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [loading, setLoading] = useState(false);
	const [progress, setProgress] = useState(0);

	const load = useCallback(async () => {
		if (ffmpegRef.current && loaded) return ffmpegRef.current;
		setLoading(true);
		const ffmpeg = new FFmpeg();
		ffmpeg.on("progress", ({ progress: p }) => setProgress(p));
		await ffmpeg.load({
			coreURL: await toBlobURL(
				`${CORE_BASE}/ffmpeg-core.js`,
				"text/javascript",
			),
			wasmURL: await toBlobURL(
				`${CORE_BASE}/ffmpeg-core.wasm`,
				"application/wasm",
			),
		});
		ffmpegRef.current = ffmpeg;
		setLoaded(true);
		setLoading(false);
		return ffmpeg;
	}, [loaded]);

	const trim = useCallback(
		async (
			file: File,
			inSec: number,
			outSec: number,
			mode: TrimMode,
		): Promise<File> => {
			const ffmpeg = await load();
			const ext = file.name.split(".").pop() ?? "mp4";
			const inputName = `input.${ext}`;
			const outputName = `output.${ext}`;
			setProgress(0);
			await ffmpeg.writeFile(inputName, await fetchFile(file));
			const duration = Math.max(0.1, outSec - inSec);
			const args =
				mode === "lossless"
					? [
							"-ss",
							String(inSec),
							"-i",
							inputName,
							"-t",
							String(duration),
							"-c",
							"copy",
							"-avoid_negative_ts",
							"make_zero",
							outputName,
						]
					: [
							"-i",
							inputName,
							"-ss",
							String(inSec),
							"-t",
							String(duration),
							"-c:v",
							"libx264",
							"-preset",
							"ultrafast",
							"-crf",
							"18",
							"-c:a",
							"aac",
							outputName,
						];
			await ffmpeg.exec(args);
			const data = await ffmpeg.readFile(outputName);
			await ffmpeg.deleteFile(inputName).catch(() => {});
			await ffmpeg.deleteFile(outputName).catch(() => {});
			const bytes = data as Uint8Array;
			const trimmedName = file.name.replace(/(\.[^.]+)?$/, `-trimmed$1`);
			return new File([bytes], trimmedName, {
				type: file.type || "video/mp4",
			});
		},
		[load],
	);

	return { load, trim, loaded, loading, progress };
}
