# ROADMAP — remaining work

Last updated: 2026-06-22. Single source of truth for what's left. Status:
✅ done+verified · 🟢 code-done, needs live confirm · 🟠 needs OWNER step · 🔵 I can do (autonomous) · 🟣 big feature (own project).

The teacher's original code requirements are met (see `docs/TEACHER_REQUIREMENTS.md`).
What follows is what stands between "now" and a fully polished, Loom-grade product.

---

## A. OWNER-ONLY (cannot be automated — needs you) 🟠

| # | Item | What it does / why | Steps |
|---|------|--------------------|-------|
| A1 | **Deploy the CDN Worker** | Serves video from Cloudflare edge: fast worldwide, reliable, free egress (today: direct R2, sometimes 503/slow). Biggest reliability win. | In `cloudflare-worker/`: set bucket name in `wrangler.toml` → `wrangler login` → `wrangler secret put SIGNING_SECRET` → `wrangler deploy`. Then ping me to wire `/api/playlist` to the Worker. |
| A2 | **Add `CRON_SECRET` GitHub secret** | Activates the cron that auto-recovers videos stuck mid-AI-processing. | GitHub repo → Settings → Secrets and variables → Actions → New secret `CRON_SECRET` (value in `docs/DEPLOY_SECRETS.md`). Also update `APP_URL` in `.github/workflows/recover-cron.yml`. |
| A3 | **Live Google Meet "Record now" test** | Confirms meeting-recording works end-to-end (code-fixed, instruction path proven; Meet path unverified). | Reload the unpacked extension (for the mic fix), join a Meet, click "Record now", confirm it saves. |
| A4 | **Live import-upload + in-app record test** | Confirms file upload (1.2) and browser screen-record (1.3) with a real file/screen/mic (headless can't grant these). | In your Chrome: import a file; record in browser; confirm both save + play. |
| A5 | **Pop-up sound / UI subjective polish** | Make the Meet pop-up chime + look pleasant (subjective). | Listen/look together in a Chrome session; tune. |
| A6 | **Chrome Web Store publish** (later) | 1-click "Add to Chrome" (today: load-unpacked). | $5 Google dev account + ~1–3 day review. I'll prep the package/listing when you say go. |
| A7 | **Decide: pinned share-page video?** | I removed the sticky/pinned player because it OVERLAPPED the chapters/summary (unreadable). Player is now a normal large focal video. If you want Loom-style pinned-video-beside-scrolling-transcript, that's a layout project (see B4). | Tell me: keep current (clean) OR build the proper pinned layout. |

## B. I CAN DO — autonomous, safe 🔵

| # | Item | What it does | Size |
|---|------|--------------|------|
| B1 | ~~Reaction emoji row even out~~ | ✅ DONE (`8c71cb4`) — grid-cols-6, single clean row. | — |
| B2 | **Animated hover-preview** | Loom shows a moving preview when you hover a video; our `VideoPreviewGif` is stubbed (returns null) though a preview gif IS generated. Re-enable IF safe. | Small-med (investigate first) |
| B3 | **Social share buttons** | One-click share to LinkedIn/Twitter/Gmail from the share modal (lower value for a teacher use-case). | Small-med |
| B4 | **Proper pinned video + transcript layout** | Loom-style: video stays pinned beside a scrolling transcript; click a line to seek while watching. Replaces the removed sticky (A7). | Medium layout project |

## C. LOOM BIG FEATURES — own project each 🟣

| # | Item | What it does |
|---|------|--------------|
| C1 | **Transcript-based editing** | Delete a word/sentence in the transcript → it's cut from the video. |
| C2 | **Remove filler words / silences** | AI auto-removes "um/uh" and dead-air for a polished cut. |
| C3 | **Recorder enhancements** | Backgrounds, draw tool, blur tool, mouse-click highlight, canvas mode. |
| C4 | **Deeper viewer insights** | Who watched, % watched, engagement graph (today: basic view count). |

## D. DONE THIS SESSION (2026-06-22) ✅
- Branding Cap→365 · committed `DEPLOY.md` + `.env.example` (clean re-deploy on fresh accounts) · CDN Worker code (`cloudflare-worker/`, owner-deploy) · player thumbnail **poster** (instant-play) · **copy-link** on record finish · share-page **sticky-overlap fix** · viewer **Download** button · reaction emoji row even-out. All ROOT-typecheck green; share/embed/dashboard live-verified.

---

### Recommended order
1. **A1 CDN** (you deploy → I wire) — biggest real impact, only your 1 step.
2. **B2/B3/B4** — I do autonomously.
3. **A3/A4** live tests — you, in Chrome.
4. **C1–C4** — pick one to build as a project.
