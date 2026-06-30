import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { organizationMembers, organizations, videos } from "@cap/database/schema";
import type { ShareLanguage, TranslationStatus, VideoMetadata } from "@cap/database/types";
import { provideOptionalAuth, VideosPolicy } from "@cap/web-backend";
import { Policy, Video } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import { Effect, Exit } from "effect";
import type { NextRequest } from "next/server";
import { after } from "next/server";
import { getEffectiveOrganizationRole } from "@/lib/permissions/roles";
import { runPromiseExit } from "@/lib/server";
import { translateAiContent } from "@/lib/translate-ai";

export const dynamic = "force-dynamic";

const SHARE_LANGUAGES: ShareLanguage[] = ["uz", "ru", "en"];

function isShareLanguage(value: unknown): value is ShareLanguage {
	return typeof value === "string" && (SHARE_LANGUAGES as string[]).includes(value);
}

export async function POST(request: NextRequest) {
	try {
		let body: { videoId?: unknown; language?: unknown };
		try {
			body = await request.json();
		} catch {
			return Response.json({ error: "Invalid JSON" }, { status: 400 });
		}

		const { videoId: rawVideoId, language: rawLanguage } = body;

		if (typeof rawVideoId !== "string" || !rawVideoId || !isShareLanguage(rawLanguage)) {
			return Response.json({ error: "invalid language" }, { status: 400 });
		}

		const videoId = rawVideoId as Video.VideoId;
		const language = rawLanguage;

		const user = await getCurrentUser();
		if (!user) {
			return Response.json({ error: "Unauthorized" }, { status: 403 });
		}

		const [video] = await db()
			.select({
				id: videos.id,
				ownerId: videos.ownerId,
				orgId: videos.orgId,
				transcriptionStatus: videos.transcriptionStatus,
				metadata: videos.metadata,
			})
			.from(videos)
			.where(and(eq(videos.id, videoId), isNull(videos.deletedAt)))
			.limit(1);

		if (!video) {
			return Response.json({ error: "Video not found" }, { status: 404 });
		}

		// Check admin/owner permission
		const isOwner = user.id === video.ownerId;
		let hasPermission = isOwner;

		if (!hasPermission && video.orgId) {
			const [orgAccess] = await db()
				.select({
					ownerId: organizations.ownerId,
					memberRole: organizationMembers.role,
				})
				.from(organizations)
				.leftJoin(
					organizationMembers,
					and(
						eq(organizationMembers.organizationId, organizations.id),
						eq(organizationMembers.userId, user.id),
					),
				)
				.where(
					and(
						eq(organizations.id, video.orgId),
						isNull(organizations.tombstoneAt),
					),
				)
				.limit(1);

			if (orgAccess) {
				const role = getEffectiveOrganizationRole({
					userId: user.id,
					ownerId: orgAccess.ownerId,
					memberRole: orgAccess.memberRole,
				});
				hasPermission = role === "owner" || role === "admin";
			}
		}

		if (!hasPermission) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}

		const metadata = (video.metadata as VideoMetadata) || {};

		if (!metadata.aiSummary) {
			return Response.json({ error: "no base analysis" }, { status: 409 });
		}

		if (
			metadata.aiSummaryByLanguage?.[language] &&
			metadata.aiTranslationStatus?.[language] === "COMPLETE"
		) {
			return Response.json({ status: "COMPLETE" });
		}

		if (metadata.aiTranslationStatus?.[language] === "PROCESSING") {
			return Response.json({ status: "PROCESSING" });
		}

		const runTranslate = () =>
			translateAiContent({ videoId, userId: video.ownerId, language }).catch((err) => {
				console.error("[translate route] translateAiContent failed", { videoId, language, err });
			});
		try {
			after(runTranslate);
		} catch {
			void runTranslate();
		}

		return Response.json({ status: "PROCESSING" });
	} catch (error) {
		console.error("[translate/route] Unexpected error:", error);
		return Response.json({ error: "Internal server error" }, { status: 500 });
	}
}

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const rawVideoId = searchParams.get("videoId");
		const rawLanguage = searchParams.get("language");

		if (!rawVideoId || !isShareLanguage(rawLanguage)) {
			return Response.json({ error: "invalid language" }, { status: 400 });
		}

		const videoId = rawVideoId as Video.VideoId;
		const language = rawLanguage;

		const canView = await Effect.gen(function* () {
			const videosPolicy = yield* VideosPolicy;
			return yield* Effect.void.pipe(
				Policy.withPublicPolicy(videosPolicy.canView(Video.VideoId.make(videoId))),
			);
		}).pipe(provideOptionalAuth, runPromiseExit);

		if (Exit.isFailure(canView)) {
			return Response.json({ error: "Not authorized" }, { status: 403 });
		}

		const [video] = await db()
			.select({ id: videos.id, metadata: videos.metadata })
			.from(videos)
			.where(and(eq(videos.id, videoId), isNull(videos.deletedAt)))
			.limit(1);

		if (!video) {
			return Response.json({ error: "Video not found" }, { status: 404 });
		}

		const metadata = (video.metadata as VideoMetadata) || {};

		return Response.json({
			status: (metadata.aiTranslationStatus?.[language] ?? null) as TranslationStatus | null,
			hasContent: Boolean(metadata.aiSummaryByLanguage?.[language]),
		});
	} catch (error) {
		console.error("[translate/route] Unexpected error:", error);
		return Response.json({ error: "Internal server error" }, { status: 500 });
	}
}
