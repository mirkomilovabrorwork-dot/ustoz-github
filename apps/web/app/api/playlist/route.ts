import * as Db from "@cap/database/schema";
import {
	Database,
	provideOptionalAuth,
	Storage,
	Videos,
} from "@cap/web-backend";
import { Video } from "@cap/web-domain";
import {
	HttpApi,
	HttpApiBuilder,
	HttpApiEndpoint,
	HttpApiError,
	HttpApiGroup,
	HttpServerResponse,
} from "@effect/platform";
import { eq } from "drizzle-orm";
import { Effect, Layer, Option, Schema } from "effect";
import { apiToHandler } from "@/lib/server";
import { signedMediaUrl } from "@/lib/media-cdn";
import { CACHE_CONTROL_HEADERS } from "@/utils/helpers";

export const dynamic = "force-dynamic";

const GetPlaylistParams = Schema.Struct({
	videoId: Video.VideoId,
	videoType: Schema.Literal(
		"mp4",
		"raw-preview",
		"segments-master",
		"segments-video",
		"segments-audio",
	),
	requireComplete: Schema.OptionFromUndefinedOr(Schema.String),
	thumbnail: Schema.OptionFromUndefinedOr(Schema.String),
	fileType: Schema.OptionFromUndefinedOr(Schema.String),
});

class Api extends HttpApi.make("CapWebApi").add(
	HttpApiGroup.make("root").add(
		HttpApiEndpoint.get("getVideoSrc")`/api/playlist`
			.setUrlParams(GetPlaylistParams)
			.addError(HttpApiError.Forbidden)
			.addError(HttpApiError.BadRequest)
			.addError(HttpApiError.Unauthorized)
			.addError(HttpApiError.InternalServerError)
			.addError(HttpApiError.NotFound),
	),
) {}

const ApiLive = HttpApiBuilder.api(Api).pipe(
	Layer.provide(
		HttpApiBuilder.group(Api, "root", (handlers) =>
			Effect.gen(function* () {
				const storage = yield* Storage;
				const videos = yield* Videos;

				return handlers.handle("getVideoSrc", ({ urlParams }) =>
					Effect.gen(function* () {
						const [video] = yield* videos
							.getByIdForViewing(urlParams.videoId)
							.pipe(
								Effect.flatten,
								Effect.catchTag(
									"NoSuchElementException",
									() => new HttpApiError.NotFound(),
								),
							);

						return yield* getPlaylistResponse(video, urlParams);
					}).pipe(
						provideOptionalAuth,
						Effect.tapErrorCause(Effect.logError),
						Effect.catchTags({
							VerifyVideoPasswordError: () => new HttpApiError.Forbidden(),
							PolicyDenied: () => new HttpApiError.Unauthorized(),
							DatabaseError: () => new HttpApiError.InternalServerError(),
							StorageError: () => new HttpApiError.InternalServerError(),
							UnknownException: () => new HttpApiError.InternalServerError(),
						}),
						Effect.provideService(Storage, storage),
					),
				);
			}),
		),
	),
);

const resolveRawPreviewKey = (video: Video.Video) =>
	Effect.gen(function* () {
		const db = yield* Database;
		const [bucket] = yield* Storage.getAccessForVideo(video);
		const [uploadRecord] = yield* db.use((db) =>
			db
				.select({ rawFileKey: Db.videoUploads.rawFileKey })
				.from(Db.videoUploads)
				.where(eq(Db.videoUploads.videoId, video.id)),
		);

		if (uploadRecord?.rawFileKey) {
			return uploadRecord.rawFileKey;
		}

		if (
			video.source.type !== "webMP4" &&
			video.source.type !== "extensionWeb"
		) {
			return yield* Effect.fail(new HttpApiError.NotFound());
		}

		const candidateKeys = [
			`${video.ownerId}/${video.id}/raw-upload.mp4`,
			`${video.ownerId}/${video.id}/raw-upload.webm`,
		];
		const headResults = yield* Effect.all(
			candidateKeys.map((key) => bucket.headObject(key).pipe(Effect.option)),
			{ concurrency: "unbounded" },
		);
		for (const [index, candidateKey] of candidateKeys.entries()) {
			const rawHead = headResults[index];
			if (
				rawHead &&
				Option.isSome(rawHead) &&
				(rawHead.value.ContentLength ?? 0) > 0
			) {
				return candidateKey;
			}
		}

		return yield* Effect.fail(new HttpApiError.NotFound());
	});

