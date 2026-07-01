/** Map items through async fn with at most `limit` running at once; results in INPUT ORDER. */
export async function mapWithConcurrency<T, R>(
	items: readonly T[],
	limit: number,
	fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let cursor = 0;
	async function worker() {
		while (cursor < items.length) {
			const i = cursor++;
			results[i] = await fn(items[i] as T, i);
		}
	}
	await Promise.all(
		Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
	);
	return results;
}

export const AI_CHUNK_CONCURRENCY = 3;
