import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import {
	type AiOperation,
	aiUsageEvents,
	organizations,
	users,
} from "@cap/database/schema";
import { priceForMicros } from "@cap/utils";
import { Organisation, User, type Video } from "@cap/web-domain";
import { and, eq, sql } from "drizzle-orm";

export class BudgetExceededError extends Error {
	constructor(
		public scope: "user" | "org",
		public currentMicros: number,
		public capMicros: number,
	) {
		super(
			`AI budget exceeded for ${scope}: ${currentMicros} / ${capMicros} microdollars`,
		);
		this.name = "BudgetExceededError";
	}
}

function currentBillingMonth(): string {
	const now = new Date();
	const year = now.getUTCFullYear();
	const month = String(now.getUTCMonth() + 1).padStart(2, "0");
	return `${year}-${month}`;
}

async function getMonthlySpendMicros(
	column: "orgId" | "userId",
	id: string,
	billingMonth: string,
): Promise<number> {
	const idCondition =
		column === "orgId"
			? eq(aiUsageEvents.orgId, Organisation.OrganisationId.make(id))
			: eq(aiUsageEvents.userId, User.UserId.make(id));

	const [result] = await db()
		.select({
			total: sql<number>`COALESCE(SUM(${aiUsageEvents.costUsdMicros}), 0)`,
		})
		.from(aiUsageEvents)
		.where(and(idCondition, eq(aiUsageEvents.billingMonth, billingMonth)));

	return Number(result?.total ?? 0);
}

type AiBudgetSettings = {
	monthlyUsdCents: number;
	alertAtPct: number;
	enabled: boolean;
};

function budgetToMicros(budget?: AiBudgetSettings | null): number | null {
	if (!budget?.enabled || budget.monthlyUsdCents <= 0) return null;
	return budget.monthlyUsdCents * 10_000;
}

export async function getAiBudgetCapsMicros({
	orgId,
	userId,
}: {
	orgId: string;
	userId: string;
}): Promise<{
	budgetCapUserMicros: number | null;
	budgetCapOrgMicros: number | null;
}> {
	const [[user], [org]] = await Promise.all([
		db()
			.select({ preferences: users.preferences })
			.from(users)
			.where(eq(users.id, User.UserId.make(userId)))
			.limit(1),
		db()
			.select({ settings: organizations.settings })
			.from(organizations)
			.where(eq(organizations.id, Organisation.OrganisationId.make(orgId)))
			.limit(1),
	]);

	return {
		budgetCapUserMicros: budgetToMicros(user?.preferences?.aiBudget),
		budgetCapOrgMicros: budgetToMicros(org?.settings?.aiBudget),
	};
}

export async function assertAiBudgetAvailable({
	orgId,
	userId,
}: {
	orgId: string;
	userId: string;
}): Promise<void> {
	const billingMonth = currentBillingMonth();
	const { budgetCapUserMicros, budgetCapOrgMicros } =
		await getAiBudgetCapsMicros({ orgId, userId });

	if (budgetCapUserMicros != null && budgetCapUserMicros > 0) {
		const userSpend = await getMonthlySpendMicros(
			"userId",
			userId,
			billingMonth,
		);
		if (userSpend >= budgetCapUserMicros) {
			throw new BudgetExceededError("user", userSpend, budgetCapUserMicros);
		}
	}

	if (budgetCapOrgMicros != null && budgetCapOrgMicros > 0) {
		const orgSpend = await getMonthlySpendMicros("orgId", orgId, billingMonth);
		if (orgSpend >= budgetCapOrgMicros) {
			throw new BudgetExceededError("org", orgSpend, budgetCapOrgMicros);
		}
	}
}

interface CostGuardOptions<T> {
	orgId: string;
	userId: string;
	videoId?: string;
	operation: AiOperation;
	model: string;
	budgetCapUserMicros?: number | null;
	budgetCapOrgMicros?: number | null;
	recordUsageBestEffort?: boolean;
	fn: () => Promise<T & { inputTokens: number; outputTokens: number }>;
}

export async function withCostGuard<T>(
	options: CostGuardOptions<T>,
): Promise<T & { inputTokens: number; outputTokens: number }> {
	const billingMonth = currentBillingMonth();
	const configuredCaps = await getAiBudgetCapsMicros({
		orgId: options.orgId,
		userId: options.userId,
	});
	const budgetCapUserMicros =
		options.budgetCapUserMicros ?? configuredCaps.budgetCapUserMicros;
	const budgetCapOrgMicros =
		options.budgetCapOrgMicros ?? configuredCaps.budgetCapOrgMicros;

	if (budgetCapUserMicros != null && budgetCapUserMicros > 0) {
		const userSpend = await getMonthlySpendMicros(
			"userId",
			options.userId,
			billingMonth,
		);
		if (userSpend >= budgetCapUserMicros) {
			throw new BudgetExceededError("user", userSpend, budgetCapUserMicros);
		}
	}

	if (budgetCapOrgMicros != null && budgetCapOrgMicros > 0) {
		const orgSpend = await getMonthlySpendMicros(
			"orgId",
			options.orgId,
			billingMonth,
		);
		if (orgSpend >= budgetCapOrgMicros) {
			throw new BudgetExceededError("org", orgSpend, budgetCapOrgMicros);
		}
	}

	const result = await options.fn();

	const costUsdMicros = priceForMicros(
		options.model,
		result.inputTokens,
		result.outputTokens,
	);

	try {
		await db()
		.insert(aiUsageEvents)
		.values({
			id: nanoId(),
			orgId: options.orgId as Organisation.OrganisationId,
			userId: options.userId as User.UserId,
			videoId: (options.videoId as Video.VideoId) ?? null,
			operation: options.operation,
			model: options.model,
			inputTokens: result.inputTokens,
			outputTokens: result.outputTokens,
			costUsdMicros,
			billingMonth,
		});

	// Check budget thresholds and create alerts
	if (budgetCapUserMicros != null && budgetCapUserMicros > 0) {
		const prevSpend = await getMonthlySpendMicros(
			"userId",
			options.userId,
			billingMonth,
		);
		const newSpend = prevSpend + costUsdMicros;

		const prevPct = (prevSpend / budgetCapUserMicros) * 100;
		const newPct = (newSpend / budgetCapUserMicros) * 100;

		// 100% threshold crossed
		if (prevPct < 100 && newPct >= 100) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (budgetCapUserMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] User ${options.userId}: AI budget exceeded — new AI operations blocked until next month or budget raise ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
		// 80% threshold crossed
		else if (prevPct < 80 && newPct >= 80) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (budgetCapUserMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] User ${options.userId}: AI spend at 80% of monthly budget ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
	}

	if (budgetCapOrgMicros != null && budgetCapOrgMicros > 0) {
		const prevSpend = await getMonthlySpendMicros(
			"orgId",
			options.orgId,
			billingMonth,
		);
		const newSpend = prevSpend + costUsdMicros;

		const prevPct = (prevSpend / budgetCapOrgMicros) * 100;
		const newPct = (newSpend / budgetCapOrgMicros) * 100;

		// 100% threshold crossed
		if (prevPct < 100 && newPct >= 100) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (budgetCapOrgMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] Org ${options.orgId}: AI budget exceeded — new AI operations blocked until next month or budget raise ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
		// 80% threshold crossed
		else if (prevPct < 80 && newPct >= 80) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (budgetCapOrgMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] Org ${options.orgId}: AI spend at 80% of monthly budget ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
	}

	} catch (error) {
		if (!options.recordUsageBestEffort) {
			throw error;
		}
		console.error("[ai-cost-guard] Failed to record AI usage:", error);
	}

	return result;
}
