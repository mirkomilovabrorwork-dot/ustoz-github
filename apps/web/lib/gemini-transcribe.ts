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
		throw new Error(`Gemini upload init failed: ${initRes.status}`);
	}

	const uploadUrl = initRes.headers.get("x-goog-upload-url");
	if (!uploadUrl) {
		throw new Error("No upload URL from Gemini Files API");
	}

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
		throw new Error(`Gemini audio upload failed: ${uploadRes.status}`);
	}

	const fileData = (await uploadRes.json()) as GeminiFileResponse;
	const { name: fileName, uri: fileUri, state } = fileData.file;

	if (!fileUri || !fileName) {
		throw new Error(
			`Gemini upload response missing file info: ${JSON.stringify(fileData)}`,
		);
	}

	if (state !== "ACTIVE") {
		await pollUntilActive(fileName, apiKey);
	}

	const genRes = await fetch(
		`https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${apiKey}`,
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

Put timestamps only where they exactly match the audio:
- at the beginning,
- when the speaker changes,
- when a new discussion topic starts,
- when decisions, tasks, objections, or important points appear,
- when there is a meaningful pause or transition.

Timestamp format:
**[HH:MM:SS]**

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

IMPORTANT: Start your response with "WEBVTT" header and format each line as WebVTT cues with timestamps in HH:MM:SS.mmm --> HH:MM:SS.mmm format. The speaker labels, bold formatting, and content rules above still apply within each cue text.`,
							},
						],
					},
				],
				generationConfig: {
					temperature: 0.1,
					maxOutputTokens: 8192,
				},
			}),
		},
	);

	const genData = (await genRes.json()) as {
		candidates?: Array<{
			content: { parts: Array<{ text?: string }> };
		}>;
		usageMetadata?: {
			promptTokenCount?: number;
			candidatesTokenCount?: number;
		};
		error?: { message: string };
	};

	if (!genRes.ok) {
		throw new Error(
			`Gemini generateContent failed: ${genData.error?.message ?? genRes.status}`,
		);
	}

	const rawText = genData.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
	const inputTokens = genData.usageMetadata?.promptTokenCount ?? 0;
	const outputTokens = genData.usageMetadata?.candidatesTokenCount ?? 0;

	fetch(
		`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`,
		{ method: "DELETE" },
	).catch(() => {});

	const transcriptVtt = rawText.trimStart().startsWith("WEBVTT")
		? rawText.trimStart()
		: plainTextToWebVTT(rawText, audioDurationSec);

	return { transcriptVtt, inputTokens, outputTokens };
}
