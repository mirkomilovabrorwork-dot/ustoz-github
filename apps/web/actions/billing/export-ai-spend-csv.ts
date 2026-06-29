"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { aiUsageEvents, users, videos } from "@cap/database/schema";
import type { Organisation } from "@cap/web-domain";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { requireOrganizationSettingsAccess } from "@/actions/organization/authorization";

export async function exportAiSpendCsv(params: {
	orgId: string;
	dateFrom?: string;
	dateTo?: string;
	operation?: string;
}): Promise<string> {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");

	await requireOrganizationSettingsAccess(
		user.id,
		params.orgId as Organisation.OrganisationId,
	);

	const conditions = [
		eq(aiUsageEvents.orgId, params.orgId as Organisation.OrganisationId),
	];

	if (params.dateFrom) {
		conditions.push(gte(aiUsageEvents.createdAt, new Date(params.dateFrom)));
	}
	if (params.dateTo) {
		conditions.push(lte(aiUsageEvents.createdAt, new Date(params.dateTo)));
	}
	if (params.operation) {
		conditions.push(eq(aiUsageEvents.operation, params.operation as never));
	}

	const rows = await db()
		.select({
			createdAt: aiUsageEvents.createdAt,
			userEmail: users.email,
			videoId: aiUsageEvents.videoId,
			videoName: videos.name,
			operation: aiUsageEvents.operation,
			model: aiUsageEvents.model,
			inputTokens: aiUsageEvents.inputTokens,
			outputTokens: aiUsageEvents.outputTokens,
			costUsdMicros: aiUsageEvents.costUsdMicros,
		})
		.from(aiUsageEvents)
		.innerJoin(users, eq(users.id, aiUsageEvents.userId))
		.leftJoin(videos, and(eq(videos.id, aiUsageEvents.videoId), isNull(videos.deletedAt)))
		.where(and(...conditions))
		.orderBy(desc(aiUsageEvents.createdAt))
		.limit(100_000);

	const header =
		"timestamp,user_email,meeting_id,meeting_name,operation,model,input_tokens,output_tokens,cost_usd";

	const escape = (value: string | null | undefined): string => {
		if (value == null) return "";
		const str = String(value);
		if (str.includes(",") || str.includes('"') || str.includes("\n")) {
			return `"${str.replace(/"/g, '""')}"`;
		}
		return str;
	};

	const lines = rows.map((row) => {
		const costUsd = (row.costUsdMicros / 1_000_000).toFixed(6);
		return [
			escape(row.createdAt.toISOString()),
			escape(row.userEmail),
			escape(row.videoId),
			escape(row.videoName),
			escape(row.operation),
			escape(row.model),
			String(row.inputTokens),
			String(row.outputTokens),
			costUsd,
		].join(",");
	});

	return [header, ...lines].join("\n");
}
