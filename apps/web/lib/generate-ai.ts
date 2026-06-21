import { db } from "@cap/database";
import { videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { serverEnv } from "@cap/env";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { generateAiWorkflow } from "@/workflows/generate-ai";

type GenerateAiResult = {
	success: boolean;
	message: string;
};

export async function startAiGeneration(
	videoId: Video.VideoId,
	userId: string,
): Promise<GenerateAiResult> {
	if (!serverEnv().GEMINI_API_KEY) {
		return {
			success: false,
			message: "Missing GEMINI_API_KEY",
		};
	}

	if (!userId || !videoId) {
		return {
			success: false,
			message: "userId or videoId not supplied",
		};
	}

	const query = await db()
		.select({ video: videos })
		.from(videos)
		.where(eq(videos.id, videoId));

	if (query.length === 0 || !query[0]?.video) {
		return { success: false, message: "Video does not exist" };
	}

	const { video } = query[0];

	if (video.transcriptionStatus !== "COMPLETE") {
		return {
			success: false,
			message: "Transcription not complete",
		};
	}

	const metadata = (video.metadata as VideoMetadata) || {};

	if (
		metadata.aiGenerationStatus === "PROCESSING" ||
		metadata.aiGenerationStatus === "QUEUED"
	) {
		return {
			success: true,
			message: "AI generation already in progress",
		};
	}

	if (
		metadata.aiGenerationStatus === "COMPLETE" &&
		metadata.summary &&
		metadata.chapters
	) {
		return {
			success: true,
			message: "AI metadata already generated",
		};
	}

	try {
		await db()
			.update(videos)
			.set({
				metadata: {
					...metadata,
					aiGenerationStatus: "QUEUED",
				},
			})
			.where(eq(videos.id, videoId));

		generateAiWorkflow({ videoId, userId }).catch(async (err) => {
			console.error(
				`[startAiGeneration] Inline workflow failed for video ${videoId}:`,
				err,
			);
			// Mark ERROR so the UI shows a retryable error instead of a forever
			// spinner (the workflow sets PROCESSING but never ERROR on async failure).
			try {
				const [current] = await db()
					.select({ metadata: videos.metadata })
					.from(videos)
					.where(eq(videos.id, videoId))
					.limit(1);
				await db()
					.update(videos)
					.set({
						metadata: {
							...(current?.metadata ?? {}),
							aiGenerationStatus: "ERROR",
						},
					})
					.where(eq(videos.id, videoId));
			} catch (markErr) {
				console.error(
					`[startAiGeneration] Failed to mark aiGenerationStatus=ERROR for ${videoId}:`,
					markErr,
				);
			}
		});

		return {
			success: true,
			message: "AI generation started inline",
		};
	} catch {
		await db()
			.update(videos)
			.set({
				metadata: {
					...metadata,
					aiGenerationStatus: "ERROR",
				},
			})
			.where(eq(videos.id, videoId));

		return {
			success: false,
			message: "Failed to start AI generation workflow",
		};
	}
}
