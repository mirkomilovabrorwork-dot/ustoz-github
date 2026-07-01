import { describe, expect, it, vi } from "vitest";

// Mocks required only so the workflows/generate-ai module can be imported for
// its pure exports (mirrors generate-ai-title.test.ts).
vi.mock("@cap/database", () => ({ db: vi.fn() }));
vi.mock("@cap/env", () => ({ serverEnv: () => ({}) }));
vi.mock("@cap/web-backend", () => ({ Storage: {} }));
vi.mock("@/lib/groq-client", () => ({
	GROQ_MODEL: "test-model",
	getGroqClient: vi.fn(() => null),
}));
vi.mock("@/lib/server", () => ({ runPromise: vi.fn() }));
vi.mock("@/lib/video-storage", () => ({ decodeStorageVideo: vi.fn() }));
vi.mock("workflow", () => ({ FatalError: class FatalError extends Error {} }));
vi.mock("server-only", () => ({}));

import { alignChaptersToRefined } from "@/workflows/generate-ai";

describe("alignChaptersToRefined", () => {
	it("drops summary chapters that produced no refined section (the 'chala' bug)", () => {
		// Repro of the live intermittent failure: 5 summary chapters but the
		// window at 820s had no transcript segments, so refined has only 4.
		const chapters = [
			{ startSec: 140, title: "A", body: "" },
			{ startSec: 320, title: "B", body: "" },
			{ startSec: 470, title: "C", body: "" },
			{ startSec: 560, title: "D", body: "" },
			{ startSec: 820, title: "E", body: "" },
		];
		const refined = [
			{ startSec: 140 },
			{ startSec: 320 },
			{ startSec: 470 },
			{ startSec: 560 },
		];
		const aligned = alignChaptersToRefined(chapters, refined);
		expect(aligned.map((c) => c.startSec)).toEqual([140, 320, 470, 560]);
		// The invariant that was violated before the fix: counts must match.
		expect(aligned.length).toBe(refined.length);
	});

	it("keeps every chapter when all windows have content (1:1)", () => {
		const chapters = [
			{ startSec: 0, title: "A" },
			{ startSec: 300, title: "B" },
		];
		const refined = [{ startSec: 0 }, { startSec: 300 }];
		expect(alignChaptersToRefined(chapters, refined)).toEqual(chapters);
	});

	it("returns chapters unchanged when there are no refined chapters", () => {
		const chapters = [{ startSec: 0, title: "A" }];
		expect(alignChaptersToRefined(chapters, [])).toEqual(chapters);
	});

	it("never blanks out a usable summary when nothing intersects", () => {
		// Defensive: if startSecs somehow don't line up, keep the summary rather
		// than returning an empty chapter list.
		const chapters = [{ startSec: 10, title: "A" }];
		const refined = [{ startSec: 999 }];
		expect(alignChaptersToRefined(chapters, refined)).toEqual(chapters);
	});
});
