import { describe, expect, it, vi } from "vitest";

// Mocks required only so the workflows/generate-ai module can be imported for
// its pure exports (mirrors align-chapters-to-refined.test.ts).
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

import {
	AI_EMPTY_RESULT_ERROR,
	buildSaveResultsPatch,
} from "@/workflows/generate-ai";

const USABLE_AI_SUMMARY = {
	overview: "A real overview of the video.",
	topics: [{ title: "Topic", body: "Body" }],
	tasks: [],
	chapters: [{ startSec: 0, title: "Intro", body: "" }],
	nextSteps: [],
	refinedTranscript: { chapters: [] },
	// biome-ignore lint/suspicious/noExplicitAny: test fixture shape
} as any;

const EMPTY_SHELL_AI_SUMMARY = {
	overview: "",
	topics: [],
	tasks: [],
	chapters: [],
	nextSteps: [],
	refinedTranscript: {
		chapters: [{ startSec: 0, title: "Transcript", paragraphs: ["text"] }],
	},
	// biome-ignore lint/suspicious/noExplicitAny: test fixture shape
} as any;

describe("buildSaveResultsPatch", () => {
	it("marks COMPLETE and clears a stale error when THIS run is usable", () => {
		const patch = buildSaveResultsPatch(
			{ aiGenerationError: "old error from a previous run" },
			{ summary: "New summary", aiSummary: USABLE_AI_SUMMARY },
		);
		expect(patch.aiGenerationStatus).toBe("COMPLETE");
		expect(patch.aiGenerationError).toBeUndefined();
		expect(patch.summary).toBe("New summary");
	});

	it("marks ERROR when THIS run is empty even though usable content is already stored (empty-shell-COMPLETE bug)", () => {
		const patch = buildSaveResultsPatch(
			{
				summary: "Good stored summary",
				aiSummary: USABLE_AI_SUMMARY,
				aiGenerationStatus: "PROCESSING",
			},
			{ summary: "", aiSummary: null },
		);
		expect(patch.aiGenerationStatus).toBe("ERROR");
		// Stored content must be preserved, not clobbered.
		expect(patch.summary).toBe("Good stored summary");
		expect(patch.aiSummary).toBe(USABLE_AI_SUMMARY);
	});

	it("treats a refined-only shell result as NOT usable", () => {
		const patch = buildSaveResultsPatch(
			{ summary: "Good stored summary" },
			{ summary: "", aiSummary: EMPTY_SHELL_AI_SUMMARY },
		);
		expect(patch.aiGenerationStatus).toBe("ERROR");
		expect(patch.summary).toBe("Good stored summary");
		// The shell must not replace anything.
		expect(patch.aiSummary).toBeUndefined();
	});

	it("replaces a stale error with THIS run's error on failure (stale aiGenerationError bug)", () => {
		const patch = buildSaveResultsPatch(
			{ aiGenerationError: "gemini timeout from three days ago" },
			{ summary: "", aiSummary: null },
		);
		expect(patch.aiGenerationStatus).toBe("ERROR");
		expect(patch.aiGenerationError).toBe(AI_EMPTY_RESULT_ERROR);
	});

	it("a usable text-only summary does not wipe stored aiSummary topics/tasks", () => {
		const patch = buildSaveResultsPatch(
			{ aiSummary: USABLE_AI_SUMMARY },
			{ summary: "Text summary only", aiSummary: EMPTY_SHELL_AI_SUMMARY },
		);
		expect(patch.aiGenerationStatus).toBe("COMPLETE");
		expect(patch.summary).toBe("Text summary only");
		// Shell aiSummary must not replace the stored usable one.
		expect(patch.aiSummary).toBe(USABLE_AI_SUMMARY);
	});

	it("marks ERROR when both the run and stored content are empty", () => {
		const patch = buildSaveResultsPatch({}, { summary: "", aiSummary: null });
		expect(patch.aiGenerationStatus).toBe("ERROR");
		expect(patch.aiGenerationError).toBe(AI_EMPTY_RESULT_ERROR);
	});

	it("applies title and base language options", () => {
		const patch = buildSaveResultsPatch(
			{ aiTitle: "Old title" },
			{ summary: "S", aiSummary: null },
			{ generatedTitle: "New title", resolvedBaseLanguage: "ru" },
		);
		expect(patch.aiTitle).toBe("New title");
		expect(patch.aiBaseLanguage).toBe("ru");
	});

	it("failure placeholder text alone is not usable", () => {
		const patch = buildSaveResultsPatch(
			{},
			{
				summary:
					"The AI was unable to generate a proper summary for this content.",
				aiSummary: null,
			},
		);
		expect(patch.aiGenerationStatus).toBe("ERROR");
	});
});
