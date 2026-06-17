"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { comments, notifications, videos } from "@cap/database/schema";
import type { Comment, Video } from "@cap/web-domain";
import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function deleteComment({
	commentId,
	parentId,
	videoId,
}: {
	commentId: Comment.CommentId;
	parentId: Comment.CommentId | null;
	videoId: Video.VideoId;
}) {
	const user = await getCurrentUser();

	if (!user) {
		throw new Error("User not authenticated");
	}

	if (!commentId || !videoId) {
		throw new Error("Comment ID and video ID are required");
	}

	try {
		await db().transaction(async (tx) => {
			const [existingComment] = await tx
				.select({
					id: comments.id,
					authorId: comments.authorId,
					videoId: comments.videoId,
				})
				.from(comments)
				.where(eq(comments.id, commentId))
				.limit(1);

			if (!existingComment) {
				throw new Error("Comment not found");
			}

			const isAuthor = existingComment.authorId === user.id;

			if (!isAuthor) {
				const [video] = await tx
					.select({ ownerId: videos.ownerId })
					.from(videos)
					.where(eq(videos.id, existingComment.videoId))
					.limit(1);

				if (!video || video.ownerId !== user.id) {
					throw new Error("You do not have permission to delete this comment");
				}
			}

			await tx.delete(comments).where(eq(comments.id, commentId));

			// When deleting a parent comment, cascade its replies
			if (!parentId) {
				await tx
					.delete(comments)
					.where(eq(comments.parentCommentId, commentId));
			}

			// Delete related notifications
			if (parentId) {
				await tx
					.delete(notifications)
					.where(
						and(
							eq(notifications.type, "reply"),
							sql`JSON_EXTRACT(${notifications.data}, '$.comment.id') = ${commentId}`,
						),
					);
			} else {
				await tx
					.delete(notifications)
					.where(
						and(
							eq(notifications.type, "comment"),
							sql`JSON_EXTRACT(${notifications.data}, '$.comment.id') = ${commentId}`,
						),
					);

				await tx
					.delete(notifications)
					.where(
						and(
							eq(notifications.type, "reply"),
							sql`JSON_EXTRACT(${notifications.data}, '$.comment.parentCommentId') = ${commentId}`,
						),
					);
			}
		});

		revalidatePath(`/s/${videoId}`);
		return { success: true };
	} catch (error) {
		console.error("Error deleting comment:", error);
		throw error;
	}
}
