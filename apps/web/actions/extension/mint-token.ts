"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { authApiKeys } from "@cap/database/schema";
import { hashAuthApiKey } from "@cap/web-backend";
import { eq, sql } from "drizzle-orm";

function createAuthApiKeyToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return `cak_${Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

export async function mintExtensionToken() {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");

	const [row] = await db()
		.select({ count: sql<number>`count(*)` })
		.from(authApiKeys)
		.where(eq(authApiKeys.userId, user.id));

	if (row && row.count >= 5) {
		throw new Error(
			"You've reached the limit of 5 extension keys. Revoke one from Settings → API Keys to mint a new one.",
		);
	}

	const token = createAuthApiKeyToken();
	const id = await hashAuthApiKey(token);
	await db().insert(authApiKeys).values({ id, userId: user.id });

	return { token, email: user.email };
}
