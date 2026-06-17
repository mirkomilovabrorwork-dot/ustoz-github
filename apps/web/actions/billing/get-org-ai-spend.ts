"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { aiUsageEvents, users, videos } from "@cap/database/schema";
import { Organisation } from "@cap/web-domain";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { getOrganizationAccess } from "@/actions/organization/authorization";
import { canViewOrganizationSettings } from "@/lib/permissions/roles";

export type AiSpendEvent = {
	id: string;
	createdAt: Date;
	userId: string;
	userName: string | null;
	videoId: string | null;
	videoName: string | null;
	operation: string;
	model: string;
	inputTokens: number;
	outputTokens: number;
	costUsdCents: number;
};

export type AiSpendAggregation = {
	totalUsdCents: number;
	breakdown: Record<string, number>;
	dailySpend: { date: string; costUsdCents: number; operation: string }[];
};

export type GetOrgAiSpendResult = {
	events: AiSpendEvent[];
	thisMonth: AiSpendAggregation;
	lastMonth: AiSpendAggregation;
	total: number;
};

function monthRange(offsetMonths: number): { start: Date; end: Date } {
	const now = new Date();
	const start = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths, 1),
	);
	const end = new Date(
		Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetMonths + 1, 1),
	);
	return { start, end };
}

async function buildAggregation(
	orgId: string,
	start: Date,
	end: Date,
): Promise<AiSpendAggregation> {
	const rows = await db()
		.select({
			operation: aiUsageEvents.operation,
			date: sql<string>`DATE(${aiUsageEvents.createdAt})`,
			totalMicros: sql<number>`COALESCE(SUM(${aiUsageEvents.costUsdMicros}), 0)`,
		})
		.from(aiUsageEvents)
		.where(
			and(
				sql`${aiUsageEvents.orgId} = ${orgId}`,
				gte(aiUsageEvents.createdAt, start),
				lt(aiUsageEvents.createdAt, end),
			),
		)
		.groupBy(aiUsageEvents.operation, sql`DATE(${aiUsageEvents.createdAt})`);

	let totalMicros = 0;
	const breakdown: Record<string, number> = {};
	const dailySpend: AiSpendAggregation["dailySpend"] = [];

	for (const row of rows) {
		const cents = Math.round(row.totalMicros / 10_000);
		breakdown[row.operation] = (breakdown[row.operation] ?? 0) + cents;
		totalMicros += row.totalMicros;
		dailySpend.push({
			date: row.date,
			costUsdCents: cents,
			operation: row.operation,
		});
	}

	return {
		totalUsdCents: Math.round(totalMicros / 10_000),
		breakdown,
		dailySpend,
	};
}

export async function getOrgAiSpend(
	orgId: string,
	page = 1,
	limit = 50,
	dateRange: "this_month" | "last_month" | "last_90_days" = "this_month",
	operation?: string,
): Promise<GetOrgAiSpendResult> {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");

	const access = await getOrganizationAccess(
		user.id,
		Organisation.OrganisationId.make(orgId),
	);
	if (!access || !canViewOrganizationSettings(access.role)) {
		throw new Error("Forbidden");
	}

	const now = new Date();
	let start: Date;
	let end: Date;

	if (dateRange === "this_month") {
		const r = monthRange(0);
		start = r.start;
		end = r.end;
	} else if (dateRange === "last_month") {
		const r = monthRange(-1);
		start = r.start;
		end = r.end;
	} else {
		start = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 90),
		);
		end = new Date(
			Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
		);
	}

	const whereConditions = [
		eq(aiUsageEvents.orgId, orgId),
		gte(aiUsageEvents.createdAt, start),
		lt(aiUsageEvents.createdAt, end),
		...(operation ? [eq(aiUsageEvents.operation, operation)] : []),
	];

	const [countResult, rows] = await Promise.all([
		db()
			.select({ count: sql<number>`COUNT(*)` })
			.from(aiUsageEvents)
			.where(and(...whereConditions)),
		db()
			.select({
				id: aiUsageEvents.id,
				createdAt: aiUsageEvents.createdAt,
				userId: aiUsageEvents.userId,
				userName: users.name,
				videoId: aiUsageEvents.videoId,
				videoName: videos.name,
				operation: aiUsageEvents.operation,
				model: aiUsageEvents.model,
				inputTokens: aiUsageEvents.inputTokens,
				outputTokens: aiUsageEvents.outputTokens,
				costUsdMicros: aiUsageEvents.costUsdMicros,
			})
			.from(aiUsageEvents)
			.leftJoin(users, eq(aiUsageEvents.userId, users.id))
			.leftJoin(videos, eq(aiUsageEvents.videoId, videos.id))
			.where(and(...whereConditions))
			.orderBy(desc(aiUsageEvents.createdAt))
			.limit(limit)
			.offset((page - 1) * limit),
	]);

	const total = countResult[0]?.count ?? 0;

	const events: AiSpendEvent[] = rows.map((row) => ({
		id: row.id,
		createdAt: row.createdAt,
		userId: row.userId,
		userName: row.userName,
		videoId: row.videoId ?? null,
		videoName: row.videoName ?? null,
		operation: row.operation,
		model: row.model,
		inputTokens: row.inputTokens,
		outputTokens: row.outputTokens,
		costUsdCents: Math.round(row.costUsdMicros / 10_000),
	}));

	const thisMonthRange = monthRange(0);
	const lastMonthRange = monthRange(-1);

	const [thisMonth, lastMonth] = await Promise.all([
		buildAggregation(orgId, thisMonthRange.start, thisMonthRange.end),
		buildAggregation(orgId, lastMonthRange.start, lastMonthRange.end),
	]);

	return { events, thisMonth, lastMonth, total };
}
