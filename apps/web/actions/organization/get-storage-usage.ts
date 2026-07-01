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
import { and, eq, isNull, sql } from "drizzle-orm";
import { runPromise } from "@/lib/server";
import { getStorageAccessForVideo } from "@/lib/video-storage";

const DEFAULT_QUOTA = 10 * 1024 * 1024 * 1024;

// Above this many non-deleted videos, per-video R2 listing is skipped in
// favor of the cheaper (but less accurate) video_uploads sum, so the
// settings page never hangs for very large orgs.
const MAX_VIDEOS_FOR_R2_SCAN = 750;

// Bounded concurrency for per-video R2 listing calls.
const R2_SCAN_CONCURRENCY = 8;

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

type DbVideo = typeof videos.$inferSelect;

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

async function getVideoBytesFromR2(video: DbVideo): Promise<number> {
	const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);
	const prefix = `${video.ownerId}/${video.id}/`;

	let total = 0;
	let continuationToken: string | undefined;

	do {
		const res = await bucket
			.listObjects({ prefix, continuationToken })
			.pipe(runPromise);
		total += (res.Contents ?? []).reduce(
			(acc, obj) => acc + (obj.Size ?? 0),
			0,
		);
		continuationToken = res.IsTruncated
			? res.NextContinuationToken
			: undefined;
	} while (continuationToken);

	return total;
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let cursor = 0;

	async function worker() {
		while (cursor < items.length) {
			const index = cursor++;
			results[index] = await fn(items[index] as T);
		}
	}

	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, worker),
	);

	return results;
}

