"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos, videoUploads } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";

/**
 * Marks a videoUploads row as phase="error" for a video the current user owns.
 * Called on mid-upload failure to prevent the row staying stuck at "uploading".
 * Safe to call even if the row has already been removed.
 */
export async function markUploadFailed(videoId: Video.VideoId): Promise<void> {
	const user = await getCurrentUser();
	if (!user) return;

	// Verify ownership before touching any row.
	const [owned] = await db()
		.select({ id: videos.id })
		.from(videos)
		.where(and(eq(videos.id, videoId), eq(videos.ownerId, user.id)))
		.limit(1);

	if (!owned) return;

	await db()
		.update(videoUploads)
		.set({ phase: "error" })
		.where(eq(videoUploads.videoId, videoId));
}
