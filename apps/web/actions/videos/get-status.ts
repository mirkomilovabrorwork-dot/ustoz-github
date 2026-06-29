"use server";

import { db } from "@cap/database";
import { videos, videoUploads } from "@cap/database/schema";
import type { AiSummary, VideoMetadata } from "@cap/database/types";
import { provideOptionalAuth, VideosPolicy } from "@cap/web-backend";
import { Policy, type Video } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import { Effect, Exit } from "effect";
import {
	isRetryableDesktopSegmentsFinalizationError,
	queueDesktopSegmentsFinalization,
} from "@/lib/desktop-segments-finalization";
import * as EffectRuntime from "@/lib/server";

type TranscriptionStatus =
	| "PROCESSING"
	| "COMPLETE"
	| "ERROR"
	| "SKIPPED"
	| "NO_AUDIO";

type AiGenerationStatus =
	| "QUEUED"
	| "PROCESSING"
	| "COMPLETE"
	| "ERROR"
	| "SKIPPED";

export interface VideoStatusResult {
	transcriptionStatus: TranscriptionStatus | null;
	aiGenerationStatus: AiGenerationStatus | null;
	name: string | null;
	aiTitle: string | null;
	summary: string | null;
	chapters: { title: string; start: number }[] | null;
	aiSummary: AiSummary | null;
	error?: string;
}

const getAiStatusData = (metadata: VideoMetadata) => {
	const aiSummary = metadata.aiSummary ?? null;
	const legacyChapters =
		aiSummary?.chapters && aiSummary.chapters.length > 0
			? aiSummary.chapters.map((chapter) => ({
					title: chapter.title,
					start: chapter.startSec,
				}))
			: metadata.chapters || null;

	return {
		aiTitle: metadata.aiTitle || null,
		summary: aiSummary?.overview || metadata.summary || null,
		chapters: legacyChapters,
		aiSummary,
	};
};

export async function getVideoStatus(
	videoId: Video.VideoId,
): Promise<VideoStatusResult | { success: false }> {
	if (!videoId) throw new Error("Video ID not provided");

	const exit = await Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;

		return yield* Effect.promise(() =>
			db().select().from(videos).where(and(eq(videos.id, videoId), isNull(videos.deletedAt))),
		).pipe(Policy.withPublicPolicy(videosPolicy.canView(videoId)));
	}).pipe(provideOptionalAuth, EffectRuntime.runPromiseExit);

	if (Exit.isFailure(exit)) return { success: false };

	const video = exit.value[0];
	if (!video) throw new Error("Video not found");

	const metadata: VideoMetadata = (video.metadata as VideoMetadata) || {};
	const aiStatusData = getAiStatusData(metadata);

	if (!video.transcriptionStatus) {
		const activeUpload = await db()
			.select({
				videoId: videoUploads.videoId,
				phase: videoUploads.phase,
				processingError: videoUploads.processingError,
			})
			.from(videoUploads)
			.where(eq(videoUploads.videoId, videoId))
			.limit(1);

		if (activeUpload.length > 0) {
			const upload = activeUpload[0];
			if (
				video.source?.type === "desktopSegments" &&
				upload?.phase === "error" &&
				isRetryableDesktopSegmentsFinalizationError(upload.processingError)
			) {
				queueDesktopSegmentsFinalization({
					videoId,
					userId: video.ownerId,
				}).catch((error) => {
					console.error(
						`[Get Status] Error queueing segment finalization for video ${videoId}:`,
						error,
					);
				});
			}
		}

		// Transcription has not started yet — return null status, no auto-trigger.
		// An admin must click the manual "AI tahlilni boshlash" button to start the pipeline.
		return {
			transcriptionStatus: null,
			aiGenerationStatus:
				(metadata.aiGenerationStatus as AiGenerationStatus) || null,
			name: video.name,
			...aiStatusData,
		};
	}

	if (video.transcriptionStatus === "ERROR") {
		return {
			transcriptionStatus: "ERROR",
			aiGenerationStatus:
				(metadata.aiGenerationStatus as AiGenerationStatus) || null,
			name: video.name,
			...aiStatusData,
			error: "Transcription failed",
		};
	}

	// AI generation is manual — no auto-trigger here.
	// The admin-gated POST /api/videos/[videoId]/generate endpoint starts the pipeline.
	return {
		transcriptionStatus:
			(video.transcriptionStatus as TranscriptionStatus) || null,
		aiGenerationStatus:
			(metadata.aiGenerationStatus as AiGenerationStatus) || null,
		name: video.name,
		...aiStatusData,
	};
}
