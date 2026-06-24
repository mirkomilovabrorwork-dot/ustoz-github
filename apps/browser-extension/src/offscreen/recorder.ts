// ── Offscreen recorder ──────────────────────────────────────────────────────
//
// This document runs ONLY the Google Meet (tab-capture) recording path.
//
// Why offscreen + tabCapture (and NOT desktopCapture / getDisplayMedia here):
//   • The service worker calls chrome.tabCapture.getMediaStreamId({ targetTabId })
//     which returns a *serializable* streamId.
//   • That streamId is handed to THIS document, which calls getUserMedia with
//     chromeMediaSource: "tab". Tab streamIds ARE consumable inside an offscreen
//     document — unlike desktopCapture streamIds, which are blocked here.
//   • getDisplayMedia() is impossible in a programmatic offscreen document (no
//     user gesture / activation), so full-screen INSTRUCTION recording lives in
//     the visible recorder.html page instead — NOT here.
//
// The message protocol to the service worker (RECORDER_STARTED / RECORDER_CHUNK /
// RECORDER_STOPPED / RECORDER_ERROR) is shared with recorder.html so the upload
// pipeline in the SW is identical for both paths.

interface StartCaptureMsg {
	type: "START_CAPTURE";
	streamId: string;
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

function sendMsgAwait(msg: Record<string, unknown>): Promise<unknown> {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage(msg, (response: unknown) => {
			if (chrome.runtime.lastError) {
				resolve({ ok: false, error: chrome.runtime.lastError.message });
			} else {
				resolve(response);
			}
		});
	});
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
		if (!msg.streamId) throw new Error("streamId required for tab capture");

		// Tab capture: consume the streamId minted by tabCapture.getMediaStreamId
		// in the service worker. Audio + video share the same streamId.
		let displayStream: MediaStream;
		try {
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
		} catch {
			// The tab may expose no audio — fall back to video-only so the
			// meeting screen is still captured rather than failing outright.
			displayStream = await navigator.mediaDevices.getUserMedia({
				video: {
					mandatory: {
						chromeMediaSource: "tab",
						chromeMediaSourceId: msg.streamId,
					},
				} as unknown as MediaTrackConstraints,
			});
		}

		let micStream: MediaStream | null = null;
		if (msg.micEnabled !== false) {
			try {
				// Use the specific device when one was chosen; otherwise capture the
				// system default mic so an enabled mic is never silently dropped.
				micStream = await navigator.mediaDevices.getUserMedia({
					audio: msg.micDeviceId
						? { deviceId: { exact: msg.micDeviceId } }
						: true,
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
			// Tab capture mutes the tab for the user by default; route the captured
			// tab audio back to the speakers so the meeting is still audible.
			displaySrc.connect(audioCtx.destination);
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
			videoBitsPerSecond: 600_000,
			audioBitsPerSecond: 96_000,
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

		// Wait for the SW to initialize the upload (state → "recording") BEFORE
		// capturing. If we started immediately, the first tab-capture chunks
		// would arrive while the SW is still "arming" and be dropped → 0 bytes.
		const startResp = (await sendMsgAwait({
			type: "RECORDER_STARTED",
			mime,
			hasVideo: displayStream.getVideoTracks().length > 0,
			hasAudio: dest.stream.getAudioTracks().length > 0,
		})) as { ok?: boolean; error?: string } | undefined;

		if (!startResp?.ok) {
			if (state) {
				cleanup(state);
				state = null;
			}
			sendMsg({
				type: "RECORDER_ERROR",
				error: startResp?.error ?? "Couldn't start the upload session.",
			});
			return;
		}

		recorder.start(1000);
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
