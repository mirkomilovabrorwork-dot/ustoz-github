import { db } from "@cap/database";
import { videos } from "@cap/database/schema";
import type {
	AiSummary,
	ShareLanguage,
	VideoMetadata,
} from "@cap/database/types";
import { serverEnv } from "@cap/env";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { Option } from "effect";
import { z } from "zod";
import { withCostGuard } from "@/lib/ai-cost-guard";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { runPromise } from "@/lib/server";
import { getStorageAccessForVideo } from "@/lib/video-storage";

interface TranslateAiContentPayload {
	videoId: string;
	userId: string;
	language: ShareLanguage;
}

const SHARE_LANGUAGE_NAMES: Record<ShareLanguage, string> = {
	uz: "Uzbek (Latin script)",
	ru: "Russian",
	en: "English",
};

function getTranslationLanguageInstruction(language: ShareLanguage): string {
	return `Translate ALL text fields into ${SHARE_LANGUAGE_NAMES[language]}. Preserve the original meaning exactly — do not summarize, shorten, or add content. Keep technical terms, product names, brand names, and code identifiers in their original form when there is no natural equivalent. Output the SAME JSON structure as the input, with every text field translated.`;
}

const AiSummarySchema = z.object({
	overview: z.string().default(""),
	topics: z
		.array(z.object({ title: z.string(), body: z.string() }))
		.default([]),
	nextSteps: z.array(z.string()).default([]),
	tasks: z
		.array(
			z.object({
				title: z.string(),
				assignee: z.string().default(""),
				priority: z.enum(["high", "medium", "low"]).default("medium"),
				deadline: z.string().default(""),
				done: z.boolean().default(false),
			}),
		)
		.default([]),
	chapters: z
		.array(
			z.object({
				startSec: z.number(),
				title: z.string(),
				body: z.string(),
			}),
		)
		.default([]),
	refinedTranscript: z
		.object({
			chapters: z
				.array(
					z.object({
						startSec: z.number(),
						title: z.string(),
						paragraphs: z.array(z.string()),
					}),
				)
				.default([]),
		})
		.default({ chapters: [] }),
});

const GEMINI_TRANSLATE_MODEL = "gemini-2.5-flash";

interface AiCallContext {
	orgId: string;
	userId: string;
	videoId: string;
}

