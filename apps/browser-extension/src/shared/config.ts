/**
 * Single source of truth for the default Cap server URL.
 *
 * The runtime value can always be overridden by the user in the Options page
 * (saved to chrome.storage under capExtSettings.apiBaseUrl).
 *
 * externally_connectable in manifest.json must list EACH allowed web origin
 * explicitly. IMPORTANT: railway.app is on the Public Suffix List, so Chrome
 * REJECTS a wildcard like `https://*.up.railway.app/*` (wildcard subdomain of a
 * public suffix) and silently ignores it — which previously broke sign-in. So
 * every Railway subdomain (and any custom domain) must be added by its FULL
 * host, e.g. https://capweb-production-dd85.up.railway.app/*. A new deploy with
 * a different subdomain must be added there too, not just to apiBaseUrl.
 */
const extensionEnv = (
	globalThis as {
		process?: {
			env?: Record<string, string | undefined>;
		};
	}
).process?.env;

const fallbackApiBaseUrl = "https://capweb-production-dd85.up.railway.app";

export const DEFAULT_API_BASE_URL =
	[
		extensionEnv?.EXTENSION_API_BASE_URL,
		extensionEnv?.WEB_URL,
		extensionEnv?.NEXT_PUBLIC_WEB_URL,
		fallbackApiBaseUrl,
	]
		.map((value) => value?.trim())
		.find((value): value is string => Boolean(value)) ?? fallbackApiBaseUrl;
