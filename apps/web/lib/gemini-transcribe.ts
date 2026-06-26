export interface GeminiTranscribeResult {
	transcriptVtt: string;
	inputTokens: number;
	outputTokens: number;
	words?: Array<{
		word: string;
		start: number;
		end: number;
		language?: string;
	}>;
}

interface GeminiFileResponse {
	file: {
		name: string;
		uri: string;
		state: string;
	};
}

function detectMimeType(audioUrl: string): string {
	const url = audioUrl.split("?")[0] ?? audioUrl;
	if (url.endsWith(".mp4") || url.endsWith(".m4a")) return "audio/mp4";
	if (url.endsWith(".wav")) return "audio/wav";
	if (url.endsWith(".ogg")) return "audio/ogg";
	if (url.endsWith(".webm")) return "audio/webm";
	return "audio/mpeg";
}

function formatVttTimestamp(seconds: number): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.floor((seconds % 3600) / 60);
	const s = Math.floor(seconds % 60);
	const ms = Math.round((seconds % 1) * 1000);
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function plainTextToWebVTT(text: string, durationSec: number): string {
	const sentences = text
		.split(/(?<=[.?!])\s+|\n+/)
		.map((s) => s.trim())
		.filter(Boolean);

	if (sentences.length === 0) return "WEBVTT\n\n";

	const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
	let vtt = "WEBVTT\n\n";
	let elapsed = 0;
	let index = 1;

	for (const sentence of sentences) {
		const fraction =
			totalChars > 0 ? sentence.length / totalChars : 1 / sentences.length;
		const cueDuration = durationSec * fraction;
		const start = formatVttTimestamp(elapsed);
		const end = formatVttTimestamp(elapsed + cueDuration);
		vtt += `${index}\n${start} --> ${end}\n${sentence}\n\n`;
		elapsed += cueDuration;
		index++;
	}

	return vtt;
}

interface ParsedCue {
	start: number;
	end: number | null;
	text: string;
}

