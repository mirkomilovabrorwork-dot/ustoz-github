import { nanoId } from "@cap/database/helpers";
import * as Db from "@cap/database/schema";
import { Video } from "@cap/web-domain";
import * as Dz from "drizzle-orm";
import type { AnyMySqlInsert } from "drizzle-orm/mysql-core";
import { Effect, Option } from "effect";
import type { Schema } from "effect/Schema";
import { Database } from "../Database.ts";

export type CreateVideoInput = Omit<
	Schema.Type<typeof Video.Video>,
	"id" | "createdAt" | "updatedAt"
> & { password?: string; importSource?: Video.ImportSource };

export class VideosRepo extends Effect.Service<VideosRepo>()("VideosRepo", {
	effect: Effect.gen(function* () {
		const db = yield* Database;

		/**
		 * Gets a `Video` and its accompanying password if available.
		 *
		 * The password is returned separately as the `Video` class is client-safe
		 */
		const getById = (id: Video.VideoId) =>
			Effect.gen(function* () {
				const [video] = yield* db.use((db) =>
					db
						.select()
						.from(Db.videos)
						.where(
							Dz.and(
								Dz.eq(Db.videos.id, id),
								Dz.isNull(Db.videos.deletedAt),
							),
						),
				);

				return Option.fromNullable(video).pipe(
					Option.map(
						(v) =>
							[
								Video.Video.decodeSync({
									...v,
									bucketId: v.bucket,
									storageIntegrationId: v.storageIntegrationId,
									createdAt: v.createdAt.toISOString(),
									updatedAt: v.updatedAt.toISOString(),
									metadata: v.metadata as any,
								}),
								Option.fromNullable(video?.password),
							] as const,
					),
				);
			});

		const delete_ = (id: Video.VideoId) =>
			db.use(async (db) => {
				await db.transaction(async (db) => {
					await Promise.all([
						db.delete(Db.importedVideos).where(Dz.eq(Db.importedVideos.id, id)),
						db.delete(Db.videos).where(Dz.eq(Db.videos.id, id)),
						db
							.delete(Db.videoUploads)
							.where(Dz.eq(Db.videoUploads.videoId, id)),
					]);
				});
			});

		const create = (data: CreateVideoInput) =>
			Effect.gen(function* () {
				const id = Video.VideoId.make(nanoId());

				yield* db.use((db) =>
					db.transaction(async (db) => {
						const {
							ownerId,
							orgId,
							name,
							public: isPublic,
							source,
							metadata,
							bucketId,
							storageIntegrationId,
							folderId,
							transcriptionStatus,
							width,
							height,
							duration,
							password,
						} = data;

						// The DB `source` column models the `extensionWeb` variant with
						// extra fields (`context`, `meetingId`, `sourceUrl`) that the
						// client-safe domain `Video.source` schema does not carry. Map the
						// domain value onto the DB shape explicitly so the variant that
						// needs `context` is constructed with a valid value.
						const dbSource: typeof Db.videos.$inferInsert["source"] =
							source.type === "extensionWeb"
								? { type: "extensionWeb", context: "instruction" }
								: { type: source.type };

						const promises: AnyMySqlInsert[] = [
							db.insert(Db.videos).values([
								{
									id,
									ownerId,
									orgId,
									name,
									public: isPublic,
									source: dbSource,
									metadata: Option.getOrNull(metadata ?? Option.none()),
									bucket: Option.getOrNull(bucketId ?? Option.none()),
									storageIntegrationId: Option.getOrNull(
										storageIntegrationId ?? Option.none(),
									),
									transcriptionStatus: Option.getOrNull(
										transcriptionStatus ?? Option.none(),
									),
									folderId: Option.getOrNull(folderId ?? Option.none()),
									width: Option.getOrNull(width ?? Option.none()),
									height: Option.getOrNull(height ?? Option.none()),
									duration: Option.getOrNull(duration ?? Option.none()),
									...(password !== undefined ? { password } : {}),
								},
							]),
						];

						if (data.importSource)
							promises.push(
								db.insert(Db.importedVideos).values([
									{
										id,
										orgId: data.orgId,
										source: data.importSource.source,
										sourceId: data.importSource.id,
									},
								]),
							);

						await Promise.all(promises);
					}),
				);

				return id;
			});

		return { getById, delete: delete_, create };
	}),
	dependencies: [Database.Default],
}) {}
