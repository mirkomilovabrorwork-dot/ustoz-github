import { lookup } from "node:dns/promises";
import net from "node:net";

/**
 * SSRF guard for user-supplied external URLs (e.g. a custom S3 endpoint).
 *
 * It enforces an `https:` scheme, resolves the hostname via DNS, and rejects
 * any address that falls in a private/loopback/link-local/metadata range. This
 * prevents an org storage manager from pointing the endpoint at internal
 * services (cloud metadata 169.254.169.254, localhost, RFC1918 ranges, etc.)
 * and tricking the server into making requests on their behalf.
 */

const IPV4_BLOCK_MESSAGE =
	"Endpoint resolves to a blocked (private, loopback, link-local, or metadata) address.";

function isBlockedIpv4(ip: string): boolean {
	const parts = ip.split(".").map((part) => Number(part));
	if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
		return false;
	}

	const [a, b] = parts;
	if (a === undefined || b === undefined) return false;

	return (
		a === 0 || // 0.0.0.0/8 (incl. 0.0.0.0)
		a === 10 || // 10.0.0.0/8
		a === 127 || // 127.0.0.0/8 loopback
		(a === 169 && b === 254) || // 169.254.0.0/16 link-local incl. 169.254.169.254
		(a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
		(a === 192 && b === 168) // 192.168.0.0/16
	);
}

function isBlockedIpv6(ip: string): boolean {
	const normalized = ip.toLowerCase();

	// Strip a zone id (e.g. fe80::1%eth0) if present.
	const address = normalized.split("%")[0] ?? normalized;

	if (address === "::1" || address === "::") return true; // loopback / unspecified
	if (address.startsWith("fe80")) return true; // fe80::/10 link-local
	if (address.startsWith("fc") || address.startsWith("fd")) return true; // fc00::/7 unique-local

	// IPv4-mapped / -compatible IPv6 (e.g. ::ffff:169.254.169.254).
	const lastColon = address.lastIndexOf(":");
	const tail = lastColon >= 0 ? address.slice(lastColon + 1) : address;
	if (net.isIPv4(tail) && isBlockedIpv4(tail)) return true;

	return false;
}

function isBlockedIp(ip: string): boolean {
	if (net.isIPv4(ip)) return isBlockedIpv4(ip);
	if (net.isIPv6(ip)) return isBlockedIpv6(ip);
	// Unknown address family — fail closed.
	return true;
}

/**
 * Validate that `value` is a safe https URL whose host does not resolve to a
 * private/internal address. Throws an Error with a clear message otherwise.
 *
 * Returns the parsed URL on success.
 */
export async function assertSafeExternalUrl(value: string): Promise<URL> {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new Error("Endpoint is not a valid URL.");
	}

	if (url.protocol !== "https:") {
		throw new Error("Endpoint must use https.");
	}

	const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");

	if (hostname === "localhost") {
		throw new Error(IPV4_BLOCK_MESSAGE);
	}

	// If the host is already a literal IP, check it directly.
	if (net.isIP(hostname)) {
		if (isBlockedIp(hostname)) throw new Error(IPV4_BLOCK_MESSAGE);
		return url;
	}

	// Resolve every address the hostname maps to and block if ANY is internal
	// (prevents DNS-rebinding-style bypass where one record is public).
	let records: Array<{ address: string }>;
	try {
		records = await lookup(hostname, { all: true });
	} catch {
		throw new Error("Could not resolve the endpoint hostname.");
	}

	if (records.length === 0) {
		throw new Error("Could not resolve the endpoint hostname.");
	}

	for (const { address } of records) {
		if (isBlockedIp(address)) {
			throw new Error(IPV4_BLOCK_MESSAGE);
		}
	}

	return url;
}
