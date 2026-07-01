"use client";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@cap/ui";
import type { Video } from "@cap/web-domain";
import { MoreVertical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
  /** When true, the completed analysis looks incomplete ("chala") and the
   * re-analyze affordance should be shown prominently instead of tucked away. */
  aiIncomplete?: boolean;
  /** Called after a successful POST so the parent can refetch status */
  onStarted?: () => void;
}

function deriveProgressState(
  transcriptionStatus: TranscriptionStatus | null | undefined,
  aiGenerationStatus: AiGenerationStatus | null | undefined,
): {
  labelKey: string;
  phase: "idle" | "transcribing" | "queued" | "generating" | "done";
} {
  if (
    transcriptionStatus === "COMPLETE" &&
    (aiGenerationStatus === "COMPLETE" || aiGenerationStatus === "SKIPPED")
  ) {
    return { labelKey: "aiAnalysisReady", phase: "done" };
  }

  if (
    transcriptionStatus === "COMPLETE" &&
    aiGenerationStatus === "QUEUED"
  ) {
    return {
      labelKey: "aiTranscriptReadyQueued",
      phase: "queued",
    };
  }

  if (
    transcriptionStatus === "COMPLETE" &&
    aiGenerationStatus === "PROCESSING"
  ) {
    return {
      labelKey: "aiGenerating",
      phase: "generating",
    };
  }

  if (transcriptionStatus === "COMPLETE") {
    return {
      labelKey: "aiTranscriptReadyIdle",
      phase: "idle",
    };
  }

  if (transcriptionStatus === "PROCESSING") {
    return {
      labelKey: "aiTranscribing",
      phase: "transcribing",
    };
  }

  return { labelKey: "aiPreparing", phase: "idle" };
}

export function getAiAnalysisNotice(duration?: number | null): "long" | "medium" | null {
  if (!duration || duration <= 30 * 60) return null;
  if (duration >= 60 * 60) return "long";
  return "medium";
}

