"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
	const t = useTranslations("share");
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
				<p className="text-sm text-gray-10">{t("noAiSummary")}</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-5">
			{/* Overview — lead paragraph, no card */}
			{aiSummary.overview && (
				<p
					style={{
						fontSize: "15px",
						lineHeight: 1.65,
						color: "var(--gray-12)",
						maxWidth: "70ch",
					}}
				>
					{aiSummary.overview}
				</p>
			)}

			{/* Chapters */}
			{chapters.length > 0 && (
				<div>
					<h3
						className="mb-2"
						style={{ fontSize: "14px", fontWeight: 700, color: "var(--gray-12)", letterSpacing: "-.01em" }}
					>
						{t("chaptersHeading")}
					</h3>
					<div>
						{chapters.map((chapter, idx) => {
							const isLast = idx === chapters.length - 1;
							return (
								<ChapterRow
									key={chapter.startSec}
									chapter={chapter}
									isLast={isLast}
									onVideoJump={onVideoJump}
								/>
							);
						})}
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
						{t("topicsHeading")}
					</h3>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{topics.map((topic) => (
							<TopicCard key={topic.title} topic={topic} />
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
						{t("nextStepsHeading")}
					</h3>
					<ol
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "10px",
							listStyle: "none",
							padding: 0,
							margin: 0,
						}}
					>
						{nextSteps.map((step, i) => (
							<li
								key={i}
								style={{
									display: "flex",
									gap: "12px",
									alignItems: "flex-start",
								}}
							>
								<span
									style={{
										flexShrink: 0,
										fontSize: "13px",
										fontWeight: 700,
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
				<p className="text-sm text-gray-10">{t("noContentYet")}</p>
			)}
		</div>
	);
}

function ChapterRow({
	chapter,
	isLast,
	onVideoJump,
}: {
	chapter: { startSec: number; title: string; body: string };
	isLast: boolean;
	onVideoJump?: (seconds: number) => void;
}) {
	const [hovered, setHovered] = useState(false);
	return (
		<div
			style={{
				display: "grid",
				gridTemplateColumns: "64px 1fr",
				gap: "14px",
				paddingBottom: isLast ? 0 : "14px",
				borderBottom: isLast ? "none" : "1px solid var(--gray-3)",
				marginBottom: isLast ? 0 : "14px",
			}}
		>
			<button
				type="button"
				onClick={() => onVideoJump?.(chapter.startSec)}
				onMouseEnter={() => setHovered(true)}
				onMouseLeave={() => setHovered(false)}
				style={{
					fontSize: "11px",
					fontWeight: 600,
					color: hovered ? "var(--blue-11)" : "var(--gray-11)",
					background: hovered ? "var(--blue-3)" : "var(--gray-3)",
					border: "none",
					borderRadius: "999px",
					padding: "4px 0",
					textAlign: "center",
					cursor: "pointer",
					transition: "background 200ms, color 200ms",
				}}
			>
				{formatTimeMinutes(chapter.startSec)}
			</button>
			<div className="min-w-0">
				<p style={{ fontSize: "15px", fontWeight: 600, color: "var(--gray-12)", marginBottom: "3px" }}>
					{chapter.title}
				</p>
				{chapter.body && (
					<p style={{ fontSize: "13px", lineHeight: 1.6, color: "var(--gray-11)" }}>
						{chapter.body}
					</p>
				)}
			</div>
		</div>
	);
}

function TopicCard({ topic }: { topic: { title: string; body: string } }) {
	const [hovered, setHovered] = useState(false);
	return (
		<div
			onMouseEnter={() => setHovered(true)}
			onMouseLeave={() => setHovered(false)}
			style={{
				background: "transparent",
				border: `1px solid ${hovered ? "var(--gray-6)" : "var(--gray-4)"}`,
				borderRadius: "11px",
				padding: "13px 14px",
				transition: "border-color 200ms",
			}}
		>
			<p
				className="mb-1"
				style={{ fontSize: "13px", fontWeight: 600, color: "var(--gray-12)" }}
			>
				{topic.title}
			</p>
			<p style={{ fontSize: "12.5px", lineHeight: 1.55, color: "var(--gray-11)" }}>
				{topic.body}
			</p>
		</div>
	);
}
