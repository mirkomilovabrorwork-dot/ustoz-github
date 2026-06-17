"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect } from "react";
import { getStorageUsage } from "@/actions/organization/get-storage-usage";

function isStaleActionError(err: unknown): boolean {
	if (!(err instanceof Error)) return false;
	return (
		err.message.includes("Failed to find Server Action") ||
		err.message.includes("was not found on the server") ||
		err.message.includes("older or newer deployment")
	);
}

function fmtBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ["KB", "MB", "GB", "TB"];
	let v = bytes / 1024;
	let i = 0;
	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}
	return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function StorageIndicator() {
	const { data, isLoading, error } = useQuery({
		queryKey: ["storage-usage"],
		queryFn: () => getStorageUsage(),
		staleTime: 60_000,
		retry: false,
	});

	useEffect(() => {
		if (isStaleActionError(error)) {
			const t = setTimeout(() => window.location.reload(), 1500);
			return () => clearTimeout(t);
		}
	}, [error]);

	if (isLoading) {
		return (
			<div className="block p-3 rounded-lg border border-gray-5 bg-gray-2">
				<div className="flex justify-between items-baseline mb-1.5">
					<span className="text-sm font-medium text-gray-12">Storage</span>
					<span className="h-3 w-16 rounded bg-gray-4 animate-pulse" />
				</div>
				<div className="h-1.5 w-full rounded-full bg-gray-4 animate-pulse" />
				<div className="mt-1.5 h-2.5 w-20 rounded bg-gray-4 animate-pulse" />
			</div>
		);
	}

	if (error || !data) {
		if (isStaleActionError(error)) {
			return (
				<div className="block p-3 rounded-lg border border-gray-5 bg-gray-2">
					<div className="text-sm font-medium text-gray-12 mb-1">Storage</div>
					<div className="text-xs text-gray-10">Updating…</div>
				</div>
			);
		}
		return (
			<Link
				href="/dashboard/settings/storage"
				className="block p-3 rounded-lg border border-red-300 bg-red-50 hover:bg-red-100"
			>
				<div className="text-sm font-medium text-red-700 mb-1">Storage</div>
				<div className="text-xs text-red-600">
					Couldn't load — click to retry
				</div>
			</Link>
		);
	}

	const pct = Math.min(100, data.percentUsed);
	const barColor =
		pct >= 90 ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-blue-500";

	return (
		<Link
			href="/dashboard/settings/storage"
			className="block p-3 rounded-lg border border-gray-5 bg-gray-2 hover:bg-gray-3 transition-colors"
		>
			<div className="flex justify-between items-baseline mb-1.5">
				<span className="text-sm font-medium text-gray-12">Storage</span>
				<span className="text-xs text-gray-10">
					{fmtBytes(data.usedBytes)} / {fmtBytes(data.quotaBytes)}
				</span>
			</div>
			<div className="h-1.5 w-full rounded-full bg-gray-5 overflow-hidden">
				<div
					className={`h-full rounded-full transition-all ${barColor}`}
					style={{ width: `${Math.max(pct, 1)}%` }}
				/>
			</div>
			<p className="mt-1.5 text-[11px] text-gray-10">
				{pct >= 99 ? "Quota full" : `${(100 - pct).toFixed(1)}% free`}
			</p>
		</Link>
	);
}
