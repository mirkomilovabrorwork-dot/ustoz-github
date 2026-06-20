import { getCurrentUser } from "@cap/database/auth/session";
import { db } from "@cap/database";
import { organizationMembers, organizations, videos } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { and, eq, isNull, or } from "drizzle-orm";
import type { NextRequest } from "next/server";
import { getVideoAnalytics } from "@/actions/videos/get-analytics";

const parseRangeParam = (value: string | null) => {
	if (!value) return undefined;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const normalized =
		trimmed.endsWith("d") || trimmed.endsWith("D")
			? trimmed.slice(0, -1)
			: trimmed;
	const parsed = Number.parseInt(normalized, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
	return parsed;
};

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
	const url = new URL(request.url);
	const videoId = url.searchParams.get("videoId");
	const rangeParam = url.searchParams.get("range");
	const rangeDays = parseRangeParam(rangeParam);

	if (!videoId) {
		return Response.json({ error: "Video ID is required" }, { status: 400 });
	}

	try {
		const user = await getCurrentUser();
		if (!user) {
			return Response.json({ auth: false }, { status: 401 });
		}

		const [videoAccess] = await db()
			.select({
				id: videos.id,
			})
			.from(videos)
			.leftJoin(
				organizations,
				and(eq(videos.orgId, organizations.id), isNull(organizations.tombstoneAt)),
			)
			.leftJoin(
				organizationMembers,
				and(
					eq(organizationMembers.organizationId, videos.orgId),
					eq(organizationMembers.userId, user.id),
				),
			)
			.where(
				and(
					eq(videos.id, Video.VideoId.make(videoId)),
					or(
						eq(videos.ownerId, user.id),
						eq(organizations.ownerId, user.id),
						eq(organizationMembers.userId, user.id),
					),
				),
			)
			.limit(1);

		if (!videoAccess) {
			return Response.json({ error: "Forbidden" }, { status: 403 });
		}

		const result = await getVideoAnalytics(videoId, { rangeDays });
		return Response.json({ count: result.count }, { status: 200 });
	} catch (error) {
		console.error("Error fetching video analytics:", error);
		return Response.json(
			{ error: "Failed to fetch analytics" },
			{ status: 500 },
		);
	}
}
