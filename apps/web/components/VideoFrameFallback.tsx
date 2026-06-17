"use client";

import type { Video } from "@cap/web-domain";
import { useEffect, useRef, useState } from "react";
import { saveCapturedThumbnail } from "@/actions/video/save-thumbnail";

const CACHE_PREFIX = "cap_thumb_fb_v1_";
const SAVED_PREFIX = "cap_thumb_saved_v1_";

export function readThumbnailCache(videoId: Video.VideoId): string | null {
	try {
		return localStorage.getItem(`${CACHE_PREFIX}${videoId}`);
	} catch {
		return null;
	}
}

function writeCache(videoId: Video.VideoId, dataUrl: string) {
	try {
		localStorage.setItem(`${CACHE_PREFIX}${videoId}`, dataUrl);
	} catch {}
}

function hasBeenSaved(videoId: Video.VideoId): boolean {
	try {
		return localStorage.getItem(`${SAVED_PREFIX}${videoId}`) === "1";
	} catch {
		return false;
	}
}

function markSaved(videoId: Video.VideoId) {
	try {
		localStorage.setItem(`${SAVED_PREFIX}${videoId}`, "1");
	} catch {}
}

interface Props {
	videoId: Video.VideoId;
	ownerId: string;
	className?: string;
	objectFit?: "cover" | "contain";
}

export const VideoFrameFallback = ({
	videoId,
	ownerId,
	className,
	objectFit = "cover",
}: Props) => {
	const [frameUrl, setFrameUrl] = useState<string | null>(() =>
		readThumbnailCache(videoId),
	);
	const videoRef = useRef<HTMLVideoElement>(null);
	const canvasRef = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		if (frameUrl) {
			if (!hasBeenSaved(videoId)) {
				void saveCapturedThumbnail({ videoId, dataUrl: frameUrl })
					.then((res) => {
						if (res.ok) markSaved(videoId);
					})
					.catch(() => {});
			}
			return;
		}

		const video = videoRef.current;
		const canvas = canvasRef.current;
		if (!video || !canvas) return;

		const handleSeeked = () => {
			try {
				const ctx = canvas.getContext("2d");
				if (!ctx) return;
				canvas.width = video.videoWidth || 320;
				canvas.height = video.videoHeight || 180;
				ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
				const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
				if (dataUrl !== "data:,") {
					setFrameUrl(dataUrl);
					writeCache(videoId, dataUrl);
					if (!hasBeenSaved(videoId)) {
						void saveCapturedThumbnail({ videoId, dataUrl })
							.then((res) => {
								if (res.ok) markSaved(videoId);
							})
							.catch(() => {});
					}
				}
			} catch {}
		};

		const handleLoadedMetadata = () => {
			video.currentTime = Math.min(0.5, (video.duration || 1) * 0.1);
		};

		video.addEventListener("loadedmetadata", handleLoadedMetadata);
		video.addEventListener("seeked", handleSeeked);
		video.crossOrigin = "anonymous";
		video.preload = "metadata";
		video.src = `/api/playlist?userId=${encodeURIComponent(ownerId)}&videoId=${encodeURIComponent(videoId)}&videoType=mp4`;
		video.load();

		return () => {
			video.removeEventListener("loadedmetadata", handleLoadedMetadata);
			video.removeEventListener("seeked", handleSeeked);
			video.src = "";
		};
	}, [videoId, ownerId, frameUrl]);

	if (frameUrl) {
		return (
			// biome-ignore lint/performance/noImgElement: frameUrl is a data URL; Next/Image does not support data URLs
			<img
				src={frameUrl}
				alt=""
				className={className}
				style={{ width: "100%", height: "100%", objectFit }}
			/>
		);
	}

	return (
		<>
			<video ref={videoRef} className="hidden" playsInline muted />
			<canvas ref={canvasRef} className="hidden" />
		</>
	);
};