export function GenerateAiPanel({
  videoId,
  canGenerate,
  transcriptionStatus,
  aiGenerationStatus,
  duration,
  aiIncomplete = false,
  onStarted,
}: GenerateAiPanelProps) {
  const t = useTranslations("generateAi");
  const tShare = useTranslations("share");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reprocessMode, setReprocessMode] = useState(false);
  const isRunning =
    transcriptionStatus === "PROCESSING" ||
    aiGenerationStatus === "QUEUED" ||
    aiGenerationStatus === "PROCESSING";

  const isDone =
    transcriptionStatus === "COMPLETE" &&
    (aiGenerationStatus === "COMPLETE" ||
      aiGenerationStatus === "SKIPPED" ||
      aiGenerationStatus === "ERROR");

  // Nothing to show if already complete with data (unless owner can re-analyze)
  if (isDone && aiGenerationStatus === "COMPLETE" && !canGenerate) return null;

  const hasError =
    transcriptionStatus === "ERROR" || aiGenerationStatus === "ERROR";
  const aiNotice = getAiAnalysisNotice(duration);

  // Open the cost-confirmation dialog instead of firing AI immediately, so the
  // user consciously approves the spend before any Gemini budget is used.
  const requestStart = (reprocess = false) => {
    setError(null);
    setReprocessMode(reprocess);
    setConfirmOpen(true);
  };

  const handleStart = async () => {
    setConfirmOpen(false);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reprocess: reprocessMode }),
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

  const confirmDialog = (
    <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("confirmTitle")}</DialogTitle>
        </DialogHeader>
        <p className="px-5 py-4 text-sm text-gray-11">
          {t("confirmBody")}
          {aiNotice ? ` ${tShare(aiNotice === "long" ? "aiNoticeLong" : "aiNoticeMedium")}` : ""}
        </p>
        <DialogFooter>
          <button
            type="button"
            onClick={() => setConfirmOpen(false)}
            className="rounded-lg border border-gray-5 bg-gray-3 px-4 py-2 text-sm font-medium text-gray-12 transition-colors hover:bg-gray-4"
          >
            {t("confirmCancel")}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleStart}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {t("confirmStart")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ── Running state: persisted pipeline stage ──────────────────────────────
  if (isRunning) {
    const { labelKey, phase } = deriveProgressState(
      transcriptionStatus,
      aiGenerationStatus,
    );
    const steps = [
      {
        key: "transcribing",
        label: tShare("aiStepTranscribing"),
        state:
          transcriptionStatus === "COMPLETE"
            ? "done"
            : phase === "transcribing"
              ? "current"
              : "pending",
      },
      {
        key: "generating",
        label: tShare("aiStepAiAnalysis"),
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
            {tShare("aiAnalyzing")}
          </span>
        </div>

        <div className="flex gap-2" aria-label={tShare("aiAnalysisStage")}>
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
        <p className="text-sm text-blue-11">{tShare(labelKey)}</p>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (hasError && canGenerate) {
    return (
      <>
        <div className="flex flex-col gap-3 rounded-xl border border-red-6 bg-red-3 px-4 py-4">
          <p className="text-sm text-red-11">
            {tShare("aiAnalysisFailed")}{" "}
            {transcriptionStatus === "ERROR"
              ? tShare("aiTranscriptionFailed")
              : tShare("aiGenerationError")}
          </p>
          {error && (
            <p className="text-xs text-red-10">{error}</p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => requestStart(false)}
            className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
          >
            {loading ? tShare("aiStarting") : tShare("aiRetry")}
          </button>
        </div>
        {confirmDialog}
      </>
    );
  }

  // ── Owner re-analyze when analysis already complete ────────────────────────
  if (
    canGenerate &&
    transcriptionStatus === "COMPLETE" &&
    aiGenerationStatus === "COMPLETE"
  ) {
    // Incomplete-looking ("chala") analysis: keep a visible, calm prompt so
    // the owner notices and re-runs it.
    if (aiIncomplete) {
      return (
        <>
          <div className="flex flex-col gap-2 rounded-xl border border-gray-4 bg-gray-2 px-4 py-3">
            <p className="text-xs text-gray-10">{tShare("aiIncompleteHint")}</p>
            {error && <p className="text-xs text-red-10">{error}</p>}
            <button
              type="button"
              disabled={loading}
              onClick={() => requestStart(true)}
              className="self-start rounded-lg border border-gray-5 bg-gray-3 px-4 py-2 text-sm font-medium text-gray-12 transition-colors hover:bg-gray-4 disabled:opacity-60"
            >
              {loading ? tShare("aiStarting") : tShare("aiReanalyze")}
            </button>
          </div>
          {confirmDialog}
        </>
      );
    }

    // Good analysis: don't alarm the owner with a panel — tuck re-analyze
    // into a discreet overflow menu instead.
    return (
      <>
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={tShare("aiReanalyze")}
                className="rounded-md p-1.5 text-gray-9 hover:bg-gray-3 hover:text-gray-11"
              >
                <MoreVertical className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                disabled={loading}
                onClick={() => requestStart(true)}
              >
                {tShare("aiReanalyze")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {confirmDialog}
      </>
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
      <>
        <div className="flex flex-col gap-3 rounded-xl border border-blue-6 bg-blue-3 px-4 py-4">
          <p className="text-sm text-gray-12">
            {tShare("aiNotRunYet")}
          </p>
          {aiNotice && (
            <p className="text-xs text-gray-10">
              {tShare(aiNotice === "long" ? "aiNoticeLong" : "aiNoticeMedium")}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-10">{error}</p>
          )}
          <button
            type="button"
            disabled={loading}
            onClick={() => requestStart(false)}
            className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
          >
            {loading ? tShare("aiStarting") : tShare("aiStartAnalysis")}
          </button>
        </div>
        {confirmDialog}
      </>
    );
  }

  // ── Non-admin viewer with no content ─────────────────────────────────────
  if (!transcriptionStatus && !aiGenerationStatus) {
    return (
      <div className="rounded-xl border border-gray-4 bg-gray-2 px-4 py-6 text-center">
        <p className="text-sm text-gray-10">
          {tShare("aiNotAvailable")}
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
