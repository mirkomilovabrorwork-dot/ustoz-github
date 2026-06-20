"use client";

import { useEffect, useRef } from "react";

interface TranscriptPanelProps {
	transcriptContent?: string;
	currentTime?: number;
	onVideoJump?: (seconds: number) => void;
}

interface Cue {
	id: number;
	startSeconds: number;
	endSeconds: number;
	text: string;
	speaker: string;
	timestamp: string;
}

function parseVTTCues(vttContent: string): Cue[] {
	const lines = vttContent.split(/\r?\n/);
	const cues: Cue[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i]?.trim() ?? "";

		if (line === "WEBVTT" || line === "") {
			i++;
			continue;
		}

		if (/^\d+$/.test(line)) {
			// VTT cue-identifier line (Gemini omits these) — skip it.
			// Cue ids are assigned sequentially below so each is unique.
			i++;
			continue;
		}

		if (line.includes("-->")) {
			const [startStr, endStr] = line.split(" --> ");
			const startSeconds = vttTimeToSeconds(startStr?.trim() ?? "");
			const endSeconds = vttTimeToSeconds(endStr?.split(" ")[0]?.trim() ?? "");

			i++;
			const textLines: string[] = [];
			while (i < lines.length && (lines[i]?.trim() ?? "") !== "") {
				textLines.push(lines[i] ?? "");
				i++;
			}

			const rawText = textLines.join(" ").trim();
			if (rawText && startSeconds !== null && endSeconds !== null) {
				const { speaker, text } = extractSpeaker(rawText);
				cues.push({
					id: cues.length,
					startSeconds,
					endSeconds,
					text,
					speaker,
					timestamp: formatTimestamp(startSeconds),
				});
			}
			continue;
		}

		i++;
	}

	return cues;
}

function vttTimeToSeconds(timeStr: string): number | null {
	const parts = timeStr.split(":");
	if (parts.length === 3) {
		const [h, m, s] = parts;
		const hours = parseInt(h ?? "0", 10);
		const minutes = parseInt(m ?? "0", 10);
		const seconds = parseFloat(s ?? "0");
		if (Number.isNaN(hours) || Number.isNaN(minutes) || Number.isNaN(seconds))
			return null;
		return hours * 3600 + minutes * 60 + seconds;
	}
	if (parts.length === 2) {
		const [m, s] = parts;
		const minutes = parseInt(m ?? "0", 10);
		const seconds = parseFloat(s ?? "0");
		if (Number.isNaN(minutes) || Number.isNaN(seconds)) return null;
		return minutes * 60 + seconds;
	}
	return null;
}

function extractSpeaker(text: string): { speaker: string; text: string } {
	const match = text.match(/^<v\s+([^>]+)>(.*)$/);
	if (match) {
		return {
			speaker: match[1]?.trim() ?? "Speaker",
			text: match[2]?.trim() ?? text,
		};
	}
	const colonMatch = text.match(/^([^:]{1,30}):\s+(.+)$/);
	if (colonMatch) {
		return {
			speaker: colonMatch[1]?.trim() ?? "Speaker",
			text: colonMatch[2]?.trim() ?? text,
		};
	}
	return { speaker: "Speaker", text };
}

function formatTimestamp(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function speakerHue(name: string): number {
	let hash = 0;
	for (let i = 0; i < name.length; i++) {
		hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
	}
	return Math.abs(hash) % 360;
}

function speakerInitials(name: string): string {
	return name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase() ?? "")
		.join("");
}

interface CueGroup {
	speaker: string;
	cues: Cue[];
}

function groupBySpeaker(cues: Cue[]): CueGroup[] {
	const groups: CueGroup[] = [];
	for (const cue of cues) {
		const last = groups[groups.length - 1];
		if (last && last.speaker === cue.speaker) {
			last.cues.push(cue);
		} else {
			groups.push({ speaker: cue.speaker, cues: [cue] });
		}
	}
	return groups;
}

function isActive(cue: Cue, currentTime: number): boolean {
	return currentTime >= cue.startSeconds && currentTime < cue.endSeconds;
}

export function TranscriptPanel({
	transcriptContent,
	currentTime = 0,
	onVideoJump,
}: TranscriptPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef<HTMLDivElement>(null);

	const cues = transcriptContent ? parseVTTCues(transcriptContent) : [];
	const groups = groupBySpeaker(cues);

	const activeCueId = cues.find((c) => isActive(c, currentTime))?.id ?? null;

	// biome-ignore lint/correctness/useExhaustiveDependencies: activeCueId drives which DOM node activeRef points to; re-running when it changes is intentional
	useEffect(() => {
		if (activeRef.current) {
			activeRef.current.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
	}, [activeCueId]);

	if (!transcriptContent || cues.length === 0) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-sm text-gray-500">No transcript available.</p>
			</div>
		);
	}

	return (
		<div ref={containerRef} className="flex flex-col gap-1 overflow-y-auto p-4">
			{groups.map((group, gi) => {
				const hue = speakerHue(group.speaker);
				const initials = speakerInitials(group.speaker);
				const avatarBg = `hsl(${hue},55%,55%)`;

				return (
					<div key={`${group.speaker}-${gi}`} className="flex flex-col gap-0.5">
						{group.cues.map((cue, ci) => {
							const active = cue.id === activeCueId;
							return (
								<div
									key={`${group.speaker}-${gi}-${ci}`}
									ref={active ? activeRef : undefined}
									className={`grid items-start rounded-lg px-2 py-2 transition-colors group ${
										active
											? "border-l-2 border-blue-600 bg-blue-50 pl-3"
											: "border-l-2 border-transparent hover:bg-gray-50"
									}`}
									style={{ gridTemplateColumns: "42px 1fr 34px" }}
								>
									<div className="flex flex-col items-center gap-1 pt-0.5">
										<div
											className="flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white shrink-0"
											style={{ backgroundColor: avatarBg }}
											title={group.speaker}
										>
											{initials}
										</div>
										<span className="text-[10px] font-medium text-gray-400 tabular-nums">
											{cue.timestamp}
										</span>
									</div>

									<p className="min-w-0 px-2 pt-1 text-sm leading-relaxed text-gray-800 break-words">
										{cue.text}
									</p>

									<div className="flex items-start justify-end pt-1">
										<button
											type="button"
											onClick={() => onVideoJump?.(cue.startSeconds)}
											aria-label={`Jump to ${cue.timestamp}`}
											className="flex size-6 items-center justify-center rounded-full bg-gray-100 text-gray-500 opacity-0 transition-all duration-150 group-hover:opacity-100 hover:scale-110 hover:bg-blue-100 hover:text-blue-600"
										>
											<svg
												aria-hidden="true"
												xmlns="http://www.w3.org/2000/svg"
												viewBox="0 0 24 24"
												fill="currentColor"
												className="size-3"
											>
												<path d="M8 5v14l11-7z" />
											</svg>
										</button>
									</div>
								</div>
							);
						})}
					</div>
				);
			})}
		</div>
	);
}
