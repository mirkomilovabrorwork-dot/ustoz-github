# Ustoz (Cap fork) — Claude Code instructions

## Recovery handoff first

Before editing, read `RECOVERY_HANDOFF.md` in this folder and the central
`..\RECOVERY_HANDOFF.md`.

This folder is the preserved working copy after Windows reinstall. It contains
local work and uncommitted files. A cleaner Git baseline also exists at
`..\_deploy-baselines\ustoz-github-origin-main-e2d2aca`.

## Testing rule

A test MUST fail when the feature is broken. Never modify the app at runtime, weaken assertions, or add fake/always-pass scripts just to make a test green.

## E2E tests

- Framework: Playwright (Chromium, headless)
- Config: `apps/web/playwright.config.ts` — targets `http://localhost:3001`, reuses the running dev server
- Test files: `apps/web/e2e/`
- Run: `pnpm --filter @cap/web exec playwright test` (or `pnpm --filter @cap/web run test:e2e`)
- The dev server must already be running on port 3001 before executing tests

## Unit tests

- Framework: Vitest
- Run: `pnpm --filter @cap/web run test`

## Agent skills

### Issue tracker

Issues and PRDs live in this repo's GitHub Issues (`mirkomilovabrorwork-dot/ustoz-github`), managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical triage roles use their default label strings (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root (created lazily by `/grill-with-docs`). See `docs/agents/domain.md`.

## Codex handoff - 2026-06-27

Deployed on branch `qa-fixes`:
- `2d0969f` - mobile UX/share theming polish.
- `1977637` - share dark-mode details and extension banner spacing polish.

Verified after deploy:
- `/api/health` stayed 200 with `db=ok` and `storage=ok`.
- Local production build passed with `next build --turbopack`.
- Live admin smoke on mobile dark/light covered dashboard caps, spaces, admin access, org members/permissions/activity, and share page.
- Share page dark mode works when the app `theme=dark` cookie is present; screenshot-verified `/s/2t4a58an7acz3bb`.
- AI endpoints for live dashboard videos `2t4a58an7acz3bb` and `e1n1p41tp308pas` returned 200. `POST /api/videos/:id/generate` returned `alreadyRunning:true`, not 501.
- Browser recorder dialog opens live on mobile dark and "Start recording" is enabled. Headless Chrome cannot complete the real screen-share picker/record-stop-upload path.

Notes for next agent:
- The user reported a transient 501 for AI analysis and meeting record. Current code search found no app-owned `status: 501`; likely transient platform/upstream/browser layer unless a fresh repro shows the exact endpoint.
- One live run saw flaky console noise: React minified #310 once, then it did not reproduce on the immediate re-run. Do not call it fixed without a deterministic repro.
- Persistent known console issue: `/terms?_rsc=...` returns 404 from auth/footer navigation. This is pre-existing legal-page content debt, not related to AI/recording.
- Recorder dialog still shows the old "Cap" wordmark in the modal; owner previously descoped it as not a blocker.
- Do not stage unrelated QA docs/untracked files unless the user explicitly asks. Codex only committed the scoped UI files above.
