"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { aiUsageEvents, organizationMembers, organizations, videos } from "@cap/database/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Organisation, Video } from "@cap/web-domain";

function currentBillingMonth(): string {
	const now = new Date();
	const year = now.getUTCFullYear();
	const month = String(now.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

const emptyResult = {
	totalUsdCents: 0,
	breakdown: {} as Record<string, number>,
	capUsdCents: null as number | null,
	percentUsed: 0,
};

export async function getMonthlySpend(scope: {
	type: "user" | "org" | "video";
	id: string;
}): Promise<{
	totalUsdCents: number;
	breakdown: Record<string, number>;
	capUsdCents: number | null;
	percentUsed: number;
}> {
	const user = await getCurrentUser();
	if (!user?.id) return emptyResult;

	if (scope.type === "user") {
		// A user may only read their own spend.
		if (scope.id !== user.id) return emptyResult;
	} else if (scope.type === "org") {
		// Org spend: caller must be owner or a member of that org.
		const [org] = await db()
			.select({ ownerId: organizations.ownerId })
			.from(organizations)
			.where(eq(organizations.id, scope.id as Organisation.OrganisationId))
			.limit(1);

		if (!org) return emptyResult;

		const isOrgOwner = org.ownerId === user.id;
		if (!isOrgOwner) {
			const [membership] = await db()
				.select({ id: organizationMembers.id })
				.from(organizationMembers)
				.where(
					and(
						eq(organizationMembers.userId, user.id),
						eq(
							organizationMembers.organizationId,
							scope.id as Organisation.OrganisationId,
						),
					),
				)
				.limit(1);

			if (!membership) return emptyResult;
		}
	} else if (scope.type === "video") {
		// Video spend: caller must own the video.
		const [video] = await db()
			.select({ ownerId: videos.ownerId })
			.from(videos)
			.where(and(eq(videos.id, scope.id as Video.VideoId), isNull(videos.deletedAt)))
			.limit(1);

		if (!video || video.ownerId !== user.id) return emptyResult;
	}

	const billingMonth = currentBillingMonth();

	const colMap = {
		user: aiUsageEvents.userId,
		org: aiUsageEvents.orgId,
		video: aiUsageEvents.videoId,
	} as const;

	const col = colMap[scope.type];

	const rows = await db()
		.select({
			operation: aiUsageEvents.operation,
			totalMicros: sql<number>`COALESCE(SUM(${aiUsageEvents.costUsdMicros}), 0)`,
		})
		.from(aiUsageEvents)
		.where(
			and(
				sql`${col} = ${scope.id}`,
				eq(aiUsageEvents.billingMonth, billingMonth),
			),
		)
		.groupBy(aiUsageEvents.operation);

	let totalMicros = 0;
	const breakdown: Record<string, number> = {};

	for (const row of rows) {
		const micros = Number(row.totalMicros);
		const cents = Math.round(micros / 10_000);
		breakdown[row.operation] = cents;
		totalMicros += micros;
	}

	const totalUsdCents = Math.round(totalMicros / 10_000);

	const capUsdCents: number | null = null;

	const percentUsed =
		capUsdCents != null && capUsdCents > 0
			? Math.round((totalUsdCents / capUsdCents) * 100)
			: 0;

	return { totalUsdCents, breakdown, capUsdCents, percentUsed };
}
