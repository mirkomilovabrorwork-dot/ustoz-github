import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { videos } from "@cap/database/schema";
import { makeCurrentUserLayer, Storage, VideosPolicy } from "@cap/web-backend";
import { Policy, Video } from "@cap/web-domain";
import { and, eq, isNull } from "drizzle-orm";
import { Effect } from "effect";
import type { NextRequest } from "next/server";
import { runPromise } from "@/lib/server";
import { decodeStorageVideo } from "@/lib/video-storage";
import { getHeaders } from "@/utils/helpers";

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const videoId = searchParams.get("videoId");
	const origin = request.headers.get("origin") as string;

	if (!videoId)
		return new Response(
			JSON.stringify({
				error: true,
				message: "userId or videoId not supplied",
			}),
			{
				status: 400,
				headers: getHeaders(origin),
			},
		);

	const user = await getCurrentUser();
	const viewPolicy = Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;
		return yield* Effect.succeed(true).pipe(
			Policy.withPublicPolicy(
				videosPolicy.canView(Video.VideoId.make(videoId)),
			),
		);
	});
	const canView = await (user
		? viewPolicy.pipe(Effect.provide(makeCurrentUserLayer(user)))
		: viewPolicy
	).pipe(Effect.catchAll(() => Effect.succeed(false)), runPromise);

	if (!canView)
		return new Response(JSON.stringify({ error: true, message: "Forbidden" }), {
			status: 403,
			headers: getHeaders(origin),
		});

	const [query] = await db()
		.select()
		.from(videos)
		.where(and(eq(videos.id, Video.VideoId.make(videoId)), isNull(videos.deletedAt)));

	if (!query)
		return new Response(
			JSON.stringify({ error: true, message: "Video not found" }),
			{
				status: 404,
				headers: getHeaders(origin),
			},
		);

	const video = decodeStorageVideo(query);

	const prefix = `${video.ownerId}/${video.id}/`;

	try {
		const [bucket] = await Storage.getAccessForVideo(video).pipe(runPromise);

		const listResponse = await bucket
			.listObjects({ prefix: prefix })
			.pipe(runPromise);
		const contents = listResponse.Contents || [];

		const thumbnailKey = contents.find((item) =>
			item.Key?.endsWith("screen-capture.jpg"),
		)?.Key;

		if (!thumbnailKey)
			return new Response(
				JSON.stringify({
					error: true,
					message: "No thumbnail found for this video",
				}),
				{
					status: 404,
					headers: getHeaders(origin),
				},
			);

		const thumbnailUrl = await bucket
			.getSignedObjectUrl(thumbnailKey)
			.pipe(runPromise);

		return new Response(JSON.stringify({ screen: thumbnailUrl }), {
			status: 200,
			headers: getHeaders(origin),
		});
	} catch (error) {
		return new Response(
				JSON.stringify({
					error: true,
					message: "Error generating thumbnail URL",
				}),
				{
					status: 500,
				headers: getHeaders(origin),
			},
		);
	}
}
