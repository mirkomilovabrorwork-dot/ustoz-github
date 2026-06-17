"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videoEdits, videos, videoUploads } from "@cap/database/schema";
import type { VideoEditSpec } from "@cap/database/types";
import { userIsPro } from "@cap/utils";
import { Storage } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { revalidatePath } from "next/cache";
import { start } from "workflow/api";
import { runPromise } from "@/lib/server";
import { getEditSourceKey } from "@/lib/video-edit-processing";
import {
	areEditSpecsEquivalent,
	composeEditSpecs,
	createIdentityEditSpec,
	getEditSpecOutputDuration,
	normalizeKeepRanges,
} from "@/lib/video-edits";
import { decodeStorageVideo } from "@/lib/video-storage";
import { isAiGenerationEnabled } from "@/utils/flags";
import { editVideoWorkflow } from "@/workflows/edit-video";

const ACTIVE_PHASES = [
	"uploading",
	"processing",
	"generating_thumbnail",
] as const;

export type SaveVideoEditsResult =
	| { ok: true; skipped?: boolean }
	| { ok: false; error: string };

function isMp4BackedVideo(source: typeof videos.$inferSelect.source) {
	return (
		source.type === "desktopMP4" ||
		source.type === "webMP4" ||
		source.type === "extensionWeb"
	);
}

function getResultKey(ownerId: string, videoId: string) {
	return `${ownerId}/${videoId}/result.mp4`;
}

async function objectExists(
	bucket: Awaited<ReturnType<typeof getVideoBucket>>,
	key: string,
) {
	return await bucket.headObject(key).pipe(
		Effect.as(true),
		Effect.catchAll(() => Effect.succeed(false)),
		runPromise,
	);
}

async function getVideoBucket(video: typeof videos.$inferSelect) {
	const [bucket] = await Storage.getAccessForVideo(
		decodeStorageVideo(video),
	).pipe(runPromise);
	return bucket;
}

async function ensureOriginalSourceCopy(
	video: typeof videos.$inferSelect,
	sourceKey = getEditSourceKey(video.ownerId, video.id),
) {
	const bucket = await getVideoBucket(video);
	const hasSource = await objectExists(bucket, sourceKey);
	if (hasSource) return sourceKey;

	const candidates = [
		getResultKey(video.ownerId, video.id),
		`${video.ownerId}/${video.id}/raw-upload.mp4`,
		`${video.ownerId}/${video.id}/raw-upload.webm`,
	];

	let copiedFrom: string | null = null;
	for (const key of candidates) {
		if (await objectExists(bucket, key)) {
			copiedFrom = key;
			break;
		}
	}

	if (!copiedFrom) {
		throw new Error(
			"No processed video found for this clip yet — wait for processing to finish before editing.",
		);
	}

	await bucket
		.copyObject(`${bucket.bucketName}/${copiedFrom}`, sourceKey)
		.pipe(runPromise);

	return sourceKey;
}

async function markEditProcessing({
	videoId,
	sourceKey,
}: {
	videoId: Video.VideoId;
	sourceKey: string;
}) {
	await db()
		.insert(videoUploads)
		.values({
			videoId,
			uploaded: 0,
			total: 0,
			mode: "singlepart",
			phase: "processing",
			processingProgress: 0,
			processingMessage: "Starting video edit...",
			processingError: null,
			rawFileKey: sourceKey,
			updatedAt: new Date(),
		})
		.onDuplicateKeyUpdate({
			set: {
				uploaded: 0,
				total: 0,
				mode: "singlepart",
				phase: "processing",
				processingProgress: 0,
				processingMessage: "Starting video edit...",
				processingError: null,
				rawFileKey: sourceKey,
				updatedAt: new Date(),
			},
		});
}

