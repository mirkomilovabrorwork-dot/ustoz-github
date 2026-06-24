# QA Smoke Gate — Ustoz / data365

**Verdict: PASS** (app healthy) — re-run 2026-06-24. The deployed app type-checks clean (REAL root gate), builds (Railway deployed the new build — verified live), and serves all core public routes. 515/561 unit tests pass; the 20 failures are PRE-EXISTING workflow/AI test debt (proven not from this session). Proceeding to Step 3.

## Build health
| Check | Command | Result |
|---|---|---|
| Typecheck (REAL gate) | `pnpm typecheck` (`next typegen && tsc -b`) | ✅ PASS (exit 0). NOTE: the `-F @cap/web` form the prior smoke trusted is a NO-OP false-green — ignore it. |
| Production build | Railway Docker build of `176f6e7` | ✅ PASS — deployed + serving live (zip-marker 384312 + `/login` heading "data365"). |
| Unit tests | `pnpm test:web` (vitest) | ⚠️ 515 passed / 26 skipped / **20 failed** in 4 files — PRE-EXISTING (see below). |
| Lint | `pnpm lint` (biome) | ⚠️ pre-existing formatting/style debt — Step-5 hardening item, not a functional bug. |

## Live smoke — public routes (Smoke=YES flows)
| # | Check | Status | Evidence |
|---|---|---|---|
| 1 | App root `/` | ✅ 307 → auth redirect | curl |
| 2 | `/login` renders | ✅ 200, "Sign in to data365" | curl |
| 3 | `/signup` renders | ✅ 200, "Sign up to data365" | curl |
| 4 | `/api/health` | ✅ 200 `{db:ok, storage:ok}` | curl |
| 6 | Unauthed `/dashboard/caps` | ✅ redirects to login (200, not 500) | curl -L |
| 11 | Share `/s/[id]` | ✅ 200 + video markup | curl |
| 12 | Embed `/embed/[id]` | ✅ 200 (SSR) | curl |
| — | `/365-extension.zip` | ✅ 200, 384312 B (new build) | curl |

Authed-screen interactions (login→dashboard→record→settings) are deferred to Step 3 (read-only) or marked Unverified where they'd mutate prod — see QA_PLAN coverage pre-flight.

## ⚠️ Pre-existing test debt — 20 failures / 4 files — NOT from this session
**Proof:** each file's tested source was last modified by a PRIOR commit (transcribe/generate-ai `29e58e1`, import-loom-video `94393f1`, video-processing initial, test files `0720d43`/`8aa843b`); my 2 commits (`961110a`, `176f6e7`) touch none of their logic, and no test asserts any string/value I changed.
- `integration/transcribe.test.ts` — "Async workflow failure" unhandled-rejection (a deliberate mock reject escaping the harness → test-env artifact).
- `unit/generate-ai-error-status.test.ts`, `unit/video-processing.test.ts`, `unit/loom-import.test.ts` — workflow tests needing fuller mocks/env.

Severity: **Medium** (test-suite/CI health). The LIVE app's transcribe / AI / import features work (verified earlier this session + archive). Recommend a dedicated pass to repair the test mocks. Carried to QA_REPORT.md; NOT a smoke blocker.

## Gate decision
App smoke **PASS** → proceed to Step 3. (Pre-existing test debt logged, not treated as a build-broken block.)
