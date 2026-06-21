import { db } from "@cap/database";
import { organizations, videos } from "@cap/database/schema";
import type { AiSummary, VideoMetadata } from "@cap/database/types";
import { serverEnv } from "@cap/env";
import { Storage } from "@cap/web-backend";
import {
	AI_GENERATION_LANGUAGE_AUTO,
	type AiGenerationLanguage,
	getAiGenerationLanguageName,
	parseAiGenerationLanguage,
	type Video,
} from "@cap/web-domain";
import { and, eq } from "drizzle-orm";
import { Effect, Option } from "effect";
import { FatalError } from "workflow";
import { z } from "zod";
import { BudgetExceededError, withCostGuard } from "@/lib/ai-cost-guard";
import { withGeminiRetry } from "@/lib/gemini-retry";
import { runPromise } from "@/lib/server";
import { decodeStorageVideo } from "@/lib/video-storage";

interface GenerateAiWorkflowPayload {
	videoId: string;
	userId: string;
}

interface VideoData {
	video: typeof videos.$inferSelect;
	metadata: VideoMetadata;
	aiGenerationLanguage: AiGenerationLanguage;
}

interface VttSegment {
	start: number;
	text: string;
}

interface TranscriptData {
	segments: VttSegment[];
	text: string;
}

interface AiCallContext {
	orgId: string;
	userId: string;
	videoId: string;
}

interface AiResult {
	title?: string;
	summary?: string;
	chapters?: { title: string; start: number }[];
	aiSummary?: AiSummary | null;
	_usage?: { model: string; inputTokens: number; outputTokens: number };
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

function parseAiSummary(raw: unknown): AiSummary | null {
	const result = AiSummarySchema.safeParse(raw);
	if (!result.success) return null;
	return result.data;
}

const MAX_CHARS_PER_CHUNK = 24000;
const AI_SUMMARY_FAILURE_PLACEHOLDER =
	"The AI was unable to generate a proper summary for this content.";
const GENERATED_TITLE_PATTERN =
	/^(Cap (Recording|Upload) - .+|Untitled|\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}|.+ \((Display|Window|Area|Camera)\) \d{4}-\d{2}-\d{2} \d{2}:\d{2} [AP]M)$/;

export function shouldReplaceVideoTitle({
	currentTitle,
	previousAiTitle,
	nextAiTitle,
	sourceName,
	titleManuallyEdited,
}: {
	currentTitle: string | null;
	previousAiTitle?: string | null;
	nextAiTitle?: string | null;
	sourceName?: string | null;
	titleManuallyEdited?: boolean | null;
}) {
	const nextTitle = nextAiTitle?.trim();
	if (!nextTitle) return false;
	if (titleManuallyEdited) return false;

	const title = currentTitle?.trim();
	if (!title) return true;
	if (previousAiTitle?.trim() && title === previousAiTitle.trim()) return true;
	if (sourceName?.trim() && title === sourceName.trim()) return true;
	return GENERATED_TITLE_PATTERN.test(title);
}

export async function generateAiWorkflow(payload: GenerateAiWorkflowPayload) {
	"use workflow";

	const { videoId, userId } = payload;

	const videoData = await validateAndSetProcessing(videoId);

	const transcript = await fetchTranscript(videoId, userId, videoData.video);

	if (!transcript) {
		await markSkipped(videoId, videoData.metadata);
		return {
			success: true,
			message: "Transcript empty or too short - skipped",
		};
	}

	let result: AiResult;
	try {
		result = await generateWithAi(
			transcript,
			videoData.aiGenerationLanguage,
			{ orgId: videoData.video.orgId, userId, videoId },
		);
	} catch (error) {
		if (error instanceof BudgetExceededError) {
			await markBudgetExceeded(videoId, videoData.metadata);
			return {
				success: false,
				message: "AI budget exceeded",
			};
		}
		throw error;
	}

	await saveResults(videoId, videoData, result);

	return { success: true, message: "AI generation completed successfully" };
}