function parseTimestampToSeconds(raw: string): number | null {
	// Accept HH:MM:SS(.mmm) or MM:SS(.mmm)
	const m = raw
		.trim()
		.match(/^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
	if (!m) return null;
	const h = m[1] ? parseInt(m[1], 10) : 0;
	const min = parseInt(m[2] ?? "0", 10);
	const s = parseInt(m[3] ?? "0", 10);
	const ms = m[4] ? parseInt(m[4].padEnd(3, "0"), 10) : 0;
	return h * 3600 + min * 60 + s + ms / 1000;
}

function cleanCueText(raw: string): string {
	return raw
		.replace(/\*\*/g, "")
		.replace(/^[\s\-–—>]+/, "")
		.trim();
}

// WebVTT cue settings (align:, line:, position:, size:, vertical:, region:) can
// appear after the end timestamp on a standard cue line. They are NOT transcript
// text, so strip them — otherwise a standard cue's settings get mistaken for the
// cue body and the real next-line text is dropped.
const CUE_SETTING_TOKEN = /^(?:align|line|position|size|vertical|region):\S+$/i;
function stripCueSettings(text: string): string {
	return text
		.split(/\s+/)
		.filter((tok) => tok && !CUE_SETTING_TOKEN.test(tok))
		.join(" ")
		.trim();
}

const TS = "\\d{1,2}:\\d{1,2}(?::\\d{1,2})?(?:[.,]\\d{1,3})?";

/**
 * Normalize Gemini's transcript output into STANDARD WebVTT, regardless of the
 * exact shape Gemini returns. Handles: inline cues `**[start --> end]** text`,
 * standard two-line cues (timestamp line then text line(s)), and single-timestamp
 * cues `**[HH:MM:SS]** text`. Falls back to plainTextToWebVTT if no cues are found.
 */
export function normalizeToWebVtt(raw: string, audioDurationSec: number): string {
	const lines = raw.split(/\r?\n/);
	const cues: ParsedCue[] = [];

	// Inline range cue: optional **/[ then start --> end ] optional, then text on same line.
	const inlineRange = new RegExp(
		`^[\\s*\\[-]*?(${TS})\\s*-->\\s*(${TS})\\s*\\]?\\*?\\*?\\s*(.*)$`,
	);
	// Range on its own line (standard) — text (if any) follows.
	const rangeLine = new RegExp(`(${TS})\\s*-->\\s*(${TS})`);
	// Single timestamp cue: **[HH:MM:SS]** text  (no end time).
	const singleStamp = new RegExp(`^[\\s*\\[-]*?(${TS})\\s*\\]?\\*?\\*?\\s*(.*)$`);

	let pendingStart: number | null = null;
	let pendingEnd: number | null = null;
	let pendingText: string[] = [];

	const flushPending = () => {
		if (pendingStart !== null) {
			const text = cleanCueText(pendingText.join(" "));
			if (text) cues.push({ start: pendingStart, end: pendingEnd, text });
		}
		pendingStart = null;
		pendingEnd = null;
		pendingText = [];
	};

	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] ?? "").trim();
		if (!line) {
			flushPending();
			continue;
		}
		if (/^WEBVTT/i.test(line)) continue;
		// Only skip a bare numeric line as a cue index when the next non-empty
		// line is a timestamp line; otherwise treat it as cue text.
		if (/^\d+$/.test(line)) {
			let nextNonEmpty = "";
			for (let j = i + 1; j < lines.length; j++) {
				const peek = (lines[j] ?? "").trim();
				if (peek) { nextNonEmpty = peek; break; }
			}
			if (nextNonEmpty.includes("-->")) continue; // it IS a cue index
			// else fall through — treat this number as cue text below
		}

		if (line.includes("-->")) {
			flushPending();
			// Try inline (timestamp + same-line text) first.
			const im = line.match(inlineRange);
			if (im) {
				const start = parseTimestampToSeconds(im[1] ?? "");
				const end = parseTimestampToSeconds(im[2] ?? "");
				// Drop any cue-settings tokens; only real transcript text counts as
				// same-line text. Settings-only => treat as a standard two-line cue.
				const text = stripCueSettings(cleanCueText(im[3] ?? ""));
				if (start !== null) {
					if (text) {
						cues.push({ start, end, text });
					} else {
						// Standard two-line cue: text comes on following line(s).
						pendingStart = start;
						pendingEnd = end;
					}
					continue;
				}
			}
			const rm = line.match(rangeLine);
			if (rm) {
				const start = parseTimestampToSeconds(rm[1] ?? "");
				if (start !== null) {
					pendingStart = start;
					pendingEnd = parseTimestampToSeconds(rm[2] ?? "");
				}
			}
			continue;
		}

		// Single-timestamp cue (no -->): "**[HH:MM:SS]** text"
		const sm = line.match(singleStamp);
		if (sm && parseTimestampToSeconds(sm[1] ?? "") !== null && (sm[2] ?? "").trim()) {
			flushPending();
			const start = parseTimestampToSeconds(sm[1] ?? "");
			if (start !== null) {
				cues.push({ start, end: null, text: cleanCueText(sm[2] ?? "") });
				continue;
			}
		}

		// Plain text line — accumulate as body of the pending cue.
		if (pendingStart !== null) {
			pendingText.push(line);
		}
	}
	flushPending();

	if (cues.length === 0) {
		return plainTextToWebVTT(raw, audioDurationSec);
	}

	// Fill missing end times: next cue's start, or start + default for the last cue.
	const DEFAULT_TAIL = 4;
	let vtt = "WEBVTT\n\n";
	for (let i = 0; i < cues.length; i++) {
		const cue = cues[i];
		if (!cue) continue;
		let end = cue.end;
		if (end === null || end <= cue.start) {
			const next = cues[i + 1];
			if (next && next.start > cue.start) {
				end = next.start;
			} else {
				end = Math.min(cue.start + DEFAULT_TAIL, audioDurationSec || cue.start + DEFAULT_TAIL);
				if (end <= cue.start) end = cue.start + DEFAULT_TAIL;
			}
		}
		vtt += `${i + 1}\n${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(end)}\n${cue.text}\n\n`;
	}

	return vtt;
}

import { isTransientGeminiError, withGeminiRetry } from "@/lib/gemini-retry";

const GEMINI_TRANSCRIBE_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"] as const;

