# QA Plan — data365 (cap fork) — RUN 3 (CORE VIDEO PIPELINE focus)

> History: RUN 1 = full pass (production-ready). RUN 2 = dark-mode/UI (complete, 0 new Crit/High/Med). RUN 3 (this) = the record→play→transcript→AI→share pipeline, triggered because the owner kept hitting one pipeline bug after another and wants ALL breaks found + fixed in ONE sweep (stop the whack-a-mole).

## Project
- **Name:** data365 (self-hosted cap fork) — Loom-style recorder (record → R2/S3 → share `/s/[videoId]` → AI transcript/summary/chapters).
- **Platform:** Web monorepo (pnpm workspace), NOT Android. Evidence: root `package.json` + `pnpm-workspace.yaml`; `apps/web` = **Next.js 16.2.1** (App Router, React 19); `apps/browser-extension` = Chrome MV3; no `android/`. Live on Railway → https://capweb-production-dd85.up.railway.app (branch `qa-fixes`, auto-deploy). Effect/Drizzle + MySQL 8 + Cloudflare R2.
- **Tooling THIS run:** evidence = Railway logs + HTTP + code (the pipeline is mostly auth-gated / owner-physical, so headless UI driving is low-yield):
  - **Railway production logs** `railway logs --service @cap/web` (RAILWAY_TOKEN set this session) — PRIMARY evidence for upload/transcribe/AI. Already proven invaluable (pinned the transcription bug exactly).
  - **HTTP probes** (curl) for public surfaces: `/s/` viewer, `/api/playlist` (source resolution + file sizes), `/api/health`.
  - **Code review** for paths not drivable headlessly.
  - Chrome/Preview MCP + Playwright (`test:e2e`) exist (G3 clear) but not required for this read-mostly pass.
- **Run / build / test commands:** dev `pnpm dev:web` → http://localhost:3001 (root `.env` → LIVE MySQL); build `pnpm build:web`; **GATE (typecheck)** `pnpm --dir apps/web exec next typegen && pnpm tsc -b` (ROOT; the `-F @cap/web` variant is a no-op false-green); unit `pnpm test:web` (vitest, ~20 pre-existing mock failures = test-debt, not app bugs); lint `pnpm exec biome lint`. Node not on PATH → `$env:Path = "C:\Program Files\nodejs;" + $env:Path`. BOM-check changed files.
- **Hardening tools detected:** biome ✅ · vitest + Playwright ✅ · CI `ci.yml`+`recover-cron.yml` ✅ · Sentry ❌ (no SDK) · Lighthouse ❌ · a11y ❌ · `pnpm audit` available · bundle analyser ❌.

## Scope (focused)
> record (Meet/extension · browser-extension · in-app) → upload → trim → play → transcript → AI summary / action-items / chapters → share / viewer
Regression-check the 3 fixes shipped this session: extension short-recording empty-video (dfc6ef8, ext **v0.1.1**) · Stripe priceId + Discord relay guard (c73eef0/09231e8) · transcription raw-upload fallback (ddc6b95). Known still-open: **C1** = AI summary/analysis not auto-triggered after transcription ("Start AI analysis" / "hasn't been run yet").

## Coverage pre-flight (honest, set BEFORE the run)
- **CAN verify (evidence available):** upload→storage-key resolution, transcription pipeline (logs), AI-analysis trigger/state, `/api/playlist` source + raw-upload fallback, trim endpoint, share/viewer playback, the 3 regressions — via Railway logs + HTTP + code.
- **OWNER-PHYSICAL → `Unverified — needs owner action`:** the 3 RECORDING methods (owner's real browser + live Google Meet + loaded extension). I give exact click-steps and verify the RESULT (uploaded file + logs) after the owner records.
- **Auth-gated dashboard UI:** verified via code + logs + public viewer, not forged login.
- **NO real side effects during QA:** no payments, no real emails/messages, no prod DB writes, **no deploys/`git push`** — fixes are batched, gated locally, deployed only with owner approval after the sweep.

## Status
Step 0 ✅ · Step 1 ✅ · Step 2 ✅ · Step 3 ✅ · Step 4 ✅ (4 fixes shipped `cba69a0`: C1 budget, C3, S-07, C8; C4+C5/C7 deferred per owner) · Step 5 ⏳ (hardening — pending)

## The 6 steps
- Step 1 — Map flows + gaps → QA_FLOWS.md
- Step 2 — Smoke gate → QA_SMOKE.md
- Step 3 — Full QA execution → QA_REPORT.md
- Step 4 — Fix all failures, re-verify → updates QA_REPORT.md
- Step 5 — Production hardening → QA_HARDENING.md

## Non-disruptive rules
- Headless / logs / HTTP only — no GUI windows on the owner's desktop. Screenshots ≤1800px, read via Read tool. Web: select by data-testid / aria-label / visible text. Test/sandbox data only; no real payments/messages/destructive actions; no silent production deploys during QA.

## Hand-off contract
Each step: (1) read this file + confirm next step; (2) do the work; (3) write its output file; (4) update Status above. Files are the source of truth — not chat.
