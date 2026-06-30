import {
	GetObjectCommand,
	HeadObjectCommand,
	S3Client,
} from "@aws-sdk/client-s3";
import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos, videoUploads } from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { eq } from "drizzle-orm";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let cachedClient: S3Client | null = null;
function getClient(): S3Client {
	if (cachedClient) return cachedClient;
	const env = serverEnv();
	if (!env.CAP_AWS_ACCESS_KEY || !env.CAP_AWS_SECRET_KEY) {
		throw new Error("CAP_AWS_ACCESS_KEY / CAP_AWS_SECRET_KEY are required");
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

const ACTIVE_PHASES = new Set([
	"uploading",
	"processing",
	"generating_thumbnail",
]);

async function resolveKey(
	video: typeof videos.$inferSelect,
): Promise<string | null> {
	const candidates = [
		`${video.ownerId}/${video.id}/result.mp4`,
		`${video.ownerId}/${video.id}/raw-upload.mp4`,
		`${video.ownerId}/${video.id}/raw-upload.webm`,
	];

	const [uploadRow] = await db()
		.select({ rawFileKey: videoUploads.rawFileKey, phase: videoUploads.phase })
		.from(videoUploads)
		.where(eq(videoUploads.videoId, video.id))
		.limit(1);

	if (uploadRow?.rawFileKey) candidates.unshift(uploadRow.rawFileKey);

	const client = getClient();
	const bucket = serverEnv().CAP_AWS_BUCKET;
	for (const Key of candidates) {
		try {
			const head = await client.send(
				new HeadObjectCommand({ Bucket: bucket, Key }),
			);
			if ((head.ContentLength ?? 0) > 0) return Key;
		} catch {
			// not found, try next
		}
	}
	return null;
}

export async function GET(
	request: NextRequest,
	props: { params: Promise<{ videoId: string }> },
): Promise<Response> {
	const { videoId } = await props.params;
	const user = await getCurrentUser();
	if (!user?.id) {
		return new Response("Unauthorized", { status: 401 });
	}

	const [video] = await db()
		.select()
		.from(videos)
		.where(eq(videos.id, videoId as typeof videos.$inferSelect.id))
		.limit(1);

	if (!video || video.ownerId !== user.id) {
		return new Response("Not found", { status: 404 });
	}

	const key = await resolveKey(video);
	if (!key) return new Response("Source not found", { status: 404 });

	const client = getClient();
	const bucket = serverEnv().CAP_AWS_BUCKET;
	const range = request.headers.get("range") ?? undefined;

	try {
		const obj = await client.send(
			new GetObjectCommand({
				Bucket: bucket,
				Key: key,
				...(range ? { Range: range } : {}),
			}),
		);

		const headers = new Headers();
		const contentType =
			obj.ContentType ?? (key.endsWith(".webm") ? "video/webm" : "video/mp4");
		headers.set("Content-Type", contentType);
		headers.set("Accept-Ranges", "bytes");
		if (obj.ContentLength != null) {
			headers.set("Content-Length", String(obj.ContentLength));
		}
		if (obj.ContentRange) headers.set("Content-Range", obj.ContentRange);
		headers.set("Cache-Control", "private, max-age=300");

		const status = range && obj.ContentRange ? 206 : 200;
		const body = obj.Body as unknown as ReadableStream | null;
		return new Response(body, { status, headers });
	} catch (err) {
		console.error("[video-proxy] GET failed", {
			videoId,
			key,
			err: err instanceof Error ? err.message : String(err),
		});
		return new Response("Upstream error", { status: 502 });
	}
}