async function validateAndSetProcessing(videoId: string): Promise<VideoData> {
	"use step";

	if (!serverEnv().GEMINI_API_KEY) {
		throw new FatalError("Missing GEMINI_API_KEY");
	}

	const query = await db()
		.select({ video: videos, orgSettings: organizations.settings })
		.from(videos)
		.leftJoin(organizations, eq(videos.orgId, organizations.id))
		.where(eq(videos.id, videoId as Video.VideoId));

	if (query.length === 0 || !query[0]?.video) {
		throw new FatalError("Video does not exist");
	}

	const { video } = query[0];
	const metadata = (video.metadata as VideoMetadata) || {};

	if (video.transcriptionStatus !== "COMPLETE") {
		throw new FatalError("Transcription not complete");
	}

	if (metadata.summary && metadata.chapters) {
		throw new FatalError("AI metadata already generated");
	}

	await db()
		.update(videos)
		.set({
			metadata: {
				...metadata,
				aiGenerationStatus: "PROCESSING",
				aiProcessingStartedAt: new Date().toISOString(),
			} as VideoMetadata,
		})
		.where(eq(videos.id, videoId as Video.VideoId));

	return {
		video,
		metadata,
		aiGenerationLanguage: parseAiGenerationLanguage(
			query[0]?.orgSettings?.aiGenerationLanguage,
		),
	};
}

async function fetchTranscript(
	videoId: string,
	userId: string,
	video: typeof videos.$inferSelect,
): Promise<TranscriptData | null> {
	"use step";

	const vtt = await Effect.gen(function* () {
		const [bucket] = yield* Storage.getAccessForVideo(
			decodeStorageVideo(video),
		);
		return yield* bucket.getObject(`${userId}/${videoId}/transcription.vtt`);
	}).pipe(runPromise);

	if (Option.isNone(vtt)) {
		return null;
	}

	const segments = parseVttWithTimestamps(vtt.value);
	const text = segments
		.map((s) => s.text)
		.join(" ")
		.trim();

	if (text.length < 10) {
		return null;
	}

	return { segments, text };
}

