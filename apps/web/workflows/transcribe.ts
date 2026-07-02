import { promises as fs } from "node:fs";
import { db } from "@cap/database";
import { decrypt } from "@cap/database/crypto";
import {
	organizations,
	users,
	videos,
	videoUploads,
} from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { serverEnv } from "@cap/env";
import { userIsPro } from "@cap/utils";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { withCostGuard } from "@/lib/ai-cost-guard";
import { shouldStartAiAfterTranscription } from "@/lib/ai-generation-request";
import { AI_CHUNK_CONCURRENCY, mapWithConcurrency } from "@/lib/concurrency";
import {
	ENHANCED_AUDIO_CONTENT_TYPE,
	ENHANCED_AUDIO_EXTENSION,
	enhanceAudioFromUrl,
} from "@/lib/audio-enhance";
import {
	checkHasAudioTrack,
	extractAudioChunksFromUrl,
	extractAudioFromUrl,
} from "@/lib/audio-extract";
import {
	mergeChunkedWebVtt,
	transcribeWithGemini,
} from "@/lib/gemini-transcribe";
import { startAiGeneration } from "@/lib/generate-ai";
import { runPromise } from "@/lib/server";
import { isTranscriptionDisabled } from "@/lib/transcription-settings";
import { getStorageAccessForVideo } from "@/lib/video-storage";

interface TranscribeWorkflowPayload {
	videoId: string;
	userId: string;
	aiGenerationEnabled: boolean;
}

interface VideoData {
	video: typeof videos.$inferSelect;
	transcriptionDisabled: boolean;
	isOwnerPro: boolean;
	ownerEncryptedGeminiKey: string | null;
	orgId: string;
}

interface ExtractedAudioChunk {
	key: string;
	url: string;
	startSec: number;
	durationSec: number | null;
}

interface ExtractedAudio {
	chunks: ExtractedAudioChunk[];
	totalDurationSec: number | null;
}

const LONG_AUDIO_CHUNK_DURATION_SEC = 15 * 60;
const LONG_AUDIO_CHUNK_THRESHOLD_SEC = 30 * 60;

export async function transcribeVideoWorkflow(
	payload: TranscribeWorkflowPayload,
) {
	"use workflow";

	const { videoId, userId, aiGenerationEnabled } = payload;

	const videoData = await validateVideo(videoId);

	if (videoData.transcriptionDisabled) {
		await markSkipped(videoId);
		return { success: true, message: "Transcription disabled - skipped" };
	}

	let tempAudioKeys: string[] = [];

	try {
		const audio = await extractAudio(videoId, userId, videoData.video);

		if (!audio) {
			await markNoAudio(videoId);
			return {
				success: true,
				message: "Video has no audio track - skipped transcription",
			};
		}

		tempAudioKeys = audio.chunks.map((chunk) => chunk.key);

		const transcription = await transcribeAudioChunks(
			audio,
			videoData.ownerEncryptedGeminiKey,
			{ userId, orgId: videoData.orgId, videoId },
			undefined,
			async (p) => {
				await savePartialTranscription(
					videoId, videoData.video, p.transcribedChunks, p.completed, p.total,
				);
			},
		);

		await saveTranscription(videoId, userId, videoData.video, transcription);
	} catch (error) {
		await markError(videoId);
		await cleanupTempAudioKeys(tempAudioKeys, videoData.video);
		throw error;
	}

	await cleanupTempAudioKeys(tempAudioKeys, videoData.video);

	if (await shouldQueueAiGeneration(videoId, aiGenerationEnabled)) {
		await queueAiGeneration(videoId, userId);
	}

	return { success: true, message: "Transcription completed successfully" };
}

