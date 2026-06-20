import * as Db from "@cap/database/schema";
import type { Space, User } from "@cap/web-domain";
import { Video } from "@cap/web-domain";
import * as Dz from "drizzle-orm";
import { Array, Effect, Option } from "effect";

import { Database } from "../Database.ts";

const SPACE_PASSWORD_REQUIRED = "__cap_space_password_required__";

export class SpacesRepo extends Effect.Service<SpacesRepo>()("SpacesRepo", {
	effect: Effect.gen(function* () {
		const db = yield* Database;

		return {
			membershipForVideo: (userId: User.UserId, videoId: Video.VideoId) =>
				db
					.use((db) =>
						db
							.select({ membershipId: Db.spaceMembers.id })
							.from(Db.spaceMembers)
							.leftJoin(
								Db.spaceVideos,
								Dz.eq(Db.spaceMembers.spaceId, Db.spaceVideos.spaceId),
							)
							.where(
								Dz.and(
									Dz.eq(Db.spaceMembers.userId, userId),
									Dz.eq(Db.spaceVideos.videoId, videoId),
								),
							),
					)
					.pipe(Effect.map(Array.get(0))),

			passwordsForVideo: (videoId: Video.VideoId) =>
				Effect.gen(function* () {
					const passwordAttachment = yield* Effect.serviceOption(
						Video.VideoPasswordAttachment,
					);
					const verified = Option.isSome(passwordAttachment)
						? passwordAttachment.value.passwords
						: [];
					const passwordMatches =
						verified.length > 0
							? Dz.inArray(Db.spaces.password, [...verified])
							: Dz.sql<boolean>`false`;

					const spaces = yield* db.use((db) =>
						db
							.select({
								hasPassword:
									Dz.sql<boolean>`${Db.spaces.password} IS NOT NULL`.mapWith(
										Boolean,
									),
								passwordMatches: passwordMatches.mapWith(Boolean),
							})
							.from(Db.spaceVideos)
							.innerJoin(
								Db.spaces,
								Dz.eq(Db.spaceVideos.spaceId, Db.spaces.id),
							)
							.where(Dz.eq(Db.spaceVideos.videoId, videoId)),
					);

					return spaces.map((space) => ({
						password: space.passwordMatches
							? (verified[0] ?? null)
							: space.hasPassword
								? SPACE_PASSWORD_REQUIRED
								: null,
					}));
				}),

			membership: (
				userId: User.UserId,
				spaceId: Space.SpaceIdOrOrganisationId,
			) =>
				db
					.use((db) =>
						db
							.select({
								membershipId: Db.spaceMembers.id,
								role: Db.spaceMembers.role,
							})
							.from(Db.spaceMembers)
							.where(
								Dz.and(
									Dz.eq(Db.spaceMembers.userId, userId),
									Dz.eq(Db.spaceMembers.spaceId, spaceId),
								),
							),
					)
					.pipe(Effect.map(Array.get(0))),

			getById: (spaceId: Space.SpaceIdOrOrganisationId) =>
				db
					.use((db) =>
						db.select().from(Db.spaces).where(Dz.eq(Db.spaces.id, spaceId)),
					)
					.pipe(Effect.map(Array.get(0))),
		};
	}),
	dependencies: [Database.Default],
}) {}
