import { updateIfDefined } from "@cap/database";
import * as Db from "@cap/database/schema";
import {
	Database,
	makeCurrentUserLayer,
	provideOptionalAuth,
	Storage,
	VideosPolicy,
	VideosRepo,
} from "@cap/web-backend";
import { Policy, Video } from "@cap/web-domain";
import { zValidator } from "@hono/zod-validator";
import { and, eq } from "drizzle-orm";
import { Effect, Option, Schedule } from "effect";
import { Hono, type MiddlewareHandler } from "hono";
import { z } from "zod";
import { withAuth } from "@/app/api/utils";
import { invalidateGoogleDriveStorageQuotaCache } from "@/lib/google-drive-storage-quota";
import { runPromise } from "@/lib/server";
import { checkUploadQuota } from "@/lib/storage-quota";
import { startVideoProcessingWorkflow } from "@/lib/video-processing";
import { stringOrNumberOptional } from "@/utils/zod";
import {
	getMultipartFileKey,
	getSubpath,
	isRawRecorderUpload,
} from "./multipart-utils";

export const app = new Hono().use(withAuth);

const runPromiseAnyEnv = runPromise as <A, E>(
	effect: Effect.Effect<A, E, unknown>,
) => Promise<A>;

const abortRequestSchema = z
	.object({
		uploadId: z.string(),
	})
	.and(
		z.union([
			z.object({ videoId: z.string(), subpath: z.string().optional() }),
			// deprecated
			z.object({ fileKey: z.string() }),
		]),
	);

type AbortRequestInput = z.input<typeof abortRequestSchema>;

type AbortValidatorInput = {
	in: { json: AbortRequestInput };
	out: { json: z.output<typeof abortRequestSchema> };
};

const abortRequestValidator = zValidator(
	"json",
	abortRequestSchema,
) as MiddlewareHandler<Record<string, never>, "/abort", AbortValidatorInput>;

app.post(
	"/initiate",
	zValidator(
		"json",
		z.object({ contentType: z.string() }).and(
			z.union([
				z.object({ videoId: z.string(), subpath: z.string().optional() }),
				// deprecated
				z.object({ fileKey: z.string() }),
			]),
		),
	),
	async (c) => {
		const { contentType, ...body } = c.req.valid("json");
		const user = c.get("user");

		const fileKey = getMultipartFileKey(user.id, body);

		const videoIdFromFileKey = fileKey.split("/")[1];
		const videoIdRaw = "videoId" in body ? body.videoId : videoIdFromFileKey;
		if (!videoIdRaw) return c.text("Video id not found", 400);
		const videoId = Video.VideoId.make(videoIdRaw);

		const resp = await Effect.gen(function* () {
			const repo = yield* VideosRepo;
			const policy = yield* VideosPolicy;
			const db = yield* Database;

			const video = yield* repo
				.getById(videoId)
				.pipe(Policy.withPolicy(policy.isOwner(videoId)));
			if (Option.isNone(video)) return yield* new Video.NotFoundError();

			yield* db.use((db) =>
				db
					.insert(Db.videoUploads)
					.values({
						videoId: video.value[0].id,
						mode: "multipart",
					})
					.onDuplicateKeyUpdate({
						set: {
							mode: "multipart",
							updatedAt: new Date(),
						},
					}),
			);
		}).pipe(
			Effect.tapError(Effect.logError),
			Effect.catchAll((e) => {
				if (e._tag === "VideoNotFoundError")
					return Effect.succeed<Response>(c.text("Video not found", 404));

				return Effect.succeed<Response>(
					c.json({ error: "Error initiating multipart upload" }, 500),
				);
			}),
			Effect.provide(makeCurrentUserLayer(user)),
			provideOptionalAuth,
			runPromiseAnyEnv,
		);
		if (resp) return resp;

		try {
			try {
				const uploadId = await Effect.gen(function* () {
					const repo = yield* VideosRepo;
					const policy = yield* VideosPolicy;
					const maybeVideo = yield* repo
						.getById(videoId)
						.pipe(Policy.withPolicy(policy.isOwner(videoId)));
					if (Option.isNone(maybeVideo)) {
						return yield* new Video.NotFoundError();
					}
					const [video] = maybeVideo.value;
					const [bucket] = yield* Storage.getAccessForVideo(video);

					const finalContentType = contentType || "video/mp4";
					console.log(
						`Creating multipart upload in bucket: ${bucket.bucketName}, content-type: ${finalContentType}, key: ${fileKey}`,
					);

					const { UploadId } = yield* bucket.multipart.create(fileKey, {
						ContentType: finalContentType,
						Metadata: {
							userId: user.id,
							source: "cap-multipart-upload",
						},
						CacheControl: "max-age=31536000",
					});

					if (!UploadId) {
						throw new Error("No UploadId returned from S3");
					}

					console.log(
						`Successfully initiated multipart upload with ID: ${UploadId}`,
					);
					console.log(
						`Upload details: Bucket=${bucket.bucketName}, Key=${fileKey}, ContentType=${finalContentType}`,
					);

					return { uploadId: UploadId, provider: bucket.provider };
				}).pipe(
					Effect.provide(makeCurrentUserLayer(user)),
					provideOptionalAuth,
					runPromiseAnyEnv,
				);

				return c.json(uploadId);
			} catch (s3Error) {
				console.error("S3 operation failed:", s3Error);
				throw new Error(
					`S3 operation failed: ${
						s3Error instanceof Error ? s3Error.message : "Unknown error"
					}`,
				);
			}
		} catch (error) {
			console.error("Error initiating multipart upload", error);
			return c.json(
				{
					error: "Error initiating multipart upload",
					details: error instanceof Error ? error.message : String(error),
				},
				500,
			);
		}
	},
);