async function markSkipped(
	videoId: string,
	metadata: VideoMetadata,
): Promise<void> {
	"use step";

	const currentMetadata = await getCurrentVideoMetadata(videoId, metadata);

	await db()
		.update(videos)
		.set({
			metadata: {
				...currentMetadata,
				aiGenerationStatus: "SKIPPED",
			},
		})
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function markBudgetExceeded(
	videoId: string,
	metadata: VideoMetadata,
): Promise<void> {
	"use step";

	const currentMetadata = await getCurrentVideoMetadata(videoId, metadata);

	await db()
		.update(videos)
		.set({
			metadata: {
				...currentMetadata,
				aiGenerationStatus: "ERROR",
				aiGenerationError: "AI budget exceeded",
			} as VideoMetadata,
		})
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function generateWithAi(
	transcript: TranscriptData,
	language: AiGenerationLanguage,
	context: AiCallContext,
): Promise<AiResult> {
	"use step";

	const chunks = chunkTranscriptWithTimestamps(transcript.segments);

	const videoDuration = getVideoDuration(transcript.segments);
	const languageInstruction = getAiLanguageInstruction(language);

	let result: AiResult;
	if (chunks.length === 1) {
		result = await generateSingleChunk(
			transcript.segments,
			videoDuration,
			languageInstruction,
			context,
		);
	} else {
		result = await generateMultipleChunks(
			chunks,
			videoDuration,
			languageInstruction,
			context,
		);
	}

	if (result.chapters) {
		result.chapters = clampChapters(result.chapters, videoDuration);
	}

	return result;
}

export function getAiLanguageInstruction(
	language: AiGenerationLanguage,
): string {
	if (language === AI_GENERATION_LANGUAGE_AUTO) {
		return "Write the title, summary, chapter titles, section summaries, and key points in the same language as the transcript.";
	}

	return `Write the title, summary, chapter titles, section summaries, and key points in ${getAiGenerationLanguageName(language)}.`;
}

function getVideoDuration(segments: VttSegment[]): number {
	if (segments.length === 0) return 0;
	const lastSegment = segments[segments.length - 1];
	return lastSegment ? lastSegment.start + 3 : 0;
}

function clampChapters(
	chapters: { title: string; start: number }[],
	videoDuration: number,
): { title: string; start: number }[] {
	const filtered = chapters.filter((ch) => ch.start < videoDuration);

	if (filtered.length === 0 && chapters.length > 0) {
		const first = chapters[0];
		return first ? [{ title: first.title, start: 0 }] : [];
	}

	const minGap = Math.max(5, Math.floor(videoDuration / 10));
	const deduped: { title: string; start: number }[] = [];
	for (const chapter of filtered) {
		const last = deduped[deduped.length - 1];
		if (!last || Math.abs(chapter.start - last.start) >= minGap) {
			deduped.push(chapter);
		}
	}

	return deduped;
}

async function saveResults(
	videoId: string,
	videoData: VideoData,
	result: AiResult,
): Promise<void> {
	"use step";

	const { video, metadata } = videoData;
	const generatedTitle = result.title?.trim();
	const currentVideo = await getCurrentVideo(videoId);
	const currentMetadata = currentVideo
		? (currentVideo.metadata as VideoMetadata) || {}
		: metadata;
	const currentTitle = currentVideo?.name ?? video.name;

	// Judge usability from THIS run's result only (not merged with old
	// metadata) — otherwise an empty "{}" retry could overwrite `summary` with
	// the failure placeholder yet still be marked COMPLETE because stale
	// content existed.
	const resultSummaryText = result.summary?.trim() ?? "";
	const resultHasContent =
		(resultSummaryText.length > 0 &&
			resultSummaryText !== AI_SUMMARY_FAILURE_PLACEHOLDER) ||
		Boolean(result.aiSummary);

	const updatedMetadata: VideoMetadata = resultHasContent
		? {
				...currentMetadata,
				aiTitle: generatedTitle || currentMetadata.aiTitle,
				summary: result.summary || currentMetadata.summary,
				chapters: result.chapters || currentMetadata.chapters,
				aiSummary: result.aiSummary ?? currentMetadata.aiSummary,
				aiGenerationStatus: "COMPLETE",
			}
		: {
				// This run produced nothing usable: preserve any existing
				// content (don't clobber it with the failure placeholder) and
				// surface a retryable ERROR only when there's nothing to show.
				...currentMetadata,
				aiGenerationStatus:
					currentMetadata.summary || currentMetadata.aiSummary
						? "COMPLETE"
						: "ERROR",
			};

	await db()
		.update(videos)
		.set({ metadata: updatedMetadata })
		.where(eq(videos.id, videoId as Video.VideoId));

	if (
		generatedTitle &&
		shouldReplaceVideoTitle({
			currentTitle,
			previousAiTitle: currentMetadata.aiTitle,
			nextAiTitle: generatedTitle,
			sourceName: currentMetadata.sourceName,
			titleManuallyEdited: currentMetadata.titleManuallyEdited,
		})
	) {
		await db()
			.update(videos)
			.set({ name: generatedTitle })
			.where(
				and(
					eq(videos.id, videoId as Video.VideoId),
					eq(videos.name, currentTitle),
				),
			);
	}
}

async function getCurrentVideo(
	videoId: string,
): Promise<typeof videos.$inferSelect | null> {
	const [currentVideo] = await db()
		.select()
		.from(videos)
		.where(eq(videos.id, videoId as Video.VideoId));

	return currentVideo ?? null;
}

async function getCurrentVideoMetadata(
	videoId: string,
	fallback: VideoMetadata,
): Promise<VideoMetadata> {
	const currentVideo = await getCurrentVideo(videoId);
	return currentVideo
		? (currentVideo.metadata as VideoMetadata) || {}
		: fallback;
}

function parseVttWithTimestamps(vttContent: string): VttSegment[] {
	const lines = vttContent.split("\n");
	const segments: VttSegment[] = [];
	let currentStart = 0;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]?.trim() ?? "";
		if (line.includes("-->")) {
			const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})[.,](\d{3})/);
			if (timeMatch) {
				currentStart =
					parseInt(timeMatch[1] ?? "0", 10) * 3600 +
					parseInt(timeMatch[2] ?? "0", 10) * 60 +
					parseInt(timeMatch[3] ?? "0", 10);
			}
		} else if (
			line &&
			line !== "WEBVTT" &&
			!/^\d+$/.test(line) &&
			!line.includes("-->")
		) {
			segments.push({ start: currentStart, text: line });
		}
	}

	return segments;
}

