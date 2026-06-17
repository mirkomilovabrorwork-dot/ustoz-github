"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { users } from "@cap/database/schema";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { locales } from "@/i18n/locales";

export async function setLanguage(locale: string): Promise<{ success: true }> {
	if (!(locales as readonly string[]).includes(locale)) {
		throw new Error(`Invalid locale: ${locale}`);
	}

	(await cookies()).set("NEXT_LOCALE", locale, {
		maxAge: 365 * 24 * 60 * 60,
		path: "/",
		sameSite: "lax",
	});

	const user = await getCurrentUser();
	if (user) {
		const [row] = await db()
			.select({ preferences: users.preferences })
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);

		const current = (row?.preferences as Record<string, unknown> | null) ?? {};

		await db()
			.update(users)
			.set({
				preferences: {
					...current,
					locale,
				} as typeof users.$inferSelect.preferences,
			})
			.where(eq(users.id, user.id));
	}

	return { success: true };
}
