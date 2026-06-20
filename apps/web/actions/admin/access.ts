"use server";

import bcrypt from "bcryptjs";
import { db } from "@cap/database";
import { getCurrentUser } from "@cap/database/auth/session";
import { nanoId } from "@cap/database/helpers";
import {
	invites,
	users,
	organizations,
	organizationMembers,
} from "@cap/database/schema";
import { Organisation, User } from "@cap/web-domain";
import { eq, desc, sql } from "drizzle-orm";
import { buildEnv } from "@cap/env";

async function requireAdmin() {
	const user = await getCurrentUser();
	if (!user || !user.isAdmin) {
		throw new Error("Unauthorized: admin access required");
	}
	return user;
}

export async function getUsers() {
	await requireAdmin();

	const allUsers = await db()
		.select({
			id: users.id,
			name: users.name,
			email: users.email,
			isAdmin: users.isAdmin,
			createdAt: users.created_at,
			accessDisabled: sql<boolean>`${users.passwordHash} IS NULL`.mapWith(
				Boolean,
			),
		})
		.from(users)
		.orderBy(desc(users.created_at));

	return allUsers;
}

export async function createUser(
	email: string,
	password: string,
	name: string,
) {
	await requireAdmin();

	const normalizedEmail = email.trim().toLowerCase();

	// Check if user already exists
	const [existingUser] = await db()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.email, normalizedEmail))
		.limit(1);

	if (existingUser) {
		return { success: false as const, error: "A user with this email already exists." };
	}

	const passwordHash = await bcrypt.hash(password, 10);
	const userId = nanoId() as User.UserId;
	const organizationId = Organisation.OrganisationId.make(nanoId());

	// Create the default personal organization
	await db().insert(organizations).values({
		id: organizationId,
		ownerId: userId,
		name: `${name}'s Organization`,
	});

	// Create the user
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

	// Add user as owner of their org
	await db().insert(organizationMembers).values({
		id: nanoId(),
		userId,
		organizationId,
		role: "owner",
	});

	return { success: true as const };
}

export async function generateInviteLink(
	email?: string,
	expiresInDays?: number,
) {
	const admin = await requireAdmin();

	const token = crypto.randomUUID();
	const days = expiresInDays ?? 7;
	const expiresAt = new Date();
	expiresAt.setDate(expiresAt.getDate() + days);

	await db().insert(invites).values({
		id: nanoId(),
		token,
		email: email?.trim().toLowerCase() || null,
		createdByUserId: admin.id,
		expiresAt,
	});

	const inviteUrl = `${buildEnv.NEXT_PUBLIC_WEB_URL}/invite/${token}`;

	return { success: true as const, inviteUrl, token };
}

export async function getInvites() {
	await requireAdmin();

	const allInvites = await db()
		.select({
			id: invites.id,
			token: invites.token,
			email: invites.email,
			usedByUserId: invites.usedByUserId,
			expiresAt: invites.expiresAt,
			createdAt: invites.createdAt,
		})
		.from(invites)
		.orderBy(desc(invites.createdAt));

	return allInvites.map((inv) => ({
		...inv,
		status: inv.usedByUserId
			? ("used" as const)
			: inv.expiresAt < new Date()
				? ("expired" as const)
				: ("pending" as const),
	}));
}

export async function revokeUser(userId: string) {
	const admin = await requireAdmin();

	if (admin.id === userId) {
		return { success: false as const, error: "You cannot revoke your own access." };
	}

	// Verify the target user exists
	const [targetUser] = await db()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, userId as User.UserId))
		.limit(1);

	if (!targetUser) {
		return { success: false as const, error: "User not found." };
	}

	// Soft-disable by clearing passwordHash (prevents login) and bumping authSessionVersion (invalidates active sessions)
	await db()
		.update(users)
		.set({ passwordHash: null, authSessionVersion: sql`${users.authSessionVersion} + 1` })
		.where(eq(users.id, userId as User.UserId));

	return { success: true as const };
}

export async function resetUserPassword(userId: string, newPassword: string) {
	await requireAdmin();

	if (!newPassword || newPassword.length < 8) {
		return { success: false as const, error: "Password must be at least 8 characters." };
	}

	const [targetUser] = await db()
		.select({ id: users.id })
		.from(users)
		.where(eq(users.id, userId as User.UserId))
		.limit(1);

	if (!targetUser) {
		return { success: false as const, error: "User not found." };
	}

	const passwordHash = await bcrypt.hash(newPassword, 10);

	await db()
		.update(users)
		.set({ passwordHash })
		.where(eq(users.id, userId as User.UserId));

	return { success: true as const };
}

export async function toggleUserAdmin(userId: string) {
	const admin = await requireAdmin();

	if (admin.id === userId) {
		return { success: false as const, error: "You cannot change your own admin status." };
	}

	const [targetUser] = await db()
		.select({ id: users.id, isAdmin: users.isAdmin })
		.from(users)
		.where(eq(users.id, userId as User.UserId))
		.limit(1);

	if (!targetUser) {
		return { success: false as const, error: "User not found." };
	}

	await db()
		.update(users)
		.set({ isAdmin: !targetUser.isAdmin })
		.where(eq(users.id, userId as User.UserId));

	return { success: true as const, isAdmin: !targetUser.isAdmin };
}

export async function revokeInvite(inviteId: string) {
	await requireAdmin();

	await db().delete(invites).where(eq(invites.id, inviteId));

	return { success: true as const };
}
