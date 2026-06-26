"use client";

import { useEffect, useRef } from "react";
import { formatTimeMinutes } from "../utils/transcript-utils";
import { renderMarkdownBold } from "./markdownBold";

interface TranscriptPanelProps {
	transcriptContent?: string;
	currentTime?: number;
	onVideoJump?: (seconds: number) => void;
	chapters?: { startSec: number; title: string }[];
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

		// Skip standalone cue-identifier lines (bare integers before a timestamp line).
		if (/^\d+$/.test(line) && !line.includes("-->")) {
			i++;
			continue;
		}

		if (line.includes("-->")) {
			// Strip leading markdown / bracket decoration:
			// handles "**[00:00:00.000 --> 00:00:05.500]** text"
			//          "[00:00:00.000 --> 00:00:05.500] text"
			//          "00:00:00.000 --> 00:00:05.500 text"
			const stripped = line.replace(/^\*{0,2}\[?/, "");

			const arrowIdx = stripped.indexOf("-->");
			if (arrowIdx === -1) {
				i++;
				continue;
			}

			const startRaw = stripped.slice(0, arrowIdx).trim();
			const afterArrow = stripped.slice(arrowIdx + 3);

			// The end timestamp runs up to the first ']', '**', or cue setting
			// (position/align/line keywords). Take only the time token.
			const endTokenMatch = afterArrow.match(/^[\s]*([\d:.]+)/);
			const endRaw = endTokenMatch?.[1]?.trim() ?? "";

			const startSeconds = vttTimeToSeconds(startRaw);
			const endSeconds = vttTimeToSeconds(endRaw);

			if (startSeconds === null || endSeconds === null) {
				i++;
				continue;
			}

			// Capture any inline text that follows the closing bracket / **
			// e.g. "**[start --> end]** spoken text here"
			// Everything after the end timestamp token, then strip decorators.
			const afterEnd = afterArrow.slice((endTokenMatch?.[0]?.length ?? 0));
			const inlineText = afterEnd
				.replace(/^[^\]]*\]/, "") // drop up to first ']' (handles closing bracket)
				.replace(/\*\*/g, "")     // remove bold markdown
				.replace(/^[\s\-–—:>]+/, "") // strip leading separators
				.trim();

			let rawText: string;

			if (inlineText) {
				// Text was on the same line — do NOT consume following lines.
				rawText = inlineText;
				i++;
			} else {
				// Standard multi-line VTT: collect following non-empty lines.
				i++;
				const textLines: string[] = [];
				while (i < lines.length && (lines[i]?.trim() ?? "") !== "") {
					textLines.push(lines[i] ?? "");
					i++;
				}
				rawText = textLines.join(" ").trim();
			}

			// Discard parser artifacts: empty, bare numbers, or punctuation-only.
			if (!rawText || /^[\d\s\-–—.,;:!?]+$/.test(rawText)) {
				continue;
			}

			const { speaker, text } = extractSpeaker(rawText);
			cues.push({
				id: cues.length,
				startSeconds,
				endSeconds,
				text,
				speaker,
				timestamp: formatTimestamp(startSeconds),
			});
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

interface ChapterSection {
	startSec: number;
	title: string;
	cues: Cue[];
}

function groupByChapters(
	cues: Cue[],
	chapters: { startSec: number; title: string }[],
): ChapterSection[] {
	if (chapters.length === 0) return [];

	const sorted = [...chapters].sort((a, b) => a.startSec - b.startSec);
	const sections: ChapterSection[] = sorted.map((ch) => ({
		startSec: ch.startSec,
		title: ch.title,
		cues: [],
	}));

	for (const cue of cues) {
		// Find the last chapter whose startSec <= cue.startSeconds
		let chapterIdx = 0;
		for (let i = 0; i < sorted.length; i++) {
			if ((sorted[i]?.startSec ?? 0) <= cue.startSeconds) {
				chapterIdx = i;
			} else {
				break;
			}
		}
		sections[chapterIdx]?.cues.push(cue);
	}

	return sections;
}

function isActive(cue: Cue, currentTime: number): boolean {
	return currentTime >= cue.startSeconds && currentTime < cue.endSeconds;
}

export function TranscriptPanel({
	transcriptContent,
	currentTime = 0,
	onVideoJump,
	chapters,
}: TranscriptPanelProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef<HTMLDivElement>(null);

	const cues = transcriptContent ? parseVTTCues(transcriptContent) : [];

	const useChapterMode = chapters != null && chapters.length > 0;
	const chapterSections = useChapterMode ? groupByChapters(cues, chapters) : [];
	const groups = useChapterMode ? [] : groupBySpeaker(cues);

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
			<div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
				<svg
					aria-hidden="true"
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 24 24"
					fill="none"
					stroke="#94a3b8"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					className="size-8"
				>
					<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
				</svg>
				<p className="text-sm font-medium text-gray-600">No transcript available</p>
				<p className="text-xs text-gray-400">Transcript will appear here once processing is complete</p>
			</div>
		);
	}

	// Shared per-cue card renderer
	function renderCue(cue: Cue, gi: number, ci: number, speaker: string) {
		const hue = speakerHue(speaker);
		const initials = speakerInitials(speaker);
		const avatarBg = `hsl(${hue},55%,55%)`;
		const active = cue.id === activeCueId;

		return (
			<div
				key={`cue-${gi}-${ci}`}
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
						title={speaker}
					>
						{initials}
					</div>
					<span
					  style={{
					    fontSize: "11px",
					    fontWeight: 600,
					    color: "#64748b",
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
	}

	if (useChapterMode) {
		return (
			<div ref={containerRef} className="flex flex-col gap-4 p-4">
				{chapterSections.map((section, si) => (
					<section key={`chapter-${section.startSec}`} className="flex flex-col gap-0.5">
						{/* Chapter header — mirrors RefinedTranscriptPanel style */}
						<div className="mb-2 flex items-center gap-2">
							<button
								type="button"
								onClick={() => onVideoJump?.(section.startSec)}
								className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
							>
								{formatTimeMinutes(section.startSec)}
							</button>
							<h3 className="flex-1 text-sm font-semibold text-gray-900">
								{section.title}
							</h3>
						</div>

						{section.cues.length === 0 ? (
							<p className="text-xs text-gray-400 px-2 pb-2">No speech in this chapter</p>
						) : (
							section.cues.map((cue, ci) =>
								renderCue(cue, si, ci, cue.speaker),
							)
						)}
					</section>
				))}
			</div>
		);
	}

	// Fallback: existing speaker-grouped flat list
	return (
		<div ref={containerRef} className="flex flex-col gap-1 p-4">
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
										    color: "#64748b",
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
