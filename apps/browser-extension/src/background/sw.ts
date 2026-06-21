import { isKeepAliveAlarm, startKeepAlive, stopKeepAlive } from "./keepalive";
import type { ExtensionSettings, ExtensionState } from "./state";
import { getSettings, getState, setSettings, setState } from "./state";
import { DEFAULT_API_BASE_URL } from "../shared/config";
import {
	finalizeUpload,
	handleChunk,
	initializeUpload,
	retryPendingUploads,
} from "./upload";

// ── Tab capture (Google Meet path) ─────────────────────────────────────────
//
// chrome.tabCapture.getMediaStreamId({ targetTabId }) mints a *serializable*
// stream id that the offscreen document can consume via getUserMedia with
// chromeMediaSource: "tab". This is the ONLY capture path that works from a
// service worker for tab content. (The old desktopCapture.chooseDesktopMedia
// path was architecturally broken from a SW: it required a targetTab, and its
// stream id could not be consumed inside an offscreen document.)

function getTabMediaStreamId(targetTabId: number): Promise<string> {
	return new Promise((resolve, reject) => {
		try {
			chrome.tabCapture.getMediaStreamId(
				{ targetTabId },
				(streamId: string) => {
					if (chrome.runtime.lastError) {
						reject(new Error(chrome.runtime.lastError.message));
					} else if (!streamId) {
						reject(new Error("tabCapture returned no stream id"));
					} else {
						resolve(streamId);
					}
				},
			);
		} catch (err) {
			reject(err instanceof Error ? err : new Error(String(err)));
		}
	});
}

// ── Visible instruction recorder page ──────────────────────────────────────
//
// Full-screen instruction recording needs getDisplayMedia(), which only works
// in a visible page with a real user gesture. We open a dedicated extension tab
// that owns the whole capture and streams chunks back here using the same
// RECORDER_* protocol as the offscreen recorder.

async function openInstructionRecorder(): Promise<number> {
	const url = chrome.runtime.getURL("recorder.html");
	// Reuse an existing recorder tab if one is already open.
	const existing = await chrome.tabs.query({ url });
	if (existing.length > 0 && existing[0].id != null) {
		await chrome.tabs.update(existing[0].id, { active: true });
		if (existing[0].windowId != null) {
			await chrome.windows.update(existing[0].windowId, { focused: true });
		}
		return existing[0].id;
	}
	const tab = await chrome.tabs.create({ url, active: true });
	return tab.id!;
}

// ── Offscreen document ─────────────────────────────────────────────────────

async function ensureOffscreenDocument(): Promise<void> {
	const existingContexts = await chrome.runtime.getContexts({
		contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
	});
	if (existingContexts.length > 0) return;
	await chrome.offscreen.createDocument({
		url: "offscreen.html",
		reasons: [chrome.offscreen.Reason.USER_MEDIA],
		justification: "Recording screen/tab media",
	});
}

async function closeOffscreenDocument(): Promise<void> {
	const existingContexts = await chrome.runtime.getContexts({
		contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
	});
	if (existingContexts.length > 0) {
		await chrome.offscreen.closeDocument();
	}
}

function sendToOffscreen(message: Record<string, unknown>): Promise<unknown> {
	return new Promise((resolve, reject) => {
		chrome.runtime.sendMessage(message, (response: unknown) => {
			if (chrome.runtime.lastError) {
				reject(new Error(chrome.runtime.lastError.message));
			} else {
				resolve(response);
			}
		});
	});
}

// ── Badge ─────────────────────────────────────────────────────────────────

function updateBadge(state: ExtensionState): void {
	switch (state.kind) {
		case "recording":
			chrome.action.setBadgeText({ text: "REC" });
			chrome.action.setBadgeBackgroundColor({ color: "#e53e3e" });
			break;
		case "uploading":
		case "finishing":
			chrome.action.setBadgeText({ text: "↑" });
			chrome.action.setBadgeBackgroundColor({ color: "#3182ce" });
			break;
		case "complete":
			chrome.action.setBadgeText({ text: "✓" });
			chrome.action.setBadgeBackgroundColor({ color: "#38a169" });
			break;
		case "error":
			chrome.action.setBadgeText({ text: "!" });
			chrome.action.setBadgeBackgroundColor({ color: "#dd6b20" });
			break;
		default:
			chrome.action.setBadgeText({ text: "" });
			break;
	}
}

