"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { comments } from "@cap/database/schema";
import type { Comment } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function editComment({
	commentId,
	content,
}: {
	commentId: Comment.CommentId;
	content: string;
}) {
	const user = await getCurrentUser();

	if (!user) {
		throw new Error("User not authenticated");
	}

	const trimmed = content.trim();
	if (!trimmed) {
		throw new Error("Comment content cannot be empty");
	}
	if (trimmed.length > 2000) {
		throw new Error("Comment content cannot exceed 2000 characters");
	}

	const [existing] = await db()
		.select({
			id: comments.id,
			authorId: comments.authorId,
			videoId: comments.videoId,
		})
		.from(comments)
		.where(eq(comments.id, commentId))
		.limit(1);

	if (!existing) {
		throw new Error("Comment not found");
	}

	if (existing.authorId !== user.id) {
		throw new Error("You do not have permission to edit this comment");
	}

	await db()
		.update(comments)
		.set({ content: trimmed, updatedAt: new Date() })
		.where(and(eq(comments.id, commentId), eq(comments.authorId, user.id)));

	revalidatePath(`/s/${existing.videoId}`);

	return { success: true };
}
