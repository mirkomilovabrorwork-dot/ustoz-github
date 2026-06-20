/**
 * Single source of truth for the default Cap server URL.
 *
 * The runtime value can always be overridden by the user in the Options page
 * (saved to chrome.storage under capExtSettings.apiBaseUrl).
 *
 * externally_connectable in manifest.json already covers:
 *   https://*.up.railway.app/*   ← any Railway subdomain (new deploy = just update apiBaseUrl)
 *   http://localhost:3000/*      ← local dev
 *
 * If a fully custom domain is ever used it must also be added to
 * externally_connectable in manifest.json (Chrome requirement).
 */
export const DEFAULT_API_BASE_URL =
	"https://web-production-e6fe4.up.railway.app";
