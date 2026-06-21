"use client";

import { useEffect, useRef } from "react";
import { renderMarkdownBold } from "./markdownBold";

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
									className="group"
								style={{
									display: "grid",
									gridTemplateColumns: "42px 1fr 38px",
									gap: "14px",
									alignItems: "start",
									padding: "14px 16px",
									marginBottom: "6px",
									borderRadius: "16px",
									background: active ? "#eef4ff" : "#fff",
									border: active ? "1px solid rgba(37,99,235,.16)" : "1px solid transparent",
									position: "relative",
									cursor: "default",
									transition: "background 320ms, border-color 320ms, box-shadow 320ms",
									boxShadow: active ? undefined : "0 1px 3px rgba(15,23,42,.045)",
								}}
								>
									<div className="flex flex-col items-center gap-1 pt-0.5">
										<div
											className="flex items-center justify-center text-[14px] font-bold text-white shrink-0"
											style={{
												width: "42px",
												height: "42px",
												borderRadius: "13px",
												backgroundColor: avatarBg,
												boxShadow: "inset 0 0 0 1px rgba(255,255,255,.22), 0 2px 6px rgba(15,23,42,.12)",
												flexShrink: 0,
											}}
											title={group.speaker}
										>
											{initials}
										</div>
										<span
										  style={{
										    fontSize: "11px",
										    fontWeight: 600,
										    color: "#94a3b8",
										    fontVariantNumeric: "tabular-nums",
										    background: "#f0f4f9",
										    padding: "2px 8px",
										    borderRadius: "999px",
										  }}
										>
										  {cue.timestamp}
										</span>
									</div>

									<p className="min-w-0 break-words" style={{ fontSize: "13.5px", lineHeight: 1.72, color: "#475569", paddingTop: "4px" }}>
										{renderMarkdownBold(cue.text)}
									</p>

									<div className="flex items-start justify-end pt-1">
										<button
											type="button"
											onClick={() => onVideoJump?.(cue.startSeconds)}
											aria-label={`Jump to ${cue.timestamp}`}
											className="flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all duration-150 hover:scale-110"
											style={{ width: "34px", height: "34px", background: "#f0f4f9", color: "#475569" }}
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
