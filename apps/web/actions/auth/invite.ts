"use server";

import bcrypt from "bcryptjs";
import { db } from "@cap/database";
import { nanoId } from "@cap/database/helpers";
import {
	invites,
	organizationInvites,
	users,
	organizations,
	organizationMembers,
} from "@cap/database/schema";
import { Organisation, User } from "@cap/web-domain";
import { and, eq } from "drizzle-orm";
import { normalizeAssignableOrganizationRole } from "@/lib/permissions/roles";

export async function validateInviteToken(
	token: string,
): Promise<
	| { valid: true; email: string | null }
	| { valid: false; error: string }
> {
	const [invite] = await db()
		.select({
			id: invites.id,
			email: invites.email,
			usedByUserId: invites.usedByUserId,
			expiresAt: invites.expiresAt,
		})
		.from(invites)
		.where(eq(invites.token, token))
		.limit(1);

	if (!invite) {
		const [organizationInvite] = await db()
			.select({
				id: organizationInvites.id,
				email: organizationInvites.invitedEmail,
				status: organizationInvites.status,
				expiresAt: organizationInvites.expiresAt,
				consumedAt: organizationInvites.consumedAt,
			})
			.from(organizationInvites)
			.where(eq(organizationInvites.token, token))
			.limit(1);

		if (!organizationInvite) {
			return { valid: false, error: "This invite link is invalid." };
		}

		if (organizationInvite.consumedAt || organizationInvite.status !== "pending") {
			return {
				valid: false,
				error: "This invite link has already been used.",
			};
		}

		if (
			organizationInvite.expiresAt &&
			organizationInvite.expiresAt < new Date()
		) {
			return { valid: false, error: "This invite link has expired." };
		}

		return { valid: true, email: organizationInvite.email };
	}

	if (invite.usedByUserId) {
		return { valid: false, error: "This invite link has already been used." };
	}

	if (invite.expiresAt < new Date()) {
		return { valid: false, error: "This invite link has expired." };
	}

	return { valid: true, email: invite.email };
}

