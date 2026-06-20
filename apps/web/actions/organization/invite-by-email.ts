"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoId, nanoIdToken } from "@cap/database/helpers";
import {
	organizationInvites,
	organizationMembers,
	users,
} from "@cap/database/schema";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type InviteInput = {
	email: string;
	name?: string;
	role: "admin" | "member";
};

export async function inviteByEmail({ email, role }: InviteInput) {
	const me = await getCurrentUser();
	if (!me?.id) throw new Error("Unauthorized");

	const orgId = me.activeOrganizationId;
	if (!orgId) throw new Error("No active organization");

	const [myMembership] = await db()
		.select({ role: organizationMembers.role })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.userId, me.id),
				eq(organizationMembers.organizationId, orgId),
			),
		)
		.limit(1);

	if (
		!myMembership ||
		(myMembership.role !== "owner" && myMembership.role !== "admin")
	) {
		throw new Error("Only owners and admins can invite members");
	}

	const normalized = email.trim().toLowerCase();
	if (!normalized.includes("@")) throw new Error("Invalid email");

	await db()
		.delete(organizationInvites)
		.where(
			and(
				eq(organizationInvites.organizationId, orgId),
				eq(organizationInvites.invitedEmail, normalized),
				eq(organizationInvites.status, "pending"),
			),
		);

	const [existing] = await db()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalized))
		.limit(1);

	if (!existing) {
		await db().insert(organizationInvites).values({
			id: nanoId(),
			token: nanoIdToken(),
			organizationId: orgId,
			invitedEmail: normalized,
			invitedByUserId: me.id,
			role,
			status: "pending",
		});

		revalidatePath("/dashboard/settings/organization/members");
		return { email: normalized };
	}

	const [alreadyMember] = await db()
		.select({ id: organizationMembers.id })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.userId, existing.id),
				eq(organizationMembers.organizationId, orgId),
			),
		)
		.limit(1);

	if (!alreadyMember) {
		await db().insert(organizationMembers).values({
			id: nanoId(),
			userId: existing.id,
			organizationId: orgId,
			role,
		});
	}

	revalidatePath("/dashboard/settings/organization/members");
	return { userId: existing.id, email: normalized };
}