async function validateVideo(videoId: string): Promise<VideoData> {
	"use step";

	const query = await db()
		.select({
			video: videos,
			settings: videos.settings,
			orgSettings: organizations.settings,
			owner: users,
		})
		.from(videos)
		.leftJoin(organizations, eq(videos.orgId, organizations.id))
		.innerJoin(users, eq(videos.ownerId, users.id))
		.where(eq(videos.id, videoId as Video.VideoId));

	if (query.length === 0) {
		throw new FatalError("Video does not exist");
	}

	const result = query[0];
	if (!result?.video) {
		throw new FatalError("Video information is missing");
	}

	const transcriptionDisabled = isTranscriptionDisabled(
		result.video.settings,
		result.orgSettings,
	);

	const isOwnerPro = userIsPro(result.owner);

	console.log(
		`[transcribe] Owner check: stripeSubscriptionStatus=${result.owner.stripeSubscriptionStatus}, thirdPartyStripeSubscriptionId=${result.owner.thirdPartyStripeSubscriptionId}, isOwnerPro=${isOwnerPro}`,
	);

	await db()
		.update(videos)
		.set({
			transcriptionStatus: "PROCESSING",
			metadata: {
				...((result.video.metadata as VideoMetadata) || {}),
				processingStartedAt: new Date().toISOString(),
				aiProcessingStep: "transcribe",
			} as VideoMetadata,
		})
		.where(eq(videos.id, videoId as Video.VideoId));

	return {
		video: result.video,
		transcriptionDisabled,
		isOwnerPro,
		ownerEncryptedGeminiKey: result.owner.geminiApiKey ?? null,
		orgId: result.video.orgId,
	};
}

