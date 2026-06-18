# Cap V2 — Operations Reference

Production URL: `https://web-production-e6fe4.up.railway.app`

---

## 1. Architecture Overview

| Layer | Technology |
|-------|-----------|
| App server | Next.js (standalone mode) on Railway |
| Database | MySQL via Railway plugin (auto-provisioned) |
| File storage | Cloudflare R2 (bucket: `loom-alternative`, account `936c337eec6d96c9f6f3b4c57a9a8044`) |
| AI transcription | Gemini 2.5 Flash Lite |
| Email | Disabled (no-op — no SMTP configured) |

No Stripe, PostHog, WorkOS, or Resend in this deployment.

---

## 2. Access

### Railway dashboard
- Web UI: https://railway.app → project `cap-v2`
- Account: `data365.services@gmail.com`

### Railway CLI
```bash
export PATH="/Users/bunyod365/.railway/bin:$PATH"
railway login          # authenticate
railway status         # confirm linked project / environment
railway environment    # list environments
```

Link the CLI to the project if needed:
```bash
railway link           # follow prompts to select cap-v2
```

### Admin panel
- URL: `https://web-production-e6fe4.up.railway.app/dashboard/admin/access`
- Default admin: `admin@data365.co`
- **Change the password immediately after first login.**

---

## 3. Environment Variables

Full reference: `RAILWAY_ENV.md` in this repo.

Critical variables that must be set before the first deploy:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Auto-injected by Railway MySQL plugin |
| `NEXTAUTH_SECRET` | Session signing (`openssl rand -base64 32`) |
| `NEXTAUTH_URL` | Public app URL (must match Railway domain) |
| `NEXT_PUBLIC_WEB_URL` | Build-time baked — set before first build |
| `DATABASE_ENCRYPTION_KEY` | Encrypts stored credentials (`openssl rand -hex 32`) |
| `CAP_AWS_BUCKET` | R2 bucket name |
| `CAP_AWS_ACCESS_KEY` / `CAP_AWS_SECRET_KEY` | R2 API token credentials |
| `S3_PUBLIC_ENDPOINT` | R2 public endpoint URL |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini AI for transcription |
| `INITIAL_ADMIN_EMAIL` | Used by seed script on first run |
| `INITIAL_ADMIN_PASSWORD` | Used by seed script on first run |

To view or edit variables: Railway dashboard → cap-v2 → web service → Variables tab.

---

## 4. Common Operations

### Deploy
From the project root (any branch):
```bash
railway up
```

### View logs
```bash
railway logs           # tail live logs
railway logs --tail 200
```

### Run database migrations
```bash
railway run pnpm db:push
```

This applies schema changes from `packages/database/prisma/schema.prisma` to the Railway MySQL instance.

### Seed admin user
Run once on a fresh database, or to restore a deleted admin:
```bash
railway run pnpm seed:admin
```
Reads `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from Railway environment.

### Health check
```bash
curl https://web-production-e6fe4.up.railway.app/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

### Restart the service
Redeploy the current image without a new build:
```bash
railway up             # triggers a fresh deploy from current source
```
Or use Railway dashboard → Deployments → Redeploy.

---

## 5. User Management

All user management is done through the admin panel at `/dashboard/admin/access`.

**Creating users**
1. Log in as `admin@data365.co`.
2. Navigate to Admin → Access.
3. Use "Invite User" to send an invite link (email is disabled — copy the link manually and send it out-of-band).

**Generating invite links**
Invite links are generated in the admin panel. Since email is disabled, copy the invite URL from the UI and share it directly with the user.

**Resetting passwords**
Passwords can be reset from the admin panel user list. Alternatively, the user can use the "Forgot password" flow — but note that password-reset emails are also disabled, so a manual reset via admin is required.

**Toggling admin status**
In the admin panel user list, use the role toggle next to any user to grant or revoke admin privileges.

---

## 6. Backups

### MySQL (Railway plugin)
- **Automatic:** Railway Pro/Teams plans include daily automatic backups. Verify in Railway dashboard → Plugins → MySQL → Backups.
- **Manual dump:**
  ```bash
  railway run mysqldump --no-tablespaces -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" \
    -h "$MYSQL_HOST" "$MYSQL_DATABASE" > backup-$(date +%Y%m%d).sql
  ```
  Or connect with the `DATABASE_URL` directly:
  ```bash
  railway run bash -c 'mysqldump "$DATABASE_URL" > backup.sql'
  ```

### Cloudflare R2 (file storage)
Enable bucket versioning in the Cloudflare dashboard to protect against accidental deletes:
1. Cloudflare dashboard → R2 → `loom-alternative` → Settings → Versioning → Enable.

For a full object export use `rclone` or the Cloudflare R2 API.

---

## 7. Monitoring

### Health endpoint
```bash
curl https://web-production-e6fe4.up.railway.app/api/health
```
Returns `{"status":"ok","timestamp":"<ISO-8601>"}`. A non-200 or missing `status:ok` indicates the app is down.

### Railway metrics
Railway dashboard → cap-v2 → web service → Metrics tab shows:
- CPU usage
- Memory usage
- Network in/out
- Request count

### Deployment logs
Railway dashboard → cap-v2 → web service → Deployments → select a deployment → View logs.

Or via CLI:
```bash
railway logs
```

---

## 8. Troubleshooting

### App returns 502 / not responding
1. Check Railway logs: `railway logs`
2. Look for startup errors (missing env vars, DB connection failure).
3. Redeploy: `railway up`

### Database connection errors
- Verify `DATABASE_URL` is set and the Railway MySQL plugin is running:
  Railway dashboard → Plugins → MySQL → ensure status is "Running".
- `DATABASE_URL` is auto-injected; if it is missing, remove and re-add the MySQL plugin.

### R2 / file upload errors
- Check `CAP_AWS_BUCKET`, `CAP_AWS_ACCESS_KEY`, `CAP_AWS_SECRET_KEY`, `S3_PUBLIC_ENDPOINT`, and `S3_PATH_STYLE=true` are all set in Railway Variables.
- Confirm the R2 API token has "Object Read & Write" permissions on the bucket.
- Verify `S3_PATH_STYLE` is `true` (required for non-AWS S3-compatible providers).

### Transcription not working
- Verify `GOOGLE_GENERATIVE_AI_API_KEY` is set and the Gemini API is enabled for the project in Google Cloud Console.
- Check Railway logs for `generativeai` or `gemini` errors.

### Cannot log in as admin
- Confirm the seed script ran: `railway run pnpm seed:admin`
- Confirm `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` match what you are entering.
- `NEXTAUTH_URL` must match the exact public URL (including protocol, no trailing slash).

---

## 9. Local Development

### Prerequisites
- Node.js 20+, pnpm, Docker

### Start local services (MySQL + MinIO)
```bash
docker compose up -d
```
This starts MySQL on port 3306 and MinIO on port 9000 (S3-compatible local storage).

### Run the dev server
```bash
pnpm dev --filter @cap/web
```
Or from the project root to run all packages:
```bash
pnpm dev
```

### Apply schema changes locally
```bash
pnpm db:push
```

### Seed local admin
```bash
pnpm seed:admin
```
Reads `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` from the local `.env` file.

### Environment setup
Copy and fill in the local env file:
```bash
cp .env.example .env   # if present, otherwise use scripts/env-cli.js
node scripts/env-cli.js
```
See `RAILWAY_ENV.md` for the full variable reference.
