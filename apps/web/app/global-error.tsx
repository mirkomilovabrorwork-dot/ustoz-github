"use client";

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

export default function GlobalError({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const stale = isStaleActionError(error);

	useEffect(() => {
		console.error("[global-error]", error);
	}, [error]);

	useEffect(() => {
		if (!stale) return;
		const t = setTimeout(() => window.location.reload(), 1200);
		return () => clearTimeout(t);
	}, [stale]);

	return (
		<html lang="en">
			<body
				style={{
					margin: 0,
					minHeight: "100vh",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					fontFamily: "system-ui, -apple-system, sans-serif",
					backgroundColor: "#fafafa",
					color: "#1f2937",
				}}
			>
				<div
					style={{
						maxWidth: "32rem",
						padding: "2rem",
						textAlign: "center",
					}}
				>
					<h1
						style={{
							fontSize: "1.5rem",
							fontWeight: 600,
							marginBottom: "0.5rem",
						}}
					>
						{stale ? "Updating…" : "Something went wrong"}
					</h1>
					<p
						style={{
							fontSize: "0.875rem",
							color: "#6b7280",
							marginBottom: "1.5rem",
						}}
					>
						{stale
							? "A new version was deployed. Reloading in a moment."
							: "The page failed to load. Reload to try again."}
					</p>
					{error.digest && (
						<p
							style={{
								fontSize: "0.75rem",
								color: "#9ca3af",
								marginBottom: "1rem",
								fontFamily: "monospace",
							}}
						>
							Error ID: {error.digest}
						</p>
					)}
					{!stale && (
						<button
							type="button"
							onClick={reset}
							style={{
								padding: "0.5rem 1rem",
								borderRadius: "0.375rem",
								border: "1px solid #d1d5db",
								backgroundColor: "white",
								cursor: "pointer",
								fontSize: "0.875rem",
								fontWeight: 500,
							}}
						>
							Reload
						</button>
					)}
				</div>
			</body>
		</html>
	);
}
