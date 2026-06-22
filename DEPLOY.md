# DEPLOY — One-Shot Deployment Runbook

Self-hosted deployment guide for a **brand-new account** with no prior history.
Follow steps in order. Every gotcha we hit the hard way is marked ⚠️.

---

## Overview

This is a **pnpm monorepo** (Next.js 16, TypeScript, Drizzle ORM, MySQL, Effect).

| Layer | Technology | Host |
|---|---|---|
| Web app | Next.js 16 — Docker standalone build | Railway (via Dockerfile) |
| Database | MySQL 8 | Railway MySQL plugin |
| File storage | Cloudflare R2 (videos, thumbnails, transcripts) | Cloudflare |
| AI features | Google Gemini | Google AI Studio |
| Cron recovery | GitHub Actions workflow | GitHub (free) |

The browser extension (`apps/browser-extension/`) is a separate artifact — it is
**not** deployed to Railway. See Step 7 for how to point it at your new URL.

The bot (if present) is also a separate service and is not covered here.

---

## Accounts You Need

| Account | URL | Cost |
|---|---|---|
| **GitHub** | https://github.com | Free (fork or clone the repo here) |
| **Railway** | https://railway.app | Free trial; staying online ~$5/mo on Hobby plan |
| **Cloudflare** | https://dash.cloudflare.com | Free; R2 egress is **always free** (only charged above 10 GB storage) |
| **Google AI Studio** | https://aistudio.google.com | Free tier available; set a spend cap |

---

## Step 1 — Cloudflare R2 (storage)

1. Log into Cloudflare → **R2** → **Create bucket**.
   - Name it anything (e.g. `my-videos`).
   - Keep it **Private** (default). Do NOT enable Public Access — playback works
     via presigned URLs and public access is a security risk.
2. Go to **R2 → Manage R2 API Tokens → Create API Token**.
   - Permissions: **Object Read & Write** (scope to all buckets or just this one).
   - Expiry: Forever (or rotate on a schedule — your choice).
   - Save the **Access Key ID** and **Secret Access Key** immediately — the secret
     is shown only once.
3. Note your **Cloudflare Account ID** (visible in the right sidebar of the
   Cloudflare dashboard).
   - The R2 endpoint is: `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`
