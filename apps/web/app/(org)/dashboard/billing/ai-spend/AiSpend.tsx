"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
	type GetOrgAiSpendResult,
	getOrgAiSpend,
} from "@/actions/billing/get-org-ai-spend";

type DateRange = "this_month" | "last_month" | "last_90_days";
type Operation = "all" | "transcription" | "summary" | "embedding" | "chat";

const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
	{ value: "this_month", label: "This month" },
	{ value: "last_month", label: "Last month" },
	{ value: "last_90_days", label: "Last 90 days" },
];

const OPERATION_OPTIONS: { value: Operation; label: string }[] = [
	{ value: "all", label: "All operations" },
	{ value: "transcription", label: "Transcription" },
	{ value: "summary", label: "Summary" },
	{ value: "embedding", label: "Embedding" },
	{ value: "chat", label: "Chat" },
];

const OPERATION_COLORS: Record<string, string> = {
	transcription: "#3b82f6",
	summary: "#22c55e",
	embedding: "#9ca3af",
	chat: "#a855f7",
};

function formatCents(cents: number): string {
	return `$${(cents / 100).toFixed(2)}`;
}

function trendPercent(current: number, previous: number): number | null {
	if (previous === 0) return null;
	return Math.round(((current - previous) / previous) * 100);
}

interface StatCardProps {
	label: string;
	value: string;
	sub?: string;
	subPositive?: boolean;
}

function StatCard({ label, value, sub, subPositive }: StatCardProps) {
	return (
		<div className="flex flex-col gap-1 px-6 py-5 rounded-xl border bg-gray-2 border-gray-4">
			<p className="text-sm text-gray-10">{label}</p>
			<p className="text-2xl font-medium text-gray-12">{value}</p>
			{sub !== undefined && (
				<p
					className={
						subPositive === undefined
							? "text-xs text-gray-10"
							: subPositive
								? "text-xs text-green-600"
								: "text-xs text-red-500"
					}
				>
					{sub}
				</p>
			)}
		</div>
	);
}

