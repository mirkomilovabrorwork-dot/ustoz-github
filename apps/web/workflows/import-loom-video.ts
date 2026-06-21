// Media server removed — Loom videos are downloaded to S3 and served directly as MP4
import { randomUUID } from "node:crypto";
import { db } from "@cap/database";
import { videos, videoUploads } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { Storage, validateLoomDownloadUrl } from "@cap/web-backend";
import { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { FatalError } from "workflow";
import { runPromise } from "@/lib/server";

interface ImportLoomPayload {
	videoId: string;
	userId: string;
	rawFileKey: string;
	bucketId: string | null;
	loomDownloadUrl: string;
	loomVideoId: string;
}

const MINIMUM_VIDEO_SIZE = 1024;
const PRESIGNED_PUT_EXPIRES_SECONDS = 3 * 60 * 60;

function isStreamingUrl(url: string): boolean {
	const path = (url.split("?")[0] ?? "").toLowerCase();
	return path.endsWith(".m3u8") || path.endsWith(".mpd");
}

function isGoogleDriveResumableUrl(url: string): boolean {
	return url.includes("googleapis.com/upload/drive/");
}

async function fetchLoomCdnUrl(
	videoId: string,
	endpoint: string,
	includeBody: boolean,
): Promise<string | null> {
	try {
		const options: RequestInit = { method: "POST" };
		if (includeBody) {
			options.headers = {
				"Content-Type": "application/json",
				Accept: "application/json",
			};
			options.body = JSON.stringify({
				anonID: randomUUID(),
				deviceID: null,
				force_original: false,
				password: null,
			});
		}

		const response = await fetch(
			`https://www.loom.com/api/campaigns/sessions/${videoId}/${endpoint}`,
			options,
		);

		if (!response.ok || response.status === 204) return null;

		const text = await response.text();
		if (!text.trim()) return null;

		const data = JSON.parse(text) as { url?: string };
		return data.url ?? null;
	} catch {
		return null;
	}
}

async function fetchFreshLoomDownloadUrl(loomVideoId: string): Promise<string> {
	const requestVariants: Array<{ endpoint: string; includeBody: boolean }> = [
		{ endpoint: "transcoded-url", includeBody: true },
		{ endpoint: "raw-url", includeBody: true },
		{ endpoint: "transcoded-url", includeBody: false },
		{ endpoint: "raw-url", includeBody: false },
	];

	let fallbackStreamingUrl: string | null = null;

	for (const { endpoint, includeBody } of requestVariants) {
		const url = await fetchLoomCdnUrl(loomVideoId, endpoint, includeBody);
		if (!url) continue;

		if (!isStreamingUrl(url)) return url;

		if (!fallbackStreamingUrl) fallbackStreamingUrl = url;
	}

	if (fallbackStreamingUrl) return fallbackStreamingUrl;

	throw new FatalError(
		"Could not retrieve a download URL from Loom. The video may be private, password-protected, or the link may have expired.",
	);
}

const MAX_REDIRECTS = 5;

async function downloadVideoContent(downloadUrl: string): Promise<Buffer> {
	if (!validateLoomDownloadUrl(downloadUrl)) {
		throw new FatalError(
			"Refused to download from an invalid or untrusted Loom URL.",
		);
	}

	// Manually walk redirects so we can validate each hop BEFORE fetching it,
	// preventing SSRF via a redirect to an internal/metadata host.
	let currentUrl = downloadUrl;
	let redirectCount = 0;

	while (true) {
		const response = await fetch(currentUrl, { redirect: "manual" });

		// 3xx — validate the Location before following
		if (
			response.status >= 300 &&
			response.status < 400 &&
			response.status !== 304
		) {
			if (redirectCount >= MAX_REDIRECTS) {
				throw new FatalError(
					`Loom download exceeded the maximum redirect limit (${MAX_REDIRECTS}). The import was blocked for security reasons.`,
				);
			}

			const location = response.headers.get("location");
			if (!location) {
				throw new FatalError(
					"Loom download returned a redirect with no Location header.",
				);
			}

			// Resolve the Location URL relative to the current URL, then validate
			// it against the Loom allow-list BEFORE following the hop.
			let nextUrl: string;
			try {
				nextUrl = new URL(location, currentUrl).toString();
			} catch {
				throw new FatalError(
					"Loom download redirect contained a malformed Location URL.",
				);
			}

			if (!validateLoomDownloadUrl(nextUrl)) {
				throw new FatalError(
					"Loom download was redirected to an untrusted host. The import was blocked for security reasons.",
				);
			}

			currentUrl = nextUrl;
			redirectCount++;
			continue;
		}

		// Final 2xx response — run content checks here
		if (!response.ok) {
			throw new FatalError(
				`Failed to download from Loom: ${response.status} ${response.statusText}`,
			);
		}

		const contentType = response.headers.get("content-type") ?? "";
		if (
			contentType.includes("text/html") ||
			contentType.includes("application/json")
		) {
			throw new FatalError(
				`Loom returned non-video content (${contentType}). The download URL may have expired.`,
			);
		}

		return Buffer.from(await response.arrayBuffer());
	}
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

export async function importLoomVideoWorkflow(
	payload: ImportLoomPayload,
): Promise<VideoProcessingResult> {
	"use workflow";

	try {
		await downloadLoomToS3(payload);

		// Media server removed — Loom video is stored as-is in S3, no server-side processing
		await completeImport(payload.videoId);

		return {
			success: true,
			message: "Loom video imported successfully",
		};
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		await setProcessingError(payload.videoId, errorMessage);
		throw new FatalError(errorMessage);
	}
}

async function downloadLoomToS3(
	payload: ImportLoomPayload,
): Promise<void> {
	"use step";

	const { videoId, loomVideoId, rawFileKey } = payload;

	await db()
		.update(videoUploads)
		.set({
			phase: "uploading",
			processingProgress: 0,
			processingMessage: "Downloading from Loom...",
			rawFileKey,
			updatedAt: new Date(),
		})
		.where(eq(videoUploads.videoId, videoId as Video.VideoId));

	const freshDownloadUrl = await fetchFreshLoomDownloadUrl(loomVideoId);

	const validatedDownloadUrl = validateLoomDownloadUrl(freshDownloadUrl);
	if (!validatedDownloadUrl) {
		throw new FatalError(
			"Loom returned an invalid or untrusted download URL. The import was blocked for security reasons.",
		);
	}
	const safeDownloadUrl = validatedDownloadUrl.toString();

	if (isStreamingUrl(safeDownloadUrl)) {
		// Streaming URLs (HLS/DASH) cannot be downloaded as a single file
		throw new FatalError(
			"This Loom video uses streaming format (HLS/DASH) and cannot be imported directly.",
		);
	}

	const presignedPutUrl = await Effect.gen(function* () {
		const [video] = yield* Effect.promise(() =>
			db()
				.select()
				.from(videos)
				.where(eq(videos.id, Video.VideoId.make(videoId))),
		);
		if (!video) {
			return yield* Effect.fail(new FatalError("Video does not exist"));
		}
		const videoDomain = Video.Video.decodeSync({
			...video,
			bucketId: video.bucket,
			storageIntegrationId: video.storageIntegrationId,
			createdAt: video.createdAt.toISOString(),
			updatedAt: video.updatedAt.toISOString(),
			metadata: video.metadata,
		});
		const [bucket] = yield* Storage.getAccessForVideo(videoDomain);
		return yield* bucket.getInternalPresignedPutUrl(
			rawFileKey,
			{
				ContentType: "video/mp4",
			},
			{ expiresIn: PRESIGNED_PUT_EXPIRES_SECONDS },
		);
	}).pipe(runPromise);

	const videoBuffer = await downloadVideoContent(safeDownloadUrl);

	if (videoBuffer.length < MINIMUM_VIDEO_SIZE) {
		throw new FatalError(
			`Downloaded file is too small (${videoBuffer.length} bytes). The video may not be available for download.`,
		);
	}

	const uploadHeaders: Record<string, string> = {
		"Content-Type": "video/mp4",
		"Content-Length": videoBuffer.length.toString(),
	};
	if (isGoogleDriveResumableUrl(presignedPutUrl) && videoBuffer.length > 0) {
		uploadHeaders["Content-Range"] =
			`bytes 0-${videoBuffer.length - 1}/${videoBuffer.length}`;
	}

	const uploadResponse = await fetch(presignedPutUrl, {
		method: "PUT",
		body: new Uint8Array(videoBuffer),
		headers: uploadHeaders,
	});

	if (!uploadResponse.ok) {
		throw new FatalError(
			`Failed to upload to S3: ${uploadResponse.status} ${uploadResponse.statusText}`,
		);
	}
}

async function completeImport(videoId: string): Promise<void> {
	"use step";

	await db()
		.delete(videoUploads)
		.where(eq(videoUploads.videoId, videoId as Video.VideoId));
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
			processingMessage: "Loom import failed",
			processingError: errorMessage,
			updatedAt: new Date(),
		})
		.where(eq(videoUploads.videoId, videoId as Video.VideoId));
}
