"use client";

import { Button } from "@cap/ui";
import { formatPlatformDate } from "@cap/utils";
import type { Organisation } from "@cap/web-domain";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { removeOrganizationInvite } from "@/actions/organization/remove-invite";
import { removeOrganizationMember } from "@/actions/organization/remove-member";
import { resendOrganizationInvite } from "@/actions/organization/resend-invite";
import { updateOrganizationMemberRole } from "@/actions/organization/update-member-role";

type Member = {
	memberId: string;
	userId: string;
	email: string | null;
	name: string | null;
	role: string;
	joinedAt: Date;
};

type PendingInvite = {
	id: string;
	invitedEmail: string;
	role: string;
	createdAt: Date;
	token: string | null;
	inviteUrl: string;
};

interface MembersTableProps {
	members: Member[];
	pendingInvites: PendingInvite[];
	currentUserId: string;
	ownerId: string | null;
	organizationId: Organisation.OrganisationId;
}

export function MembersTable({
	members,
	pendingInvites,
	currentUserId,
	ownerId,
	organizationId,
}: MembersTableProps) {
	const router = useRouter();
	const [actionInFlight, setActionInFlight] = useState<string | null>(null);

	const removeMemberMutation = useMutation({
		mutationFn: (memberId: string) => {
			setActionInFlight(memberId);
			return removeOrganizationMember(memberId, organizationId);
		},
		onSuccess: () => {
			toast.success("Member removed");
			setActionInFlight(null);
			router.refresh();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to remove member",
			);
			setActionInFlight(null);
		},
	});

	const revokeInviteMutation = useMutation({
		mutationFn: (inviteId: string) => {
			setActionInFlight(inviteId);
			return removeOrganizationInvite(inviteId, organizationId);
		},
		onSuccess: () => {
			toast.success("Invite revoked");
			setActionInFlight(null);
			router.refresh();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to revoke invite",
			);
			setActionInFlight(null);
		},
	});

	const updateRoleMutation = useMutation({
		mutationFn: ({ memberId, role }: { memberId: string; role: string }) => {
			setActionInFlight(`role-${memberId}`);
			return updateOrganizationMemberRole(memberId, organizationId, role);
		},
		onSuccess: () => {
			toast.success("Role updated");
			setActionInFlight(null);
			router.refresh();
		},
		onError: (err) => {
			toast.error(err instanceof Error ? err.message : "Failed to update role");
			setActionInFlight(null);
		},
	});

	const resendInviteMutation = useMutation({
		mutationFn: (inviteId: string) => {
			setActionInFlight(`resend-${inviteId}`);
			return resendOrganizationInvite(inviteId);
		},
		onSuccess: () => {
			toast.success("Invite resent — expires in 7 days");
			setActionInFlight(null);
			router.refresh();
		},
		onError: (err) => {
			toast.error(
				err instanceof Error ? err.message : "Failed to resend invite",
			);
			setActionInFlight(null);
		},
	});

	if (members.length === 0 && pendingInvites.length === 0) {
		return (
			<div className="flex flex-col items-center gap-3 py-12 text-center border border-gray-4 rounded-lg">
				<div className="flex items-center justify-center size-12 rounded-full bg-gray-2">
					<svg
						className="size-6 text-gray-9"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						aria-hidden="true"
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth={1.5}
							d="M17 20h5v-2a4 4 0 00-5.356-3.712M9 20H4v-2a4 4 0 015.356-3.712M15 7a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0z"
						/>
					</svg>
				</div>
				<div>
					<p className="text-sm font-medium text-gray-12">No members yet</p>
					<p className="text-xs text-gray-10 mt-0.5">
						Use the form above to invite someone to your organization.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-8">
			<section>
				<h2 className="text-lg font-medium mb-3 text-gray-12">Current Members</h2>
				<div className="border border-gray-4 rounded divide-y divide-gray-4">
					{members.map((m) => {
						const isOwner = m.userId === ownerId;
						const isMe = m.userId === currentUserId;
						return (
							<div
								key={m.memberId}
								className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between"
							>
								<div>
									<div className="font-medium text-gray-12">{m.name ?? m.email}</div>
									<div className="text-sm text-gray-10">{m.email}</div>
								</div>
								<div className="flex flex-wrap items-center gap-3">
									{isOwner || isMe ? (
										<span className="text-sm text-gray-10 capitalize">
											{isOwner ? "Owner" : m.role}
										</span>
									) : (
										<select
											className="text-sm text-gray-12 capitalize bg-gray-1 border border-gray-4 rounded px-2 py-1"
											value={m.role}
											disabled={actionInFlight === `role-${m.memberId}`}
											onChange={(e) =>
												updateRoleMutation.mutate({
													memberId: m.memberId,
													role: e.target.value,
												})
											}
										>
											<option value="admin">Admin</option>
											<option value="member">Member</option>
										</select>
									)}
									<span className="hidden text-xs text-gray-10 sm:inline">
										{formatPlatformDate(m.joinedAt)}
									</span>
									{!isOwner && !isMe && (
										<Button
											type="button"
											size="xs"
											variant="destructive"
											disabled={actionInFlight === m.memberId}
											onClick={() => removeMemberMutation.mutate(m.memberId)}
										>
											{actionInFlight === m.memberId ? "Removing..." : "Remove"}
										</Button>
									)}
								</div>
							</div>
						);
					})}
				</div>
			</section>

			{pendingInvites.length > 0 && (
				<section>
					<h2 className="text-lg font-medium mb-3 text-gray-12">Pending Invites</h2>
					<div className="border border-gray-4 rounded divide-y divide-gray-4">
						{pendingInvites.map((invite) => (
							<div
								key={invite.id}
								className="flex items-center justify-between p-3"
							>
								<div>
									<div className="font-medium text-gray-12">{invite.invitedEmail}</div>
									<div className="text-xs text-gray-10">
										Invited {formatPlatformDate(invite.createdAt)} ·{" "}
										{invite.role}
									</div>
								</div>
								<div className="flex flex-wrap items-center gap-2">
									<Button
										type="button"
										size="xs"
										variant="gray"
										onClick={() => {
											navigator.clipboard.writeText(invite.inviteUrl);
											toast.success("Invite link copied");
										}}
									>
										Copy link
									</Button>
									<Button
										type="button"
										size="xs"
										variant="gray"
										disabled={actionInFlight === `resend-${invite.id}`}
										onClick={() => resendInviteMutation.mutate(invite.id)}
									>
										{actionInFlight === `resend-${invite.id}`
											? "Sending..."
											: "Resend"}
									</Button>
									<Button
										type="button"
										size="xs"
										variant="destructive"
										disabled={actionInFlight === invite.id}
										onClick={() => revokeInviteMutation.mutate(invite.id)}
									>
										{actionInFlight === invite.id ? "Revoking..." : "Revoke"}
									</Button>
								</div>
							</div>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
