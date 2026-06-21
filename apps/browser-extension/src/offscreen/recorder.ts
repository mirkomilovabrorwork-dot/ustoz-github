type CaptureMode = "picker" | "silent-tab" | "desktop";

interface StartCaptureMsg {
	type: "START_CAPTURE";
	mode: CaptureMode;
	streamId?: string;
	micEnabled?: boolean;
	micDeviceId?: string;
}

interface StopCaptureMsg {
	type: "STOP_CAPTURE";
}

interface PauseCaptureMsg {
	type: "PAUSE_CAPTURE";
}

interface ResumeCaptureMsg {
	type: "RESUME_CAPTURE";
}

type InboundMsg =
	| StartCaptureMsg
	| StopCaptureMsg
	| PauseCaptureMsg
	| ResumeCaptureMsg;

interface RecordingState {
	recorder: MediaRecorder;
	audioCtx: AudioContext;
	displayStream: MediaStream;
	micStream: MediaStream | null;
	chunkIndex: number;
}

let state: RecordingState | null = null;

function pickMimeType(): string {
	const candidates = [
		"video/mp4;codecs=h264",
		"video/mp4",
		"video/webm;codecs=vp9,opus",
		"video/webm;codecs=vp8,opus",
		"video/webm",
	];
	for (const mime of candidates) {
		if (MediaRecorder.isTypeSupported(mime)) return mime;
	}
	return "video/webm";
}

function sendMsg(msg: Record<string, unknown>): void {
	chrome.runtime.sendMessage(msg).catch(() => {});
}

function cleanup(s: RecordingState): void {
	for (const t of s.displayStream.getTracks()) t.stop();
	if (s.micStream) for (const t of s.micStream.getTracks()) t.stop();
	s.audioCtx.close().catch(() => {});
}

async function startCapture(msg: StartCaptureMsg): Promise<void> {
	if (state) {
		cleanup(state);
		state = null;
	}

	try {
		let displayStream: MediaStream;

		if (msg.mode === "desktop") {
			if (!msg.streamId) throw new Error("streamId required for desktop mode");
			const desktopVideo = {
				mandatory: {
					chromeMediaSource: "desktop",
					chromeMediaSourceId: msg.streamId,
				},
			} as unknown as MediaTrackConstraints;
			const desktopAudio = {
				mandatory: {
					chromeMediaSource: "desktop",
					chromeMediaSourceId: msg.streamId,
				},
			} as unknown as MediaTrackConstraints;
			try {
				// Prefer capturing system audio alongside the video.
				displayStream = await navigator.mediaDevices.getUserMedia({
					video: desktopVideo,
					audio: desktopAudio,
				});
			} catch {
				// The chosen source may expose no desktop audio (e.g. a window or
				// tab without "share audio"). Don't fail the whole recording —
				// fall back to video-only so the screen is still captured.
				displayStream = await navigator.mediaDevices.getUserMedia({
					video: desktopVideo,
				});
			}
		} else if (msg.mode === "picker") {
			displayStream = await navigator.mediaDevices.getDisplayMedia({
				video: {
					width: { max: 1280 },
					height: { max: 720 },
					frameRate: { max: 30 },
				},
				audio: true,
			});
		} else {
			if (!msg.streamId)
				throw new Error("streamId required for silent-tab mode");
			displayStream = await navigator.mediaDevices.getUserMedia({
				video: {
					mandatory: {
						chromeMediaSource: "tab",
						chromeMediaSourceId: msg.streamId,
					},
				} as unknown as MediaTrackConstraints,
				audio: {
					mandatory: {
						chromeMediaSource: "tab",
						chromeMediaSourceId: msg.streamId,
					},
				} as unknown as MediaTrackConstraints,
			});
		}

		let micStream: MediaStream | null = null;
		if (msg.micEnabled !== false && msg.micDeviceId) {
			try {
				micStream = await navigator.mediaDevices.getUserMedia({
					audio: { deviceId: { exact: msg.micDeviceId } },
				});
			} catch {
				try {
					micStream = await navigator.mediaDevices.getUserMedia({
						audio: true,
					});
				} catch {
					micStream = null;
				}
			}
		}

		const audioCtx = new AudioContext({ sampleRate: 48000 });
		const dest = audioCtx.createMediaStreamDestination();

		if (displayStream.getAudioTracks().length > 0) {
			const displaySrc = audioCtx.createMediaStreamSource(displayStream);
			displaySrc.connect(dest);
			if (msg.mode === "silent-tab") {
				displaySrc.connect(audioCtx.destination);
			}
		}

		if (micStream && micStream.getAudioTracks().length > 0) {
			audioCtx.createMediaStreamSource(micStream).connect(dest);
		}

		const recordStream = new MediaStream([
			...displayStream.getVideoTracks(),
			...dest.stream.getAudioTracks(),
		]);

		const mime = pickMimeType();
		const recorder = new MediaRecorder(recordStream, {
			mimeType: mime,
			videoBitsPerSecond: 1_200_000,
			audioBitsPerSecond: 128_000,
		});

		let chunkIndex = 0;

		recorder.ondataavailable = async (e) => {
			if (e.data.size <= 0) return;
			const buffer = await e.data.arrayBuffer();
			sendMsg({
				type: "RECORDER_CHUNK",
				chunk: Array.from(new Uint8Array(buffer)),
				index: chunkIndex++,
				mime: recorder.mimeType,
				ts: Date.now(),
			});
		};

		recorder.onerror = () => {
			sendMsg({ type: "RECORDER_ERROR", error: "MediaRecorder error" });
			if (state) {
				cleanup(state);
				state = null;
			}
		};

		recorder.onstop = () => {
			if (state) {
				cleanup(state);
				state = null;
			}
			sendMsg({ type: "RECORDER_STOPPED" });
		};

		const videoTracks = displayStream.getVideoTracks();
		if (videoTracks.length > 0) {
			videoTracks[0].onended = () => {
				if (state && state.recorder.state !== "inactive") {
					state.recorder.stop();
				}
			};
		}

		state = { recorder, audioCtx, displayStream, micStream, chunkIndex };

		recorder.start(1000);

		sendMsg({
			type: "RECORDER_STARTED",
			mime,
			hasVideo: displayStream.getVideoTracks().length > 0,
			hasAudio: dest.stream.getAudioTracks().length > 0,
		});
	} catch (err) {
		sendMsg({
			type: "RECORDER_ERROR",
			error: err instanceof Error ? err.message : String(err),
		});
		if (state) {
			cleanup(state);
			state = null;
		}
	}
}

chrome.runtime.onMessage.addListener((raw: unknown) => {
	const msg = raw as InboundMsg;

	if (msg.type === "START_CAPTURE") {
		startCapture(msg).catch((err) => {
			sendMsg({
				type: "RECORDER_ERROR",
				error: err instanceof Error ? err.message : String(err),
			});
		});
		return;
	}

	if (msg.type === "STOP_CAPTURE") {
		if (!state) return;
		if (state.recorder.state !== "inactive") {
			state.recorder.stop();
		} else {
			cleanup(state);
			state = null;
			sendMsg({ type: "RECORDER_STOPPED" });
		}
		return;
	}

	if (msg.type === "PAUSE_CAPTURE") {
		if (state && state.recorder.state === "recording") {
			state.recorder.pause();
		}
		return;
	}

	if (msg.type === "RESUME_CAPTURE") {
		if (state && state.recorder.state === "paused") {
			state.recorder.resume();
		}
		return;
	}
});
