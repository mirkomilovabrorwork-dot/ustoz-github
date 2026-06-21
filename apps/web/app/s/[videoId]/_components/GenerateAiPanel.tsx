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

  const etaSec = duration ? Math.ceil(duration / 5) : null;

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/videos/${videoId}/generate`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error ?? "Xatolik yuz berdi");
      } else {
        onStarted?.();
      }
    } catch {
      setError("Xatolik yuz berdi");
    } finally {
      setLoading(false);
    }
  };

  // Step indicator while running
  if (isRunning) {
    const step1Done = transcriptionStatus === "COMPLETE";
    const step = step1Done ? 2 : 1;

    return (
      <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
        <div className="flex items-center gap-2">
          <SpinnerIcon />
          <span className="text-sm font-semibold text-blue-700">
            AI tahlil ishlamoqda… ({step}/2)
          </span>
          {etaSec && step === 1 && (
            <span className="ml-auto text-xs text-blue-400">
              taxminan {etaSec}s
            </span>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <StepRow
            label="Transkripsiya tayyorlanmoqda…"
            done={step1Done}
            active={!step1Done}
          />
          <StepRow
            label="AI tahlil: xulosa, vazifalar, refined…"
            done={false}
            active={step1Done}
          />
        </div>
      </div>
    );
  }

  // Error state
  if (hasError && canGenerate) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-4">
        <p className="text-sm text-red-700">
          AI tahlil xato bilan tugadi.{" "}
          {transcriptionStatus === "ERROR"
            ? "Transkripsiya amalga oshmadi."
            : "AI generatsiya xatosi."}
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="button"
          disabled={loading}
          onClick={handleStart}
          className="self-start rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
        >
          {loading ? "Boshlanmoqda…" : "Qayta urinish"}
        </button>
      </div>
    );
  }

  // Show start button to admin/owner when: nothing generated yet, OR transcript done but AI missing/errored
  if (canGenerate && (!transcriptionStatus || (transcriptionStatus === "COMPLETE" && aiGenerationStatus !== "COMPLETE"))) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-4">
        <p className="text-sm text-gray-700">
          Bu video uchun AI tahlil hali boshlanmagan.
        </p>
        {error && <p className="text-xs text-red-500">{error}</p>}
        <button
          type="button"
          disabled={loading}
          onClick={handleStart}
          className="self-start rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
        >
          {loading ? "Boshlanmoqda…" : "AI tahlilni boshlash"}
        </button>
      </div>
    );
  }

  // Non-admin viewer with no content: neutral empty state
  if (!transcriptionStatus && !aiGenerationStatus) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center">
        <p className="text-sm text-gray-500">AI tahlil mavjud emas.</p>
      </div>
    );
  }

  return null;
}

function SpinnerIcon() {
  return (
    <svg
      className="size-4 animate-spin text-blue-600"
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

function StepRow({
  label,
  done,
  active,
}: {
  label: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 text-sm ${
        done
          ? "text-green-600"
          : active
            ? "text-blue-700 font-medium"
            : "text-gray-400"
      }`}
    >
      {done ? (
        <svg className="size-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      ) : active ? (
        <svg
          className="size-4 shrink-0 animate-spin"
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
      ) : (
        <span className="size-4 shrink-0 rounded-full border border-gray-300 inline-flex items-center justify-center text-xs">
          ○
        </span>
      )}
      {label}
    </div>
  );
}
