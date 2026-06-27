import { describe, expect, it } from "vitest";
import { isTransientGeminiError } from "@/lib/gemini-retry";
import { buildTranscriptionPrompt } from "@/lib/gemini-transcribe";
import { chunkTranscript } from "@/lib/transcript-chunk";

describe("transcription prompt", () => {
	it("keeps Uzbek editing rules while requiring app-compatible WebVTT", () => {
		const prompt = buildTranscriptionPrompt();

		expect(prompt).toContain("Uzbek Latin");
		expect(prompt).toContain("STANDARD WebVTT");
		expect(prompt).toContain("<v Speaker 1>spoken text</v>");
		expect(prompt).toContain("For one-speaker recordings");
		expect(prompt).toContain("Do NOT wrap timestamps in markdown brackets");
		expect(prompt).toContain("Wrong: dedlayn. Correct: **deadline**.");
		expect(prompt).toContain("Wrong: boshqaruv paneli. Correct: **dashboard**.");
		expect(prompt).toContain("Wrong: srazu. Correct: **сразу**.");
		expect(prompt).toContain(
			"Bugun **dashboard** **deadline** bor, **сразу** qilamiz.",
		);
		expect(prompt).not.toContain("This meeting has multiple speakers");
	});
});

describe("transcript chunking", () => {
	it("extracts Speaker colon labels into metadata for single-speaker chunks", () => {
		const chunks = chunkTranscript(`WEBVTT

00:00:00.000 --> 00:00:04.000
Speaker 1: Bugun dashboard flowini tekshiramiz.

00:00:04.000 --> 00:00:08.000
Speaker 1: Keyin **CRM** integratsiyani ko'ramiz.
`);

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.speaker).toBe("Speaker 1");
		expect(chunks[0]?.text).toContain("Bugun dashboard flowini tekshiramiz");
		expect(chunks[0]?.text).not.toContain("Speaker 1:");
	});

	it("preserves per-cue speaker context inside mixed-speaker chunks", () => {
		const chunks = chunkTranscript(`WEBVTT

00:00:00.000 --> 00:00:04.000
<v Speaker 1>Login bugini ko'rdingmi?</v>

00:00:04.000 --> 00:00:08.000
<v Speaker 2>Ha, **deadline**gacha tuzatamiz.</v>
`);

		expect(chunks).toHaveLength(1);
		expect(chunks[0]?.speaker).toBeNull();
		expect(chunks[0]?.text).toContain("Speaker 1: Login bugini");
		expect(chunks[0]?.text).toContain("Speaker 2: Ha, **deadline**gacha");
	});
});

describe("Gemini retry classification", () => {
	it("treats transient 501 responses as retryable", () => {
		expect(isTransientGeminiError(501, "temporary backend mismatch")).toBe(true);
	});
});
