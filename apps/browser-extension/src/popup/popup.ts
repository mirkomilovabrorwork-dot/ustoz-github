import type { ExtensionSettings, ExtensionState } from "../background/state";

interface PopupData {
	state: ExtensionState;
	settings: ExtensionSettings;
	isMeetTab: boolean;
	meetingId: string | null;
	activeTabId: number | undefined;
}

let timerInterval: ReturnType<typeof setInterval> | null = null;
let micStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let meterRaf: number | null = null;

function stopTimer(): void {
	if (timerInterval !== null) {
		clearInterval(timerInterval);
		timerInterval = null;
	}
}

function teardownMic(): void {
	if (meterRaf !== null) {
		cancelAnimationFrame(meterRaf);
		meterRaf = null;
	}
	if (analyser) {
		analyser.disconnect();
		analyser = null;
	}
	if (audioCtx) {
		audioCtx.close().catch(() => {});
		audioCtx = null;
	}
	if (micStream) {
		for (const track of micStream.getTracks()) track.stop();
		micStream = null;
	}
}

function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	attrs: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {},
	...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	for (const [key, value] of Object.entries(attrs)) {
		if (key === "className") {
			node.className = value as string;
		} else {
			(node as unknown as Record<string, unknown>)[key] = value;
		}
	}
	for (const child of children) {
		if (typeof child === "string") {
			node.appendChild(document.createTextNode(child));
		} else {
			node.appendChild(child);
		}
	}
	return node;
}

function formatElapsed(ms: number): string {
	const totalSec = Math.floor(ms / 1000);
	const h = Math.floor(totalSec / 3600);
	const m = Math.floor((totalSec % 3600) / 60);
	const s = totalSec % 60;
	const hh = String(h).padStart(2, "0");
	const mm = String(m).padStart(2, "0");
	const ss = String(s).padStart(2, "0");
	return `${hh}:${mm}:${ss}`;
}

function sendMsg(msg: Record<string, unknown>): void {
	chrome.runtime.sendMessage(msg, () => {
		if (chrome.runtime.lastError) {
		}
	});
}

function createToggleEl(id: string, checked: boolean): HTMLElement {
	const label = document.createElement("label");
	label.className = "toggle";
	label.htmlFor = id;
	const input = document.createElement("input");
	input.type = "checkbox";
	input.id = id;
	input.checked = checked;
	const track = document.createElement("span");
	track.className = "toggle__track";
	const knob = document.createElement("span");
	knob.className = "toggle__knob";
	track.appendChild(knob);
	label.appendChild(input);
	label.appendChild(track);
	return label;
}

function startMicMeter(deviceId: string, bars: HTMLElement[]): void {
	teardownMic();

	const constraints: MediaStreamConstraints = deviceId
		? { audio: { deviceId: { exact: deviceId } } }
		: { audio: true };

	navigator.mediaDevices
		.getUserMedia(constraints)
		.then((stream) => {
			micStream = stream;
			audioCtx = new AudioContext();
			analyser = audioCtx.createAnalyser();
			analyser.fftSize = 256;
			const source = audioCtx.createMediaStreamSource(stream);
			source.connect(analyser);
			const data = new Uint8Array(analyser.frequencyBinCount);

			function tick(): void {
				if (!analyser) return;
				analyser.getByteFrequencyData(data);
				let sum = 0;
				for (let i = 0; i < data.length; i++) sum += data[i];
				const avg = sum / data.length;
				const level = Math.min(1, avg / 80);
				const lit = Math.round(level * bars.length);
				for (let i = 0; i < bars.length; i++) {
					bars[i].classList.toggle("mic-bar--active", i < lit);
				}
				meterRaf = requestAnimationFrame(tick);
			}

			meterRaf = requestAnimationFrame(tick);
		})
		.catch(() => {
			for (const bar of bars) bar.classList.remove("mic-bar--active");
		});
}

function buildMicMeter(): { meterEl: HTMLElement; bars: HTMLElement[] } {
	const meterEl = el("div", { className: "mic-meter" });
	const bars: HTMLElement[] = [];
	for (let i = 0; i < 7; i++) {
		const bar = el("span", { className: "mic-bar" });
		meterEl.appendChild(bar);
		bars.push(bar);
	}
	return { meterEl, bars };
}

async function checkPermission(name: PermissionName): Promise<PermissionState> {
	try {
		const status = await navigator.permissions.query({ name });
		return status.state;
	} catch {
		return "prompt";
	}
}

