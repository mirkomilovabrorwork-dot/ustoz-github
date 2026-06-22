import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import {
	comments,
	organizations,
	sharedVideos,
	spaces,
	spaceVideos,
	users,
	videos,
	videoUploads,
} from "@cap/database/schema";
import type { VideoMetadata } from "@cap/database/types";
import { buildEnv } from "@cap/env";
import {
	provideOptionalAuth,
	resolveEffectiveVideoRules,
	Videos,
	VideosPolicy,
} from "@cap/web-backend";
import { type Organisation, Policy, type Video } from "@cap/web-domain";
import { and, eq, isNull, sql } from "drizzle-orm";
import { Effect, Option } from "effect";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import * as EffectRuntime from "@/lib/server";
import { EmbedVideo } from "./_components/EmbedVideo";
import { PasswordOverlay } from "./_components/PasswordOverlay";

export async function generateMetadata(
	props: PageProps<"/embed/[videoId]">,
): Promise<Metadata> {
	const params = await props.params;
	const videoId = params.videoId as Video.VideoId;

	return Effect.flatMap(Videos, (v) => v.getByIdForViewing(videoId)).pipe(
		Effect.map(
			Option.match({
				onNone: () => notFound(),
				onSome: ([video]) => ({
					title: `${video.name} | data365`,
					description: "Watch this video on 365",
					openGraph: {
						images: [
							{
								url: new URL(
									`/api/video/og?videoId=${videoId}`,
									buildEnv.NEXT_PUBLIC_WEB_URL,
								).toString(),
								width: 1200,
								height: 630,
							},
						],
						videos: [
							{
								url: new URL(
									`/api/playlist?userId=${video.ownerId}&videoId=${video.id}`,
									buildEnv.NEXT_PUBLIC_WEB_URL,
								).toString(),
								width: 1280,
								height: 720,
								type: "video/mp4",
							},
						],
					},
					twitter: {
						card: "player",
						title: `${video.name} | data365`,
						description: "Watch this video on 365",
						images: [
							new URL(
								`/api/video/og?videoId=${videoId}`,
								buildEnv.NEXT_PUBLIC_WEB_URL,
							).toString(),
						],
						players: {
							playerUrl: new URL(
								`/embed/${videoId}`,
								buildEnv.NEXT_PUBLIC_WEB_URL,
							).toString(),
							streamUrl: new URL(
								`/api/playlist?userId=${video.ownerId}&videoId=${video.id}`,
								buildEnv.NEXT_PUBLIC_WEB_URL,
							).toString(),
							width: 1280,
							height: 720,
						},
					},
					robots: "index, follow",
				}),
			}),
		),
		Effect.catchTags({
			PolicyDenied: () =>
				Effect.succeed({
					title: "data365: This video is private",
					description: "This video is private and cannot be shared.",
					robots: "noindex, nofollow",
				}),
			VerifyVideoPasswordError: () =>
				Effect.succeed({
					title: "data365: Password Protected Video",
					description: "This video is password protected.",
					robots: "noindex, nofollow",
				}),
		}),
		provideOptionalAuth,
		EffectRuntime.runPromise,
	);
}

const renderEmbedPolicyDenied = () =>
	Effect.succeed(
		<div className="flex flex-col justify-center items-center min-h-screen text-center text-white bg-black px-6">
			<div className="flex items-center justify-center w-14 h-14 rounded-full bg-white/10 mb-5">
				<svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
					<path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75A4.5 4.5 0 0 0 7.5 6.75v3.75m-.75 0h10.5A1.5 1.5 0 0 1 18.75 12v6a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5Z" />
				</svg>
			</div>
			<h1 className="mb-2 text-xl font-bold">This video is private</h1>
			<p className="text-gray-400 mb-6 max-w-xs text-sm leading-relaxed">
				If you own this video, sign in to manage sharing settings.
			</p>
			<Link
				href="/login"
				className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
			>
				Sign in
			</Link>
		</div>,
	);

const renderNoSuchElement = () => Effect.sync(() => notFound());

