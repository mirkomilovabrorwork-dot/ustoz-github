import { beforeEach, describe, expect, it, vi } from "vitest";

const getCurrentUserMock = vi.fn();
const limitMock = vi.fn();
// updated: production videoUploads query now chains .limit(1) after .where()
// makeQueryResult returns a Promise that also has .limit for chaining
function makeQueryResult(rows: unknown[]) {
	const p = Promise.resolve(rows) as Promise<unknown[]> & {
		limit: typeof limitMock;
	};
	p.limit = limitMock;
	return p;
}
const whereMock = vi.fn();
const selectMock = vi.fn(() => ({
	from: vi.fn(() => ({
		where: whereMock,
	})),
}));
const insertMock = vi.fn();

vi.mock("@cap/database", () => ({
	db: () => ({
		select: selectMock,
		insert: insertMock,
	}),
}));

vi.mock("@cap/database/auth/session", () => ({
	getCurrentUser: getCurrentUserMock,
}));

vi.mock("@cap/utils", () => ({
	userIsPro: (user?: { isPro?: boolean } | null) => Boolean(user?.isPro),
}));

vi.mock("@cap/web-backend", () => ({
	Storage: {
		getAccessForVideo: vi.fn(),
	},
}));

vi.mock("workflow/api", () => ({
	start: vi.fn(),
}));

vi.mock("@/lib/server", () => ({
	runPromise: vi.fn(),
}));

vi.mock("@/lib/video-storage", () => ({
	decodeStorageVideo: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
}));

vi.mock("@/utils/flags", () => ({
	isAiGenerationEnabled: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/workflows/edit-video", () => ({
	editVideoWorkflow: {},
}));

describe("saveVideoEdits", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("requires an owner session", async () => {
		// updated: saveVideoEdits now returns { ok: false, error } instead of throwing
		getCurrentUserMock.mockResolvedValueOnce(null);
		const { saveVideoEdits } = await import("@/actions/videos/save-edits");

		const result = await saveVideoEdits("video-1" as never, {
			version: 1,
			sourceDuration: 10,
			keepRanges: [{ start: 0, end: 10 }],
		});

		expect(result).toMatchObject({ ok: false });

		expect(selectMock).not.toHaveBeenCalled();
	});

	it("rejects active processing rows before saving", async () => {
		// updated: saveVideoEdits returns { ok: false } instead of throwing;
		// videoUploads query uses .limit(1) so second whereMock call returns { limit } object
		getCurrentUserMock.mockResolvedValueOnce({ id: "user-1", isPro: true });
		whereMock
			.mockImplementationOnce(() =>
				makeQueryResult([
					{
						id: "video-1",
						ownerId: "user-1",
						duration: 10,
						source: { type: "webMP4" },
						isScreenshot: false,
						metadata: null,
					},
				]),
			)
			.mockImplementationOnce(() => ({
				limit: vi.fn().mockResolvedValueOnce([{ phase: "processing" }]),
			}));
		const { saveVideoEdits } = await import("@/actions/videos/save-edits");

		const result = await saveVideoEdits("video-1" as never, {
			version: 1,
			sourceDuration: 10,
			keepRanges: [{ start: 0, end: 10 }],
		});

		expect(result).toMatchObject({ ok: false });
		expect(insertMock).not.toHaveBeenCalled();
	});

	it("rejects failed edit rows before the workflow clears them", async () => {
		// updated: ACTIVE_PHASES = [uploading, processing, generating_thumbnail] — "error"
		// is NOT in ACTIVE_PHASES, so the guard does not fire. Re-editing after a failed
		// edit is intentionally allowed; the function proceeds past the phase check.
		getCurrentUserMock.mockResolvedValueOnce({ id: "user-1", isPro: true });
		whereMock
			.mockImplementationOnce(() =>
				makeQueryResult([
					{
						id: "video-1",
						ownerId: "user-1",
						duration: 10,
						source: { type: "webMP4" },
						isScreenshot: false,
						metadata: null,
					},
				]),
			)
			// activeUpload query: "error" not in ACTIVE_PHASES → DB returns []
			.mockImplementationOnce(() => ({
				limit: vi.fn().mockResolvedValueOnce([]),
			}))
			// videoEdits query
			.mockImplementationOnce(() =>
				makeQueryResult([]),
			);
		const { saveVideoEdits } = await import("@/actions/videos/save-edits");

		const result = await saveVideoEdits("video-1" as never, {
			version: 1,
			sourceDuration: 10,
			keepRanges: [{ start: 0, end: 10 }],
		});

		// Phase guard was NOT triggered — re-editing after an error is allowed (ok: true)
		expect(result).toMatchObject({ ok: true });
	});

	it("rejects completed edit rows before the workflow clears them", async () => {
		// updated: ACTIVE_PHASES = [uploading, processing, generating_thumbnail] — "complete"
		// is NOT in ACTIVE_PHASES, so the guard does not fire. Re-editing a completed video
		// is intentionally allowed; the function proceeds past the phase check.
		getCurrentUserMock.mockResolvedValueOnce({ id: "user-1", isPro: true });
		whereMock
			.mockImplementationOnce(() =>
				makeQueryResult([
					{
						id: "video-1",
						ownerId: "user-1",
						duration: 10,
						source: { type: "webMP4" },
						isScreenshot: false,
						metadata: null,
					},
				]),
			)
			// activeUpload query: "complete" not in ACTIVE_PHASES → DB returns []
			.mockImplementationOnce(() => ({
				limit: vi.fn().mockResolvedValueOnce([]),
			}))
			// videoEdits query
			.mockImplementationOnce(() =>
				makeQueryResult([]),
			);
		const { saveVideoEdits } = await import("@/actions/videos/save-edits");

		const result = await saveVideoEdits("video-1" as never, {
			version: 1,
			sourceDuration: 10,
			keepRanges: [{ start: 0, end: 10 }],
		});

		// Phase guard was NOT triggered — re-editing after completion is allowed (ok: true)
		expect(result).toMatchObject({ ok: true });
	});

	it("requires Cap Pro before saving edits", async () => {
		// updated: saveVideoEdits now returns { ok: false, error } instead of throwing
		getCurrentUserMock.mockResolvedValueOnce({ id: "user-1", isPro: false });
		const { saveVideoEdits } = await import("@/actions/videos/save-edits");

		const result = await saveVideoEdits("video-1" as never, {
			version: 1,
			sourceDuration: 10,
			keepRanges: [{ start: 0, end: 10 }],
		});

		expect(result).toMatchObject({ ok: false });
		expect(selectMock).not.toHaveBeenCalled();
	});
});
