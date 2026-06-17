import { db } from "@cap/database";
import { authApiKeys, users } from "@cap/database/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
	const bearer = request.headers.get("authorization")?.split(" ")[1];

	if (!bearer || bearer.length !== 36) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const res = await db()
		.select()
		.from(users)
		.leftJoin(authApiKeys, eq(users.id, authApiKeys.userId))
		.where(eq(authApiKeys.id, bearer));

	const user = res[0]?.users;

	if (!user) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	return NextResponse.json({ email: user.email });
}
