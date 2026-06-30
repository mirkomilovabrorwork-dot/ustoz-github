import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cap/env", () => ({
	serverEnv: vi.fn(() => ({
		GEMINI_API_KEY: "test-gemini-api-key",
		DATABASE_URL: "mysql://test@localhost/test",
	})),
}));

const mockStart = vi.hoisted(() => vi.fn());
const schemaMocks = vi.hoisted(() => ({
	videos: { id: "id", settings: "settings" },
	organizations: { id: "id", settings: "settings" },
	s3Buckets: { id: "id" },
	videoUploads: { videoId: "videoId", phase: "phase" },
	users: { id: "id", geminiApiKey: "geminiApiKey" },
}));

vi.mock("workflow/api", () => ({
	start: mockStart,
}));

vi.mock("@/workflows/transcribe", () => ({
	transcribeVideoWorkflow: vi.fn(),
}));

// assertAiBudgetAvailable issues its own db() select chains (user/org/video
// spend lookups) that are out of scope for this test file, which only
// exercises transcribeVideo's own gating/workflow-trigger logic. Stub it as
// a no-op so it doesn't consume/derail the select mocks set up below.
vi.mock("@/lib/ai-cost-guard", () => ({
	assertAiBudgetAvailable: vi.fn(() => Promise.resolve()),
	BudgetExceededError: class BudgetExceededError extends Error {},
}));

let mockQueryResult: unknown[] = [];
let mockUploadQueryResult: unknown[] = [];
// Owner's saved Gemini key lookup. Defaults to "no saved key", which is fine
// since serverEnv() already provides GEMINI_API_KEY in most tests.
let mockOwnerQueryResult: unknown[] = [];

vi.mock("@cap/database", () => ({
	db: () => ({
		select: () => ({
			from: (table: unknown) => {
				if (table === schemaMocks.videoUploads) {
					return {
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue(mockUploadQueryResult),
						}),
					};
				}

				if (table === schemaMocks.users) {
					return {
						where: vi.fn().mockReturnValue({
							limit: vi.fn().mockResolvedValue(mockOwnerQueryResult),
						}),
					};
				}

				const query = {
					leftJoin: vi.fn(() => query),
					where: vi
						.fn()
						.mockImplementation(() => Promise.resolve(mockQueryResult)),
				};
				return query;
			},
		}),
		update: () => ({
			set: () => ({
				where: vi.fn().mockResolvedValue([]),
			}),
		}),
	}),
}));

vi.mock("@cap/database/schema", () => ({
	videos: schemaMocks.videos,
	organizations: schemaMocks.organizations,
	s3Buckets: schemaMocks.s3Buckets,
	videoUploads: schemaMocks.videoUploads,
	users: schemaMocks.users,
}));

vi.mock("drizzle-orm", () => ({
	eq: vi.fn((field, value) => ({ field, value })),
}));

import type { Video } from "@cap/web-domain";
import { transcribeVideo } from "@/lib/transcribe";
import { transcribeVideoWorkflow } from "@/workflows/transcribe";