app.post(
	"/presign-part",
	zValidator(
		"json",
		z
			.object({
				uploadId: z.string(),
				partNumber: z.number(),
				// deprecated
				md5Sum: z.string().optional(),
			})
			.and(
				z.union([
					z.object({ videoId: z.string(), subpath: z.string().optional() }),
					// deprecated
					z.object({ fileKey: z.string() }),
				]),
			),
	),
	async (c) => {
		const { uploadId, partNumber, ...body } = c.req.valid("json");
		const user = c.get("user");

		const fileKey = getMultipartFileKey(user.id, body);

		try {
			try {
				const presignedUrl = await Effect.gen(function* () {
					const videoIdFromFileKey = fileKey.split("/")[1];
					const videoIdRaw =
						"videoId" in body ? body.videoId : videoIdFromFileKey;
					if (!videoIdRaw) throw new Error("Video id not found");
					const videoId = Video.VideoId.make(videoIdRaw);
					const repo = yield* VideosRepo;
					const policy = yield* VideosPolicy;
					const maybeVideo = yield* repo
						.getById(videoId)
						.pipe(Policy.withPolicy(policy.isOwner(videoId)));
					if (Option.isNone(maybeVideo)) {
						return yield* new Video.NotFoundError();
					}
					const [video] = maybeVideo.value;
					const [bucket] = yield* Storage.getAccessForVideo(video);

					console.log(
						`Getting presigned URL for part ${partNumber} of upload ${uploadId}`,
					);

					const presignedUrl =
						yield* bucket.multipart.getPresignedUploadPartUrl(
							fileKey,
							uploadId,
							partNumber,
							{ ContentMD5: body.md5Sum },
						);

					return { presignedUrl, provider: bucket.provider };
				}).pipe(
					Effect.provide(makeCurrentUserLayer(user)),
					provideOptionalAuth,
					runPromiseAnyEnv,
				);

				return c.json(presignedUrl);
			} catch (s3Error) {
				console.error("S3 operation failed:", s3Error);
				throw new Error(
					`S3 operation failed: ${
						s3Error instanceof Error ? s3Error.message : "Unknown error"
					}`,
				);
			}
		} catch (error) {
			console.error("Error creating presigned URL for part", error);
			return c.json(
				{
					error: "Error creating presigned URL for part",
					details: error instanceof Error ? error.message : String(error),
				},
				500,
			);
		}
	},
);

