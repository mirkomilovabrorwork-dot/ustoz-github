"use client";

import { useEffect, useState } from "react";
import { formatTimeMinutes } from "../utils/transcript-utils";

type SummaryMode = "cards" | "timeline" | "document";

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

function formatDuration(seconds: number): string {
	const m = Math.floor(seconds / 60);
	const s = Math.floor(seconds % 60);
	return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function getSummaryMode(): SummaryMode {
	const val = document.documentElement.dataset.summary;
	if (val === "timeline" || val === "document") return val;
	return "cards";
}

export function SummaryPanel({ data, onVideoJump }: SummaryPanelProps) {
	const [mode, setMode] = useState<SummaryMode>("cards");

	useEffect(() => {
		setMode(getSummaryMode());

		const observer = new MutationObserver(() => {
			setMode(getSummaryMode());
		});

		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-summary"],
		});

		return () => observer.disconnect();
	}, []);

	const { duration, aiSummary, speakerCount } = data;
	const topics = aiSummary?.topics ?? [];
	const nextSteps = aiSummary?.nextSteps ?? [];
	const chapters = aiSummary?.chapters ?? [];

	return (
		<div className="flex flex-col gap-4">
			<div className="grid grid-cols-4 gap-3">
				<StatCard
					label="Duration"
					value={duration != null ? formatDuration(duration) : "—"}
				/>
				<StatCard
					label="Speakers"
					value={speakerCount != null ? String(speakerCount) : "—"}
				/>
				<StatCard
					label="Topics"
					value={topics.length > 0 ? String(topics.length) : "—"}
				/>
				<StatCard
					label="Action items"
					value={nextSteps.length > 0 ? String(nextSteps.length) : "—"}
				/>
			</div>

			{aiSummary?.overview && (
				<div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
					<p className="text-sm leading-relaxed text-blue-900">
						{aiSummary.overview}
					</p>
				</div>
			)}

			{!aiSummary && (
				<div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-center">
					<p className="text-sm text-gray-500">No AI summary available.</p>
				</div>
			)}

			{aiSummary && mode === "cards" && (
				<CardsView topics={topics} nextSteps={nextSteps} />
			)}

			{aiSummary && mode === "timeline" && (
				<TimelineView chapters={chapters} onVideoJump={onVideoJump} />
			)}

			{aiSummary && mode === "document" && (
				<DocumentView topics={topics} nextSteps={nextSteps} />
			)}
		</div>
	);
}

function StatCard({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white px-3 py-3">
			<span className="text-xs font-medium text-gray-500">{label}</span>
			<span className="text-lg font-semibold text-gray-900">{value}</span>
		</div>
	);
}

function CardsView({
	topics,
	nextSteps,
}: {
	topics: { title: string; body: string }[];
	nextSteps: string[];
}) {
	return (
		<div className="flex flex-col gap-4">
			{topics.length > 0 && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-gray-700">Topics</h3>
					<div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
						{topics.map((topic) => (
							<div
								key={topic.title}
								className="rounded-xl border border-gray-200 bg-white p-3"
							>
								<p className="mb-1 text-sm font-medium text-gray-900">
									{topic.title}
								</p>
								<p className="text-xs leading-relaxed text-gray-600">
									{topic.body}
								</p>
							</div>
						))}
					</div>
				</div>
			)}

			{nextSteps.length > 0 && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-gray-700">
						Next Steps
					</h3>
					<ol className="flex flex-col gap-2">
						{nextSteps.map((step, i) => (
							<li key={step} className="flex items-start gap-2">
								<span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-semibold text-blue-700">
									{i + 1}
								</span>
								<span className="text-sm text-gray-800">{step}</span>
							</li>
						))}
					</ol>
				</div>
			)}

			{topics.length === 0 && nextSteps.length === 0 && (
				<p className="text-sm text-gray-500">No topics or next steps yet.</p>
			)}
		</div>
	);
}

function TimelineView({
	chapters,
	onVideoJump,
}: {
	chapters: { startSec: number; title: string; body: string }[];
	onVideoJump?: (seconds: number) => void;
}) {
	if (chapters.length === 0) {
		return <p className="text-sm text-gray-500">No chapters available.</p>;
	}

	return (
		<div className="flex flex-col gap-3">
			{chapters.map((chapter) => (
				<div
					key={chapter.startSec}
					className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3"
				>
					<button
						type="button"
						onClick={() => onVideoJump?.(chapter.startSec)}
						className="mt-0.5 shrink-0 rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono font-medium text-gray-700 transition-colors hover:bg-blue-100 hover:text-blue-700"
					>
						{formatTimeMinutes(chapter.startSec)}
					</button>
					<div className="min-w-0">
						<p className="text-sm font-medium text-gray-900">{chapter.title}</p>
						<p className="mt-0.5 text-xs leading-relaxed text-gray-600">
							{chapter.body}
						</p>
					</div>
				</div>
			))}
		</div>
	);
}

function DocumentView({
	topics,
	nextSteps,
}: {
	topics: { title: string; body: string }[];
	nextSteps: string[];
}) {
	return (
		<div className="flex flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4">
			{topics.length > 0 && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-gray-800">Topics</h3>
					<ul className="flex flex-col gap-1.5">
						{topics.map((topic) => (
							<li key={topic.title} className="flex items-start gap-2">
								<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gray-400" />
								<span className="text-sm text-gray-800">
									<span className="font-medium">{topic.title}</span>
									{topic.body ? ` — ${topic.body}` : ""}
								</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{nextSteps.length > 0 && (
				<div>
					<h3 className="mb-2 text-sm font-semibold text-gray-800">
						Next Steps
					</h3>
					<ul className="flex flex-col gap-1.5">
						{nextSteps.map((step) => (
							<li key={step} className="flex items-start gap-2">
								<span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-gray-400" />
								<span className="text-sm text-gray-800">{step}</span>
							</li>
						))}
					</ul>
				</div>
			)}

			{topics.length === 0 && nextSteps.length === 0 && (
				<p className="text-sm text-gray-500">No content available.</p>
			)}
		</div>
	);
}
