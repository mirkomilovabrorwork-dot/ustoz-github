"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { authApiKeys } from "@cap/database/schema";
import { eq, sql } from "drizzle-orm";

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

	const id = crypto.randomUUID();
	await db().insert(authApiKeys).values({ id, userId: user.id });

	return { token: id, email: user.email };
}
