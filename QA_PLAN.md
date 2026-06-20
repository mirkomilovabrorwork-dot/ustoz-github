# QA Plan — Ustoz (self-hosted Cap fork)

## Project
- **Name:** Ustoz — a self-hosted fork of **Cap** (open-source Loom alternative). Record screen in browser/extension → upload to S3-compatible storage → public share link `/s/[videoId]` streamable in browser → AI transcript / summary / chapters / chat.
- **Platform:** Web app (Next.js 16.2.1 / React 19.2.4, App Router) in a pnpm/turbo monorepo, Drizzle ORM + MySQL 8, S3 via MinIO. Plus a **Chrome MV3 extension** (`apps/browser-extension`, manifest_version 3). _Evidence: `package.json`, `apps/web/`, `apps/browser-extension/manifest.json`._
- **Tooling:** E2E = Claude Preview MCP (headless) → Chrome MCP fallback. Unit = **Vitest** (66 unit test files in `apps/web/__tests__/`). Select by `data-testid`/`aria-label`/visible text only.
- **Run / build / test commands (verified):**
  - dev: `pnpm --filter @cap/web run dev` (port **3001**; root `pnpm dev` is broken on Windows — bash `trap`)
  - build: `pnpm -F @cap/web build` (`next build --turbopack`)
  - typecheck: `pnpm -F @cap/web typecheck` (→ root `next typegen && tsc -b`) — **PASSED, exit 0 this session**
  - lint: `pnpm biome check`
  - test: `pnpm -F @cap/web test` (`vitest run`)
  - Node not on PATH → prepend `C:\Program Files\nodejs`; pnpm at `%APPDATA%\npm`.
- **Infra:** `docker compose -f packages/local-docker/docker-compose.yml up -d` → MySQL 8 (:3306, db `planetscale`) + MinIO (:9000, bucket `capso`). Both **up**.
- **Hardening tools detected:** Biome ✅ · Vitest 66 tests ✅ · pnpm audit available · **CI ❌ · Sentry ❌ · Playwright ❌ · Lighthouse ❌ · a11y(axe/pa11y) ❌**. Smell: `next.config.mjs typescript.ignoreBuildErrors: true` ⚠️ (type errors silently swallowed during build).

## Auth (for headless E2E)
- **next-auth v4** Credentials provider (email/password) — enabled. Seeded admin: **admin@ustoz.uz / ustoz1234**.
- Headless login: `GET /api/auth/csrf` → `POST /api/auth/callback/credentials` (email, password, csrfToken) → capture `next-auth.session-token` cookie → send on all requests.
- No dev bypass flag (no SKIP_AUTH/MOCK_AUTH) — the seeded admin IS the bypass.
- `GEMINI_API_KEY` added to `.env` this session (format `AQ.…` is unusual — pending live validation).

## Coverage pre-flight (set expectations)
- **CAN test headlessly:** login, dashboard, share/watch page, AI endpoints (auth/IDOR/404 checks), upload-pipeline API, most product-logic gaps (static + API).
- **MAY be limited / `Unverified`:** in-browser **screen capture** via `getDisplayMedia` (needs a real screen + permission; headless requires fake-media flags) → if undrivable, mark record-capture `Unverified — needs real browser/manual`; the **upload** half can still be tested via file upload / extension path. AI flows that need a working Gemini key are `Unverified` until the key validates.

## Status
Step 0 ✅ · Step 1 ✅ · Step 2 ✅ (smoke PASS; prod build deferred) · Step 3 🔄 (verify done: 26/34 REAL; live browser + deep-sweep running) · Step 4 ⏳ · Step 5 ⏳

## The 6 steps
- Step 1 — Map flows + gaps → `QA_FLOWS.md` (done via 5 parallel area agents)
- Step 2 — Smoke gate → `QA_SMOKE.md`
- Step 3 — Full QA execution → `QA_REPORT.md` (headline deliverable)
- Step 4 — Fix all failures, re-verify → updates `QA_REPORT.md`
- Step 5 — Production hardening → `QA_HARDENING.md`

## QA execution method (ultracode)
1. **Consolidate** 5 area maps → `QA_FLOWS.md` + `docs/qa/findings.md` (deduped candidate-bug queue).
2. **Adversarially verify** every candidate against real code (Sonnet fan-out workflow) → confirmed bug list.
3. **Live E2E** the core flows via headless browser (login → dashboard → record/upload → share/watch → AI) with real evidence (screenshots, console, network).
4. **Fix** confirmed bugs (parallel by file ownership, one writer per file), run gates.
5. **Harden** (8-layer) → `QA_HARDENING.md`.

## Non-disruptive rules
- Headless / background only — no GUI windows on the user's desktop.
- Screenshots ≤ 1800 px height; read via Read tool only.
- Select by data-testid / aria-label / visible text — never pixel coordinates.
- Test/sandbox data only. No real payments, no real emails, no production deploys, no `git push`.

## Hand-off contract
Each step: (1) read this file first and confirm it is the next step; (2) do its work; (3) write its output file; (4) update the Status line above. Files are the source of truth — not chat.
