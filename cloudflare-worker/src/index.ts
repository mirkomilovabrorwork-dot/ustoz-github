/**
 * Ustoz Media CDN — Cloudflare Worker
 *
 * URL scheme:  https://<worker-domain>/media/<r2-object-key>?exp=<unixSec>&sig=<hex>
 *
 * Token signing (HMAC-SHA-256):
 *   signingString = `${key}:${exp}`          e.g. "videos/abc123.mp4:1750000000"
 *   sig           = HMAC-SHA256(SIGNING_SECRET, signingString)  → hex-encoded
 *
 * Range requests:
 *   - Supported: HTTP 206 Partial Content with correct Content-Range header.
 *   - Range requests bypass the Cache API (cache is keyed to the full URL and
 *     cannot store partial content correctly across varying ranges). They hit R2
 *     directly on every request. R2 intra-datacenter reads are free and fast;
 *     this is the correct trade-off for video seek/scrub traffic.
 *   - Full-object GETs (no Range header) are cached at the edge via the Cache
 *     API with a 1-year immutable TTL.
 */

export interface Env {
  MEDIA: R2Bucket;
  /** Set via: wrangler secret put SIGNING_SECRET */
  SIGNING_SECRET: string;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const { method } = request;

    if (method !== "GET" && method !== "HEAD") {
      return new Response("Method Not Allowed", {
        status: 405,
        headers: { Allow: "GET, HEAD" },
      });
    }

    // ------------------------------------------------------------------
    // Parse the R2 object key from the URL path.
    // Expected:  /media/<key>
    //   e.g.    /media/videos/abc123.mp4
    //           /media/thumbnails/abc123.jpg
    // The leading "/media/" prefix is stripped; the rest is the R2 key.
    // ------------------------------------------------------------------
    const url = new URL(request.url);
    const pathname = url.pathname;

    const PREFIX = "/media/";
    if (!pathname.startsWith(PREFIX)) {
      return new Response("Not Found", { status: 404 });
    }

    const key = decodeURIComponent(pathname.slice(PREFIX.length));
    if (!key) {
      return new Response("Not Found", { status: 404 });
    }

    // ------------------------------------------------------------------
    // Token validation
    // ------------------------------------------------------------------
    const expParam = url.searchParams.get("exp");
    const sigParam = url.searchParams.get("sig");

    if (!expParam || !sigParam) {
      return new Response("Missing signature parameters", { status: 401 });
    }

    const exp = parseInt(expParam, 10);
    if (isNaN(exp)) {
      return new Response("Invalid expiry", { status: 401 });
    }

    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > exp) {
      return new Response("Token expired", { status: 403 });
    }

    // Verify HMAC-SHA-256 signature
    const valid = await verifyHmac(env.SIGNING_SECRET, `${key}:${expParam}`, sigParam);
    if (!valid) {
      return new Response("Invalid signature", { status: 403 });
    }

    // ------------------------------------------------------------------
    // Range header handling
    // ------------------------------------------------------------------
    const rangeHeader = request.headers.get("Range");
    const isRangeRequest = rangeHeader !== null;

    if (isRangeRequest) {
      return handleRangeRequest(request, env, key, rangeHeader!);
    }

    // ------------------------------------------------------------------
    // Full-object GET — serve from Cache API when possible
    // ------------------------------------------------------------------
    return handleFullRequest(request, env, ctx, key);
  },
} satisfies ExportedHandler<Env>;

// ---------------------------------------------------------------------------
// Full-object handler — Cache API path
// ---------------------------------------------------------------------------

async function handleFullRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  key: string,
): Promise<Response> {
  const cache = caches.default;

  // Cache key: strip the signed query params so all tokens for the same object
  // share one cache entry. We key on origin + path only.
  const cacheKey = new Request(new URL(request.url).origin + "/media/" + encodeURIComponent(key));

  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from R2, honouring If-None-Match for 304 revalidation.
  const ifNoneMatch = request.headers.get("If-None-Match") ?? undefined;
  const object = await env.MEDIA.get(key, {
    onlyIf: ifNoneMatch ? { etagDoesNotMatch: ifNoneMatch } : undefined,
  });

  if (object === null) {
    return new Response("Not Found", { status: 404 });
  }

  // R2 returns `null` body when onlyIf condition fails (ETag matched → 304).
  if (!("body" in object) || !(object as R2ObjectBody).body) {
    return new Response(null, {
      status: 304,
      headers: buildBaseHeaders(object as R2Object),
    });
  }

  const headers = buildBaseHeaders(object);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  const response = new Response(object.body, { status: 200, headers });

  // Store in edge cache (waitUntil so we don't delay the response).
  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}

