import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentUser = vi.hoisted(() => ({
	value: { id: "user-1" } as { id: string; isAdmin?: boolean },
}));
const videoRows = vi.hoisted(() => ({
	value: [] as unknown[],
}));
const updateWhereMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const updateSetMock = vi.hoisted(() =>
	vi.fn(() => ({ where: updateWhereMock })),
);
const startAiGenerationMock = vi.hoisted(() => vi.fn());
const transcribeVideoMock = vi.hoisted(() => vi.fn());

vi.mock("@cap/database/auth/session", () => ({
	getCurrentUser: vi.fn(() => currentUser.value),
}));

vi.mock("@cap/database", () => ({
	db: () => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: vi.fn(() => ({
					limit: vi.fn(() => Promise.resolve(videoRows.value)),
				})),
			})),
		})),
		update: vi.fn(() => ({
			set: updateSetMock,
		})),
	}),
}));

vi.mock("@cap/database/schema", () => ({
	videos: { id: "videos.id" },
	organizations: { id: "organizations.id", ownerId: "organizations.ownerId" },
	organizationMembers: {
		organizationId: "organizationMembers.organizationId",
		userId: "organizationMembers.userId",
		role: "organizationMembers.role",
	},
}));

vi.mock("drizzle-orm", () => ({
	and: vi.fn((...args: unknown[]) => args),
	eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
	isNull: vi.fn((field: unknown) => ({ isNull: field })),
}));

vi.mock("@cap/web-domain", () => ({
	Video: {},
}));

vi.mock("@/lib/permissions/roles", () => ({
	getEffectiveOrganizationRole: vi.fn(() => "admin"),
}));

vi.mock("@/lib/generate-ai", () => ({
	startAiGeneration: startAiGenerationMock,
}));

vi.mock("@/lib/transcribe", () => ({
	transcribeVideo: transcribeVideoMock,
}));

describe("POST /api/videos/[videoId]/generate", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// AI generation is admin-gated (canUseAI) — the route 403s for non-admins.
		currentUser.value = { id: "user-1", isAdmin: true };
		videoRows.value = [];
		updateSetMock.mockReturnValue({ where: updateWhereMock });
		updateWhereMock.mockResolvedValue(undefined);
	});

	it("records manual AI intent when transcription is already processing", async () => {
		videoRows.value = [
			{
				id: "video-1",
				ownerId: "user-1",
				orgId: null,
				transcriptionStatus: "PROCESSING",
				metadata: { sourceName: "Meet tab" },
			},
		];

		const { POST } = await import("@/app/api/videos/[videoId]/generate/route");
		const response = await POST(
			new Request("http://localhost") as unknown as NextRequest,
			{
				params: Promise.resolve({ videoId: "video-1" }),
			},
		);
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toEqual({
			alreadyRunning: true,
			queuedAfterTranscription: true,
		});
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({
					sourceName: "Meet tab",
					aiGenerationRequestedAt: expect.any(String),
					aiGenerationRequestedBy: "user-1",
				}),
			}),
		);
		expect(startAiGenerationMock).not.toHaveBeenCalled();
		expect(transcribeVideoMock).not.toHaveBeenCalled();
	});
});
