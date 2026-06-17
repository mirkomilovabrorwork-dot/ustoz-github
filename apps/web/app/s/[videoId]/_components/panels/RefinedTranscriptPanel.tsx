"use client";

import { Play } from "lucide-react";
import { formatTimeMinutes } from "../utils/transcript-utils";

interface RefinedTranscriptPanelProps {
	refinedTranscript?: {
		chapters: {
			startSec: number;
			title: string;
			paragraphs: string[];
		}[];
	};
	onVideoJump?: (seconds: number) => void;
}

export function RefinedTranscriptPanel({
	refinedTranscript,
	onVideoJump,
}: RefinedTranscriptPanelProps) {
	if (!refinedTranscript || refinedTranscript.chapters.length === 0) {
		return (
			<div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-8 text-center">
				<p className="text-sm text-gray-500">
					Refined transcript not available yet
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-4">
			{refinedTranscript.chapters.map((chapter) => (
				<section
					key={chapter.startSec}
					className="refined-section rounded-xl border border-gray-200 bg-white/80 p-4 shadow-sm backdrop-blur-sm"
				>
					<div className="mb-3 flex items-center gap-2">
						<button
							type="button"
							onClick={() => onVideoJump?.(chapter.startSec)}
							className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
						>
							{formatTimeMinutes(chapter.startSec)}
						</button>
						<h3 className="flex-1 text-sm font-semibold text-gray-900">
							{chapter.title}
						</h3>
						<button
							type="button"
							onClick={() => onVideoJump?.(chapter.startSec)}
							aria-label={`Play from ${chapter.title}`}
							className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100"
						>
							<Play className="size-3.5 fill-current" />
						</button>
					</div>
					<div className="flex flex-col gap-2">
						{chapter.paragraphs.map((paragraph) => (
							<p
								key={paragraph}
								className="text-sm leading-relaxed text-gray-700"
							>
								{paragraph}
							</p>
						))}
					</div>
				</section>
			))}
		</div>
	);
}
