"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoId } from "@cap/database/helpers";
import { organizationMembers, users } from "@cap/database/schema";
import type { User } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type InviteInput = {
	email: string;
	name?: string;
	role: "admin" | "member";
};

export async function inviteMember({ email, name, role }: InviteInput) {
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

	const [existing] = await db()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalized))
		.limit(1);

	const userId: User.UserId = existing?.id ?? (nanoId() as User.UserId);
	if (!existing) {
		await db()
			.insert(users)
			.values({
				id: userId,
				email: normalized,
				name: name ?? normalized.split("@")[0],
				emailVerified: new Date(),
				activeOrganizationId: orgId,
				defaultOrgId: orgId,
				inviteQuota: 1,
			});
	}

	const [alreadyMember] = await db()
		.select({ id: organizationMembers.id })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.userId, userId),
				eq(organizationMembers.organizationId, orgId),
			),
		)
		.limit(1);

	if (!alreadyMember) {
		await db().insert(organizationMembers).values({
			id: nanoId(),
			userId,
			organizationId: orgId,
			role,
		});
	}

	revalidatePath("/dashboard/settings/organization/members");
	return { userId, email: normalized };
}
