import { db } from "@cap/database";
import { authApiKeys, users } from "@cap/database/schema";
import { hashAuthApiKey } from "@cap/web-backend";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
	const bearer = request.headers.get("authorization")?.split(" ")[1];

	if (!bearer) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const id = bearer.startsWith("cak_")
		? await hashAuthApiKey(bearer)
		: bearer.length === 36
			? bearer
			: null;

	if (!id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const res = await db()
		.select()
		.from(users)
		.leftJoin(authApiKeys, eq(users.id, authApiKeys.userId))
		.where(eq(authApiKeys.id, id));

	const user = res[0]?.users;

	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return NextResponse.json({ email: user.email });
}