function chunkTranscriptWithTimestamps(
	segments: VttSegment[],
): { text: string; startTime: number; endTime: number }[] {
	const chunks: { text: string; startTime: number; endTime: number }[] = [];
	let currentChunk: VttSegment[] = [];
	let currentLength = 0;

	for (const segment of segments) {
		if (
			currentLength + segment.text.length > MAX_CHARS_PER_CHUNK &&
			currentChunk.length > 0
		) {
			chunks.push({
				text: currentChunk.map((s) => s.text).join(" "),
				startTime: currentChunk[0]?.start ?? 0,
				endTime: currentChunk[currentChunk.length - 1]?.start ?? 0,
			});
			currentChunk = [];
			currentLength = 0;
		}
		currentChunk.push(segment);
		currentLength += segment.text.length + 1;
	}

	if (currentChunk.length > 0) {
		chunks.push({
			text: currentChunk.map((s) => s.text).join(" "),
			startTime: currentChunk[0]?.start ?? 0,
			endTime: currentChunk[currentChunk.length - 1]?.start ?? 0,
		});
	}

	return chunks;
}

const GEMINI_SUMMARY_MODEL = "gemini-2.5-flash";

interface AiApiResult {
	content: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
}

async function callAiApi(
	prompt: string,
	options: { json?: boolean },
	context: AiCallContext,
): Promise<AiApiResult> {
	const { json = true } = options;
	const apiKey = serverEnv().GEMINI_API_KEY;
	if (!apiKey) {
		console.warn("[generate-ai] GEMINI_API_KEY not set, skipping AI call");
		return { content: "{}", model: "unknown", inputTokens: 0, outputTokens: 0 };
	}

	const result = await withCostGuard({
		orgId: context.orgId,
		userId: context.userId,
		videoId: context.videoId,
		operation: "summary",
		model: GEMINI_SUMMARY_MODEL,
		fn: async () => {
			const { data } = await withGeminiRetry(async () => {
				const res = await fetch(
					`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_SUMMARY_MODEL}:generateContent?key=${apiKey}`,
					{
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							contents: [{ parts: [{ text: prompt }] }],
							generationConfig: {
								temperature: 0.2,
								maxOutputTokens: 8192,
								...(json ? { responseMimeType: "application/json" } : {}),
								thinkingConfig: { thinkingBudget: 0 },
							},
						}),
					},
				);

				const data = (await res.json()) as {
					candidates?: Array<{
						content: { parts: Array<{ text?: string }> };
					}>;
					usageMetadata?: {
						promptTokenCount?: number;
						candidatesTokenCount?: number;
					};
					error?: { message: string };
				};

				if (!res.ok) {
					throw new Error(
						`Gemini generateContent failed (HTTP ${res.status}): ${data.error?.message ?? "unknown"}`,
					);
				}

				return { data };
			});

			const content =
				data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
			const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
			const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

			return { content, inputTokens, outputTokens };
		},
	});

	return { ...result, model: GEMINI_SUMMARY_MODEL };
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

