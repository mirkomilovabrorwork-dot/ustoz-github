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

vi.mock("@/lib/server", () => ({
	runPromise: vi.fn(),
}));

vi.mock("@/lib/video-storage", () => ({
	decodeStorageVideo: vi.fn(),
	getStorageAccessForVideo: vi.fn(),
}));

vi.mock("server-only", () => ({}));

import { buildVttFromCues, parseVttCues } from "@/lib/translate-ai";

const sampleVtt = `WEBVTT

00:00:00.000 --> 00:00:02.500
Hello there.

00:00:02.500 --> 00:00:05.000
Second line.

`;

describe("parseVttCues", () => {
	it("round-trips a sample WebVTT into cues", () => {
		const cues = parseVttCues(sampleVtt);

		expect(cues).toEqual([
			{ start: "00:00:00.000", end: "00:00:02.500", text: "Hello there." },
			{ start: "00:00:02.500", end: "00:00:05.000", text: "Second line." },
		]);
	});
});

describe("buildVttFromCues", () => {
	it("preserves timestamps and substitutes translated text", () => {
		const cues = parseVttCues(sampleVtt);
		const translatedTexts = ["Salom", "Ikkinchi qator"];

		const output = buildVttFromCues(cues, translatedTexts);

		expect(output).toContain("00:00:00.000 --> 00:00:02.500");
		expect(output).toContain("00:00:02.500 --> 00:00:05.000");
		expect(output).toContain("Salom");
		expect(output).toContain("Ikkinchi qator");
		expect(output).not.toContain("Hello there.");
		expect(output).not.toContain("Second line.");
	});

	it("throws on cue/translation count mismatch", () => {
		const cues = parseVttCues(sampleVtt);

		expect(() => buildVttFromCues(cues, ["only one"])).toThrow();
	});

	it("round-trips through parseVttCues again with translated text in order", () => {
		const cues = parseVttCues(sampleVtt);
		const translatedTexts = ["Salom", "Ikkinchi qator"];

		const rebuilt = parseVttCues(buildVttFromCues(cues, translatedTexts));

		expect(rebuilt).toHaveLength(2);
		expect(rebuilt[0]?.text).toBe("Salom");
		expect(rebuilt[1]?.text).toBe("Ikkinchi qator");
		expect(rebuilt[0]?.start).toBe("00:00:00.000");
		expect(rebuilt[1]?.end).toBe("00:00:05.000");
	});
});
