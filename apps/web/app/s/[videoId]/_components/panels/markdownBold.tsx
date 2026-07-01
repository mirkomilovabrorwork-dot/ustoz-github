import type { ReactNode } from "react";

/**
 * Render the inline `**…**` markdown the AI emits inside transcript / refined /
 * summary text as a calm BLUE accent (colour-as-signal) instead of heavy bold —
 * the foreign/technical terms stay highlighted but read lighter. Builds React
 * nodes (no dangerouslySetInnerHTML), so it is XSS-safe for AI-generated content.
 */
export function renderMarkdownBold(text: string): ReactNode {
	if (!text.includes("**")) return text;
	// Split on **…**; the highlighted text lands on odd indices.
	const parts = text.split(/\*\*(.+?)\*\*/g);
	return parts.map((part, i) =>
		i % 2 === 1 ? (
			<span key={i} className="text-blue-11">
				{part}
			</span>
		) : (
			part
		),
	);
}
