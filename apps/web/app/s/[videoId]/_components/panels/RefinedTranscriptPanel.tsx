"use client";

import { useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { useState } from "react";
import { formatTimeMinutes } from "../utils/transcript-utils";
import { renderMarkdownBold } from "./markdownBold";

interface RefinedTranscriptPanelProps {
	refinedTranscript?: {
		chapters: {
			startSec: number;
			title: string;
			paragraphs: string[];
		}[];
	};
	onVideoJump?: (seconds: number) => void;
	duration?: number | null;
}

export function RefinedTranscriptPanel({
	refinedTranscript,
	onVideoJump,
	duration,
}: RefinedTranscriptPanelProps) {
	const t = useTranslations("share");
	const [openChapters, setOpenChapters] = useState<Set<number>>(new Set());

	function toggleChapter(startSec: number) {
		setOpenChapters((prev) => {
			const next = new Set(prev);
			if (next.has(startSec)) {
				next.delete(startSec);
			} else {
				next.add(startSec);
			}
			return next;
		});
	}

	if (!refinedTranscript || refinedTranscript.chapters.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-4 bg-gray-2 px-4 py-10 text-center">
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
					<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
					<polyline points="14 2 14 8 20 8" />
					<line x1="16" y1="13" x2="8" y2="13" />
					<line x1="16" y1="17" x2="8" y2="17" />
					<polyline points="10 9 9 9 8 9" />
				</svg>
				<p className="text-sm font-medium text-gray-12">
					{t("noRefinedTranscript")}
				</p>
				<p className="text-xs text-gray-10">{t("refinedTranscriptDesc")}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{refinedTranscript.chapters.map((chapter) => {
				const startSec = formatPanelStartSec(chapter.startSec, duration);
				const isOpen = openChapters.has(chapter.startSec);
				return (
					<section
						key={chapter.startSec}
						className="refined-section rounded-xl border border-gray-4 bg-gray-1 p-4 shadow-sm"
					>
						<div className="mb-3 flex items-center gap-2">
							<button
								type="button"
								onClick={() => onVideoJump?.(startSec)}
								className="rounded-md px-2 py-0.5 font-mono text-xs font-medium transition-colors"
								style={{
									background: "var(--blue-3)",
									color: "var(--blue-11)",
								}}
							>
								{formatTimeMinutes(startSec)}
							</button>
							<button
								type="button"
								onClick={() => toggleChapter(chapter.startSec)}
								aria-expanded={isOpen}
								className="flex flex-1 items-center gap-1.5 text-left text-base font-bold text-gray-12"
								style={{
									background: "transparent",
									border: "none",
									cursor: "pointer",
									padding: 0,
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
									style={{
										width: "14px",
										height: "14px",
										flexShrink: 0,
										transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
										transition: "transform 150ms",
									}}
								>
									<polyline points="6 9 12 15 18 9" />
								</svg>
								{chapter.title}
							</button>
							<button
								type="button"
								onClick={() => onVideoJump?.(startSec)}
								aria-label={t("playFromChapter", { title: chapter.title })}
								className="flex size-7 shrink-0 items-center justify-center rounded-lg transition-colors"
								style={{
									background: "var(--blue-3)",
									color: "var(--blue-11)",
								}}
							>
								<Play className="size-3.5 fill-current" />
							</button>
						</div>
						{isOpen && (
							<div className="flex flex-col gap-2">
								{chapter.paragraphs.map((paragraph, pi) => (
									<p
										key={`${chapter.startSec}-p-${pi}`}
										className="text-sm leading-relaxed text-gray-12"
									>
										{renderMarkdownBold(paragraph)}
									</p>
								))}
							</div>
						)}
					</section>
				);
			})}
		</div>
	);
}

function formatPanelStartSec(
	startSec: number,
	duration?: number | null,
): number {
	if (!duration || duration <= 0) return startSec;
	if (startSec <= duration) return startSec;
	if (startSec / 60 <= duration) return Math.round(startSec / 60);
	return duration;
}
