import { createHmac } from "node:crypto";

/**
 * Returns a signed Cloudflare Worker media URL when MEDIA_CDN_URL and
 * MEDIA_SIGNING_SECRET are both set; returns null otherwise (caller falls
 * back to a presigned S3 URL — the existing behaviour is unchanged).
 *
 * Worker expects: GET <base>/media/<encodeURIComponent(r2Key)>?exp=<unix>&sig=<hex>
 * where sig = HMAC-SHA-256(secret, `${r2Key}:${exp}`) hex lowercase.
 */
export function signedMediaUrl(r2Key: string, ttlSeconds = 3600): string | null {
  const base = process.env.MEDIA_CDN_URL?.trim();
  const secret = process.env.MEDIA_SIGNING_SECRET?.trim();
  if (!base || !secret) return null; // safety gate — must be a no-op when unset
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", secret).update(`${r2Key}:${exp}`).digest("hex");
  return `${base.replace(/\/$/, "")}/media/${encodeURIComponent(r2Key)}?exp=${exp}&sig=${sig}`;
}