// Fallback: the old (inaccurate) SUM(video_uploads.total) method, used only
// when the org has too many videos to scan R2 per-video within a request.
async function getUsedBytesFromUploadsFallback(
	orgId: Organisation.OrganisationId,
): Promise<number> {
	const [row] = await db()
		.select({
			usedBytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`,
		})
		.from(videoUploads)
		.innerJoin(videos, eq(videos.id, videoUploads.videoId))
		.where(and(eq(videos.orgId, orgId), isNull(videos.deletedAt)));
	return Number(row?.usedBytes ?? 0);
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

	try {
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

		const quotaBytes = Number(
			orgRow?.settings?.storageQuotaBytes ?? envQuota,
		);
		const userQuotaBytes = orgRow?.settings?.userQuotaBytes ?? null;
		const enforceQuota = Boolean(orgRow?.settings?.enforceQuota);
		const isOwner = orgRow?.ownerId === me.id;

		const orgVideos = await safe(
			"orgVideos",
			async () =>
				db()
					.select()
					.from(videos)
					.where(and(eq(videos.orgId, orgId), isNull(videos.deletedAt))),
			[] as DbVideo[],
		);

		const orgUsers = await safe(
			"orgUsers",
			async () =>
				db()
					.select({ id: users.id, email: users.email, name: users.name })
					.from(users)
					.innerJoin(videos, eq(videos.ownerId, users.id))
					.where(and(eq(videos.orgId, orgId), isNull(videos.deletedAt)))
					.groupBy(users.id),
			[] as Array<{ id: string; email: string; name: string | null }>,
		);
		const usersById = new Map(orgUsers.map((u) => [String(u.id), u]));

		const orgFolders = await safe(
			"orgFolders",
			async () =>
				db()
					.select({ id: folders.id, name: folders.name })
					.from(folders)
					.where(eq(folders.organizationId, orgId)),
			[] as Array<{ id: string; name: string }>,
		);
		const foldersById = new Map(orgFolders.map((f) => [String(f.id), f]));

		// If there are too many videos, fall back to the cheap aggregate query
		// so the settings page never hangs scanning R2 for huge orgs.
		const useR2Scan = orgVideos.length <= MAX_VIDEOS_FOR_R2_SCAN;

		const videoBytes = new Map<string, number>();

		if (useR2Scan) {
			await mapWithConcurrency(
				orgVideos,
				R2_SCAN_CONCURRENCY,
				async (video) => {
					const bytes = await safe(
						`videoBytes:${video.id}`,
						() => getVideoBytesFromR2(video),
						0,
					);
					videoBytes.set(String(video.id), bytes);
				},
			);
		}

		let usedBytes: number;
		let byVideo: StorageUsage["byVideo"];
		let byUser: StorageUsage["byUser"];
		let byFolder: StorageUsage["byFolder"];

		if (useR2Scan) {
			usedBytes = Array.from(videoBytes.values()).reduce(
				(acc, b) => acc + b,
				0,
			);

			byVideo = await safe(
				"byVideo",
				async () =>
					orgVideos
						.map((v) => ({
							videoId: String(v.id),
							name: v.name,
							folderId: v.folderId ? String(v.folderId) : null,
							ownerId: String(v.ownerId),
							bytes: videoBytes.get(String(v.id)) ?? 0,
						}))
						.sort((a, b) => b.bytes - a.bytes)
						.slice(0, 50),
				[],
			);

			byUser = await safe(
				"byUser",
				async () => {
					const totals = new Map<string, number>();
					for (const v of orgVideos) {
						const ownerId = String(v.ownerId);
						totals.set(
							ownerId,
							(totals.get(ownerId) ?? 0) + (videoBytes.get(String(v.id)) ?? 0),
						);
					}
					return Array.from(totals.entries())
						.map(([ownerId, bytes]) => {
							const u = usersById.get(ownerId);
							return {
								userId: ownerId,
								email: u?.email ?? "",
								name: u?.name ?? null,
								bytes,
								overQuota:
									userQuotaBytes != null &&
									bytes > userQuotaBytes &&
									userQuotaBytes > 0,
							};
						})
						.sort((a, b) => b.bytes - a.bytes);
				},
				[],
			);

			byFolder = await safe(
				"byFolder",
				async () => {
					const totals = new Map<string, number>();
					let unfoldered = 0;
					for (const v of orgVideos) {
						const bytes = videoBytes.get(String(v.id)) ?? 0;
						if (v.folderId) {
							const folderId = String(v.folderId);
							totals.set(folderId, (totals.get(folderId) ?? 0) + bytes);
						} else {
							unfoldered += bytes;
						}
					}
					const rows = Array.from(totals.entries())
						.map(([folderId, bytes]) => ({
							folderId,
							folderName: foldersById.get(folderId)?.name ?? "Untitled",
							bytes,
						}))
						.sort((a, b) => b.bytes - a.bytes);
					return [
						...rows,
						{
							folderId: null,
							folderName: "(Root — no folder)",
							bytes: unfoldered,
						},
					];
				},
				[{ folderId: null, folderName: "(Root — no folder)", bytes: 0 }],
			);
		} else {
			// Fallback path for very large orgs: old aggregate-based method.
			usedBytes = await safe(
				"usedBytesFallback",
				() => getUsedBytesFromUploadsFallback(orgId),
				0,
			);

			byVideo = await safe("byVideoFallback", async () => {
				const rows = await db()
					.select({
						videoId: videos.id,
						name: videos.name,
						folderId: videos.folderId,
						ownerId: videos.ownerId,
						bytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`.as(
							"bytes",
						),
					})
					.from(videoUploads)
					.innerJoin(videos, eq(videos.id, videoUploads.videoId))
					.where(and(eq(videos.orgId, orgId), isNull(videos.deletedAt)))
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

			byUser = await safe("byUserFallback", async () => {
				const rows = await db()
					.select({
						userId: users.id,
						email: users.email,
						name: users.name,
						bytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`.as(
							"bytes",
						),
					})
					.from(videoUploads)
					.innerJoin(videos, eq(videos.id, videoUploads.videoId))
					.innerJoin(users, eq(videos.ownerId, users.id))
					.where(and(eq(videos.orgId, orgId), isNull(videos.deletedAt)))
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

			const byFolderFallback = await safe("byFolderFallback", async () => {
				const rows = await db()
					.select({
						folderId: folders.id,
						folderName: folders.name,
						bytes: sql<number>`COALESCE(SUM(${videoUploads.total}), 0)`.as(
							"bytes",
						),
					})
					.from(videoUploads)
					.innerJoin(videos, eq(videos.id, videoUploads.videoId))
					.innerJoin(folders, eq(folders.id, videos.folderId))
					.where(and(eq(videos.orgId, orgId), isNull(videos.deletedAt)))
					.groupBy(folders.id)
					.orderBy(sql`bytes desc`);
				return rows.map((f) => ({
					folderId: String(f.folderId),
					folderName: f.folderName,
					bytes: Number(f.bytes),
				}));
			}, []);

			const folderedBytes = byFolderFallback.reduce(
				(acc, f) => acc + f.bytes,
				0,
			);
			const unfolderedBytes = Math.max(0, usedBytes - folderedBytes);

			byFolder = [
				...byFolderFallback,
				{
					folderId: null,
					folderName: "(Root — no folder)",
					bytes: unfolderedBytes,
				},
			];
		}

		return {
			usedBytes,
			quotaBytes,
			percentUsed: Math.min(100, (usedBytes / quotaBytes) * 100),
			userQuotaBytes,
			enforceQuota,
			isOwner,
			byVideo,
			byUser,
			byFolder,
		};
	} catch (err) {
		console.error("[getStorageUsage] failed:", err);
		return empty;
	}
}
