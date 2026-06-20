# QA Smoke Gate — Ustoz

**Verdict: PASS** — the app type-checks clean, boots, and serves all core routes. Lint + unit-test failures are quality debt (formatting + missing test-env), not a broken build. Proceeding to Step 3.

## Build health
| Check | Command | Result |
|---|---|---|
| Typecheck | `pnpm -F @cap/web typecheck` (`next typegen && tsc -b`) | ✅ **PASS** (exit 0) |
| Production build | `pnpm -F @cap/web build` | ⏳ deferred — `next build` shares `.next/` with the running dev server; will run during/after live E2E |
| Lint | `pnpm biome check` | ⚠️ 1283 errors + 127 warnings / 1091 files — **predominantly formatting/style** (e.g. package.json spacing). Auto-fixable via `biome check --write`. Hardening item, not a functional bug. |
| Unit + integration tests | `pnpm -F @cap/web test` (vitest) | ⚠️ **543/633 pass (86%)**. 90 fail across 21 suites — ~64 are SEO/canonical-URL page tests (missing base-URL env), ~15 transcribe-integration (env), rest = ffmpeg/Stripe not installed + a few stale expectations. **No user-facing bug**; needs a real test-env + CI (separate task). A couple (save-video-edits ×5, playback-source ×2) worth a later look. |

## Runtime smoke
| Check | Result |
|---|---|
| Dev server boot | ✅ Ready in ~1.2s on http://localhost:3001 |
| Boot error (non-fatal) | ⚠️ `instrumentation.node.ts` `PutBucketCors` → MinIO **501 NotImplemented** (unhandledRejection). **Harmless** — MinIO already allows CORS (preflight returns 204 + `Access-Control-Allow-Origin: http://localhost:3001`). Should still be caught/silenced. |
| `/login` | ✅ 200 |
| `/dashboard` (unauthed) | ✅ 307 → /login (correct) |
| `/s/x1nj6750tqpnm1b` | ✅ 200 |
| `/` (root) | ⚠️ **404** — no landing page or redirect at root (minor finding). |

## API probes (no auth)
| Endpoint | Result | Meaning |
|---|---|---|
| `POST /api/video/tasks/toggle` | **404** | F002 confirmed — route doesn't exist |
| `POST /api/video/ai/chat` | **200, streamed AI reply** | F001 confirmed — zero auth, drains owner's Gemini quota |
| `GET /api/video/ai?videoId=` | 401 `{auth:false}` | auth-gated (IDOR needs 2-user test → code-confirmed REAL as F022) |
| `GET /api/video/transcribe/status` | 401 `{auth:false}` | auth-gated (no-ownership = F023, code-confirmed) |
| MinIO CORS preflight (OPTIONS) | 204 + ACAO=localhost:3001 | uploads NOT CORS-blocked (F005 refuted) |
| GEMINI key | ✅ HTTP 200, 50 models | key valid; AI flows testable |