async function markSkipped(videoId: string): Promise<void> {
	"use step";

	await db()
		.update(videos)
		.set({ transcriptionStatus: "SKIPPED" })
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function markNoAudio(videoId: string): Promise<void> {
	"use step";

	await db()
		.update(videos)
		.set({ transcriptionStatus: "NO_AUDIO" })
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function markError(videoId: string): Promise<void> {
	"use step";

	await db()
		.update(videos)
		.set({ transcriptionStatus: "ERROR" })
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function extractAudio(
	videoId: string,
	userId: string,
	video: typeof videos.$inferSelect,
): Promise<ExtractedAudio | null> {
	"use step";

	const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);

	const videoUrl = await resolveVideoSourceUrl(videoId, userId, video);

	// Media server removed — single-file MP4, no server-side processing
	const probe = await checkHasAudioTrack(videoUrl);
	console.log(
		`[transcribe] Local ffmpeg audio check for ${videoId}: hasAudio=${probe.hasAudio}, durationSec=${probe.durationSec}`,
	);

	if (probe.durationSec != null) {
		await db()
			.update(videos)
			.set({ duration: probe.durationSec })
			.where(eq(videos.id, videoId as Video.VideoId));
	}

	if (!probe.hasAudio) {
		return null;
	}

	const totalDurationSec = probe.durationSec ?? video.duration ?? null;

	if (
		totalDurationSec != null &&
		totalDurationSec > LONG_AUDIO_CHUNK_THRESHOLD_SEC
	) {
		const result = await extractAudioChunksFromUrl(videoUrl, {
			chunkDurationSec: LONG_AUDIO_CHUNK_DURATION_SEC,
			totalDurationSec,
		});
		const chunks: ExtractedAudioChunk[] = [];

		try {
			for (const [index, chunk] of result.chunks.entries()) {
				const audioBuffer = await fs.readFile(chunk.filePath);
				const audioKey = `${userId}/${videoId}/audio-temp-${String(index).padStart(3, "0")}.mp3`;

				await bucket
					.putObject(audioKey, audioBuffer, {
						contentType: result.mimeType,
					})
					.pipe(runPromise);

				const audioSignedUrl = await bucket
					.getInternalSignedObjectUrl(audioKey)
					.pipe(runPromise);

				chunks.push({
					key: audioKey,
					url: audioSignedUrl,
					startSec: chunk.startSec,
					durationSec: chunk.durationSec,
				});
			}

			console.log(
				`[transcribe] Extracted ${chunks.length} audio chunks for ${videoId}`,
			);

			return { chunks, totalDurationSec };
		} catch (error) {
			for (const chunk of chunks) {
				await bucket.deleteObject(chunk.key).pipe(runPromise).catch(() => {});
			}
			throw error;
		} finally {
			await result.cleanup();
		}
	}

	const result = await extractAudioFromUrl(videoUrl);

	let audioBuffer: Buffer;
	try {
		audioBuffer = await fs.readFile(result.filePath);
	} finally {
		await result.cleanup();
	}

	console.log(
		`[transcribe] Extracted audio for ${videoId}: ${audioBuffer.length} bytes`,
	);

	const audioKey = `${userId}/${videoId}/audio-temp.mp3`;

	try {
		await bucket
			.putObject(audioKey, audioBuffer, {
				contentType: "audio/mpeg",
			})
			.pipe(runPromise);

		const audioSignedUrl = await bucket
			.getInternalSignedObjectUrl(audioKey)
			.pipe(runPromise);

		return {
			chunks: [
				{
					key: audioKey,
					url: audioSignedUrl,
					startSec: 0,
					durationSec: totalDurationSec,
				},
			],
			totalDurationSec,
		};
	} catch (error) {
		await bucket.deleteObject(audioKey).pipe(runPromise).catch(() => {});
		throw error;
	}
}

async function resolveVideoSourceUrl(
	videoId: string,
	_userId: string,
	video: typeof videos.$inferSelect,
): Promise<string> {
	const [resolvedBucket] =
		await getStorageAccessForVideo(video).pipe(runPromise);

	const upload = await db()
		.select({ rawFileKey: videoUploads.rawFileKey })
		.from(videoUploads)
		.where(eq(videoUploads.videoId, videoId as Video.VideoId))
		.limit(1);

	const candidateKeys = [
		`${video.ownerId}/${videoId}/result.mp4`,
		upload[0]?.rawFileKey,
		// `processVideoWorkflow` deletes the videoUploads row (rawFileKey), and
		// imported / in-app / extension uploads never produce result.mp4 — the
		// real file lives at raw-upload.{mp4,webm}. Fall back to those well-known
		// keys (same as /api/playlist) so transcription doesn't fail with
		// "Video file not accessible" once the upload row is gone.
		`${video.ownerId}/${videoId}/raw-upload.mp4`,
		`${video.ownerId}/${videoId}/raw-upload.webm`,
	].filter(
		(value, index, values): value is string =>
			Boolean(value) && values.indexOf(value) === index,
	);

	for (const key of candidateKeys) {
		const url = await resolvedBucket
			.getInternalSignedObjectUrl(key)
			.pipe(runPromise);
		const response = await fetch(url, {
			method: "GET",
			headers: { range: "bytes=0-0" },
		});

		if (response.ok) {
			console.log(`[transcribe] Using video source ${key}`);
			return url;
		}
	}

	throw new Error("Video file not accessible");
}

async function transcribeAudio(
	audioUrl: string,
	audioDurationSec: number | null,
	ownerEncryptedGeminiKey: string | null,
	context: { userId: string; orgId: string; videoId: string },
): Promise<string> {
	"use step";

	let apiKey: string | undefined;

	if (ownerEncryptedGeminiKey) {
		try {
			apiKey = await decrypt(ownerEncryptedGeminiKey);
		} catch {
			console.error(
				"[transcribe] Failed to decrypt user Gemini key, falling back to server key",
			);
		}
	}

	if (!apiKey) {
		apiKey = serverEnv().GEMINI_API_KEY;
	}

	if (!apiKey) {
		throw new FatalError(
			"No Gemini API key configured. Set one in Settings → Account → Transcription API Keys, or ask your admin to set GEMINI_API_KEY.",
		);
	}

	const resolvedApiKey = apiKey;

	const result = await withCostGuard({
		orgId: context.orgId,
		userId: context.userId,
		videoId: context.videoId,
		operation: "transcription",
		model: "gemini-2.5-flash",
		fn: async () => {
			const res = await transcribeWithGemini(audioUrl, {
				apiKey: resolvedApiKey,
				audioDurationSec: audioDurationSec ?? undefined,
			});
			return {
				transcriptVtt: res.transcriptVtt,
				inputTokens: res.inputTokens,
				outputTokens: res.outputTokens,
			};
		},
	});

	return result.transcriptVtt;
}

export async function transcribeAudioChunks(
	audio: ExtractedAudio,
	ownerEncryptedGeminiKey: string | null,
	context: { userId: string; orgId: string; videoId: string },
	transcribeChunk: typeof transcribeAudioChunkWithRetry = transcribeAudioChunkWithRetry,
	onProgress?: (p: { transcribedChunks: Array<{ vtt: string; offsetSec: number }>; completed: number; total: number }) => Promise<void>,
): Promise<string> {
	if (audio.chunks.length === 1) {
		const chunk = audio.chunks[0];
		if (!chunk) return "WEBVTT\n\n";
		return await transcribeAudio(
			chunk.url,
			chunk.durationSec ?? audio.totalDurationSec,
			ownerEncryptedGeminiKey,
			context,
		);
	}

	let failedChunkCount = 0;
	let completedCount = 0;
	const completedResults = new Array<{ vtt: string; offsetSec: number } | undefined>(
		audio.chunks.length,
	);

	const results = await mapWithConcurrency(
		audio.chunks,
		AI_CHUNK_CONCURRENCY,
		async (chunk, i) => {
			let result: { vtt: string; offsetSec: number };
			try {
				const vtt = await transcribeChunk({
					chunk,
					ownerEncryptedGeminiKey,
					context,
				});
				result = { vtt, offsetSec: chunk.startSec };
			} catch (error) {
				// FAULT TOLERANCE (long-video fix): a single bad chunk must NOT discard the
				// whole transcript. Previously one failed chunk threw -> the outer catch marked
				// the ENTIRE video ERROR and dropped every successful chunk (root cause of
				// long-video AI failures). Now: log, keep a gap at this offset, and continue.
				failedChunkCount++;
				console.error(
					`[transcribe] Chunk at ${chunk.startSec}s FAILED for ${context.videoId} after retries; continuing with a gap:`,
					error,
				);
				result = { vtt: "WEBVTT\n\n", offsetSec: chunk.startSec };
			}
			completedResults[i] = result;
			completedCount++;
			if (onProgress) {
				try {
					await onProgress({
						transcribedChunks: completedResults.filter(
							(r): r is { vtt: string; offsetSec: number } => r !== undefined,
						),
						completed: completedCount,
						total: audio.chunks.length,
					});
				} catch (e) {
					console.error("[transcribe] partial-save progress callback failed (non-fatal):", e);
				}
			}
			return result;
		},
	);

	const transcribedChunks: Array<{ vtt: string; offsetSec: number }> = results;

	// Only fail the whole job if EVERY chunk failed (nothing usable to save).
	if (failedChunkCount === audio.chunks.length) {
		throw new Error(
			`All ${failedChunkCount} transcription chunks failed for ${context.videoId}`,
		);
	}
	if (failedChunkCount > 0) {
		console.warn(
			`[transcribe] ${failedChunkCount}/${audio.chunks.length} chunks failed for ${context.videoId}; saved a partial transcript.`,
		);
	}

	return mergeChunkedWebVtt(transcribedChunks);
}

/**
 * How far into a chunk the cues actually reach (seconds) — measured by the
 * latest cue START, or 0 if it has no cues. We deliberately use START, not END:
 * Gemini sometimes emits a runaway END (a cue ending 60 min later), which would
 * make an END-based measure look fully-covered while the chunk really stopped
 * transcribing after 1 minute. START is immune to that and detects the
 * silent-gap bug (a 15-min chunk whose cues stop a few minutes in).
 */
export function webVttCoverageSec(vtt: string): number {
	let maxStart = 0;
	for (const line of vtt.split(/\r?\n/)) {
		const arrow = line.indexOf("-->");
		if (arrow === -1) continue;
		const m = line
			.slice(0, arrow)
			.match(/(?:(\d+):)?(\d{2}):(\d{2})[.,](\d{3})/);
		if (!m) continue;
		const start =
			(m[1] ? Number(m[1]) : 0) * 3600 +
			Number(m[2]) * 60 +
			Number(m[3]) +
			Number(m[4]) / 1000;
		if (start > maxStart) maxStart = start;
	}
	return maxStart;
}

/** A chunk whose cues cover less than this fraction of its duration is treated
 * as grossly incomplete (retry it). 0.5 tolerates normal trailing silence. */
export const MIN_CHUNK_COVERAGE = 0.5;

export async function transcribeAudioChunkWithRetry(
	{
		chunk,
		ownerEncryptedGeminiKey,
		context,
	}: {
		chunk: ExtractedAudioChunk;
		ownerEncryptedGeminiKey: string | null;
		context: { userId: string; orgId: string; videoId: string };
	},
	transcribeFn: typeof transcribeAudio = transcribeAudio,
): Promise<string> {
	const maxAttempts = 4;
	let lastError: unknown;
	// Keep the BEST (most-covering) result across attempts so a retry can only
	// improve coverage, never lose a partial we already have.
	let bestVtt: string | null = null;
	let bestCoverage = -1;
	const chunkDurationSec = chunk.durationSec ?? 0;
	const needSec =
		chunkDurationSec > 0 ? chunkDurationSec * MIN_CHUNK_COVERAGE : 0;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			const vtt = await transcribeFn(
				chunk.url,
				chunk.durationSec,
				ownerEncryptedGeminiKey,
				context,
			);
			const coverage = webVttCoverageSec(vtt);
			if (coverage > bestCoverage) {
				bestCoverage = coverage;
				bestVtt = vtt;
			}
			// Good enough coverage, or out of attempts → return the best we have.
			if (coverage >= needSec || attempt === maxAttempts) {
				if (coverage < needSec) {
					console.warn(
						`[transcribe] Chunk at ${chunk.startSec}s for ${context.videoId} under-covered after ${attempt} attempts: cues reach ${coverage.toFixed(0)}s of ${chunk.durationSec}s — keeping partial (a transcript gap will remain here).`,
					);
				}
				return bestVtt ?? vtt;
			}
			console.warn(
				`[transcribe] Chunk at ${chunk.startSec}s for ${context.videoId} transcribed only ${coverage.toFixed(0)}s of ${chunk.durationSec}s (attempt ${attempt}); retrying for fuller coverage.`,
			);
		} catch (error) {
			lastError = error;
			if (error instanceof FatalError || attempt === maxAttempts) {
				break;
			}
			console.warn(
				`[transcribe] Retrying audio chunk at ${chunk.startSec}s for ${context.videoId} after failed attempt ${attempt}`,
			);
		}
	}

	// If some attempt produced a (partial) transcript, keep it rather than
	// discarding everything — a partial is better than a fully-missing chunk.
	if (bestVtt !== null) return bestVtt;
	throw lastError;
}

