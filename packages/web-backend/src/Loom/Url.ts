const LOOPBACK_V4_PREFIX = "127.";
const LINK_LOCAL_V4_PREFIX = "169.254.";

function isPrivateIpv4(hostname: string) {
	const parts = hostname.split(".").map((part) => Number(part));
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
		return false;
	}

	const [a, b] = parts;
	if (a === undefined || b === undefined) return false;

	return (
		a === 10 ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 192 && b === 168) ||
		hostname.startsWith(LOOPBACK_V4_PREFIX) ||
		hostname.startsWith(LINK_LOCAL_V4_PREFIX) ||
		hostname === "0.0.0.0"
	);
}

function isLocalIpv6(hostname: string) {
	const normalized = hostname.toLowerCase();
	return (
		normalized === "::1" ||
		normalized.startsWith("fc") ||
		normalized.startsWith("fd") ||
		normalized.startsWith("fe80:")
	);
}

function isAllowedLoomHost(hostname: string) {
	return (
		hostname === "loom.com" ||
		hostname.endsWith(".loom.com") ||
		hostname === "cloudfront.net" ||
		hostname.endsWith(".cloudfront.net")
	);
}

export function validateLoomDownloadUrl(value: string | URL) {
	try {
		const url = value instanceof URL ? value : new URL(value);
		const hostname = url.hostname.toLowerCase();

		if (url.protocol !== "https:") return null;
		if (hostname === "localhost") return null;
		if (isPrivateIpv4(hostname) || isLocalIpv6(hostname)) return null;
		if (!isAllowedLoomHost(hostname)) return null;

		return url;
	} catch {
		return null;
	}
}