export async function redeemInvite(
	token: string,
	name: string,
	email: string,
	password: string,
): Promise<{ success: true } | { success: false; error: string }> {
	// Re-validate the token
	const [invite] = await db()
		.select()
		.from(invites)
		.where(eq(invites.token, token))
		.limit(1);

	if (!invite) {
		const [organizationInvite] = await db()
			.select()
			.from(organizationInvites)
			.where(eq(organizationInvites.token, token))
			.limit(1);

		if (!organizationInvite) {
			return { success: false, error: "This invite link is invalid." };
		}

		if (
			organizationInvite.consumedAt ||
			organizationInvite.status !== "pending"
		) {
			return {
				success: false,
				error: "This invite link has already been used.",
			};
		}

		if (
			organizationInvite.expiresAt &&
			organizationInvite.expiresAt < new Date()
		) {
			return { success: false, error: "This invite link has expired." };
		}

		const normalizedEmail = email.trim().toLowerCase();

		if (organizationInvite.invitedEmail.toLowerCase() !== normalizedEmail) {
			return {
				success: false,
				error: "Email does not match the invite.",
			};
		}

		const [existingUser] = await db()
			.select({
				id: users.id,
				passwordHash: users.passwordHash,
				defaultOrgId: users.defaultOrgId,
				onboardingSteps: users.onboardingSteps,
			})
			.from(users)
			.where(eq(users.email, normalizedEmail))
			.limit(1);

		const userId = existingUser?.id ?? (nanoId() as User.UserId);
		let passwordHash: string | null = null;

		if (existingUser) {
			if (!existingUser.passwordHash) {
				return {
					success: false,
					error:
						"An account with this email already exists. Please sign in instead.",
				};
			}

			const validPassword = await bcrypt.compare(
				password,
				existingUser.passwordHash,
			);

			if (!validPassword) {
				return {
					success: false,
					error:
						"An account with this email already exists. Please sign in instead.",
				};
			}
		} else {
			userId = nanoId() as User.UserId;
			passwordHash = await bcrypt.hash(password, 10);
		}

		await db().transaction(async (tx) => {
			const [lockedInvite] = await tx
				.select()
				.from(organizationInvites)
				.where(eq(organizationInvites.id, organizationInvite.id))
				.for("update");

			if (
				!lockedInvite ||
				lockedInvite.consumedAt ||
				lockedInvite.status !== "pending"
			) {
				throw new Error("INVITE_USED");
			}

			if (lockedInvite.expiresAt && lockedInvite.expiresAt < new Date()) {
				throw new Error("INVITE_EXPIRED");
			}

			if (!existingUser) {
				await tx.insert(users).values({
					id: userId,
					email: normalizedEmail,
					name,
					passwordHash,
					emailVerified: new Date(),
					activeOrganizationId: lockedInvite.organizationId,
					defaultOrgId: lockedInvite.organizationId,
					inviteQuota: 1,
					onboardingSteps: {
						organizationSetup: true,
						customDomain: true,
						inviteTeam: true,
					},
				});
			} else {
				const onboardingSteps = {
					...(existingUser.onboardingSteps ?? {}),
					organizationSetup: true,
					customDomain: true,
					inviteTeam: true,
				};

				const userUpdate: Partial<typeof users.$inferInsert> = {
					onboardingSteps,
					activeOrganizationId: lockedInvite.organizationId,
				};

				if (!existingUser.defaultOrgId) {
					userUpdate.defaultOrgId = lockedInvite.organizationId;
				}

				await tx.update(users).set(userUpdate).where(eq(users.id, userId));
			}

			const [existingMembership] = await tx
				.select({ id: organizationMembers.id })
				.from(organizationMembers)
				.where(
					and(
						eq(organizationMembers.userId, userId),
						eq(organizationMembers.organizationId, lockedInvite.organizationId),
					),
				)
				.limit(1);

			if (!existingMembership) {
				await tx.insert(organizationMembers).values({
					id: nanoId(),
					userId,
					organizationId: lockedInvite.organizationId,
					role: normalizeAssignableOrganizationRole(lockedInvite.role) ?? "member",
				});
			}

			await tx
				.update(organizationInvites)
				.set({ consumedAt: new Date(), status: "accepted" })
				.where(eq(organizationInvites.id, lockedInvite.id));
		});

		return { success: true };
	}

	if (invite.usedByUserId) {
		return { success: false, error: "This invite link has already been used." };
	}

	if (invite.expiresAt < new Date()) {
		return { success: false, error: "This invite link has expired." };
	}

	// If invite has a pre-set email, verify the submitted email matches
	if (invite.email && invite.email.toLowerCase() !== email.toLowerCase()) {
		return {
			success: false,
			error: "Email does not match the invite.",
		};
	}

	const normalizedEmail = email.trim().toLowerCase();

	// Check if user already exists
	const [existingUser] = await db()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	if (existingUser) {
		return {
			success: false,
			error: "An account with this email already exists. Please sign in instead.",
		};
	}

	// Hash the password
	const passwordHash = await bcrypt.hash(password, 10);

	const userId = nanoId() as User.UserId;
	const organizationId = Organisation.OrganisationId.make(nanoId());

	// Create the default personal organization first
	await db().insert(organizations).values({
		id: organizationId,
		ownerId: userId,
		name: `${name}'s Organization`,
	});

	// Create the user with the org reference
	await db().insert(users).values({
		id: userId,
		email: normalizedEmail,
		name,
		passwordHash,
		emailVerified: new Date(),
		activeOrganizationId: organizationId,
		defaultOrgId: organizationId,
		inviteQuota: 1,
	});

	// Add user as owner of the organization
	await db().insert(organizationMembers).values({
		id: nanoId(),
		userId,
		organizationId,
		role: "owner",
	});

	// Mark the invite as used
	await db()
		.update(invites)
		.set({ usedByUserId: userId })
		.where(eq(invites.id, invite.id));

	return { success: true };
}
