import { db } from "@cap/database";
import { organizations, videos, videoUploads } from "@cap/database/schema";
import type { Organisation, User } from "@cap/web-domain";
import { and, eq, sql } from "drizzle-orm";

const DEFAULT_QUOTA = 50 * 1024 * 1024 * 1024;

export type QuotaCheckResult =
	| { ok: true }
	| {
			ok: false;
			reason: "org_over_quota" | "user_over_quota";
			usedBytes: number;
			quotaBytes: number;
			message: string;
	  };

export async function checkUploadQuota(args: {
	orgId: Organisation.OrganisationId;
	userId: User.UserId;
	incomingBytes?: number;
}): Promise<QuotaCheckResult> {
	const incoming = Math.max(0, args.incomingBytes ?? 0);

	const [org] = await db()
		.select({ settings: organizations.settings })
		.from(organizations)
		.where(eq(organizations.id, args.orgId));

	if (!org?.settings?.enforceQuota) return { ok: true };

	const envQuota = Number(
		process.env.STORAGE_QUOTA_BYTES_PER_ORG ?? DEFAULT_QUOTA,
	);
	const orgQuotaBytes = Number(org.settings.storageQuotaBytes ?? envQuota);
	const userQuotaBytes = org.settings.userQuotaBytes ?? null;

	const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

	const [orgRow] = await db()
		.select({
			used: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`,
		})
		.from(videoUploads)
		.innerJoin(videos, eq(videos.id, videoUploads.videoId))
		.where(
			and(
				eq(videos.orgId, args.orgId),
				sql`(${videoUploads.phase} != 'uploading' OR ${videoUploads.startedAt} > ${oneHourAgo})`,
			),
		);

	const orgUsed = Number(orgRow?.used ?? 0);

	if (orgQuotaBytes > 0 && orgUsed + incoming > orgQuotaBytes) {
		return {
			ok: false,
			reason: "org_over_quota",
			usedBytes: orgUsed,
			quotaBytes: orgQuotaBytes,
			message: `Organization storage limit reached (${fmt(orgUsed)} of ${fmt(orgQuotaBytes)}).`,
		};
	}

	if (userQuotaBytes && userQuotaBytes > 0) {
		const [userRow] = await db()
			.select({
				used: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`,
			})
			.from(videoUploads)
			.innerJoin(videos, eq(videos.id, videoUploads.videoId))
			.where(
				and(
					eq(videos.orgId, args.orgId),
					eq(videos.ownerId, args.userId),
					sql`(${videoUploads.phase} != 'uploading' OR ${videoUploads.startedAt} > ${oneHourAgo})`,
				),
			);

		const userUsed = Number(userRow?.used ?? 0);

		if (userUsed + incoming > userQuotaBytes) {
			return {
				ok: false,
				reason: "user_over_quota",
				usedBytes: userUsed,
				quotaBytes: userQuotaBytes,
				message: `Your personal storage limit is reached (${fmt(userUsed)} of ${fmt(userQuotaBytes)}). Ask the workspace owner to raise it or delete old recordings.`,
			};
		}
	}

	return { ok: true };
}

function fmt(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let v = bytes / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}
