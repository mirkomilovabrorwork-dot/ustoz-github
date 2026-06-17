/** Canonical display separator: em-dash. */
export const DATE_SEPARATOR = "—";

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

function toDate(input: Date | string | number | null | undefined): Date | null {
	if (input == null) return null;
	const d = input instanceof Date ? input : new Date(input);
	if (Number.isNaN(d.getTime())) return null;
	return d;
}

/** Returns `"15 — June, 2026"` — day, separator, full month, comma, year. */
export function formatPlatformDate(
	input: Date | string | number | null | undefined,
): string {
	const d = toDate(input);
	if (!d) return "";
	return `${d.getDate()} ${DATE_SEPARATOR} ${MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
}

/** Returns `"15 — June, 2026 · 16:21"` — adds 24h time, no seconds. */
export function formatPlatformDateTime(
	input: Date | string | number | null | undefined,
): string {
	const d = toDate(input);
	if (!d) return "";
	const hours = String(d.getHours()).padStart(2, "0");
	const minutes = String(d.getMinutes()).padStart(2, "0");
	return `${formatPlatformDate(d)} · ${hours}:${minutes}`;
}

/** Returns `"15 Jun"` — compact format for chart axis ticks. */
export function formatPlatformDateShort(
	input: Date | string | number | null | undefined,
): string {
	const d = toDate(input);
	if (!d) return "";
	const shortMonths = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	return `${d.getDate()} ${shortMonths[d.getMonth()]}`;
}

/** Returns relative time string like "6 days ago". Uses simple calculation, no moment dependency. */
export function formatPlatformDateRelative(
	input: Date | string | number | null | undefined,
): string {
	const d = toDate(input);
	if (!d) return "";
	const now = Date.now();
	const diff = now - d.getTime();
	const seconds = Math.floor(diff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (seconds < 45) return "a few seconds ago";
	if (minutes < 2) return "a minute ago";
	if (minutes < 45) return `${minutes} minutes ago`;
	if (hours < 2) return "an hour ago";
	if (hours < 22) return `${hours} hours ago`;
	if (days < 2) return "a day ago";
	if (days < 26) return `${days} days ago`;
	if (months < 2) return "a month ago";
	if (months < 11) return `${months} months ago`;
	if (years < 2) return "a year ago";
	return `${years} years ago`;
}
