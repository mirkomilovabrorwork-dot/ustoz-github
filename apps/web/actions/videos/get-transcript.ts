"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { provideOptionalAuth, Storage, VideosPolicy } from "@cap/web-backend";
import { Policy, type Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { Effect, Exit, Option } from "effect";
import { runPromise, runPromiseExit } from "@/lib/server";
import { decodeStorageVideo } from "@/lib/video-storage";

export async function getTranscript(
	videoId: Video.VideoId,
): Promise<{ success: boolean; content?: string; message: string; partial?: boolean; progress?: { completed: number; total: number } }> {
	const user = await getCurrentUser();

	if (!videoId) {
		return {
			success: false,
			message: "Missing required data for fetching transcript",
		};
	}

	const query = await db()
		.select({ video: videos })
		.from(videos)
		.where(eq(videos.id, videoId));

	if (query.length === 0) {
		return { success: false, message: "Video not found" };
	}

	const result = query[0];
	if (!result?.video) {
		return { success: false, message: "Video information is missing" };
	}

	const { video } = result;

	const viewExit = await Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;
		return yield* Effect.void.pipe(
			Policy.withPublicPolicy(videosPolicy.canView(videoId)),
		);
	}).pipe(provideOptionalAuth, runPromiseExit);

	if (Exit.isFailure(viewExit)) {
		return { success: false, message: "Not authorized" };
	}

	if (video.transcriptionStatus === "COMPLETE") {
		try {
			const vttContent = await Effect.gen(function* () {
				const [bucket] = yield* Storage.getAccessForVideo(
					decodeStorageVideo(video),
				);

				return yield* bucket.getObject(
					`${video.ownerId}/${videoId}/transcription.vtt`,
				);
			}).pipe(runPromise);

			if (Option.isNone(vttContent)) {
				console.warn("[getTranscript] VTT missing at expected key", { videoId, ownerId: video.ownerId });
				return { success: false, message: "Transcript file not found" };
			}

			return {
				success: true,
				content: vttContent.value,
				partial: false,
				message: "Transcript retrieved successfully",
			};
		} catch (error) {
			console.error("[getTranscript] Error fetching transcript:", {
				error: error instanceof Error ? error.message : error,
				videoId,
				userId: user?.id,
			});
			return {
				success: false,
				message: "Failed to fetch transcript",
			};
		}
	} else if (video.transcriptionStatus === "PROCESSING") {
		const md = video.metadata as VideoMetadata;
		try {
			const vttContent = await Effect.gen(function* () {
				const [bucket] = yield* Storage.getAccessForVideo(
					decodeStorageVideo(video),
				);

				return yield* bucket.getObject(
					`${video.ownerId}/${videoId}/transcription-partial.vtt`,
				);
			}).pipe(runPromise);

			if (Option.isSome(vttContent)) {
				return {
					success: true,
					content: vttContent.value,
					partial: true,
					progress: {
						completed: md.transcriptionChunksCompleted ?? 0,
						total: md.transcriptionChunksTotal ?? 0,
					},
					message: "Partial transcript",
				};
			}

			return {
				success: false,
				partial: true,
				progress: {
					completed: md.transcriptionChunksCompleted ?? 0,
					total: md.transcriptionChunksTotal ?? 0,
				},
				message: "Transcript is not ready yet",
			};
		} catch (error) {
			console.error("[getTranscript] Error fetching partial transcript:", {
				error: error instanceof Error ? error.message : error,
				videoId,
				userId: user?.id,
			});
			return {
				success: false,
				partial: true,
				progress: {
					completed: md.transcriptionChunksCompleted ?? 0,
					total: md.transcriptionChunksTotal ?? 0,
				},
				message: "Transcript is not ready yet",
			};
		}
	} else {
		return {
			success: false,
			message: "Transcript is not ready yet",
		};
	}
}