async function savePartialTranscription(
	videoId: string,
	video: typeof videos.$inferSelect,
	transcribedChunks: Array<{ vtt: string; offsetSec: number }>,
	completed: number,
	total: number,
): Promise<void> {
	"use step";
	const merged = mergeChunkedWebVtt(transcribedChunks);
	const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);
	await bucket
		.putObject(`${video.ownerId}/${videoId}/transcription-partial.vtt`, merged, {
			contentType: "text/vtt",
		})
		.pipe(runPromise);
	// Re-read metadata to avoid clobbering concurrent writes.
	const [row] = await db()
		.select({ metadata: videos.metadata })
		.from(videos)
		.where(eq(videos.id, videoId as Video.VideoId))
		.limit(1);
	await db()
		.update(videos)
		.set({
			metadata: {
				...((row?.metadata as VideoMetadata) || {}),
				transcriptionChunksCompleted: completed,
				transcriptionChunksTotal: total,
			} as VideoMetadata,
		})
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function saveTranscription(
	videoId: string,
	_userId: string,
	video: typeof videos.$inferSelect,
	transcription: string,
): Promise<void> {
	"use step";

	const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);

	await bucket
		.putObject(`${video.ownerId}/${videoId}/transcription.vtt`, transcription, {
			contentType: "text/vtt",
		})
		.pipe(runPromise);

	const [row] = await db()
		.select({ metadata: videos.metadata })
		.from(videos)
		.where(eq(videos.id, videoId as Video.VideoId))
		.limit(1);
	const md = { ...((row?.metadata as VideoMetadata) || {}) } as VideoMetadata;
	delete (md as any).transcriptionChunksCompleted;
	delete (md as any).transcriptionChunksTotal;
	await db()
		.update(videos)
		.set({ transcriptionStatus: "COMPLETE", metadata: md })
		.where(eq(videos.id, videoId as Video.VideoId));
	// best-effort delete partial file (never throw)
	await bucket
		.deleteObject(`${video.ownerId}/${videoId}/transcription-partial.vtt`)
		.pipe(runPromise)
		.catch(() => {});
}

