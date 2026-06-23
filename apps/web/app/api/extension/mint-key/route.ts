import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { authApiKeys } from "@cap/database/schema";
import { hashAuthApiKey } from "@cap/web-backend";
import { and, desc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";

const EXTENSION_API_KEY_PURPOSE = "extension";
// Keep up to this many extension keys per user. Signing in ADDS a key instead
// of replacing the old one, so a token already saved in the extension keeps
// working (one sign-in lasts). Older keys beyond this cap are pruned.
const MAX_EXTENSION_KEYS = 5;

function createAuthApiKeyToken() {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return `cak_${Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
}

export async function POST() {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const token = createAuthApiKeyToken();
	const id = await hashAuthApiKey(token);

	await db().transaction(async (tx) => {
		// Add the new key WITHOUT deleting existing ones, so any token already
		// stored in the extension stays valid — re-signing-in is never required.
		await tx
			.insert(authApiKeys)
			.values({ id, userId: user.id, purpose: EXTENSION_API_KEY_PURPOSE });

		// Bound growth: keep only the newest MAX_EXTENSION_KEYS extension keys,
		// pruning older ones. The just-minted key is never pruned.
		const existing = await tx
			.select({ id: authApiKeys.id })
			.from(authApiKeys)
			.where(
				and(
					eq(authApiKeys.userId, user.id),
					eq(authApiKeys.purpose, EXTENSION_API_KEY_PURPOSE),
				),
			)
			.orderBy(desc(authApiKeys.createdAt));

		const stale = existing
			.slice(MAX_EXTENSION_KEYS)
			.map((row) => row.id)
			.filter((rowId) => rowId !== id);
		if (stale.length > 0) {
			await tx.delete(authApiKeys).where(inArray(authApiKeys.id, stale));
		}
	});

	return NextResponse.json({ token, email: user.email });
}