// ---------------------------------------------------------------------------
// Range-request handler — bypass cache, stream partial content from R2
// ---------------------------------------------------------------------------

async function handleRangeRequest(
  request: Request,
  env: Env,
  key: string,
  rangeHeader: string,
): Promise<Response> {
  // We need the total object size first (HEAD-like metadata read).
  // R2 get() with a range returns the slice; size is in the R2ObjectBody.
  const parsed = parseRangeHeader(rangeHeader);
  if (!parsed) {
    return new Response("Range Not Satisfiable", { status: 416 });
  }

  // Fetch metadata to know total size (needed for Content-Range).
  const meta = await env.MEDIA.head(key);
  if (!meta) {
    return new Response("Not Found", { status: 404 });
  }

  const totalSize = meta.size;
  const { offset, length } = resolveRange(parsed, totalSize);

  if (offset >= totalSize || length <= 0) {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${totalSize}` },
    });
  }

  const object = await env.MEDIA.get(key, {
    range: { offset, length },
  });

  if (!object || !("body" in object)) {
    return new Response("Not Found", { status: 404 });
  }

  const end = offset + length - 1;
  const headers = buildBaseHeaders(meta);
  headers.set("Content-Range", `bytes ${offset}-${end}/${totalSize}`);
  headers.set("Content-Length", String(length));
  // Do NOT set Cache-Control immutable on partial responses — the range varies.
  headers.set("Cache-Control", "no-store");

  return new Response(object.body, { status: 206, headers });
}

// ---------------------------------------------------------------------------
// HMAC-SHA-256 helpers
// ---------------------------------------------------------------------------

async function getHmacKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

async function verifyHmac(secret: string, message: string, expectedHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await getHmacKey(secret);
  const expectedBytes = hexToBytes(expectedHex);
  if (!expectedBytes) return false;

  // crypto.subtle.verify is constant-time — safe against timing attacks.
  return crypto.subtle.verify("HMAC", key, expectedBytes, enc.encode(message));
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (isNaN(byte)) return null;
    bytes[i] = byte;
  }
  return bytes;
}

// Exported so integration tests can generate matching tokens.
export async function signToken(secret: string, key: string, expSec: number): Promise<string> {
  const enc = new TextEncoder();
  const cryptoKey = await getHmacKey(secret);
  const sigBytes = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(`${key}:${expSec}`));
  return bytesToHex(new Uint8Array(sigBytes));
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Range header parsing
// ---------------------------------------------------------------------------

interface RangeParsed {
  type: "from-start" | "suffix";
  start?: number;
  end?: number;
  suffixLength?: number;
}

function parseRangeHeader(header: string): RangeParsed | null {
  // Only handle "bytes=..." ranges (RFC 7233).
  const m = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!m) return null;

  const startStr = m[1];
  const endStr = m[2];

  if (startStr === "" && endStr === "") return null;

  if (startStr === "") {
    // Suffix range: bytes=-500  → last 500 bytes
    return { type: "suffix", suffixLength: parseInt(endStr, 10) };
  }

  return {
    type: "from-start",
    start: parseInt(startStr, 10),
    end: endStr !== "" ? parseInt(endStr, 10) : undefined,
  };
}

function resolveRange(
  parsed: RangeParsed,
  totalSize: number,
): { offset: number; length: number } {
  if (parsed.type === "suffix") {
    const sfx = Math.min(parsed.suffixLength!, totalSize);
    return { offset: totalSize - sfx, length: sfx };
  }

  const start = parsed.start!;
  const end = parsed.end !== undefined ? Math.min(parsed.end, totalSize - 1) : totalSize - 1;
  return { offset: start, length: end - start + 1 };
}

// ---------------------------------------------------------------------------
// Shared header builder
// ---------------------------------------------------------------------------

function buildBaseHeaders(object: R2Object): Headers {
  const headers = new Headers();
  const contentType = object.httpMetadata?.contentType ?? "application/octet-stream";
  headers.set("Content-Type", contentType);
  headers.set("ETag", object.httpEtag);
  headers.set("Accept-Ranges", "bytes");
  headers.set("Last-Modified", object.uploaded.toUTCString());
  return headers;
}