export default async function EmbedVideoPage(
	props: PageProps<"/embed/[videoId]">,
) {
	const params = await props.params;
	const searchParams = await props.searchParams;
	const videoId = params.videoId as Video.VideoId;
	const autoplay = searchParams.autoplay === "true";

	return Effect.gen(function* () {
		const videosPolicy = yield* VideosPolicy;

		const [video] = yield* Effect.promise(() =>
			db()
				.select({
					id: videos.id,
					name: videos.name,
					ownerId: videos.ownerId,
					orgId: videos.orgId,
					settings: videos.settings,
					createdAt: videos.createdAt,
					effectiveCreatedAt: videos.effectiveCreatedAt,
					updatedAt: videos.updatedAt,
					bucket: videos.bucket,
					storageIntegrationId: videos.storageIntegrationId,
					metadata: videos.metadata,
					public: videos.public,
					videoStartTime: videos.videoStartTime,
					audioStartTime: videos.audioStartTime,
					awsRegion: videos.awsRegion,
					awsBucket: videos.awsBucket,
					xStreamInfo: videos.xStreamInfo,
					jobId: videos.jobId,
					jobStatus: videos.jobStatus,
					isScreenshot: videos.isScreenshot,
					skipProcessing: videos.skipProcessing,
					transcriptionStatus: videos.transcriptionStatus,
					source: videos.source,
					folderId: videos.folderId,
					width: videos.width,
					height: videos.height,
					duration: videos.duration,
					fps: videos.fps,
					firstViewEmailSentAt: videos.firstViewEmailSentAt,
					hasPassword: sql`${videos.password} IS NOT NULL`.mapWith(Boolean),
					sharedOrganization: {
						organizationId: sharedVideos.organizationId,
					},
					orgSettings: organizations.settings,
					hasActiveUpload: sql`${videoUploads.videoId} IS NOT NULL`.mapWith(
						Boolean,
					),
				})
				.from(videos)
				.leftJoin(sharedVideos, eq(videos.id, sharedVideos.videoId))
				.leftJoin(videoUploads, eq(videos.id, videoUploads.videoId))
				.leftJoin(organizations, eq(videos.orgId, organizations.id))
				.where(and(eq(videos.id, videoId), isNull(organizations.tombstoneAt))),
		).pipe(Policy.withPublicPolicy(videosPolicy.canView(videoId)));

		return Option.fromNullable(video);
	}).pipe(
		Effect.flatten,
		Effect.map((video) => ({ needsPassword: false, video }) as const),
		Effect.catchTag("VerifyVideoPasswordError", () =>
			Effect.succeed({ needsPassword: true } as const),
		),
		Effect.map((data) => (
			<div key={videoId} className="min-h-screen bg-black">
				<PasswordOverlay isOpen={data.needsPassword} videoId={videoId} />
				{!data.needsPassword && (
					<EmbedContent video={data.video} autoplay={autoplay} />
				)}
			</div>
		)),
		Effect.catchTags({
			PolicyDenied: renderEmbedPolicyDenied,
			NoSuchElementException: renderNoSuchElement,
		}),
		provideOptionalAuth,
		EffectRuntime.runPromise,
	);
}

async function EmbedContent({
	video,
	autoplay,
}: {
	video: Omit<typeof videos.$inferSelect, "password"> & {
		sharedOrganization: { organizationId: Organisation.OrganisationId } | null;
		hasActiveUpload: boolean | undefined;
		orgSettings?: (typeof organizations.$inferSelect)["settings"] | null;
	};
	autoplay: boolean;
}) {
	const user = await getCurrentUser();
	const sharedSpaces = await db()
		.select({
			id: spaces.id,
			name: spaces.name,
			settings: spaces.settings,
			hasPassword: sql`${spaces.password} IS NOT NULL`.mapWith(Boolean),
		})
		.from(spaceVideos)
		.innerJoin(spaces, eq(spaceVideos.spaceId, spaces.id))
		.where(eq(spaceVideos.videoId, video.id));

	const rules = resolveEffectiveVideoRules({
		videoSettings: video.settings,
		organizationSettings: video.orgSettings,
		spaces: sharedSpaces,
	});

	// AI generation is MANUAL and admin-only — no auto-trigger on embed page load.
	// Only display content that has already been generated.

	const currentMetadata = (video.metadata as VideoMetadata) || {};
	let initialAiData = null;

	if (
		currentMetadata.summary ||
		currentMetadata.chapters ||
		currentMetadata.aiTitle
	) {
		initialAiData = {
			title: currentMetadata.aiTitle || null,
			summary: currentMetadata.summary || null,
			chapters: currentMetadata.chapters || null,
		};
	}

	if (video.isScreenshot === true) {
		return (
			<div className="flex flex-col justify-center items-center min-h-screen text-center text-white bg-black px-6">
				<div className="flex items-center justify-center w-14 h-14 rounded-full bg-white/10 mb-5">
					<svg xmlns="http://www.w3.org/2000/svg" className="w-7 h-7 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
						<path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
					</svg>
				</div>
				<h1 className="mb-2 text-xl font-bold">This is a screenshot</h1>
				<p className="text-gray-400 mb-6 max-w-xs text-sm leading-relaxed">
					Screenshots cannot be embedded. View it directly on the share page.
				</p>
				<Link
					href={`/s/${video.id}`}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center justify-center px-5 py-2.5 rounded-full bg-white text-black text-sm font-semibold hover:bg-white/90 transition-colors"
				>
					View screenshot
				</Link>
			</div>
		);
	}

	const commentsQuery = await db()
		.select({
			id: comments.id,
			content: comments.content,
			timestamp: comments.timestamp,
			type: comments.type,
			authorId: comments.authorId,
			videoId: comments.videoId,
			createdAt: comments.createdAt,
			updatedAt: comments.updatedAt,
			parentCommentId: comments.parentCommentId,
			// Guests have no users row; fall back to the stored guest display name.
			authorName: sql<
				string | null
			>`COALESCE(${users.name}, ${comments.authorName})`,
		})
		.from(comments)
		.leftJoin(users, eq(comments.authorId, users.id))
		.where(eq(comments.videoId, video.id));

	const videoOwner = await db()
		.select({
			name: users.name,
		})
		.from(users)
		.where(eq(users.id, video.ownerId))
		.limit(1);

	return (
		<EmbedVideo
			data={video}
			user={user}
			comments={commentsQuery}
			chapters={
				rules.settings.disableChapters ? [] : initialAiData?.chapters || []
			}
			ownerName={videoOwner[0]?.name || null}
			autoplay={autoplay}
			viewerSettings={rules.settings}
			showPlaybackStatusBadge={user?.id === video.ownerId}
		/>
	);
}