// ── Recording lock ──────────────────────────────────────────────────────────
//
// A new recording may start from any TERMINAL state (idle / error / complete) —
// a finished "complete" recording must NOT block the next one. Only block while
// media is genuinely being captured or uploaded. (A stale "arming" is transient
// and intentionally NOT blocking: a fresh user-initiated start supersedes it,
// otherwise a half-armed attempt would lock out all future recordings.)
function isInProgress(state: ExtensionState): boolean {
	return (
		state.kind === "recording" ||
		state.kind === "uploading" ||
		state.kind === "finishing"
	);
}

// ── Message routing ────────────────────────────────────────────────────────

interface MessageBase {
	type: string;
}

function isMessageBase(v: unknown): v is MessageBase {
	return (
		typeof v === "object" &&
		v !== null &&
		"type" in v &&
		typeof (v as Record<string, unknown>).type === "string"
	);
}

function getString(
	obj: Record<string, unknown>,
	key: string,
): string | undefined {
	const v = obj[key];
	return typeof v === "string" ? v : undefined;
}

/**
 * Security: only trust a CAP_EXTENSION_TOKEN write from a page whose origin
 * matches the server the extension is actually configured to talk to. Without
 * this check, ANY page matched by externally_connectable (e.g. any
 * *.up.railway.app subdomain) could overwrite apiKey + apiBaseUrl and hijack
 * uploads to an attacker-controlled backend.
 *
 * Allowed origins:
 *   - the configured apiBaseUrl origin (user's own Cap server)
 *   - the well-known Cap cloud default origin
 *   - localhost dev origins (OAuth callback runs on the web app port)
 */
function originOf(url: string | undefined): string | null {
	if (!url) return null;
	try {
		return new URL(url).origin;
	} catch {
		return null;
	}
}

function isTrustedTokenSender(
	senderUrl: string | undefined,
	configuredApiBaseUrl: string,
): boolean {
	const sender = originOf(senderUrl);
	if (!sender) return false;

	const allowed = new Set<string>();
	const configured = originOf(configuredApiBaseUrl);
	if (configured) allowed.add(configured);
	const defaultOrigin = originOf(DEFAULT_API_BASE_URL);
	if (defaultOrigin) allowed.add(defaultOrigin);
	// Local dev: API (3000) and web app / OAuth callback (3001).
	allowed.add("http://localhost:3000");
	allowed.add("http://localhost:3001");

	return allowed.has(sender);
}

function getNumber(
	obj: Record<string, unknown>,
	key: string,
): number | undefined {
	const v = obj[key];
	return typeof v === "number" ? v : undefined;
}

function _getBoolean(
	obj: Record<string, unknown>,
	key: string,
): boolean | undefined {
	const v = obj[key];
	return typeof v === "boolean" ? v : undefined;
}

const PENDING_MEET_START_KEY = "capPendingMeetStart";
const MIN_MEET_RECORDING_MS_BEFORE_AUTO_STOP = 10000;

function isMeetUrl(url: string | undefined): boolean {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return (
			parsed.hostname === "meet.google.com" &&
			/^\/[a-z]+-[a-z]+-[a-z]+/.test(parsed.pathname)
		);
	} catch {
		return false;
	}
}

async function resolveMeetSenderTabId(
	sender: chrome.runtime.MessageSender,
): Promise<number | undefined> {
	if (sender.tab?.id !== undefined && isMeetUrl(sender.tab.url)) {
		return sender.tab.id;
	}

	const tabs = await chrome.tabs.query({
		active: true,
		currentWindow: true,
		url: "https://meet.google.com/*",
	});
	const tab = tabs.find((t) => t.id !== undefined && isMeetUrl(t.url));
	return tab?.id;
}

