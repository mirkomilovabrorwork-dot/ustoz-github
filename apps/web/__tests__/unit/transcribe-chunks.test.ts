import { describe, expect, it, vi } from "vitest";

// ─── Mock heavy production dependencies that transcribe.ts imports ────────────
vi.mock("@cap/database", () => ({ db: vi.fn() }));
vi.mock("@cap/env", () => ({ serverEnv: () => ({}) }));
vi.mock("@cap/web-backend", () => ({ Storage: {} }));
vi.mock("@cap/database/crypto", () => ({ decrypt: vi.fn() }));
vi.mock("@cap/utils", () => ({ userIsPro: vi.fn() }));
vi.mock("@cap/web-domain", () => ({}));
vi.mock("@/lib/server", () => ({ runPromise: vi.fn() }));
vi.mock("@/lib/video-storage", () => ({ getStorageAccessForVideo: vi.fn() }));
vi.mock("@/lib/ai-cost-guard", () => ({ withCostGuard: vi.fn() }));
vi.mock("@/lib/ai-generation-request", () => ({
  shouldStartAiAfterTranscription: vi.fn(),
}));
vi.mock("@/lib/audio-enhance", () => ({
  ENHANCED_AUDIO_CONTENT_TYPE: "audio/wav",
  ENHANCED_AUDIO_EXTENSION: "wav",
  enhanceAudioFromUrl: vi.fn(),
}));
vi.mock("@/lib/audio-extract", () => ({
  checkHasAudioTrack: vi.fn(),
  extractAudioChunksFromUrl: vi.fn(),
  extractAudioFromUrl: vi.fn(),
}));
vi.mock("@/lib/generate-ai", () => ({ startAiGeneration: vi.fn() }));
vi.mock("@/lib/transcription-settings", () => ({
  isTranscriptionDisabled: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("workflow", () => ({
  FatalError: class FatalError extends Error {
    readonly _tag = "FatalError";
  },
}));

// ─── Import AFTER mocks ───────────────────────────────────────────────────────
import { FatalError } from "workflow";
import { mergeChunkedWebVtt } from "@/lib/gemini-transcribe";
import {
  transcribeAudioChunks,
  transcribeAudioChunkWithRetry,
} from "@/workflows/transcribe";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CTX = { userId: "u1", orgId: "o1", videoId: "v1" };

function makeChunk(startSec: number) {
  return {
    key: `chunk-${startSec}`,
    url: `https://example.com/audio-${startSec}.mp3`,
    startSec,
    durationSec: 900 as number | null,
  };
}

function makeAudio(startSecs: number[]) {
  return {
    chunks: startSecs.map(makeChunk),
    totalDurationSec: startSecs.length * 900,
  };
}

/** Build a minimal valid VTT with one cue whose text uniquely identifies the chunk. */
function chunkVtt(label: string, startSec = 0): string {
  return `WEBVTT\n\n1\n${fmt(startSec)} --> ${fmt(startSec + 2)}\n${label}\n\n`;
}

function fmt(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.000`;
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("transcribeAudioChunks", () => {
  // A) All 3 chunks succeed
  it("A) all-succeed: merged VTT contains all 3 chunks content", async () => {
    const audio = makeAudio([0, 900, 1800]);

    const stub = vi.fn(async ({ chunk }: { chunk: { startSec: number } }) =>
      chunkVtt(`chunk-at-${chunk.startSec}`, 1),
    );

    const result = await transcribeAudioChunks(audio, null, CTX, stub);

    expect(result).toContain("chunk-at-0");
    expect(result).toContain("chunk-at-900");
    expect(result).toContain("chunk-at-1800");
    // Sanity: starts with WEBVTT
    expect(result.startsWith("WEBVTT")).toBe(true);
    // Should not throw — reaching here is the assertion
  });

  // B) THE FIX: chunk index 1 fails → resolved, partial result, chunk 0 & 2 present
  it("B) partial-failure (THE FIX): chunk 1 fails → resolves with chunks 0 and 2, not chunk 1", async () => {
    const audio = makeAudio([0, 900, 1800]);
    const failingStartSec = 900;

    const stub = vi.fn(
      async ({ chunk }: { chunk: { startSec: number } }) => {
        if (chunk.startSec === failingStartSec) {
          throw new Error("transient API error");
        }
        return chunkVtt(`chunk-at-${chunk.startSec}`, 1);
      },
    );

    // Must NOT throw — this is exactly what the fault-tolerance fix guarantees
    const result = await transcribeAudioChunks(audio, null, CTX, stub);

    expect(result).toContain("chunk-at-0");
    expect(result).not.toContain("chunk-at-900"); // gap — content absent
    expect(result).toContain("chunk-at-1800");
  });

  // C) All 3 chunks fail → rejects
  it("C) all-fail: rejects with message about all chunks failing", async () => {
    const audio = makeAudio([0, 900, 1800]);

    const stub = vi.fn(async () => {
      throw new Error("always fails");
    });

    await expect(
      transcribeAudioChunks(audio, null, CTX, stub),
    ).rejects.toThrow(/All 3 .*chunks failed/);
  });

  // G) onProgress is called once per chunk with monotonically increasing completed counts
  it("G) onProgress called once per chunk; completed increases 1,2,3 and total===3; result unchanged", async () => {
    const audio = makeAudio([0, 900, 1800]);
    const stub = vi.fn(async ({ chunk }: { chunk: { startSec: number } }) =>
      chunkVtt(`chunk-at-${chunk.startSec}`, 1),
    );

    const progressCalls: { completed: number; total: number }[] = [];
    const onProgress = vi.fn(async (p: { transcribedChunks: Array<{ vtt: string; offsetSec: number }>; completed: number; total: number }) => {
      progressCalls.push({ completed: p.completed, total: p.total });
    });

    const result = await transcribeAudioChunks(audio, null, CTX, stub, onProgress);

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(progressCalls.map((p) => p.completed)).toEqual([1, 2, 3]);
    expect(progressCalls.every((p) => p.total === 3)).toBe(true);
    expect(result).toContain("chunk-at-0");
    expect(result).toContain("chunk-at-900");
    expect(result).toContain("chunk-at-1800");
  });

  // H) onProgress that throws does NOT abort transcription
  it("H) onProgress that throws does not abort; full transcript still returned", async () => {
    const audio = makeAudio([0, 900, 1800]);
    const stub = vi.fn(async ({ chunk }: { chunk: { startSec: number } }) =>
      chunkVtt(`chunk-at-${chunk.startSec}`, 1),
    );

    const onProgress = vi.fn(async () => {
      throw new Error("partial-save exploded");
    });

    // Must NOT throw even though onProgress always throws
    const result = await transcribeAudioChunks(audio, null, CTX, stub, onProgress);

    expect(result).toContain("chunk-at-0");
    expect(result).toContain("chunk-at-900");
    expect(result).toContain("chunk-at-1800");
  });
});

describe("transcribeAudioChunkWithRetry", () => {
  const chunk = makeChunk(0);

  // D) Retry: 3 failures then success on attempt 4 → resolves; stub called exactly 4 times
  it("D) retry success on attempt 4 → resolves; stub called exactly 4 times", async () => {
    let calls = 0;
    const stub = vi.fn(async () => {
      calls++;
      if (calls < 4) throw new Error(`fail attempt ${calls}`);
      return "SUCCESS_VTT";
    });

    const result = await transcribeAudioChunkWithRetry(
      { chunk, ownerEncryptedGeminiKey: null, context: CTX },
      stub,
    );

    expect(result).toBe("SUCCESS_VTT");
    expect(stub).toHaveBeenCalledTimes(4);
  });

  // E) FatalError on first call → rejects immediately; stub called exactly once (no retries)
  it("E) FatalError → rejects immediately, stub called exactly once", async () => {
    const stub = vi.fn(async () => {
      throw new FatalError("no api key");
    });

    await expect(
      transcribeAudioChunkWithRetry(
        { chunk, ownerEncryptedGeminiKey: null, context: CTX },
        stub,
      ),
    ).rejects.toBeInstanceOf(FatalError);

    expect(stub).toHaveBeenCalledTimes(1);
  });

  // F) Always throws plain Error → rejects after exactly 4 calls
  it("F) retry exhausted: rejects after exactly 4 calls", async () => {
    const stub = vi.fn(async () => {
      throw new Error("persistent error");
    });

    await expect(
      transcribeAudioChunkWithRetry(
        { chunk, ownerEncryptedGeminiKey: null, context: CTX },
        stub,
      ),
    ).rejects.toThrow("persistent error");

    expect(stub).toHaveBeenCalledTimes(4);
  });
});

// ─── Smoke-check that mergeChunkedWebVtt is the real implementation ───────────
describe("mergeChunkedWebVtt (real implementation exercised)", () => {
  it("offsets timestamps correctly when used with chunk VTTs", () => {
    const merged = mergeChunkedWebVtt([
      { vtt: chunkVtt("hello", 1), offsetSec: 0 },
      { vtt: chunkVtt("world", 1), offsetSec: 900 },
    ]);
    expect(merged).toContain("hello");
    expect(merged).toContain("world");
    // Second chunk cue should be offset by 900s → 00:15:01.000
    expect(merged).toContain("00:15:01.000");
  });
});
