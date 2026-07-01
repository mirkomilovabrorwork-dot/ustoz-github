import { db } from "@cap/database";
import { videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";

/**
 * Atomically read-modify-write a video's metadata JSON under a row lock so
 * concurrent writers (AI generation, translation, task toggle, metadata edit)
 * cannot clobber each other's changes (lost-update race). Runs
 * SELECT ... FOR UPDATE + UPDATE inside one transaction. The `patch` callback
 * receives the freshly-locked current metadata and must return the FULL next
 * metadata. Throwing inside `patch` rolls back the transaction (use for
 * mid-lock validation).
 */
export async function patchVideoMetadata(
	videoId: string,
	patch: (current: VideoMetadata) => VideoMetadata | Promise<VideoMetadata>,
): Promise<VideoMetadata> {
	return await db().transaction(async (tx) => {
		const [row] = await tx
			.select({ metadata: videos.metadata })
			.from(videos)
			.where(eq(videos.id, videoId as Video.VideoId))
			.for("update");
		const current = ((row?.metadata as VideoMetadata) ?? {}) as VideoMetadata;
		const next = await patch(current);
		await tx
			.update(videos)
			.set({ metadata: next })
			.where(eq(videos.id, videoId as Video.VideoId));
		return next;
	});
}
