"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { encrypt } from "@cap/database/crypto";
import { users } from "@cap/database/schema";
import { eq } from "drizzle-orm";

export async function saveGeminiKey(
	key: string,
): Promise<{ success: true } | { success: false; error: string }> {
	const user = await getCurrentUser();
	if (!user) return { success: false, error: "Not authenticated" };

	if (!/^AIza[A-Za-z0-9_-]{35}$/.test(key)) {
		return {
			success: false,
			error:
				"Invalid key format. Gemini API keys start with AIza and are 39 characters.",
		};
	}

	const encrypted = await encrypt(key);

	await db()
		.update(users)
		.set({ geminiApiKey: encrypted })
		.where(eq(users.id, user.id));

	return { success: true };
}
