"use server";

import crypto from "node:crypto";
import { db } from "@cap/database";
import { verificationTokens } from "@cap/database/schema";
import { and, eq, gt, sql } from "drizzle-orm";

export async function requestOtp(email: string): Promise<{ success: boolean }> {
	const normalized = email.trim().toLowerCase();

	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
		throw new Error("Invalid email address");
	}

	const recent = await db()
		.select({ identifier: verificationTokens.identifier })
		.from(verificationTokens)
		.where(
			and(
				eq(verificationTokens.identifier, normalized),
				gt(verificationTokens.created_at, sql`NOW() - INTERVAL 30 SECOND`),
			),
		)
		.limit(1);

	if (recent.length > 0) {
		throw new Error("Please wait before requesting a new code.");
	}

	const code = Math.floor(100000 + Math.random() * 900000).toString();
	const hashedCode = crypto.createHash("sha256").update(code).digest("hex");

	await db()
		.delete(verificationTokens)
		.where(eq(verificationTokens.identifier, normalized));

	await db()
		.insert(verificationTokens)
		.values({
			identifier: normalized,
			token: hashedCode,
			expires: new Date(Date.now() + 10 * 60 * 1000),
		});

	console.log(`[OTP] code for ${normalized}: ${code}`);

	return { success: true };
}
