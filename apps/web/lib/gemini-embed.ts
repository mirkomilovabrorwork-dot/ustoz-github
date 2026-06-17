const BATCH_SIZE = 100;
export const EMBED_MODEL = "text-embedding-004";

interface BatchEmbedResponse {
	embeddings: Array<{
		values: number[];
	}>;
}

export interface EmbedResult {
	embeddings: number[][];
	totalTokens: number;
}

export async function embedChunks(
	chunks: { text: string }[],
	apiKey: string,
): Promise<number[][]> {
	const result = await embedChunksWithUsage(chunks, apiKey);
	return result.embeddings;
}

export async function embedChunksWithUsage(
	chunks: { text: string }[],
	apiKey: string,
): Promise<EmbedResult> {
	const allEmbeddings: number[][] = [];
	let totalTokens = 0;

	for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
		const batch = chunks.slice(i, i + BATCH_SIZE);

		const res = await fetch(
			`https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					requests: batch.map((chunk) => ({
						model: `models/${EMBED_MODEL}`,
						content: {
							parts: [{ text: chunk.text }],
						},
					})),
				}),
			},
		);

		if (!res.ok) {
			const errBody = await res.text();
			throw new Error(
				`Gemini batchEmbedContents failed: ${res.status} ${errBody}`,
			);
		}

		const data = (await res.json()) as BatchEmbedResponse & {
			usageMetadata?: { promptTokenCount?: number };
		};
		for (const emb of data.embeddings) {
			allEmbeddings.push(emb.values);
		}
		totalTokens += data.usageMetadata?.promptTokenCount ?? 0;
	}

	return { embeddings: allEmbeddings, totalTokens };
}