app.post(
	"/complete",
	zValidator(
		"json",
		z
			.object({
				uploadId: z.string(),
				parts: z
					.array(
						z.object({
							partNumber: z.number(),
							etag: z.string(),
							size: z.number(),
						}),
					)
					// A completed multipart upload MUST have >=1 part; an empty array
					// is forwarded to S3 as a malformed completion and yields a broken
					// 0-byte object. Reject it cleanly instead (C8).
					.min(1, "A completed upload must include at least one part"),
				durationInSecs: stringOrNumberOptional,
				width: stringOrNumberOptional,
				height: stringOrNumberOptional,
				fps: stringOrNumberOptional,
			})
			.and(
				z.union([
					z.object({ videoId: z.string(), subpath: z.string().optional() }),
					// deprecated
					z.object({ fileKey: z.string() }),
				]),
			),
	),
	(c) => {
		const { uploadId, parts, ...body } = c.req.valid("json");
		const user = c.get("user");

		return Effect.gen(function* () {
			const repo = yield* VideosRepo;
			const policy = yield* VideosPolicy;
			const db = yield* Database;

			const fileKey = getMultipartFileKey(user.id, body);
			const subpath = getSubpath(body) ?? "result.mp4";

			const videoIdFromFileKey = fileKey.split("/")[1];
			const videoIdRaw = "videoId" in body ? body.videoId : videoIdFromFileKey;
			if (!videoIdRaw) return c.text("Video id not found", 400);
			const videoId = Video.VideoId.make(videoIdRaw);

			const maybeVideo = yield* repo
				.getById(videoId)
				.pipe(Policy.withPolicy(policy.isOwner(videoId)));
			if (Option.isNone(maybeVideo)) {
				c.status(404);
				return c.text(`Video '${encodeURIComponent(videoId)}' not found`);
			}
			const [video] = maybeVideo.value;

			return yield* Effect.gen(function* () {
				const [bucket] = yield* Storage.getAccessForVideo(video);
				const incomingBytes = parts.reduce((acc, part) => acc + part.size, 0);
				const quotaCheck = yield* Effect.promise(() =>
					checkUploadQuota({
						orgId: video.orgId,
						userId: video.ownerId,
						incomingBytes,
					}),
				);
				if (!quotaCheck.ok) {
					return c.json(
						{
							error: quotaCheck.message,
							reason: quotaCheck.reason,
						},
						413,
					);
				}

				const { result, formattedParts } = yield* Effect.gen(function* () {
					console.log(
						`Completing multipart upload ${uploadId} with ${parts.length} parts for key: ${fileKey}`,
					);

					const totalSize = parts.reduce((acc, part) => acc + part.size, 0);
					console.log(`Total size of all parts: ${totalSize} bytes`);

					const sortedParts = [...parts].sort(
						(a, b) => a.partNumber - b.partNumber,
					);

					const sequentialCheck = sortedParts.every(
						(part, index) => part.partNumber === index + 1,
					);

					if (!sequentialCheck) {
						console.warn(
							"WARNING: Part numbers are not sequential! This may cause issues with the assembled file.",
						);
					}

					const needsEtagResolution = sortedParts.some(
						(p) => !p.etag || p.etag === "RESOLVE_SERVER_SIDE",
					);

					let formattedParts: { PartNumber: number; ETag: string }[];

					if (needsEtagResolution) {
						// The browser-extension uploader cannot always read the ETag
						// response header from the cross-origin S3 PUT (it depends on the
						// bucket's CORS ExposeHeaders config), so it records a placeholder
						// "RESOLVE_SERVER_SIDE" ETag. Resolve those server-side via
						// listParts before completing — S3 rejects completion with a
						// placeholder/empty ETag, which would break the F006 retry path.
						console.log(
							"Client sent placeholder ETags — resolving real ETags via listParts",
						);

						const listed = yield* bucket.multipart.listParts(
							fileKey,
							uploadId,
						);
						const etagByPartNumber = new Map<number, string>();
						for (const part of listed.Parts ?? []) {
							if (part.PartNumber !== undefined && part.ETag) {
								etagByPartNumber.set(part.PartNumber, part.ETag);
							}
						}

						formattedParts = sortedParts.map((part) => {
							const isPlaceholder =
								!part.etag || part.etag === "RESOLVE_SERVER_SIDE";
							const resolvedEtag = isPlaceholder
								? etagByPartNumber.get(part.partNumber)
								: part.etag;

							if (!resolvedEtag) {
								throw new Error(
									`Unable to resolve ETag for part ${part.partNumber}; it was not found in the multipart upload`,
								);
							}

							return {
								PartNumber: part.partNumber,
								ETag: resolvedEtag,
							};
						});

						console.log(
							`Resolved ${formattedParts.length} part ETags via listParts`,
						);
					} else {
						formattedParts = sortedParts.map((part) => ({
							PartNumber: part.partNumber,
							ETag: part.etag,
						}));
					}

					console.log(
						"Sending to S3:",
						JSON.stringify(
							{
								Bucket: bucket.bucketName,
								Key: fileKey,
								UploadId: uploadId,
								Parts: formattedParts,
							},
							null,
							2,
						),
					);

					const result = yield* bucket.multipart.complete(fileKey, uploadId, {
						MultipartUpload: {
							Parts: formattedParts,
						},
						...(bucket.provider === "googleDrive"
							? { MpuObjectSize: totalSize }
							: {}),
					});
					yield* Effect.promise(() =>
						invalidateGoogleDriveStorageQuotaCache(
							Option.getOrNull(video.storageIntegrationId),
						),
					);

					return { result, formattedParts };
				});

				return yield* Effect.gen(function* () {
					console.log(
						`Multipart upload completed successfully: ${
							result.Location || "no location"
						}`,
					);
					console.log(`Complete response: ${JSON.stringify(result, null, 2)}`);

					yield* bucket.headObject(fileKey).pipe(
						Effect.tap((headResult) =>
							Effect.log(
								`Object verification successful: ContentType=${headResult.ContentType}, ContentLength=${headResult.ContentLength}`,
							),
						),
						Effect.retry({
							times: 3,
							schedule: Schedule.exponential("50 millis"),
						}),
						Effect.catchAll((headError) =>
							Effect.logError(`Warning: Unable to verify object: ${headError}`),
						),
					);

					if (isRawRecorderUpload(subpath)) {
						yield* db.use((db) =>
							db.transaction(() =>
								Promise.all([
									db
										.update(Db.videos)
										.set({
											duration: updateIfDefined(
												body.durationInSecs,
												Db.videos.duration,
											),
											width: updateIfDefined(body.width, Db.videos.width),
											height: updateIfDefined(body.height, Db.videos.height),
											fps: updateIfDefined(body.fps, Db.videos.fps),
										})
										.where(
											and(
												eq(Db.videos.id, Video.VideoId.make(videoId)),
												eq(Db.videos.ownerId, user.id),
											),
										),
									db
										.update(Db.videoUploads)
										.set({
											uploaded: incomingBytes,
											total: incomingBytes,
											updatedAt: new Date(),
										})
										.where(
											eq(Db.videoUploads.videoId, Video.VideoId.make(videoId)),
										),
								]),
							),
						);

						const processingStarted = yield* Effect.tryPromise(() =>
							startVideoProcessingWorkflow({
								videoId: Video.VideoId.make(videoId),
								userId: user.id,
								rawFileKey: fileKey,
								bucketId: Option.getOrNull(video.bucketId),
								processingMessage: "Starting video processing...",
								startFailureMessage:
									"Video uploaded, but processing could not start.",
								mode: "multipart",
							}),
						).pipe(
							Effect.map(() => true),
							Effect.catchAll((error) =>
								Effect.logError(
									"Failed to start video processing workflow after raw upload completion",
									error,
								).pipe(Effect.map(() => false)),
							),
						);

						return c.json({
							location: result.Location,
							success: true,
							fileKey,
							processingStarted,
						});
					}

					if (bucket.provider === "s3") {
						console.log(
							"Performing metadata fix by copying the object to itself...",
						);

						yield* bucket
							.copyObject(`${bucket.bucketName}/${fileKey}`, fileKey, {
								ContentType: "video/mp4",
								MetadataDirective: "REPLACE",
							})
							.pipe(
								Effect.tap((result) =>
									Effect.log("Copy for metadata fix successful:", result),
								),
								Effect.catchAll((e) =>
									Effect.logError(
										"Warning: Failed to copy object to fix metadata:",
										e,
									),
								),
								Effect.retry({
									times: 3,
									schedule: Schedule.exponential("50 millis"),
								}),
							);
					}

					yield* db.use((db) =>
						db.transaction(() =>
							Promise.all([
								db
									.update(Db.videos)
									.set({
										duration: updateIfDefined(
											body.durationInSecs,
											Db.videos.duration,
										),
										width: updateIfDefined(body.width, Db.videos.width),
										height: updateIfDefined(body.height, Db.videos.height),
										fps: updateIfDefined(body.fps, Db.videos.fps),
									})
									.where(
										and(
											eq(Db.videos.id, Video.VideoId.make(videoId)),
											eq(Db.videos.ownerId, user.id),
										),
									),
								db
									.delete(Db.videoUploads)
									.where(
										eq(Db.videoUploads.videoId, Video.VideoId.make(videoId)),
									),
							]),
						),
					);

					// P6.3: Faststart remux via media server removed — browsers produce seekable MP4 with H.264 codec

					return c.json({
						location: result.Location,
						success: true,
						fileKey,
					});
				}).pipe(
					Effect.catchAllCause((completeError) => {
						console.error(
							"Failed to complete multipart upload:",
							completeError,
						);
						return Effect.succeed(
							c.json(
								{
									error: "Failed to complete multipart upload",
									details:
										completeError instanceof Error
											? completeError.message
											: String(completeError),
									uploadId,
									fileKey,
									parts: formattedParts.length,
								},
								500,
							),
						);
					}),
				);
			}).pipe(
				Effect.catchAll((error) => {
					console.error("Multipart upload failed:", error);

					return Effect.succeed(
						c.json(
							{
								error: "Error completing multipart upload",
								details: error instanceof Error ? error.message : String(error),
							},
							500,
						),
					);
				}),
			);
		}).pipe(
			Effect.provide(makeCurrentUserLayer(user)),
			provideOptionalAuth,
			runPromiseAnyEnv,
		);
	},
);

