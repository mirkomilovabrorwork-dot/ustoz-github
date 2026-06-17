"use server";

import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { organizations } from "@cap/database/schema";
import type { Organisation } from "@cap/web-domain";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

const MIN_QUOTA = 1024 * 1024 * 1024;
const MAX_QUOTA = 10 * 1024 * 1024 * 1024 * 1024;

export async function updateStorageSettings(input: {
	storageQuotaBytes?: number | null;
	userQuotaBytes?: number | null;
	enforceQuota?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
	const me = await getCurrentUser();
	if (!me?.id || !me.activeOrganizationId) {
		return { ok: false, error: "Not authenticated" };
	}

	const orgId = me.activeOrganizationId as Organisation.OrganisationId;

	const [org] = await db()
		.select({
			ownerId: organizations.ownerId,
			settings: organizations.settings,
		})
		.from(organizations)
		.where(eq(organizations.id, orgId));

	if (!org) return { ok: false, error: "Organization not found" };
	if (org.ownerId !== me.id) {
		return {
			ok: false,
			error: "Only the organization owner can change quotas",
		};
	}

	const validateQuota = (label: string, v: number | null | undefined) => {
		if (v == null) return null;
		if (!Number.isFinite(v) || v < MIN_QUOTA || v > MAX_QUOTA) {
			throw new Error(
				`${label} must be between 1 GB and 10 TB (got ${String(v)})`,
			);
		}
		return Math.round(v);
	};

	try {
		const storageQuotaBytes = validateQuota(
			"Organization quota",
			input.storageQuotaBytes ?? null,
		);
		const userQuotaBytes = validateQuota(
			"Per-user quota",
			input.userQuotaBytes ?? null,
		);

		const nextSettings = {
			...(org.settings ?? {}),
			storageQuotaBytes: storageQuotaBytes ?? undefined,
			userQuotaBytes: userQuotaBytes ?? undefined,
			enforceQuota: Boolean(input.enforceQuota),
		};

		await db()
			.update(organizations)
			.set({ settings: nextSettings })
			.where(eq(organizations.id, orgId));

		revalidatePath("/dashboard/settings/storage");
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : "Failed to update settings",
		};
	}
}
