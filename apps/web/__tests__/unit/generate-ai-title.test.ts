import { describe, expect, it, vi } from "vitest";

vi.mock("@cap/database", () => ({
	db: vi.fn(),
}));

vi.mock("@cap/env", () => ({
	serverEnv: () => ({}),
}));

vi.mock("@cap/web-backend", () => ({
	Storage: {},
}));

vi.mock("@/lib/groq-client", () => ({
	GROQ_MODEL: "test-model",
	getGroqClient: vi.fn(() => null),
}));

vi.mock("@/lib/server", () => ({
	runPromise: vi.fn(),
}));

vi.mock("@/lib/video-storage", () => ({
	decodeStorageVideo: vi.fn(),
}));

vi.mock("workflow", () => ({
	FatalError: class FatalError extends Error {},
}));

vi.mock("server-only", () => ({}));

import {
	getAiLanguageInstruction,
	MAX_REFINED_TRANSCRIPT_AUTO_CHARS,
	MAX_REFINED_TRANSCRIPT_AUTO_SECONDS,
	shouldGenerateRefinedTranscript,
	shouldReplaceVideoTitle,
} from "@/workflows/generate-ai";

describe("shouldReplaceVideoTitle", () => {
	it("replaces default data365 titles", () => {
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "data365 Recording - 15 May 2026",
				nextAiTitle: "Quarterly Roadmap Review",
			}),
		).toBe(true);
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "data365 Upload - 15 May 2026",
				nextAiTitle: "Quarterly Roadmap Review",
			}),
		).toBe(true);
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "Untitled",
				nextAiTitle: "Quarterly Roadmap Review",
			}),
		).toBe(true);
	});

	it("replaces a title that was previously set by AI", () => {
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "Old Generated Title",
				previousAiTitle: "Old Generated Title",
				nextAiTitle: "New Generated Title",
			}),
		).toBe(true);
	});

	it("replaces source-derived desktop titles", () => {
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "Acme App",
				sourceName: "Acme App",
				nextAiTitle: "Quarterly Roadmap Review",
			}),
		).toBe(true);
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "Built-in Retina Display (Area) 2026-06-03 02:45 PM",
				nextAiTitle: "Quarterly Roadmap Review",
			}),
		).toBe(true);
	});

	it("preserves manual titles", () => {
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "Customer Demo For Acme",
				previousAiTitle: "Old Generated Title",
				nextAiTitle: "New Generated Title",
			}),
		).toBe(false);
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "Acme App",
				sourceName: "Acme App",
				nextAiTitle: "New Generated Title",
				titleManuallyEdited: true,
			}),
		).toBe(false);
	});

	it("does not replace with a blank generated title", () => {
		expect(
			shouldReplaceVideoTitle({
				currentTitle: "data365 Recording - 15 May 2026",
				nextAiTitle: "   ",
			}),
		).toBe(false);
	});
});

describe("getAiLanguageInstruction", () => {
	it("uses transcript language when auto-detect is selected", () => {
		const instruction = getAiLanguageInstruction("auto");

		expect(instruction).toContain("dominant spoken language");
		expect(instruction).toContain("Uzbek Latin");
		expect(instruction).toContain("Do not translate the meeting into English");
	});

	it("uses the selected language name", () => {
		expect(getAiLanguageInstruction("es")).toContain("Spanish");
	});
});

describe("shouldGenerateRefinedTranscript", () => {
	it("generates the cleaned transcript whenever a transcript exists, regardless of duration", () => {
		// A normal-length, short video: yes.
		expect(
			shouldGenerateRefinedTranscript({
				transcriptCharCount: MAX_REFINED_TRANSCRIPT_AUTO_CHARS,
				videoDurationSeconds: 60,
			}),
		).toBe(true);

		// Long (multi-chunk) transcript: yes — generated per-chunk, separate from
		// the summary token budget.
		expect(
			shouldGenerateRefinedTranscript({
				transcriptCharCount: MAX_REFINED_TRANSCRIPT_AUTO_CHARS * 10,
				videoDurationSeconds: 60,
			}),
		).toBe(true);

		// Long-duration video (e.g. a 2h lesson, or a hallucinated trailing-cue
		// duration): STILL yes — duration must not gate it (this was the bug that
		// left the Refined tab empty for long videos).
		expect(
			shouldGenerateRefinedTranscript({
				transcriptCharCount: 1000,
				videoDurationSeconds: MAX_REFINED_TRANSCRIPT_AUTO_SECONDS * 100,
			}),
		).toBe(true);

		// No transcript: no.
		expect(
			shouldGenerateRefinedTranscript({
				transcriptCharCount: 0,
				videoDurationSeconds: 60,
			}),
		).toBe(false);
	});
});
