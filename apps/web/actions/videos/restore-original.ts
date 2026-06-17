"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videoEdits, videos } from "@cap/database/schema";
import { Storage } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { runPromise } from "@/lib/server";
import { getEditSourceKey } from "@/lib/video-edit-processing";
import { decodeStorageVideo } from "@/lib/video-storage";

export type RestoreOriginalResult = { ok: true } | { ok: false; error: string };

export async function restoreOriginal(
	videoId: Video.VideoId,
): Promise<RestoreOriginalResult> {
	const user = await getCurrentUser();
	if (!user)
		return { ok: false, error: "You're signed out. Please log in again." };

	const [video] = await db()
		.select()
		.from(videos)
		.where(eq(videos.id, videoId));

	if (!video) return { ok: false, error: "Video not found." };
	if (video.ownerId !== user.id)
		return { ok: false, error: "You don't own this video." };

	const [existingEdit] = await db()
		.select()
		.from(videoEdits)
		.where(eq(videoEdits.videoId, videoId));

	if (!existingEdit)
		return { ok: false, error: "No edit found for this video." };

	const sourceKey =
		existingEdit.sourceKey ?? getEditSourceKey(video.ownerId, video.id);
	const resultKey = `${video.ownerId}/${videoId}/result.mp4`;

	try {
		const [bucket] = await Storage.getAccessForVideo(
			decodeStorageVideo(video),
		).pipe(runPromise);

		await bucket
			.copyObject(`${bucket.bucketName}/${sourceKey}`, resultKey)
			.pipe(runPromise);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to restore original.";
		return { ok: false, error: message };
	}

	await db().delete(videoEdits).where(eq(videoEdits.videoId, videoId));

	revalidatePath(`/s/${videoId}`);
	revalidatePath(`/s/${videoId}/edit`);

	return { ok: true };
}
