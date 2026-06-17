"use client";

import { Button } from "@cap/ui";
import { useEffect } from "react";

const STALE_ACTION_PHRASES = [
	"Failed to find Server Action",
	"older or newer deployment",
];

function isStaleActionError(error: Error): boolean {
	return STALE_ACTION_PHRASES.some(
		(phrase) =>
			error.message?.includes(phrase) || error.stack?.includes(phrase),
	);
}

export default function CapsError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const stale = isStaleActionError(error);

	useEffect(() => {
		console.error("[/dashboard/caps] render error:", error);
	}, [error]);

	useEffect(() => {
		if (!stale) return;
		const t = setTimeout(() => window.location.reload(), 1500);
		return () => clearTimeout(t);
	}, [stale]);

	if (stale) {
		return (
			<div className="flex flex-col items-center justify-center w-full p-12 text-center">
				<h2 className="text-xl font-semibold text-gray-12 mb-2">Updating…</h2>
				<p className="text-sm text-gray-10">
					A new version was deployed. Reloading in a moment.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center w-full p-12 text-center">
			<h2 className="text-xl font-semibold text-gray-12 mb-2">
				Couldn't load your videos
			</h2>
			<p className="text-sm text-gray-10 mb-4 max-w-md">
				Something went wrong loading this page. The error has been logged.
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
					Back to dashboard
				</Button>
			</div>
		</div>
	);
}
