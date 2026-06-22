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

// Hard caps to bound unauthenticated input. Guest names are short display
// labels; content is a comment body.
const GUEST_NAME_MAX = 50;
const CONTENT_MAX = 5000;

// Trim, strip control characters (incl. newlines) and clamp a guest-supplied
// display name. Returns null when the result is empty.
function sanitizeGuestName(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const cleaned = raw
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping control chars is the intent
		.replace(/[\x00-\x1F\x7F]/g, " ")
		.replace(/\s+/g, " ")
		.trim();
	if (!cleaned) return null;
	return cleaned.slice(0, GUEST_NAME_MAX);
}

export async function newComment(data: {
	content: string;
	videoId: Video.VideoId;
	type: "text" | "emoji";
	authorImage: ImageUpload.ImageUrl | null;
	parentCommentId: Comment.CommentId;
	timestamp: number;
	// Display name for an unauthenticated (guest) commenter. Ignored when the
	// viewer is logged in.
	guestName?: string | null;
}) {
	const user = await getCurrentUser();

	// Anonymous viewers may comment ONLY when they can VIEW the video (enforced
	// by the canView policy below) and only after providing a display name.
	const guestName = user ? null : sanitizeGuestName(data.guestName);
	if (!user && !guestName) {
		throw new Error("A name is required to comment");
	}

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

	if (content.length > CONTENT_MAX) {
		throw new Error("Comment is too long");
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
	// app uses.  Any viewer (logged-in OR anonymous) who cannot VIEW the video
	// (private, password-protected, email-restricted) must not be able to POST
	// comments on it. provideOptionalAuth means an anonymous viewer only passes
	// canView for public/shared videos.
	const viewExit = await Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;
		return yield* Effect.void.pipe(
			Policy.withPublicPolicy(videosPolicy.canView(videoId)),
		);
	}).pipe(provideOptionalAuth, EffectRuntime.runPromiseExit);

	if (Exit.isFailure(viewExit))
		throw new Error("Unauthorized to view this video");

	const id = Comment.CommentId.make(nanoId());

	// Logged-in: attribute to the user (name resolved via the users join on
	// read). Guest: no authorId, persist the supplied display name in authorName.
	const authorId = user ? User.UserId.make(user.id) : null;

	const newComment = {
		id: id,
		authorId: authorId,
		authorName: guestName,
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

	// Notifications are keyed to an authoring user; guests have none, so skip.
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
		authorName: user ? user.name : guestName,
		authorImage: user ? data.authorImage : null,
		sending: false,
	};

	revalidatePath(`/s/${videoId}`);

	return commentWithAuthor;
}
