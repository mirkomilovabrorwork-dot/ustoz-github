import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { authApiKeys } from "@cap/database/schema";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function POST() {
	const user = await getCurrentUser();
	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const existing = await db()
		.select({ id: authApiKeys.id })
		.from(authApiKeys)
		.where(eq(authApiKeys.userId, user.id))
		.orderBy(desc(authApiKeys.createdAt))
		.limit(1);

	if (existing.length > 0) {
		return NextResponse.json({
			token: existing[0].id,
			email: user.email,
		});
	}

	const id = crypto.randomUUID();
	await db().insert(authApiKeys).values({ id, userId: user.id });

	return NextResponse.json({ token: id, email: user.email });
}
