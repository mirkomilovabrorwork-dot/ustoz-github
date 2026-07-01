# QA Plan — Ustoz (Cap fork) — RUN 4 (deploy 112c812, live Playwright)

> History: RUN 1 full pass · RUN 2 dark-mode/UI · RUN 3 core pipeline. RUN 4 (this) = live Playwright verification of deploy `112c812` (retry-AI / re-analyze button, in-recording camera toggle, extension pause, UI polish) + core flow regression, on the LIVE Railway build.

## Project
- **Name:** Ustoz (Cap V2 fork) — Loom-style recorder (record → R2 → share `/s/[videoId]` → AI transcript/summary/chapters).
- **Platform:** Web (Next.js 16.2.1, App Router, React 19) pnpm monorepo. Evidence: `package.json`, `pnpm-workspace.yaml`, `apps/web` next dep. Plus `apps/browser-extension` (Chrome MV3, NOT headless-testable). No `android/`.
- **Tooling THIS run:** Playwright chromium 1228 (installed at `~/AppData/Local/ms-playwright`) pointed at the LIVE Railway URL via `PLAYWRIGHT_BASE_URL`. Owner explicitly requested "full playwright" → gate G3 satisfied.
- **Target:** LIVE HEAD `112c812` — https://capweb-production-dd85.up.railway.app · admin@ustoz.uz / UstozAdmin2026!
- **Run / build / test commands:** dev `pnpm --filter @cap/web dev` (3001); build `next build`; unit `pnpm --filter @cap/web run test`; e2e `pnpm --filter @cap/web exec playwright test`; GATE ROOT `pnpm tsc -b`. Node PATH prefix `$env:Path="C:\Program Files\nodejs;"+$env:Path`.
- **Hardening tools detected:** biome ✅ · vitest + Playwright ✅ · CI `ci.yml`+`recover-cron.yml` ✅ · Sentry ❌ · Lighthouse ❌ · a11y ❌.

## Safety adaptation (live target)
Live per owner direction. NO test will trigger AI generation/spend (the re-analyze Confirm is opened then CANCELLED — the reprocess POST was already verified live returning started:true), send messages, mutate/delete data, or deploy. Read-only navigation + login + assertions only.

## Scope
Deploy `112c812` changes + core flow regression:
1. Owner "Qayta analiz" (re-analyze) button — visible ONLY to owner/admin on COMPLETE analysis; cost dialog opens on click.
2. LocaleSwitcher — real SVG flags (uz/eng/ru), not letters.
3. AI **bold** — dark-grey semibold, not link-blue.
4. Anonymous viewer — no generate/re-analyze; AI chat → sign-in.
5. Core: login, dashboard caps list, share page render, language switch, light/dark.
OWNER-PHYSICAL (Unverified): in-recording camera toggle, extension pause/resume, real recording upload, actual AI re-run result.

## Status
Step 0 ✅ · Step 1 ⏳ · Step 2 ⏳ · Step 3 ⏳ · Step 4 ⏳ · Step 5 ⏳

## The 6 steps
- Step 1 — Map flows + gaps → QA_FLOWS.md
- Step 2 — Smoke gate → QA_SMOKE.md
- Step 3 — Full QA execution → QA_REPORT.md
- Step 4 — Fix all failures, re-verify → updates QA_REPORT.md
- Step 5 — Production hardening → QA_HARDENING.md

## Non-disruptive rules
Headless only, no GUI windows. Screenshots ≤1800px, read via Read tool. Select by data-testid / aria-label / visible text. No payments/messages/AI-spend/destructive actions/deploys during QA.

## Hand-off contract
Each step reads this file first, does its work, writes its output file, updates Status. Files are source of truth.
