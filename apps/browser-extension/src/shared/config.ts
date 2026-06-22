/**
 * Single source of truth for the default Cap server URL.
 *
 * The runtime value can always be overridden by the user in the Options page
 * (saved to chrome.storage under capExtSettings.apiBaseUrl).
 *
 * externally_connectable in manifest.json already covers:
 *   https://*.up.railway.app/*   ← any Railway subdomain (new deploy = just update apiBaseUrl)
 *   http://localhost:3000/*      ← local dev (API)
 *   http://localhost:3001/*      ← local dev (web app / OAuth callback)
 *
 * If a fully custom domain is ever used it must also be added to
 * externally_connectable in manifest.json (Chrome requirement).
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
		extensionEnv?.WEB_URL,
		extensionEnv?.NEXT_PUBLIC_WEB_URL,
		fallbackApiBaseUrl,
	]
		.map((value) => value?.trim())
		.find((value): value is string => Boolean(value)) ?? fallbackApiBaseUrl;
