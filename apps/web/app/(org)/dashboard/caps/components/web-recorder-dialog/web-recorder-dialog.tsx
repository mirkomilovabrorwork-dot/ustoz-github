"use client";

import {
	Button,
	Dialog,
	DialogContent,
	DialogTitle,
	DialogTrigger,
} from "@cap/ui";
import type { Folder } from "@cap/web-domain";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, CopyIcon, MonitorIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useDashboardContext } from "../../../Contexts";
import { CameraPreviewWindow } from "./CameraPreviewWindow";
import { CameraSelector } from "./CameraSelector";
import { CloseButton } from "./CloseButton";
import { HowItWorksButton } from "./HowItWorksButton";
import { HowItWorksPanel } from "./HowItWorksPanel";
import { InProgressRecordingBar } from "./InProgressRecordingBar";
import { MicrophoneSelector } from "./MicrophoneSelector";
import { RecordingButton } from "./RecordingButton";
import {
	type RecordingMode,
	RecordingModeSelector,
} from "./RecordingModeSelector";
import { SettingsButton } from "./SettingsButton";
import { SettingsPanel } from "./SettingsPanel";
import { SystemAudioToggle } from "./SystemAudioToggle";
import { useCameraDevices } from "./useCameraDevices";
import { useDevicePreferences } from "./useDevicePreferences";
import { useDialogInteractions } from "./useDialogInteractions";
import { useMicrophoneDevices } from "./useMicrophoneDevices";
import { useWebRecorder } from "./useWebRecorder";
import {
	dialogVariants,
	FREE_PLAN_MAX_RECORDING_MS,
} from "./web-recorder-constants";
import { WebRecorderDialogHeader } from "./web-recorder-dialog-header";
import { useTranslations } from "next-intl";

const recoveredRecordingTimeFormatter = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
});

