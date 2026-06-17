"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { users } from "@cap/database/schema";
import { eq } from "drizzle-orm";

export async function deleteGeminiKey(): Promise<
	{ success: true } | { success: false; error: string }
> {
	const user = await getCurrentUser();
	if (!user) return { success: false, error: "Not authenticated" };

	await db()
		.update(users)
		.set({ geminiApiKey: null })
		.where(eq(users.id, user.id));

	return { success: true };
}