async function cleanupTempAudioKeys(
	audioKeys: string[],
	video: typeof videos.$inferSelect,
): Promise<void> {
	"use step";

	if (audioKeys.length === 0) return;

	try {
		const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);

		for (const audioKey of audioKeys) {
			try {
				await bucket.deleteObject(audioKey).pipe(runPromise);
			} catch (error) {
				console.error(
					`[transcribe] Failed to cleanup temp audio file: ${audioKey}`,
					error,
				);
			}
		}
	} catch (error) {
		console.error("[transcribe] Failed to access storage for audio cleanup", error);
	}
}

async function queueAiGeneration(
	videoId: string,
	userId: string,
): Promise<void> {
	"use step";

	await startAiGeneration(videoId as Video.VideoId, userId);
}

async function shouldQueueAiGeneration(
	videoId: string,
	aiGenerationEnabled: boolean,
): Promise<boolean> {
	"use step";

	if (aiGenerationEnabled) return true;

	const [video] = await db()
		.select({ metadata: videos.metadata })
		.from(videos)
		.where(eq(videos.id, videoId as Video.VideoId))
		.limit(1);

	return shouldStartAiAfterTranscription({
		metadata: (video?.metadata as VideoMetadata) || {},
		aiGenerationEnabled,
	});
}

async function _markEnhancedAudioProcessing(videoId: string): Promise<void> {
	"use step";

	const [video] = await db()
		.select({ metadata: videos.metadata })
		.from(videos)
		.where(eq(videos.id, videoId as Video.VideoId));

	const currentMetadata = (video?.metadata as VideoMetadata) || {};

	await db()
		.update(videos)
		.set({
			metadata: {
				...currentMetadata,
				enhancedAudioStatus: "PROCESSING",
			},
		})
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function _enhanceAndSaveAudio(
	videoId: string,
	userId: string,
	audioUrl: string,
	video: typeof videos.$inferSelect,
): Promise<void> {
	"use step";

	console.log(`[transcribe] Starting audio enhancement for video ${videoId}`);

	try {
		const enhancedBuffer = await enhanceAudioFromUrl(audioUrl);
		console.log(
			`[transcribe] Audio enhanced, saving to S3 (${enhancedBuffer.length} bytes)`,
		);

		const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);

		const enhancedAudioKey = `${userId}/${videoId}/enhanced-audio.${ENHANCED_AUDIO_EXTENSION}`;

		await bucket
			.putObject(enhancedAudioKey, enhancedBuffer, {
				contentType: ENHANCED_AUDIO_CONTENT_TYPE,
			})
			.pipe(runPromise);

		const [videoRecord] = await db()
			.select({ metadata: videos.metadata })
			.from(videos)
			.where(eq(videos.id, videoId as Video.VideoId));

		const currentMetadata = (videoRecord?.metadata as VideoMetadata) || {};

		await db()
			.update(videos)
			.set({
				metadata: {
					...currentMetadata,
					enhancedAudioStatus: "COMPLETE",
				},
			})
			.where(eq(videos.id, videoId as Video.VideoId));
	} catch (error) {
		console.error(
			`[transcribe] Audio enhancement failed for video ${videoId}:`,
			error,
		);

		const [video] = await db()
			.select({ metadata: videos.metadata })
			.from(videos)
			.where(eq(videos.id, videoId as Video.VideoId));

		const currentMetadata = (video?.metadata as VideoMetadata) || {};

		await db()
			.update(videos)
			.set({
				metadata: {
					...currentMetadata,
					enhancedAudioStatus: "ERROR",
				},
			})
			.where(eq(videos.id, videoId as Video.VideoId));
	}
}
