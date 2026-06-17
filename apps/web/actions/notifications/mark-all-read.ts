"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { notifications } from "@cap/database/schema";
import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export const markAllRead = async () => {
	const currentUser = await getCurrentUser();
	if (!currentUser) {
		throw new Error("User not found");
	}

	try {
		await db()
			.update(notifications)
			.set({ readAt: new Date() })
			.where(
				and(
					eq(notifications.recipientId, currentUser.id),
					isNull(notifications.readAt),
				),
			);
	} catch (error) {
		console.log(error);
		throw new Error("Error marking all notifications as read");
	}

	revalidatePath("/dashboard/notifications");
};
