"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

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

function buildCopyText(aiSummary: {
	overview?: string;
	topics?: { title: string; body: string }[];
	nextSteps?: string[];
}): string {
	const parts: string[] = [];
	if (aiSummary.overview) {
		parts.push(aiSummary.overview);
	}
	const topics = aiSummary.topics ?? [];
	if (topics.length > 0) {
		parts.push("Topics:");
		for (const topic of topics) {
			parts.push(`- ${topic.title}: ${topic.body}`);
		}
	}
	const nextSteps = aiSummary.nextSteps ?? [];
	if (nextSteps.length > 0) {
		parts.push("Next steps:");
		for (const step of nextSteps) {
			parts.push(`- ${step}`);
		}
	}
	return parts.join("\n");
}

export function SummaryPanel({ data, onVideoJump }: SummaryPanelProps) {
	const t = useTranslations("share");
	const [copied, setCopied] = useState(false);
	const { aiSummary } = data;
	const topics = aiSummary?.topics ?? [];
	const nextSteps = aiSummary?.nextSteps ?? [];

	if (!aiSummary) {
		return (
			<div className="rounded-xl border border-gray-4 bg-gray-2 px-4 py-6 text-center">
				<p className="text-sm text-gray-10">{t("noAiSummary")}</p>
			</div>
		);
	}

	function handleCopy() {
		const text = buildCopyText(aiSummary!);
		navigator.clipboard.writeText(text).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	}

	return (
		<div className="flex flex-col gap-5">
			{/* Header row: copy button */}
			<div style={{ display: "flex", justifyContent: "flex-end" }}>
				<button
					onClick={handleCopy}
					style={{
						display: "inline-flex",
						alignItems: "center",
						gap: "5px",
						padding: "4px 10px",
						fontSize: "12px",
						fontWeight: 500,
						color: copied ? "var(--blue-11)" : "var(--gray-11)",
						background: "transparent",
						border: `1px solid ${copied ? "var(--blue-6)" : "var(--gray-5)"}`,
						borderRadius: "7px",
						cursor: "pointer",
						transition: "color 150ms, border-color 150ms",
					}}
				>
					{copied ? "Nusxa olindi" : "Nusxa olish"}
				</button>
			</div>
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
			{topics.length === 0 && nextSteps.length === 0 && !aiSummary.overview && (
				<p className="text-sm text-gray-10">{t("noContentYet")}</p>
			)}
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
