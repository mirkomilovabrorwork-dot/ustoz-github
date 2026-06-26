/** Returns true for transient Gemini overload / rate-limit errors that are safe to retry. */
export function isTransientGeminiError(status: number, body: string): boolean {
	if (status === 429 || status === 500 || status === 503) return true;
	const lower = body.toLowerCase();
	return (
		lower.includes("overloaded") ||
		lower.includes("high demand") ||
		lower.includes("unavailable")
	);
}

/**
 * Calls `fn` up to `maxAttempts` times, retrying only on transient Gemini
 * errors (HTTP 429/500/503, "overloaded", "high demand", "UNAVAILABLE").
 * Delays: 1s → 2s → 4s → 8s → 8s (capped) + up to 500ms random jitter.
 */
export async function withGeminiRetry<T>(
	fn: () => Promise<T>,
	maxAttempts = 5,
): Promise<T> {
	let lastError: unknown;
	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;
			const message = err instanceof Error ? err.message : String(err);
			const permanent = (err as { permanent?: boolean })?.permanent === true;
			const isTransient =
				/429|500|503|overloaded|high demand|unavailable/i.test(message);
			if (permanent || !isTransient || attempt === maxAttempts - 1) throw err;
			const baseDelay = Math.min(1000 * Math.pow(2, attempt), 8000);
			const jitter = Math.floor(Math.random() * 500);
			await new Promise<void>((resolve) =>
				setTimeout(resolve, baseDelay + jitter),
			);
		}
	}
	throw lastError;
}
