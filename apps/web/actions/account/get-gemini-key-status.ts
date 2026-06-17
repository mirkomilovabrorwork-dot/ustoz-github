"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { decrypt } from "@cap/database/crypto";
import { users } from "@cap/database/schema";
import { eq } from "drizzle-orm";

export async function getGeminiKeyStatus(): Promise<{
	hasKey: boolean;
	lastFour: string;
}> {
	const user = await getCurrentUser();
	if (!user) return { hasKey: false, lastFour: "" };

	const [row] = await db()
		.select({ geminiApiKey: users.geminiApiKey })
		.from(users)
		.where(eq(users.id, user.id));

	if (!row?.geminiApiKey) return { hasKey: false, lastFour: "" };

	try {
		const decrypted = await decrypt(row.geminiApiKey);
		return { hasKey: true, lastFour: decrypted.slice(-4) };
	} catch {
		return { hasKey: true, lastFour: "????" };
	}
}
