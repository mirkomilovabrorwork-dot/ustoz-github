import type { ExtensionSettings } from "../background/state";

import { DEFAULT_API_BASE_URL } from "../shared/config";

function sendMessage(message: Record<string, unknown>): Promise<unknown> {
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

async function loadSettings(): Promise<ExtensionSettings> {
	const response = await sendMessage({ type: "GET_ALL_SETTINGS" });
	return response as ExtensionSettings;
}

async function saveSettings(
	settings: Partial<ExtensionSettings>,
): Promise<void> {
	await sendMessage({ type: "SAVE_SETTINGS", settings });
}

function showToast(message: string): void {
	const existing = document.getElementById("cap-toast");
	if (existing) existing.remove();

	const toast = document.createElement("div");
	toast.id = "cap-toast";
	toast.className = "toast";
	toast.textContent = message;
	document.body.appendChild(toast);

	requestAnimationFrame(() => {
		toast.classList.add("toast--visible");
	});

	setTimeout(() => {
		toast.classList.remove("toast--visible");
		setTimeout(() => toast.remove(), 300);
	}, 2000);
}

function createToggle(id: string, checked: boolean): HTMLElement {
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

function fieldGroup(
	labelText: string,
	control: HTMLElement,
	description?: string,
): HTMLElement {
	const group = document.createElement("div");
	group.className = "field-group";

	const label = document.createElement("label");
	label.className = "field-label";
	label.textContent = labelText;
	if (control.id) label.htmlFor = control.id;
	group.appendChild(label);

	group.appendChild(control);

	if (description) {
		const desc = document.createElement("p");
		desc.className = "field-description";
		desc.textContent = description;
		group.appendChild(desc);
	}

	return group;
}

function sectionHeader(text: string): HTMLElement {
	const h2 = document.createElement("h2");
	h2.className = "section-header";
	h2.textContent = text;
	return h2;
}

function divider(): HTMLElement {
	const hr = document.createElement("hr");
	hr.className = "section-divider";
	return hr;
}

async function populateMicrophoneSelect(
	select: HTMLSelectElement,
	currentDeviceId: string,
): Promise<void> {
	try {
		await navigator.mediaDevices.getUserMedia({ audio: true });
	} catch {
		const opt = document.createElement("option");
		opt.value = "";
		opt.textContent = "Microphone permission denied";
		select.appendChild(opt);
		return;
	}

	const devices = await navigator.mediaDevices.enumerateDevices();
	const audioInputs = devices.filter((d) => d.kind === "audioinput");

	const defaultOpt = document.createElement("option");
	defaultOpt.value = "";
	defaultOpt.textContent = "Default microphone";
	select.appendChild(defaultOpt);

	if (audioInputs.length === 0) {
		const noneOpt = document.createElement("option");
		noneOpt.value = "";
		noneOpt.textContent = "No microphones found";
		noneOpt.disabled = true;
		select.appendChild(noneOpt);
		return;
	}

	for (const device of audioInputs) {
		const opt = document.createElement("option");
		opt.value = device.deviceId;
		opt.textContent =
			device.label || `Microphone ${device.deviceId.slice(0, 8)}`;
		if (device.deviceId === currentDeviceId) opt.selected = true;
		select.appendChild(opt);
	}

	if (!currentDeviceId) {
		select.value = "";
	}
}

async function buildPermissionsSection(container: HTMLElement): Promise<void> {
	container.appendChild(sectionHeader("Permissions"));

	async function permRow(
		label: string,
		constraint: MediaStreamConstraints,
		permName: PermissionName,
	): Promise<void> {
		const group = document.createElement("div");
		group.className = "field-group";

		const rowEl = document.createElement("div");
		rowEl.className = "perm-row";

		const labelEl = document.createElement("span");
		labelEl.className = "field-label";
		labelEl.textContent = label;

		const statusEl = document.createElement("span");
		statusEl.className = "perm-status";

		const grantBtn = document.createElement("button");
		grantBtn.type = "button";
		grantBtn.className = "btn btn--primary";
		grantBtn.textContent = `Grant ${label.toLowerCase()} access`;

		async function refresh(): Promise<void> {
			let state: PermissionState = "prompt";
			try {
				const s = await navigator.permissions.query({ name: permName });
				state = s.state;
			} catch {
				state = "prompt";
			}

			if (state === "granted") {
				statusEl.textContent = "✓ Enabled";
				statusEl.className = "perm-status perm-status--ok";
				grantBtn.style.display = "none";
			} else if (state === "denied") {
				statusEl.textContent = "Blocked — check browser settings";
				statusEl.className = "perm-status perm-status--denied";
				grantBtn.style.display = "none";
			} else {
				statusEl.textContent = "Not granted";
				statusEl.className = "perm-status perm-status--unknown";
				grantBtn.style.display = "";
			}
		}

		grantBtn.addEventListener("click", async () => {
			grantBtn.disabled = true;
			try {
				const stream = await navigator.mediaDevices.getUserMedia(constraint);
				for (const t of stream.getTracks()) t.stop();
				statusEl.textContent = "✓ Enabled";
				statusEl.className = "perm-status perm-status--ok";
				grantBtn.style.display = "none";
			} catch {
				statusEl.textContent = "Permission denied — check browser settings";
				statusEl.className = "perm-status perm-status--denied";
				grantBtn.style.display = "none";
			} finally {
				grantBtn.disabled = false;
			}
		});

		rowEl.appendChild(labelEl);
		rowEl.appendChild(statusEl);
		group.appendChild(rowEl);
		group.appendChild(grantBtn);
		container.appendChild(group);

		await refresh();
	}

	await permRow("Microphone", { audio: true }, "microphone" as PermissionName);
	await permRow("Camera", { video: true }, "camera" as PermissionName);
}

function buildAccountSection(
	settings: ExtensionSettings,
	container: HTMLElement,
): {
	apiBaseUrlInput: HTMLInputElement;
	apiKeyInput: HTMLInputElement;
} {
	container.appendChild(sectionHeader("Account"));

	const apiBaseUrlInput = document.createElement("input");
	apiBaseUrlInput.type = "url";
	apiBaseUrlInput.id = "apiBaseUrl";
	apiBaseUrlInput.className = "text-input";
	apiBaseUrlInput.value = settings.apiBaseUrl || DEFAULT_API_BASE_URL;
	apiBaseUrlInput.placeholder = "https://your-data365-instance.com";
	container.appendChild(fieldGroup("data365 Server URL", apiBaseUrlInput));

	const apiKeyWrapper = document.createElement("div");
	apiKeyWrapper.className = "input-with-button";

	const apiKeyInput = document.createElement("input");
	apiKeyInput.type = "password";
	apiKeyInput.id = "apiKey";
	apiKeyInput.className = "text-input";
	apiKeyInput.value = settings.apiKey || "";
	apiKeyInput.placeholder = "Paste your data365 API key";

	const showHideBtn = document.createElement("button");
	showHideBtn.type = "button";
	showHideBtn.className = "btn btn--secondary btn--icon";
	showHideBtn.textContent = "Show";
	showHideBtn.addEventListener("click", () => {
		if (apiKeyInput.type === "password") {
			apiKeyInput.type = "text";
			showHideBtn.textContent = "Hide";
		} else {
			apiKeyInput.type = "password";
			showHideBtn.textContent = "Show";
		}
	});

	const saveConnectBtn = document.createElement("button");
	saveConnectBtn.type = "button";
	saveConnectBtn.className = "btn btn--primary";
	saveConnectBtn.textContent = "Save & Connect";
	saveConnectBtn.addEventListener("click", async () => {
		const key = apiKeyInput.value.trim();
		if (!key) {
			showToast("Paste a key first");
			return;
		}
		saveConnectBtn.disabled = true;
		const baseUrl = apiBaseUrlInput.value.trim() || DEFAULT_API_BASE_URL;
		// Fix #5: validate FIRST — only persist the apiKey on success
		try {
			const res = await fetch(`${baseUrl}/api/extension/me`, {
				headers: { Authorization: `Bearer ${key}` },
			});
			if (res.ok) {
				await saveSettings({ apiKey: key, apiBaseUrl: baseUrl });
				showToast("Connected ✓");
			} else {
				// Persist the base URL alone (user may have changed it) but NOT the bad key
				await saveSettings({ apiBaseUrl: baseUrl });
				showToast(
					res.status === 401
						? "Key not accepted — check the key"
						: `Server error (${res.status}) — check the key`,
				);
			}
		} catch {
			await saveSettings({ apiBaseUrl: baseUrl });
			showToast("Can't reach the server — check the URL");
		} finally {
			saveConnectBtn.disabled = false;
		}
	});

	apiKeyWrapper.appendChild(apiKeyInput);
	apiKeyWrapper.appendChild(showHideBtn);
	apiKeyWrapper.appendChild(saveConnectBtn);

	const apiKeyGroup = document.createElement("div");
	apiKeyGroup.className = "field-group";
	const apiKeyLabel = document.createElement("label");
	apiKeyLabel.className = "field-label";
	apiKeyLabel.htmlFor = "apiKey";
	apiKeyLabel.textContent = "API Key";
	apiKeyGroup.appendChild(apiKeyLabel);
	apiKeyGroup.appendChild(apiKeyWrapper);
	container.appendChild(apiKeyGroup);

	const connectionRow = document.createElement("div");
	connectionRow.className = "button-row";

	const testBtn = document.createElement("button");
	testBtn.type = "button";
	testBtn.className = "btn btn--primary";
	testBtn.textContent = "Test connection";

	const connectionStatus = document.createElement("span");
	connectionStatus.className = "connection-status";

	testBtn.addEventListener("click", async () => {
		testBtn.disabled = true;
		connectionStatus.className = "connection-status connection-status--loading";
		connectionStatus.textContent = "Testing…";

		const baseUrl = apiBaseUrlInput.value.trim() || DEFAULT_API_BASE_URL;
		const key = apiKeyInput.value.trim();

		try {
			const res = await fetch(`${baseUrl}/api/extension/me`, {
				headers: key ? { Authorization: `Bearer ${key}` } : {},
			});
			if (res.ok) {
				connectionStatus.className =
					"connection-status connection-status--success";
				let label = "✓ Connected";
				try {
					const data = (await res.json()) as Record<string, unknown>;
					const identity =
						typeof data.name === "string" && data.name
							? data.name
							: typeof data.email === "string" && data.email
								? data.email
								: null;
					if (identity) label = `✓ Connected as ${identity}`;
				} catch {
					// ignore JSON parse errors — label stays "✓ Connected"
				}
				connectionStatus.textContent = label;
			} else {
				connectionStatus.className =
					"connection-status connection-status--error";
				connectionStatus.textContent = "× Connection failed";
			}
		} catch {
			connectionStatus.className = "connection-status connection-status--error";
			connectionStatus.textContent = "× Connection failed";
		} finally {
			testBtn.disabled = false;
		}
	});

	const signInBtn = document.createElement("button");
	signInBtn.type = "button";
	signInBtn.className = "btn btn--secondary";
	signInBtn.textContent = "Sign in with data365";
	signInBtn.addEventListener("click", () => {
		signInBtn.disabled = true;
		showToast("Opening sign-in…");
		chrome.runtime.sendMessage({ type: "START_SIGNIN" }, (resp) => {
			signInBtn.disabled = false;
			if (chrome.runtime.lastError) {
				showToast("Sign-in error — try again");
				return;
			}
			const r = (resp ?? {}) as { ok?: boolean; error?: string };
			if (r.ok) {
				showToast("Connected ✓");
				location.reload();
			} else {
				showToast(r.error ? `Sign-in failed: ${r.error}` : "Sign-in failed — paste key below");
			}
		});
	});

	connectionRow.appendChild(testBtn);
	connectionRow.appendChild(signInBtn);
	connectionRow.appendChild(connectionStatus);
	container.appendChild(connectionRow);

	return { apiBaseUrlInput, apiKeyInput };
}

async function buildRecordingSection(
	settings: ExtensionSettings,
	container: HTMLElement,
): Promise<void> {
	container.appendChild(divider());
	container.appendChild(sectionHeader("Recording"));

	const micSelect = document.createElement("select");
	micSelect.id = "micDeviceId";
	micSelect.className = "text-input";
	container.appendChild(fieldGroup("Microphone", micSelect));
	populateMicrophoneSelect(micSelect, settings.micDeviceId).catch(() => {});

	micSelect.addEventListener("change", async () => {
		await saveSettings({ micDeviceId: micSelect.value });
		showToast("Saved");
	});

	const cameraToggleEl = createToggle("cameraOverlay", settings.cameraOverlay);
	const cameraInput = cameraToggleEl.querySelector("input") as HTMLInputElement;

	const cameraRow = document.createElement("div");
	cameraRow.className = "toggle-row";

	const cameraTextBlock = document.createElement("div");
	const cameraLabel = document.createElement("span");
	cameraLabel.className = "field-label";
	cameraLabel.textContent = "Camera overlay";
	const cameraDesc = document.createElement("p");
	cameraDesc.className = "field-description";
	cameraDesc.textContent =
		"Show your camera in a small overlay while recording";
	cameraTextBlock.appendChild(cameraLabel);
	cameraTextBlock.appendChild(cameraDesc);

	cameraRow.appendChild(cameraTextBlock);
	cameraRow.appendChild(cameraToggleEl);
	const cameraGroup = document.createElement("div");
	cameraGroup.className = "field-group";
	cameraGroup.appendChild(cameraRow);
	container.appendChild(cameraGroup);

	cameraInput.addEventListener("change", async () => {
		await saveSettings({ cameraOverlay: cameraInput.checked });
		showToast("Saved");
	});

	const captureModeGroup = document.createElement("div");
	captureModeGroup.className = "field-group";
	const captureModeLabel = document.createElement("span");
	captureModeLabel.className = "field-label";
	captureModeLabel.textContent = "Screen capture method";
	captureModeGroup.appendChild(captureModeLabel);

	const modes: Array<{
		value: "picker" | "silent-tab";
		label: string;
		description: string;
	}> = [
		{
			value: "picker",
			label: "System picker",
			description: "Choose screen, window, or tab each time (recommended)",
		},
		{
			value: "silent-tab",
			label: "Quick-record current tab",
			description:
				"Captures the active tab without showing a picker (advanced)",
		},
	];

	for (const mode of modes) {
		const radioRow = document.createElement("label");
		radioRow.className = "radio-row";

		const radio = document.createElement("input");
		radio.type = "radio";
		radio.name = "captureMode";
		radio.value = mode.value;
		radio.checked = settings.captureMode === mode.value;

		const radioTextBlock = document.createElement("div");
		const radioLabel = document.createElement("span");
		radioLabel.className = "field-label";
		radioLabel.textContent = mode.label;
		const radioDesc = document.createElement("p");
		radioDesc.className = "field-description";
		radioDesc.textContent = mode.description;
		radioTextBlock.appendChild(radioLabel);
		radioTextBlock.appendChild(radioDesc);

		radioRow.appendChild(radio);
		radioRow.appendChild(radioTextBlock);
		captureModeGroup.appendChild(radioRow);

		radio.addEventListener("change", async () => {
			if (radio.checked) {
				await saveSettings({ captureMode: mode.value });
				showToast("Saved");
			}
		});
	}

	container.appendChild(captureModeGroup);
}

function buildMeetSection(
	settings: ExtensionSettings,
	container: HTMLElement,
): void {
	container.appendChild(divider());
	container.appendChild(sectionHeader("Google Meet"));

	const autoRecordToggleEl = createToggle(
		"autoRecordOnMeet",
		settings.autoRecordOnMeet,
	);
	const autoRecordInput = autoRecordToggleEl.querySelector(
		"input",
	) as HTMLInputElement;

	const autoRecordRow = document.createElement("div");
	autoRecordRow.className = "toggle-row";

	const autoRecordTextBlock = document.createElement("div");
	const autoRecordLabel = document.createElement("span");
	autoRecordLabel.className = "field-label";
	autoRecordLabel.textContent = "Auto-record on Meet join";
	autoRecordTextBlock.appendChild(autoRecordLabel);

	autoRecordRow.appendChild(autoRecordTextBlock);
	autoRecordRow.appendChild(autoRecordToggleEl);

	const autoRecordGroup = document.createElement("div");
	autoRecordGroup.className = "field-group";
	autoRecordGroup.appendChild(autoRecordRow);

	const warningBox = document.createElement("div");
	warningBox.className = "warning-box";
	warningBox.textContent =
		"Auto-recording will start a 5-second countdown when you join a Google Meet call. Make sure participants have consented to being recorded. data365 will never start recording without showing this countdown. You can cancel during the countdown.";
	warningBox.style.display = settings.autoRecordOnMeet ? "block" : "none";
	autoRecordGroup.appendChild(warningBox);
	container.appendChild(autoRecordGroup);

	const countdownSec = settings.autoRecordCountdownSec ?? 5;
	const countdownGroup = document.createElement("div");
	countdownGroup.className = "field-group";
	countdownGroup.style.display = settings.autoRecordOnMeet ? "block" : "none";

	const countdownLabel = document.createElement("label");
	countdownLabel.className = "field-label";
	countdownLabel.htmlFor = "countdownSlider";
	countdownLabel.textContent = "Countdown duration";
	countdownGroup.appendChild(countdownLabel);

	const sliderRow = document.createElement("div");
	sliderRow.className = "slider-row";

	const slider = document.createElement("input");
	slider.type = "range";
	slider.id = "countdownSlider";
	slider.min = "3";
	slider.max = "10";
	slider.step = "1";
	slider.value = String(countdownSec);
	slider.className = "range-slider";

	const sliderValue = document.createElement("span");
	sliderValue.className = "slider-value";
	sliderValue.textContent = `${countdownSec} seconds`;

	slider.addEventListener("input", () => {
		sliderValue.textContent = `${slider.value} seconds`;
	});

	slider.addEventListener("change", async () => {
		await saveSettings({ autoRecordCountdownSec: Number(slider.value) });
		showToast("Saved");
	});

	sliderRow.appendChild(slider);
	sliderRow.appendChild(sliderValue);
	countdownGroup.appendChild(sliderRow);
	container.appendChild(countdownGroup);

	autoRecordInput.addEventListener("change", async () => {
		const on = autoRecordInput.checked;
		warningBox.style.display = on ? "block" : "none";
		countdownGroup.style.display = on ? "block" : "none";
		await saveSettings({ autoRecordOnMeet: on });
		showToast("Saved");
	});

	const soundToggleEl = createToggle("soundEnabled", settings.soundEnabled);
	const soundInput = soundToggleEl.querySelector("input") as HTMLInputElement;

	const soundRow = document.createElement("div");
	soundRow.className = "toggle-row";

	const soundTextBlock = document.createElement("div");
	const soundLabel = document.createElement("span");
	soundLabel.className = "field-label";
	soundLabel.textContent = "Notification sounds";
	soundTextBlock.appendChild(soundLabel);

	soundRow.appendChild(soundTextBlock);
	soundRow.appendChild(soundToggleEl);

	const soundGroup = document.createElement("div");
	soundGroup.className = "field-group";
	soundGroup.appendChild(soundRow);
	container.appendChild(soundGroup);

	soundInput.addEventListener("change", async () => {
		await saveSettings({ soundEnabled: soundInput.checked });
		showToast("Saved");
	});
}

function buildAboutSection(
	settings: ExtensionSettings,
	container: HTMLElement,
): void {
	container.appendChild(divider());
	container.appendChild(sectionHeader("About"));

	const version = document.createElement("p");
	version.className = "about-version";
	version.textContent = "data365 Recorder v0.1.0";
	container.appendChild(version);

	const links = document.createElement("div");
	links.className = "about-links";

	const baseUrl = settings.apiBaseUrl || DEFAULT_API_BASE_URL;

	const linkDefs: Array<{ label: string; href: string }> = [
		{ label: "Extension page", href: `${baseUrl}/extension/install` },
		{ label: "data365 Dashboard", href: `${baseUrl}/dashboard` },
		{
			label: "Report an issue",
			href: "https://github.com/CapSoftware/Cap/issues",
		},
	];

	for (const def of linkDefs) {
		const a = document.createElement("a");
		a.href = def.href;
		a.textContent = def.label;
		a.className = "about-link";
		a.target = "_blank";
		a.rel = "noopener noreferrer";
		links.appendChild(a);
	}

	container.appendChild(links);

	const tagline = document.createElement("p");
	tagline.className = "about-tagline";
	tagline.textContent = "data365 — screen recording for instruction";
	container.appendChild(tagline);
}

async function init(): Promise<void> {
	const root = document.getElementById("root");
	if (!root) return;

	const settings = await loadSettings();

	const container = document.createElement("div");
	container.className = "settings-container";

	await buildPermissionsSection(container);
	container.appendChild(divider());

	const { apiBaseUrlInput, apiKeyInput } = buildAccountSection(
		settings,
		container,
	);
	await buildRecordingSection(settings, container);
	buildMeetSection(settings, container);
	buildAboutSection(settings, container);

	root.appendChild(container);

	function saveOnBlur(
		input: HTMLInputElement,
		key: keyof ExtensionSettings,
	): void {
		input.addEventListener("blur", async () => {
			await saveSettings({ [key]: input.value.trim() });
			showToast("Saved");
		});
	}

	saveOnBlur(apiBaseUrlInput, "apiBaseUrl");
	// NOTE: the API key is intentionally NOT blur-saved. It is persisted only
	// through "Save & Connect" (which validates via /api/extension/me first) or
	// the OAuth CAP_EXTENSION_TOKEN message — so a mistyped/invalid key can't
	// silently masquerade as "signed in".

	chrome.runtime.onMessage.addListener((message: unknown) => {
		if (
			typeof message === "object" &&
			message !== null &&
			(message as Record<string, unknown>).type === "CAP_EXTENSION_TOKEN"
		) {
			const msg = message as Record<string, unknown>;
			const token = typeof msg.token === "string" ? msg.token : "";
			const newBaseUrl =
				typeof msg.apiBaseUrl === "string" ? msg.apiBaseUrl : "";
			if (token) apiKeyInput.value = token;
			if (newBaseUrl) apiBaseUrlInput.value = newBaseUrl;
			saveSettings({
				apiKey: token,
				...(newBaseUrl ? { apiBaseUrl: newBaseUrl } : {}),
			})
				.then(() => showToast("Signed in successfully!"))
				.catch(() => {});
		}
	});
}

init().catch(console.error);