export const WebRecorderDialog = ({
	folderId,
}: {
	folderId?: Folder.FolderId | null;
} = {}) => {
	const [open, setOpen] = useState(false);
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [howItWorksOpen, setHowItWorksOpen] = useState(false);
	const [recordingMode, setRecordingMode] =
		useState<RecordingMode>("fullscreen");
	const [cameraSelectOpen, setCameraSelectOpen] = useState(false);
	const [micSelectOpen, setMicSelectOpen] = useState(false);
	const [pendingSilentConfirm, setPendingSilentConfirm] = useState(false);
	const [linkCopied, setLinkCopied] = useState(false);
	const t = useTranslations("recorder");
	const micAutoSelectedRef = useRef(false);
	const dialogContentRef = useRef<HTMLDivElement>(null);
	const startSoundRef = useRef<HTMLAudioElement | null>(null);
	const stopSoundRef = useRef<HTMLAudioElement | null>(null);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const startSound = new Audio("/sounds/start-recording.ogg");
		startSound.preload = "auto";
		const stopSound = new Audio("/sounds/stop-recording.ogg");
		stopSound.preload = "auto";

		startSoundRef.current = startSound;
		stopSoundRef.current = stopSound;

		return () => {
			startSound.pause();
			stopSound.pause();
			startSoundRef.current = null;
			stopSoundRef.current = null;
		};
	}, []);

	const playAudio = useCallback((audio: HTMLAudioElement | null) => {
		if (!audio) {
			return;
		}
		audio.currentTime = 0;
		void audio.play().catch(() => {
			/* ignore */
		});
	}, []);

	const handleRecordingStartSound = useCallback(() => {
		playAudio(startSoundRef.current);
	}, [playAudio]);

	const handleRecordingStopSound = useCallback(() => {
		playAudio(stopSoundRef.current);
	}, [playAudio]);

	const { activeOrganization, user } = useDashboardContext();
	const organisationId = activeOrganization?.organization.id;
	const { devices: availableMics, refresh: refreshMics } =
		useMicrophoneDevices(open);
	const { devices: availableCameras, refresh: refreshCameras } =
		useCameraDevices(open);

	const {
		rememberDevices,
		selectedCameraId,
		selectedMicId,
		systemAudioEnabled,
		setSelectedCameraId,
		handleCameraChange,
		handleMicChange,
		handleSystemAudioChange,
		handleRememberDevicesChange,
	} = useDevicePreferences({
		open,
		availableCameras,
		availableMics,
	});

	const micEnabled = selectedMicId !== null;

	// In camera mode audio comes only from the mic; in screen modes it can come
	// from the mic OR system audio. "No audio" means nothing would be recorded.
	const noAudioSelected =
		recordingMode === "camera"
			? !micEnabled
			: !micEnabled && !systemAudioEnabled;

	useEffect(() => {
		if (
			recordingMode === "camera" &&
			!selectedCameraId &&
			availableCameras.length > 0
		) {
			setSelectedCameraId(availableCameras[0]?.deviceId ?? null);
		}
	}, [recordingMode, selectedCameraId, availableCameras, setSelectedCameraId]);

	// Default the microphone ON (first available) once the recorder opens, so a
	// teacher's narration is always captured — a mic-off + system-audio-off
	// recording is silent and fails transcription/AI. Mirrors Loom (mic on by
	// default). Runs once per open; the user can still turn the mic off after.
	useEffect(() => {
		if (!open) {
			micAutoSelectedRef.current = false;
			return;
		}
		if (micAutoSelectedRef.current || availableMics.length === 0) {
			return;
		}
		micAutoSelectedRef.current = true;
		if (!selectedMicId) {
			handleMicChange(availableMics[0]?.deviceId ?? null);
		}
	}, [open, availableMics, selectedMicId, handleMicChange]);

	const {
		phase,
		durationMs,
		hasAudioTrack,
		isMicMuted,
		toggleMicMute,
		canToggleMic,
		isCameraOff,
		toggleCameraMute,
		canToggleCamera,
		chunkUploads,
		errorDownload,
		completedShareUrl,
		recoveredDownloads,
		isRecording,
		isBusy,
		isRestarting,
		canStartRecording,
		isBrowserSupported,
		unsupportedReason,
		supportsDisplayRecording,
		supportCheckCompleted,
		screenCaptureWarning,
		startRecording,
		pauseRecording,
		resumeRecording,
		stopRecording,
		openCompletedShareUrl,
		restartRecording,
		resetState,
		dismissRecoveredDownload,
	} = useWebRecorder({
		organisationId,
		folderId,
		selectedMicId,
		micEnabled,
		systemAudioEnabled,
		recordingMode,
		selectedCameraId,
		isProUser: user.isPro,
		onRecordingSurfaceDetected: (mode) => {
			setRecordingMode(mode);
		},
		onRecordingStart: handleRecordingStartSound,
		onRecordingStop: handleRecordingStopSound,
	});

	// Best-effort auto-copy when the share URL becomes available after upload.
	// Browsers may block clipboard writes without a direct user gesture (the
	// upload callback is async), so this is intentionally non-throwing.
	useEffect(() => {
		if (!completedShareUrl) return;
		setLinkCopied(false);
		(async () => {
			try {
				await navigator.clipboard.writeText(completedShareUrl);
				setLinkCopied(true);
			} catch {
				/* gesture / permission may be absent after async upload — ignore */
			}
		})();
	}, [completedShareUrl]);

	// Warn before a silent recording: the first Record click with no audio shows
	// a warning and arms a confirm; the second click records without audio.
	const handleStartRecording = useCallback(() => {
		if (noAudioSelected && !pendingSilentConfirm) {
			setPendingSilentConfirm(true);
			toast.warning(t("silentRecordingWarning"));
			return;
		}
		setPendingSilentConfirm(false);
		void Promise.resolve(startRecording()).catch((err: unknown) => {
			console.error("Start recording error", err);
		});
	}, [noAudioSelected, pendingSilentConfirm, startRecording, t]);

	useEffect(() => {
		if (!noAudioSelected) {
			setPendingSilentConfirm(false);
		}
	}, [noAudioSelected]);

	useEffect(() => {
		if (
			!supportCheckCompleted ||
			supportsDisplayRecording ||
			recordingMode === "camera"
		) {
			return;
		}

		setRecordingMode("camera");
	}, [supportCheckCompleted, supportsDisplayRecording, recordingMode]);

	const {
		handlePointerDownOutside,
		handleFocusOutside,
		handleInteractOutside,
	} = useDialogInteractions({
		dialogContentRef,
		isRecording,
		isBusy,
	});

	// When the dialog closes while a recording is active (recording or paused),
	// we minimize instead of stopping: set open=false so the big panel hides,
	// but do NOT call resetState() — the MediaRecorder and tracks stay alive
	// inside the always-mounted useWebRecorder hook, and InProgressRecordingBar
	// remains the user's control surface.
	//
	// When a true upload/finalize is in flight (creating/converting/uploading) we
	// keep the guard toast and block close entirely — same as before.
	//
	// When the phase transitions to "completed" while the dialog is hidden, a
	// useEffect below re-opens the dialog so the share UI is never lost.
	const isActiveRecording = phase === "recording" || phase === "paused";
	const isUploadInFlight =
		phase === "creating" || phase === "converting" || phase === "uploading";
	// True only after the user minimized during an active recording, so the
	// re-open effect surfaces the share UI exactly ONCE on completion and never
	// re-opens when the user closes the completed panel (resetState sets
	// phase=idle only after an await, so without this guard the completed panel
	// would re-open in a loop and trap the user).
	const wasMinimizedRef = useRef(false);

	const handleOpenChange = (next: boolean) => {
		if (next && supportCheckCompleted && !isBrowserSupported) {
			toast.error(t("browserNotSupported"));
			return;
		}

		// Guard: keep dialog open while an upload/finalize is in progress.
		if (!next && isUploadInFlight) {
			toast.info(t("keepDialogOpen"));
			return;
		}

		// Minimize: hide the panel but keep the recording running.
		if (!next && isActiveRecording) {
			wasMinimizedRef.current = true;
			setOpen(false);
			return;
		}

		// Genuine close from idle/completed/error — reset state.
		if (!next) {
			void resetState();
			setSelectedCameraId(null);
			setRecordingMode("fullscreen");
			setSettingsOpen(false);
			setHowItWorksOpen(false);
		}
		setOpen(next);
	};

	// Re-open the dialog when recording finishes and moves to the completed (or
	// error) phase while the panel is minimized, so the share link is never lost.
	useEffect(() => {
		if (
			wasMinimizedRef.current &&
			(phase === "completed" || phase === "error") &&
			!open
		) {
			wasMinimizedRef.current = false;
			setOpen(true);
		}
	}, [phase, open]);

	const handleStopClick = () => {
		stopRecording().catch((err: unknown) => {
			console.error("Stop recording error", err);
		});
	};

	// handleClose: invoked by the dedicated CloseButton (✕). Escape closes via Radix onOpenChange directly, not through here.
	// During an active recording → minimize (handleOpenChange handles it above).
	// During upload/finalize → also delegate to handleOpenChange (guard toast fires).
	// In any other state → close normally.
	const handleClose = () => {
		handleOpenChange(false);
	};

	const handleSettingsOpen = () => {
		setSettingsOpen(true);
		setHowItWorksOpen(false);
	};

	const handleHowItWorksOpen = () => {
		setHowItWorksOpen(true);
		setSettingsOpen(false);
	};

	const showInProgressBar = isRecording || isBusy || phase === "error";
	const recordingTimerDisplayMs = user.isPro
		? durationMs
		: Math.max(0, FREE_PLAN_MAX_RECORDING_MS - durationMs);

	return (
		<>
			<Dialog open={open} onOpenChange={handleOpenChange}>
				<DialogTrigger asChild>
					<Button variant="blue" size="sm" className="flex items-center gap-2">
						<MonitorIcon className="size-3.5" />
						{t("recordInBrowser")}
					</Button>
				</DialogTrigger>
				<DialogContent
					ref={dialogContentRef}
					className="w-[300px] border-none bg-transparent p-0 [&>button]:hidden"
					onPointerDownOutside={handlePointerDownOutside}
					onFocusOutside={handleFocusOutside}
					onInteractOutside={handleInteractOutside}
				>
					<DialogTitle className="sr-only">{t("dialogTitle")}</DialogTitle>
					<AnimatePresence mode="wait">
						{open && (
							<motion.div
								variants={dialogVariants}
								initial="hidden"
								animate="visible"
								exit="exit"
								className="relative flex justify-center flex-col p-[1rem] pt-[2rem] gap-[0.75rem] text-[0.875rem] font-[400] text-[--text-primary] bg-gray-2 rounded-xl min-h-[350px]"
							>
								<SettingsButton
									visible={!settingsOpen}
									onClick={handleSettingsOpen}
								/>
								{!settingsOpen && (
									<CloseButton onClick={handleClose} />
								)}
								<SettingsPanel
									open={settingsOpen}
									rememberDevices={rememberDevices}
									onClose={() => setSettingsOpen(false)}
									onRememberDevicesChange={handleRememberDevicesChange}
								/>
								<HowItWorksPanel
									open={howItWorksOpen}
									onClose={() => setHowItWorksOpen(false)}
								/>
								<WebRecorderDialogHeader />
								<RecordingModeSelector
									mode={recordingMode}
									disabled={isBusy}
									onModeChange={setRecordingMode}
								/>
								{screenCaptureWarning && (
									<div className="rounded-md border border-amber-6 bg-amber-3/60 px-3 py-2 text-xs leading-snug text-amber-12">
										{screenCaptureWarning}
									</div>
								)}
								<CameraSelector
									selectedCameraId={selectedCameraId}
									availableCameras={availableCameras}
									dialogOpen={open}
									disabled={isBusy}
									open={cameraSelectOpen}
									onOpenChange={(isOpen) => {
										setCameraSelectOpen(isOpen);
										if (isOpen) {
											setMicSelectOpen(false);
										}
									}}
									onCameraChange={handleCameraChange}
									onRefreshDevices={refreshCameras}
								/>
								<MicrophoneSelector
									selectedMicId={selectedMicId}
									availableMics={availableMics}
									dialogOpen={open}
									disabled={isBusy}
									open={micSelectOpen}
									onOpenChange={(isOpen) => {
										setMicSelectOpen(isOpen);
										if (isOpen) {
											setCameraSelectOpen(false);
										}
									}}
									onMicChange={handleMicChange}
									onRefreshDevices={refreshMics}
								/>
								{recordingMode !== "camera" && (
									<SystemAudioToggle
										enabled={systemAudioEnabled}
										disabled={isBusy}
										recordingMode={recordingMode}
										onToggle={handleSystemAudioChange}
									/>
								)}
								{noAudioSelected && (
									<div className="rounded-md border border-amber-6 bg-amber-3/60 px-3 py-2 text-xs leading-snug text-amber-12">
										{t("noAudioWarning")}
									</div>
								)}
								<RecordingButton
									isRecording={isRecording}
									disabled={!canStartRecording || (isBusy && !isRecording)}
									onStart={handleStartRecording}
									onStop={handleStopClick}
								/>
								{!isBrowserSupported && unsupportedReason && (
									<div className="rounded-md border border-red-6 bg-red-3/70 px-3 py-2 text-xs leading-snug text-red-12">
										{unsupportedReason}
									</div>
								)}
								{phase === "completed" && completedShareUrl && (
									<div className="rounded-md border border-green-6 bg-green-3/70 px-3 py-3 text-xs text-green-12">
										<div className="font-medium">{t("shareLinkReady")}</div>
										<div className="mt-1 leading-snug">
											{linkCopied
												? t("linkCopied")
												: t("linkNotOpened")}
										</div>
										<div className="mt-3 flex flex-col gap-2 sm:flex-row">
											<Button
												variant="blue"
												size="sm"
												className="w-full sm:flex-1"
												onClick={() => {
													navigator.clipboard
														.writeText(completedShareUrl)
														.then(() => {
															setLinkCopied(true);
															setTimeout(() => setLinkCopied(false), 2000);
														})
														.catch(() => {
															/* ignore */
														});
												}}
											>
												{linkCopied ? (
													<>
														<CheckIcon className="mr-1.5 h-3.5 w-3.5" />
														{t("copiedButton")}
													</>
												) : (
													<>
														<CopyIcon className="mr-1.5 h-3.5 w-3.5" />
														{t("copyLink")}
													</>
												)}
											</Button>
											<Button
												variant="blue"
												size="sm"
												className="w-full sm:flex-1"
												onClick={openCompletedShareUrl}
											>
												{t("openShareLink")}
											</Button>
										</div>
									</div>
								)}
								{phase === "idle" && recoveredDownloads.length > 0 && (
									<div className="rounded-md border border-blue-6 bg-blue-3/60 px-3 py-2">
										<div className="text-xs font-medium text-blue-12">
											{t("recoveredRecordings")}
										</div>
										<div className="mt-2 flex flex-col gap-2">
											{recoveredDownloads.map((download) => (
												<div
													key={download.id}
													className="flex items-center justify-between gap-3 rounded-md bg-gray-3 px-2.5 py-2 text-xs text-gray-12"
												>
													<div className="min-w-0">
														<div className="truncate font-medium">
															{download.fileName}
														</div>
														<div className="text-gray-10">
															{recoveredRecordingTimeFormatter.format(
																new Date(download.createdAt),
															)}
														</div>
													</div>
													<div className="flex shrink-0 items-center gap-3">
														<a
															href={download.url}
															download={download.fileName}
															className="font-medium text-blue-11 hover:text-blue-12"
															onClick={() =>
																setTimeout(
																	() => dismissRecoveredDownload(download.id),
																	500,
																)
															}
														>
															{t("download")}
														</a>
														<button
															type="button"
															className="text-gray-10 hover:text-gray-12"
															onClick={() =>
																dismissRecoveredDownload(download.id)
															}
														>
															{t("dismiss")}
														</button>
													</div>
												</div>
											))}
										</div>
									</div>
								)}
								<HowItWorksButton onClick={handleHowItWorksOpen} />
							</motion.div>
						)}
					</AnimatePresence>
				</DialogContent>
			</Dialog>
			{showInProgressBar && (
				<InProgressRecordingBar
					phase={phase}
					durationMs={recordingTimerDisplayMs}
					hasAudioTrack={hasAudioTrack}
					isMicMuted={isMicMuted}
					toggleMicMute={toggleMicMute}
					canToggleMic={canToggleMic}
					isCameraOff={isCameraOff}
					toggleCameraMute={toggleCameraMute}
					canToggleCamera={canToggleCamera}
					chunkUploads={chunkUploads}
					errorDownload={errorDownload}
					onStop={handleStopClick}
					onPause={pauseRecording}
					onResume={resumeRecording}
					onRestart={restartRecording}
					isRestarting={isRestarting}
				/>
			)}
			{selectedCameraId && (
				<CameraPreviewWindow
					cameraId={selectedCameraId}
					onClose={() => handleCameraChange(null)}
				/>
			)}
		</>
	);
};
