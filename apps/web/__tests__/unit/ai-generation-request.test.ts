import { describe, expect, it } from "vitest";
import {
	requestAiGenerationAfterTranscription,
	shouldStartAiAfterTranscription,
} from "@/lib/ai-generation-request";

describe("AI generation request intent", () => {
	it("records manual AI intent without pretending an AI workflow is already queued", () => {
		const metadata = requestAiGenerationAfterTranscription({
			metadata: { sourceName: "Meet tab" },
			requestedAt: "2026-06-28T10:00:00.000Z",
			requestedBy: "user-1",
		});

		expect(metadata).toMatchObject({
			sourceName: "Meet tab",
			aiGenerationRequestedAt: "2026-06-28T10:00:00.000Z",
			aiGenerationRequestedBy: "user-1",
		});
		expect(metadata.aiGenerationStatus).toBeUndefined();
	});

	it("starts AI after transcription when either pipeline flag or manual intent exists", () => {
		expect(
			shouldStartAiAfterTranscription({
				metadata: {},
				aiGenerationEnabled: true,
			}),
		).toBe(true);

		expect(
			shouldStartAiAfterTranscription({
				metadata: { aiGenerationRequestedAt: "2026-06-28T10:00:00.000Z" },
				aiGenerationEnabled: false,
			}),
		).toBe(true);

		expect(
			shouldStartAiAfterTranscription({
				metadata: {},
				aiGenerationEnabled: false,
			}),
		).toBe(false);
	});
});
