"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import {
	folders,
	organizations,
	users,
	videos,
	videoUploads,
} from "@cap/database/schema";
import type { Organisation } from "@cap/web-domain";
import { eq, sql } from "drizzle-orm";

const DEFAULT_QUOTA = 50 * 1024 * 1024 * 1024;

type StorageUsage = {
	usedBytes: number;
	quotaBytes: number;
	percentUsed: number;
	userQuotaBytes: number | null;
	enforceQuota: boolean;
	isOwner: boolean;
	byVideo: Array<{
		videoId: string;
		name: string;
		folderId: string | null;
		ownerId: string;
		bytes: number;
	}>;
	byUser: Array<{
		userId: string;
		email: string;
		name: string | null;
		bytes: number;
		overQuota: boolean;
	}>;
	byFolder: Array<{
		folderId: string | null;
		folderName: string;
		bytes: number;
	}>;
};

async function safe<T>(
	label: string,
	fn: () => Promise<T>,
	fallback: T,
): Promise<T> {
	try {
		return await fn();
	} catch (err) {
		console.error(`[getStorageUsage] ${label} failed:`, err);
		return fallback;
	}
}

export async function getStorageUsage(): Promise<StorageUsage> {
	const me = await getCurrentUser();
	const envQuota = Number(
		process.env.STORAGE_QUOTA_BYTES_PER_ORG ?? DEFAULT_QUOTA,
	);

	const empty: StorageUsage = {
		usedBytes: 0,
		quotaBytes: envQuota,
		percentUsed: 0,
		userQuotaBytes: null,
		enforceQuota: false,
		isOwner: false,
		byVideo: [],
		byUser: [],
		byFolder: [{ folderId: null, folderName: "(Root — no folder)", bytes: 0 }],
	};

	if (!me?.id || !me.activeOrganizationId) {
		return empty;
	}

	const orgId = me.activeOrganizationId as Organisation.OrganisationId;

	const orgRow = await safe(
		"orgRow",
		async () => {
			const [row] = await db()
				.select({
					ownerId: organizations.ownerId,
					settings: organizations.settings,
				})
				.from(organizations)
				.where(eq(organizations.id, orgId));
			return row ?? null;
		},
		null as {
			ownerId: string;
			settings: typeof organizations.$inferSelect.settings;
		} | null,
	);

	const quotaBytes = Number(orgRow?.settings?.storageQuotaBytes ?? envQuota);
	const userQuotaBytes = orgRow?.settings?.userQuotaBytes ?? null;
	const enforceQuota = Boolean(orgRow?.settings?.enforceQuota);
	const isOwner = orgRow?.ownerId === me.id;

	const usedBytes = await safe(
		"usedBytes",
		async () => {
			const [row] = await db()
				.select({
					usedBytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`,
				})
				.from(videoUploads)
				.innerJoin(videos, eq(videos.id, videoUploads.videoId))
				.where(eq(videos.orgId, orgId));
			return Number(row?.usedBytes ?? 0);
		},
		0,
	);

	const byVideo = await safe("byVideo", async () => {
		const rows = await db()
			.select({
				videoId: videos.id,
				name: videos.name,
				folderId: videos.folderId,
				ownerId: videos.ownerId,
				bytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`.as("bytes"),
			})
			.from(videoUploads)
			.innerJoin(videos, eq(videos.id, videoUploads.videoId))
			.where(eq(videos.orgId, orgId))
			.groupBy(videos.id)
			.orderBy(sql`bytes desc`)
			.limit(50);
		return rows.map((v) => ({
			videoId: String(v.videoId),
			name: v.name,
			folderId: v.folderId ? String(v.folderId) : null,
			ownerId: String(v.ownerId),
			bytes: Number(v.bytes),
		}));
	}, []);

	const byUser = await safe("byUser", async () => {
		const rows = await db()
			.select({
				userId: users.id,
				email: users.email,
				name: users.name,
				bytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`.as("bytes"),
			})
			.from(videoUploads)
			.innerJoin(videos, eq(videos.id, videoUploads.videoId))
			.innerJoin(users, eq(videos.ownerId, users.id))
			.where(eq(videos.orgId, orgId))
			.groupBy(users.id)
			.orderBy(sql`bytes desc`);
		return rows.map((u) => {
			const bytes = Number(u.bytes);
			return {
				userId: String(u.userId),
				email: u.email,
				name: u.name,
				bytes,
				overQuota:
					userQuotaBytes != null &&
					bytes > userQuotaBytes &&
					userQuotaBytes > 0,
			};
		});
	}, []);

	const byFolder = await safe("byFolder", async () => {
		const rows = await db()
			.select({
				folderId: folders.id,
				folderName: folders.name,
				bytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`.as("bytes"),
			})
			.from(videoUploads)
			.innerJoin(videos, eq(videos.id, videoUploads.videoId))
			.innerJoin(folders, eq(folders.id, videos.folderId))
			.where(eq(videos.orgId, orgId))
			.groupBy(folders.id)
			.orderBy(sql`bytes desc`);
		return rows.map((f) => ({
			folderId: String(f.folderId),
			folderName: f.folderName,
			bytes: Number(f.bytes),
		}));
	}, []);

	const folderedBytes = byFolder.reduce((acc, f) => acc + f.bytes, 0);
	const unfolderedBytes = Math.max(0, usedBytes - folderedBytes);

	return {
		usedBytes,
		quotaBytes,
		percentUsed: Math.min(100, (usedBytes / quotaBytes) * 100),
		userQuotaBytes,
		enforceQuota,
		isOwner,
		byVideo,
		byUser,
		byFolder: [
			...byFolder,
			{
				folderId: null,
				folderName: "(Root — no folder)",
				bytes: unfolderedBytes,
			},
		],
	};
}
