"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { organizations, users } from "@cap/database/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireOrganizationSettingsManager } from "@/actions/organization/authorization";

export async function saveAiBudget(params: {
	scope: "user" | "org";
	monthlyUsdCents: number;
	alertAtPct: number;
	enabled: boolean;
}): Promise<{ success: boolean }> {
	const { scope, monthlyUsdCents, alertAtPct, enabled } = params;

	if (monthlyUsdCents < 0 || alertAtPct < 0) {
		throw new Error("Budget values must be non-negative");
	}

	const user = await getCurrentUser();
	if (!user) {
		throw new Error("Unauthorized");
	}

	if (scope === "user") {
		await db()
			.update(users)
			.set({
				preferences: {
					...(user.preferences ?? {}),
					aiBudget: { monthlyUsdCents, alertAtPct, enabled },
				},
			})
			.where(eq(users.id, user.id));

		revalidatePath("/dashboard/settings/account");
		return { success: true };
	}

	if (!user.activeOrganizationId) {
		throw new Error("No active organization");
	}

	await requireOrganizationSettingsManager(user.id, user.activeOrganizationId);

	const [org] = await db()
		.select({ settings: organizations.settings })
		.from(organizations)
		.where(eq(organizations.id, user.activeOrganizationId))
		.limit(1);

	if (!org) {
		throw new Error("Organization not found");
	}

	await db()
		.update(organizations)
		.set({
			settings: {
				...(org.settings ?? {}),
				aiBudget: { monthlyUsdCents, alertAtPct, enabled },
			},
		})
		.where(eq(organizations.id, user.activeOrganizationId));

	revalidatePath("/dashboard/settings/organization");
	return { success: true };
}