function isTabCaptureInvocationError(error: string): boolean {
	const lower = error.toLowerCase();
	return (
		lower.includes("not been invoked") ||
		lower.includes("activetab") ||
		lower.includes("active tab")
	);
}

async function openPopupForPendingMeet(
	tabId: number,
	meetingId: string | undefined,
): Promise<boolean> {
	await chrome.storage.local.set({
		[PENDING_MEET_START_KEY]: { tabId, meetingId, createdAt: Date.now() },
	});
	try {
		if (typeof chrome.action?.openPopup === "function") {
			await chrome.action.openPopup();
			return true;
		}
	} catch {
		// Fall through to a friendly inline error in the Meet nudge.
	}
	await chrome.storage.local.remove(PENDING_MEET_START_KEY);
	return false;
}

/** Shared finalization logic called from RECORDER_STOPPED and the tabs.onRemoved handler. */
async function finalizeRecording(): Promise<void> {
	const state = await getState();
	const videoId = state.kind === "recording" ? state.videoId : "stub";
	const uploadId = state.kind === "recording" ? state.uploadId : "stub";
	const parts = state.kind === "recording" ? state.parts : [];
	const totalBytes = state.kind === "recording" ? state.totalBytes : 0;
	const uploadedBytes = state.kind === "recording" ? state.uploadedBytes : 0;

	const nextState: ExtensionState = {
		kind: "uploading",
		videoId,
		uploadId,
		parts,
		totalBytes,
		uploadedBytes,
	};
	await setState(nextState);
	stopKeepAlive();
	updateBadge(nextState);
	await closeOffscreenDocument().catch(() => {});
	await finalizeUpload();
}

