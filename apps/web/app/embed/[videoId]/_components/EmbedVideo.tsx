"use client";

import type { userSelectProps } from "@cap/database/auth/session";
import type { comments as commentsSchema, videos } from "@cap/database/schema";
import { Avatar } from "@cap/ui";
import type { ViewerSettings } from "@cap/web-backend";
import { AnimatePresence, motion } from "framer-motion";
import { useTranscript } from "hooks/use-transcript";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { CapVideoPlayer } from "@/app/s/[videoId]/_components/CapVideoPlayer";
import { useUploadProgress } from "@/app/s/[videoId]/_components/ProgressCircle";
import { RecordingInProgressOverlay } from "@/app/s/[videoId]/_components/RecordingInProgress";
import {
	formatChaptersAsVTT,
	formatTranscriptAsVTT,
	parseVTT,
	type TranscriptEntry,
} from "@/app/s/[videoId]/_components/utils/transcript-utils";

declare global {
	interface Window {
		MSStream: unknown;
	}
}

const formatTime = (time: number) => {
	const minutes = Math.floor(time / 60);
	const seconds = Math.floor(time % 60);
	return `${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}`;
};

type CommentWithAuthor = typeof commentsSchema.$inferSelect & {
	authorName: string | null;
};

export const EmbedVideo = forwardRef<
	HTMLVideoElement,
	{
		data: Omit<typeof videos.$inferSelect, "password"> & {
			hasActiveUpload: boolean | undefined;
		};
		user: typeof userSelectProps | null;
		comments: CommentWithAuthor[];
		chapters?: { title: string; start: number }[];
		ownerName?: string | null;
		autoplay?: boolean;
		viewerSettings?: ViewerSettings | null;
		showPlaybackStatusBadge?: boolean;
	}
