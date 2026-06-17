"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import {
	accounts,
	organizationMembers,
	organizations,
	sessions,
	users,
} from "@cap/database/schema";
import { eq } from "drizzle-orm";

export async function deleteAccount(): Promise<
	{ ok: true } | { ok: false; error: string }
> {
	const user = await getCurrentUser();
	if (!user) return { ok: false, error: "Not authenticated" };

	const ownedOrgs = await db()
		.select({ id: organizations.id, name: organizations.name })
		.from(organizations)
		.where(eq(organizations.ownerId, user.id));

	if (ownedOrgs.length > 0) {
		return {
			ok: false,
			error: `You own ${ownedOrgs.length} organization(s). Transfer ownership or delete them before deleting your account.`,
		};
	}

	await db().transaction(async (tx) => {
		await tx
			.delete(organizationMembers)
			.where(eq(organizationMembers.userId, user.id));
		await tx.delete(sessions).where(eq(sessions.userId, user.id));
		await tx.delete(accounts).where(eq(accounts.userId, user.id));
		await tx.delete(users).where(eq(users.id, user.id));
	});

	return { ok: true };
}