async function handleMessage(
	message: unknown,
	_sender: chrome.runtime.MessageSender,
): Promise<unknown> {
	if (!isMessageBase(message)) return { ok: false, error: "invalid message" };

	const msg = message as Record<string, unknown>;
	const type = msg.type as string;

	switch (type) {
		// ── Popup: start instruction recording ────────────────────────────
		// Full-screen instruction capture happens in a dedicated VISIBLE tab
		// (recorder.html) where getDisplayMedia() has a real user gesture. The
		// SW only opens that tab; the page owns the MediaStream and streams
		// chunks back via the RECORDER_* protocol. We deliberately do NOT enter
		// "arming" here — the actual gesture/picker lives in the recorder tab,
		// so state advances to "recording" only when that page sends
		// RECORDER_STARTED.
		case "START_INSTRUCTION": {
			const state = await getState();
			if (isInProgress(state)) {
				return { ok: false, error: "A recording is already in progress" };
			}
			const settings = await getSettings();
			if (!settings.apiKey) {
				return { ok: false, error: "not signed in" };
			}
			await setState({ kind: "arming", mode: "instruction" });
			let recorderTabId: number;
			try {
				recorderTabId = await openInstructionRecorder();
			} catch (err) {
				await setState({ kind: "idle" });
				updateBadge({ kind: "idle" });
				return {
					ok: false,
					error: `Couldn't open the recorder: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
			await setState({ kind: "arming", mode: "instruction", recorderTabId });
			return { ok: true };
		}

		// ── Popup: start meeting recording (Google Meet → tab capture) ────
		case "START_MEET": {
			const meetingId = getString(msg, "meetingId");
			const tabId = getNumber(msg, "tabId");
			const state = await getState();
			if (isInProgress(state)) {
				return { ok: false, error: "A recording is already in progress" };
			}
			if (tabId === undefined) {
				return { ok: false, error: "No Meet tab to record" };
			}
			const settings = await getSettings();
			if (!settings.apiKey) {
				return { ok: false, error: "not signed in" };
			}
			await setState({ kind: "arming", mode: "meeting", meetingId, tabId });
			let meetStreamId: string;
			try {
				// Tab capture: mint a serializable stream id for the Meet tab. This
				// is consumable in the offscreen document (chromeMediaSource: tab).
				meetStreamId = await getTabMediaStreamId(tabId);
			} catch (err) {
				await setState({ kind: "idle" });
				updateBadge({ kind: "idle" });
				return {
					ok: false,
					error: `Couldn't capture the meeting tab: ${err instanceof Error ? err.message : String(err)}`,
				};
			}
			await ensureOffscreenDocument();
			await sendToOffscreen({
				type: "START_CAPTURE",
				streamId: meetStreamId,
				meetingId,
				tabId,
				micEnabled: settings.micEnabled,
				...(settings.micEnabled ? { micDeviceId: settings.micDeviceId } : {}),
			});
			return { ok: true };
		}

		// ── Popup: stop ───────────────────────────────────────────────────
		case "STOP": {
			const stopState = await getState();
			const stopTabId =
				stopState.kind === "recording" && stopState.mode === "instruction"
					? stopState.recorderTabId
					: stopState.kind === "arming" && stopState.mode === "instruction"
					  ? stopState.recorderTabId
					  : undefined;
			if (stopTabId !== undefined) {
				// Instruction recording: tell the recorder tab to stop.
				// SW state advances only when the tab sends RECORDER_STOPPED.
				chrome.tabs
					.sendMessage(stopTabId, { type: "STOP_CAPTURE" })
					.catch(() => {});
			} else {
				await sendToOffscreen({ type: "STOP_CAPTURE" });
			}
			return { ok: true };
		}

		// ── Popup: pause ──────────────────────────────────────────────────
		case "PAUSE": {
			const pauseState = await getState();
			const pauseTabId =
				pauseState.kind === "recording" && pauseState.mode === "instruction"
					? pauseState.recorderTabId
					: undefined;
			if (pauseTabId !== undefined) {
				chrome.tabs
					.sendMessage(pauseTabId, { type: "PAUSE_CAPTURE" })
					.catch(() => {});
			} else {
				await sendToOffscreen({ type: "PAUSE_CAPTURE" });
			}
			return { ok: true };
		}

		// ── Popup: resume ─────────────────────────────────────────────────
		case "RESUME": {
			const resumeState = await getState();
			const resumeTabId =
				resumeState.kind === "recording" && resumeState.mode === "instruction"
					? resumeState.recorderTabId
					: undefined;
			if (resumeTabId !== undefined) {
				chrome.tabs
					.sendMessage(resumeTabId, { type: "RESUME_CAPTURE" })
					.catch(() => {});
			} else {
				await sendToOffscreen({ type: "RESUME_CAPTURE" });
			}
			return { ok: true };
		}

		// ── Recorder tab: instruction capture aborted before it began ─────
		// The visible recorder tab cancelled the screen picker or was closed
		// before recording started. Release the "arming" lock — but ONLY if we
		// are still arming an instruction, so an active recording (meeting or a
		// running instruction) is never disrupted.
		case "INSTRUCTION_CANCEL": {
			const state = await getState();
			if (state.kind === "arming" && state.mode === "instruction") {
				await setState({ kind: "idle" });
				updateBadge({ kind: "idle" });
			}
			return { ok: true };
		}

		// ── Popup: cancel ─────────────────────────────────────────────────
		case "CANCEL": {
			const cancelState = await getState();
			const cancelTabId =
				cancelState.kind === "recording" && cancelState.mode === "instruction"
					? cancelState.recorderTabId
					: cancelState.kind === "arming" && cancelState.mode === "instruction"
					  ? cancelState.recorderTabId
					  : undefined;
			if (cancelTabId !== undefined) {
				// Tell the instruction recorder tab to stop so it sends RECORDER_STOPPED
				// and cleanup runs. Then also reset SW to idle immediately.
				chrome.tabs
					.sendMessage(cancelTabId, { type: "STOP_CAPTURE" })
					.catch(() => {});
			} else {
				await sendToOffscreen({ type: "STOP_CAPTURE" }).catch(() => {});
			}
			await closeOffscreenDocument();
			await setState({ kind: "idle" });
			updateBadge({ kind: "idle" });
			return { ok: true };
		}

		// ── Popup / content: get state ────────────────────────────────────
		case "GET_STATE": {
			return await getState();
		}

		// ── Content: Meet call started ────────────────────────────────────
		case "MEET_CALL_STARTED": {
			const settings = await getSettings();
			if (settings.autoRecordOnMeet) {
				return {
					autoRecord: true,
					countdownSec: settings.autoRecordCountdownSec,
				};
			}
			return { autoRecord: false };
		}

		// ── Content: Meet call ended ──────────────────────────────────────
		case "MEET_CALL_ENDED": {
			const meetingId = getString(msg, "meetingId");
			const senderTabId = _sender.tab?.id;
			const state = await getState();
			if (
				state.kind === "recording" &&
				state.mode === "meeting" &&
				state.meetingId === meetingId &&
				(senderTabId === undefined || state.tabId === senderTabId) &&
				Date.now() - state.startedAt >= MIN_MEET_RECORDING_MS_BEFORE_AUTO_STOP
			) {
				await sendToOffscreen({ type: "STOP_CAPTURE" });
			}
			return { ok: true };
		}

		// ── Content: user clicked "Record now" nudge ──────────────────────
		case "MEET_NUDGE_RECORD_NOW": {
			const meetingId = getString(msg, "meetingId");
			const tabId = await resolveMeetSenderTabId(_sender);
			const state = await getState();
			if (isInProgress(state)) {
				return { ok: false, error: "A recording is already in progress" };
			}
			const settings = await getSettings();
			if (!settings.apiKey) {
				// Not signed in — open the popup so the user can sign in.
				// Fix #2: chrome.action.openPopup() is Chrome 127+ only; the build
				// targets chrome120 where calling it throws synchronously before
				// .catch() can run, skipping the fallback. Guard with typeof check.
				try {
					if (typeof chrome.action?.openPopup === "function") {
						await (chrome.action.openPopup() as Promise<void>).catch(() => {
							chrome.runtime.openOptionsPage();
						});
					} else {
						chrome.runtime.openOptionsPage();
					}
				} catch {
					chrome.runtime.openOptionsPage();
				}
				return { ok: false, error: "not signed in" };
			}
			if (tabId === undefined) {
				return { ok: false, error: "No Meet tab to record" };
			}
			await setState({ kind: "arming", mode: "meeting", meetingId, tabId });
			let nudgeStreamId: string;
			try {
				// Tab capture of the Meet tab the nudge button was clicked in.
				nudgeStreamId = await getTabMediaStreamId(tabId);
			} catch (err) {
				await setState({ kind: "idle" });
				updateBadge({ kind: "idle" });
				const error = err instanceof Error ? err.message : String(err);
				if (isTabCaptureInvocationError(error)) {
					const opened = await openPopupForPendingMeet(tabId, meetingId);
					if (opened) return { ok: true, openedPopup: true };
				}
				return {
					ok: false,
					error: `Couldn't capture the meeting tab: ${error}`,
				};
			}
			await ensureOffscreenDocument();
			await sendToOffscreen({
				type: "START_CAPTURE",
				streamId: nudgeStreamId,
				meetingId,
				tabId,
				micEnabled: settings.micEnabled,
				...(settings.micEnabled ? { micDeviceId: settings.micDeviceId } : {}),
			});
			return { ok: true };
		}

		case "MEET_NUDGE_LATER":
		case "MEET_NUDGE_DISMISS":
			return { ok: true };

		// ── Content: settings query ───────────────────────────────────────
		case "GET_SETTINGS": {
			const settings = await getSettings();
			return {
				autoRecordOnMeet: settings.autoRecordOnMeet,
				autoRecordCountdownSec: settings.autoRecordCountdownSec,
				soundEnabled: settings.soundEnabled,
			};
		}

		// ── Offscreen: recorder started ───────────────────────────────────
		case "RECORDER_STARTED": {
			const mime = getString(msg, "mime") ?? "video/webm";
			const state = await getState();
			const mode = state.kind === "arming" ? state.mode : "instruction";
			const meetingId = state.kind === "arming" ? state.meetingId : undefined;
			const tabId = state.kind === "arming" ? state.tabId : undefined;
			const recorderTabId =
				state.kind === "arming" ? state.recorderTabId : undefined;

			let videoId: string;
			let uploadId: string;
			try {
				const result = await initializeUpload(mode, meetingId);
				videoId = result.videoId;
				uploadId = result.uploadId;
			} catch (err) {
				console.error("[sw] initializeUpload failed:", err);
				const errState: ExtensionState = {
					kind: "error",
					reason: `Failed to initialize upload: ${err instanceof Error ? err.message : String(err)}`,
					recoverable: true,
				};
				await setState(errState);
				updateBadge(errState);
				await closeOffscreenDocument().catch(() => {});
				return { ok: false, error: "initializeUpload failed" };
			}

			const nextState: ExtensionState = {
				kind: "recording",
				mode,
				videoId,
				uploadId,
				startedAt: Date.now(),
				parts: [],
				nextPartNumber: 1,
				totalBytes: 0,
				uploadedBytes: 0,
				meetingId,
				tabId,
				mime,
				paused: false,
				recorderTabId,
			};
			await setState(nextState);
			startKeepAlive();
			updateBadge(nextState);
			return { ok: true };
		}

		// ── Offscreen: data chunk ─────────────────────────────────────────
		case "RECORDER_CHUNK": {
			const raw = msg.chunk as number[] | undefined;
			const index = getNumber(msg, "index") ?? 0;
			const mime = getString(msg, "mime") ?? "video/webm";
			if (raw && Array.isArray(raw) && raw.length > 0) {
				await handleChunk(new Uint8Array(raw).buffer, index, mime);
			}
			return { ok: true };
		}

		// ── Offscreen: recorder stopped ───────────────────────────────────
		case "RECORDER_STOPPED": {
			await finalizeRecording();
			return { ok: true };
		}

		// ── Offscreen: recorder error ─────────────────────────────────────
		case "RECORDER_ERROR": {
			const error = getString(msg, "error") ?? "Unknown recorder error";
			const state = await getState();
			const previousVideoId =
				state.kind === "recording" ? state.videoId : undefined;

			const nextState: ExtensionState = {
				kind: "error",
				reason: error,
				recoverable: true,
				previousVideoId,
			};
			await setState(nextState);
			stopKeepAlive();
			updateBadge(nextState);
			await closeOffscreenDocument().catch(() => {});

			chrome.notifications.create("recorder-error", {
				type: "basic",
				iconUrl: "icons/icon-128.png",
				title: "Recording error",
				message: error,
			});
			return { ok: true };
		}

		// ── Popup: retry after error ──────────────────────────────────────
		case "RETRY": {
			const state = await getState();
			if (state.kind !== "error")
				return { ok: false, error: "not in error state" };
			await setState({ kind: "idle" });
			updateBadge({ kind: "idle" });
			return { ok: true };
		}

		// ── Options: save settings ────────────────────────────────────────
		case "SAVE_SETTINGS": {
			const settings = msg.settings as Partial<ExtensionSettings> | undefined;
			if (settings) {
				await setSettings(settings);
			}
			return { ok: true };
		}

		// ── Options: get all settings ─────────────────────────────────────
		case "GET_ALL_SETTINGS": {
			return await getSettings();
		}

		// ── Sign-in-with-Cap token from options page ──────────────────────
		case "CAP_EXTENSION_TOKEN": {
			const token = getString(msg, "token");
			const apiBaseUrl = getString(msg, "apiBaseUrl");
			if (token) {
				await setSettings({
					apiKey: token,
					...(apiBaseUrl ? { apiBaseUrl } : {}),
				});
			}
			return { ok: true };
		}

		default:
			return { ok: false, error: `unknown message type: ${type}` };
	}
}

