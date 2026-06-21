// ── Types ──────────────────────────────────────────────────────────────────────

type NudgeState =
	| "default"
	| "countdown"
	| "recording"
	| "finishing"
	| "complete"
	| "error"
	| "hidden";

interface Settings {
	autoRecord: boolean;
	autoRecordCountdownSec: number;
	soundEnabled: boolean;
}

interface StateChangedMessage {
	type: "STATE_CHANGED";
	state: {
		kind: string;
		shareUrl?: string;
		reason?: string;
		recoverable?: boolean;
		uploadedBytes?: number;
		totalBytes?: number;
		paused?: boolean;
		startedAt?: number;
	};
}

type OutboundMessage =
	| { type: "MEET_CALL_STARTED"; meetingId: string }
	| { type: "MEET_CALL_ENDED"; meetingId: string }
	| { type: "MEET_NUDGE_RECORD_NOW"; meetingId: string }
	| { type: "MEET_NUDGE_LATER" }
	| { type: "MEET_NUDGE_DISMISS" }
	| { type: "GET_SETTINGS" }
	| { type: "STOP" }
	| { type: "CANCEL" }
	| { type: "RETRY" };

// ── State ─────────────────────────────────────────────────────────────────────

let meetingId: string | null = null;
let nudgeState: NudgeState = "hidden";
let laterUntil = 0;
let dismissed = false;
let inCall = false;

const settings: Settings = {
	autoRecord: false,
	autoRecordCountdownSec: 5,
	soundEnabled: false,
};

let countdownTimer: ReturnType<typeof setInterval> | null = null;
let countdownRemaining = 0;
let recordingStartTime = 0;
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
let meetEndTimer: ReturnType<typeof setTimeout> | null = null;
let nudgeRecorder: {
	recorder: MediaRecorder;
	audioCtx: AudioContext;
	displayStream: MediaStream;
	micStream: MediaStream | null;
	chunkIndex: number;
} | null = null;

let shadowHost: HTMLElement | null = null;
let shadowRoot: ShadowRoot | null = null;

const LATER_MS = 12 * 60 * 1000;
const MEET_END_DEBOUNCE_MS = 5000;

// ── Meet detection ────────────────────────────────────────────────────────────

function isMeetingUrl(): boolean {
	return /^\/[a-z]+-[a-z]+-[a-z]+/.test(location.pathname);
}

function isInMeeting(): boolean {
	return !!(
		document.querySelector('[aria-label="Leave call"]') ||
		document.querySelector('[aria-label*="Leave call"]') ||
		document.querySelector('[data-tooltip="Leave call"]') ||
		document.querySelector('[data-tooltip*="Leave call"]')
	);
}

function currentMeetingId(): string | null {
	const m = location.pathname.match(/^(\/[a-z]+-[a-z]+-[a-z]+)/);
	return m ? m[1] : null;
}

function cancelMeetEnded(): void {
	if (meetEndTimer !== null) {
		clearTimeout(meetEndTimer);
		meetEndTimer = null;
	}
}

function scheduleMeetEnded(): void {
	if (meetEndTimer !== null) return;
	const id = meetingId;
	meetEndTimer = setTimeout(() => {
		meetEndTimer = null;
		if (!inCall) return;
		if (isMeetingUrl() && isInMeeting()) return;
		inCall = false;
		if (id) sendToBackground({ type: "MEET_CALL_ENDED", meetingId: id });
		stopCountdown();
		if (elapsedTimer !== null) {
			clearInterval(elapsedTimer);
			elapsedTimer = null;
		}
		if (nudgeState !== "recording") {
			clearNudge();
			nudgeState = "hidden";
		}
	}, MEET_END_DEBOUNCE_MS);
}

function friendlyStartError(error: unknown): string {
	const raw = typeof error === "string" ? error.toLowerCase() : "";
	if (raw.includes("already")) return "A recording is already running.";
	if (raw.includes("not signed")) return "Sign in to data365 first.";
	if (
		raw.includes("not been invoked") ||
		raw.includes("activetab") ||
		raw.includes("active tab")
	) {
		return "Click the data365 extension icon, then Record Meeting.";
	}
	if (raw.includes("meet tab") || raw.includes("tab")) {
		return "Open this Meet tab, then try Record now again.";
	}
	return "Couldn't start recording. Try the extension popup.";
}

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

