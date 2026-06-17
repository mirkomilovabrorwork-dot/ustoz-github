"use server";

import crypto from "node:crypto";
import { db } from "@cap/database";
import { verificationTokens } from "@cap/database/schema";
import { and, eq } from "drizzle-orm";

export async function verifyOtp(
	email: string,
	code: string,
): Promise<{ success: boolean }> {
	const normalized = email.trim().toLowerCase();
	const hashedCode = crypto.createHash("sha256").update(code).digest("hex");

	const rows = await db()
		.select()
		.from(verificationTokens)
		.where(
			and(
				eq(verificationTokens.identifier, normalized),
				eq(verificationTokens.token, hashedCode),
			),
		)
		.limit(1);

	if (rows.length === 0) {
		throw new Error("Invalid or expired code");
	}

	const record = rows[0]!;

	if (record.expires < new Date()) {
		await db()
			.delete(verificationTokens)
			.where(eq(verificationTokens.identifier, normalized));
		throw new Error("Code expired");
	}

	await db()
		.delete(verificationTokens)
		.where(eq(verificationTokens.identifier, normalized));

	return { success: true };
}
