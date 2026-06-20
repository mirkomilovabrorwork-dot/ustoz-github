// Media server removed — desktop segments are served directly via /api/playlist
import { db } from "@cap/database";
import { videos, videoUploads } from "@cap/database/schema";
import { type User, Video } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { invalidateGoogleDriveStorageQuotaCache } from "@/lib/google-drive-storage-quota";

interface FinalizeDesktopRecordingWorkflowPayload {
	videoId: string;
	userId: User.UserId;
}

export async function finalizeDesktopRecordingWorkflow(
	payload: FinalizeDesktopRecordingWorkflowPayload,
): Promise<{ success: true; jobId?: string }> {
	"use workflow";

	const { videoId, userId } = payload;

	try {
		await validateDesktopSegmentsRecording(videoId, userId);

		// Media server removed — complete without server-side muxing
		await completeWithoutMediaServer(videoId);

		return { success: true };
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : String(error);
		await markMuxError(videoId, errorMessage);
		throw new FatalError(errorMessage);
	}
}

async function validateDesktopSegmentsRecording(
	videoId: string,
	userId: User.UserId,
): Promise<void> {
	"use step";

	const [video] = await db()
		.select()
		.from(videos)
		.where(
			and(
				eq(videos.id, Video.VideoId.make(videoId)),
				eq(videos.ownerId, userId),
			),
		);

	if (!video) {
		throw new FatalError("Video does not exist");
	}

	if (video.source?.type === "desktopMP4") {
		return;
	}

	if (video.source?.type !== "desktopSegments") {
		throw new FatalError("Video is not a segmented recording");
	}
}

async function completeWithoutMediaServer(
	videoId: string,
): Promise<void> {
	"use step";

	const [video] = await db()
		.select()
		.from(videos)
		.where(eq(videos.id, Video.VideoId.make(videoId)));

	await db()
		.delete(videoUploads)
		.where(eq(videoUploads.videoId, Video.VideoId.make(videoId)));

	await invalidateGoogleDriveStorageQuotaCache(video?.storageIntegrationId);
}

async function markMuxError(
	videoId: string,
	errorMessage: string,
): Promise<void> {
	"use step";

	await db()
		.update(videoUploads)
		.set({
			phase: "error",
			processingProgress: 0,
			processingMessage: "Segment muxing failed",
			processingError: errorMessage,
			updatedAt: new Date(),
		})
		.where(eq(videoUploads.videoId, Video.VideoId.make(videoId)));
}