function cleanJsonResponse(content: string): string {
	if (content.includes("```json")) {
		return content.replace(/```json\s*/g, "").replace(/```\s*/g, "");
	}
	if (content.includes("```")) {
		return content.replace(/```\s*/g, "");
	}
	return content;
}

async function callGeminiJson(
	prompt: string,
	context: AiCallContext,
): Promise<string> {
	const apiKey = serverEnv().GEMINI_API_KEY;
	if (!apiKey) {
		throw new Error("Missing GEMINI_API_KEY");
	}

	const result = await withCostGuard({
		orgId: context.orgId,
		userId: context.userId,
		videoId: context.videoId,
		operation: "translate",
		model: GEMINI_TRANSLATE_MODEL,
		fn: async () => {
			const { data } = await withGeminiRetry(async () => {
				const res = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TRANSLATE_MODEL}:generateContent?key=${apiKey}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							contents: [{ parts: [{ text: prompt }] }],
							generationConfig: {
								temperature: 0.2,
								maxOutputTokens: 65536,
								responseMimeType: "application/json",
								thinkingConfig: { thinkingBudget: 0 },
							},
						}),
					},
				);

				const data = (await res.json()) as {
					candidates?: Array<{
						content: { parts: Array<{ text?: string }> };
						finishReason?: string;
					}>;
					usageMetadata?: {
						promptTokenCount?: number;
						candidatesTokenCount?: number;
					};
					promptFeedback?: { blockReason?: string };
					error?: { message: string };
				};

				if (!res.ok) {
					throw new Error(
						`Gemini generateContent failed (HTTP ${res.status}): ${data.error?.message ?? "unknown"}`,
					);
				}

				return { data };
			});

			const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
			if (data.candidates?.[0]?.finishReason === "MAX_TOKENS") {
				console.error(
					"[translate-ai] response TRUNCATED (MAX_TOKENS) - raise maxOutputTokens",
				);
			}
			const content = rawText ?? "{}";
			const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
			const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

			return { content, inputTokens, outputTokens };
		},
	});

	return result.content;
}

/**
 * Compact AiSummary shape used for the single "everything except the heavy
 * refinedTranscript paragraphs" translation call. Chapter titles are
 * included here (cheap); paragraphs are translated separately in batches.
 */
const CompactAiSummarySchema = z.object({
	overview: z.string().default(""),
	topics: z
		.array(z.object({ title: z.string(), body: z.string() }))
		.default([]),
	nextSteps: z.array(z.string()).default([]),
	tasks: z
		.array(
			z.object({
				title: z.string(),
				assignee: z.string().default(""),
				priority: z.enum(["high", "medium", "low"]).default("medium"),
				deadline: z.string().default(""),
				done: z.boolean().default(false),
			}),
		)
		.default([]),
	chapters: z
		.array(
			z.object({
				startSec: z.number(),
				title: z.string(),
				body: z.string(),
			}),
		)
		.default([]),
	refinedTranscriptChapterTitles: z.array(z.string()).default([]),
});

const CUE_BATCH_SIZE = 80;
const PARAGRAPH_BATCH_SIZE = 50;

/**
 * Translate a flat list of strings into the target language via Gemini,
 * chunked into batches of at most `batchSize` items per call so a single
 * call never risks MAX_TOKENS truncation. Each batch sends a numbered list
 * and expects exactly that many lines back, in order. Throws on count
 * mismatch (per batch). Returns the full in-order list across all batches.
 */
async function translateStringList(
	items: string[],
	language: ShareLanguage,
	context: AiCallContext,
	batchSize: number,
): Promise<string[]> {
	if (items.length === 0) return [];

	const languageInstruction = getTranslationLanguageInstruction(language);
	const results: string[] = [];

	for (let offset = 0; offset < items.length; offset += batchSize) {
		const batch = items.slice(offset, offset + batchSize);
		const numbered = batch.map((text, i) => `${i + 1}. ${text}`).join("\n");

		const prompt = `You are translating text lines extracted from a video. ${languageInstruction}

Below is a numbered list of ${batch.length} lines, in order. Translate EACH line into the target language and return a JSON object with this exact shape:
{"lines": ["translated line 1", "translated line 2", ...]}

The "lines" array MUST contain exactly ${batch.length} entries, in the SAME order as the input. Do not merge, split, skip, or reorder lines.

Lines:
${numbered}`;

		const content = await callGeminiJson(prompt, context);
		const parsed = JSON.parse(cleanJsonResponse(content).trim()) as {
			lines?: unknown;
		};

		if (!Array.isArray(parsed.lines)) {
			throw new Error(
				"[translate-ai] batch translation response missing 'lines' array",
			);
		}
		if (parsed.lines.length !== batch.length) {
			throw new Error(
				`[translate-ai] batch translation count mismatch: expected ${batch.length}, got ${parsed.lines.length}`,
			);
		}
		results.push(
			...parsed.lines.map((l) => (typeof l === "string" ? l : String(l))),
		);
	}

	return results;
}

/**
 * Translate the AiSummary JSON shape into the target language. To avoid a
 * single Gemini call truncating on long (2h+) videos, this is split into:
 * 1) one call for the compact fields (overview/topics/nextSteps/tasks/
 *    chapters + refinedTranscript chapter titles), and
 * 2) batched calls translating refinedTranscript.chapters[].paragraphs[]
 *    (flattened across all chapters, ~PARAGRAPH_BATCH_SIZE per call).
 * Numeric startSec values are always copied from the ORIGINAL summary, never
 * trusted from model output. Validates the reassembled result against
 * AiSummarySchema. Throws on parse/validation/count failure.
 */
async function translateAiSummary(
	summary: AiSummary,
	language: ShareLanguage,
	context: AiCallContext,
): Promise<AiSummary> {
	const languageInstruction = getTranslationLanguageInstruction(language);

	const compactInput = {
		overview: summary.overview,
		topics: summary.topics,
		nextSteps: summary.nextSteps,
		tasks: summary.tasks,
		chapters: summary.chapters,
		refinedTranscriptChapterTitles: summary.refinedTranscript.chapters.map(
			(c) => c.title,
		),
	};

	const compactPrompt = `You are translating a structured video analysis JSON object. ${languageInstruction}

Rules:
- Do NOT change any numeric values (startSec, etc.) — copy them exactly as given.
- Do NOT change tasks[].assignee, tasks[].priority, tasks[].deadline, or tasks[].done — copy them exactly as given. Only translate tasks[].title.
- Translate: overview, every topics[].title and topics[].body, every nextSteps[] entry, every tasks[].title, every chapters[].title and chapters[].body, and every refinedTranscriptChapterTitles[] entry.
- Keep the exact same JSON structure and property names as the input.
- Return ONLY valid JSON, no markdown code fences, no explanations.

Input JSON:
${JSON.stringify(compactInput)}`;

	const compactContent = await callGeminiJson(compactPrompt, context);
	const compactParsed = JSON.parse(cleanJsonResponse(compactContent).trim());
	const compactResult = CompactAiSummarySchema.safeParse(compactParsed);
	if (!compactResult.success) {
		throw new Error(
			`[translate-ai] translated AiSummary (compact) failed validation: ${compactResult.error.message}`,
		);
	}
	const compact = compactResult.data;

	if (
		compact.refinedTranscriptChapterTitles.length !==
		summary.refinedTranscript.chapters.length
	) {
		throw new Error(
			`[translate-ai] refinedTranscript chapter title count mismatch: expected ${summary.refinedTranscript.chapters.length}, got ${compact.refinedTranscriptChapterTitles.length}`,
		);
	}

	// Flatten all paragraphs across all chapters into one ordered list,
	// translate in batches, then re-distribute back into chapter shape.
	const paragraphCounts = summary.refinedTranscript.chapters.map(
		(c) => c.paragraphs.length,
	);
	const flatParagraphs = summary.refinedTranscript.chapters.flatMap(
		(c) => c.paragraphs,
	);
	const translatedFlatParagraphs = await translateStringList(
		flatParagraphs,
		language,
		context,
		PARAGRAPH_BATCH_SIZE,
	);

	let cursor = 0;
	const translatedChapters = summary.refinedTranscript.chapters.map(
		(originalChapter, i) => {
			const count = paragraphCounts[i] ?? 0;
			const paragraphs = translatedFlatParagraphs.slice(
				cursor,
				cursor + count,
			);
			cursor += count;
			return {
				startSec: originalChapter.startSec,
				title: compact.refinedTranscriptChapterTitles[i] ?? originalChapter.title,
				paragraphs,
			};
		},
	);

	// Guard against SILENT LOSS: the model must return exactly as many items as
	// it was given. zod's `.default([])` on CompactAiSummarySchema would otherwise
	// accept a truncated/omitted array (e.g. the model drops some tasks or
	// chapters) and we'd cache a translation that silently lost content the base
	// summary still has. Fail loudly → ERROR status instead of caching a lossy one.
	if (
		compact.topics.length !== summary.topics.length ||
		compact.nextSteps.length !== summary.nextSteps.length ||
		compact.tasks.length !== summary.tasks.length ||
		compact.chapters.length !== summary.chapters.length ||
		compact.refinedTranscriptChapterTitles.length !==
			summary.refinedTranscript.chapters.length
	) {
		throw new Error(
			`[translate-ai] compact translation count mismatch — refusing to cache lossy translation ` +
				`(topics ${compact.topics.length}/${summary.topics.length}, ` +
				`nextSteps ${compact.nextSteps.length}/${summary.nextSteps.length}, ` +
				`tasks ${compact.tasks.length}/${summary.tasks.length}, ` +
				`chapters ${compact.chapters.length}/${summary.chapters.length}, ` +
				`refinedTitles ${compact.refinedTranscriptChapterTitles.length}/${summary.refinedTranscript.chapters.length})`,
		);
	}

	const reassembled = {
		overview: compact.overview,
		topics: compact.topics,
		nextSteps: compact.nextSteps,
		tasks: compact.tasks,
		chapters: compact.chapters.map((chapter, i) => ({
			...chapter,
			startSec: summary.chapters[i]?.startSec ?? chapter.startSec,
		})),
		refinedTranscript: { chapters: translatedChapters },
	};

	const result = AiSummarySchema.safeParse(reassembled);
	if (!result.success) {
		throw new Error(
			`[translate-ai] reassembled translated AiSummary failed validation: ${result.error.message}`,
		);
	}
	return result.data;
}

export interface VttCue {
	start: string;
	end: string;
	text: string;
}

/**
 * Parse a WebVTT string into cues (timestamp pair + text). Pure helper,
 * unit-testable. Assumes standard "HH:MM:SS.mmm --> HH:MM:SS.mmm" cue blocks
 * separated by blank lines (the shape written by transcribe.ts / toStandardWebVtt).
 */
export function parseVttCues(vtt: string): VttCue[] {
	const lines = vtt.split(/\r?\n/);
	const cues: VttCue[] = [];

	let start: string | null = null;
	let end: string | null = null;
	let textLines: string[] = [];

	const flush = () => {
		if (start !== null && end !== null) {
			const text = textLines.join(" ").trim();
			if (text) cues.push({ start, end, text });
		}
		start = null;
		end = null;
		textLines = [];
	};

	for (const rawLine of lines) {
		const line = rawLine.trim();

		if (!line) {
			flush();
			continue;
		}

		if (/^WEBVTT/i.test(line)) continue;

		const rangeMatch = line.match(
			/^(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/,
		);
		if (rangeMatch) {
			flush();
			start = rangeMatch[1] ?? null;
			end = rangeMatch[2] ?? null;
			continue;
		}

		// Skip bare cue-index numbers.
		if (/^\d+$/.test(line) && start === null) continue;

		if (start !== null) {
			textLines.push(line);
		}
	}

	flush();
	return cues;
}

/**
 * Re-emit a valid WebVTT document from parsed cues, substituting each cue's
 * text with the corresponding entry in translatedTexts (same order, same
 * count). Timestamps are preserved exactly. Throws if the counts mismatch.
 */
export function buildVttFromCues(
	cues: VttCue[],
	translatedTexts: string[],
): string {
	if (cues.length !== translatedTexts.length) {
		throw new Error(
			`[translate-ai] cue count mismatch: ${cues.length} cues vs ${translatedTexts.length} translated texts`,
		);
	}

	let out = "WEBVTT\n\n";
	for (let i = 0; i < cues.length; i++) {
		const cue = cues[i];
		const text = translatedTexts[i];
		if (!cue) continue;
		out += `${cue.start} --> ${cue.end}\n${(text ?? "").trim()}\n\n`;
	}
	return out;
}

/**
 * Translate cue texts (only) into the target language. Batched into calls of
 * at most CUE_BATCH_SIZE cues each so a single Gemini call never risks
 * MAX_TOKENS truncation on long (2h+) videos with hundreds/thousands of
 * cues. Throws on count mismatch.
 */
async function translateVttCueTexts(
	cues: VttCue[],
	language: ShareLanguage,
	context: AiCallContext,
): Promise<string[]> {
	return translateStringList(
		cues.map((c) => c.text),
		language,
		context,
		CUE_BATCH_SIZE,
	);
}

async function getCurrentVideoRow(videoId: string) {
	const [row] = await db()
		.select()
		.from(videos)
		.where(eq(videos.id, videoId as Video.VideoId));
	return row ?? null;
}

async function patchMetadata(
	videoId: string,
	patch: (current: VideoMetadata) => VideoMetadata,
): Promise<void> {
	const row = await getCurrentVideoRow(videoId);
	const current = (row?.metadata as VideoMetadata) || {};
	await db()
		.update(videos)
		.set({ metadata: patch(current) })
		.where(eq(videos.id, videoId as Video.VideoId));
}

export async function translateAiContent({
	videoId,
	userId,
	language,
}: TranslateAiContentPayload): Promise<void> {
	const video = await getCurrentVideoRow(videoId);
	if (!video) {
		throw new Error(`[translate-ai] video not found: ${videoId}`);
	}

	const metadata = (video.metadata as VideoMetadata) || {};
	const baseSummary = metadata.aiSummary;
	if (!baseSummary) {
		throw new Error(
			`[translate-ai] cannot translate: video ${videoId} has no base aiSummary`,
		);
	}

	await patchMetadata(videoId, (current) => ({
		...current,
		aiTranslationStatus: {
			...current.aiTranslationStatus,
			[language]: "PROCESSING",
		},
	}));

	const context: AiCallContext = { orgId: video.orgId, userId, videoId };

	try {
		const translatedSummary = await translateAiSummary(
			baseSummary,
			language,
			context,
		);

		const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);
		const vtt = await bucket
			.getObject(`${video.ownerId}/${videoId}/transcription.vtt`)
			.pipe(runPromise);

		if (Option.isSome(vtt)) {
			const cues = parseVttCues(vtt.value);
			if (cues.length > 0) {
				const translatedTexts = await translateVttCueTexts(
					cues,
					language,
					context,
				);
				const translatedVtt = buildVttFromCues(cues, translatedTexts);

				await bucket
					.putObject(
						`${video.ownerId}/${videoId}/transcription.${language}.vtt`,
						translatedVtt,
						{ contentType: "text/vtt" },
					)
					.pipe(runPromise);
			}
		}

		await patchMetadata(videoId, (current) => ({
			...current,
			aiSummaryByLanguage: {
				...current.aiSummaryByLanguage,
				[language]: translatedSummary,
			},
			aiTranslationStatus: {
				...current.aiTranslationStatus,
				[language]: "COMPLETE",
			},
		}));
	} catch (error) {
		console.error(
			`[translate-ai] translation failed for video ${videoId} language ${language}:`,
			error,
		);
		await patchMetadata(videoId, (current) => ({
			...current,
			aiTranslationStatus: {
				...current.aiTranslationStatus,
				[language]: "ERROR",
			},
		}));
		throw error;
	}
}