async function populateDeviceSelect(
	select: HTMLSelectElement,
	kind: "audioinput" | "videoinput",
	currentDeviceId: string,
	permissionConstraint: MediaStreamConstraints,
): Promise<"granted" | "blocked"> {
	const permName = (
		kind === "audioinput" ? "microphone" : "camera"
	) as PermissionName;
	let permState = await checkPermission(permName);

	if (permState !== "granted") {
		try {
			const testStream =
				await navigator.mediaDevices.getUserMedia(permissionConstraint);
			for (const t of testStream.getTracks()) t.stop();
			permState = "granted";
		} catch {
			return "blocked";
		}
	}

	const devices = await navigator.mediaDevices.enumerateDevices();
	const filtered = devices.filter((d) => d.kind === kind);

	const defaultOpt = document.createElement("option");
	defaultOpt.value = "";
	defaultOpt.textContent =
		kind === "audioinput" ? "Default microphone" : "Default camera";
	select.appendChild(defaultOpt);

	for (const device of filtered) {
		const label =
			device.label ||
			`${kind === "audioinput" ? "Mic" : "Camera"} ${device.deviceId.slice(0, 6)}`;
		const opt = document.createElement("option");
		opt.value = device.deviceId;
		opt.textContent = label;
		if (device.deviceId === currentDeviceId) opt.selected = true;
		select.appendChild(opt);
	}

	if (!currentDeviceId) select.value = "";
	return "granted";
}

