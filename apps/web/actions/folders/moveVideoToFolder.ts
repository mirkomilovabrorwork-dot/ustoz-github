"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import {
	folders,
	sharedVideos,
	spaces,
	spaceVideos,
	videos,
} from "@cap/database/schema";
import type { Folder, Space, Video } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
export async function moveVideoToFolder({
	videoId,
	folderId,
	spaceId,
}: {
	videoId: Video.VideoId;
	folderId: Folder.FolderId | null;
	spaceId?: Space.SpaceIdOrOrganisationId | null;
}) {
	const user = await getCurrentUser();
	if (!user || !user.activeOrganizationId)
		throw new Error("Unauthorized or no active organization");

	if (!videoId) throw new Error("Video ID is required");

	// Get the current video to know its original folder and verify ownership
	const [currentVideo] = await db()
		.select({
			folderId: videos.folderId,
			id: videos.id,
			ownerId: videos.ownerId,
		})
		.from(videos)
		.where(eq(videos.id, videoId));

	if (!currentVideo) throw new Error("Video not found");
	if (currentVideo.ownerId !== user.id) throw new Error("Unauthorized");

	const originalFolderId = currentVideo.folderId;

	const isAllSpacesEntry = spaceId === user.activeOrganizationId;

	// If folderId is provided, verify it exists and belongs to the same organization
	if (folderId) {
		const [folder] = await db()
			.select({ id: folders.id, organizationId: folders.organizationId })
			.from(folders)
			.where(eq(folders.id, folderId));

		if (!folder || folder.organizationId !== user.activeOrganizationId) {
			throw new Error("Folder not found or not accessible");
		}
	}

	if (spaceId && !isAllSpacesEntry) {
		const [space] = await db()
			.select({ organizationId: spaces.organizationId })
			.from(spaces)
			.where(eq(spaces.id, spaceId));

		if (!space || space.organizationId !== user.activeOrganizationId) {
			throw new Error("Space not found");
		}
	}

	if (spaceId && !isAllSpacesEntry) {
		await db()
			.update(spaceVideos)
			.set({
				folderId: folderId === null ? null : folderId,
			})
			.where(
				and(eq(spaceVideos.videoId, videoId), eq(spaceVideos.spaceId, spaceId)),
			);
	} else if (spaceId && isAllSpacesEntry) {
		await db()
			.update(sharedVideos)
			.set({
				folderId: folderId === null ? null : folderId,
			})
			.where(
				and(
					eq(sharedVideos.videoId, videoId),
					eq(sharedVideos.organizationId, user.activeOrganizationId),
				),
			);
	} else {
		await db()
			.update(videos)
			.set({
				folderId: folderId === null ? null : folderId,
			})
			.where(eq(videos.id, videoId));
	}

	// Always revalidate the main caps page
	revalidatePath(`/dashboard/caps`);

	if (spaceId) {
		revalidatePath(`/dashboard/spaces/${spaceId}/folder/${folderId}`);
	}

	// Revalidate the target folder if it exists
	if (folderId) {
		revalidatePath(`/dashboard/folder/${folderId}`);
	}

	// Revalidate the original folder if it exists
	if (originalFolderId) {
		revalidatePath(`/dashboard/folder/${originalFolderId}`);
	}

	// If we're moving from one folder to another, revalidate the parent folders too
	if (originalFolderId && folderId && originalFolderId !== folderId) {
		// Get parent of original folder
		const [originalFolder] = await db()
			.select({ parentId: folders.parentId })
			.from(folders)
			.where(eq(folders.id, originalFolderId));

		if (originalFolder?.parentId) {
			revalidatePath(`/dashboard/folder/${originalFolder.parentId}`);
		}

		// Get parent of target folder
		const [targetFolder] = await db()
			.select({ parentId: folders.parentId })
			.from(folders)
			.where(eq(folders.id, folderId));

		if (targetFolder?.parentId) {
			revalidatePath(`/dashboard/folder/${targetFolder.parentId}`);
		}
	}
}