async function generateSingleChunk(
	segments: VttSegment[],
	videoDuration: number,
	languageInstruction: string,
	context: AiCallContext,
): Promise<AiResult> {
	const transcriptWithTimestamps = segments
		.map(
			(s) =>
				`[${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, "0")}] ${s.text}`,
		)
		.join("\n");

	const schemaExample = `{
  "title": "Weekly Team Sync",
  "summary": "The team discussed Q3 roadmap priorities and resolved the deployment blocker.",
  "chapters": [{"title": "Intro", "start": 0}],
  "aiSummary": {
    "overview": "A weekly sync covering roadmap and blockers.",
    "topics": [{"title": "Q3 Roadmap", "body": "The team aligned on three key priorities."}],
    "nextSteps": ["Share updated roadmap doc by Friday"],
    "tasks": [{"title": "Update roadmap", "assignee": "Alice", "priority": "high", "deadline": "2024-07-05", "done": false}],
    "chapters": [{"startSec": 0, "title": "Intro", "body": "Brief intro and agenda."}, {"startSec": 45, "title": "Q3 Roadmap", "body": "Discussion of top priorities."}],
    "refinedTranscript": {
      "chapters": [{"startSec": 0, "title": "Intro", "paragraphs": ["Welcome everyone.", "Today we cover roadmap and blockers."]}]
    }
  }
}`;

	const prompt = `You are analyzing a meeting/video transcript. The content may be in Uzbek, Russian, or English. Respond in the same language as the content.

The video is ${videoDuration} seconds long. ${languageInstruction}

Extract structured data in JSON format. Return ONLY valid JSON with this exact structure:
${schemaExample}

Rules:
- All chapter "start" / "startSec" values must be between 0 and ${videoDuration} seconds; derive them from the transcript timestamps
- tasks[].priority must be "high", "medium", or "low"
- tasks[].done is always false unless explicitly resolved in the transcript
- refinedTranscript is the COMPLETE, FULL transcript with ONLY filler words ("uh", "um", "a-a", "er"), exact word-for-word repetitions, false starts, and off-topic jokes removed. It is NOT a summary — every substantive sentence must appear. Keep the original speaker wording and language (uz/ru/en mixed is fine — do NOT translate or paraphrase). The output must cover the ENTIRE transcript from start to finish without compressing or dropping any content.
- Keep ALL JSON property names exactly as shown

Transcript:
${transcriptWithTimestamps}`;

	const apiResult = await callAiApi(prompt, {}, context);
	const parsed = parseAiResponse(apiResult.content);
	return {
		...parsed,
		_usage: {
			model: apiResult.model,
			inputTokens: apiResult.inputTokens,
			outputTokens: apiResult.outputTokens,
		},
	};
}

