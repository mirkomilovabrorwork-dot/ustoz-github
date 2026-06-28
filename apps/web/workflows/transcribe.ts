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
		);

		await saveTranscription(videoId, userId, videoData.video, transcription);
	} catch (error) {
		await markError(videoId);
		await cleanupTempAudioKeys(tempAudioKeys, videoData.video);
		throw error;
	}

	await cleanupTempAudioKeys(tempAudioKeys, videoData.video);

	if (aiGenerationEnabled) {
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
	userId: string,
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

async function transcribeAudioChunks(
	audio: ExtractedAudio,
	ownerEncryptedGeminiKey: string | null,
	context: { userId: string; orgId: string; videoId: string },
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

	const transcribedChunks: Array<{ vtt: string; offsetSec: number }> = [];

	for (const chunk of audio.chunks) {
		const vtt = await transcribeAudio(
			chunk.url,
			chunk.durationSec,
			ownerEncryptedGeminiKey,
			context,
		);
		transcribedChunks.push({ vtt, offsetSec: chunk.startSec });
	}

	return mergeChunkedWebVtt(transcribedChunks);
}

async function saveTranscription(
	videoId: string,
	userId: string,
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

	await db()
		.update(videos)
		.set({ transcriptionStatus: "COMPLETE" })
		.where(eq(videos.id, videoId as Video.VideoId));
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
