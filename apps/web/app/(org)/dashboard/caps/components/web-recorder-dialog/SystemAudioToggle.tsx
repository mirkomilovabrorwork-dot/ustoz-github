"use client";

import clsx from "clsx";
import { Volume2Icon, VolumeOffIcon } from "lucide-react";
import type { RecordingMode } from "./RecordingModeSelector";
import { useTranslations } from "next-intl";

interface SystemAudioToggleProps {
	enabled: boolean;
	disabled?: boolean;
	recordingMode: RecordingMode;
	onToggle: (enabled: boolean) => void;
}

export const SystemAudioToggle = ({
	enabled,
	disabled = false,
	recordingMode,
	onToggle,
}: SystemAudioToggleProps) => {
	const t = useTranslations("recorder");
	const SYSTEM_AUDIO_HINTS: Partial<Record<RecordingMode, string>> = {
		fullscreen: t("systemAudioHintFullscreen"),
		window: t("systemAudioHintWindow"),
	};
	const Icon = enabled ? Volume2Icon : VolumeOffIcon;
	const hint = enabled ? SYSTEM_AUDIO_HINTS[recordingMode] : undefined;

	return (
		<div className="flex flex-col gap-[0.25rem] items-stretch text-[--text-primary]">
			<button
				type="button"
				disabled={disabled}
				onClick={() => onToggle(!enabled)}
				className={clsx(
					"relative flex flex-row items-center h-[2.75rem] px-[0.375rem] gap-[0.375rem] border border-gray-3 rounded-xl w-full transition-colors overflow-hidden font-normal text-[0.875rem] text-[--text-primary] disabled:text-gray-11",
					disabled ? "cursor-default" : "cursor-pointer hover:bg-gray-3/50",
				)}
			>
				<Icon className="size-4 text-gray-11 shrink-0" />
				<span className="flex-1 text-left truncate">{t("systemAudio")}</span>
				<span
					className={clsx(
						"px-[0.375rem] h-[1.25rem] min-w-[2.5rem] rounded-full text-[0.75rem] leading-[1.25rem] flex items-center justify-center font-normal transition-colors duration-200",
						enabled
							? "bg-[var(--blue-3)] text-[var(--blue-11)] dark:bg-[var(--blue-4)] dark:text-[var(--blue-12)]"
							: "bg-[var(--red-3)] text-[var(--red-11)] dark:bg-[var(--red-4)] dark:text-[var(--red-12)]",
					)}
				>
					{enabled ? t("statusOn") : t("statusOff")}
				</span>
			</button>
			{hint && (
				<p className="text-xs leading-snug text-gray-11 px-[0.375rem]">
					{hint}
				</p>
			)}
		</div>
	);
};
