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

function deriveProgressState(
  transcriptionStatus: TranscriptionStatus | null | undefined,
  aiGenerationStatus: AiGenerationStatus | null | undefined,
): {
  label: string;
  phase: "idle" | "transcribing" | "queued" | "generating" | "done";
} {
  if (
    transcriptionStatus === "COMPLETE" &&
    (aiGenerationStatus === "COMPLETE" || aiGenerationStatus === "SKIPPED")
  ) {
    return { label: "Analysis ready", phase: "done" };
  }

  if (
    transcriptionStatus === "COMPLETE" &&
    aiGenerationStatus === "QUEUED"
  ) {
    return {
      label: "Transcript ready — AI analysis queued…",
      phase: "queued",
    };
  }

  if (
    transcriptionStatus === "COMPLETE" &&
    aiGenerationStatus === "PROCESSING"
  ) {
    return {
      label: "Generating AI analysis…",
      phase: "generating",
    };
  }

  if (transcriptionStatus === "COMPLETE") {
    return {
      label: "Transcript ready. Start AI analysis when you need it.",
      phase: "idle",
    };
  }

  if (transcriptionStatus === "PROCESSING") {
    return {
      label: "Transcribing audio…",
      phase: "transcribing",
    };
  }

  return { label: "Preparing…", phase: "idle" };
}

export function getAiAnalysisNotice(duration?: number | null): string | null {
  if (!duration || duration <= 30 * 60) return null;
  if (duration >= 60 * 60) {
    return "Long video: transcription runs in smaller chunks, and AI analysis can take longer. It only starts after you click.";
  }
  return "Longer video: AI analysis may take extra time and budget. It only starts after you click.";
}

export function GenerateAiPanel({
  videoId,
  canGenerate,
  transcriptionStatus,
  aiGenerationStatus,
  duration,
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
  const aiNotice = getAiAnalysisNotice(duration);

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

  // ── Running state: persisted pipeline stage ──────────────────────────────
  if (isRunning) {
    const { label, phase } = deriveProgressState(
      transcriptionStatus,
      aiGenerationStatus,
    );
    const steps = [
      {
        key: "transcribing",
        label: "Transcribing",
        state:
          transcriptionStatus === "COMPLETE"
            ? "done"
            : phase === "transcribing"
              ? "current"
              : "pending",
      },
      {
        key: "generating",
        label: "AI analysis",
        state:
          aiGenerationStatus === "COMPLETE" || aiGenerationStatus === "SKIPPED"
            ? "done"
            : phase === "queued" || phase === "generating"
              ? "current"
              : "pending",
      },
    ] as const;

    return (
      <div className="flex flex-col gap-3 rounded-xl border border-blue-6 bg-blue-3 px-4 py-4">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <SpinnerIcon />
          <span className="text-sm font-semibold text-blue-11">
            Analyzing…
          </span>
        </div>

        <div className="flex gap-2" aria-label="AI analysis stage">
          {steps.map((step) => (
            <div
              key={step.key}
              className={`flex-1 rounded-full px-3 py-1.5 text-center text-xs font-medium ${
                step.state === "done"
                  ? "bg-blue-9 text-white"
                  : step.state === "current"
                    ? "bg-blue-4 text-blue-11 ring-1 ring-blue-7"
                    : "bg-blue-4/60 text-blue-9"
              }`}
            >
              {step.label}
            </div>
          ))}
        </div>

        {/* Label */}
        <p className="text-sm text-blue-11">{label}</p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (hasError && canGenerate) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-red-6 bg-red-3 px-4 py-4">
        <p className="text-sm text-red-11">
          AI analysis failed.{" "}
          {transcriptionStatus === "ERROR"
            ? "Transcription failed."
            : "AI generation error."}
        </p>
        {error && (
          <p className="text-xs text-red-10">{error}</p>
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
      <div className="flex flex-col gap-3 rounded-xl border border-blue-6 bg-blue-3 px-4 py-4">
        <p className="text-sm text-gray-12">
          AI analysis has not been run for this video yet.
        </p>
        {aiNotice && (
          <p className="text-xs text-gray-10">
            {aiNotice}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-10">{error}</p>
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
      <div className="rounded-xl border border-gray-4 bg-gray-2 px-4 py-6 text-center">
        <p className="text-sm text-gray-10">
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
      className="size-4 animate-spin text-blue-10"
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
