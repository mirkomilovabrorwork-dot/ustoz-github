import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import {
	organizationInvites,
	organizationMembers,
	organizations,
	users,
} from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { InviteMemberForm } from "./InviteMemberForm";
import { MembersTable } from "./MembersTable";

export default async function MembersPage() {
	const me = await getCurrentUser();
	if (!me?.id || !me.activeOrganizationId) redirect("/login");

	const orgId = me.activeOrganizationId;

	const [members, pendingInvites, orgRows] = await Promise.all([
		db()
			.select({
				memberId: organizationMembers.id,
				userId: users.id,
				email: users.email,
				name: users.name,
				role: organizationMembers.role,
				joinedAt: organizationMembers.createdAt,
			})
			.from(organizationMembers)
			.innerJoin(users, eq(organizationMembers.userId, users.id))
			.where(eq(organizationMembers.organizationId, orgId)),
		db()
			.select({
				id: organizationInvites.id,
				invitedEmail: organizationInvites.invitedEmail,
				role: organizationInvites.role,
				createdAt: organizationInvites.createdAt,
				token: organizationInvites.token,
			})
			.from(organizationInvites)
			.where(
				and(
					eq(organizationInvites.organizationId, orgId),
					eq(organizationInvites.status, "pending"),
				),
			),
		db()
			.select({ ownerId: organizations.ownerId })
			.from(organizations)
			.where(eq(organizations.id, orgId))
			.limit(1),
	]);

	const ownerId = orgRows[0]?.ownerId ?? null;
	const baseUrl = serverEnv().WEB_URL ?? "http://localhost:3000";

	const invitesWithLinks = pendingInvites.map((invite) => ({
		...invite,
		inviteUrl: invite.token
			? `${baseUrl}/invite/${invite.token}`
			: `${baseUrl}/invite/${invite.id}`,
	}));

	return (
		<div className="p-6 space-y-8">
			<h1 className="text-2xl font-semibold">Team Members</h1>
			<InviteMemberForm />
			<MembersTable
				members={members}
				pendingInvites={invitesWithLinks}
				currentUserId={me.id}
				ownerId={ownerId}
				organizationId={orgId}
			/>
		</div>
	);
}
