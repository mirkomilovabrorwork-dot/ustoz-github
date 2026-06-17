import type { Metadata } from "next";
import type { OrganizationRole } from "@/lib/permissions/roles";
import {
	canManageOrganizationBilling,
	canManageOrganizationMembers,
	canManageOrganizationSettings,
	canManageSpace,
	canViewOrganizationSettings,
} from "@/lib/permissions/roles";

export const metadata: Metadata = {
	title: "Roles & Permissions — data365",
};

const ROLES: OrganizationRole[] = ["owner", "admin", "member"];

const ROLE_LABELS: Record<OrganizationRole, string> = {
	owner: "Owner",
	admin: "Admin",
	member: "Member",
};

const PERMISSIONS = [
	{
		key: "canViewSettings",
		label: "View organization settings",
		check: (role: OrganizationRole) => canViewOrganizationSettings(role),
	},
	{
		key: "canManageSettings",
		label: "Manage organization settings",
		check: (role: OrganizationRole) => canManageOrganizationSettings(role),
	},
	{
		key: "canManageMembers",
		label: "Manage members",
		check: (role: OrganizationRole) => canManageOrganizationMembers(role),
	},
	{
		key: "canInviteMembers",
		label: "Invite members",
		check: (role: OrganizationRole) => canManageOrganizationMembers(role),
	},
	{
		key: "canManageSpaces",
		label: "Manage spaces",
		check: (role: OrganizationRole) =>
			canManageSpace({ organizationRole: role, spaceRole: null }),
	},
	{
		key: "canManageBilling",
		label: "Manage billing",
		check: (role: OrganizationRole) => canManageOrganizationBilling(role),
	},
] as const;

export default function PermissionsPage() {
	return (
		<div className="flex flex-col gap-6">
			<div className="flex flex-col gap-1">
				<h2 className="text-lg font-semibold text-gray-12">
					Roles & Permissions
				</h2>
				<p className="text-sm text-gray-10">
					Built-in roles and their capabilities. Contact support to request
					custom roles.
				</p>
			</div>
			<div className="border border-gray-4 rounded-xl overflow-hidden">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-gray-4 bg-gray-2">
							<th className="text-left px-4 py-3 font-medium text-gray-11 w-1/2">
								Capability
							</th>
							{ROLES.map((role) => (
								<th
									key={role}
									className="text-center px-4 py-3 font-medium text-gray-11"
								>
									{ROLE_LABELS[role]}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{PERMISSIONS.map((permission, index) => (
							<tr
								key={permission.key}
								className={
									index < PERMISSIONS.length - 1
										? "border-b border-gray-4"
										: undefined
								}
							>
								<td className="px-4 py-3 text-gray-12">{permission.label}</td>
								{ROLES.map((role) => (
									<td key={role} className="px-4 py-3 text-center">
										{permission.check(role) ? (
											<span
												role="img"
												aria-label="Allowed"
												className="text-green-500"
											>
												✓
											</span>
										) : (
											<span
												role="img"
												aria-label="Not allowed"
												className="text-gray-6"
											>
												—
											</span>
										)}
									</td>
								))}
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
