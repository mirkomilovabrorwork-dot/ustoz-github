// ── Visible recorder page (INSTRUCTION path) ────────────────────────────────
//
// Full-screen instruction recording REQUIRES getDisplayMedia(), which can only
// run in a VISIBLE page with a real user gesture — it is impossible in a
// service worker or a programmatic offscreen document. So this dedicated
// extension tab owns the entire capture:
//
//   1. User clicks "Choose screen & start"  → real user gesture.
//   2. navigator.mediaDevices.getDisplayMedia(...) → MediaStream lives HERE.
//   3. MediaRecorder runs HERE; chunks are streamed to the service worker using
//      the SAME protocol the offscreen recorder uses (RECORDER_STARTED /
//      RECORDER_CHUNK / RECORDER_STOPPED / RECORDER_ERROR), so the SW upload
//      pipeline is identical for both paths.
//
// The MediaStream is NOT serializable, so it can never be created elsewhere and
// posted in — that is exactly why the capture must originate from this page.
// This tab must stay open for the duration of the recording.

interface RecorderSettings {
	micEnabled: boolean;
	micDeviceId: string;
}

interface RecordingState {
	recorder: MediaRecorder;
	audioCtx: AudioContext;
	displayStream: MediaStream;
	micStream: MediaStream | null;
}

let state: RecordingState | null = null;
let startedAt = 0;
let timerInterval: ReturnType<typeof setInterval> | null = null;
let lastShareUrl = "";

// ── View switching ──────────────────────────────────────────────────────────

const VIEWS = [
	"view-idle",
	"view-recording",
	"view-uploading",
	"view-complete",
	"view-error",
] as const;
type ViewId = (typeof VIEWS)[number];

function showView(id: ViewId): void {
	for (const v of VIEWS) {
		const el = document.getElementById(v);
		if (el) el.classList.toggle("hidden", v !== id);
	}
}

function $(id: string): HTMLElement | null {
	return document.getElementById(id);
}

function setIdleMsg(text: string, isError: boolean): void {
	const el = $("idle-msg");
	if (!el) return;
	el.textContent = text;
	el.classList.toggle("msg-error", isError);
}

// ── SW messaging ────────────────────────────────────────────────────────────

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

// ── Timer ───────────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function startTimer(): void {
	stopTimer();
	startedAt = Date.now();
	const el = $("timer");
	if (el) el.textContent = "00:00";
	timerInterval = setInterval(() => {
		const t = $("timer");
		if (t) t.textContent = formatElapsed(Date.now() - startedAt);
	}, 1000);
}

function stopTimer(): void {
	if (timerInterval !== null) {
		clearInterval(timerInterval);
		timerInterval = null;
	}
}

// ── Recorder helpers ────────────────────────────────────────────────────────

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

function cleanup(s: RecordingState): void {
	for (const t of s.displayStream.getTracks()) t.stop();
	if (s.micStream) for (const t of s.micStream.getTracks()) t.stop();
	s.audioCtx.close().catch(() => {});
}

async function getSettings(): Promise<RecorderSettings> {
	const resp = (await sendMsgAwait({ type: "GET_ALL_SETTINGS" })) as
		| Record<string, unknown>
		| undefined;
	return {
		micEnabled: resp?.micEnabled !== false,
		micDeviceId: typeof resp?.micDeviceId === "string" ? resp.micDeviceId : "",
	};
}

// ── Start recording (called from a user gesture) ────────────────────────────