describe("transcribeVideo", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockQueryResult = [];
		mockUploadQueryResult = [];
		mockOwnerQueryResult = [];
	});

	describe("input validation", () => {
		it("requires GEMINI_API_KEY environment variable", async () => {
			const { serverEnv } = await import("@cap/env");
			vi.mocked(serverEnv).mockReturnValueOnce({
				GEMINI_API_KEY: undefined,
			} as ReturnType<typeof serverEnv>);

			// Need a real video row so transcribeVideo reaches the Gemini-key gate
			// (lib/transcribe.ts checks video existence before the key check).
			// No saved owner key either, so neither source of a usable key exists.
			mockQueryResult = [
				{
					video: {
						id: "video-123",
						transcriptionStatus: null,
						settings: null,
					},
					bucket: null,
					settings: null,
					orgSettings: null,
				},
			];

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(false);
			// updated: message text changed from the old
			// "Missing necessary environment variables" to a more actionable
			// message that names the GEMINI_API_KEY env var directly.
			expect(result.message).toContain("GEMINI_API_KEY");
		});

		it("rejects empty videoId", async () => {
			const result = await transcribeVideo("" as Video.VideoId, "user-456");

			expect(result.success).toBe(false);
			expect(result.message).toBe("userId or videoId not supplied");
		});

		it("rejects empty userId", async () => {
			const result = await transcribeVideo("video-123" as Video.VideoId, "");

			expect(result.success).toBe(false);
			expect(result.message).toBe("userId or videoId not supplied");
		});

		it("rejects when both videoId and userId are empty", async () => {
			const result = await transcribeVideo("" as Video.VideoId, "");

			expect(result.success).toBe(false);
			expect(result.message).toBe("userId or videoId not supplied");
		});
	});

	describe("video lookup", () => {
		it("returns error when video does not exist", async () => {
			mockQueryResult = [];

			const result = await transcribeVideo(
				"nonexistent-video" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(false);
			expect(result.message).toBe("Video does not exist");
		});

		it("returns error when video result is malformed", async () => {
			mockQueryResult = [
				{ video: null, bucket: null, settings: null, orgSettings: null },
			];

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(false);
			expect(result.message).toBe("Video information is missing");
		});
	});

	describe("transcription disabled scenarios", () => {
		it("skips transcription when video settings disable it", async () => {
			mockQueryResult = [
				{
					video: {
						id: "video-123",
						transcriptionStatus: null,
						settings: { disableTranscript: true },
					},
					bucket: null,
					settings: { disableTranscript: true },
					orgSettings: null,
				},
			];

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(true);
			expect(result.message).toContain("disabled");
			expect(mockStart).not.toHaveBeenCalled();
		});

		it("skips transcription when org settings disable it", async () => {
			mockQueryResult = [
				{
					video: {
						id: "video-123",
						transcriptionStatus: null,
						settings: null,
					},
					bucket: null,
					settings: null,
					orgSettings: { disableTranscript: true },
				},
			];

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(true);
			expect(result.message).toContain("disabled");
		});

		it("video settings take precedence over org settings", async () => {
			mockQueryResult = [
				{
					video: {
						id: "video-123",
						transcriptionStatus: null,
						settings: { disableTranscript: false },
					},
					bucket: null,
					settings: { disableTranscript: false },
					orgSettings: { disableTranscript: true },
				},
			];
			// updated: transcribeVideoWorkflow must return a Promise so .catch() doesn't throw
			vi.mocked(transcribeVideoWorkflow).mockResolvedValueOnce(undefined as never);
			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(true);
			// updated: transcribeVideo now calls transcribeVideoWorkflow() inline
			expect(transcribeVideoWorkflow).toHaveBeenCalled();
		});
	});

	describe("existing transcription status", () => {
		it("returns early when transcription is already complete", async () => {
			mockQueryResult = [
				{
					video: {
						id: "video-123",
						transcriptionStatus: "COMPLETE",
						settings: null,
					},
					bucket: null,
					settings: null,
					orgSettings: null,
				},
			];

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(true);
			expect(result.message).toContain("already completed");
			expect(mockStart).not.toHaveBeenCalled();
		});

		it("returns early when transcription is in progress", async () => {
			mockQueryResult = [
				{
					video: {
						id: "video-123",
						transcriptionStatus: "PROCESSING",
						settings: null,
					},
					bucket: null,
					settings: null,
					orgSettings: null,
				},
			];

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(true);
			expect(result.message).toContain("in progress");
			expect(mockStart).not.toHaveBeenCalled();
		});
	});

	describe("workflow triggering", () => {
		beforeEach(() => {
			mockQueryResult = [
				{
					video: {
						id: "video-123",
						transcriptionStatus: null,
						settings: null,
					},
					bucket: { id: "bucket-456" },
					settings: null,
					orgSettings: null,
				},
			];
			mockStart.mockResolvedValue({ id: "workflow-run-123" });
			// updated: transcribeVideoWorkflow is now called inline (not via start()); must return a Promise
			vi.mocked(transcribeVideoWorkflow).mockResolvedValue(undefined as never);
		});

		it("does not trigger while upload is still active", async () => {
			mockUploadQueryResult = [{ phase: "processing" }];

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(true);
			expect(result.message).toBe("Video upload is still in progress");
			expect(mockStart).not.toHaveBeenCalled();
		});

		it("triggers workflow for valid video", async () => {
			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			expect(result.success).toBe(true);
			// updated: transcribeVideo now calls transcribeVideoWorkflow() inline, not via workflow/api start()
			expect(result.message).toBe("Transcription started inline");
		});

		it("passes correct payload to workflow", async () => {
			await transcribeVideo("video-123" as Video.VideoId, "user-456", true);

			// updated: transcribeVideo now calls transcribeVideoWorkflow() inline, not via workflow/api start()
			expect(transcribeVideoWorkflow).toHaveBeenCalledWith({
				videoId: "video-123",
				userId: "user-456",
				aiGenerationEnabled: true,
			});
		});

		it("defaults aiGenerationEnabled to false", async () => {
			await transcribeVideo("video-123" as Video.VideoId, "user-456");

			// updated: transcribeVideo now calls transcribeVideoWorkflow() inline, not via workflow/api start()
			expect(transcribeVideoWorkflow).toHaveBeenCalledWith({
				videoId: "video-123",
				userId: "user-456",
				aiGenerationEnabled: false,
			});
		});

		it("handles workflow trigger failure gracefully", async () => {
			// updated: transcribeVideoWorkflow is fire-and-forget with .catch(); an async
			// rejection does NOT flip success — the function returns "started" immediately.
			// Only a SYNCHRONOUS throw from the trigger causes success:false.
			vi.mocked(transcribeVideoWorkflow).mockReturnValueOnce(
				Promise.reject(new Error("Async workflow failure")),
			);

			const result = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);

			// async rejection is swallowed by .catch() — callers sees "started"
			expect(result.success).toBe(true);
			expect(result.message).toBe("Transcription started inline");

			// Also verify: a synchronous throw (not a rejected promise) causes success:false
			vi.mocked(transcribeVideoWorkflow).mockImplementationOnce(() => {
				throw new Error("Sync trigger failure");
			});

			const syncResult = await transcribeVideo(
				"video-123" as Video.VideoId,
				"user-456",
			);
			expect(syncResult.success).toBe(false);
			expect(syncResult.message).toBe("Failed to start transcription workflow");
		});
	});
});