function SpendBarChart({
	data,
}: {
	data: GetOrgAiSpendResult["thisMonth"]["dailySpend"];
}) {
	if (data.length === 0) {
		return (
			<div className="flex h-48 w-full items-center justify-center rounded-xl border border-dashed border-gray-5 text-sm text-gray-9">
				No spend data for this period.
			</div>
		);
	}

	const byDate: Record<string, Record<string, number>> = {};
	for (const row of data) {
		if (!byDate[row.date]) byDate[row.date] = {};
		const dayBucket = byDate[row.date];
		if (dayBucket) {
			dayBucket[row.operation] =
				(dayBucket[row.operation] ?? 0) + row.costUsdCents;
		}
	}

	const dates = Object.keys(byDate).sort();
	const maxDay = Math.max(
		...dates.map((d) =>
			Object.values(byDate[d] ?? {}).reduce((a, b) => a + b, 0),
		),
		1,
	);
	const operations = Array.from(new Set(data.map((r) => r.operation)));

	return (
		<div className="rounded-xl border border-gray-4 bg-gray-2 p-5">
			<div className="flex gap-3 mb-4 flex-wrap">
				{operations.map((op) => (
					<div key={op} className="flex items-center gap-1.5">
						<span
							className="inline-block size-3 rounded-sm"
							style={{ backgroundColor: OPERATION_COLORS[op] ?? "#6b7280" }}
						/>
						<span className="text-xs text-gray-10 capitalize">{op}</span>
					</div>
				))}
			</div>
			<div className="flex items-end gap-px h-40 overflow-x-auto">
				{dates.map((date) => {
					const dayData = byDate[date] ?? {};
					const dayTotal = Object.values(dayData).reduce((a, b) => a + b, 0);
					const barH = Math.round((dayTotal / maxDay) * 100);
					return (
						<div
							key={date}
							className="group relative flex flex-col justify-end flex-1 min-w-[6px] h-full"
							title={`${date}: ${formatCents(dayTotal)}`}
						>
							<div
								className="w-full rounded-sm overflow-hidden"
								style={{ height: `${barH}%` }}
							>
								{operations.map((op) => {
									const opCents = dayData[op] ?? 0;
									if (opCents === 0) return null;
									const opH = Math.round((opCents / dayTotal) * 100);
									return (
										<div
											key={op}
											style={{
												height: `${opH}%`,
												backgroundColor: OPERATION_COLORS[op] ?? "#6b7280",
											}}
										/>
									);
								})}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface AiSpendProps {
	orgId: string;
	initialData: GetOrgAiSpendResult;
}

export function AiSpend({ orgId, initialData }: AiSpendProps) {
	const [dateRange, setDateRange] = useState<DateRange>("this_month");
	const [operation, setOperation] = useState<Operation>("all");
	const [page, setPage] = useState(1);
	const limit = 50;

	const query = useQuery({
		queryKey: ["ai-spend", orgId, dateRange, operation, page],
		queryFn: () =>
			getOrgAiSpend(
				orgId,
				page,
				limit,
				dateRange,
				operation === "all" ? undefined : operation,
			),
		initialData:
			page === 1 && dateRange === "this_month" && operation === "all"
				? initialData
				: undefined,
		staleTime: 60 * 1000,
	});

	const data = query.data ?? initialData;
	const trend = trendPercent(
		data.thisMonth.totalUsdCents,
		data.lastMonth.totalUsdCents,
	);

	const totalPages = Math.ceil(data.total / limit);

	const handleExport = async () => {
		const params = new URLSearchParams({
			orgId,
			dateRange,
			...(operation !== "all" ? { operation } : {}),
		});
		window.location.href = `/api/billing/export-ai-spend-csv?${params}`;
	};

	if (
		data.thisMonth.totalUsdCents === 0 &&
		data.total === 0 &&
		!query.isFetching
	) {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center">
				<p className="text-lg font-medium text-gray-12">
					No AI activity in this organization yet.
				</p>
				<p className="mt-1 text-sm text-gray-10">
					Start a recording to see usage here.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-6">
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold text-gray-12">AI Spend</h1>
				<button
					type="button"
					onClick={handleExport}
					className="flex items-center gap-1.5 rounded-lg border border-gray-4 bg-gray-2 px-3 py-1.5 text-sm text-gray-11 hover:bg-gray-3 transition-colors"
				>
					<Download className="size-4" />
					Export CSV
				</button>
			</div>

			<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
				<StatCard
					label="This month"
					value={formatCents(data.thisMonth.totalUsdCents)}
				/>
				<StatCard
					label="Last month"
					value={formatCents(data.lastMonth.totalUsdCents)}
				/>
				<StatCard
					label="30-day trend"
					value={trend === null ? "—" : `${trend > 0 ? "+" : ""}${trend}%`}
					sub={
						trend === null
							? "No previous data"
							: trend > 0
								? "Higher than last month"
								: trend < 0
									? "Lower than last month"
									: "Same as last month"
					}
					subPositive={trend === null ? undefined : trend <= 0}
				/>
			</div>

			<SpendBarChart
				data={
					dateRange === "this_month"
						? data.thisMonth.dailySpend
						: data.lastMonth.dailySpend
				}
			/>

			<div className="flex flex-wrap gap-3 items-center">
				<div className="flex rounded-lg border border-gray-4 overflow-hidden">
					{DATE_RANGE_OPTIONS.map((opt) => (
						<button
							key={opt.value}
							type="button"
							onClick={() => {
								setDateRange(opt.value);
								setPage(1);
							}}
							className={`px-3 py-1.5 text-sm transition-colors ${
								dateRange === opt.value
									? "bg-gray-3 text-gray-12"
									: "bg-gray-2 text-gray-10 hover:bg-gray-3"
							}`}
						>
							{opt.label}
						</button>
					))}
				</div>
				<select
					value={operation}
					onChange={(e) => {
						setOperation(e.target.value as Operation);
						setPage(1);
					}}
					className="rounded-lg border border-gray-4 bg-gray-2 px-3 py-1.5 text-sm text-gray-12 outline-none"
				>
					{OPERATION_OPTIONS.map((opt) => (
						<option key={opt.value} value={opt.value}>
							{opt.label}
						</option>
					))}
				</select>
			</div>

			<div className="rounded-xl border border-gray-4 overflow-hidden">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-gray-4 bg-gray-2">
							<th className="px-4 py-3 text-left font-medium text-gray-11">
								Date
							</th>
							<th className="px-4 py-3 text-left font-medium text-gray-11">
								User
							</th>
							<th className="px-4 py-3 text-left font-medium text-gray-11">
								Meeting
							</th>
							<th className="px-4 py-3 text-left font-medium text-gray-11">
								Operation
							</th>
							<th className="px-4 py-3 text-left font-medium text-gray-11">
								Model
							</th>
							<th className="px-4 py-3 text-right font-medium text-gray-11">
								Input tokens
							</th>
							<th className="px-4 py-3 text-right font-medium text-gray-11">
								Output tokens
							</th>
							<th className="px-4 py-3 text-right font-medium text-gray-11">
								Cost
							</th>
						</tr>
					</thead>
					<tbody>
						{query.isLoading
							? (["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7"] as const).map(
									(rowKey) => (
										<tr
											key={rowKey}
											className="border-b border-gray-4 last:border-0"
										>
											{(
												[
													"date",
													"user",
													"meeting",
													"op",
													"model",
													"in",
													"out",
													"cost",
												] as const
											).map((col) => (
												<td key={col} className="px-4 py-3">
													<div className="h-4 w-full rounded bg-gray-4 animate-pulse" />
												</td>
											))}
										</tr>
									),
								)
							: data.events.map((event) => (
									<tr
										key={event.id}
										className="border-b border-gray-4 last:border-0 hover:bg-gray-2/50"
									>
										<td className="px-4 py-3 text-gray-11 whitespace-nowrap">
											{new Date(event.createdAt).toLocaleDateString()}
										</td>
										<td className="px-4 py-3 text-gray-12">
											{event.userName ?? event.userId.slice(0, 8)}
										</td>
										<td className="px-4 py-3">
											{event.videoId ? (
												<Link
													href={`/cap/${event.videoId}`}
													className="text-blue-500 hover:underline truncate max-w-[140px] inline-block"
													title={event.videoName ?? event.videoId}
												>
													{event.videoName ?? event.videoId.slice(0, 8)}
												</Link>
											) : (
												<span className="text-gray-9">—</span>
											)}
										</td>
										<td className="px-4 py-3">
											<span className="inline-flex items-center gap-1.5 capitalize">
												<span
													className="inline-block size-2 rounded-full"
													style={{
														backgroundColor:
															OPERATION_COLORS[event.operation] ?? "#6b7280",
													}}
												/>
												{event.operation}
											</span>
										</td>
										<td className="px-4 py-3 text-gray-11 font-mono text-xs">
											{event.model}
										</td>
										<td className="px-4 py-3 text-right text-gray-11 tabular-nums">
											{event.inputTokens.toLocaleString()}
										</td>
										<td className="px-4 py-3 text-right text-gray-11 tabular-nums">
											{event.outputTokens.toLocaleString()}
										</td>
										<td className="px-4 py-3 text-right text-gray-12 tabular-nums font-medium">
											{formatCents(event.costUsdCents)}
										</td>
									</tr>
								))}
					</tbody>
				</table>

				{data.total === 0 && !query.isLoading && (
					<div className="py-12 text-center text-sm text-gray-9">
						No events match your filters.
					</div>
				)}
			</div>

			{totalPages > 1 && (
				<div className="flex items-center justify-between text-sm text-gray-11">
					<p>
						{(page - 1) * limit + 1}–{Math.min(page * limit, data.total)} of{" "}
						{data.total}
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							disabled={page <= 1}
							onClick={() => setPage(page - 1)}
							className="rounded-lg border border-gray-4 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-3 transition-colors"
						>
							Previous
						</button>
						<button
							type="button"
							disabled={page >= totalPages}
							onClick={() => setPage(page + 1)}
							className="rounded-lg border border-gray-4 px-3 py-1.5 disabled:opacity-40 hover:bg-gray-3 transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</div>
	);
}
