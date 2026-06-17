import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos, videoUploads } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { reconcileStaleEditUpload } from "@/lib/video-edit-processing";
import { EditVideoClient } from "./EditVideoClient";

export default async function EditVideoPage(props: {
	params: Promise<{ videoId: string }>;
}) {
	const params = await props.params;
	const videoId = Video.VideoId.make(params.videoId);
	const user = await getCurrentUser();

	if (!user) notFound();

	await reconcileStaleEditUpload(videoId);

	const [video] = await db()
		.select({
			id: videos.id,
			name: videos.name,
			ownerId: videos.ownerId,
			duration: videos.duration,
			width: videos.width,
			height: videos.height,
			source: videos.source,
			isScreenshot: videos.isScreenshot,
		})
		.from(videos)
		.where(eq(videos.id, videoId));

	if (
		!video ||
		video.ownerId !== user.id ||
		video.isScreenshot ||
		!video.duration ||
		video.duration <= 0
	) {
		notFound();
	}

	const [activeUpload] = await db()
		.select({ phase: videoUploads.phase })
		.from(videoUploads)
		.where(
			and(
				eq(videoUploads.videoId, videoId),
				inArray(videoUploads.phase, [
					"uploading",
					"processing",
					"generating_thumbnail",
				]),
				gt(videoUploads.startedAt, sql`DATE_SUB(NOW(), INTERVAL 1 HOUR)`),
			),
		)
		.limit(1);

	if (activeUpload) {
		notFound();
	}

	return (
		<EditVideoClient
			video={{
				id: video.id,
				name: video.name,
				ownerId: video.ownerId,
				duration: video.duration,
				width: video.width,
				height: video.height,
			}}
		/>
	);
}
