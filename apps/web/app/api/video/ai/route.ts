import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	try {
		const user = await getCurrentUser();
		const url = new URL(request.url);
		const videoId = url.searchParams.get("videoId") as Video.VideoId;

		if (!user) {
			return Response.json({ auth: false }, { status: 401 });
		}

		if (!videoId) {
			return Response.json(
				{ error: true, message: "Video ID not provided" },
				{ status: 400 },
			);
		}

		const result = await db()
			.select()
			.from(videos)
			.where(eq(videos.id, videoId));
		if (result.length === 0 || !result[0]) {
			return Response.json(
				{ error: true, message: "Video not found" },
				{ status: 404 },
			);
		}

		const video = result[0];
		if (video.ownerId !== user.id) {
			return Response.json(
				{ error: true, message: "Forbidden" },
				{ status: 403 },
			);
		}

		const metadata: VideoMetadata = (video.metadata as VideoMetadata) || {};

		if (metadata.summary || metadata.chapters) {
			console.log(
				`[AI API] Returning existing AI metadata for video ${videoId}`,
			);
			return Response.json(
				{
					processing: false,
					title: metadata.aiTitle ?? null,
					summary: metadata.summary ?? null,
					chapters: metadata.chapters ?? null,
					aiGenerationStatus: metadata.aiGenerationStatus ?? null,
				},
				{ status: 200 },
			);
		}

		if (
			metadata.aiGenerationStatus === "PROCESSING" ||
			metadata.aiGenerationStatus === "QUEUED"
		) {
			console.log(
				`[AI API] AI processing already in progress for video ${videoId}`,
			);
			return Response.json(
				{
					processing: true,
					message: "AI metadata generation in progress",
					aiGenerationStatus: metadata.aiGenerationStatus,
				},
				{ status: 200 },
			);
		}

		// GET is strictly READ-ONLY. AI generation is MANUAL: an admin / video
		// owner starts (or retries) the pipeline only via the explicit POST
		// /api/videos/[videoId]/generate path (see _components/GenerateAiPanel.tsx).
		// This endpoint NEVER starts or restarts generation — doing so on a GET
		// (e.g. for ERROR/SKIPPED status) would silently waste tokens. It only
		// reports the current status so the client can show the right UI.
		return Response.json(
			{
				processing: false,
				aiGenerationStatus: metadata.aiGenerationStatus ?? null,
			},
			{ status: 200 },
		);
	} catch (error) {
		console.error("[AI API] Unexpected error:", error);
		return Response.json(
			{
				processing: false,
				error: "An unexpected error occurred",
			},
			{ status: 500 },
		);
	}
}
