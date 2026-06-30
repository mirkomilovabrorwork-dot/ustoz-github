"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videoEditHistory, videos } from "@cap/database/schema";
import type { VideoEditSpec } from "@cap/database/types";
import type { Video } from "@cap/web-domain";
import { desc, eq } from "drizzle-orm";

export type EditHistoryEntry = {
	id: string;
	editSpec: VideoEditSpec;
	resultKey: string | null;
	createdAt: Date;
};

export type GetEditHistoryResult =
	| { ok: true; entries: EditHistoryEntry[] }
	| { ok: false; error: string };

export async function getEditHistory(
	videoId: Video.VideoId,
): Promise<GetEditHistoryResult> {
	const user = await getCurrentUser();
	if (!user) return { ok: false, error: "Unauthorized" };

	const [video] = await db()
		.select({ ownerId: videos.ownerId })
		.from(videos)
		.where(eq(videos.id, videoId))
		.limit(1);

	if (!video) return { ok: false, error: "Video not found" };
	if (video.ownerId !== user.id) return { ok: false, error: "Unauthorized" };

	const entries = await db()
		.select({
			id: videoEditHistory.id,
			editSpec: videoEditHistory.editSpec,
			resultKey: videoEditHistory.resultKey,
			createdAt: videoEditHistory.createdAt,
		})
		.from(videoEditHistory)
		.where(eq(videoEditHistory.videoId, videoId))
		.orderBy(desc(videoEditHistory.createdAt))
		.limit(50);

	return { ok: true, entries };
}