function cleanupNudgeRecorder(): void {
	if (!nudgeRecorder) return;
	for (const track of nudgeRecorder.displayStream.getTracks()) track.stop();
	if (nudgeRecorder.micStream) {
		for (const track of nudgeRecorder.micStream.getTracks()) track.stop();
	}
	nudgeRecorder.audioCtx.close().catch(() => {});
	nudgeRecorder = null;
}

// ── Sound helpers ─────────────────────────────────────────────────────────────

function sineNode(
	ctx: AudioContext,
	freq: number,
	t: number,
	startOffset: number,
	dur: number,
	vol: number,
): void {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.type = "sine";
	osc.frequency.setValueAtTime(freq, t + startOffset);
	gain.gain.setValueAtTime(0, t + startOffset);
	gain.gain.linearRampToValueAtTime(vol, t + startOffset + 0.008);
	gain.gain.exponentialRampToValueAtTime(0.001, t + startOffset + dur);
	osc.start(t + startOffset);
	osc.stop(t + startOffset + dur);
}

function soundDroplet(ctx: AudioContext, t: number): void {
	const osc = ctx.createOscillator();
	const gain = ctx.createGain();
	osc.connect(gain);
	gain.connect(ctx.destination);
	osc.type = "sine";
	osc.frequency.setValueAtTime(1700, t);
	osc.frequency.exponentialRampToValueAtTime(360, t + 0.11);
	gain.gain.setValueAtTime(0, t);
	gain.gain.linearRampToValueAtTime(0.12, t + 0.005);
	gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
	osc.start(t);
	osc.stop(t + 0.28);
}

function soundChime(ctx: AudioContext, t: number): void {
	sineNode(ctx, 880, t, 0, 0.38, 0.12);
	sineNode(ctx, 1318, t, 0.16, 0.5, 0.10);
}

function playAudio(fn: (ctx: AudioContext, t: number) => void): void {
	if (!settings.soundEnabled) return;
	try {
		const ctx = new AudioContext();
		const play = () => {
			fn(ctx, ctx.currentTime);
			setTimeout(() => ctx.close().catch(() => {}), 1500);
		};
		if (ctx.state === "suspended") {
			ctx
				.resume()
				.then(play)
				.catch(() => {});
		} else {
			play();
		}
	} catch (_) {}
}

// ── Shadow DOM + CSS ──────────────────────────────────────────────────────────

