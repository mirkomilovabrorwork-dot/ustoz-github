"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { sendEmail } from "@cap/database/emails/config";
import { OrganizationInvite } from "@cap/database/emails/organization-invite";
import { organizationInvites, organizations } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireOrganizationSettingsManager } from "./authorization";

export async function resendOrganizationInvite(inviteId: string) {
	const user = await getCurrentUser();
	if (!user) throw new Error("Unauthorized");

	const [invite] = await db()
		.select()
		.from(organizationInvites)
		.where(eq(organizationInvites.id, inviteId))
		.limit(1);

	if (!invite) throw new Error("Invite not found");
	if (invite.status !== "pending")
		throw new Error("Invite is no longer pending");

	await requireOrganizationSettingsManager(user.id, invite.organizationId);

	const [organization] = await db()
		.select()
		.from(organizations)
		.where(eq(organizations.id, invite.organizationId))
		.limit(1);

	if (!organization) throw new Error("Organization not found");

	const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

	await db()
		.update(organizationInvites)
		.set({ expiresAt: newExpiresAt })
		.where(
			and(
				eq(organizationInvites.id, inviteId),
				eq(organizationInvites.organizationId, invite.organizationId),
			),
		);

	const inviteUrl = `${serverEnv().WEB_URL}/invite/${invite.token ?? invite.id}`;

	await sendEmail({
		email: invite.invitedEmail,
		subject: `Invitation to join ${organization.name} on Cap`,
		react: OrganizationInvite({
			email: invite.invitedEmail,
			url: inviteUrl,
			organizationName: organization.name,
		}),
	});

	revalidatePath("/dashboard/settings/organization/members");

	return { success: true };
}
