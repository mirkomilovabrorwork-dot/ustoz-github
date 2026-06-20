import { promises as fs } from "node:fs";
import { db } from "@cap/database";
import { decrypt } from "@cap/database/crypto";
import { nanoId } from "@cap/database/helpers";
import {
	organizations,
	transcriptChunks,
	users,
	videos,
	videoUploads,
} from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { serverEnv } from "@cap/env";
import { userIsPro } from "@cap/utils";
import { Storage } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { withCostGuard } from "@/lib/ai-cost-guard";
import {
	ENHANCED_AUDIO_CONTENT_TYPE,
	ENHANCED_AUDIO_EXTENSION,
	enhanceAudioFromUrl,
} from "@/lib/audio-enhance";
import { checkHasAudioTrack, extractAudioFromUrl } from "@/lib/audio-extract";
import { EMBED_MODEL, embedChunksWithUsage } from "@/lib/gemini-embed";
import { transcribeWithGemini } from "@/lib/gemini-transcribe";
import { startAiGeneration } from "@/lib/generate-ai";
import { runPromise } from "@/lib/server";
import { chunkTranscript } from "@/lib/transcript-chunk";
import { decodeStorageVideo } from "@/lib/video-storage";

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

	try {
		const audioUrl = await extractAudio(videoId, userId, videoData.video);

		if (!audioUrl) {
			await markNoAudio(videoId);
			return {
				success: true,
				message: "Video has no audio track - skipped transcription",
			};
		}

		const [transcription] = await Promise.all([
			transcribeAudio(
				audioUrl,
				videoData.video.duration,
				videoData.ownerEncryptedGeminiKey,
				{ userId, orgId: videoData.orgId, videoId },
			),
		]);

		await saveTranscription(videoId, userId, videoData.video, transcription);

		await chunkEmbedAndStore(
			videoId,
			transcription,
			videoData.ownerEncryptedGeminiKey,
			{ userId, orgId: videoData.orgId },
		);
	} catch (error) {
		await markError(videoId);
		await cleanupTempAudio(videoId, userId, videoData.video);
		throw error;
	}

	await cleanupTempAudio(videoId, userId, videoData.video);

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

	const transcriptionDisabled =
		result.video.settings?.disableTranscript ??
		result.orgSettings?.disableTranscript ??
		false;

	const isOwnerPro = userIsPro(result.owner);

	console.log(
		`[transcribe] Owner check: stripeSubscriptionStatus=${result.owner.stripeSubscriptionStatus}, thirdPartyStripeSubscriptionId=${result.owner.thirdPartyStripeSubscriptionId}, isOwnerPro=${isOwnerPro}`,
	);

	await db()
		.update(videos)
		.set({ transcriptionStatus: "PROCESSING" })
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
): Promise<string | null> {
	"use step";

	const [bucket] = await Storage.getAccessForVideo(
		decodeStorageVideo(video),
	).pipe(runPromise);

	const videoUrl = await resolveVideoSourceUrl(videoId, userId, video);

	// Media server removed — single-file MP4, no server-side processing
	let audioBuffer: Buffer;

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

	const result = await extractAudioFromUrl(videoUrl);

	try {
		audioBuffer = await fs.readFile(result.filePath);
	} finally {
		await result.cleanup();
	}

	console.log(
		`[transcribe] Extracted audio for ${videoId}: ${audioBuffer.length} bytes`,
	);

	const audioKey = `${userId}/${videoId}/audio-temp.mp3`;

	await bucket
		.putObject(audioKey, audioBuffer, {
			contentType: "audio/mpeg",
		})
		.pipe(runPromise);

	const audioSignedUrl = await bucket
		.getInternalSignedObjectUrl(audioKey)
		.pipe(runPromise);

	return audioSignedUrl;
}

