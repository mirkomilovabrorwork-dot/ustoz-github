import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import { type AiOperation, aiUsageEvents } from "@cap/database/schema";
import { priceForMicros } from "@cap/utils";
import type { Organisation, User, Video } from "@cap/web-domain";
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
	const col = column === "orgId" ? aiUsageEvents.orgId : aiUsageEvents.userId;

	const [result] = await db()
		.select({
			total: sql<number>`COALESCE(SUM(${aiUsageEvents.costUsdMicros}), 0)`,
		})
		.from(aiUsageEvents)
		.where(and(eq(col, id), eq(aiUsageEvents.billingMonth, billingMonth)));

	return result?.total ?? 0;
}

interface CostGuardOptions<T> {
	orgId: string;
	userId: string;
	videoId?: string;
	operation: AiOperation;
	model: string;
	budgetCapUserMicros?: number | null;
	budgetCapOrgMicros?: number | null;
	fn: () => Promise<T & { inputTokens: number; outputTokens: number }>;
}

export async function withCostGuard<T>(
	options: CostGuardOptions<T>,
): Promise<T & { inputTokens: number; outputTokens: number }> {
	const billingMonth = currentBillingMonth();

	if (options.budgetCapUserMicros != null && options.budgetCapUserMicros > 0) {
		const userSpend = await getMonthlySpendMicros(
			"userId",
			options.userId,
			billingMonth,
		);
		if (userSpend >= options.budgetCapUserMicros) {
			throw new BudgetExceededError(
				"user",
				userSpend,
				options.budgetCapUserMicros,
			);
		}
	}

	if (options.budgetCapOrgMicros != null && options.budgetCapOrgMicros > 0) {
		const orgSpend = await getMonthlySpendMicros(
			"orgId",
			options.orgId,
			billingMonth,
		);
		if (orgSpend >= options.budgetCapOrgMicros) {
			throw new BudgetExceededError(
				"org",
				orgSpend,
				options.budgetCapOrgMicros,
			);
		}
	}

	const result = await options.fn();

	const costUsdMicros = priceForMicros(
		options.model,
		result.inputTokens,
		result.outputTokens,
	);

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
	if (options.budgetCapUserMicros != null && options.budgetCapUserMicros > 0) {
		const prevSpend = await getMonthlySpendMicros(
			"userId",
			options.userId,
			billingMonth,
		);
		const newSpend = prevSpend + costUsdMicros;

		const prevPct = (prevSpend / options.budgetCapUserMicros) * 100;
		const newPct = (newSpend / options.budgetCapUserMicros) * 100;

		// 100% threshold crossed
		if (prevPct < 100 && newPct >= 100) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (options.budgetCapUserMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] User ${options.userId}: AI budget exceeded — new AI operations blocked until next month or budget raise ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
		// 80% threshold crossed
		else if (prevPct < 80 && newPct >= 80) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (options.budgetCapUserMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] User ${options.userId}: AI spend at 80% of monthly budget ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
	}

	if (options.budgetCapOrgMicros != null && options.budgetCapOrgMicros > 0) {
		const prevSpend = await getMonthlySpendMicros(
			"orgId",
			options.orgId,
			billingMonth,
		);
		const newSpend = prevSpend + costUsdMicros;

		const prevPct = (prevSpend / options.budgetCapOrgMicros) * 100;
		const newPct = (newSpend / options.budgetCapOrgMicros) * 100;

		// 100% threshold crossed
		if (prevPct < 100 && newPct >= 100) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (options.budgetCapOrgMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] Org ${options.orgId}: AI budget exceeded — new AI operations blocked until next month or budget raise ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
		// 80% threshold crossed
		else if (prevPct < 80 && newPct >= 80) {
			const amountFormatted = (newSpend / 1_000_000).toFixed(2);
			const budgetFormatted = (options.budgetCapOrgMicros / 1_000_000).toFixed(
				2,
			);
			console.log(
				`[BUDGET_ALERT] Org ${options.orgId}: AI spend at 80% of monthly budget ($${amountFormatted} of $${budgetFormatted})`,
			);
		}
	}

	return result;
}