async function generateMultipleChunks(
	chunks: { text: string; startTime: number; endTime: number }[],
	videoDuration: number,
	languageInstruction: string,
	context: AiCallContext,
): Promise<AiResult> {
	const chunkSummaries: {
		summary: string;
		keyPoints: string[];
		chapters: { title: string; start: number }[];
		startTime: number;
		endTime: number;
		rawText: string;
	}[] = [];

	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let usedModel = "unknown";

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		if (!chunk) continue;

		const chunkPrompt = `You are Cap AI, an expert at analyzing video content. This is section ${i + 1} of ${chunks.length} from a video that is ${videoDuration} seconds long (${Math.floor(videoDuration / 60)}:${String(Math.floor(videoDuration % 60)).padStart(2, "0")} total). This section covers timestamp ${Math.floor(chunk.startTime / 60)}:${String(chunk.startTime % 60).padStart(2, "0")} to ${Math.floor(chunk.endTime / 60)}:${String(chunk.endTime % 60).padStart(2, "0")}.

Analyze this section thoroughly and provide JSON:
{
  "summary": "string (detailed summary of this section - capture ALL key points, topics discussed, decisions made, or concepts explained. Include specific details like names, numbers, action items, and conclusions. This should be 3-6 sentences minimum.)",
  "keyPoints": ["string (specific key point or takeaway)", ...],
  "chapters": [{"title": "string (descriptive title for this topic/section)", "start": number (seconds from video start)}]
}

${languageInstruction}
Keep JSON property names exactly as shown.
IMPORTANT: All chapter "start" values MUST be between ${chunk.startTime} and ${chunk.endTime} seconds. The total video is only ${videoDuration} seconds long.
Be thorough - this summary will be combined with other sections to create a comprehensive overview.
Return ONLY valid JSON without any markdown formatting or code blocks.
Transcript section:
${chunk.text}`;

		const chunkResult = await callAiApi(chunkPrompt, {}, context);
		totalInputTokens += chunkResult.inputTokens;
		totalOutputTokens += chunkResult.outputTokens;
		usedModel = chunkResult.model;
		try {
			const parsed = JSON.parse(cleanJsonResponse(chunkResult.content).trim());
			chunkSummaries.push({
				summary: parsed.summary || "",
				keyPoints: parsed.keyPoints || [],
				chapters: parsed.chapters || [],
				startTime: chunk.startTime,
				endTime: chunk.endTime,
				rawText: chunk.text,
			});
		} catch {}
	}

	// Per-chunk refined cleaning: clean raw transcript text, do NOT summarize.
	// Iterates the ORIGINAL chunks array so every chunk is cleaned regardless of
	// whether its summary JSON parsed successfully.
	const refinedChapters: { startSec: number; title: string; paragraphs: string[] }[] = [];
	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		if (!chunk) continue;
		const timeLabel = `${Math.floor(chunk.startTime / 60)}:${String(chunk.startTime % 60).padStart(2, "0")}`;
		// Use chapter title from the matching summary if available, else "Part N"
		const matchedSummary = chunkSummaries.find(
			(cs) => cs.startTime === chunk.startTime,
		);
		const chapterTitle = matchedSummary?.chapters[0]?.title ?? `Part ${i + 1}`;
		const refinedPrompt = `You are a transcript editor. Your ONLY job is to produce a clean, complete, full version of the spoken text below — NOT a summary.

RULES (strict):
- Remove ONLY: filler words ("uh", "um", "a-a", "er", "well", "you know", "like" used as filler), exact word-for-word repetitions, false starts (e.g. "I was — I mean, we should"), and off-topic jokes that add zero informational content.
- Keep EVERYTHING else: all substantive sentences, explanations, arguments, questions, answers, decisions, names, numbers, details — in the original order.
- Do NOT translate. Do NOT paraphrase. Do NOT compress into a summary. The output must cover the ENTIRE input from start to finish.
- Preserve the speaker's original wording and language (Uzbek/Russian/English mixed is fine).
- Output clean readable paragraphs separated by blank lines. No bullet points, no headers.
- This is DIFFERENT from a summary: a summary is short; this must be the full cleaned text.

Return ONLY the cleaned text. No JSON. No explanations.

Transcript (${timeLabel}):
${chunk.text}`;
		const refinedResult = await callAiApi(refinedPrompt, { json: false }, context);
		totalInputTokens += refinedResult.inputTokens;
		totalOutputTokens += refinedResult.outputTokens;
		const cleanedText = refinedResult.content.trim();
		const paragraphs = cleanedText
			.split(/\n\s*\n/)
			.map((p) => p.trim())
			.filter((p) => p.length > 0);
		refinedChapters.push({
			startSec: chunk.startTime,
			title: chapterTitle,
			paragraphs: paragraphs.length > 0 ? paragraphs : [cleanedText],
		});
	}

	const allChapters: { title: string; start: number }[] = [];
	const sortedChapters = chunkSummaries
		.flatMap((c) => c.chapters)
		.sort((a, b) => a.start - b.start);
	const minGap = Math.max(5, Math.floor(videoDuration / 10));
	for (const chapter of sortedChapters) {
		const lastChapter = allChapters[allChapters.length - 1];
		if (!lastChapter || Math.abs(chapter.start - lastChapter.start) >= minGap) {
			allChapters.push(chapter);
		}
	}

	const allKeyPoints = chunkSummaries.flatMap((c) => c.keyPoints);

	const sectionDetails = chunkSummaries
		.map((c, i) => {
			const timeRange = `${Math.floor(c.startTime / 60)}:${String(c.startTime % 60).padStart(2, "0")} - ${Math.floor(c.endTime / 60)}:${String(c.endTime % 60).padStart(2, "0")}`;
			const keyPointsList =
				c.keyPoints.length > 0 ? `\nKey points: ${c.keyPoints.join("; ")}` : "";
			return `Section ${i + 1} (${timeRange}):\n${c.summary}${keyPointsList}`;
		})
		.join("\n\n");

	const aiSummaryChaptersFromChunks = chunkSummaries.flatMap((c) =>
		c.chapters.map((ch) => ({
			startSec: ch.start,
			title: ch.title,
			body: "",
		})),
	);

	const schemaExample = `{
  "title": "Weekly Team Sync",
  "summary": "The team discussed Q3 roadmap priorities and resolved the deployment blocker.",
  "aiSummary": {
    "overview": "A weekly sync covering roadmap and blockers.",
    "topics": [{"title": "Q3 Roadmap", "body": "The team aligned on three key priorities."}],
    "nextSteps": ["Share updated roadmap doc by Friday"],
    "tasks": [{"title": "Update roadmap", "assignee": "Alice", "priority": "high", "deadline": "2024-07-05", "done": false}],
    "chapters": [{"startSec": 0, "title": "Intro", "body": "Brief intro and agenda."}, {"startSec": 45, "title": "Q3 Roadmap", "body": "Discussion of top priorities."}],
    "refinedTranscript": {
      "chapters": [{"startSec": 0, "title": "Intro", "paragraphs": ["Welcome everyone.", "Today we cover roadmap and blockers."]}]
    }
  }
}`;

	const finalPrompt = `You are analyzing a meeting/video transcript. The content may be in Uzbek, Russian, or English. Respond in the same language as the content.

Based on these section analyses, produce a final JSON summary. ${languageInstruction}

Section analyses:
${sectionDetails}

${allKeyPoints.length > 0 ? `All key points identified:\n${allKeyPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")}\n` : ""}

Return ONLY valid JSON with this exact structure:
${schemaExample}

Rules:
- aiSummary.chapters[].startSec must be between 0 and ${videoDuration}; use the section timestamps provided above
- tasks[].priority must be "high", "medium", or "low"
- refinedTranscript.chapters may be left as an empty array — it is handled separately
- Keep ALL JSON property names exactly as shown`;

	const finalResult = await callAiApi(finalPrompt, {}, context);
	totalInputTokens += finalResult.inputTokens;
	totalOutputTokens += finalResult.outputTokens;
	usedModel = finalResult.model;
	try {
		const parsed = JSON.parse(cleanJsonResponse(finalResult.content).trim());
		const aiSummaryRaw = parsed.aiSummary ?? {
			overview: parsed.summary ?? "",
			topics: [],
			nextSteps: [],
			tasks: [],
			chapters: aiSummaryChaptersFromChunks,
			refinedTranscript: { chapters: [] },
		};
		// Override refinedTranscript with the per-chunk cleaned result
		if (refinedChapters.length > 0) {
			if (aiSummaryRaw && typeof aiSummaryRaw === "object") {
				(aiSummaryRaw as Record<string, unknown>).refinedTranscript = { chapters: refinedChapters };
			}
		}
		return {
			title: parsed.title,
			summary: parsed.summary,
			chapters: allChapters,
			aiSummary: parseAiSummary(aiSummaryRaw),
			_usage: {
				model: usedModel,
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
			},
		};
	} catch {
		const fallbackSummary = chunkSummaries
			.map((c, i) => `**Part ${i + 1}:** ${c.summary}`)
			.join("\n\n");
		const keyPointsSummary =
			allKeyPoints.length > 0
				? `\n\n**Key Points:**\n${allKeyPoints.map((p) => `- ${p}`).join("\n")}`
				: "";
		return {
			title: "Video Summary",
			summary: fallbackSummary + keyPointsSummary,
			chapters: allChapters,
			aiSummary: parseAiSummary({
				overview: fallbackSummary,
				topics: [],
				nextSteps: [],
				tasks: [],
				chapters: aiSummaryChaptersFromChunks,
				refinedTranscript: { chapters: refinedChapters },
			}),
			_usage: {
				model: usedModel,
				inputTokens: totalInputTokens,
				outputTokens: totalOutputTokens,
			},
		};
	}
}

function parseAiResponse(content: string): AiResult {
	try {
		const data = JSON.parse(cleanJsonResponse(content).trim());

		const chapters = Array.isArray(data.chapters)
			? data.chapters
					.filter(
						(ch: { start?: number }) =>
							typeof ch.start === "number" && ch.start >= 0,
					)
					.sort(
						(a: { start: number }, b: { start: number }) => a.start - b.start,
					)
			: [];

		return {
			title: data.title,
			summary: data.summary,
			chapters,
			aiSummary: parseAiSummary(data.aiSummary ?? null),
		};
	} catch {
		return {
			title: "Generated Title",
			summary: AI_SUMMARY_FAILURE_PLACEHOLDER,
			chapters: [],
			aiSummary: null,
		};
	}
}
