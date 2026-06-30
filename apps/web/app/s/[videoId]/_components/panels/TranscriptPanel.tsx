"use client";

import { useTranslations } from "next-intl";
import React, { useEffect, useRef, useState } from "react";
import { normalizeWebVttVoiceText } from "@/lib/transcript-vtt";
import { clampStartSec, formatTimeMinutes } from "../utils/transcript-utils";
import { renderMarkdownBold } from "./markdownBold";

interface TranscriptPanelProps {
	transcriptContent?: string;
	currentTime?: number;
	onVideoJump?: (seconds: number) => void;
	chapters?: { startSec: number; title: string }[];
	duration?: number | null;
}

interface Cue {
	id: number;
	startSeconds: number;
	endSeconds: number;
	text: string;
	speaker: string | null;
	timestamp: string;
}

export function parseVTTCues(vttContent: string): Cue[] {
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
			const afterEnd = afterArrow.slice(endTokenMatch?.[0]?.length ?? 0);
			const inlineText = afterEnd
				.replace(/^[^\]]*\]/, "") // drop up to first ']' (handles closing bracket)
				.replace(/^\*\*/, "") // drop the timestamp-wrapper's closing ** marker only
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

function extractSpeaker(text: string): {
	speaker: string | null;
	text: string;
} {
	const normalized = normalizeWebVttVoiceText(text);
	if (normalized.text !== text || normalized.speaker) return normalized;

	const colonMatch = text.match(/^([^:]{1,30}):\s+(.+)$/);
	if (colonMatch) {
		return {
			speaker: colonMatch[1]?.trim() ?? "Speaker",
			text: colonMatch[2]?.trim() ?? text,
		};
	}
	return { speaker: null, text };
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
	speaker: string | null;
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

// --- Feature helpers ---

function secondsToSRTTime(sec: number): string {
	const h = Math.floor(sec / 3600);
	const m = Math.floor((sec % 3600) / 60);
	const s = Math.floor(sec % 60);
	const ms = Math.round((sec - Math.floor(sec)) * 1000);
	return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")},${ms.toString().padStart(3, "0")}`;
}

export function cuesToPlainText(cues: Cue[]): string {
	return cues
		.map((c) => {
			const text = c.text.replace(/\*\*/g, "");
			return c.speaker
				? `[${c.timestamp}] ${c.speaker}: ${text}`
				: `[${c.timestamp}] ${text}`;
		})
		.join("\n");
}

export function cuesToSRT(cues: Cue[]): string {
	return cues
		.map(
			(c, i) =>
				`${i + 1}\n${secondsToSRTTime(c.startSeconds)} --> ${secondsToSRTTime(c.endSeconds)}\n${c.text.replace(/\*\*/g, "")}\n`,
		)
		.join("\n");
}

function downloadBlob(content: string, filename: string, type: string): void {
	const blob = new Blob([content], { type });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	URL.revokeObjectURL(url);
}

function highlightMatch(text: string, query: string): React.ReactNode {
	if (!query) return text;
	const idx = text.toLowerCase().indexOf(query.toLowerCase());
	if (idx === -1) return text;
	return (
		<>
			{text.slice(0, idx)}
			<mark
				style={{
					background: "#fde68a",
					color: "inherit",
					borderRadius: "2px",
					padding: "0 1px",
				}}
			>
				{text.slice(idx, idx + query.length)}
			</mark>
			{text.slice(idx + query.length)}
		</>
	);
}

function isActive(cue: Cue, currentTime: number): boolean {
	return currentTime >= cue.startSeconds && currentTime < cue.endSeconds;
}

function normalizeCueTimes(cues: Cue[], duration?: number | null): Cue[] {
	if (!duration || duration <= 0) return cues;

	return cues
		.map((cue) => {
			const recoveredStart = clampStartSec(cue.startSeconds, duration);
			const shouldScaleEnd =
				cue.endSeconds > duration && cue.endSeconds / 60 <= duration;
			const recoveredEnd = shouldScaleEnd
				? cue.endSeconds / 60
				: Math.min(cue.endSeconds, duration);
			const endSeconds =
				recoveredEnd > recoveredStart
					? recoveredEnd
					: Math.min(duration, recoveredStart + 3);

			return {
				...cue,
				startSeconds: recoveredStart,
				endSeconds,
				timestamp: formatTimestamp(recoveredStart),
			};
		})
		.sort((a, b) => a.startSeconds - b.startSeconds);
}

export function TranscriptPanel({
	transcriptContent,
	currentTime = 0,
	onVideoJump,
	chapters,
	duration,
}: TranscriptPanelProps) {
	const t = useTranslations("share");
	const containerRef = useRef<HTMLDivElement>(null);
	const activeRef = useRef<HTMLDivElement>(null);

	const cues = transcriptContent
		? normalizeCueTimes(parseVTTCues(transcriptContent), duration)
		: [];

	const useChapterMode = chapters != null && chapters.length > 0;
	const chapterSections = useChapterMode ? groupByChapters(cues, chapters) : [];
	const groups = useChapterMode ? [] : groupBySpeaker(cues);

	const activeCueId = cues.find((c) => isActive(c, currentTime))?.id ?? null;

	const hasAnySpeaker = useChapterMode
		? chapterSections.some((s) => s.cues.some((c) => c.speaker !== null))
		: groups.some((g) => g.speaker !== null);

	// biome-ignore lint/correctness/useExhaustiveDependencies: activeCueId drives which DOM node activeRef points to; re-running when it changes is intentional
	useEffect(() => {
		if (activeRef.current) {
			activeRef.current.scrollIntoView({
				behavior: "smooth",
				block: "nearest",
			});
		}
	}, [activeCueId]);

	// --- Search state ---
	const [searchQuery, setSearchQuery] = useState("");
	const trimmedQuery = searchQuery.trim();

	// --- Copy state ---
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		navigator.clipboard.writeText(cuesToPlainText(cues)).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}

	// --- Download ---
	function handleDownload(format: "txt" | "srt") {
		if (format === "txt") {
			downloadBlob(cuesToPlainText(cues), "transcript.txt", "text/plain");
		} else {
			downloadBlob(cuesToSRT(cues), "transcript.srt", "text/plain");
		}
	}

	// Filtered cues for search
	const filteredCues = trimmedQuery
		? cues.filter(
				(c) =>
					c.text.toLowerCase().includes(trimmedQuery.toLowerCase()) ||
					(c.speaker?.toLowerCase().includes(trimmedQuery.toLowerCase()) ?? false),
			)
		: cues;
	const filteredCueIds = new Set(filteredCues.map((c) => c.id));

	// Shared panel header (search + copy + download)
	function renderHeader() {
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					gap: "8px",
					padding: "4px 0 8px",
					borderBottom: "1px solid var(--gray-3)",
					marginBottom: "8px",
				}}
			>
				{/* Search row */}
				<div style={{ position: "relative", display: "flex", alignItems: "center" }}>
					<svg
						aria-hidden="true"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						style={{
							position: "absolute",
							left: "10px",
							width: "14px",
							height: "14px",
							color: "var(--gray-10)",
							pointerEvents: "none",
						}}
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
					<input
						type="text"
						value={searchQuery}
						onChange={(e) => setSearchQuery(e.target.value)}
						placeholder="Search transcript..."
						style={{
							flex: 1,
							paddingLeft: "32px",
							paddingRight: searchQuery ? "32px" : "10px",
							paddingTop: "7px",
							paddingBottom: "7px",
							fontSize: "13px",
							background: "var(--gray-2)",
							border: "1px solid var(--gray-4)",
							borderRadius: "8px",
							color: "var(--gray-12)",
							outline: "none",
						}}
					/>
					{searchQuery && (
						<button
							type="button"
							onClick={() => setSearchQuery("")}
							aria-label="Clear search"
							style={{
								position: "absolute",
								right: "8px",
								background: "none",
								border: "none",
								cursor: "pointer",
								color: "var(--gray-10)",
								padding: "2px",
								display: "flex",
								alignItems: "center",
							}}
						>
							<svg
								aria-hidden="true"
								xmlns="http://www.w3.org/2000/svg"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.5"
								strokeLinecap="round"
								style={{ width: "13px", height: "13px" }}
							>
								<line x1="18" y1="6" x2="6" y2="18" />
								<line x1="6" y1="6" x2="18" y2="18" />
							</svg>
						</button>
					)}
				</div>

				{/* Results count + copy + download row */}
				<div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
					{trimmedQuery && (
						<span
							style={{
								fontSize: "12px",
								color: "var(--gray-10)",
								flex: 1,
							}}
						>
							{filteredCues.length} result{filteredCues.length !== 1 ? "s" : ""}
						</span>
					)}
					{!trimmedQuery && <span style={{ flex: 1 }} />}

					{/* Copy button */}
					<button
						type="button"
						onClick={handleCopy}
						title={copied ? "Copied!" : "Copy transcript"}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--blue-3)";
							e.currentTarget.style.color = "var(--blue-11)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--gray-3)";
							e.currentTarget.style.color = "var(--gray-11)";
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "4px",
							padding: "5px 10px",
							fontSize: "12px",
							fontWeight: 500,
							background: "var(--gray-3)",
							color: "var(--gray-11)",
							border: "none",
							borderRadius: "6px",
							cursor: "pointer",
							transition: "background 150ms, color 150ms",
							whiteSpace: "nowrap",
						}}
					>
						{copied ? (
							<>
								<svg
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2.5"
									strokeLinecap="round"
									strokeLinejoin="round"
									style={{ width: "12px", height: "12px" }}
								>
									<polyline points="20 6 9 17 4 12" />
								</svg>
								Nusxa olindi
							</>
						) : (
							<>
								<svg
									aria-hidden="true"
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									style={{ width: "12px", height: "12px" }}
								>
									<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
									<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
								</svg>
								Copy
							</>
						)}
					</button>

					{/* Download TXT */}
					<button
						type="button"
						onClick={() => handleDownload("txt")}
						title="Download as TXT"
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--blue-3)";
							e.currentTarget.style.color = "var(--blue-11)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--gray-3)";
							e.currentTarget.style.color = "var(--gray-11)";
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "4px",
							padding: "5px 10px",
							fontSize: "12px",
							fontWeight: 500,
							background: "var(--gray-3)",
							color: "var(--gray-11)",
							border: "none",
							borderRadius: "6px",
							cursor: "pointer",
							transition: "background 150ms, color 150ms",
							whiteSpace: "nowrap",
						}}
					>
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ width: "12px", height: "12px" }}
						>
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="7 10 12 15 17 10" />
							<line x1="12" y1="15" x2="12" y2="3" />
						</svg>
						TXT
					</button>

					{/* Download SRT */}
					<button
						type="button"
						onClick={() => handleDownload("srt")}
						title="Download as SRT"
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--blue-3)";
							e.currentTarget.style.color = "var(--blue-11)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--gray-3)";
							e.currentTarget.style.color = "var(--gray-11)";
						}}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "4px",
							padding: "5px 10px",
							fontSize: "12px",
							fontWeight: 500,
							background: "var(--gray-3)",
							color: "var(--gray-11)",
							border: "none",
							borderRadius: "6px",
							cursor: "pointer",
							transition: "background 150ms, color 150ms",
							whiteSpace: "nowrap",
						}}
					>
						<svg
							aria-hidden="true"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
							style={{ width: "12px", height: "12px" }}
						>
							<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
							<polyline points="7 10 12 15 17 10" />
							<line x1="12" y1="15" x2="12" y2="3" />
						</svg>
						SRT
					</button>
				</div>
			</div>
		);
	}

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
				<p className="text-sm font-medium text-gray-12">
					{t("noTranscript")}
				</p>
				<p className="text-xs text-gray-10">
					{t("transcriptProcessing")}
				</p>
			</div>
		);
	}

	// Shared per-cue card renderer
	function renderCue(cue: Cue, gi: number, ci: number, speaker: string | null) {
		const hue = speakerHue(speaker ?? "Transcript");
		const initials = speaker ? speakerInitials(speaker) : "";
		const avatarBg = `hsl(${hue},55%,55%)`;
		const active = cue.id === activeCueId;
		const showAvatarCol = hasAnySpeaker;

		return (
			<div
				key={`cue-${gi}-${ci}`}
				ref={active ? activeRef : undefined}
				className="group"
				onMouseEnter={(e) => {
					if (!active) e.currentTarget.style.background = "var(--gray-2)";
				}}
				onMouseLeave={(e) => {
					if (!active) e.currentTarget.style.background = "transparent";
				}}
				style={{
					display: "grid",
					gridTemplateColumns: showAvatarCol
						? "52px minmax(0,1fr) 38px"
						: "56px minmax(0,1fr) 28px",
					gap: "14px",
					alignItems: "start",
					padding: "8px 12px",
					marginBottom: "2px",
					borderRadius: "8px",
					background: active ? "var(--blue-3)" : "transparent",
					borderLeft: active
						? "3px solid var(--blue-9)"
						: "3px solid transparent",
					position: "relative",
					cursor: "default",
					transition: "background 160ms, border-color 160ms",
				}}
			>
				<div className="flex flex-col items-center gap-1 pt-0.5">
					{showAvatarCol && speaker ? (
						<div
							className="flex items-center justify-center text-[13px] font-bold text-white shrink-0"
							style={{
								width: "42px",
								height: "42px",
								borderRadius: "13px",
								backgroundColor: avatarBg,
								flexShrink: 0,
							}}
							title={speaker}
						>
							{initials}
						</div>
					) : null}
					<button
						type="button"
						onClick={() => onVideoJump?.(cue.startSeconds)}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--blue-3)";
							e.currentTarget.style.color = "var(--blue-11)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--gray-3)";
							e.currentTarget.style.color = "var(--gray-11)";
						}}
						style={{
							fontSize: "11px",
							fontWeight: 500,
							color: "var(--gray-11)",
							fontVariantNumeric: "tabular-nums",
							background: "var(--gray-3)",
							padding: "2px 8px",
							borderRadius: "999px",
							fontFamily:
								"ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
							border: "none",
							cursor: "pointer",
						}}
					>
						{cue.timestamp}
					</button>
				</div>

				<div className="min-w-0">
					{showAvatarCol && speaker ? (
						<p className="mb-1 text-xs font-semibold text-gray-11">
							{speaker}
						</p>
					) : null}
					<p
						className="min-w-0 break-words"
						style={{
							fontSize: "13.5px",
							lineHeight: 1.72,
							color: "var(--gray-12)",
							paddingTop: showAvatarCol && speaker ? 0 : "4px",
						}}
					>
						{trimmedQuery && cue.text.toLowerCase().includes(trimmedQuery.toLowerCase())
							? highlightMatch(cue.text, trimmedQuery)
							: renderMarkdownBold(cue.text)}
					</p>
				</div>

				<div className="flex items-start justify-end pt-1">
					<button
						type="button"
						onClick={() => onVideoJump?.(cue.startSeconds)}
						aria-label={t("jumpToTime", { time: cue.timestamp })}
						onMouseEnter={(e) => {
							e.currentTarget.style.background = "var(--blue-3)";
							e.currentTarget.style.color = "var(--blue-11)";
						}}
						onMouseLeave={(e) => {
							e.currentTarget.style.background = "var(--gray-3)";
							e.currentTarget.style.color = "var(--gray-11)";
						}}
						className="flex items-center justify-center rounded-full opacity-0 group-hover:opacity-100 transition-all duration-150"
						style={{
							width: "34px",
							height: "34px",
							background: "var(--gray-3)",
							color: "var(--gray-11)",
						}}
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
				{renderHeader()}
				{chapterSections.map((section, si) => {
					if (trimmedQuery && section.cues.every((c) => !filteredCueIds.has(c.id))) {
						return null;
					}
					return (
						<section
							key={`chapter-${section.startSec}`}
							className="flex flex-col gap-0.5"
						>
							{/* Chapter header — mirrors RefinedTranscriptPanel style */}
							<div className="mb-2 flex items-center gap-2">
								<button
									type="button"
									onClick={() => onVideoJump?.(section.startSec)}
									className="rounded-md px-2 py-0.5 font-mono text-xs font-medium transition-colors"
									style={{
										background: "var(--blue-3)",
										color: "var(--blue-11)",
									}}
								>
									{formatTimeMinutes(section.startSec)}
								</button>
								<h3 className="flex-1 text-base font-bold text-gray-12">
									{section.title}
								</h3>
							</div>

							{section.cues.length === 0 ? (
								<p className="text-xs text-gray-10 px-2 pb-2">
									{t("noSpeechInChapter")}
								</p>
							) : (
								section.cues
									.filter((cue) => filteredCueIds.has(cue.id))
									.map((cue, ci) => renderCue(cue, si, ci, cue.speaker))
							)}
						</section>
					);
				})}
			</div>
		);
	}

	// Fallback: existing speaker-grouped flat list
	return (
		<div ref={containerRef} className="flex flex-col gap-1 p-4">
			{renderHeader()}
			{groups.map((group, gi) => {
				if (trimmedQuery && group.cues.every((c) => !filteredCueIds.has(c.id))) {
					return null;
				}
				return (
					<div key={`${group.speaker}-${gi}`} className="flex flex-col gap-0.5">
						{group.cues
							.filter((cue) => filteredCueIds.has(cue.id))
							.map((cue, ci) => renderCue(cue, gi, ci, group.speaker))}
					</div>
				);
			})}
		</div>
	);
}
