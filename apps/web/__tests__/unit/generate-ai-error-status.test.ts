/**
 * Regression test: when generateAiWorkflow rejects asynchronously,
 * startAiGeneration's fire-and-forget .catch must write
 * aiGenerationStatus: "ERROR" to the DB for that video.
 *
 * Bug that was fixed: the .catch only logged; it did NOT set ERROR status,
 * so the share-page UI showed a forever spinner on async AI failures.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// --- DB mock wiring ---
// Production code chains:
//   QUEUED update : db().update(videos).set({ metadata: { aiGenerationStatus: "QUEUED" } }).where(...)
//   ERROR select  : db().select({ metadata: videos.metadata }).from(videos).where(...).limit(1)
//   ERROR update  : db().update(videos).set({ metadata: { ..., aiGenerationStatus: "ERROR" } }).where(...)
//
// We capture every .set() call so we can assert on the metadata payload.

const updateSetWhereMock = vi.fn(() => Promise.resolve());
const updateSetMock = vi.fn(() => ({ where: updateSetWhereMock }));

const selectFromWhereLimitMock = vi.fn();
const selectFromWhereMock = vi.fn(() => ({
	limit: selectFromWhereLimitMock,
}));

vi.mock("@cap/database", () => ({
	db: () => ({
		select: vi.fn(() => ({
			from: vi.fn(() => ({
				where: selectFromWhereMock,
			})),
		})),
		update: vi.fn(() => ({
			set: updateSetMock,
		})),
	}),
}));

vi.mock("@cap/database/schema", () => ({
	videos: {},
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((col: unknown, val: unknown) => ({ col, val })),
}));

// serverEnv must return a GEMINI_API_KEY so startAiGeneration doesn't bail early.
vi.mock("@cap/env", () => ({
	serverEnv: () => ({ GEMINI_API_KEY: "test-key" }),
}));

// generateAiWorkflow always rejects — this is the failure we are testing against.
vi.mock("@/workflows/generate-ai", () => ({
	generateAiWorkflow: vi.fn(() => Promise.reject(new Error("gemini failed"))),
}));

// ---- helpers ----

/** A guard-select result: one video with transcription COMPLETE and given metadata. */
function makeVideoRow(metadata: Record<string, unknown> = {}) {
	return Promise.resolve([
		{
			video: {
				id: "video-abc",
				transcriptionStatus: "COMPLETE",
				metadata,
			},
		},
	]);
}

// ---- tests ----

describe("startAiGeneration — async workflow failure writes aiGenerationStatus ERROR", () => {
	const VIDEO_ID = "video-abc" as never;
	const USER_ID = "user-xyz";

	beforeEach(() => {
		vi.clearAllMocks();

		// Reset the set mock chain after clearAllMocks.
		updateSetMock.mockReturnValue({ where: updateSetWhereMock });
		updateSetWhereMock.mockResolvedValue(undefined);

		// Default ERROR-branch select: returns simple metadata.
		selectFromWhereLimitMock.mockResolvedValue([
			{ metadata: { aiGenerationStatus: "PROCESSING" } },
		]);
	});

	it("sets aiGenerationStatus to ERROR in the DB when generateAiWorkflow rejects", async () => {
		// First selectFromWhereMock call: the guard select (returns rows directly, no .limit).
		selectFromWhereMock.mockImplementationOnce(() => makeVideoRow() as never);
		// Second selectFromWhereMock call: inside the .catch, chains .limit(1).
		// → handled by selectFromWhereLimitMock set up in beforeEach.

		const { startAiGeneration } = await import("@/lib/generate-ai");
		const result = await startAiGeneration(VIDEO_ID, USER_ID);

		// startAiGeneration resolves immediately (fire-and-forget).
		expect(result.success).toBe(true);

		// First update sets QUEUED.
		expect(updateSetMock).toHaveBeenCalledWith(
			expect.objectContaining({
				metadata: expect.objectContaining({ aiGenerationStatus: "QUEUED" }),
			}),
		);

		// Flush microtasks so the fire-and-forget .catch runs (including the nested awaits).
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		// The second update must set aiGenerationStatus: "ERROR".
		const allSetCalls = updateSetMock.mock.calls;
		const errorCall = allSetCalls.find((args) => {
			const payload = args[0] as { metadata?: Record<string, unknown> };
			return payload?.metadata?.aiGenerationStatus === "ERROR";
		});

		expect(errorCall).toBeDefined();
	});

	it("spreads existing metadata fields when writing the ERROR status", async () => {
		// Sanity: the ERROR status from the .catch carries the spread of current metadata.
		selectFromWhereMock.mockImplementationOnce(
			() => makeVideoRow({ someOtherField: "preserved" }) as never,
		);

		// The current metadata read inside the .catch returns something with extra fields.
		selectFromWhereLimitMock.mockResolvedValueOnce([
			{ metadata: { someOtherField: "preserved", aiGenerationStatus: "PROCESSING" } },
		]);

		const { startAiGeneration } = await import("@/lib/generate-ai");
		await startAiGeneration(VIDEO_ID, USER_ID);

		// Flush microtasks.
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));
		await new Promise((r) => setTimeout(r, 0));

		const allSetCalls = updateSetMock.mock.calls;
		const errorCall = allSetCalls.find((args) => {
			const payload = args[0] as { metadata?: Record<string, unknown> };
			return payload?.metadata?.aiGenerationStatus === "ERROR";
		});

		expect(errorCall).toBeDefined();
		// Existing fields should be preserved (spread behaviour in the .catch).
		expect(errorCall![0]).toMatchObject({
			metadata: expect.objectContaining({
				someOtherField: "preserved",
				aiGenerationStatus: "ERROR",
			}),
		});
	});
});
