"use client";

import { Button } from "@cap/ui";
import { useEffect } from "react";

const STALE_ACTION_PHRASES = [
	"Failed to find Server Action",
	"older or newer deployment",
];

function isStale(error: Error): boolean {
	return STALE_ACTION_PHRASES.some(
		(p) => error.message?.includes(p) || error.stack?.includes(p),
	);
}

export default function DashboardError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const stale = isStale(error);

	useEffect(() => {
		console.error("[dashboard] render error:", error);
		if (stale) {
			const t = setTimeout(() => window.location.reload(), 1200);
			return () => clearTimeout(t);
		}
	}, [error, stale]);

	if (stale) {
		return (
			<div className="flex flex-col items-center justify-center w-full p-12 text-center">
				<h2 className="text-xl font-semibold mb-2">Updating…</h2>
				<p className="text-sm text-gray-10">
					Reloading with the latest version.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center w-full p-12 text-center">
			<h2 className="text-xl font-semibold text-gray-12 mb-2">
				Couldn't load this page
			</h2>
			<p className="text-sm text-gray-10 mb-4 max-w-md">
				Something failed inside the dashboard. Your sidebar still works — try
				going to a different section.
			</p>
			{error.digest && (
				<p className="text-xs text-gray-9 mb-4 font-mono">
					Error ID: {error.digest}
				</p>
			)}
			{error.message && (
				<pre className="text-xs text-red-600 mb-4 max-w-2xl text-left overflow-auto p-3 bg-gray-2 rounded border border-gray-5">
					{error.message}
					{error.stack && `\n\n${error.stack}`}
				</pre>
			)}
			<div className="flex gap-2">
				<Button variant="dark" onClick={reset}>
					Try again
				</Button>
				<Button
					variant="gray"
					onClick={() => {
						window.location.href = "/dashboard";
					}}
				>
					Go to dashboard home
				</Button>
			</div>
		</div>
	);
}