function renderIdlePanel(
	root: HTMLElement,
	settings: ExtensionSettings,
	isMeetTab: boolean,
	meetingId: string | null,
	activeTabId: number | undefined,
): void {
	const logo = document.createElement("img");
	logo.src = "icons/icon-128.png";
	logo.width = 28;
	logo.height = 28;
	logo.alt = "Cap";

	const logoLabel = el(
		"span",
		{ className: "panel-logo-label" },
		"Cap Recorder",
	);
	const logoRow = el("div", { className: "panel-logo-row" }, logo, logoLabel);
	root.appendChild(logoRow);

	const actionsSection = el("div", { className: "panel-section" });

	const meetBtn = document.createElement("button");
	meetBtn.className = "btn btn-primary";

	if (isMeetTab && meetingId) {
		meetBtn.textContent = `Record Meeting · ${meetingId}`;
		meetBtn.addEventListener("click", () => {
			const msg: Record<string, unknown> = { type: "START_MEET", meetingId };
			if (activeTabId !== undefined) msg.tabId = activeTabId;
			sendMsg(msg);
			window.close();
		});
	} else {
		meetBtn.textContent = "Record Meeting";
		meetBtn.disabled = true;
		meetBtn.classList.add("btn--disabled");
	}

	const instrBtn = el(
		"button",
		{ className: "btn btn-secondary" },
		"Record Instruction",
	);
	instrBtn.addEventListener("click", () => {
		sendMsg({ type: "START_INSTRUCTION" });
		window.close();
	});

	actionsSection.appendChild(meetBtn);
	actionsSection.appendChild(instrBtn);

	if (!isMeetTab || !meetingId) {
		const hint = el(
			"p",
			{ className: "panel-hint" },
			"Join a Google Meet to record a meeting",
		);
		actionsSection.appendChild(hint);
	}

	root.appendChild(actionsSection);
	root.appendChild(el("div", { className: "panel-divider" }));

	const devicesSection = el("div", { className: "panel-section" });
	devicesSection.appendChild(
		el("p", { className: "panel-section-label" }, "Devices"),
	);

	let micEnabled = settings.micEnabled !== false;
	let micDeviceId = settings.micDeviceId ?? "";

	const { meterEl, bars } = buildMicMeter();

	const micSelect = document.createElement("select");
	micSelect.className = "device-select";
	micSelect.disabled = !micEnabled;

	const micToggleWrap = createToggleEl("mic-toggle", micEnabled);
	const micToggleInput = micToggleWrap.querySelector(
		"input",
	) as HTMLInputElement;

	const micEnableBtn = el(
		"button",
		{ className: "btn btn-secondary perm-btn" },
		"Enable microphone",
	);
	micEnableBtn.style.display = "none";
	micEnableBtn.addEventListener("click", () => {
		chrome.runtime.openOptionsPage();
	});

	const micRow = el(
		"div",
		{ className: "device-row" },
		el("span", { className: "device-row-label" }, "Mic"),
		micToggleWrap,
		micSelect,
		micEnableBtn,
		meterEl,
	);
	devicesSection.appendChild(micRow);

	function updateMicState(): void {
		micSelect.disabled = !micEnabled;
		if (micEnabled) {
			meterEl.classList.remove("mic-meter--off");
			startMicMeter(micDeviceId, bars);
		} else {
			meterEl.classList.add("mic-meter--off");
			teardownMic();
			for (const bar of bars) bar.classList.remove("mic-bar--active");
		}
	}

	micToggleInput.addEventListener("change", () => {
		micEnabled = micToggleInput.checked;
		sendMsg({ type: "SAVE_SETTINGS", settings: { micEnabled } });
		updateMicState();
	});

	micSelect.addEventListener("change", () => {
		micDeviceId = micSelect.value;
		sendMsg({ type: "SAVE_SETTINGS", settings: { micDeviceId } });
		if (micEnabled) startMicMeter(micDeviceId, bars);
	});

	populateDeviceSelect(micSelect, "audioinput", micDeviceId, { audio: true })
		.then((result) => {
			if (result === "blocked") {
				micSelect.style.display = "none";
				meterEl.style.display = "none";
				micToggleWrap.style.display = "none";
				micEnableBtn.style.display = "";
			} else {
				updateMicState();
			}
		})
		.catch(() => {
			meterEl.classList.add("mic-meter--off");
		});

	let cameraEnabled = settings.cameraOverlay;
	let cameraDeviceId = settings.cameraDeviceId ?? "";

	const cameraSelect = document.createElement("select");
	cameraSelect.className = "device-select";
	cameraSelect.disabled = !cameraEnabled;

	const cameraToggleWrap = createToggleEl("camera-toggle", cameraEnabled);
	const cameraToggleInput = cameraToggleWrap.querySelector(
		"input",
	) as HTMLInputElement;

	const cameraEnableBtn = el(
		"button",
		{ className: "btn btn-secondary perm-btn" },
		"Enable camera",
	);
	cameraEnableBtn.style.display = "none";
	cameraEnableBtn.addEventListener("click", () => {
		chrome.runtime.openOptionsPage();
	});

	const cameraRow = el(
		"div",
		{ className: "device-row" },
		el("span", { className: "device-row-label" }, "Camera"),
		cameraToggleWrap,
		cameraSelect,
		cameraEnableBtn,
	);
	devicesSection.appendChild(cameraRow);

	cameraToggleInput.addEventListener("change", () => {
		cameraEnabled = cameraToggleInput.checked;
		cameraSelect.disabled = !cameraEnabled;
		sendMsg({
			type: "SAVE_SETTINGS",
			settings: { cameraOverlay: cameraEnabled },
		});
	});

	cameraSelect.addEventListener("change", () => {
		cameraDeviceId = cameraSelect.value;
		sendMsg({ type: "SAVE_SETTINGS", settings: { cameraDeviceId } });
	});

	populateDeviceSelect(cameraSelect, "videoinput", cameraDeviceId, {
		video: true,
	})
		.then((result) => {
			if (result === "blocked") {
				cameraSelect.style.display = "none";
				cameraToggleWrap.style.display = "none";
				cameraEnableBtn.style.display = "";
			}
		})
		.catch(() => {});

	root.appendChild(devicesSection);
	root.appendChild(el("div", { className: "panel-divider" }));

	const footer = el("div", { className: "panel-footer" });
	const settingsLink = el("button", { className: "link-btn" }, "Settings");
	settingsLink.addEventListener("click", () => {
		chrome.runtime.openOptionsPage();
	});
	footer.appendChild(settingsLink);
	root.appendChild(footer);
}

