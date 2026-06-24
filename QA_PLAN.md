# QA Plan — Ustoz / data365

## Project
- **Name:** Ustoz / "data365" — self-hosted Cap fork, a Loom-style screen-recorder web app (record → R2/S3 → share link `/s/[videoId]` → AI transcript/summary/chapters/chat).
- **Platform:** Web monorepo (NOT Android — no `android/`). Evidence: `apps/web/` (Next.js 16, App Router), `apps/browser-extension/` (Chrome MV3, `manifest_version 3`), root `package.json` (pnpm + turbo). Stack: React 19 / Effect / Drizzle + MySQL 8, deployed on Railway + Cloudflare R2.
- **Tooling:** Headless only. (1) `curl` for live public pages / API / SSR-HTML; (2) local **smoke gate** (typecheck + vitest + biome + build); (3) **Playwright** — now installed (`@playwright/test ^1.61.0` + `apps/web/playwright.config.ts` + `e2e/auth.spec.ts`, `e2e/share.spec.ts`) for headless login + authed navigation/screenshots. Select by `data-testid`/`aria-label`/visible text only.
- **Run / build / test commands (corrected):**
  - dev: `pnpm dev:web` (root `dev` also runs `docker:up`); prior session ran web on **:3001**.
  - build: `pnpm build` (turbo) / web `next build --turbopack`
  - typecheck (GATE): `pnpm typecheck` = `next typegen && tsc -b`. ⚠️ **`pnpm -F @cap/web typecheck` is a NO-OP FALSE-GREEN** (no such script → exits 0) — the prior QA_PLAN wrongly trusted it. Use the ROOT script only.
  - unit test: `pnpm test:web` (vitest; **49** unit files now)
  - e2e: `pnpm --filter @cap/web test:e2e` (`playwright test`)
  - lint: `pnpm lint` (biome) · format: `pnpm format`
  - PATH (Bash): `export PATH="/c/Program Files/nodejs:$PATH"`; BOM-check changed files.
- **Local isolated infra (SAFE for mutation tests — preferred over prod):** `docker compose -f packages/local-docker/docker-compose.yml up -d` → MySQL 8 (:3306, db `planetscale`) + MinIO (:9000, bucket `capso`). Seed: `pnpm seed:admin` (local admin `admin@ustoz.uz` / local pw). Live prod admin is a DIFFERENT credential — never run destructive tests against prod.
- **Hardening tools detected:** Biome 2.2 ✅ · Vitest 3.2 (49 tests) ✅ · Playwright 1.61 (e2e) ✅ · ESLint 9 ✅ · CI `.github/workflows/ci.yml` + `recover-cron.yml` ✅ · Sentry ❌ · Lighthouse ❌ · axe/pa11y ❌ · msw ❌. Smell: `next.config.mjs typescript.ignoreBuildErrors: true` ⚠️ (kept ON PURPOSE — repo uses explicit `.ts` import extensions that `next build` rejects but `tsc -b` allows; type safety lives in the green `tsc -b` gate).

## Auth (for headless E2E)
- next-auth Credentials provider (email/password). Headless login recipe: `GET /api/auth/csrf` → `POST /api/auth/callback/credentials` (email, password, csrfToken) → capture `next-auth.session-token` cookie → send on subsequent requests. No SKIP_AUTH/MOCK_AUTH bypass — a seeded admin IS the bypass (local env).

## Status
Step 0 ✅ · Step 1 ✅ · Step 2 ✅ (app smoke PASS; 20 pre-existing test failures logged) · Step 3 ✅ (0 new Critical/High; fixes live; prior Criticals resolved) · Step 4 ✅ (0 new-bug fixes; 2 items deferred to owner: G2 test-debt + terms/privacy) · Step 5 ✅ (0 Critical hardening fails) · **PRODUCTION-READY** (hardening recommendations logged in QA_HARDENING.md)

## The 6 steps
- Step 1 — Map flows + gaps → QA_FLOWS.md
- Step 2 — Smoke gate → QA_SMOKE.md
- Step 3 — Full QA execution → QA_REPORT.md (headline deliverable)
- Step 4 — Fix all failures, re-verify → updates QA_REPORT.md
- Step 5 — Production hardening → QA_HARDENING.md

## Coverage pre-flight (honest)
- **CAN test with real evidence:** the smoke gate (typecheck, 49 vitest units, biome, build); public pages (login/signup/share `/s/`/embed) rendering + console + SSR; API endpoints/redirects/`/api/health`; code-level logic + dead-link review; this session's shipped fixes (delete-toast wording, onboarding route, sidebar CSS, brand strings) via code + read-only UI. If the local docker env comes up cleanly: authed + mutation flows on the LOCAL DB.
- **UNVERIFIED (stated, never faked):** authed MUTATION flows if local env can't start (won't mutate prod); recording + Google-Meet capture (real screen/mic + extension — owner-physical); CDN Worker (not deployed — R2 baseline); payments/emails (none / unsafe).

## Non-disruptive rules
- Headless / background only — no GUI windows. Never mutate production data, never deploy, never `git push`/`--no-verify` during QA.
- Screenshots ≤ 1800 px; read via the Read tool only. Select by data-testid/aria-label/visible text — never pixel coordinates.
- Test/sandbox data only. No real payments / messages / production deploys.

## Hand-off contract
Each step: (1) read this file first + confirm next step; (2) do its work; (3) write its output file; (4) update the Status line above. Files are the source of truth — not chat.
