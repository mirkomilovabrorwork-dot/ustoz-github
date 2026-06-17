"use client";

import { useQuery } from "@tanstack/react-query";
import { getMonthlySpend } from "@/actions/billing/get-monthly-spend";

interface MeetingCostPanelProps {
	videoId: string;
}

function formatUsd(cents: number): string {
	return `$${(cents / 100).toFixed(4)}`;
}

const OPERATIONS: { key: string; label: string }[] = [
	{ key: "transcription", label: "Transcription" },
	{ key: "summary", label: "Summary" },
	{ key: "embedding", label: "Embeddings" },
	{ key: "chat", label: "Chat" },
];

export function MeetingCostPanel({ videoId }: MeetingCostPanelProps) {
	const { data, isLoading, error } = useQuery({
		queryKey: ["cost", videoId],
		queryFn: () => getMonthlySpend({ type: "video", id: videoId }),
		staleTime: 60_000,
	});

	if (isLoading) {
		return null;
	}

	if (error || !data) {
		return (
			<div className="rounded-xl border border-red-100 bg-red-50 px-4 py-6 text-center">
				<p className="text-sm text-red-600">Could not load cost data.</p>
			</div>
		);
	}

	const hasActivity = data.totalUsdCents > 0;

	if (!hasActivity) {
		return null;
	}

	return (
		<div className="flex flex-col gap-4">
			<div className="flex flex-col items-center gap-1 rounded-xl border border-gray-200 bg-white/80 px-6 py-5 text-center shadow-sm backdrop-blur-sm">
				<span className="text-xs font-medium text-gray-500">
					Bu uchrashuv uchun
				</span>
				<span className="text-3xl font-bold text-gray-900">
					{formatUsd(data.totalUsdCents)}
				</span>
			</div>

			<div className="grid grid-cols-4 gap-3">
				{OPERATIONS.map(({ key, label }) => {
					const cents = data.breakdown[key] ?? 0;
					return (
						<div
							key={key}
							className="flex flex-col gap-1 rounded-xl border border-gray-200 bg-white/80 px-3 py-3 shadow-sm backdrop-blur-sm"
						>
							<span className="text-xs font-medium text-gray-500">{label}</span>
							<span className="text-sm font-semibold text-gray-900">
								{formatUsd(cents)}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