function renderNotSignedIn(
	root: HTMLElement,
	settings: ExtensionSettings,
): void {
	const logoWrap = el(
		"div",
		{ className: "logo-wrap" },
		el("img", {
			src: "icons/icon-128.png",
			width: 48,
			height: 48,
			alt: "Cap",
		} as unknown as Partial<HTMLImageElement>),
		el("h1", {}, "Cap Recorder"),
	);

	const signInBtn = el(
		"button",
		{ className: "btn btn-primary" },
		"Sign in to Cap",
	);
	signInBtn.addEventListener("click", () => {
		const url = `${settings.apiBaseUrl}/extension/callback?extensionId=${chrome.runtime.id}`;
		chrome.tabs.create({ url });
	});

	const apiKeyInput = el("input", {
		className: "api-key-input",
		type: "text",
		placeholder: "Paste your Cap API key",
	} as unknown as Partial<HTMLInputElement>);

	const connectBtn = el(
		"button",
		{ className: "btn btn-secondary" },
		"Connect",
	);

	const inlineMsg = el("p", { className: "inline-msg" });

	connectBtn.addEventListener("click", async () => {
		const key = (apiKeyInput as HTMLInputElement).value.trim();
		if (!key) {
			inlineMsg.textContent = "Please paste a key";
			return;
		}
		inlineMsg.textContent = "";
		connectBtn.disabled = true;
		connectBtn.textContent = "Verifying...";
		chrome.runtime.sendMessage(
			{
				type: "SAVE_SETTINGS",
				settings: { apiKey: key, apiBaseUrl: settings.apiBaseUrl },
			},
			async () => {
				try {
					const res = await fetch(`${settings.apiBaseUrl}/api/extension/me`, {
						headers: { Authorization: `Bearer ${key}` },
					});
					if (res.ok) {
						location.reload();
					} else {
						inlineMsg.textContent =
							"That key isn't valid — check it and try again";
						connectBtn.disabled = false;
						connectBtn.textContent = "Connect";
						chrome.runtime.sendMessage({
							type: "SAVE_SETTINGS",
							settings: { apiKey: "", apiBaseUrl: settings.apiBaseUrl },
						});
					}
				} catch {
					inlineMsg.textContent =
						"That key isn't valid — check it and try again";
					connectBtn.disabled = false;
					connectBtn.textContent = "Connect";
					chrome.runtime.sendMessage({
						type: "SAVE_SETTINGS",
						settings: { apiKey: "", apiBaseUrl: settings.apiBaseUrl },
					});
				}
			},
		);
	});

	root.appendChild(logoWrap);
	root.appendChild(signInBtn);
	root.appendChild(apiKeyInput);
	root.appendChild(connectBtn);
	root.appendChild(inlineMsg);
}

