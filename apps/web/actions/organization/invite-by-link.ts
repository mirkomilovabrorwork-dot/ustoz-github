"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoId, nanoIdToken } from "@cap/database/helpers";
import { organizationInvites, organizationMembers } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type LinkInput = {
	email: string;
	role: "admin" | "member";
	expiresInHours?: number;
};

export async function createInviteLink({
	email,
	role,
	expiresInHours = 72,
}: LinkInput) {
	const me = await getCurrentUser();
	if (!me?.id || !me.activeOrganizationId) throw new Error("Unauthorized");

	const [myMembership] = await db()
		.select({ role: organizationMembers.role })
		.from(organizationMembers)
		.where(
			and(
				eq(organizationMembers.userId, me.id),
				eq(organizationMembers.organizationId, me.activeOrganizationId),
			),
		)
		.limit(1);

	if (
		!myMembership ||
		(myMembership.role !== "owner" && myMembership.role !== "admin")
	) {
		throw new Error("Only owners and admins can create invites");
	}

	const normalized = email.trim().toLowerCase();
	if (!normalized.includes("@")) throw new Error("Invalid email");

	const [existingInvite] = await db()
		.select({ id: organizationInvites.id })
		.from(organizationInvites)
		.where(
			and(
				eq(organizationInvites.organizationId, me.activeOrganizationId),
				eq(organizationInvites.invitedEmail, normalized),
				eq(organizationInvites.status, "pending"),
			),
		)
		.limit(1);

	if (existingInvite) {
		throw new Error(
			"An invite for this email is already pending. Resend it from the members page instead.",
		);
	}

	const token = nanoIdToken();
	const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

	await db().insert(organizationInvites).values({
		id: nanoId(),
		organizationId: me.activeOrganizationId,
		invitedEmail: normalized,
		invitedByUserId: me.id,
		role,
		token,
		expiresAt,
		status: "pending",
	});

	revalidatePath("/dashboard/settings/organization/members");

	const baseUrl = serverEnv().WEB_URL ?? "http://localhost:3000";
	return { url: `${baseUrl}/invite/${token}`, expiresAt };
}