const getPlaylistResponse = (
	video: Video.Video,
	urlParams: (typeof GetPlaylistParams)["Type"],
) =>
	Effect.gen(function* () {
		const [bucket, customBucket] = yield* Storage.getAccessForVideo(video);
		const isMp4Source =
			video.source.type === "desktopMP4" ||
			video.source.type === "webMP4" ||
			video.source.type === "extensionWeb";

		if (urlParams.videoType === "raw-preview") {
			const rawFileKey = yield* resolveRawPreviewKey(video);
			return yield* bucket
				.getSignedObjectUrl(rawFileKey)
				.pipe(Effect.map(HttpServerResponse.redirect));
		}

		if (
			urlParams.videoType === "segments-master" ||
			urlParams.videoType === "segments-video" ||
			urlParams.videoType === "segments-audio"
		) {
			const segSource = new Video.SegmentsSource({
				videoId: video.id,
				ownerId: video.ownerId,
			});

			const manifestKey = segSource.getManifestKey();
			const manifestContent = yield* bucket.getObject(manifestKey).pipe(
				Effect.andThen(
					Option.match({
						onNone: () => Effect.fail(new HttpApiError.NotFound()),
						onSome: (c) => Effect.succeed(c),
					}),
				),
			);

			let parsed: unknown;
			try {
				parsed = JSON.parse(manifestContent);
			} catch {
				return yield* Effect.fail(new HttpApiError.InternalServerError());
			}

			const manifest = yield* Schema.decodeUnknown(Video.SegmentManifest)(
				parsed,
			).pipe(Effect.mapError(() => new HttpApiError.InternalServerError()));
			const requireComplete = Option.match(urlParams.requireComplete, {
				onNone: () => false,
				onSome: (value) => value === "1" || value === "true",
			});
			if (requireComplete && !manifest.is_complete) {
				return yield* Effect.fail(new HttpApiError.NotFound());
			}
			const hasVideoSegments =
				manifest.video_init_uploaded && manifest.video_segments.length > 0;

			if (urlParams.videoType === "segments-master") {
				if (!hasVideoSegments) {
					return yield* Effect.fail(new HttpApiError.NotFound());
				}

				const videoPlaylistUrl = `/api/playlist?videoId=${video.id}&videoType=segments-video`;
				const requireCompleteSuffix = requireComplete
					? "&requireComplete=1"
					: "";
				const audioPlaylistUrl =
					manifest.audio_init_uploaded && manifest.audio_segments.length > 0
						? `/api/playlist?videoId=${video.id}&videoType=segments-audio${requireCompleteSuffix}`
						: null;

				let playlist =
					"#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-INDEPENDENT-SEGMENTS\n";
				if (audioPlaylistUrl) {
					playlist += `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="default",DEFAULT=YES,AUTOSELECT=YES,URI="${audioPlaylistUrl}"\n`;
					playlist += `#EXT-X-STREAM-INF:BANDWIDTH=2000000,AUDIO="audio"\n`;
				} else {
					playlist += "#EXT-X-STREAM-INF:BANDWIDTH=2000000\n";
				}
				playlist += `${videoPlaylistUrl}${requireCompleteSuffix}\n`;

				return HttpServerResponse.text(playlist, {
					headers: {
						...CACHE_CONTROL_HEADERS,
						"Content-Type": "application/vnd.apple.mpegurl",
					},
				});
			}

			const isVideo = urlParams.videoType === "segments-video";
			const initKey = isVideo
				? segSource.getVideoInitKey()
				: segSource.getAudioInitKey();
			const rawSegments = isVideo
				? manifest.video_segments
				: manifest.audio_segments;
			const segments = rawSegments.map(Video.normalizeSegmentEntry);
			const initUploaded = isVideo
				? manifest.video_init_uploaded
				: manifest.audio_init_uploaded;

			if (!initUploaded || segments.length === 0) {
				return yield* Effect.fail(new HttpApiError.NotFound());
			}

			const initUrl = yield* bucket.getSignedObjectUrl(initKey);
			const segmentUrls = yield* Effect.all(
				segments.map((seg) => {
					const key = isVideo
						? segSource.getVideoSegmentKey(seg.index)
						: segSource.getAudioSegmentKey(seg.index);
					return bucket.getSignedObjectUrl(key);
				}),
				{ concurrency: "unbounded" },
			);

			const targetDuration = Math.ceil(
				segments.reduce((max, seg) => Math.max(max, seg.duration), 0),
			);

			let playlist = `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-TARGETDURATION:${Math.max(targetDuration, 1)}\n#EXT-X-MEDIA-SEQUENCE:0\n`;
			if (manifest.is_complete) {
				playlist += "#EXT-X-PLAYLIST-TYPE:VOD\n";
			}
			playlist += `#EXT-X-MAP:URI="${initUrl}"\n`;

			for (let i = 0; i < segmentUrls.length; i++) {
				const dur = segments[i]?.duration ?? 3.0;
				playlist += `#EXTINF:${dur.toFixed(3)},\n`;
				playlist += `${segmentUrls[i]}\n`;
			}

			if (manifest.is_complete) {
				playlist += "#EXT-X-ENDLIST\n";
			}

			return HttpServerResponse.text(playlist, {
				headers: {
					...CACHE_CONTROL_HEADERS,
					"Content-Type": "application/vnd.apple.mpegurl",
				},
			});
		}

		if (bucket.provider === "s3" && Option.isNone(customBucket)) {
			let redirect = `${video.ownerId}/${video.id}/combined-source/stream.m3u8`;

			if (isMp4Source || urlParams.videoType === "mp4")
				redirect = `${video.ownerId}/${video.id}/result.mp4`;
			else if (video.source.type === "MediaConvert")
				redirect = `${video.ownerId}/${video.id}/output/video_recording_000.m3u8`;

			if (urlParams.videoType === "mp4") {
				const head = yield* bucket.headObject(redirect).pipe(Effect.option);
				const hasResult =
					Option.isSome(head) && (head.value.ContentLength ?? 0) > 0;
				if (!hasResult) {
					const rawKey = yield* resolveRawPreviewKey(video).pipe(Effect.option);
					if (Option.isSome(rawKey)) {
						return HttpServerResponse.redirect(
							yield* bucket.getSignedObjectUrl(rawKey.value),
						);
					}
				}
			}

			const isMp4Redirect = redirect.endsWith(".mp4");
			const cdnUrl = isMp4Redirect ? signedMediaUrl(redirect) : null;
			return HttpServerResponse.redirect(
				cdnUrl ?? (yield* bucket.getSignedObjectUrl(redirect)),
			);
		}

		if (
			Option.isSome(urlParams.fileType) &&
			urlParams.fileType.value === "transcription"
		) {
			return yield* bucket
				.getObject(`${video.ownerId}/${video.id}/transcription.vtt`)
				.pipe(
					Effect.andThen(
						Option.match({
							onNone: () => new HttpApiError.NotFound(),
							onSome: (c) =>
								HttpServerResponse.text(c).pipe(
									HttpServerResponse.setHeaders({
										...CACHE_CONTROL_HEADERS,
										"Content-Type": "text/vtt",
									}),
								),
						}),
					),
					Effect.withSpan("fetchTranscription"),
				);
		}

		if (
			Option.isSome(urlParams.fileType) &&
			urlParams.fileType.value === "enhanced-audio"
		) {
			const enhancedAudioKey = `${video.ownerId}/${video.id}/enhanced-audio.mp3`;
			return yield* bucket.getSignedObjectUrl(enhancedAudioKey).pipe(
				Effect.map(HttpServerResponse.redirect),
				Effect.catchTag("StorageError", () => new HttpApiError.NotFound()),
				Effect.withSpan("fetchEnhancedAudio"),
			);
		}

		yield* Effect.log("Resolving path with custom bucket");

		if (isMp4Source) {
			yield* Effect.log(
				`Returning path ${`${video.ownerId}/${video.id}/result.mp4`}`,
			);
			const mp4Key = `${video.ownerId}/${video.id}/result.mp4`;
			const cdnUrl = signedMediaUrl(mp4Key);
			if (cdnUrl !== null) {
				return HttpServerResponse.redirect(cdnUrl);
			}
			return yield* bucket
				.getSignedObjectUrl(mp4Key)
				.pipe(Effect.map(HttpServerResponse.redirect));
		}

		return yield* Effect.fail(new HttpApiError.NotFound());
	});

const handler = apiToHandler(ApiLive);

export const GET = (r: Request) => handler(r);
export const HEAD = (r: Request) => handler(r);