4. Apply **CORS** to the bucket (required for browser uploads; the app does NOT do
   this automatically for R2):
   - R2 → your bucket → **Settings** → **CORS Policy** → **Add CORS policy**:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
       "AllowedHeaders": ["*"],
       "ExposeHeaders": ["ETag"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
   - Click **Save**.

> ⚠️ Without CORS, browser-to-R2 direct uploads and presigned-URL playback will
> fail with a CORS error — the app starts fine but uploads/playback silently break.

---

## Step 2 — Railway Project

### 2a. Create the project

1. https://railway.app → **New Project** → **Deploy from GitHub repo**.
2. Connect your GitHub account and select the forked/cloned repo.
3. Railway will detect the pnpm monorepo and auto-configure it as **Railpack**.

> ⚠️ **CRITICAL — Railway Railpack gotcha (do all three sub-steps or the deploy fails):**
>
> Railway's Railpack auto-detection does two wrong things for this repo:
> - It sets a `pnpm --filter` build/start command — the runner image has no pnpm,
>   so this crashes at startup.
> - It spawns a **junk extra service** for `apps/browser-extension/` automatically.
>
> Fix **before** the first deploy:
> 1. In the web service settings → **Builder** → switch to **Dockerfile**.
>    Set the Dockerfile path to **`/apps/web/Dockerfile`**.
> 2. **Clear the custom Start Command** (delete whatever Railway pre-filled).
>    The Dockerfile's `CMD ["node", "apps/web/server.js"]` already starts the app.
> 3. **Delete the junk browser-extension service** Railway auto-created.

### 2b. Add the MySQL plugin

Inside the same Railway project: **+ New** → **Database** → **MySQL**.
Railway injects `${{MySQL.MYSQL_URL}}` automatically — use this reference as the
`DATABASE_URL` value (do not paste a raw connection string).

> ⚠️ **Do NOT change the MySQL region after it goes online.** Moving a MySQL volume
> in Railway may leave the database unreachable until Railway support intervenes.
> Pick the right region once and leave it.

### 2c. Generate the Railway domain

Service → **Networking** → **Generate Domain**.
Copy the URL (e.g. `https://your-app.up.railway.app`) — you need it for env vars.

---

## Step 3 — Environment Variables

Go to your Railway web service → **Variables** tab.

**Copy `.env.example` from the repo root and fill in every value**, then paste the
filled block into Railway. The `.env.example` file is the authoritative reference;
the notes below call out the non-obvious parts only.

> ⚠️ **Generate FRESH secrets for every new deployment.**
> ```bash
> # NEXTAUTH_SECRET and INVITE_TOKEN_SECRET:
> openssl rand -base64 32
>
> # DATABASE_ENCRYPTION_KEY and CRON_SECRET:
> openssl rand -hex 32
> ```
> **Never reuse anyone else's secrets.** Our own filled-in secrets are in
> `docs/DEPLOY_SECRETS.md` which is gitignored and does NOT travel with `git clone`.
> It must not be carried to a new account.

### DATABASE_URL

Use a Railway reference — do **not** paste a literal connection string:

```
DATABASE_URL=${{MySQL.MYSQL_URL}}
```

### URL vars — all three are identical (your Railway domain)

```
NEXTAUTH_URL=https://your-app.up.railway.app
WEB_URL=https://your-app.up.railway.app
NEXT_PUBLIC_WEB_URL=https://your-app.up.railway.app
```

> ⚠️ `NEXT_PUBLIC_WEB_URL` is a **build-time** variable — it is baked into the
> Next.js client bundle at build time. Set it **before** triggering the first build,
> not after. Same for `NEXT_PUBLIC_DOCKER_BUILD=true`.

### Storage — the CAP_AWS_* variables (critical)

> ⚠️ **R2 storage gotcha — this caused a live production outage.**
>
> The server-side S3 client (`packages/web-backend/src/Aws.ts`) uses Effect's
> `Config.string("CAP_AWS_ACCESS_KEY")` which reads **`process.env` directly**.
> The `CLOUDFLARE_R2_*` → `CAP_AWS_*` convenience mapping in `packages/env/server.ts`
> only populates the validated env object — it does **NOT** reach `process.env`.
>
> If you set only `CLOUDFLARE_R2_*` vars, the S3 client silently falls back to
> ECS metadata, gets nothing, and every server-side storage operation (playlist
> generation, thumbnail fetch, transcription) returns 500.
>
> **You MUST set ALL of these explicitly in Railway Variables:**
> ```
> CAP_AWS_ACCESS_KEY=<your R2 access key>
> CAP_AWS_SECRET_KEY=<your R2 secret key>
> CAP_AWS_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
> CAP_AWS_BUCKET=<your bucket name>
> CAP_AWS_REGION=auto
> S3_PATH_STYLE=true
> ```
>
> Setting the `CLOUDFLARE_R2_*` vars alongside them is fine (used by other code
> paths) but is not a substitute for the above.

### Do NOT set

```
NEXT_PUBLIC_IS_CAP     ← turns on Cap Cloud billing / paywall gates
STRIPE_*               ← Stripe code is still in the fork, but self-host bypasses
                          billing (every user is treated as Pro). Leave these UNSET.
POSTHOG_* / WORKOS_* / RESEND_*  ← upstream analytics/auth/email integrations,
                          stubbed or unused in this fork. Leave UNSET.
```

---

## Step 4 — First Deploy

Trigger a deploy (Railway does this automatically when you push, or click
**Deploy** manually).

Watch the build log. You should see a line like:

```
fetch https://dl-cdn.alpinelinux.org/.../ffmpeg...
(1/3) Installing ffmpeg ...
```

> ⚠️ ffmpeg is installed by `RUN apk add --no-cache ffmpeg` in the Dockerfile
> (runner stage, around line 82). `ENV FFMPEG_PATH=/usr/bin/ffmpeg` is also set
> there — you do **NOT** need to add `FFMPEG_PATH` to Railway env vars. If you ever
> switch to a different base image and this line disappears, transcription will
> silently fail ("FFmpeg binary not found").

The first build takes several minutes (pnpm install + Next.js compilation of the
full monorepo). Subsequent deploys are faster thanks to Docker layer caching.

---

## Step 5 — Initialize the Database (run once, from your laptop)

After the service is running for the first time, push the schema and seed the
admin account. Run these from the repo root on your local machine.

**Windows — fix Node PATH first:**
```powershell
$env:Path = "C:\Program Files\nodejs;" + $env:Path
```

**Set DATABASE_URL to the MySQL PUBLIC url** (Railway MySQL plugin → Connect tab →
"Public URL" or the proxy/public connection string). This is different from the
internal `${{MySQL.MYSQL_URL}}` reference — you need the externally-accessible one
to run commands from your laptop.

```bash
# 1. Create all database tables (safe to re-run; idempotent)
pnpm db:push

# 2. Create the first admin account (run once only)
pnpm seed:admin
```

`db:push` reads `DATABASE_URL` from `.env` (local). Either:
- Set it temporarily in your local `.env` to the public MySQL URL, or
- Prefix the command: `DATABASE_URL="mysql://..." pnpm db:push`

> ⚠️ `pnpm db:push` creates the `auth_api_keys` table (with `id varchar(64)`) that
> the browser extension's API-key sign-in depends on. If this step is skipped,
> extension sign-in will fail with a database error.
>
> Benign errors on re-run: `ER_DUP_FIELDNAME` or `ER_TABLE_EXISTS_ERROR` — safe to
> ignore. A real failure says `MIGRATION_FAILED` in the logs.

`pnpm seed:admin` uses `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from your
`.env`. Change the password after the first login.

---

## Step 6 — Cron (Durable Job Recovery)

Railway ignores `vercel.json` — cron routes are not called automatically.
Without this step, videos stuck mid-transcription (after a crash or redeploy) will
show a permanent spinner and never recover.

The repo ships `.github/workflows/recover-cron.yml`. It hits
`/api/cron/recover-stale-ai-jobs` every 30 minutes and safely no-ops until the
secret is set.

**To activate it — one owner step, ~30 seconds:**

1. GitHub repo → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**.
2. Name: `CRON_SECRET`
3. Value: the same `CRON_SECRET` value you set in Railway Variables.
4. Click **Add secret**.

The workflow will start calling the recovery endpoint on the next 30-minute tick.
Confirm it works by checking the **Actions** tab — the run should show HTTP 200.

> ⚠️ Also update the hardcoded `APP_URL` in `.github/workflows/recover-cron.yml`
> to your new Railway domain before relying on it (the file currently contains the
> original deployer's URL).

**Additional cron routes** (for larger deployments — see `docs/DEPLOY_CHECKLIST.md`
§8 for full Railway Cron service instructions):

| Route | Recommended schedule | Purpose |
|---|---|---|
| `GET /api/cron/finalize-stale-desktop-segments` | Every 15 min | Recovers stuck desktop recording segments |
| `GET /api/cron/developer-storage` | Daily at 02:00 UTC | Storage billing snapshots |

Both require header `Authorization: Bearer <CRON_SECRET>`.

---

## Step 7 — Browser Extension URL

The extension has a default backend URL hardcoded in
`apps/browser-extension/src/shared/config.ts` (the `DEFAULT_API_BASE_URL` constant).
It points at the original deployer's Railway URL — you must update it.

**Option A — edit and rebuild (recommended):**

1. Edit `apps/browser-extension/src/shared/config.ts` — change the hardcoded
   `fallbackApiBaseUrl` constant (the `DEFAULT_API_BASE_URL` export reads the
   build-time `EXTENSION_API_BASE_URL` env first, then falls back to this):
   ```typescript
   const fallbackApiBaseUrl = "https://your-app.up.railway.app";
   ```
   (Alternatively, set `EXTENSION_API_BASE_URL=https://your-app.up.railway.app`
   at build time instead of editing the file.)