// ── External message handler (sign-in-with-Cap callback page) ─────────────

chrome.runtime.onMessageExternal.addListener(
	(message: unknown, _sender, sendResponse) => {
		if (!isMessageBase(message)) {
			sendResponse({ ok: false });
			return false;
		}
		const msg = message as Record<string, unknown>;
		if (msg.type === "CAP_EXTENSION_TOKEN") {
			const token = getString(msg, "token");
			const apiBaseUrl = getString(msg, "apiBaseUrl");
			// Security: only accept a token write from a page whose origin matches
			// the configured Cap server (or the well-known cloud / localhost dev
			// origins). externally_connectable wildcards *.up.railway.app, so an
			// untrusted subdomain page could otherwise hijack apiKey + apiBaseUrl.
			getSettings()
				.then((settings) => {
					if (!isTrustedTokenSender(_sender.url, settings.apiBaseUrl)) {
						console.warn(
							"Rejected CAP_EXTENSION_TOKEN from untrusted origin:",
							_sender.url,
						);
						sendResponse({ ok: false, error: "untrusted origin" });
						return;
					}
					// Guard against a trusted sender repointing uploads to a different
					// backend: if the message carries an apiBaseUrl whose origin differs
					// from the sender's own origin, reject the write.
					if (apiBaseUrl) {
						const senderOrigin = originOf(_sender.url);
						const requestedOrigin = originOf(apiBaseUrl);
						if (
							!senderOrigin ||
							!requestedOrigin ||
							senderOrigin !== requestedOrigin
						) {
							console.warn(
								"Rejected CAP_EXTENSION_TOKEN: apiBaseUrl origin mismatch",
								{ senderOrigin, requestedOrigin },
							);
							sendResponse({
								ok: false,
								error: "apiBaseUrl/origin mismatch",
							});
							return;
						}
					}
					setSettings({
						apiKey: token ?? "",
						...(apiBaseUrl ? { apiBaseUrl } : {}),
					}).then(() => {
						// Relay internally so an open popup/options page auto-updates
						// instead of waiting for its 20s fallback timeout.
						chrome.runtime
							.sendMessage({ type: "CAP_EXTENSION_TOKEN", token, apiBaseUrl })
							.catch(() => {});
						sendResponse({ ok: true });
					});
				})
				.catch(() => {
					sendResponse({ ok: false, error: "settings read failed" });
				});
			return true;
		}
		sendResponse({ ok: false });
		return false;
	},
);

