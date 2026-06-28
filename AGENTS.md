# Ustoz (Cap fork) — Codex instructions

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