const NUDGE_CSS = `
:host { all: initial; }

.cap-nudge-container {
	position: fixed;
	top: 16px;
	left: 50%;
	transform: translateX(-50%);
	z-index: 2147483647;
	font-family: system-ui, sans-serif;
	font-size: 14px;
	color: #1a1a1a;
	pointer-events: all;
	user-select: none;
}

@keyframes cap-nudge-in {
	from { opacity: 0; transform: translateY(-12px); }
	to   { opacity: 1; transform: translateY(0); }
}

@keyframes cap-nudge-out {
	from { opacity: 1; transform: translateY(0); }
	to   { opacity: 0; transform: translateY(-8px); }
}

@keyframes cap-nudge-pulse {
	0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.65); }
	55%       { box-shadow: 0 0 0 6px rgba(239,68,68,0); }
}

.cap-nudge-card {
	background: #ffffff;
	border-radius: 12px;
	box-shadow: 0 8px 24px rgba(0,0,0,0.18);
	padding: 16px;
	width: 320px;
	box-sizing: border-box;
	animation: cap-nudge-in .25s cubic-bezier(.2,.8,.4,1) both;
}

.cap-nudge-card.cap-nudge-leaving { animation: cap-nudge-out .2s ease-in both; }

.cap-nudge-title {
	font-weight: 700;
	font-size: 15px;
	margin: 0 0 4px 0;
	color: #111;
}

.cap-nudge-subtitle {
	font-size: 12px;
	color: #666;
	margin: 0 0 14px 0;
}

.cap-nudge-buttons {
	display: flex;
	gap: 8px;
	align-items: center;
}

.cap-nudge-btn-primary {
	background: #675FFF;
	color: #fff;
	border: none;
	border-radius: 8px;
	padding: 8px 16px;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	font-family: inherit;
	transition: filter .15s, transform .1s, outline .1s;
	white-space: nowrap;
}

.cap-nudge-btn-primary:hover { filter: brightness(1.1); }

.cap-nudge-btn-primary:active {
	transform: scale(0.97);
	opacity: 0.85;
}

.cap-nudge-btn-primary:focus-visible {
	outline: 2px solid #6366f1;
	outline-offset: 2px;
}

.cap-nudge-btn-secondary {
	background: #f3f4f6;
	color: #374151;
	border: none;
	border-radius: 8px;
	padding: 8px 14px;
	font-size: 13px;
	font-weight: 500;
	cursor: pointer;
	font-family: inherit;
	transition: background .15s, transform .1s, outline .1s;
	white-space: nowrap;
}

.cap-nudge-btn-secondary:hover { background: #e5e7eb; }

.cap-nudge-btn-secondary:active {
	transform: scale(0.97);
	opacity: 0.85;
}

.cap-nudge-btn-secondary:focus-visible {
	outline: 2px solid #6366f1;
	outline-offset: 2px;
}

.cap-nudge-btn-dismiss {
	background: transparent;
	border: none;
	color: #9ca3af;
	font-size: 12px;
	cursor: pointer;
	font-family: inherit;
	padding: 4px 8px;
	text-decoration: underline;
	white-space: nowrap;
	transition: color .15s, opacity .1s;
}

.cap-nudge-btn-dismiss:hover { color: #6b7280; }

.cap-nudge-btn-dismiss:active { opacity: 0.5; }

.cap-nudge-btn-cancel {
	display: block;
	width: 100%;
	background: #f3f4f6;
	color: #374151;
	border: none;
	border-radius: 8px;
	padding: 9px 0;
	font-size: 13px;
	font-weight: 600;
	cursor: pointer;
	font-family: inherit;
	margin-bottom: 8px;
	transition: background .15s;
}

.cap-nudge-btn-cancel:hover { background: #e5e7eb; }

.cap-nudge-no-auto {
	display: block;
	text-align: center;
	background: transparent;
	border: none;
	color: #9ca3af;
	font-size: 11px;
	cursor: pointer;
	font-family: inherit;
	text-decoration: underline;
}

.cap-nudge-no-auto:hover { color: #6b7280; }

.cap-nudge-pill {
	background: #111827;
	border-radius: 999px;
	padding: 8px 14px;
	display: inline-flex;
	align-items: center;
	gap: 10px;
	box-shadow: 0 4px 12px rgba(0,0,0,0.15);
	animation: cap-nudge-in .25s cubic-bezier(.2,.8,.4,1) both;
}

.cap-nudge-pill.cap-nudge-leaving { animation: cap-nudge-out .2s ease-in both; }

.cap-nudge-dot {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: #ef4444;
	flex-shrink: 0;
	animation: cap-nudge-pulse 1.9s ease-out infinite;
}

.cap-nudge-elapsed {
	font-size: 13px;
	font-weight: 600;
	color: #f9fafb;
	font-variant-numeric: tabular-nums;
	min-width: 52px;
}

.cap-nudge-paused-label {
	font-size: 11px;
	color: #9ca3af;
}

.cap-nudge-btn-stop {
	background: #ef4444;
	color: #fff;
	border: none;
	border-radius: 6px;
	padding: 4px 10px;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	font-family: inherit;
	transition: filter .15s, transform .1s, outline .1s;
}

.cap-nudge-btn-stop:hover { filter: brightness(1.1); }

.cap-nudge-btn-stop:active {
	transform: scale(0.97);
	opacity: 0.85;
}

.cap-nudge-btn-stop:focus-visible {
	outline: 2px solid #6366f1;
	outline-offset: 2px;
}

.cap-nudge-progress {
	font-size: 11px;
	color: #9ca3af;
	margin-left: 4px;
}

.cap-nudge-complete-card {
	background: #ffffff;
	border-radius: 12px;
	box-shadow: 0 8px 24px rgba(0,0,0,0.18);
	padding: 16px;
	width: 320px;
	box-sizing: border-box;
	animation: cap-nudge-in .25s cubic-bezier(.2,.8,.4,1) both;
}

.cap-nudge-complete-card.cap-nudge-leaving { animation: cap-nudge-out .2s ease-in both; }

.cap-nudge-complete-check {
	font-size: 28px;
	color: #38a169;
	margin: 0 0 4px 0;
}

.cap-nudge-share-url {
	font-size: 11px;
	color: #666;
	word-break: break-all;
	margin: 4px 0 10px 0;
}

.cap-nudge-btn-copy {
	background: #675FFF;
	color: #fff;
	border: none;
	border-radius: 8px;
	padding: 7px 14px;
	font-size: 12px;
	font-weight: 600;
	cursor: pointer;
	font-family: inherit;
	transition: filter .15s, transform .1s, outline .1s;
	white-space: nowrap;
}

.cap-nudge-btn-copy:hover { filter: brightness(1.1); }

.cap-nudge-btn-copy:active {
	transform: scale(0.97);
	opacity: 0.85;
}

.cap-nudge-btn-copy:focus-visible {
	outline: 2px solid #6366f1;
	outline-offset: 2px;
}

.cap-nudge-btn-open {
	background: #f3f4f6;
	color: #374151;
	border: none;
	border-radius: 8px;
	padding: 7px 14px;
	font-size: 12px;
	font-weight: 500;
	cursor: pointer;
	font-family: inherit;
	transition: background .15s;
	white-space: nowrap;
}

.cap-nudge-btn-open:hover { background: #e5e7eb; }

.cap-nudge-error-card {
	background: #ffffff;
	border-radius: 12px;
	box-shadow: 0 4px 24px rgba(0,0,0,.18), 0 1px 4px rgba(0,0,0,.08);
	padding: 16px;
	width: 320px;
	box-sizing: border-box;
	animation: cap-nudge-in .25s cubic-bezier(.2,.8,.4,1) both;
}

.cap-nudge-error-card.cap-nudge-leaving { animation: cap-nudge-out .2s ease-in both; }

.cap-nudge-error-msg {
	font-size: 12px;
	color: #e53e3e;
	margin: 4px 0 10px 0;
}
`;

