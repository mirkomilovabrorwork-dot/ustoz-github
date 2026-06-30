import { timingSafeEqual } from "node:crypto";
import { db } from "@cap/database";
import { videos } from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { and, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const STALE_JOB_THRESHOLD_MS = 60 * 60 * 1000;

function getAffectedRows(result: unknown): number {
	if (Array.isArray(result)) {
		return (result[0] as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
	}
	return (result as { affectedRows?: number } | undefined)?.affectedRows ?? 0;
}

export async function GET(request: Request) {
	const cronSecret = process.env.CRON_SECRET;
	if (!cronSecret) {
		return NextResponse.json(
			{ error: "Server misconfiguration" },
			{ status: 500 },
		);
	}

	const authHeader = request.headers.get("authorization");
	const expected = `Bearer ${cronSecret}`;
	if (
		!authHeader ||
		authHeader.length !== expected.length ||
		!timingSafeEqual(Buffer.from(authHeader), Buffer.from(expected))
	) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const staleBefore = new Date(Date.now() - STALE_JOB_THRESHOLD_MS);
	const staleBeforeIso = staleBefore.toISOString();

	const transcriptionCandidates = await db()
		.select({ id: videos.id })
		.from(videos)
		.where(
			and(
				eq(videos.transcriptionStatus, "PROCESSING"),
				sql`JSON_UNQUOTE(JSON_EXTRACT(${videos.metadata}, '$.processingStartedAt')) <= ${staleBeforeIso}`,
			),
		);

	const aiGenerationCandidates = await db()
		.select({ id: videos.id })
		.from(videos)
		.where(
			and(
				sql`JSON_UNQUOTE(JSON_EXTRACT(${videos.metadata}, '$.aiGenerationStatus')) IN ('PROCESSING', 'QUEUED')`,
				sql`JSON_UNQUOTE(JSON_EXTRACT(${videos.metadata}, '$.aiProcessingStartedAt')) <= ${staleBeforeIso}`,
			),
		);

	const transcriptionResult =
		transcriptionCandidates.length > 0
			? await db()
					.update(videos)
					.set({ transcriptionStatus: "ERROR" })
					.where(
						inArray(
							videos.id,
							transcriptionCandidates.map((candidate) => candidate.id),
						),
					)
			: null;

	const aiGenerationResult =
		aiGenerationCandidates.length > 0
			? await db()
					.update(videos)
					.set({
						metadata: sql<VideoMetadata>`JSON_SET(COALESCE(${videos.metadata}, JSON_OBJECT()), '$.aiGenerationStatus', 'ERROR')`,
					})
					.where(
						inArray(
							videos.id,
							aiGenerationCandidates.map((candidate) => candidate.id),
						),
					)
			: null;

	return NextResponse.json({
		success: true,
		staleBefore: staleBefore.toISOString(),
		transcriptionReset: getAffectedRows(transcriptionResult),
		aiGenerationReset: getAffectedRows(aiGenerationResult),
	});
}
