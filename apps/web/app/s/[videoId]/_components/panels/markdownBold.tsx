import type { ReactNode } from "react";

/**
 * Render inline `**bold**` markdown — the only markup the AI emits inside
 * transcript / refined-transcript text — as <strong>. Builds React nodes
 * (no dangerouslySetInnerHTML), so it is XSS-safe for AI-generated content.
 */
export function renderMarkdownBold(text: string): ReactNode {
	if (!text.includes("**")) return text;
	// Split on **…**; the capture group puts the bolded text on odd indices.
	const parts = text.split(/\*\*(.+?)\*\*/g);
	return parts.map((part, i) =>
		i % 2 === 1 ? <strong key={i}>{part}</strong> : part,
	);
}
