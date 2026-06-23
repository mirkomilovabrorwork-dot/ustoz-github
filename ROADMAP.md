# ROADMAP — what's genuinely left

Last updated: 2026-06-23. **GIT LOG is the source of truth for what's done — this doc can lag.**
Only items NOT yet shipped are listed. Done/skipped work lives in git history + `docs/STATE_ARCHIVE_*.md`.
Status: 🟠 needs OWNER step · 🟣 big feature (own project).

The teacher's original code requirements are met (`docs/TEACHER_REQUIREMENTS.md`).
**Section B (autonomous polish) is fully done** — nothing left for me to do there.

---

## A. OWNER-ONLY — needs you (can't be automated) 🟠

| # | Item | What it does / why | Steps |
|---|------|--------------------|-------|
| A1 | **Deploy the CDN Worker** | Serves video from Cloudflare edge: fast worldwide, reliable, free egress (today: direct R2, sometimes 503/slow). Biggest reliability win. | In `cloudflare-worker/`: set bucket in `wrangler.toml` → `wrangler login` → `wrangler secret put SIGNING_SECRET` → `wrangler deploy`. Then ping me to wire `/api/playlist` to the Worker. |
| A2 | **Add `CRON_SECRET` GitHub secret** | Activates the cron that auto-recovers videos stuck mid-AI-processing. | GitHub repo → Settings → Secrets and variables → Actions → New secret `CRON_SECRET` (value in `docs/DEPLOY_SECRETS.md`). Also update `APP_URL` in `.github/workflows/recover-cron.yml`. |
| A3 | **Live Google Meet "Record now" test** | Confirms meeting-recording works end-to-end (code-fixed; Meet path unverified). | Reload the unpacked extension, join a Meet, click "Record now", confirm it saves. |
| A4 | **Live import-upload + in-app record test** | Confirms file upload + browser screen-record with a real file/screen/mic (headless can't grant these). | In your Chrome: import a file; record in browser; confirm both save + play. |
| A5 | **Pop-up sound / UI subjective polish** | Make the Meet pop-up chime + look pleasant (subjective). | Listen/look together in a Chrome session; tune. |
| A6 | **Chrome Web Store publish** (later) | 1-click "Add to Chrome" (today: load-unpacked). | $5 Google dev account + ~1–3 day review. I'll prep the package/listing when you say go. |

## C. LOOM BIG FEATURES — own project each 🟣

| # | Item | What it does |
|---|------|--------------|
| C1 | **Transcript-based editing** | Delete a word/sentence in the transcript → it's cut from the video. |
| C2 | **Remove filler words / silences** | AI auto-removes "um/uh" and dead-air for a polished cut. |
| C3 | **Recorder enhancements** | Backgrounds, draw tool, blur tool, mouse-click highlight, canvas mode. |
| C4 | **Deeper viewer insights** | Who watched, % watched, engagement graph (today: basic view count). |

---

### Recommended order
1. **A1 CDN** (you deploy → I wire) — biggest real impact, only your 1 step.
2. **A2 `CRON_SECRET`** — your 1 step, activates auto-recovery.
3. **A3/A4** live tests — you, in Chrome.
4. **C1–C4** — pick one to build as a project.
