"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import {
	hashPassword,
	verifyPassword as verifyPlainPassword,
} from "@cap/database/crypto";
import { spaces, spaceVideos, videos } from "@cap/database/schema";
import { collectPasswordHashes } from "@cap/web-backend";
import type { Video } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { setVerifiedPasswordCookie } from "@/lib/password-cookie";

const RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
const RATE_LIMIT_MAX_ENTRIES = 10_000;
const passwordAttemptCounts = new Map<
	string,
	{ count: number; resetAt: number }
>();
let rateLimitRequestCounter = 0;

async function getClientIp() {
	const requestHeaders = await headers();
	return (
		requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
		requestHeaders.get("x-real-ip") ||
		"unknown"
	);
}

function isRateLimited(key: string) {
	const now = Date.now();
	rateLimitRequestCounter++;
	if (rateLimitRequestCounter % 100 === 0) {
		for (const [k, v] of passwordAttemptCounts) {
			if (now > v.resetAt) passwordAttemptCounts.delete(k);
		}
		if (passwordAttemptCounts.size > RATE_LIMIT_MAX_ENTRIES) {
			passwordAttemptCounts.clear();
		}
	}

	const entry = passwordAttemptCounts.get(key);
	if (!entry || now > entry.resetAt) {
		passwordAttemptCounts.set(key, {
			count: 1,
			resetAt: now + RATE_LIMIT_WINDOW_MS,
		});
		return false;
	}

	entry.count++;
	return entry.count > RATE_LIMIT_MAX_ATTEMPTS;
}

export async function setVideoPassword(
	videoId: Video.VideoId,
	password: string,
) {
	try {
		const user = await getCurrentUser();

		if (!user || !videoId || typeof password !== "string" || !password.trim()) {
			throw new Error("Missing required data");
		}

		const [video] = await db()
			.select()
			.from(videos)
			.where(eq(videos.id, videoId));

		if (!video || video.ownerId !== user.id) {
			throw new Error("Unauthorized");
		}

		const hashed = await hashPassword(password);
		await db()
			.update(videos)
			.set({ password: hashed })
			.where(eq(videos.id, videoId));

		revalidatePath("/dashboard/caps");
		revalidatePath("/dashboard/shared-caps");
		revalidatePath(`/s/${videoId}`);

		return { success: true, value: "Password updated successfully" };
	} catch (error) {
		console.error("Error setting video password:", error);
		return { success: false, error: "Failed to update password" };
	}
}

export async function removeVideoPassword(videoId: Video.VideoId) {
	try {
		const user = await getCurrentUser();

		if (!user || !videoId) {
			throw new Error("Missing required data");
		}

		const [video] = await db()
			.select()
			.from(videos)
			.where(eq(videos.id, videoId));

		if (!video || video.ownerId !== user.id) {
			throw new Error("Unauthorized");
		}

		await db()
			.update(videos)
			.set({ password: null })
			.where(eq(videos.id, videoId));

		revalidatePath("/dashboard/caps");
		revalidatePath("/dashboard/shared-caps");
		revalidatePath(`/s/${videoId}`);

		return { success: true, value: "Password removed successfully" };
	} catch (error) {
		console.error("Error removing video password:", error);
		return { success: false, error: "Failed to remove password" };
	}
}

export async function verifyVideoPassword(
	videoId: Video.VideoId,
	password: string,
) {
	try {
		if (!videoId || typeof password !== "string")
			return { success: false, error: "Failed to verify password" };

		const ip = await getClientIp();
		if (isRateLimited(`${videoId}:${ip}`)) {
			return { success: false, error: "Too many attempts. Try again later." };
		}

		const [video] = await db()
			.select()
			.from(videos)
			.where(eq(videos.id, videoId));

		if (!video) return { success: false, error: "Failed to verify password" };

		const spacePasswords = await db()
			.select({ password: spaces.password })
			.from(spaceVideos)
			.innerJoin(spaces, eq(spaceVideos.spaceId, spaces.id))
			.where(eq(spaceVideos.videoId, videoId));

		const passwordHashes = collectPasswordHashes({
			videoPassword: video.password,
			spacePasswords,
		});

		for (const passwordHash of passwordHashes) {
			const valid = await verifyPlainPassword(passwordHash, password);
			if (valid) {
				await setVerifiedPasswordCookie(passwordHash);
				return { success: true, value: "Password verified" };
			}
		}

		// Wrong passwords and links whose password was since removed are expected
		// outcomes — return without logging so console.error stays signal.
		return { success: false, error: "Failed to verify password" };
	} catch (error) {
		console.error("Error verifying video password:", error);
		return { success: false, error: "Failed to verify password" };
	}
}
