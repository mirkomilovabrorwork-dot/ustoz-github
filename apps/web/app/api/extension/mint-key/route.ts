import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { authApiKeys } from "@cap/database/schema";
import { hashAuthApiKey } from "@cap/web-backend";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

const EXTENSION_API_KEY_PURPOSE = "extension";

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
		await tx
			.delete(authApiKeys)
			.where(
				and(
					eq(authApiKeys.userId, user.id),
					eq(authApiKeys.purpose, EXTENSION_API_KEY_PURPOSE),
				),
			);
		await tx
			.insert(authApiKeys)
			.values({ id, userId: user.id, purpose: EXTENSION_API_KEY_PURPOSE });
	});

	return NextResponse.json({ token, email: user.email });
}
