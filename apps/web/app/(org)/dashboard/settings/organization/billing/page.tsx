"use client";

import { buildEnv } from "@cap/env";
import { Card, CardDescription, CardHeader, CardTitle } from "@cap/ui";
import Link from "next/link";
import { useDashboardContext } from "@/app/(org)/dashboard/Contexts";
import {
	canManageOrganizationBilling,
	getEffectiveOrganizationRole,
} from "@/lib/permissions/roles";
import { BillingSummaryCard } from "../components/BillingSummaryCard";
import { SeatManagementCard } from "../components/SeatManagementCard";

export default function BillingAndMembersPage() {
	const { activeOrganization, user } = useDashboardContext();
	const currentMember = activeOrganization?.members.find(
		(member) => member.userId === user.id,
	);
	const currentRole = getEffectiveOrganizationRole({
		userId: user.id,
		ownerId: activeOrganization?.organization.ownerId,
		memberRole: currentMember?.role,
	});
	const canManageBilling = canManageOrganizationBilling(currentRole);

	return (
		<div className="flex flex-col gap-6">
			{buildEnv.NEXT_PUBLIC_IS_CAP &&
				(canManageBilling ? (
					<>
						<BillingSummaryCard />
						<SeatManagementCard />
					</>
				) : (
					<Card>
						<CardHeader>
							<CardTitle>Billing</CardTitle>
							<CardDescription>
								Billing is managed by the organization owner.
							</CardDescription>
						</CardHeader>
					</Card>
				))}
			<Card>
				<CardHeader>
					<CardTitle>Members</CardTitle>
					<CardDescription>
						Member and invite management has moved to the{" "}
						<Link
							href="/dashboard/settings/organization/members"
							className="underline"
						>
							Members tab
						</Link>
						.
					</CardDescription>
				</CardHeader>
			</Card>
		</div>
	);
}