async function startRecording(): Promise<void> {
	setIdleMsg("", false);
	const startBtn = $("btn-start") as HTMLButtonElement | null;
	if (startBtn) startBtn.disabled = true;

	const settings = await getSettings();

	let displayStream: MediaStream;
	try {
		displayStream = await navigator.mediaDevices.getDisplayMedia({
			video: {
				width: { max: 1920 },
				height: { max: 1080 },
				frameRate: { max: 30 },
			},
			audio: true,
		});
	} catch (err) {
		// User cancelled the picker, or capture is blocked. NEVER silently
		// pretend success — surface a clear message and stay on the idle view.
		// Release the SW "arming" lock so future recordings aren't blocked.
		sendMsg({ type: "INSTRUCTION_CANCEL" });
		const name = err instanceof Error ? err.name : "";
		const friendly =
			name === "NotAllowedError"
				? "Screen sharing was cancelled. Click the button to try again."
				: `Couldn't start screen capture: ${err instanceof Error ? err.message : String(err)}`;
		setIdleMsg(friendly, true);
		if (startBtn) startBtn.disabled = false;
		return;
	}

	try {
		let micStream: MediaStream | null = null;
		if (settings.micEnabled && settings.micDeviceId) {
			try {
				micStream = await navigator.mediaDevices.getUserMedia({
					audio: { deviceId: { exact: settings.micDeviceId } },
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
		} else if (settings.micEnabled) {
			try {
				micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
			} catch {
				micStream = null;
			}
		}

		const audioCtx = new AudioContext({ sampleRate: 48000 });
		const dest = audioCtx.createMediaStreamDestination();

		if (displayStream.getAudioTracks().length > 0) {
			audioCtx.createMediaStreamSource(displayStream).connect(dest);
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
			stopTimer();
			sendMsg({ type: "RECORDER_STOPPED" });
		};

		// If the user clicks the browser's native "Stop sharing" control, the
		// video track ends — stop the recorder so the upload finalizes.
		const videoTracks = displayStream.getVideoTracks();
		if (videoTracks.length > 0) {
			videoTracks[0].onended = () => {
				if (state && state.recorder.state !== "inactive") {
					state.recorder.stop();
				}
			};
		}

		state = { recorder, audioCtx, displayStream, micStream };

		// Initialize the upload BEFORE producing any media data. The SW creates
		// the video + multipart session in its RECORDER_STARTED handler and only
		// replies { ok: true } once it has set state to "recording". We MUST wait
		// for that ok before recorder.start(), otherwise the first chunks arrive
		// while the SW is still "arming" and get dropped → totalBytes=0 →
		// "No recording data was captured". (This was an intermittent failure:
		// it only struck when upload-init was slower than the first chunk.)
		const startResp = (await sendMsgAwait({
			type: "RECORDER_STARTED",
			mime,
			hasVideo: displayStream.getVideoTracks().length > 0,
			hasAudio: dest.stream.getAudioTracks().length > 0,
		})) as { ok?: boolean; error?: string } | undefined;

		if (!startResp?.ok) {
			cleanup(state);
			state = null;
			const reason = startResp?.error ?? "Couldn't start the upload session.";
			setIdleMsg(`Couldn't start recording: ${reason}`, true);
			showView("view-idle");
			if (startBtn) startBtn.disabled = false;
			return;
		}

		// Upload session is ready and the SW is in "recording" — capture is now
		// safe; no chunk can be dropped for arriving "too early".
		recorder.start(1000);

		showView("view-recording");
		startTimer();
	} catch (err) {
		if (state) {
			cleanup(state);
			state = null;
		}
		sendMsg({
			type: "RECORDER_ERROR",
			error: err instanceof Error ? err.message : String(err),
		});
		setIdleMsg(
			`Couldn't start recording: ${err instanceof Error ? err.message : String(err)}`,
			true,
		);
		showView("view-idle");
		if (startBtn) startBtn.disabled = false;
	}
}

function stopRecording(): void {
	if (state && state.recorder.state !== "inactive") {
		state.recorder.stop();
	} else {
		stopTimer();
		sendMsg({ type: "RECORDER_STOPPED" });
	}
}

// ── State-change driven UI (uploading / complete / error) ───────────────────

interface BroadcastState {
	kind: string;
	shareUrl?: string;
	reason?: string;
	uploadedBytes?: number;
	totalBytes?: number;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function handleStateChange(s: BroadcastState): void {
	switch (s.kind) {
		case "uploading": {
			stopTimer();
			const pct =
				s.totalBytes && s.totalBytes > 0
					? Math.round(((s.uploadedBytes ?? 0) / s.totalBytes) * 100)
					: 0;
			const el = $("upload-progress");
			if (el) {
				el.textContent = `${formatBytes(s.uploadedBytes ?? 0)} uploaded (${pct}%)`;
			}
			showView("view-uploading");
			break;
		}
		case "finishing": {
			stopTimer();
			const el = $("upload-progress");
			if (el) el.textContent = "Finishing up…";
			showView("view-uploading");
			break;
		}
		case "complete": {
			stopTimer();
			lastShareUrl = s.shareUrl ?? "";
			const el = $("complete-url");
			if (el) el.textContent = lastShareUrl;
			showView("view-complete");
			break;
		}
		case "error": {
			stopTimer();
			if (state) {
				if (state.recorder.state !== "inactive") {
					try { state.recorder.stop(); } catch (_) {}
				}
				cleanup(state);
				state = null;
			}
			const el = $("error-msg");
			if (el) el.textContent = s.reason ?? "Unknown error";
			showView("view-error");
			break;
		}
		case "idle": {
			// SW reset (e.g. after dismiss). Only reset our UI if we're not
			// mid-capture in this tab.
			if (!state) {
				stopTimer();
				showView("view-idle");
				const startBtn = $("btn-start") as HTMLButtonElement | null;
				if (startBtn) startBtn.disabled = false;
				setIdleMsg("", false);
			}
			break;
		}
	}
}

// ── Wire up ─────────────────────────────────────────────────────────────────

function wire(): void {
	$("btn-start")?.addEventListener("click", () => {
		startRecording().catch((err) => {
			setIdleMsg(
				`Couldn't start: ${err instanceof Error ? err.message : String(err)}`,
				true,
			);
		});
	});

	$("btn-cancel")?.addEventListener("click", () => {
		window.close();
	});

	$("btn-stop")?.addEventListener("click", () => {
		const btn = $("btn-stop") as HTMLButtonElement | null;
		if (btn) {
			btn.disabled = true;
			btn.textContent = "Finishing…";
		}
		stopRecording();
	});

	$("btn-copy")?.addEventListener("click", () => {
		if (!lastShareUrl) return;
		navigator.clipboard.writeText(lastShareUrl).then(() => {
			const btn = $("btn-copy");
			if (btn) {
				btn.textContent = "Copied!";
				setTimeout(() => {
					btn.textContent = "Copy link";
				}, 2000);
			}
		});
	});

	$("btn-open")?.addEventListener("click", () => {
		if (lastShareUrl) chrome.tabs.create({ url: lastShareUrl });
	});

	$("btn-close")?.addEventListener("click", () => {
		sendMsg({ type: "CANCEL" });
		window.close();
	});

	$("btn-retry")?.addEventListener("click", () => {
		sendMsg({ type: "RETRY" });
		showView("view-idle");
		const startBtn = $("btn-start") as HTMLButtonElement | null;
		if (startBtn) startBtn.disabled = false;
		setIdleMsg("", false);
	});

	$("btn-close-err")?.addEventListener("click", () => {
		sendMsg({ type: "CANCEL" });
		window.close();
	});

	chrome.runtime.onMessage.addListener((message: unknown) => {
		if (typeof message !== "object" || message === null) return;
		const msg = message as Record<string, unknown>;
		if (msg.type === "STATE_CHANGED") {
			const s = msg.state as BroadcastState;
			if (s) handleStateChange(s);
		} else if (msg.type === "STOP_CAPTURE") {
			stopRecording();
		} else if (msg.type === "PAUSE_CAPTURE") {
			if (state && state.recorder.state === "recording") {
				state.recorder.pause();
			}
		} else if (msg.type === "RESUME_CAPTURE") {
			if (state && state.recorder.state === "paused") {
				state.recorder.resume();
			}
		}
	});

	// If the user closes this tab mid-recording, stop cleanly so the SW can
	// finalize whatever was captured. If the tab is closed before recording
	// ever started, release the SW "arming" lock so it isn't stuck.
	window.addEventListener("beforeunload", () => {
		if (state && state.recorder.state !== "inactive") {
			state.recorder.stop();
		} else if (!state) {
			sendMsg({ type: "INSTRUCTION_CANCEL" });
		}
	});
}

showView("view-idle");
wire();
