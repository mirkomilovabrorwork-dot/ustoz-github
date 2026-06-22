# Ustoz Media CDN — Cloudflare Worker

Edge video/media delivery via Cloudflare Worker + R2, with signed-token access control,
HTTP Range support (video seek/scrub), and edge caching for full-object fetches.

---

## Prerequisites

- A Cloudflare account with R2 enabled.
- An R2 bucket already created (you only need the bucket name).
- Node.js ≥ 18 and npm installed locally.
- Wrangler CLI authenticated (`wrangler login`).

---

## Deploy steps

### 1. Install dependencies
```bash
cd cloudflare-worker
npm install
```

### 2. Set your R2 bucket name

Open `wrangler.toml` and replace the placeholder:

```toml
[[r2_buckets]]
binding     = "MEDIA"
bucket_name = "REPLACE_WITH_YOUR_BUCKET"   # ← change this
```

### 3. Authenticate Wrangler
```bash
wrangler login
```

### 4. Set the signing secret (NEVER put this in wrangler.toml)
```bash
wrangler secret put SIGNING_SECRET
# → paste your secret when prompted (any strong random string, e.g. openssl rand -hex 32)
```

Use the **same secret** in the Next.js app when minting signed URLs.

### 5. Deploy
```bash
npm run deploy
```

Wrangler prints the Worker URL:
```
https://ustoz-media-cdn.<your-subdomain>.workers.dev
```

### 6. (Optional) Custom domain for production caching

In the Cloudflare dashboard → Workers & Pages → ustoz-media-cdn → Settings → Domains & Routes,
add a custom domain (e.g. `media.yourdomain.com`). Custom domains enable Cloudflare's Tiered
Cache and give you branded URLs. The Cache API in the Worker also works on `workers.dev`, but
Tiered Cache requires a custom domain on a zone you own.

---

## URL scheme

```
https://<worker-domain>/media/<r2-object-key>?exp=<unixSeconds>&sig=<hmac-hex>
```

Examples:
```
/media/videos/abc123.mp4?exp=1750000000&sig=a3f9...
/media/thumbnails/abc123.jpg?exp=1750000000&sig=b7c2...
```

The R2 object key is everything after `/media/` (URL-decoded).

---

## Token signing recipe

**Signing string:** `${key}:${exp}` (colon-separated, no other characters)

Example for key `videos/abc123.mp4` expiring at Unix time `1750000000`:
```
videos/abc123.mp4:1750000000
```

**Algorithm:** HMAC-SHA-256 over the signing string, hex-encoded output.

### Node.js snippet — how the Next.js app will mint signed URLs

```typescript
import { createHmac } from "crypto";

const SIGNING_SECRET = process.env.MEDIA_SIGNING_SECRET!; // same secret as the Worker
const WORKER_BASE    = process.env.MEDIA_CDN_URL!;         // e.g. https://media.yourdomain.com

function signedMediaUrl(r2Key: string, ttlSeconds = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = createHmac("sha256", SIGNING_SECRET)
    .update(`${r2Key}:${exp}`)
    .digest("hex");
  return `${WORKER_BASE}/media/${encodeURIComponent(r2Key)}?exp=${exp}&sig=${sig}`;
}

// Usage:
// const url = signedMediaUrl("videos/abc123.mp4", 3600);
// → https://media.yourdomain.com/media/videos%2Fabc123.mp4?exp=1750003600&sig=...
```

> **Environment variables needed in the Next.js app** (set in Railway / .env.local):
> - `MEDIA_SIGNING_SECRET` — the same value you passed to `wrangler secret put`
> - `MEDIA_CDN_URL` — the Worker URL or custom domain (no trailing slash)

---

## Caching behaviour

| Request type | Cache behaviour |
|---|---|
| Full GET (no `Range` header) | Cached at the Cloudflare edge via Cache API, `max-age=31536000, immutable`. Cache key = `/media/<key>` (token params stripped). |
| Range GET (`Range: bytes=…`) | Bypasses edge cache; served directly from R2 on every request. R2 intra-datacenter egress is free. This is correct for video seek/scrub. |
| HEAD | Same headers as GET, no body. |

---

## Integration is a separate step

The Next.js app currently returns **R2 presigned S3-endpoint URLs** from `/api/playlist`.
Switching to Worker signed URLs is intentionally NOT done here — it requires editing the
playlist API route in the Next.js app (a separate, owner-gated change).

When the owner is ready to wire it up:
1. Add `MEDIA_SIGNING_SECRET` and `MEDIA_CDN_URL` to the Railway environment.
2. In `apps/web` (or wherever `/api/playlist` lives), replace the presigned S3 URL generation
   with a call to `signedMediaUrl(r2Key)` (snippet above).
3. Test that video playback (including seek) works end-to-end.

---

## Typecheck (optional local verification)

```bash
npm run typecheck
```

Requires `npm install` first. No Cloudflare account needed for typechecking.