export async function saveVideoEdits(
	videoId: Video.VideoId,
	editSpec: VideoEditSpec,
): Promise<SaveVideoEditsResult> {
	const user = await getCurrentUser();
	if (!user)
		return { ok: false, error: "You're signed out. Please log in again." };
	if (!userIsPro(user)) {
		return {
			ok: false,
			error: "Cap Pro is required to edit videos.",
		};
	}

	const [video] = await db()
		.select()
		.from(videos)
		.where(eq(videos.id, videoId));

	if (!video) return { ok: false, error: "Video not found." };
	if (video.ownerId !== user.id)
		return { ok: false, error: "You don't own this video." };
	if (video.isScreenshot)
		return { ok: false, error: "Screenshots can't be edited." };
	if (!isMp4BackedVideo(video.source)) {
		return {
			ok: false,
			error:
				"Only processed MP4 videos can be edited. Try again once processing finishes.",
		};
	}

	const [activeUpload] = await db()
		.select({ phase: videoUploads.phase, startedAt: videoUploads.startedAt })
		.from(videoUploads)
		.where(
			and(
				eq(videoUploads.videoId, videoId),
				inArray(videoUploads.phase, [...ACTIVE_PHASES]),
				gt(videoUploads.startedAt, sql`DATE_SUB(NOW(), INTERVAL 1 HOUR)`),
			),
		)
		.limit(1);

	if (activeUpload) {
		return {
			ok: false,
			error:
				"Another edit is still processing this video. Please wait a moment and try again.",
		};
	}

	const [existingEdit] = await db()
		.select()
		.from(videoEdits)
		.where(eq(videoEdits.videoId, videoId));

	const previousSpec =
		existingEdit?.editSpec ??
		createIdentityEditSpec(video.duration ?? editSpec.sourceDuration);
	const expectedCurrentDuration = existingEdit
		? getEditSpecOutputDuration(previousSpec)
		: (video.duration ?? editSpec.sourceDuration);
	const currentOutputSpec = normalizeKeepRanges(
		editSpec.keepRanges,
		expectedCurrentDuration,
	);

	if (getEditSpecOutputDuration(currentOutputSpec) <= 0) {
		return {
			ok: false,
			error:
				"Your edit doesn't keep any playable range. Add at least one segment.",
		};
	}

	const normalizedEditSpec = existingEdit
		? composeEditSpecs(previousSpec, currentOutputSpec)
		: currentOutputSpec;

	if (areEditSpecsEquivalent(previousSpec, normalizedEditSpec)) {
		revalidatePath(`/s/${videoId}/edit`);
		return { ok: true, skipped: true };
	}

	let sourceKey: string;
	try {
		sourceKey = await ensureOriginalSourceCopy(video, existingEdit?.sourceKey);
	} catch (error) {
		const message =
			error instanceof Error && error.message
				? error.message
				: "Couldn't prepare the source video. Try again in a moment.";
		console.error("[saveVideoEdits] source copy failed", {
			videoId,
			err: error instanceof Error ? error.message : String(error),
		});
		return { ok: false, error: message };
	}

	const aiGenerationEnabled = await isAiGenerationEnabled(user);

	await markEditProcessing({ videoId, sourceKey });

	try {
		await start(editVideoWorkflow, [
			{
				videoId,
				userId: user.id,
				sourceKey,
				previousSpec,
				editSpec: normalizedEditSpec,
				keepRanges: normalizedEditSpec.keepRanges,
				aiGenerationEnabled,
			},
		]);
	} catch (error) {
		await db().delete(videoUploads).where(eq(videoUploads.videoId, videoId));
		console.error("[saveVideoEdits] workflow start failed", {
			videoId,
			err: error instanceof Error ? error.message : String(error),
		});
		return {
			ok: false,
			error:
				"Couldn't start the edit job. The processing service may be unavailable — try again in a few minutes.",
		};
	}

	revalidatePath(`/s/${videoId}`);
	revalidatePath(`/s/${videoId}/edit`);
	revalidatePath("/dashboard/caps");

	return { ok: true };
}
