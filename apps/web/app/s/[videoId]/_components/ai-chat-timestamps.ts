export function parseTimestampToSeconds(timestamp: string): number {
	const parts = timestamp.split(":");
	if (parts.length === 3) {
		return (
			parseInt(parts[0] ?? "0", 10) * 3600 +
			parseInt(parts[1] ?? "0", 10) * 60 +
			parseInt(parts[2] ?? "0", 10)
		);
	}
	if (parts.length === 2) {
		return parseInt(parts[0] ?? "0", 10) * 60 + parseInt(parts[1] ?? "0", 10);
	}
	return 0;
}

export function formatSeconds(total: number): string {
	const seconds = total % 60;
	if (total >= 3600) {
		const hours = Math.floor(total / 3600);
		const minutes = Math.floor((total % 3600) / 60);
		return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
	}
	const minutes = Math.floor(total / 60);
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
