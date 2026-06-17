"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoId } from "@cap/database/helpers";
import { comments } from "@cap/database/schema";
import type { ImageUpload } from "@cap/web-domain";
import { Comment, User, type Video } from "@cap/web-domain";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/Notification";

export async function newComment(data: {
	content: string;
	videoId: Video.VideoId;
	type: "text" | "emoji";
	authorImage: ImageUpload.ImageUrl | null;
	parentCommentId: Comment.CommentId;
	timestamp: number;
}) {
	const user = await getCurrentUser();

	const content = data.content;
	const videoId = data.videoId;
	const type = data.type;
	const parentCommentId = data.parentCommentId;
	const timestamp = data.timestamp;
	const conditionalType = parentCommentId
		? "reply"
		: type === "emoji"
			? "reaction"
			: "comment";

	if (!content || !videoId) {
		throw new Error("Content and videoId are required");
	}
	const id = Comment.CommentId.make(nanoId());

	const authorId = user
		? User.UserId.make(user.id)
		: User.UserId.make("anonymous");

	const newComment = {
		id: id,
		authorId: authorId,
		type: type,
		content: content,
		videoId: videoId,
		timestamp: timestamp ?? null,
		parentCommentId: parentCommentId,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	await db().insert(comments).values(newComment);

	if (user) {
		try {
			await createNotification({
				type: conditionalType,
				videoId,
				authorId: user.id,
				comment: { id, content },
				parentCommentId,
			});
		} catch (error) {
			console.error("Failed to create notification:", error);
		}
	}

	const commentWithAuthor = {
		...newComment,
		authorName: user ? user.name : "Guest",
		authorImage: user ? data.authorImage : null,
		sending: false,
	};

	revalidatePath(`/s/${videoId}`);

	return commentWithAuthor;
}
