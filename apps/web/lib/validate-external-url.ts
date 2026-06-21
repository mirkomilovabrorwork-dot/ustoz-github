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

/**
 * Expand a full or compressed IPv6 address string (stripped of zone-id and
 * surrounding brackets) into exactly 16 bytes.  Returns null if the input
 * cannot be parsed — callers must treat null as "blocked" (fail-closed).
 *
 * Handles:
 *  - `::` compression anywhere
 *  - an embedded dotted-quad IPv4 tail (e.g. `::ffff:192.0.2.1`)
 */
function parseIPv6Bytes(address: string): Uint8Array | null {
	// Split on "::" to find the compressed gap (at most one).
	const halves = address.split("::");
	if (halves.length > 2) return null; // more than one "::" — invalid

	const parseGroups = (segment: string): number[] | null => {
		if (segment === "") return [];
		const parts = segment.split(":");
		const groups: number[] = [];
		for (const part of parts) {
			// Last group may be a dotted-quad IPv4 tail.
			if (part.includes(".")) {
				const v4Parts = part.split(".").map(Number);
				if (
					v4Parts.length !== 4 ||
					v4Parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
				)
					return null;
				// Encode as two 16-bit groups.
				const [a = 0, b = 0, c = 0, d = 0] = v4Parts;
				groups.push((a << 8) | b, (c << 8) | d);
			} else {
				if (part.length === 0 || part.length > 4) return null;
				const n = Number.parseInt(part, 16);
				if (Number.isNaN(n)) return null;
				groups.push(n);
			}
		}
		return groups;
	};

	let groups: number[];

	if (halves.length === 1) {
		// No "::" — must be exactly 8 groups.
		const g = parseGroups(halves[0] ?? "");
		if (!g || g.length !== 8) return null;
		groups = g;
	} else {
		// Has "::" — left and right halves fill the missing groups.
		const left = parseGroups(halves[0] ?? "");
		const right = parseGroups(halves[1] ?? "");
		if (!left || !right) return null;
		const missing = 8 - left.length - right.length;
		if (missing < 0) return null;
		groups = [...left, ...Array(missing).fill(0), ...right];
	}

	if (groups.length !== 8) return null;

	// Flatten 8 × 16-bit groups → 16 bytes.
	const bytes = new Uint8Array(16);
	for (let i = 0; i < 8; i++) {
		bytes[i * 2] = (groups[i]! >> 8) & 0xff;
		bytes[i * 2 + 1] = groups[i]! & 0xff;
	}
	return bytes;
}

function isBlockedIpv6(ip: string): boolean {
	const normalized = ip.toLowerCase();

	// Strip a zone id (e.g. fe80::1%eth0) if present.
	const address = normalized.split("%")[0] ?? normalized;

	const bytes = parseIPv6Bytes(address);
	// Fail closed: if we can't parse it, block it.
	if (!bytes) return true;

	// ::1  loopback
	// ::   unspecified
	const allZero = bytes.every((b) => b === 0);
	if (allZero) return true; // ::
	const loopback =
		bytes.slice(0, 15).every((b) => b === 0) && bytes[15] === 1;
	if (loopback) return true; // ::1

	// fe80::/10  link-local  (byte0 == 0xfe && (byte1 & 0xc0) == 0x80)
	if (bytes[0] === 0xfe && (bytes[1]! & 0xc0) === 0x80) return true;

	// fc00::/7  unique-local  (byte0 == 0xfc or 0xfd)
	if (bytes[0] === 0xfc || bytes[0] === 0xfd) return true;

	// ::ffff:0:0/96  IPv4-mapped  (bytes 0-9 zero, bytes 10-11 == 0xff)
	const isMapped =
		bytes.slice(0, 10).every((b) => b === 0) &&
		bytes[10] === 0xff &&
		bytes[11] === 0xff;
	if (isMapped) {
		// Extract the trailing IPv4 (bytes 12-15) and reuse the IPv4 blocker.
		const v4 = `${bytes[12]}.${bytes[13]}.${bytes[14]}.${bytes[15]}`;
		if (isBlockedIpv4(v4)) return true;
	}

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
