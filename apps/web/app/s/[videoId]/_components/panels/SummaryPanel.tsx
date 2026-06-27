"use client";

import { formatTimeMinutes, clampStartSec } from "../utils/transcript-utils";

interface SummaryPanelProps {
	data: {
		duration?: number;
		aiSummary?: {
			overview?: string;
			topics?: { title: string; body: string }[];
			nextSteps?: string[];
			chapters?: { startSec: number; title: string; body: string }[];
		};
		speakerCount?: number;
	};
	onVideoJump?: (seconds: number) => void;
}

export function SummaryPanel({ data, onVideoJump }: SummaryPanelProps) {
	const { aiSummary } = data;
	const topics = aiSummary?.topics ?? [];
	const nextSteps = aiSummary?.nextSteps ?? [];
	const chapters = (aiSummary?.chapters ?? []).map((c) => ({
		...c,
		startSec: clampStartSec(c.startSec, data.duration),
	}));

	if (!aiSummary) {
		return (
			<div className="rounded-xl border border-gray-4 bg-gray-2 px-4 py-6 text-center">
				<p className="text-sm text-gray-10">No AI summary available.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			{/* Overview — lead card */}
			{aiSummary.overview && (
				<div
					style={{
						background: "linear-gradient(135deg, var(--blue-3), var(--gray-2))",
						border: "1px solid var(--blue-6)",
						borderRadius: "11px",
						padding: "16px 18px",
					}}
				>
					<p className="text-sm leading-relaxed" style={{ color: "var(--gray-12)" }}>
						{aiSummary.overview}
					</p>
				</div>
			)}

			{/* Chapters */}
			{chapters.length > 0 && (
				<div>
					<h3
						className="mb-2"
						style={{ fontSize: "14px", fontWeight: 700, color: "var(--gray-12)", letterSpacing: "-.01em" }}
					>
						Chapters
					</h3>
					<div className="flex flex-col gap-2">
						{chapters.map((chapter) => (
							<div
								key={chapter.startSec}
								style={{
									display: "grid",
									gridTemplateColumns: "64px 1fr",
									gap: "14px",
									padding: "0 0 18px 0",
									position: "relative",
								}}
							>
								<button
									type="button"
									onClick={() => onVideoJump?.(chapter.startSec)}
									style={{
										fontSize: "12px",
										fontWeight: 700,
										color: "var(--blue-11)",
										background: "var(--blue-3)",
										border: "1px solid var(--blue-6)",
										borderRadius: "999px",
										padding: "4px 0",
										textAlign: "center",
										cursor: "pointer",
										transition: "background 320ms, color 320ms, transform 320ms",
										fontVariantNumeric: "tabular-nums",
									}}
								>
									{formatTimeMinutes(chapter.startSec)}
								</button>
								<div className="min-w-0">
									<p style={{ fontSize: "13.5px", fontWeight: 650, color: "var(--gray-12)", marginBottom: "3px" }}>
										{chapter.title}
									</p>
									{chapter.body && (
										<p style={{ fontSize: "12.5px", lineHeight: 1.6, color: "var(--gray-11)" }}>
											{chapter.body}
										</p>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Topics */}
			{topics.length > 0 && (
				<div>
					<h3
						className="mb-2"
						style={{ fontSize: "14px", fontWeight: 700, color: "var(--gray-12)", letterSpacing: "-.01em" }}
					>
						Topics
					</h3>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{topics.map((topic) => (
							<div
								key={topic.title}
								style={{
									background: "var(--gray-1)",
									border: "1px solid var(--gray-4)",
									borderRadius: "11px",
									padding: "13px 14px",
									transition: "transform 320ms, box-shadow 320ms, border-color 320ms",
								}}
							>
								<p
									className="mb-1"
									style={{ fontSize: "13px", fontWeight: 650, color: "var(--gray-12)" }}
								>
									{topic.title}
								</p>
								<p style={{ fontSize: "12.5px", lineHeight: 1.55, color: "var(--gray-11)" }}>
									{topic.body}
								</p>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Next Steps */}
			{nextSteps.length > 0 && (
				<div>
					<h3
						className="mb-2"
						style={{ fontSize: "14px", fontWeight: 700, color: "var(--gray-12)", letterSpacing: "-.01em" }}
					>
						Next Steps
					</h3>
					<ol className="flex flex-col gap-2">
						{nextSteps.map((step, i) => (
							<li
								key={i}
								style={{
									display: "flex",
									gap: "12px",
									alignItems: "flex-start",
									background: "var(--gray-1)",
									border: "1px solid var(--gray-4)",
									borderLeft: "3px solid #2563eb",
									borderRadius: "10px",
									padding: "12px 14px",
									transition: "transform 320ms, box-shadow 320ms",
								}}
							>
								<span
									style={{
										flexShrink: 0,
										fontSize: "12px",
										fontWeight: 750,
										color: "var(--blue-11)",
										fontVariantNumeric: "tabular-nums",
										minWidth: "18px",
									}}
								>
									{i + 1}
								</span>
								<span style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--gray-12)" }}>{step}</span>
							</li>
						))}
					</ol>
				</div>
			)}

			{/* Empty state when all sections are empty */}
			{topics.length === 0 && nextSteps.length === 0 && chapters.length === 0 && !aiSummary.overview && (
				<p className="text-sm text-gray-10">No content available yet.</p>
			)}
		</div>
	);
}