async function pollUntilActive(
	fileName: string,
	apiKey: string,
): Promise<void> {
	const maxAttempts = 30;
	for (let i = 0; i < maxAttempts; i++) {
		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
		);
		if (!res.ok) {
			throw new Error(`Gemini file poll failed: ${res.status}`);
		}
		const data = (await res.json()) as { state: string };
		if (data.state === "ACTIVE") return;
		if (data.state === "FAILED") {
			throw new Error("Gemini file processing failed");
		}
		await new Promise<void>((resolve) => setTimeout(resolve, 2000));
	}
	throw new Error("Gemini file never reached ACTIVE state");
}

export async function transcribeWithGemini(
	audioUrl: string,
	options: {
		apiKey: string;
		audioDurationSec?: number;
	},
): Promise<GeminiTranscribeResult> {
	const { apiKey, audioDurationSec = 300 } = options;

	const audioResponse = await fetch(audioUrl);
	if (!audioResponse.ok) {
		throw new Error(
			`Audio URL not accessible: ${audioResponse.status} ${audioResponse.statusText}`,
		);
	}

	const audioBuffer = await audioResponse.arrayBuffer();
	const audioBytes = new Uint8Array(audioBuffer);
	const mimeType = detectMimeType(audioUrl);
	const displayName = `cap-audio-${Date.now()}`;

	const uploadUrl = await withGeminiRetry(async () => {
		const initRes = await fetch(
			`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`,
			{
				method: "POST",
				headers: {
					"X-Goog-Upload-Protocol": "resumable",
					"X-Goog-Upload-Command": "start",
					"X-Goog-Upload-Header-Content-Length": String(audioBytes.byteLength),
					"X-Goog-Upload-Header-Content-Type": mimeType,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ file: { display_name: displayName } }),
			},
		);

		if (!initRes.ok) {
			throw new Error(`Gemini upload init failed (HTTP ${initRes.status})`);
		}

		const url = initRes.headers.get("x-goog-upload-url");
		if (!url) {
			throw new Error("No upload URL from Gemini Files API");
		}
		return url;
	});

	const fileData = await withGeminiRetry(async () => {
		const uploadRes = await fetch(uploadUrl, {
			method: "PUT",
			headers: {
				"X-Goog-Upload-Offset": "0",
				"X-Goog-Upload-Command": "upload, finalize",
				"Content-Length": String(audioBytes.byteLength),
			},
			body: audioBytes,
		});

		if (!uploadRes.ok) {
			throw new Error(`Gemini audio upload failed (HTTP ${uploadRes.status})`);
		}

		return (await uploadRes.json()) as GeminiFileResponse;
	});
	const { name: fileName, uri: fileUri, state } = fileData.file;

	if (!fileUri || !fileName) {
		throw new Error(
			`Gemini upload response missing file info: ${JSON.stringify(fileData)}`,
		);
	}

	if (state !== "ACTIVE") {
		await withGeminiRetry(() => pollUntilActive(fileName, apiKey));
	}

	type GenData = {
		candidates?: Array<{
			content: { parts: Array<{ text?: string }> };
		}>;
		usageMetadata?: {
			promptTokenCount?: number;
			candidatesTokenCount?: number;
		};
		error?: { message: string };
	};

	let genRes!: Response;
	let genData!: GenData;
	for (let mi = 0; mi < GEMINI_TRANSCRIBE_MODELS.length; mi++) {
		const model = GEMINI_TRANSCRIBE_MODELS[mi];
		try {
			({ genRes, genData } = await withGeminiRetry(async () => {
				const res = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							contents: [
								{
									parts: [
										{
											fileData: {
												mimeType,
												fileUri,
											},
										},
										{
											text: `You are a professional Uzbek meeting transcription editor.

Transcribe the attached online/offline meeting fully and accurately in Uzbek Latin.

Rules:

1. Transcribe the entire meeting from beginning to end. Do not summarize, skip, shorten, or stop halfway.

2. Uzbek words must be written only in Uzbek Latin. Do not write Uzbek words in Cyrillic.

3. This meeting has multiple speakers. Identify speakers by voice, context, and conversation flow.

If speaker names are known from the audio, use their names.

If names are not clear, use:
Speaker 1:
Speaker 2:
Speaker 3:

Keep speaker labels consistent across the whole transcript.

If two people talk over each other and both cannot be clearly separated, write:
[ustma-ust gaplashildi]

4. Add real, accurate timestamps from the audio. Do not use sample, fake, guessed, or template timestamps.

Put a cue boundary only where it exactly matches the audio:
- at the beginning,
- when the speaker changes,
- when a new discussion topic starts,
- when decisions, tasks, objections, or important points appear,
- when there is a meaningful pause or transition.

5. Clean the transcript professionally:
- remove filler sounds like "umm", "aa", "eee", "э"
- remove repeated stutters
- remove meaningless false starts
- keep the original meaning and speaking style

6. If an Uzbek word is unclear, correct it based on surrounding context. If it is impossible to identify, write [noaniq].

7. Keep foreign words exactly as spoken:
- Russian words must stay in Cyrillic and be bold: **сразу**, **любой**, **дефицит**
- English words must stay in English/Latin and be bold: **deadline**, **CRM**, **dashboard**
- Do not translate foreign words.
- Do not transliterate Russian words into Latin.
- Bold every foreign word or phrase.

8. Output only the transcript. No intro, no explanation, no table, no numbering.

IMPORTANT: Output STANDARD WebVTT only. Start your response with a "WEBVTT" header line, then a blank line. For each cue, put the timestamp on its OWN line as "HH:MM:SS.mmm --> HH:MM:SS.mmm", then the cue text on the NEXT line(s), then a blank line before the next cue. Do NOT put the timestamp and the text on the same line. Do NOT wrap timestamps in markdown brackets like **[...]**. The speaker labels, bold formatting, and content rules above still apply within each cue's text.`,
										},
									],
								},
							],
							generationConfig: {
								temperature: 0.1,
								maxOutputTokens: 65536,
								thinkingConfig: { thinkingBudget: 0 },
							},
						}),
					},
				);

				const data = (await res.json()) as GenData;

				if (!res.ok) {
					const errMsg = `Gemini generateContent failed (HTTP ${res.status}): ${data.error?.message ?? "unknown"}`;
					if (isTransientGeminiError(res.status, data.error?.message ?? "")) {
						throw new Error(errMsg);
					}
					// Non-transient: throw a special marker so withGeminiRetry skips retries
					const e = new Error(errMsg);
					(e as Error & { permanent?: boolean }).permanent = true;
					throw e;
				}

				return { genRes: res, genData: data };
			}));
			break; // primary model succeeded
		} catch (err) {
			const isPermanent = (err as { permanent?: boolean })?.permanent === true;
			const isLastModel = mi === GEMINI_TRANSCRIBE_MODELS.length - 1;
			if (isPermanent || isLastModel) throw err;
			const nextModel = GEMINI_TRANSCRIBE_MODELS[mi + 1];
			console.warn(
				`[gemini-transcribe] model ${model} overloaded, falling back to ${nextModel}`,
			);
		}
	}

	if (!genRes.ok) {
		throw new Error(
			`Gemini generateContent failed: ${genData.error?.message ?? genRes.status}`,
		);
	}

	const rawText = genData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
	const inputTokens = genData.usageMetadata?.promptTokenCount ?? 0;
	const outputTokens = genData.usageMetadata?.candidatesTokenCount ?? 0;

	// [diag] long-audio near-empty transcript — tells us whether Gemini itself
	// returned little (finishReason / 0 output) or our parser dropped cues
	// (rawText long but saved VTT tiny). Remove after the 10-min case is fixed.
	const finishReason = (
		genData.candidates?.[0] as { finishReason?: string } | undefined
	)?.finishReason;
	console.log(
		`[gemini-transcribe] rawText.length=${rawText.length} outputTokens=${outputTokens} finishReason=${finishReason} durationSec=${audioDurationSec} preview=${JSON.stringify(rawText.slice(0, 220))}`,
	);

	fetch(
		`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
		{ method: "DELETE" },
	).catch(() => {});

	// Always normalize Gemini's raw output into STANDARD WebVTT before saving,
	// regardless of the shape it returns (inline cues, single timestamps, etc.).
	// This keeps the AI workflow's parser happy and keeps HTML <track> captions valid.
	const transcriptVtt = normalizeToWebVtt(rawText, audioDurationSec);
	if (!transcriptVtt.includes("-->")) {
		console.warn(
			"[gemini-transcribe] Gemini did not return usable WEBVTT timestamps; fabricated approximate timestamps from plain text fallback.",
		);
	}

	return { transcriptVtt, inputTokens, outputTokens };
}
