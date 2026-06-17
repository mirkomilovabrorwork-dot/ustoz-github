const PRICES: Record<
	string,
	{ inputPerMillion: number; outputPerMillion: number }
> = {
	"gemini-2.0-flash": { inputPerMillion: 0.1, outputPerMillion: 0.4 },
	"text-embedding-004": { inputPerMillion: 0, outputPerMillion: 0 },
};

const DEFAULT_PRICE = { inputPerMillion: 0.15, outputPerMillion: 0.6 };

export function priceForMicros(
	model: string,
	inputTokens: number,
	outputTokens: number,
): number {
	const price = PRICES[model] ?? DEFAULT_PRICE;
	const inputCostUsd = (inputTokens / 1_000_000) * price.inputPerMillion;
	const outputCostUsd = (outputTokens / 1_000_000) * price.outputPerMillion;
	return Math.round((inputCostUsd + outputCostUsd) * 1_000_000);
}
