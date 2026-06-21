import { DEFAULT_API_BASE_URL } from "../shared/config";

export interface CompletedPart {
	ETag: string;
	PartNumber: number;
}

export interface ExtensionSettings {
	apiBaseUrl: string;
	apiKey: string;
	autoRecordOnMeet: boolean;
	autoRecordCountdownSec: number;
	micDeviceId: string;
	micEnabled: boolean;
	captureMode: "picker" | "silent-tab";
	soundEnabled: boolean;
	cameraOverlay: boolean;
	cameraDeviceId: string;
}

interface IdleState {
	kind: "idle";
}

interface ArmingState {
	kind: "arming";
	mode: "instruction" | "meeting";
	meetingId?: string;
	tabId?: number;
	// For an in-page Meet nudge recording, the Meet content script owns the
	// MediaStream and MediaRecorder.
	contentRecorderTabId?: number;
	// For an instruction recording, the id of the visible recorder.html tab that
	// owns the capture. Stop/pause/resume/cancel must be routed to THIS tab.
	recorderTabId?: number;
}

interface RecordingState {
	kind: "recording";
	mode: "instruction" | "meeting";
	videoId: string;
	uploadId: string;
	startedAt: number;
	parts: CompletedPart[];
	nextPartNumber: number;
	totalBytes: number;
	uploadedBytes: number;
	meetingId?: string;
	tabId?: number;
	// For an in-page Meet nudge recording, stop/pause/resume/cancel route back
	// to the Meet tab content script instead of the offscreen tabCapture path.
	contentRecorderTabId?: number;
	// For an instruction recording, the id of the visible recorder.html tab that
	// owns the capture. Stop/pause/resume/cancel must be routed to THIS tab, and
	// if the tab closes unexpectedly the arming/recording lock must be released.
	recorderTabId?: number;
	mime: string;
	paused: boolean;
}

interface UploadingState {
	kind: "uploading";
	videoId: string;
	uploadId: string;
	parts: CompletedPart[];
	totalBytes: number;
	uploadedBytes: number;
}

interface FinishingState {
	kind: "finishing";
	videoId: string;
}

interface CompleteState {
	kind: "complete";
	videoId: string;
	shareUrl: string;
}

interface ErrorState {
	kind: "error";
	reason: string;
	recoverable: boolean;
	previousVideoId?: string;
}

export type ExtensionState =
	| IdleState
	| ArmingState
	| RecordingState
	| UploadingState
	| FinishingState
	| CompleteState
	| ErrorState;

const STATE_KEY = "capExtState";
const SETTINGS_KEY = "capExtSettings";

const DEFAULT_SETTINGS: ExtensionSettings = {
	apiBaseUrl: DEFAULT_API_BASE_URL,
	apiKey: "",
	autoRecordOnMeet: false,
	autoRecordCountdownSec: 5,
	micDeviceId: "",
	micEnabled: true,
	captureMode: "picker",
	soundEnabled: true,
	cameraOverlay: false,
	cameraDeviceId: "",
};

export async function getState(): Promise<ExtensionState> {
	const result = await chrome.storage.local.get(STATE_KEY);
	return (result[STATE_KEY] as ExtensionState | undefined) ?? { kind: "idle" };
}

export async function setState(state: ExtensionState): Promise<void> {
	await chrome.storage.local.set({ [STATE_KEY]: state });
	broadcastState(state);
}

function broadcastState(state: ExtensionState): void {
	const payload = { type: "STATE_CHANGED", state };

	chrome.runtime.sendMessage(payload).catch(() => {});

	chrome.tabs
		.query({ url: "https://meet.google.com/*" })
		.then((tabs) => {
			for (const tab of tabs) {
				if (tab.id != null) {
					chrome.tabs.sendMessage(tab.id, payload).catch(() => {});
				}
			}
		})
		.catch(() => {});
}

export async function getSettings(): Promise<ExtensionSettings> {
	const result = await chrome.storage.local.get(SETTINGS_KEY);
	const stored =
		(result[SETTINGS_KEY] as Partial<ExtensionSettings> | undefined) ?? {};
	return { ...DEFAULT_SETTINGS, ...stored };
}

export async function setSettings(
	settings: Partial<ExtensionSettings>,
): Promise<void> {
	const current = await getSettings();
	await chrome.storage.local.set({
		[SETTINGS_KEY]: { ...current, ...settings },
	});
}