function ensureShadowRoot(): ShadowRoot {
	if (shadowRoot) return shadowRoot;

	shadowHost = document.createElement("div");
	shadowHost.id = "cap-nudge-host";
	document.body.appendChild(shadowHost);

	shadowRoot = shadowHost.attachShadow({ mode: "closed" });

	const style = document.createElement("style");
	style.textContent = NUDGE_CSS;
	shadowRoot.appendChild(style);

	const container = document.createElement("div");
	container.className = "cap-nudge-container";
	container.id = "cap-nudge-container";
	shadowRoot.appendChild(container);

	return shadowRoot;
}

function getNudgeContainer(): HTMLElement | null {
	if (!shadowRoot) return null;
	return shadowRoot.getElementById("cap-nudge-container");
}

function clearNudge(onRemoved?: () => void): void {
	const container = getNudgeContainer();
	if (!container || !container.firstChild) {
		onRemoved?.();
		return;
	}
	const child = container.firstChild as HTMLElement;
	child.classList.add("cap-nudge-leaving");
	setTimeout(() => {
		child.remove();
		onRemoved?.();
	}, 190);
}

// ── DOM helpers ───────────────────────────────────────────────────────────────

function makeEl<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	className?: string,
	text?: string,
): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text) el.textContent = text;
	return el;
}

