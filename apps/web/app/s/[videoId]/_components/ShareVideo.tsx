import type { comments as commentsSchema } from "@cap/database/schema";
import { Logo } from "@cap/ui";
import type { ImageUpload } from "@cap/web-domain";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { useTranscript } from "hooks/use-transcript";
import { CheckCircle2, Info, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
	useState,
} from "react";
import { finalizeDesktopSegmentsRecording } from "@/actions/video/finalize-desktop-segments";
import { Tooltip } from "@/components/Tooltip";
import { UpgradeModal } from "@/components/UpgradeModal";
import { isRetryableDesktopSegmentsFinalizationError } from "@/lib/desktop-segments-retryable-errors";
import type { VideoData } from "../types";
import { AIChatPopup } from "./AIChatPopup";
import { AIFab } from "./AIFab";
import { BelowVideoTabs } from "./BelowVideoTabs";
import { useCaptionContext } from "./CaptionContext";
import { CapVideoPlayer } from "./CapVideoPlayer";
import {
	shouldDeferPlaybackSource,
	shouldReloadPlaybackAfterUploadCompletes,
	useUploadProgress,
} from "./ProgressCircle";
import { RefinedTranscriptPanel } from "./panels/RefinedTranscriptPanel";
import { GenerateAiPanel } from "./GenerateAiPanel";
import { SummaryPanel } from "./panels/SummaryPanel";
import { TasksPanel } from "./panels/TasksPanel";
import { TranscriptPanel } from "./panels/TranscriptPanel";
import {
	PreparingVideoOverlay,
	RecordingInProgressOverlay,
} from "./RecordingInProgress";
import { formatChaptersAsVTT, clampStartSec } from "./utils/transcript-utils";

type CommentWithAuthor = typeof commentsSchema.$inferSelect & {
	authorName: string | null;
	authorImage: ImageUpload.ImageUrl | null;
};

type AiGenerationStatus =
	| "QUEUED"
	| "PROCESSING"
	| "COMPLETE"
	| "ERROR"
	| "SKIPPED";

export const ShareVideo = forwardRef<
	HTMLVideoElement,
	{
		data: VideoData & {
			hasActiveUpload?: boolean;
		};
		comments: MaybePromise<CommentWithAuthor[]>;
		chapters?: { title: string; start: number }[];
		areChaptersDisabled?: boolean;
		areCaptionsDisabled?: boolean;
		areCommentStampsDisabled?: boolean;
		areReactionStampsDisabled?: boolean;
		aiGenerationStatus?: AiGenerationStatus | null;
		canRetryProcessing?: boolean;
		canFinalizeDesktopSegments?: boolean;
		showPlaybackStatusBadge?: boolean;
		isEditProcessing: boolean;
		recordingStopped?: boolean;
		defaultPlaybackSpeed?: number;
		canGenerate?: boolean;
	}