async function resolveVideoSourceUrl(
	videoId: string,
	userId: string,
	video: typeof videos.$inferSelect,
): Promise<string> {
	const [resolvedBucket] = await Storage.getAccessForVideo(
		decodeStorageVideo(video),
	).pipe(runPromise);

	const upload = await db()
		.select({ rawFileKey: videoUploads.rawFileKey })
		.from(videoUploads)
		.where(eq(videoUploads.videoId, videoId as Video.VideoId))
		.limit(1);

	const candidateKeys = [
		`${userId}/${videoId}/result.mp4`,
		upload[0]?.rawFileKey,
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
	videoDuration: number | null,
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
				audioDurationSec: videoDuration ?? undefined,
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

async function saveTranscription(
	videoId: string,
	userId: string,
	video: typeof videos.$inferSelect,
	transcription: string,
): Promise<void> {
	"use step";

	const [bucket] = await Storage.getAccessForVideo(
		decodeStorageVideo(video),
	).pipe(runPromise);

	await bucket
		.putObject(`${userId}/${videoId}/transcription.vtt`, transcription, {
			contentType: "text/vtt",
		})
		.pipe(runPromise);

	await db()
		.update(videos)
		.set({ transcriptionStatus: "COMPLETE" })
		.where(eq(videos.id, videoId as Video.VideoId));
}

async function chunkEmbedAndStore(
	videoId: string,
	vttContent: string,
	ownerEncryptedGeminiKey: string | null,
	context: { userId: string; orgId: string },
): Promise<void> {
	"use step";

	try {
		let apiKey: string | undefined;

		if (ownerEncryptedGeminiKey) {
			try {
				apiKey = await decrypt(ownerEncryptedGeminiKey);
			} catch {
				console.error(
					"[transcribe] Failed to decrypt user Gemini key for embeddings, falling back to server key",
				);
			}
		}

		if (!apiKey) {
			apiKey = serverEnv().GEMINI_API_KEY;
		}

		if (!apiKey) {
			console.warn(
				"[transcribe] No Gemini API key available for embeddings, skipping RAG indexing",
			);
			return;
		}

		const chunks = chunkTranscript(vttContent);
		if (chunks.length === 0) {
			console.log(`[transcribe] No chunks produced for video ${videoId}`);
			return;
		}

		const resolvedApiKey = apiKey;

		const { embeddings, totalTokens } = await embedChunksWithUsage(
			chunks,
			resolvedApiKey,
		);

		await withCostGuard({
			orgId: context.orgId,
			userId: context.userId,
			videoId,
			operation: "embedding",
			model: EMBED_MODEL,
			fn: async () => ({
				embeddings,
				inputTokens: totalTokens,
				outputTokens: 0,
			}),
		});

		const rows = chunks.map((chunk, i) => ({
			id: nanoId(),
			videoId: videoId as Video.VideoId,
			chunkIndex: i,
			startMs: chunk.startMs,
			endMs: chunk.endMs,
			speaker: chunk.speaker,
			text: chunk.text,
			tokens: chunk.tokens,
			embedding: embeddings[i] ?? null,
			embeddingModel: EMBED_MODEL,
		}));

		await db().insert(transcriptChunks).values(rows);

		console.log(
			`[transcribe] Stored ${rows.length} transcript chunks for video ${videoId}`,
		);
	} catch (error) {
		console.error(
			`[transcribe] RAG indexing failed for video ${videoId}, transcription still COMPLETE:`,
			error,
		);
	}
}

async function cleanupTempAudio(
	videoId: string,
	userId: string,
	video: typeof videos.$inferSelect,
): Promise<void> {
	"use step";

	const audioKey = `${userId}/${videoId}/audio-temp.mp3`;

	try {
		const [bucket] = await Storage.getAccessForVideo(
			decodeStorageVideo(video),
		).pipe(runPromise);

		await bucket.deleteObject(audioKey).pipe(runPromise);
	} catch (error) {
		console.error(
			`[transcribe] Failed to cleanup temp audio file: ${audioKey}`,
			error,
		);
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

		const [bucket] = await Storage.getAccessForVideo(
			decodeStorageVideo(video),
		).pipe(runPromise);

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