function makeBtn(className: string, text: string): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.className = className;
	btn.textContent = text;
	return btn;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function formatElapsed(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

// ── Nudge rendering ───────────────────────────────────────────────────────────

function renderDefaultNudge(): void {
	const root = ensureShadowRoot();
	const container = root.getElementById("cap-nudge-container");
	if (!container) return;

	container.textContent = "";
	const card = makeEl("div", "cap-nudge-card");

	const title = makeEl("div", "cap-nudge-title", "Record this meeting?");
	const subtitle = makeEl(
		"div",
		"cap-nudge-subtitle",
		"Make sure participants have agreed.",
	);
	const buttons = makeEl("div", "cap-nudge-buttons");

	const btnRecord = makeBtn("cap-nudge-btn-primary", "Record now");
	const btnLater = makeBtn("cap-nudge-btn-secondary", "Later");
	const btnDismiss = makeBtn("cap-nudge-btn-dismiss", "Dismiss");

	buttons.append(btnRecord, btnLater, btnDismiss);
	card.append(title, subtitle, buttons);
	container.appendChild(card);
	nudgeState = "default";

	btnRecord.addEventListener("click", (event) => {
		event.stopImmediatePropagation();
		btnRecord.disabled = true;
		btnRecord.textContent = "Starting...";
		startNudgeRecording(card, btnRecord).catch((err) => {
			showStartNote(
				card,
				`Couldn't start recording: ${err instanceof Error ? err.message : String(err)}`,
				true,
			);
			btnRecord.disabled = false;
			btnRecord.textContent = "Record now";
		});
	});


	btnLater.addEventListener("click", () => {
		sendToBackground({ type: "MEET_NUDGE_LATER" });
		laterUntil = Date.now() + LATER_MS;
		clearNudge();
		nudgeState = "hidden";
	});

	btnDismiss.addEventListener("click", () => {
		sendToBackground({ type: "MEET_NUDGE_DISMISS" });
		dismissed = true;
		clearNudge();
		nudgeState = "hidden";
	});
}

function renderCountdownNudge(): void {
	const root = ensureShadowRoot();
	const container = root.getElementById("cap-nudge-container");
	if (!container) return;

	container.textContent = "";
	countdownRemaining = settings.autoRecordCountdownSec;

	const card = makeEl("div", "cap-nudge-card");

	const titleEl = makeEl("div", "cap-nudge-title");
	const titleText = document.createTextNode("Starting recording in ");
	const numSpan = makeEl("span", undefined, String(countdownRemaining));
	const titleSuffix = document.createTextNode("s");
	titleEl.append(titleText, numSpan, titleSuffix);

	const btnCancel = makeBtn("cap-nudge-btn-cancel", "Cancel");
	const btnNoAuto = makeBtn(
		"cap-nudge-no-auto",
		"Don’t auto-record this meeting",
	);

	card.append(titleEl, btnCancel, btnNoAuto);
	container.appendChild(card);
	nudgeState = "countdown";

	const onCancel = () => {
		stopCountdown();
		sendToBackground({ type: "MEET_NUDGE_DISMISS" });
		dismissed = true;
		clearNudge();
		nudgeState = "hidden";
	};

	btnCancel.addEventListener("click", onCancel);
	btnNoAuto.addEventListener("click", onCancel);

	countdownTimer = setInterval(() => {
		countdownRemaining -= 1;
		numSpan.textContent = String(countdownRemaining);
		if (countdownRemaining <= 0) {
			stopCountdown();
			playAudio(soundChime);
			renderDefaultNudge();
			const activeCard = getNudgeContainer()?.querySelector(
				".cap-nudge-card",
			) as HTMLElement | null;
			if (activeCard) {
				showStartNote(
					activeCard,
					"Click Record now to choose what to share.",
					false,
				);
			}
		}
	}, 1000);
}

function stopCountdown(): void {
	if (countdownTimer !== null) {
		clearInterval(countdownTimer);
		countdownTimer = null;
	}
}

function renderRecordingPill(paused = false): void {
	const root = ensureShadowRoot();
	const container = root.getElementById("cap-nudge-container");
	if (!container) return;

	container.textContent = "";
	if (recordingStartTime === 0) recordingStartTime = Date.now();

	const pill = makeEl("div", "cap-nudge-pill");
	const dot = makeEl("span", "cap-nudge-dot");
	const elapsed = makeEl(
		"span",
		"cap-nudge-elapsed",
		formatElapsed(Date.now() - recordingStartTime),
	);
	elapsed.id = "cap-elapsed";
	const btnStop = makeBtn("cap-nudge-btn-stop", "Stop");

	if (paused) {
		const pausedLabel = makeEl("span", "cap-nudge-paused-label", "Paused");
		pill.append(dot, elapsed, pausedLabel, btnStop);
	} else {
		pill.append(dot, elapsed, btnStop);
	}

	container.appendChild(pill);
	nudgeState = "recording";

	if (elapsedTimer !== null) clearInterval(elapsedTimer);
	if (!paused) {
		elapsedTimer = setInterval(() => {
			const el = container.querySelector("#cap-elapsed");
			if (el) el.textContent = formatElapsed(Date.now() - recordingStartTime);
		}, 1000);
	}

	btnStop.addEventListener("click", () => {
		sendToBackground({ type: "STOP" });
	});
}

function renderFinishingPill(): void {
	const root = ensureShadowRoot();
	const container = root.getElementById("cap-nudge-container");
	if (!container) return;

	container.textContent = "";
	if (elapsedTimer !== null) {
		clearInterval(elapsedTimer);
		elapsedTimer = null;
	}

	const pill = makeEl("div", "cap-nudge-pill");
	const dot = makeEl("span", "cap-nudge-dot");
	dot.style.background = "#3182ce";
	dot.style.animation = "none";
	const label = makeEl("span", "cap-nudge-elapsed", "Finishing up...");
	pill.append(dot, label);
	container.appendChild(pill);
	nudgeState = "finishing";
}

function renderCompletePill(shareUrl: string): void {
	const root = ensureShadowRoot();
	const container = root.getElementById("cap-nudge-container");
	if (!container) return;

	container.textContent = "";
	if (elapsedTimer !== null) {
		clearInterval(elapsedTimer);
		elapsedTimer = null;
	}
	recordingStartTime = 0;

	const card = makeEl("div", "cap-nudge-complete-card");

	const check = makeEl("div", "cap-nudge-complete-check", "✓");
	const title = makeEl("div", "cap-nudge-title", "Recording saved!");
	const urlEl = makeEl("div", "cap-nudge-share-url", shareUrl);

	const buttons = makeEl("div", "cap-nudge-buttons");
	const copyBtn = makeBtn("cap-nudge-btn-copy", "Copy link");
	const openBtn = makeBtn("cap-nudge-btn-open", "Open");

	copyBtn.addEventListener("click", () => {
		navigator.clipboard.writeText(shareUrl).then(() => {
			copyBtn.textContent = "Copied!";
			setTimeout(() => {
				copyBtn.textContent = "Copy link";
			}, 2000);
		});
	});

	openBtn.addEventListener("click", () => {
		window.open(shareUrl, "_blank");
	});

	const dismissBtn = makeBtn("cap-nudge-btn-dismiss", "Dismiss");
	dismissBtn.addEventListener("click", () => {
		sendToBackground({ type: "CANCEL" } as OutboundMessage);
		clearNudge();
		nudgeState = "hidden";
	});

	buttons.append(copyBtn, openBtn);
	card.append(check, title, urlEl, buttons, dismissBtn);
	container.appendChild(card);
	nudgeState = "complete";
}

function renderErrorCard(reason: string, recoverable: boolean): void {
	const root = ensureShadowRoot();
	const container = root.getElementById("cap-nudge-container");
	if (!container) return;

	container.textContent = "";
	if (elapsedTimer !== null) {
		clearInterval(elapsedTimer);
		elapsedTimer = null;
	}
	recordingStartTime = 0;

	const card = makeEl("div", "cap-nudge-error-card");
	const title = makeEl("div", "cap-nudge-title", "Upload failed");
	const msg = makeEl("div", "cap-nudge-error-msg", reason);

	const buttons = makeEl("div", "cap-nudge-buttons");

	if (recoverable) {
		const retryBtn = makeBtn("cap-nudge-btn-primary", "Retry");
		retryBtn.addEventListener("click", () => {
			sendToBackground({ type: "RETRY" } as OutboundMessage);
		});
		buttons.appendChild(retryBtn);
	}

	const dismissBtn = makeBtn("cap-nudge-btn-secondary", "Dismiss");
	dismissBtn.addEventListener("click", () => {
		sendToBackground({ type: "CANCEL" } as OutboundMessage);
		clearNudge();
		nudgeState = "hidden";
	});

	buttons.appendChild(dismissBtn);
	card.append(title, msg, buttons);
	container.appendChild(card);
	nudgeState = "error";
}

// ── Message protocol ──────────────────────────────────────────────────────────

function sendToBackground(msg: OutboundMessage): void {
	chrome.runtime.sendMessage(msg).catch(() => {});
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

function showStartNote(card: HTMLElement, text: string, isError: boolean): void {
	const existing = card.querySelector(
		".cap-nudge-send-err",
	) as HTMLElement | null;
	const note = existing ?? document.createElement("p");
	note.className = "cap-nudge-send-err";
	note.style.cssText = isError
		? "font-size:12px;color:#e53e3e;margin:6px 0 0;"
		: "font-size:12px;color:#6b7280;margin:6px 0 0;";
	note.textContent = text;
	if (!existing) card.appendChild(note);
}

async function getOptionalMicStream(
	micEnabled: boolean,
	micDeviceId: string,
): Promise<MediaStream | null> {
	if (!micEnabled) return null;
	if (micDeviceId) {
		try {
			return await navigator.mediaDevices.getUserMedia({
				audio: { deviceId: { exact: micDeviceId } },
			});
		} catch {}
	}
	try {
		return await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch {
		return null;
	}
}

function stopNudgeRecorder(): void {
	if (nudgeRecorder && nudgeRecorder.recorder.state !== "inactive") {
		nudgeRecorder.recorder.stop();
	} else if (nudgeRecorder) {
		cleanupNudgeRecorder();
		sendMsg({ type: "RECORDER_STOPPED" });
	}
}

async function startNudgeRecording(
	card: HTMLElement,
	button: HTMLButtonElement,
): Promise<void> {
	if (nudgeRecorder) {
		showStartNote(card, "A recording is already running.", true);
		button.disabled = false;
		button.textContent = "Record now";
		return;
	}

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
		const name = err instanceof Error ? err.name : "";
		const message =
			name === "NotAllowedError" || name === "AbortError"
				? "Screen sharing was cancelled. Click Record now to try again."
				: `Couldn't open Chrome's share picker: ${err instanceof Error ? err.message : String(err)}`;
		showStartNote(card, message, true);
		button.disabled = false;
		button.textContent = "Record now";
		return;
	}

	if (displayStream.getVideoTracks().length === 0) {
		for (const track of displayStream.getTracks()) track.stop();
		showStartNote(card, "No video track was shared. Try sharing this Meet tab.", true);
		button.disabled = false;
		button.textContent = "Record now";
		return;
	}

	let pendingMicStream: MediaStream | null = null;
	let pendingAudioCtx: AudioContext | null = null;
	try {
		const readyResp = (await sendMsgAwait({
			type: "MEET_NUDGE_CAPTURE_READY",
			meetingId: meetingId ?? "",
		})) as
			| {
					ok?: boolean;
					error?: string;
					micEnabled?: boolean;
					micDeviceId?: string;
			  }
			| undefined;

		if (!readyResp?.ok) {
			for (const track of displayStream.getTracks()) track.stop();
			showStartNote(card, friendlyStartError(readyResp?.error), true);
			button.disabled = false;
			button.textContent = "Record now";
			return;
		}

		const micStream = await getOptionalMicStream(
			readyResp.micEnabled !== false,
			readyResp.micDeviceId ?? "",
		);
		pendingMicStream = micStream;
		const audioCtx = new AudioContext({ sampleRate: 48000 });
		pendingAudioCtx = audioCtx;
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
		recorder.ondataavailable = async (event) => {
			if (event.data.size <= 0) return;
			const buffer = await event.data.arrayBuffer();
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
			cleanupNudgeRecorder();
		};

		recorder.onstop = () => {
			cleanupNudgeRecorder();
			sendMsg({ type: "RECORDER_STOPPED" });
		};

		displayStream.getVideoTracks()[0].onended = () => {
			stopNudgeRecorder();
		};

		nudgeRecorder = {
			recorder,
			audioCtx,
			displayStream,
			micStream,
			chunkIndex: 0,
		};
		pendingMicStream = null;
		pendingAudioCtx = null;

		const startResp = (await sendMsgAwait({
			type: "RECORDER_STARTED",
			mime,
			hasVideo: displayStream.getVideoTracks().length > 0,
			hasAudio: dest.stream.getAudioTracks().length > 0,
		})) as { ok?: boolean; error?: string } | undefined;

		if (!startResp?.ok) {
			cleanupNudgeRecorder();
			showStartNote(
				card,
				`Couldn't start recording: ${
					startResp?.error ?? "Couldn't start the upload session."
				}`,
				true,
			);
			button.disabled = false;
			button.textContent = "Record now";
			return;
		}

		recorder.start(1000);
		clearNudge(() => renderRecordingPill(false));
	} catch (err) {
		for (const track of displayStream.getTracks()) track.stop();
		if (pendingMicStream) {
			for (const track of pendingMicStream.getTracks()) track.stop();
		}
		pendingAudioCtx?.close().catch(() => {});
		cleanupNudgeRecorder();
		sendMsg({
			type: "RECORDER_ERROR",
			error: err instanceof Error ? err.message : String(err),
		});
		showStartNote(
			card,
			`Couldn't start recording: ${err instanceof Error ? err.message : String(err)}`,
			true,
		);
		button.disabled = false;
		button.textContent = "Record now";
	}
}

// ── Main gate ─────────────────────────────────────────────────────────────────

function maybeShow(): void {
	if (!isMeetingUrl() || !isInMeeting()) {
		if (inCall) {
			scheduleMeetEnded();
		}
		return;
	}

	cancelMeetEnded();

	const id = currentMeetingId();
	if (id !== meetingId) {
		cancelMeetEnded();
		meetingId = id;
		dismissed = false;
		laterUntil = 0;
		inCall = false;
		stopCountdown();
		if (elapsedTimer !== null) {
			clearInterval(elapsedTimer);
			elapsedTimer = null;
		}
		recordingStartTime = 0;
		clearNudge();
		nudgeState = "hidden";
	}

	if (!inCall) {
		inCall = true;
		if (meetingId) sendToBackground({ type: "MEET_CALL_STARTED", meetingId });
		playAudio(soundDroplet);
	}

	if (
		nudgeState === "recording" ||
		nudgeState === "countdown" ||
		nudgeState === "finishing" ||
		nudgeState === "complete" ||
		nudgeState === "error"
	)
		return;
	if (dismissed || nudgeState === "default" || Date.now() < laterUntil) return;

	if (settings.autoRecord) {
		renderCountdownNudge();
	} else {
		renderDefaultNudge();
	}
}

// ── State change listener ─────────────────────────────────────────────────────

function handleStateChange(state: StateChangedMessage["state"]): void {
	switch (state.kind) {
		case "recording":
			stopCountdown();
			if (recordingStartTime === 0) {
				recordingStartTime = state.startedAt ?? Date.now();
			}
			clearNudge(() => renderRecordingPill(state.paused ?? false));
			break;
		case "uploading":
		case "finishing":
			clearNudge(() => renderFinishingPill());
			break;
		case "complete":
			if (state.shareUrl) {
				clearNudge(() => renderCompletePill(state.shareUrl as string));
			}
			break;
		case "error":
			clearNudge(() =>
				renderErrorCard(
					state.reason ?? "Unknown error",
					state.recoverable ?? false,
				),
			);
			break;
		case "idle":
			if (elapsedTimer !== null) {
				clearInterval(elapsedTimer);
				elapsedTimer = null;
			}
			recordingStartTime = 0;
			clearNudge();
			nudgeState = "hidden";
			if (isInMeeting()) {
				dismissed = false;
				setTimeout(maybeShow, 800);
			}
			break;
	}
}

chrome.runtime.onMessage.addListener((msg: unknown) => {
	if (!msg || typeof msg !== "object") return;
	const message = msg as Record<string, unknown>;
	if (message.type === "STATE_CHANGED" && message.state) {
		handleStateChange(message.state as StateChangedMessage["state"]);
	} else if (message.type === "STOP_CAPTURE") {
		stopNudgeRecorder();
	} else if (message.type === "PAUSE_CAPTURE") {
		if (nudgeRecorder && nudgeRecorder.recorder.state === "recording") {
			nudgeRecorder.recorder.pause();
		}
	} else if (message.type === "RESUME_CAPTURE") {
		if (nudgeRecorder && nudgeRecorder.recorder.state === "paused") {
			nudgeRecorder.recorder.resume();
		}
	}
});

chrome.storage.onChanged.addListener((changes, area) => {
	if (area === "local" && changes.capExtState?.newValue) {
		handleStateChange(
			changes.capExtState.newValue as StateChangedMessage["state"],
		);
	}
});

// ── Init: fetch settings then start ──────────────────────────────────────────

chrome.runtime
	.sendMessage({ type: "GET_SETTINGS" })
	.then((resp: unknown) => {
		if (resp && typeof resp === "object") {
			const r = resp as Record<string, unknown>;
			if (typeof r.autoRecord === "boolean") settings.autoRecord = r.autoRecord;
			if (typeof r.autoRecordCountdownSec === "number")
				settings.autoRecordCountdownSec = r.autoRecordCountdownSec;
			if (typeof r.soundEnabled === "boolean")
				settings.soundEnabled = r.soundEnabled;
		}
		maybeShow();
	})
	.catch(() => {
		maybeShow();
	});

// ── SPA navigation detection ──────────────────────────────────────────────────

let lastHref = location.href;
setInterval(() => {
	if (location.href !== lastHref) {
		lastHref = location.href;
		maybeShow();
	}
}, 1000);

window.addEventListener("popstate", maybeShow);
window.addEventListener("hashchange", maybeShow);
window.addEventListener("beforeunload", () => {
	stopNudgeRecorder();
});

let mutationDebounce: ReturnType<typeof setTimeout> | null = null;
const observer = new MutationObserver(() => {
	if (mutationDebounce !== null) clearTimeout(mutationDebounce);
	mutationDebounce = setTimeout(maybeShow, 500);
});
observer.observe(document.body, { childList: true, subtree: true });
