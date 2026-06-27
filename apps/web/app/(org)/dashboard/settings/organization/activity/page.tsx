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
								d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
							/>
						</svg>
					</div>
					<div>
						<p className="text-sm font-medium text-gray-12">No activity yet</p>
						<p className="text-xs text-gray-10 mt-0.5">
							Admin actions in your organization will appear here.
						</p>
					</div>
				</div>
			) : (
				<>
				<div className="grid gap-3 sm:hidden">
					{rows.map((row) => (
						<div
							key={row.id}
							className="rounded-xl border border-gray-4 bg-gray-1 p-4"
						>
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="truncate font-mono text-sm font-medium text-gray-12">
										{row.action}
									</p>
									<p className="mt-1 truncate text-xs text-gray-10">
										{row.actorName ?? row.actorEmail ?? row.actorUserId ?? "-"}
									</p>
								</div>
								<span className="shrink-0 text-xs text-gray-9">
									{formatPlatformDateTime(row.createdAt)}
								</span>
							</div>
							<div className="mt-3 rounded-lg bg-gray-2 px-3 py-2 text-xs text-gray-10">
								<span className="font-medium text-gray-11">{row.entityType}</span>
								{row.entityId ? (
									<span className="ml-1 break-all font-mono text-gray-9">
										{row.entityId}
									</span>
								) : null}
							</div>
						</div>
					))}
				</div>
				<div className="hidden overflow-x-auto rounded-lg border border-gray-4 sm:block">
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
									<td className="px-4 py-3 font-mono text-gray-12 max-w-[160px] truncate">
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
				</>
			)}
		</div>
	);
}
