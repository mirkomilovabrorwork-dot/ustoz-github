import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { notifications, users } from "@cap/database/schema";
import { Notification as APINotification } from "@cap/web-api-contract";
import { ImageUploads } from "@cap/web-backend";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { Effect } from "effect";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { runPromise } from "@/lib/server";
import { jsonExtractString } from "@/utils/sql";
import { NotificationsClient } from "./NotificationsClient";

export const metadata: Metadata = {
	title: "Notifications — data365",
};

const PAGE_SIZE = 25;

export default async function NotificationsPage(props: {
	searchParams: Promise<{ page?: string }>;
}) {
	const searchParams = await props.searchParams;
	const user = await getCurrentUser();

	if (!user?.id) {
		redirect("/login");
	}

	const page = Number(searchParams.page) || 1;
	const offset = (page - 1) * PAGE_SIZE;

	const rows = await db()
		.select({
			notification: {
				id: notifications.id,
				type: notifications.type,
				data: notifications.data,
				readAt: notifications.readAt,
				createdAt: notifications.createdAt,
			},
			author: {
				id: users.id,
				name: users.name,
				avatar: users.image,
			},
		})
		.from(notifications)
		.leftJoin(
			users,
			and(
				ne(notifications.type, "anon_view"),
				eq(jsonExtractString(notifications.data, "authorId"), users.id),
			),
		)
		.where(
			and(
				eq(notifications.recipientId, user.id),
				eq(notifications.orgId, user.activeOrganizationId),
			),
		)
		.orderBy(desc(isNull(notifications.readAt)), desc(notifications.createdAt))
		.limit(PAGE_SIZE)
		.offset(offset);

	const total = await db().$count(
		notifications,
		and(
			eq(notifications.recipientId, user.id),
			eq(notifications.orgId, user.activeOrganizationId),
		),
	);

	const items = await Effect.gen(function* () {
		const imageUploads = yield* ImageUploads;

		return yield* Effect.all(
			rows.map(({ notification, author }) =>
				Effect.gen(function* () {
					if (notification.type === "anon_view") {
						return APINotification.parse({
							id: notification.id,
							type: "anon_view",
							readAt: notification.readAt,
							videoId: notification.data.videoId,
							createdAt: notification.createdAt,
							anonName: notification.data.anonName ?? "Anonymous Viewer",
							location: notification.data.location ?? null,
						});
					}

					if (!author) return null;

					const resolvedAvatar = author.avatar
						? yield* imageUploads
								.resolveImageUrl(author.avatar)
								.pipe(Effect.catchAll(() => Effect.succeed(null)))
						: null;

					return APINotification.parse({
						id: notification.id,
						type: notification.type,
						readAt: notification.readAt,
						videoId: notification.data.videoId,
						createdAt: notification.createdAt,
						data: notification.data,
						comment: notification.data.comment,
						author: {
							id: author.id,
							name: author.name ?? "Unknown",
							avatar: resolvedAvatar,
						},
					});
				}).pipe(Effect.catchAll(() => Effect.succeed(null))),
			),
		);
	})
		.pipe(runPromise)
		.then((results) => results.filter(Boolean));

	return (
		<NotificationsClient
			notifications={items}
			total={total}
			page={page}
			pageSize={PAGE_SIZE}
		/>
	);
}