// ── Internal message router ────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
	(message: unknown, sender: chrome.runtime.MessageSender, sendResponse) => {
		handleMessage(message, sender)
			.then(sendResponse)
			.catch((err: unknown) => {
				const msg = err instanceof Error ? err.message : String(err);
				sendResponse({ ok: false, error: msg });
			});
		return true;
	},
);

// ── Alarms ────────────────────────────────────────────────────────────────

chrome.alarms.onAlarm.addListener((alarm) => {
	if (isKeepAliveAlarm(alarm.name)) {
		chrome.storage.local.get("capExtState");
	}
});

// ── SW startup recovery ────────────────────────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
	const state = await getState();

	if (state.kind === "recording") {
		chrome.notifications.create("recording-interrupted", {
			type: "basic",
			iconUrl: "icons/icon-128.png",
			title: "Recording interrupted",
			message:
				"The browser restarted during recording. Uploading what was captured...",
		});
		const nextState: ExtensionState = {
			kind: "uploading",
			videoId: state.videoId,
			uploadId: state.uploadId,
			parts: state.parts,
			totalBytes: state.totalBytes,
			uploadedBytes: state.uploadedBytes,
		};
		await setState(nextState);
		updateBadge(nextState);
	}

	if (state.kind === "recording" || state.kind === "uploading") {
		startKeepAlive();
	}

	await retryPendingUploads();
});

// ── Install hook: hydrate badge from persisted state ──────────────────────

chrome.runtime.onInstalled.addListener(async () => {
	const state = await getState();
	updateBadge(state);
});

// ── Tab removed: recover from instruction recorder tab closure ─────────────

chrome.tabs.onRemoved.addListener(async (tabId) => {
	const state = await getState();
	if (state.kind === "arming" && state.mode === "instruction" && state.recorderTabId === tabId) {
		// Tab closed before recording started — release the arming lock.
		await setState({ kind: "idle" });
		updateBadge({ kind: "idle" });
	} else if (
		state.kind === "recording" &&
		state.mode === "instruction" &&
		state.recorderTabId === tabId
	) {
		// Tab closed mid-recording — finalize with whatever chunks arrived.
		await finalizeRecording().catch(() => {});
	}
});
