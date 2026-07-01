"use server";

import bcrypt from "bcryptjs";
import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { users } from "@cap/database/schema";
import { eq } from "drizzle-orm";

type ResetPasswordResult = { success: true } | { success: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function resetUserPassword(
	email: string,
	newPassword: string,
): Promise<ResetPasswordResult> {
	const admin = await getCurrentUser();
	if (!admin?.isAdmin) {
		return { success: false, error: "Not authorized" };
	}

	const normalizedEmail = email.trim().toLowerCase();

	if (!EMAIL_REGEX.test(normalizedEmail)) {
		return { success: false, error: "Please enter a valid email address." };
	}

	if (!newPassword || newPassword.length < 8) {
		return {
			success: false,
			error: "Password must be at least 8 characters.",
		};
	}

	try {
		const [target] = await db()
			.select({ id: users.id })
			.from(users)
			.where(eq(users.email, normalizedEmail))
			.limit(1);

		if (!target) {
			return { success: false, error: "User not found" };
		}

		const passwordHash = await bcrypt.hash(newPassword, 10);

		await db()
			.update(users)
			.set({ passwordHash })
			.where(eq(users.id, target.id));

		return { success: true };
	} catch (error) {
		console.error("[resetUserPassword] Failed to reset password", error);
		return { success: false, error: "Failed to reset password" };
	}
}