2. Rebuild:
   ```bash
   pnpm -C apps/browser-extension build
   ```
3. Load `apps/browser-extension/dist/` as an unpacked extension in Chrome
   (Developer Mode on).

**Option B — set it in the extension Options (no rebuild):**

1. Load the existing `apps/browser-extension/dist/` as unpacked in Chrome.
2. Click the extension icon → **Options** (gear icon).
3. Find **"Cap server address"** and replace it with your new Railway URL.
4. Click **Save**.

> Note: The extension manifest already allows `https://*.up.railway.app/*` — any
> Railway subdomain works without changing the manifest. If you use a custom domain
> (not `.up.railway.app`), add it to `externally_connectable` in
> `apps/browser-extension/manifest.json` before rebuilding.
>
> `next.config.mjs` auto-derives `serverActions.allowedOrigins` from `WEB_URL` /
> `NEXT_PUBLIC_WEB_URL` — no code edit is needed on the server side for a new
> Railway URL, as long as those env vars are set correctly.

---

## Step 8 — AI Spend Safety

Set two independent spend caps to avoid surprise API bills:

1. **Google AI Studio account-level cap** — https://aistudio.google.com →
   account settings → **Billing** → set a monthly spend limit.
2. **In-app AI budget cap** — log in as admin → **Settings** → **AI Budget** →
   enable the monthly budget and set a dollar amount per org.
   (This is stored in the database per org, not an env var.)

