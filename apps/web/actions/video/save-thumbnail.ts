"use server";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { eq } from "drizzle-orm";

let cachedClient: S3Client | null = null;
function getClient(): S3Client {
	if (cachedClient) return cachedClient;
	const env = serverEnv();
	if (!env.CAP_AWS_ACCESS_KEY || !env.CAP_AWS_SECRET_KEY) {
		throw new Error("S3 credentials missing");
	}
	cachedClient = new S3Client({
		endpoint: env.S3_INTERNAL_ENDPOINT ?? env.S3_PUBLIC_ENDPOINT,
		region: env.CAP_AWS_REGION,
		credentials: {
			accessKeyId: env.CAP_AWS_ACCESS_KEY,
			secretAccessKey: env.CAP_AWS_SECRET_KEY,
		},
		forcePathStyle: true,
	});
	return cachedClient;
}

const MAX_THUMBNAIL_BYTES = 256 * 1024;

function dataUrlToBuffer(dataUrl: string): {
	buffer: Buffer;
	contentType: string;
} | null {
	const match =
		/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
	if (!match) return null;
	const contentType = match[1];
	const base64 = match[2];
	if (!contentType || !base64) return null;
	const buffer = Buffer.from(base64, "base64");
	if (buffer.length > MAX_THUMBNAIL_BYTES) return null;
	return { buffer, contentType };
}

export async function saveCapturedThumbnail(args: {
	videoId: string;
	dataUrl: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
	const user = await getCurrentUser();
	if (!user?.id) return { ok: false, reason: "unauthorized" };

	const [video] = await db()
		.select({ id: videos.id, ownerId: videos.ownerId })
		.from(videos)
		.where(eq(videos.id, args.videoId as typeof videos.$inferSelect.id))
		.limit(1);

	if (!video) return { ok: false, reason: "video_not_found" };
	if (video.ownerId !== user.id) return { ok: false, reason: "forbidden" };

	const decoded = dataUrlToBuffer(args.dataUrl);
	if (!decoded) return { ok: false, reason: "invalid_data_url" };

	const client = getClient();
	const bucket = serverEnv().CAP_AWS_BUCKET;
	const key = `${video.ownerId}/${video.id}/screenshot/screen-capture.jpg`;

	try {
		await client.send(
			new PutObjectCommand({
				Bucket: bucket,
				Key: key,
				Body: decoded.buffer,
				ContentType: decoded.contentType,
				CacheControl: "public, max-age=31536000, immutable",
			}),
		);
		return { ok: true };
	} catch (err) {
		console.error("[save-thumbnail] put failed", {
			videoId: args.videoId,
			err: err instanceof Error ? err.message : String(err),
		});
		return { ok: false, reason: "upload_failed" };
	}
}
