import { promises as fs } from "node:fs";
import { db } from "@cap/database";
import { videos, videoUploads } from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { FatalError } from "workflow";
import { optimizeRemoteVideoToMp4 } from "@/lib/video-convert";
import { runPromise } from "@/lib/server";
import { getStorageAccessForVideo } from "@/lib/video-storage";

interface ProcessVideoWorkflowPayload {
	videoId: string;
	userId: string;
	rawFileKey: string;
	bucketId: string | null;
}

interface VideoProcessingResult {
	success: boolean;
	message: string;
	metadata?: {
		duration: number;
		width: number;
		height: number;
		fps: number;
	};
}

export async function processVideoWorkflow(
	payload: ProcessVideoWorkflowPayload,
): Promise<VideoProcessingResult> {
	"use workflow";

	const { videoId, userId, rawFileKey } = payload;

	try {
		const [video] = await db()
			.select()
			.from(videos)
			.where(eq(videos.id, videoId as Video.VideoId))
			.limit(1);

		if (video) {
			await optimizeVideoIfBeneficial({ videoId, userId, rawFileKey, video });
		}

		// Delete the upload tracking row (original behavior)
		await db()
			.delete(videoUploads)
			.where(eq(videoUploads.videoId, videoId as Video.VideoId));

		return {
			success: true,
			message: "Video processing complete",
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		await setProcessingError(videoId, errorMessage);
		throw new FatalError(errorMessage);
	}
}

async function optimizeVideoIfBeneficial({
	videoId,
	userId,
	rawFileKey,
	video,
}: {
	videoId: string;
	userId: string;
	rawFileKey: string;
	video: typeof videos.$inferSelect;
}): Promise<void> {
	"use step";

	try {
		const [bucket] = await getStorageAccessForVideo(video).pipe(runPromise);
		const signedUrl = await bucket
			.getInternalSignedObjectUrl(rawFileKey)
			.pipe(runPromise);

		const result = await optimizeRemoteVideoToMp4(signedUrl);

		try {
			if (result.strategy === "copy") {
				console.log(
					`[process-video] Video ${videoId} already optimized (strategy=copy), skipping upload`,
				);
				return;
			}

			// strategy === "compress" — verify output before uploading
			let outputStat: { size: number };
			try {
				outputStat = await fs.stat(result.filePath);
			} catch (statErr) {
				console.error(
					`[process-video] Optimized file not found on disk for ${videoId}, skipping upload:`,
					statErr,
				);
				return;
			}

			const MIN_VIABLE_SIZE = 100 * 1024; // 100 KB
			if (outputStat.size < MIN_VIABLE_SIZE) {
				console.error(
					`[process-video] Optimized file too small (${outputStat.size} bytes) for ${videoId}, skipping upload`,
				);
				return;
			}

			console.log(
				`[process-video] Uploading optimized video for ${videoId}: compressed size=${outputStat.size} bytes`,
			);

			const fileBuffer = await fs.readFile(result.filePath);
			const resultKey = `${video.ownerId}/${videoId}/result.mp4`;

			await bucket
				.putObject(resultKey, fileBuffer, { contentType: "video/mp4" })
				.pipe(runPromise);

			console.log(
				`[process-video] Uploaded optimized video for ${videoId} to ${resultKey} (${fileBuffer.length} bytes)`,
			);
		} finally {
			await result.cleanup();
		}
	} catch (error) {
		console.error(
			"[process-video] Optimization failed, keeping original:",
			error,
		);
		// Fail-open: never throw, let the workflow continue
	}
}

async function setProcessingError(
	videoId: string,
	errorMessage: string,
): Promise<void> {
	"use step";

	await db()
		.update(videoUploads)
		.set({
			phase: "error",
			processingProgress: 0,
			processingMessage: "Video processing failed",
			processingError: errorMessage,
			updatedAt: new Date(),
		})
		.where(eq(videoUploads.videoId, videoId as Video.VideoId));
}