function renderRecording(
	root: HTMLElement,
	state: Extract<ExtensionState, { kind: "recording" }>,
): void {
	stopTimer();

	const header = el(
		"div",
		{ className: "recording-header" },
		el("span", { className: "rec-dot" }),
		el("span", { className: "rec-label" }, "Recording"),
	);

	const timerEl = el(
		"div",
		{ className: "timer" },
		formatElapsed(Date.now() - state.startedAt),
	);

	const modeEl = el(
		"p",
		{ className: "mode-label" },
		state.mode === "meeting" ? "Meeting" : "Instruction",
	);

	const pauseLabel = state.paused ? "Resume" : "Pause";
	const pauseBtn = el("button", { className: "btn btn-secondary" }, pauseLabel);
	pauseBtn.addEventListener("click", () => {
		pauseBtn.disabled = true;
		pauseBtn.textContent = state.paused ? "Resuming..." : "Pausing...";
		sendMsg({ type: state.paused ? "RESUME" : "PAUSE" });
		setTimeout(() => {
			pauseBtn.disabled = false;
			pauseBtn.textContent = state.paused ? "Resume" : "Pause";
		}, 200);
	});

	const stopBtn = el("button", { className: "btn btn-danger" }, "Stop");
	stopBtn.addEventListener("click", () => {
		stopBtn.disabled = true;
		stopBtn.textContent = "Finishing...";
		pauseBtn.disabled = true;
		sendMsg({ type: "STOP" });
	});

	const btnRow = el("div", { className: "btn-row" }, pauseBtn, stopBtn);

	root.appendChild(header);
	root.appendChild(timerEl);
	root.appendChild(modeEl);
	root.appendChild(btnRow);

	const startedAt = state.startedAt;
	timerInterval = setInterval(() => {
		timerEl.textContent = formatElapsed(Date.now() - startedAt);
	}, 1000);
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function renderUploading(
	root: HTMLElement,
	state: Extract<ExtensionState, { kind: "uploading" }>,
): void {
	const wrap = el("div", { className: "uploading-wrap" });

	const title = el("p", { className: "uploading-title" }, "Uploading...");
	const spinner = el("div", { className: "spinner" });

	const pct =
		state.totalBytes > 0
			? Math.round((state.uploadedBytes / state.totalBytes) * 100)
			: 0;
	const progressText = `${formatBytes(state.uploadedBytes)} uploaded (${pct}%)`;
	const partsEl = el("p", { className: "parts-count" }, progressText);

	const cancelLink = el("button", { className: "link-btn" }, "Cancel upload");
	cancelLink.addEventListener("click", () => {
		sendMsg({ type: "CANCEL" });
	});

	wrap.appendChild(title);
	wrap.appendChild(spinner);
	wrap.appendChild(partsEl);
	wrap.appendChild(cancelLink);
	root.appendChild(wrap);
}

function renderFinishing(root: HTMLElement): void {
	const wrap = el("div", { className: "uploading-wrap" });
	const title = el("p", { className: "uploading-title" }, "Finishing up...");
	const spinner = el("div", { className: "spinner" });
	wrap.appendChild(title);
	wrap.appendChild(spinner);
	root.appendChild(wrap);
}

function renderComplete(
	root: HTMLElement,
	state: Extract<ExtensionState, { kind: "complete" }>,
): void {
	const wrap = el("div", { className: "complete-wrap" });

	const check = el("div", { className: "complete-icon" }, "✓");
	const title = el("p", { className: "complete-title" }, "Recording saved!");

	const linkEl = el("p", { className: "share-url" }, state.shareUrl);

	const btnRow = el("div", { className: "btn-row" });

	const copyBtn = el("button", { className: "btn btn-primary" }, "Copy link");
	copyBtn.addEventListener("click", () => {
		navigator.clipboard.writeText(state.shareUrl).then(() => {
			copyBtn.textContent = "Copied!";
			setTimeout(() => {
				copyBtn.textContent = "Copy link";
			}, 2000);
		});
	});

	const openBtn = el("button", { className: "btn btn-secondary" }, "Open");
	openBtn.addEventListener("click", () => {
		chrome.tabs.create({ url: state.shareUrl });
	});

	const doneBtn = el("button", { className: "link-btn" }, "Done");
	doneBtn.addEventListener("click", () => {
		sendMsg({ type: "CANCEL" });
	});

	btnRow.appendChild(copyBtn);
	btnRow.appendChild(openBtn);

	wrap.appendChild(check);
	wrap.appendChild(title);
	wrap.appendChild(linkEl);
	wrap.appendChild(btnRow);
	wrap.appendChild(doneBtn);
	root.appendChild(wrap);
}

function renderError(
	root: HTMLElement,
	state: Extract<ExtensionState, { kind: "error" }>,
): void {
	const wrap = el("div", { className: "error-wrap" });

	const icon = el("div", { className: "error-icon" }, "⚠️");
	const msg = el("p", { className: "error-msg" }, state.reason);

	wrap.appendChild(icon);
	wrap.appendChild(msg);

	if (state.recoverable) {
		const retryBtn = el("button", { className: "btn btn-primary" }, "Retry");
		retryBtn.addEventListener("click", () => {
			sendMsg({ type: "RETRY" });
		});
		wrap.appendChild(retryBtn);
	}

	const dismissBtn = el(
		"button",
		{ className: "btn btn-secondary" },
		"Dismiss",
	);
	dismissBtn.addEventListener("click", () => {
		sendMsg({ type: "CANCEL" });
	});
	wrap.appendChild(dismissBtn);

	root.appendChild(wrap);
}

function renderArming(root: HTMLElement): void {
	const msg = el("p", { className: "footnote" }, "Starting recording...");
	root.appendChild(msg);
}

function render(data: PopupData): void {
	stopTimer();
	teardownMic();

	const root = document.getElementById("root");
	if (!root) return;

	root.innerHTML = "";

	const popup = el("div", { className: "popup popup-content popup-content--entering" });

	const { state, settings, isMeetTab, meetingId, activeTabId } = data;
	const signedIn = settings.apiKey.length > 0;

	if (!signedIn) {
		renderNotSignedIn(popup, settings);
	} else if (state.kind === "recording") {
		renderRecording(popup, state);
	} else if (state.kind === "uploading") {
		renderUploading(popup, state);
	} else if (state.kind === "finishing") {
		renderFinishing(popup);
	} else if (state.kind === "complete") {
		renderComplete(popup, state);
	} else if (state.kind === "error") {
		renderError(popup, state);
	} else if (state.kind === "arming") {
		renderArming(popup);
	} else {
		renderIdlePanel(popup, settings, isMeetTab, meetingId, activeTabId);
	}

	root.appendChild(popup);
	requestAnimationFrame(() => {
		requestAnimationFrame(() => {
			popup.classList.remove("popup-content--entering");
		});
	});
}

function getMeetingId(url: string): string | null {
	try {
		const parsed = new URL(url);
		if (!parsed.hostname.endsWith("meet.google.com")) return null;
		const match = /^\/([a-z]+-[a-z]+-[a-z]+)$/i.exec(parsed.pathname);
		return match ? match[1] : null;
	} catch {
		return null;
	}
}

async function getSettingsFromSW(): Promise<ExtensionSettings> {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage(
			{ type: "GET_ALL_SETTINGS" },
			(response: unknown) => {
				if (
					chrome.runtime.lastError ||
					!response ||
					typeof response !== "object"
				) {
					resolve({
						apiBaseUrl: "https://web-production-e6fe4.up.railway.app",
						apiKey: "",
						autoRecordOnMeet: false,
						autoRecordCountdownSec: 5,
						micDeviceId: "",
						micEnabled: true,
						captureMode: "picker",
						soundEnabled: true,
						cameraOverlay: false,
						cameraDeviceId: "",
					});
					return;
				}
				resolve(response as ExtensionSettings);
			},
		);
	});
}

