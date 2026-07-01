"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { organizationMembers, organizations, videos } from "@cap/database/schema";
import type { Video } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import { getEffectiveOrganizationRole } from "@/lib/permissions/roles";
import { patchVideoMetadata } from "@/lib/video-metadata";

class InvalidTaskIndexError extends Error {}

export async function updateTaskStatus(
	videoId: Video.VideoId,
	taskIndex: number,
	done: boolean,
): Promise<{ success: boolean; error?: string }> {
	try {
		const user = await getCurrentUser();
		if (!user) {
			return { success: false, error: "forbidden" };
		}

		const [video] = await db()
			.select()
			.from(videos)
			.where(and(eq(videos.id, videoId), isNull(videos.deletedAt)))
			.limit(1);

		if (!video) {
			return { success: false, error: "invalid" };
		}

		// Check admin/owner permission
		const isOwner = user.id === video.ownerId;
		let hasPermission = isOwner;

		if (!hasPermission && video.orgId) {
			const [orgAccess] = await db()
				.select({
					ownerId: organizations.ownerId,
					memberRole: organizationMembers.role,
				})
				.from(organizations)
				.leftJoin(
					organizationMembers,
					and(
						eq(organizationMembers.organizationId, organizations.id),
						eq(organizationMembers.userId, user.id),
					),
				)
				.where(
					and(
						eq(organizations.id, video.orgId),
						isNull(organizations.tombstoneAt),
					),
				)
				.limit(1);

			if (orgAccess) {
				const role = getEffectiveOrganizationRole({
					userId: user.id,
					ownerId: orgAccess.ownerId,
					memberRole: orgAccess.memberRole,
				});
				hasPermission = role === "owner" || role === "admin";
			}
		}

		if (!hasPermission) {
			return { success: false, error: "forbidden" };
		}

		await patchVideoMetadata(videoId, (current) => {
			if (
				!current.aiSummary ||
				taskIndex < 0 ||
				taskIndex >= current.aiSummary.tasks.length
			) {
				throw new InvalidTaskIndexError();
			}

			const updatedAiSummary = {
				...current.aiSummary,
				tasks: current.aiSummary.tasks.map((task, i) =>
					i === taskIndex ? { ...task, done } : task,
				),
			};

			const updatedAiSummaryByLanguage = current.aiSummaryByLanguage
				? Object.fromEntries(
						Object.entries(current.aiSummaryByLanguage).map(([lang, summary]) => {
							if (!summary || taskIndex >= summary.tasks.length) {
								return [lang, summary];
							}
							return [
								lang,
								{
									...summary,
									tasks: summary.tasks.map((task, i) =>
										i === taskIndex ? { ...task, done } : task,
									),
								},
							];
						}),
					)
				: current.aiSummaryByLanguage;

			return {
				...current,
				aiSummary: updatedAiSummary,
				aiSummaryByLanguage: updatedAiSummaryByLanguage,
			};
		});

		return { success: true };
	} catch (error) {
		if (error instanceof InvalidTaskIndexError) {
			return { success: false, error: "invalid" };
		}
		console.error("Error updating task status:", error);
		return {
			success: false,
			error: error instanceof Error ? error.message : "Failed to update task status",
		};
	}
}
