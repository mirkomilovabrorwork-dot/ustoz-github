"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoId } from "@cap/database/helpers";
import { comments, organizations, videos } from "@cap/database/schema";
import type { ImageUpload } from "@cap/web-domain";
import { Comment, User, type Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
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
	if (!user) throw new Error("Unauthorized");

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

	const [video] = await db()
		.select({
			settings: videos.settings,
			orgSettings: organizations.settings,
		})
		.from(videos)
		.leftJoin(organizations, eq(videos.orgId, organizations.id))
		.where(eq(videos.id, videoId))
		.limit(1);

	if (!video) throw new Error("Video not found");

	const commentsDisabled =
		video.settings?.disableComments ?? video.orgSettings?.disableComments ?? false;
	if (commentsDisabled) throw new Error("Comments are disabled");

	const id = Comment.CommentId.make(nanoId());

	const authorId = User.UserId.make(user.id);

	const newComment = {
		id: id,
		authorId: authorId,
		type: type,
		content: content,
		videoId: videoId,
		timestamp: timestamp ?? null,
		// Coerce empty string (sent for top-level comments) to null — an FK
		// references comments.id, and "" violates it (ER_NO_REFERENCED_ROW_2).
		parentCommentId: parentCommentId || null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};

	await db().insert(comments).values(newComment);

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

	const commentWithAuthor = {
		...newComment,
		authorName: user.name,
		authorImage: data.authorImage,
		sending: false,
	};

	revalidatePath(`/s/${videoId}`);

	return commentWithAuthor;
}
