import { describe, expect, it, vi } from "vitest";

// Minimal mocks so workflows/transcribe.ts imports for its pure exports.
vi.mock("@cap/database", () => ({ db: vi.fn() }));
vi.mock("@cap/env", () => ({ serverEnv: () => ({}) }));
vi.mock("@cap/web-backend", () => ({ Storage: {} }));
vi.mock("@/lib/server", () => ({ runPromise: vi.fn() }));
vi.mock("workflow", () => ({ FatalError: class FatalError extends Error {} }));
vi.mock("server-only", () => ({}));

import {
	MIN_CHUNK_COVERAGE,
	transcribeAudioChunkWithRetry,
	webVttLastCueEndSec,
} from "@/workflows/transcribe";

// A VTT whose last cue ends at `end` seconds.
function vttEndingAt(end: number): string {
	const hh = String(Math.floor(end / 3600)).padStart(2, "0");
	const mm = String(Math.floor((end % 3600) / 60)).padStart(2, "0");
	const ss = String(Math.floor(end % 60)).padStart(2, "0");
	return `WEBVTT\n\n00:00:00.000 --> ${hh}:${mm}:${ss}.000\nhello\n`;
}

describe("webVttLastCueEndSec", () => {
	it("returns the latest cue end time", () => {
		expect(webVttLastCueEndSec(vttEndingAt(965))).toBe(965);
	});
	it("returns 0 for an empty transcript", () => {
		expect(webVttLastCueEndSec("WEBVTT\n\n")).toBe(0);
	});
});

const chunk = {
	url: "https://x/chunk.mp3",
	key: "k",
	startSec: 900,
	durationSec: 900,
} as never;
const context = { userId: "u", orgId: "o", videoId: "v" };

describe("transcribeAudioChunkWithRetry — coverage-aware", () => {
	it("retries a grossly under-covered chunk and keeps the fuller result", async () => {
		// attempt 1: only 65s of a 900s chunk (the silent-gap bug); attempt 2: full.
		const fn = vi
			.fn()
			.mockResolvedValueOnce(vttEndingAt(65))
			.mockResolvedValueOnce(vttEndingAt(895));
		const out = await transcribeAudioChunkWithRetry(
			{ chunk, ownerEncryptedGeminiKey: null, context },
			fn,
		);
		expect(fn).toHaveBeenCalledTimes(2);
		expect(webVttLastCueEndSec(out)).toBe(895); // kept the fuller one
	});

	it("returns immediately when the first result already covers the chunk", async () => {
		const fn = vi.fn().mockResolvedValue(vttEndingAt(880));
		await transcribeAudioChunkWithRetry(
			{ chunk, ownerEncryptedGeminiKey: null, context },
			fn,
		);
		expect(fn).toHaveBeenCalledTimes(1);
	});

	it("keeps the best partial (never empty) when every attempt is short", async () => {
		const fn = vi
			.fn()
			.mockResolvedValueOnce(vttEndingAt(40))
			.mockResolvedValueOnce(vttEndingAt(120)) // best
			.mockResolvedValueOnce(vttEndingAt(30))
			.mockResolvedValueOnce(vttEndingAt(50));
		const out = await transcribeAudioChunkWithRetry(
			{ chunk, ownerEncryptedGeminiKey: null, context },
			fn,
		);
		expect(fn).toHaveBeenCalledTimes(4); // exhausts attempts trying for coverage
		expect(webVttLastCueEndSec(out)).toBe(120); // best partial, not empty
	});

	it("MIN_CHUNK_COVERAGE is a sane fraction", () => {
		expect(MIN_CHUNK_COVERAGE).toBeGreaterThan(0);
		expect(MIN_CHUNK_COVERAGE).toBeLessThan(1);
	});
});