>(
	(
		{
			data,
			user: _user,
			comments: _comments,
			chapters = [],
			ownerName,
			autoplay: _autoplay = false,
			viewerSettings,
			showPlaybackStatusBadge = false,
		},
		ref,
	) => {
		const videoRef = useRef<HTMLVideoElement>(null);
		useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement);

		const [transcriptData, setTranscriptData] = useState<TranscriptEntry[]>([]);
		const [longestDuration, setLongestDuration] = useState<number>(
			data.duration ?? 0,
		);
		const [isPlaying, setIsPlaying] = useState(false);
		const [overlayVisible, setOverlayVisible] = useState(true);
		const [userConfirmedStopped, setUserConfirmedStopped] = useState(false);
		const segmentUploadProgress = useUploadProgress(
			data.id,
			data.source.type === "desktopSegments" && (data.hasActiveUpload ?? false),
		);
		const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
		const [chaptersUrl, setChaptersUrl] = useState<string | null>(null);
		const captionsDisabled = viewerSettings?.disableCaptions ?? false;
		const chaptersDisabled = viewerSettings?.disableChapters ?? false;

		const { data: transcript, error: transcriptError } = useTranscript(
			data.id,
			captionsDisabled ? null : data.transcriptionStatus,
		);

		useEffect(() => {
			if (transcript?.content) {
				const parsed = parseVTT(transcript.content);
				setTranscriptData(parsed);
			} else if (transcriptError) {
				console.error(
					"[Transcript] Transcript error from React Query:",
					transcriptError.message,
				);
			}
		}, [transcript, transcriptError]);

		useEffect(() => {
			if (
				!captionsDisabled &&
				data.transcriptionStatus === "COMPLETE" &&
				transcriptData &&
				transcriptData.length > 0
			) {
				const vttContent = formatTranscriptAsVTT(transcriptData);
				const blob = new Blob([vttContent], { type: "text/vtt" });
				const newUrl = URL.createObjectURL(blob);
				setSubtitleUrl((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return newUrl;
				});
				return () => {
					URL.revokeObjectURL(newUrl);
				};
			}
			setSubtitleUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		}, [captionsDisabled, data.transcriptionStatus, transcriptData]);

		useEffect(() => {
			if (!chaptersDisabled && chapters?.length > 0) {
				const vttContent = formatChaptersAsVTT(chapters);
				const blob = new Blob([vttContent], { type: "text/vtt" });
				const newUrl = URL.createObjectURL(blob);
				setChaptersUrl((prev) => {
					if (prev) URL.revokeObjectURL(prev);
					return newUrl;
				});
				return () => {
					URL.revokeObjectURL(newUrl);
				};
			}
			setChaptersUrl((prev) => {
				if (prev) URL.revokeObjectURL(prev);
				return null;
			});
		}, [chapters, chaptersDisabled]);

		const isSegmentsSource = data.source.type === "desktopSegments";
		const isActivelyRecording =
			isSegmentsSource &&
			(data.hasActiveUpload ?? false) &&
			!userConfirmedStopped &&
			(segmentUploadProgress?.status === "fetching" ||
				segmentUploadProgress?.status === "uploading");

		const wasRecordingRef = useRef(false);
		const [isTransitioning, setIsTransitioning] = useState(false);

		useEffect(() => {
			if (isActivelyRecording) {
				wasRecordingRef.current = true;
			} else if (wasRecordingRef.current) {
				wasRecordingRef.current = false;
				setIsTransitioning(true);
				const timer = setTimeout(() => setIsTransitioning(false), 1500);
				return () => clearTimeout(timer);
			}
		}, [isActivelyRecording]);

		// All source types use the native <video> player via the mp4 playlist endpoint.
		const videoSrc = `/api/playlist?userId=${data.ownerId}&videoId=${data.id}&videoType=mp4`;
		const rawFallbackSrc =
			data.source.type === "webMP4" || data.source.type === "extensionWeb"
				? `/api/playlist?userId=${data.ownerId}&videoId=${data.id}&videoType=raw-preview`
				: undefined;
		const enableCrossOrigin = true;

		// Auto-hide overlay shortly after playback starts; re-show on pause.
		useEffect(() => {
			if (isPlaying) {
				const timer = setTimeout(() => setOverlayVisible(false), 2500);
				return () => clearTimeout(timer);
			} else {
				setOverlayVisible(true);
			}
		}, [isPlaying]);

		useEffect(() => {
			if (!videoRef.current) return;
			const player = videoRef.current;
			const handleLoadedMetadata = () => {
				setLongestDuration(player.duration);
			};

			if (player.readyState >= 1) {
				setLongestDuration(player.duration);
			} else {
				player.addEventListener("loadedmetadata", handleLoadedMetadata);
			}

			const listener = (arg: boolean) => {
				setIsPlaying(arg);
			};
			player.addEventListener("play", () => listener(true));
			player.addEventListener("pause", () => listener(false));
			return () => {
				player.removeEventListener("play", () => listener(true));
				player.removeEventListener("pause", () => listener(false));
				player.removeEventListener("loadedmetadata", handleLoadedMetadata);
			};
		}, []);

		return (
			<>
				<div className="relative w-full h-[100dvh]">
					{isActivelyRecording ? (
						<RecordingInProgressOverlay
							onConfirmStopped={() => setUserConfirmedStopped(true)}
							className="w-full h-full"
						/>
					) : isTransitioning ? (
						<div className="flex flex-col gap-2 justify-center items-center bg-black rounded-xl w-full h-full">
							<svg className="w-8 h-8 sm:w-10 sm:h-10 text-white/60 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
							</svg>
							<p className="text-white/50 text-sm">Preparing video...</p>
							<p className="text-white/30 text-xs text-center max-w-[220px] leading-relaxed">Your recording is being processed and will be ready shortly.</p>
						</div>
					) : (
						<CapVideoPlayer
							videoId={data.id}
							mediaPlayerClassName="w-full h-full"
							videoSrc={videoSrc}
							rawFallbackSrc={rawFallbackSrc}
							duration={data.duration}
							showPlaybackStatusBadge={showPlaybackStatusBadge}
							disableCaptions={captionsDisabled}
							chaptersSrc={chaptersDisabled ? "" : chaptersUrl || ""}
							captionsSrc={captionsDisabled ? "" : subtitleUrl || ""}
							videoRef={videoRef}
							enableCrossOrigin={enableCrossOrigin}
							hasActiveUpload={data.hasActiveUpload}
						/>
					)}
				</div>

				<AnimatePresence>
					{overlayVisible && (
						<div className="absolute top-3 left-3 z-10 space-y-2 pointer-events-none">
							<motion.div
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								transition={{ duration: 0.3, delay: 0.2 }}
								className="z-10 bg-black/50 backdrop-blur-md rounded-lg sm:rounded-xl px-2 py-1.5 sm:px-4 sm:py-3 border border-white/10 shadow-2xl pointer-events-auto"
							>
								<div className="flex gap-2 items-center sm:gap-3">
									{ownerName && (
										<Avatar
											name={ownerName}
											className="hidden flex-shrink-0 xs:flex xs:size-10"
											letterClass="xs:text-base font-medium"
										/>
									)}
									<div className="flex-1 min-w-0">
										<a
											href={`/s/${data.id}`}
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center min-h-[44px]"
											onClick={(e) => e.stopPropagation()}
										>
											<h1 className="text-xs max-w-[175px] xs:max-w-[300px] sm:max-w-[400px] font-semibold md:max-w-[500px] leading-tight text-white truncate transition-all duration-200 cursor-pointer sm:text-xl md:text-2xl hover:underline">
												{data.name}
											</h1>
										</a>
										<div className="flex items-center gap-1 sm:gap-2 mt-0.5 sm:mt-1">
											{ownerName && (
												<p className="text-xs font-medium text-gray-300 truncate sm:text-sm">
													{ownerName}
												</p>
											)}
											{ownerName && longestDuration > 0 && (
												<>
													<span className="text-xs text-gray-400">•</span>
													<p className="text-xs text-gray-300 sm:text-sm">
														{formatTime(longestDuration)}
													</p>
												</>
											)}
										</div>
									</div>
								</div>
							</motion.div>
							<motion.button
								initial={{ opacity: 0, y: 10 }}
								animate={{ opacity: 1, y: 0 }}
								exit={{ opacity: 0, y: 10 }}
								transition={{ duration: 0.3, delay: 0.1 }}
								onClick={(e) => {
									e.stopPropagation();
									window.open(process.env.NEXT_PUBLIC_WEB_URL ?? "#", "_blank");
								}}
								className="flex z-10 gap-2 items-center px-3 py-2 text-sm rounded-full border backdrop-blur-sm transition-colors duration-200 border-white/10 w-fit text-white/80 hover:text-white bg-black/50 pointer-events-auto"
								aria-label="Powered by data365"
							>
								<span className="text-xs md:text-sm text-white/80">
									Powered by
								</span>
								<span className="text-sm font-semibold leading-none text-white">
									data365
								</span>
							</motion.button>
						</div>
					)}
				</AnimatePresence>
			</>
		);
	},
);
