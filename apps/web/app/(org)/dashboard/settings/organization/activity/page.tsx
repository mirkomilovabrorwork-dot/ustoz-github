import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { auditLog, users } from "@cap/database/schema";
import { formatPlatformDateTime } from "@cap/utils";
import { and, desc, eq, isNotNull, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrganizationAccess } from "@/actions/organization/authorization";
import { canViewOrganizationSettings } from "@/lib/permissions/roles";

export const metadata: Metadata = {
	title: "Activity — data365",
};

export default async function ActivityPage() {
	const user = await getCurrentUser();

	if (!user) {
		redirect("/login");
	}

	if (!user.activeOrganizationId) {
		redirect("/dashboard/caps");
	}

	const access = await getOrganizationAccess(
		user.id,
		user.activeOrganizationId,
	);

	if (!access || !canViewOrganizationSettings(access.role)) {
		redirect("/dashboard/settings/organization");
	}

	const rows = await db()
		.select({
			id: auditLog.id,
			action: auditLog.action,
			entityType: auditLog.entityType,
			entityId: auditLog.entityId,
			createdAt: auditLog.createdAt,
			actorUserId: auditLog.actorUserId,
			actorName: users.name,
			actorEmail: users.email,
		})
		.from(auditLog)
		.leftJoin(
			users,
			and(
				isNotNull(auditLog.actorUserId),
				sql`${users.id} = ${auditLog.actorUserId}`,
			),
		)
		.where(eq(auditLog.orgId, user.activeOrganizationId))
		.orderBy(desc(auditLog.createdAt))
		.limit(100);

	return (
		<div className="flex flex-col gap-6">
			<div>
				<h2 className="text-xl font-semibold text-gray-12">Activity log</h2>
				<p className="text-sm text-gray-10 mt-1">
					Recent admin actions in your organization (last 100 events).
				</p>
			</div>
			{rows.length === 0 ? (
				<p className="text-sm text-gray-10">No activity recorded yet.</p>
			) : (
				<div className="overflow-x-auto rounded-lg border border-gray-4">
					<table className="w-full text-sm">
						<thead>
							<tr className="border-b border-gray-4 bg-gray-2">
								<th className="px-4 py-3 text-left font-medium text-gray-11">
									Time
								</th>
								<th className="px-4 py-3 text-left font-medium text-gray-11">
									Actor
								</th>
								<th className="px-4 py-3 text-left font-medium text-gray-11">
									Action
								</th>
								<th className="px-4 py-3 text-left font-medium text-gray-11">
									Entity
								</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((row) => (
								<tr
									key={row.id}
									className="border-b border-gray-4 last:border-0 hover:bg-gray-2"
								>
									<td className="px-4 py-3 text-gray-11 whitespace-nowrap">
										{formatPlatformDateTime(row.createdAt)}
									</td>
									<td className="px-4 py-3 text-gray-12">
										{row.actorName ?? row.actorEmail ?? row.actorUserId ?? "—"}
									</td>
									<td className="px-4 py-3 font-mono text-gray-12">
										{row.action}
									</td>
									<td className="px-4 py-3 text-gray-11">
										{row.entityType}
										{row.entityId ? (
											<span className="ml-1 text-gray-9 font-mono text-xs">
												{row.entityId}
											</span>
										) : null}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
