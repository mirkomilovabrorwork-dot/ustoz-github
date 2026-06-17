import { promises as fs } from "node:fs";
import { resolve } from "node:path";
import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import {
	organizationMembers,
	organizations,
	users,
	videos,
} from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { Storage } from "@cap/web-backend";
import { type Organisation, type User, Video } from "@cap/web-domain";
import { and, eq, or, sql } from "drizzle-orm";
import { runPromise } from "@/lib/server";
import { decodeStorageVideo } from "@/lib/video-storage";

async function main() {
	const emailArgIndex = process.argv.indexOf("--user");
	if (emailArgIndex === -1 || !process.argv[emailArgIndex + 1]) {
		console.error("Usage: tsx scripts/seed-demo-video.ts --user <email>");
		process.exit(1);
	}

	const email = process.argv[emailArgIndex + 1] ?? "";

	const [user] = await db()
		.select()
		.from(users)
		.where(eq(users.email, email))
		.limit(1);

	if (!user) {
		console.error(`No user found with email: ${email}`);
		process.exit(1);
	}

	const userOrganizations = await db()
		.select({ id: organizations.id })
		.from(organizations)
		.leftJoin(
			organizationMembers,
			eq(organizations.id, organizationMembers.organizationId),
		)
		.where(
			or(
				eq(organizations.ownerId, user.id),
				eq(organizationMembers.userId, user.id),
			),
		)
		.groupBy(organizations.id)
		.orderBy(organizations.createdAt);

	const orgId = userOrganizations[0]?.id;
	if (!orgId) {
		console.error(`User ${email} has no organizations`);
		process.exit(1);
	}

	const oldDemoVideos = await db()
		.select({ id: videos.id })
		.from(videos)
		.where(
			and(
				eq(videos.ownerId, user.id as User.UserId),
				sql`JSON_EXTRACT(${videos.metadata}, '$.isDemo') = true`,
			),
		);

	await db()
		.delete(videos)
		.where(
			and(
				eq(videos.ownerId, user.id as User.UserId),
				sql`JSON_EXTRACT(${videos.metadata}, '$.isDemo') = true`,
			),
		);

	if (oldDemoVideos.length > 0 && serverEnv().CAP_AWS_ACCESS_KEY) {
		for (const oldVideo of oldDemoVideos) {
			try {
				const dummyVideoRecord = {
					id: oldVideo.id as Video.VideoId,
					ownerId: user.id,
					orgId: orgId as Organisation.OrganisationId,
				};
				const [bucket] = await Storage.getAccessForVideo(
					decodeStorageVideo(dummyVideoRecord as any),
				).pipe(runPromise);

				await bucket
					.deleteObject(`${user.id}/${oldVideo.id}/transcription.vtt`)
					.pipe(runPromise);
				console.log(
					`Deleted old demo transcript: ${user.id}/${oldVideo.id}/transcription.vtt`,
				);
			} catch (error) {
				console.warn(
					`Failed to delete old demo transcript for ${oldVideo.id}:`,
					error,
				);
			}
		}
	}

	const videoId = Video.VideoId.make(nanoId());

	await db()
		.insert(videos)
		.values({
			id: videoId,
			name: "Sample meeting — Q3 planning",
			ownerId: user.id as User.UserId,
			orgId: orgId as Organisation.OrganisationId,
			duration: 30,
			source: { type: "local" as const },
			metadata: {
				isDemo: true,
				aiTitle: "Sample meeting — Q3 planning",
				summary:
					"Q3 planning meeting covering product roadmap, engineering milestones (browser extension shipped), growth targets (50% increase in active recordings, mobile app launch), and action items for PM and design team.",
				aiGenerationStatus: "COMPLETE" as const,
			},
			transcriptionStatus: "COMPLETE",
			public: true,
			skipProcessing: true,
		});

	if (serverEnv().CAP_AWS_ACCESS_KEY) {
		try {
			const transcriptPath = resolve(
				__dirname,
				"../public/demo/cap-demo-transcript.vtt",
			);
			const transcriptContent = await fs.readFile(transcriptPath, "utf-8");

			const dummyVideoRecord = {
				id: videoId,
				ownerId: user.id,
				orgId: orgId as Organisation.OrganisationId,
			};
			const [bucket] = await Storage.getAccessForVideo(
				decodeStorageVideo(dummyVideoRecord as any),
			).pipe(runPromise);

			await bucket
				.putObject(
					`${user.id}/${videoId}/transcription.vtt`,
					transcriptContent,
					{
						contentType: "text/vtt",
					},
				)
				.pipe(runPromise);

			console.log(
				`Demo transcript uploaded: ${user.id}/${videoId}/transcription.vtt`,
			);
		} catch (error) {
			console.error("Failed to upload demo transcript to S3:", error);
			process.exit(1);
		}
	} else {
		console.warn(
			"S3 not configured — skipping demo transcript upload; Transcript tab will be empty",
		);
	}

	console.log(`Demo video seeded: ${videoId} for user ${email}`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
