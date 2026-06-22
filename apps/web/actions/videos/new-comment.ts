"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoId } from "@cap/database/helpers";
import { comments, organizations, videos } from "@cap/database/schema";
import { provideOptionalAuth, VideosPolicy } from "@cap/web-backend";
import type { ImageUpload } from "@cap/web-domain";
import { Comment, Policy, User, type Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { Effect, Exit } from "effect";
import { revalidatePath } from "next/cache";
import { createNotification } from "@/lib/Notification";
import * as EffectRuntime from "@/lib/server";

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

	// Gate text comments and emoji reactions independently: a "text" item is a
	// comment (governed by disableComments), an "emoji" item is a reaction
	// (governed by disableReactions). Previously disableComments blocked both.
	if (type === "emoji") {
		const reactionsDisabled =
			video.settings?.disableReactions ??
			video.orgSettings?.disableReactions ??
			false;
		if (reactionsDisabled) throw new Error("Reactions are disabled");
	} else {
		const commentsDisabled =
			video.settings?.disableComments ??
			video.orgSettings?.disableComments ??
			false;
		if (commentsDisabled) throw new Error("Comments are disabled");
	}

	// Gate comment creation behind the same view-authorization the rest of the
	// app uses.  Any logged-in user who cannot VIEW the video (private, password-
	// protected, email-restricted) must not be able to POST comments on it.
	const viewExit = await Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;
		return yield* Effect.void.pipe(
			Policy.withPublicPolicy(videosPolicy.canView(videoId)),
		);
	}).pipe(provideOptionalAuth, EffectRuntime.runPromiseExit);

	if (Exit.isFailure(viewExit)) throw new Error("Unauthorized to view this video");

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
