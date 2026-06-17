"use server";

import { db } from "@cap/database";
import { aiUsageEvents } from "@cap/database/schema";
import { and, eq, sql } from "drizzle-orm";

function currentBillingMonth(): string {
	const now = new Date();
	const year = now.getUTCFullYear();
	const month = String(now.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

export async function getMonthlySpend(scope: {
	type: "user" | "org" | "video";
	id: string;
}): Promise<{
	totalUsdCents: number;
	breakdown: Record<string, number>;
	capUsdCents: number | null;
	percentUsed: number;
}> {
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
		const cents = Math.round(row.totalMicros / 10_000);
		breakdown[row.operation] = cents;
		totalMicros += row.totalMicros;
	}

	const totalUsdCents = Math.round(totalMicros / 10_000);

	const capUsdCents: number | null = null;

	const percentUsed =
		capUsdCents != null && capUsdCents > 0
			? Math.round((totalUsdCents / capUsdCents) * 100)
			: 0;

	return { totalUsdCents, breakdown, capUsdCents, percentUsed };
}
