"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { users } from "@cap/database/schema";
import { eq } from "drizzle-orm";
import { isAdminEmail } from "@/lib/dev-mode";

export async function toggleDevMode(): Promise<
	{ success: true; devModeEnabled: boolean } | { success: false; error: string }
> {
	const user = await getCurrentUser();
	if (!user) return { success: false, error: "Not authenticated" };

	if (!isAdminEmail(user.email)) {
		return { success: false, error: "Not authorized" };
	}

	const [row] = await db()
		.select({ preferences: users.preferences })
		.from(users)
		.where(eq(users.id, user.id))
		.limit(1);

	const current = (row?.preferences as Record<string, unknown> | null) ?? {};
	const next = !current.devModeEnabled;

	await db()
		.update(users)
		.set({
			preferences: {
				...current,
				devModeEnabled: next,
			} as typeof users.$inferSelect.preferences,
		})
		.where(eq(users.id, user.id));

	return { success: true, devModeEnabled: next };
}
