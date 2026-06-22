"use client";

import { useState } from "react";
import type { Video } from "@cap/web-domain";

type TranscriptionStatus =
  | "PROCESSING"
  | "COMPLETE"
  | "ERROR"
  | "SKIPPED"
  | "NO_AUDIO";

type AiGenerationStatus =
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETE"
  | "ERROR"
  | "SKIPPED";

interface GenerateAiPanelProps {
  videoId: Video.VideoId;
  canGenerate: boolean;
  transcriptionStatus: TranscriptionStatus | null | undefined;
  aiGenerationStatus: AiGenerationStatus | null | undefined;
  duration?: number | null;
  /** Called after a successful POST so the parent can refetch status */
  onStarted?: () => void;
}

/**
 * Derives a deterministic percent [0..100] and a human label from the two
 * pipeline statuses.  The bar itself uses CSS animation to sweep within each
 * phase range so it always appears to be moving, even without finer progress.
 *
 * Mapping:
 *   null / not-started                       →   0 %
 *   transcription PROCESSING                 →  10 – 45 %  (midpoint label 30 %)
 *   transcription COMPLETE + AI QUEUED       →  50 %
 *   transcription COMPLETE + AI PROCESSING   →  55 – 90 %  (midpoint label 72 %)
 *   COMPLETE                                 → 100 %
 */
function deriveProgress(
  transcriptionStatus: TranscriptionStatus | null | undefined,
  aiGenerationStatus: AiGenerationStatus | null | undefined,
): {
  percent: number;
  label: string;
  eta: string;
  phase: "idle" | "transcribing" | "generating" | "done";
} {
  if (
    transcriptionStatus === "COMPLETE" &&
    (aiGenerationStatus === "COMPLETE" || aiGenerationStatus === "SKIPPED")
  ) {
    return { percent: 100, label: "Analysis ready", eta: "", phase: "done" };
  }

  if (
    transcriptionStatus === "COMPLETE" &&
    (aiGenerationStatus === "PROCESSING" || aiGenerationStatus === "QUEUED")
  ) {
    return {
      percent: 72, // midpoint of 55–90 range
      label: "Generating AI analysis… ~72%",
      eta: "About 1–2 minutes left",
      phase: "generating",
    };
  }

  if (transcriptionStatus === "COMPLETE") {
    return {
      percent: 50,
      label: "Transcript ready — starting AI…",
      eta: "About 1–3 minutes left",
      phase: "generating",
    };
  }

  if (transcriptionStatus === "PROCESSING") {
    return {
      percent: 30, // midpoint of 10–45 range
      label: "Transcribing audio… ~30%",
      eta: "About 1–2 minutes left",
      phase: "transcribing",
    };
  }

  return { percent: 0, label: "Preparing…", eta: "", phase: "idle" };
}

export function GenerateAiPanel({
  videoId,
  canGenerate,
  transcriptionStatus,
  aiGenerationStatus,
  duration: _duration,
  onStarted,
}: GenerateAiPanelProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isRunning =
    transcriptionStatus === "PROCESSING" ||
    aiGenerationStatus === "QUEUED" ||
    aiGenerationStatus === "PROCESSING";

  const isDone =
    transcriptionStatus === "COMPLETE" &&
    (aiGenerationStatus === "COMPLETE" ||
      aiGenerationStatus === "SKIPPED" ||
      aiGenerationStatus === "ERROR");

  // Nothing to show if already complete with data
  if (isDone && aiGenerationStatus === "COMPLETE") return null;

  const hasError =
    transcriptionStatus === "ERROR" || aiGenerationStatus === "ERROR";

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/generate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "An error occurred");
      } else {
        onStarted?.();
      }
    } catch {
      setError("An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // ── Running state: percent progress bar ──────────────────────────────────
  if (isRunning) {
    const { percent, label, eta, phase } = deriveProgress(
      transcriptionStatus,
      aiGenerationStatus,
    );

    // CSS animation range per phase so the bar visibly moves
    const animFrom =
      phase === "transcribing" ? "10%" : phase === "generating" ? "55%" : "0%";
    const animTo =
      phase === "transcribing" ? "45%" : phase === "generating" ? "90%" : "5%";

    return (
      <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 dark:border-blue-900 dark:bg-blue-950/40">
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SpinnerIcon />
            <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
              Analyzing…
            </span>
          </div>
          <span className="text-sm font-bold tabular-nums text-blue-700 dark:text-blue-300">
            {percent}%
          </span>
        </div>

        {/* Progress bar */}
        <div
          className="relative h-2.5 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-800"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="AI analysis progress"
        >
          {/* Animated fill */}
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-blue-600 dark:bg-blue-400"
            style={{
              width: `${percent}%`,
              // Sweep within the phase range to look alive
              animation: `progressSweep 3s ease-in-out infinite alternate`,
              ["--from" as string]: animFrom,
              ["--to" as string]: animTo,
            }}
          />
        </div>

        {/* Label */}
        <p className="text-sm text-blue-700 dark:text-blue-300">{label}</p>

        {/* ETA */}
        {eta && (
          <p className="text-xs text-blue-400 dark:text-blue-500">{eta}</p>
        )}

        {/* Inline keyframes — scoped to this panel */}
        <style>{`
          @keyframes progressSweep {
            from { width: var(--from); }
            to   { width: var(--to); }
          }
        `}</style>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (hasError && canGenerate) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-4 dark:border-red-900 dark:bg-red-950/40">
        <p className="text-sm text-red-700 dark:text-red-300">
          AI analysis failed.{" "}
          {transcriptionStatus === "ERROR"
            ? "Transcription failed."
            : "AI generation error."}
        </p>
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={handleStart}
          className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {loading ? "Starting…" : "Retry"}
        </button>
      </div>
    );
  }

  // ── Start button (admin/owner) ────────────────────────────────────────────
  if (
    canGenerate &&
    (!transcriptionStatus ||
      (transcriptionStatus === "COMPLETE" &&
        aiGenerationStatus !== "COMPLETE"))
  ) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 dark:border-blue-900 dark:bg-blue-950/40">
        <p className="text-sm text-gray-700 dark:text-gray-300">
          AI analysis hasn't been run for this video yet.
        </p>
        {error && (
          <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
        )}
        <button
          type="button"
          disabled={loading}
          onClick={handleStart}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Starting…" : "Start AI analysis"}
        </button>
      </div>
    );
  }

  // ── Non-admin viewer with no content ─────────────────────────────────────
  if (!transcriptionStatus && !aiGenerationStatus) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center dark:border-gray-700 dark:bg-gray-900/40">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          AI analysis not available.
        </p>
      </div>
    );
  }

  return null;
}

function SpinnerIcon() {
  return (
    <svg
      className="size-4 animate-spin text-blue-600 dark:text-blue-400"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