> ⚠️ AI transcription is manual in this fork — an admin must click the AI button
> on the share page. It does NOT run automatically on upload. Set the budget cap
> before inviting other users.

---

## Step 9 — Smoke Test

Walk through these checks after the service is live:

1. Open `https://your-app.up.railway.app` — you should see the login screen.
2. Log in with `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`.
3. **Dashboard** loads cleanly with sidebar links.
4. **Import or record a short video** with audio.
5. Open the `/s/<videoId>` share link — video plays via presigned R2 URL.
6. Click **AI analysis** (admin-only button on the share page). Wait ~2 min.
   Summary, Transcript, Chapters, and Tasks tabs should populate.
7. **Cron check** (after Step 6):
   ```bash
   curl -I -H "Authorization: Bearer YOUR_CRON_SECRET" \
     https://your-app.up.railway.app/api/cron/recover-stale-ai-jobs
   ```
   Expect HTTP 200.

---

## Known Gotchas — Quick Reference

- **Railway auto-detects Railpack** for pnpm monorepos → switch Builder to
  Dockerfile (`/apps/web/Dockerfile`), clear the custom Start Command, and delete
  the auto-created browser-extension service.
- **`CAP_AWS_*` must be set explicitly** — the `CLOUDFLARE_R2_*` → `CAP_AWS_*`
  convenience mapping does not reach `process.env`; the Effect S3 client misses it
  → every storage operation 500s.
- **Build-time vars** (`NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_DOCKER_BUILD=true`)
  must be in Railway Variables **before the first build**, not after.
- **MySQL region** — do NOT change it after the database is online; a volume move
  may leave the database unreachable.
- **Gate before every deploy** — run `pnpm typecheck` from the repo root (not
  `-F @cap/web` — that variant is a false-green no-op).
- **Cron workflow URL** — update `APP_URL` in `.github/workflows/recover-cron.yml`
  to your own Railway domain before the workflow runs.
- **`DATABASE_ENCRYPTION_KEY`** — never change after the first deploy. Changing it
  makes all stored credentials unreadable (the comment in `.env.example` confirms this).

---

## Optional Future Upgrade — CDN Delivery

Currently, media (videos, thumbnails) is served via **direct R2 presigned S3-endpoint
URLs**. Cloudflare's edge can intermittently 503 or hang when acting as a
pass-through to R2 at this URL form, and playback latency is higher for viewers
far from your R2 region.

For Loom-grade global delivery: attach a **Cloudflare custom domain** to the R2
bucket (R2 → bucket → Settings → Custom Domains), enable Cloudflare caching
in front of it, and add a small **Cloudflare Worker** for signed-token auth
(standard S3 presigned URLs do not work on custom domains — you need a Worker that
validates a short-lived token and proxies the request to R2). R2 egress via a
Cloudflare custom domain is **always free** regardless of bandwidth.

This is an enhancement for when the app has many users — it is not required for
initial deployment.