>(
	(
		{
			data,
			comments,
			chapters = [],
			areCaptionsDisabled,
			areChaptersDisabled,
			areCommentStampsDisabled,
			areReactionStampsDisabled,
			aiGenerationStatus,
			canRetryProcessing,
			canFinalizeDesktopSegments = false,
			showPlaybackStatusBadge = false,
			isEditProcessing,
			recordingStopped = false,
			defaultPlaybackSpeed,
			canGenerate = false,
		},
		ref,
	) => {
		const videoRef = useRef<HTMLVideoElement | null>(null);
		useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);
		const router = useRouter();

		const safeChapters = useMemo(
			() => chapters.map((c) => ({ ...c, start: clampStartSec(c.start, data.duration ?? undefined) })),
			[chapters, data.duration],
		);
		const handleUploadComplete = useCallback(() => {
			router.refresh();
		}, [router]);

		const captionContext = useCaptionContext();

		const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
		const [subtitleUrl, setSubtitleUrl] = useState<string | null>(null);
		const [chaptersUrl, setChaptersUrl] = useState<string | null>(null);
		const [commentsData, setCommentsData] = useState<CommentWithAuthor[]>([]);
		const [userConfirmedStopped, setUserConfirmedStopped] =
			useState(recordingStopped);
		const [isConfirmingStopped, setIsConfirmingStopped] = useState(false);
		const [confirmStoppedError, setConfirmStoppedError] = useState<
			string | null
		>(null);
		const [aiChatOpen, setAiChatOpen] = useState(false);
		const [currentTime, setCurrentTime] = useState(0);
		const autoFinalizeAttemptedRef = useRef(false);
		const segmentUploadProgress = useUploadProgress(
			data.id,
			data.source.type === "desktopSegments" && (data.hasActiveUpload ?? false),
		);

		const { data: transcriptContent, error: transcriptError } = useTranscript(
			data.id,
			data.transcriptionStatus,
		);

		// Handle comments data
		useEffect(() => {
			if (comments) {
				if (Array.isArray(comments)) {
					setCommentsData(comments);
				} else {
					comments.then(setCommentsData);
				}
			}
		}, [comments]);

		useEffect(() => {
			if (recordingStopped) {
				setUserConfirmedStopped(true);
			}
		}, [recordingStopped]);

		const handleSeek = (time: number) => {
			if (videoRef.current) {
				videoRef.current.currentTime = time;
				setCurrentTime(time);
			}
		};

		useEffect(() => {
			const video = videoRef.current;
			if (!video) return;
			const onTimeUpdate = () => setCurrentTime(video.currentTime);
			video.addEventListener("timeupdate", onTimeUpdate);
			return () => video.removeEventListener("timeupdate", onTimeUpdate);
		}, []);

		useEffect(() => {
			if (transcriptContent) {
				captionContext.setOriginalVttContent(transcriptContent);
			} else if (transcriptError) {
				console.error(
					"[Transcript] Transcript error from React Query:",
					transcriptError.message,
				);
			}
		}, [
			transcriptContent,
			transcriptError,
			captionContext.setOriginalVttContent,
		]);

		useEffect(() => {
			const vttContent = captionContext.currentVttContent;

			if (captionContext.selectedLanguage === "off") {
				setSubtitleUrl((prev) => {
					if (prev) {
						URL.revokeObjectURL(prev);
					}
					return null;
				});
				return;
			}

			if (data.transcriptionStatus === "COMPLETE" && vttContent) {
				const blob = new Blob([vttContent], { type: "text/vtt" });
				const newUrl = URL.createObjectURL(blob);
				setSubtitleUrl((prev) => {
					if (prev) {
						URL.revokeObjectURL(prev);
					}
					return newUrl;
				});

				return () => {
					URL.revokeObjectURL(newUrl);
				};
			}
			setSubtitleUrl((prev) => {
				if (prev) {
					URL.revokeObjectURL(prev);
				}
				return null;
			});
		}, [
			data.transcriptionStatus,
			captionContext.currentVttContent,
			captionContext.selectedLanguage,
		]);

		useEffect(() => {
			if (chapters?.length > 0) {
				const vttContent = formatChaptersAsVTT(safeChapters);
				const blob = new Blob([vttContent], { type: "text/vtt" });
				const newUrl = URL.createObjectURL(blob);
				setChaptersUrl((prev) => {
					if (prev) {
						URL.revokeObjectURL(prev);
					}
					return newUrl;
				});

				return () => {
					URL.revokeObjectURL(newUrl);
				};
			}
			setChaptersUrl((prev) => {
				if (prev) {
					URL.revokeObjectURL(prev);
				}
				return null;
			});
		}, [safeChapters]);

		const isSegmentsSource = data.source.type === "desktopSegments";
		const previousSegmentUploadProgressRef = useRef(segmentUploadProgress);
		const isActivelyRecording =
			isSegmentsSource &&
			(data.hasActiveUpload ?? false) &&
			!userConfirmedStopped &&
			(segmentUploadProgress?.status === "fetching" ||
				segmentUploadProgress?.status === "uploading");

		const isProcessingInProgress =
			isSegmentsSource &&
			(data.hasActiveUpload ?? false) &&
			!userConfirmedStopped &&
			!isActivelyRecording &&
			shouldDeferPlaybackSource(segmentUploadProgress);
		const handleConfirmStopped = useCallback(async () => {
			if (
				!canFinalizeDesktopSegments ||
				data.source.type !== "desktopSegments" ||
				!data.hasActiveUpload
			) {
				setUserConfirmedStopped(true);
				return;
			}

			setIsConfirmingStopped(true);
			setConfirmStoppedError(null);

			try {
				await finalizeDesktopSegmentsRecording({ videoId: data.id });
				setUserConfirmedStopped(true);
				router.refresh();
			} catch (error) {
				setConfirmStoppedError(
					error instanceof Error
						? error.message
						: "Recording could not be finalized",
				);
			} finally {
				setIsConfirmingStopped(false);
			}
		}, [
			canFinalizeDesktopSegments,
			data.hasActiveUpload,
			data.id,
			data.source.type,
			router,
		]);
		const shouldAutoFinalizeFailedSegments =
			isSegmentsSource &&
			(data.hasActiveUpload ?? false) &&
			canFinalizeDesktopSegments &&
			!userConfirmedStopped &&
			segmentUploadProgress?.status === "error" &&
			isRetryableDesktopSegmentsFinalizationError(
				segmentUploadProgress.errorMessage,
			);
		useEffect(() => {
			if (
				!shouldAutoFinalizeFailedSegments ||
				autoFinalizeAttemptedRef.current ||
				isConfirmingStopped
			) {
				return;
			}

			autoFinalizeAttemptedRef.current = true;
			void handleConfirmStopped();
		}, [
			handleConfirmStopped,
			isConfirmingStopped,
			shouldAutoFinalizeFailedSegments,
		]);
		const showFinalizeRecordingControl =
			isSegmentsSource &&
			(data.hasActiveUpload ?? false) &&
			canFinalizeDesktopSegments &&
			!userConfirmedStopped &&
			segmentUploadProgress?.status === "failed";
		useEffect(() => {
			if (!isSegmentsSource || !data.hasActiveUpload || !userConfirmedStopped) {
				previousSegmentUploadProgressRef.current = segmentUploadProgress;
				return;
			}

			if (
				shouldReloadPlaybackAfterUploadCompletes(
					previousSegmentUploadProgressRef.current,
					segmentUploadProgress,
					{ includeFetching: true },
				)
			) {
				router.refresh();
			}

			previousSegmentUploadProgressRef.current = segmentUploadProgress;
		}, [
			data.hasActiveUpload,
			isSegmentsSource,
			router,
			segmentUploadProgress,
			userConfirmedStopped,
		]);

		// All source types use the native <video> player via the mp4 playlist endpoint.
		// The /api/playlist?videoType=mp4 route returns a signed redirect to result.mp4.
		const videoSrc = `/api/playlist?userId=${data.owner.id}&videoId=${data.id}&videoType=mp4`;
		const rawFallbackSrc =
			data.source.type === "webMP4" || data.source.type === "extensionWeb"
				? `/api/playlist?userId=${data.owner.id}&videoId=${data.id}&videoType=raw-preview`
				: undefined;
		const enableCrossOrigin = true;

		const playerBlock = (
			<>
				<div
					className="relative aspect-video overflow-hidden rounded-2xl border border-gray-5 bg-gray-1"
					style={{ viewTransitionName: "cap-edit-video" }}
				>
					{isActivelyRecording ? (
						<div className="relative h-full overflow-hidden rounded-xl bg-black">
							<CapVideoPlayer
								videoId={data.id}
								mediaPlayerClassName="w-full h-full max-w-full max-h-full rounded-xl"
								videoSrc={videoSrc}
								duration={data.duration}
								disableCaptions
								disableCommentStamps
								disableReactionStamps
								disablePreviewGif
								chaptersSrc=""
								captionsSrc=""
								videoRef={videoRef}
								enableCrossOrigin={enableCrossOrigin}
								hasActiveUpload={data.hasActiveUpload}
								autoplay
							/>
							<div className="absolute inset-0 z-20">
								<RecordingInProgressOverlay
									onConfirmStopped={handleConfirmStopped}
									isConfirmingStopped={isConfirmingStopped}
									confirmStoppedError={confirmStoppedError}
									className="h-full"
									variant="overlay"
								/>
							</div>
						</div>
					) : isProcessingInProgress ? (
						<PreparingVideoOverlay className="h-full" />
					) : (
						<CapVideoPlayer
							videoId={data.id}
							mediaPlayerClassName="w-full h-full max-w-full max-h-full rounded-xl overflow-visible"
							videoSrc={videoSrc}
							rawFallbackSrc={rawFallbackSrc}
							duration={data.duration}
							defaultPlaybackSpeed={defaultPlaybackSpeed}
							showPlaybackStatusBadge={showPlaybackStatusBadge}
							disableCaptions={areCaptionsDisabled ?? false}
							disableCommentStamps={areCommentStampsDisabled ?? false}
							disableReactionStamps={areReactionStampsDisabled ?? false}
							chaptersSrc={areChaptersDisabled ? "" : chaptersUrl || ""}
							captionsSrc={areCaptionsDisabled ? "" : subtitleUrl || ""}
							videoRef={videoRef}
							enableCrossOrigin={enableCrossOrigin}
							hasActiveUpload={data.hasActiveUpload}
							blockPlaybackDuringProcessing={isEditProcessing}
							onUploadComplete={handleUploadComplete}
							comments={commentsData.map((comment) => ({
								id: comment.id,
								type: comment.type,
								timestamp: comment.timestamp,
								content: comment.content,
								authorName: comment.authorName,
								authorImage: comment.authorImage ?? undefined,
							}))}
							onSeek={handleSeek}
							canRetryProcessing={canRetryProcessing}
							chapters={
								areChaptersDisabled
									? []
									: safeChapters.map((ch) => ({
											startSec: ch.start,
											title: ch.title,
										}))
							}
						/>
					)}
					{showFinalizeRecordingControl && (
						<div className="absolute bottom-3 left-3 z-30 flex max-w-[calc(100%-1.5rem)] flex-col items-start gap-1.5">
							<div className="flex items-center gap-1.5">
								<button
									type="button"
									onClick={handleConfirmStopped}
									disabled={isConfirmingStopped}
									className="inline-flex h-7 items-center gap-1.5 rounded-md border border-white/15 bg-black/65 px-2.5 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-70"
								>
									{isConfirmingStopped ? (
										<Loader2Icon className="size-3 animate-spin" />
									) : (
										<CheckCircle2 className="size-3" />
									)}
									{isConfirmingStopped
										? "Marking as completed..."
										: "Mark video as completed"}
								</button>
								<TooltipPrimitive.Provider delayDuration={150}>
									<Tooltip
										position="top"
										className="max-w-[260px] items-start text-left leading-relaxed"
										content="We didn't receive confirmation that this recording finished uploading. Mark it as completed to publish what's been uploaded. Next time, keep the desktop app open after you stop recording until the video loads here, so all files finish uploading."
									>
										<button
											type="button"
											aria-label="Why this recording needs to be marked as completed"
											className="inline-flex size-7 items-center justify-center rounded-md border border-white/15 bg-black/65 text-white/80 shadow-sm backdrop-blur-sm transition-colors hover:bg-black/80 hover:text-white"
										>
											<Info className="size-3.5" />
										</button>
									</Tooltip>
								</TooltipPrimitive.Provider>
							</div>
							{confirmStoppedError && (
								<p className="max-w-56 rounded-md bg-black/70 px-2 py-1 text-[11px] text-red-100">
									{confirmStoppedError}
								</p>
							)}
						</div>
					)}
					{!data.owner.isPro && (
						<div className="absolute top-4 left-4 z-30">
							<button
								type="button"
								className="block"
								onClick={(e) => {
									e.stopPropagation();
									setUpgradeModalOpen(true);
								}}
							>
								<div className="relative">
									<div className="opacity-50 transition-opacity hover:opacity-100 peer">
										<Logo className="w-auto h-4 sm:h-8" white={true} />
									</div>

									<div className="absolute left-0 top-8 transition-transform duration-300 ease-in-out origin-top scale-y-0 peer-hover:scale-y-100">
										<p className="text-white text-xs font-medium whitespace-nowrap bg-black bg-opacity-50 px-2 py-0.5 rounded">
											Remove watermark
										</p>
									</div>
								</div>
							</button>
						</div>
					)}
				</div>

				<UpgradeModal
					open={upgradeModalOpen}
					onOpenChange={setUpgradeModalOpen}
				/>
			</>
		);

		return (
			<>
				{/*
				  Loom-style layout:
				  - Below xl: single column → video on top, transcript reachable via the
				    BelowVideoTabs "Transcript" tab (unchanged narrow/mobile experience).
				    Gated at xl (not lg) because the share page also has a 320px comments
				    rail; engaging the pinned transcript below 1280px would squeeze the
				    video too narrow (three columns at lg → ~290px video).
				  - xl+: two columns → LEFT = video pinned (sticky) while you scroll,
				    RIGHT = transcript scrolls independently. The in-tab Transcript is
				    hidden at xl+ (hideTranscriptTab) so only ONE live TranscriptPanel
				    is mounted at a time.
				*/}
				{/* Video full-width; the raw transcript now lives as a tab next to
				    "Clean Transcript" (BelowVideoTabs) instead of a pinned side column. */}
				<div className="min-w-0">{playerBlock}</div>

				<div className="mt-4">
					<BelowVideoTabs
						summary={
							<>
								<GenerateAiPanel
									videoId={data.id}
									canGenerate={canGenerate}
									transcriptionStatus={data.transcriptionStatus as "PROCESSING" | "COMPLETE" | "ERROR" | "SKIPPED" | "NO_AUDIO" | null | undefined}
									aiGenerationStatus={aiGenerationStatus}
									duration={data.duration}
								/>
								<SummaryPanel
									data={{
										duration: data.duration ?? undefined,
										aiSummary: data.metadata?.aiSummary ?? undefined,
										speakerCount: undefined,
									}}
									onVideoJump={handleSeek}
								/>
							</>
						}
						tasks={
							<TasksPanel
								videoId={data.id}
								tasks={data.metadata?.aiSummary?.tasks ?? []}
							/>
						}
						transcript={
							<TranscriptPanel
								transcriptContent={transcriptContent ?? undefined}
								currentTime={currentTime}
								onVideoJump={handleSeek}
								chapters={safeChapters.map((c) => ({ startSec: c.start, title: c.title }))}
							/>
						}
						refined={
							<RefinedTranscriptPanel
								refinedTranscript={
									data.metadata?.aiSummary?.refinedTranscript ?? undefined
								}
								onVideoJump={handleSeek}
							/>
						}
					/>
				</div>

				<div className={`ai-aura${aiChatOpen ? " show" : ""}`} />
				<AIChatPopup
					videoId={data.id}
					onVideoJump={handleSeek}
					onClose={() => setAiChatOpen(false)}
					isOpen={aiChatOpen}
				/>
				<AIFab onClick={() => setAiChatOpen((v) => !v)} isOpen={aiChatOpen} />
			</>
		);
	},
);