app.post("/abort", abortRequestValidator, (c) => {
	const { uploadId, ...body } = c.req.valid("json");
	const user = c.get("user");

	const fileKey = getMultipartFileKey(user.id, body);

	const videoIdFromFileKey = fileKey.split("/")[1];
	const videoIdRaw = "videoId" in body ? body.videoId : videoIdFromFileKey;
	if (!videoIdRaw) return c.text("Video id not found", 400);
	const videoId = Video.VideoId.make(videoIdRaw);

	return Effect.gen(function* () {
		const repo = yield* VideosRepo;
		const policy = yield* VideosPolicy;
		const db = yield* Database;

		const maybeVideo = yield* repo
			.getById(videoId)
			.pipe(Policy.withPolicy(policy.isOwner(videoId)));
		if (Option.isNone(maybeVideo)) {
			c.status(404);
			return c.text(`Video '${encodeURIComponent(videoId)}' not found`);
		}
		const [video] = maybeVideo.value;

		const [bucket] = yield* Storage.getAccessForVideo(video);
		type MultipartWithAbort = typeof bucket.multipart & {
			abort: (
				...args: Parameters<typeof bucket.multipart.complete>
			) => ReturnType<typeof bucket.multipart.complete>;
		};
		const multipart = bucket.multipart as MultipartWithAbort;

		console.log(`Aborting multipart upload ${uploadId} for key: ${fileKey}`);
		yield* multipart.abort(fileKey, uploadId);

		yield* db.use((db) =>
			db.delete(Db.videoUploads).where(eq(Db.videoUploads.videoId, videoId)),
		);

		return c.json({ success: true, fileKey, uploadId });
	}).pipe(
		Effect.catchAll((error) => {
			console.error("Failed to abort multipart upload:", error);

			return Effect.succeed(
				c.json(
					{
						error: "Failed to abort multipart upload",
						details: error instanceof Error ? error.message : String(error),
					},
					500,
				),
			);
		}),
		Effect.provide(makeCurrentUserLayer(user)),
		provideOptionalAuth,
		runPromiseAnyEnv,
	);
});
