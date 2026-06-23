"use server";

import bcrypt from "bcryptjs";
import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import {
	organizationMembers,
	organizations,
	users,
} from "@cap/database/schema";
import { serverEnv } from "@cap/env";
import { Organisation, User } from "@cap/web-domain";
import { and, asc, eq } from "drizzle-orm";

type SignUpResult = { success: true } | { success: false; error: string };

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEmailDomainAllowed(email: string): boolean {
	const allowed = serverEnv().CAP_ALLOWED_SIGNUP_DOMAINS;
	if (!allowed) return true;

	const domains = allowed
		.split(",")
		.map((d) => d.trim().toLowerCase())
		.filter(Boolean);

	if (domains.length === 0) return true;

	const emailDomain = email.split("@")[1]?.toLowerCase();
	if (!emailDomain) return false;

	return domains.includes(emailDomain);
}

/**
 * Resolve the single default organization that new self-signups join as
 * regular members. This is a single-org teacher tool: the org owned by the
 * platform admin (seeded via `npm run seed:admin`) is the shared workspace.
 *
 * We intentionally DO NOT create a fresh organization for self-signups, since
 * an org owner is granted the highest role. New users must only ever join the
 * existing default org as a `member`.
 */
async function getDefaultOrganizationId(): Promise<Organisation.OrganisationId | null> {
	// Prefer the admin user's default organization.
	const [admin] = await db()
		.select({ id: users.id, defaultOrgId: users.defaultOrgId })
		.from(users)
		.where(eq(users.isAdmin, true))
		.orderBy(asc(users.created_at))
		.limit(1);

	if (admin?.defaultOrgId) return admin.defaultOrgId;

	if (admin) {
		const [ownedOrg] = await db()
			.select({ id: organizations.id })
			.from(organizations)
			.where(eq(organizations.ownerId, admin.id))
			.orderBy(asc(organizations.createdAt))
			.limit(1);

		if (ownedOrg) return ownedOrg.id;
	}

	// Fallback: the oldest organization in the system (the default workspace).
	const [oldestOrg] = await db()
		.select({ id: organizations.id })
		.from(organizations)
		.orderBy(asc(organizations.createdAt))
		.limit(1);

	return oldestOrg?.id ?? null;
}

/**
 * Open, public sign-up: anyone can self-register with name + email + password.
 *
 * Security guarantees:
 * - Never sets `isAdmin` (platform admin), so a self-signup can never become a
 *   platform admin.
 * - Joins ONLY the existing default organization, with the lowest org role
 *   (`member`) — never `owner`/`admin`, so they cannot manage members,
 *   billing, or settings, and cannot see other orgs' data.
 * - Passwords are hashed with bcrypt (same path as the admin seed + invite
 *   flow); plaintext is never stored.
 * - All DB access is parameterised via Drizzle (no SQL/email injection).
 */
export async function signUp(
	name: string,
	email: string,
	password: string,
): Promise<SignUpResult> {
	const trimmedName = name.trim();
	const normalizedEmail = email.trim().toLowerCase();

	if (!trimmedName) {
		return { success: false, error: "Please enter your name." };
	}

	if (!EMAIL_REGEX.test(normalizedEmail)) {
		return { success: false, error: "Please enter a valid email address." };
	}

	if (!password || password.length < 8) {
		return {
			success: false,
			error: "Password must be at least 8 characters.",
		};
	}

	if (!isEmailDomainAllowed(normalizedEmail)) {
		return {
			success: false,
			error: "Sign-ups are not allowed for this email domain.",
		};
	}

	// Reject duplicate accounts up front for a clear message.
	const [existingUser] = await db()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	if (existingUser) {
		return {
			success: false,
			error:
				"An account with this email already exists. Please sign in instead.",
		};
	}

	const organizationId = await getDefaultOrganizationId();
	if (!organizationId) {
		// No workspace exists yet (admin not seeded). Do not silently create an
		// org here, as that would grant the new user owner-level access.
		return {
			success: false,
			error:
				"Sign-up is not available yet. Please ask your admin to finish setup.",
		};
	}

	const passwordHash = await bcrypt.hash(password, 10);
	const userId = nanoId() as User.UserId;

	try {
		await db().transaction(async (tx) => {
			// Guard against a race: re-check the email inside the transaction.
			const [racedUser] = await tx
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, normalizedEmail))
				.limit(1);

			if (racedUser) {
				throw new Error("EMAIL_TAKEN");
			}

			await tx.insert(users).values({
				id: userId,
				email: normalizedEmail,
				name: trimmedName,
				passwordHash,
				emailVerified: new Date(),
				activeOrganizationId: organizationId,
				defaultOrgId: organizationId,
				inviteQuota: 1,
				// isAdmin omitted -> defaults to false. Never grant admin here.
			});

			const [existingMembership] = await tx
				.select({ id: organizationMembers.id })
				.from(organizationMembers)
				.where(
					and(
						eq(organizationMembers.userId, userId),
						eq(organizationMembers.organizationId, organizationId),
					),
				)
				.limit(1);

			if (!existingMembership) {
				await tx.insert(organizationMembers).values({
					id: nanoId(),
					userId,
					organizationId,
					// Lowest privilege role. Never owner/admin for self-signups.
					role: "member",
				});
			}
		});
	} catch (error) {
		if (error instanceof Error && error.message === "EMAIL_TAKEN") {
			return {
				success: false,
				error:
					"An account with this email already exists. Please sign in instead.",
			};
		}
		return {
			success: false,
			error: "Something went wrong. Please try again.",
		};
	}

	return { success: true };
}