async function getStateFromSW(): Promise<ExtensionState> {
	return new Promise((resolve) => {
		chrome.runtime.sendMessage({ type: "GET_STATE" }, (response: unknown) => {
			if (
				chrome.runtime.lastError ||
				!response ||
				typeof response !== "object"
			) {
				resolve({ kind: "idle" });
				return;
			}
			resolve(response as ExtensionState);
		});
	});
}

function renderOnboarding(root: HTMLElement, onDone: () => void): void {
	const wrap = el("div", { className: "onboarding" });

	const logo = document.createElement("img");
	logo.src = "icons/icon-128.png";
	logo.width = 48;
	logo.height = 48;
	logo.alt = "Cap";

	const heading = el("h1", {}, "Welcome to Cap");

	const list = el(
		"ul",
		{ className: "onboarding-list" },
		el("li", {}, "Cap records what you choose — screen, window, or tab"),
		el(
			"li",
			{},
			"We never start recording without showing a visible countdown",
		),
		el("li", {}, "Auto-record on Google Meet is off by default"),
	);

	const gotItBtn = el("button", { className: "btn btn-primary" }, "Got it");
	gotItBtn.addEventListener("click", () => {
		chrome.storage.local.set({ capExtFirstRun: false }, () => {
			onDone();
		});
	});

	wrap.appendChild(logo);
	wrap.appendChild(heading);
	wrap.appendChild(list);
	wrap.appendChild(gotItBtn);
	root.appendChild(wrap);
}

async function init(): Promise<void> {
	const [tabs, state, settings] = await Promise.all([
		chrome.tabs.query({ active: true, currentWindow: true }),
		getStateFromSW(),
		getSettingsFromSW(),
	]);

	const activeTab = tabs[0];
	const tabUrl = activeTab?.url ?? "";
	const meetingId = getMeetingId(tabUrl);
	const isMeetTab = meetingId !== null;

	let currentData: PopupData = {
		state,
		settings,
		isMeetTab,
		meetingId,
		activeTabId: activeTab?.id,
	};

	const root = document.getElementById("root");
	if (!root) return;

	const firstRunResult = await chrome.storage.local.get("capExtFirstRun");
	if (firstRunResult.capExtFirstRun !== false) {
		renderOnboarding(root, () => {
			while (root.firstChild) root.removeChild(root.firstChild);
			render(currentData);
		});
	} else {
		render(currentData);
	}

	chrome.runtime.onMessage.addListener((message: unknown) => {
		if (
			typeof message === "object" &&
			message !== null &&
			(message as Record<string, unknown>).type === "STATE_CHANGED"
		) {
			const newState = (message as Record<string, unknown>)
				.state as ExtensionState;
			currentData = { ...currentData, state: newState };
			render(currentData);
		}
	});

	chrome.storage.onChanged.addListener((changes, area) => {
		if (area === "local" && changes.capExtState?.newValue) {
			const newState = changes.capExtState.newValue as ExtensionState;
			currentData = { ...currentData, state: newState };
			render(currentData);
		}
	});
}

window.addEventListener("beforeunload", () => {
	stopTimer();
	teardownMic();
});

init().catch(() => {});
