// USD→UZS display rate. Approximate + configurable; AI cost is shown in som for the owner.
export const USD_TO_UZS = Number(process.env.NEXT_PUBLIC_USD_TO_UZS) || 12900;

/** Format a USD-cents amount as whole som, e.g. "129 000 so'm". */
export function formatUzs(usdCents: number): string {
	const som = Math.round((usdCents / 100) * USD_TO_UZS);
	return `${som.toLocaleString("ru-RU")} so'm`; // ru-RU gives space thousands separators
}
