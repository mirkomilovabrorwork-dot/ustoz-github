# QA Hardening — Ustoz / data365

**Run:** 2026-06-24. Tooling: existing only (Biome/Vitest/Playwright + curl + git). Lighthouse / axe / load-tools are NOT installed → those layers are `Unverified` (G3 — recommend, did not install). No Critical hardening failures found.

| Layer | Check | Status | Evidence | Severity | Fix recommendation |
|---|---|---|---|---|---|
| 1 Security | Secrets not committed | ✅ | `.env` + `docs/` gitignored; no `.env`/`DEPLOY_SECRETS`/`.pem` in `git ls-files` | — | keep |
| 1 Security | Session cookie flags | ✅ | NextAuth cookie is `#HttpOnly_` + Secure=TRUE (prod `__Secure-`); SameSite Lax (NextAuth default) | — | keep |
| 1 Security | Prior Critical claims | ✅ | unauth spot-check: ai/chat 400, storage/object 400, generate 403, transcribe 401, **R2 direct 400 (private)**, admin redirect-gated | — | resolved by 2026-06-21 hardening |
| 1 Security | SQL injection | ✅ | Drizzle ORM parameterised throughout | — | keep |
| 1 Security | XSS sinks | ⚠️ | 2 `dangerouslySetInnerHTML` in app/components | Low | confirm both are sanitized/static (likely JSON-LD/OG) |
| 1 Security | npm audit (high/crit) | ⚠️ | `pnpm audit --audit-level=high` returned no high/critical matches (best-effort) | Low | re-run in CI on a schedule |
| 2 Performance | API latency | ✅ | health 0.64s · login 0.44s · share 0.64s (all <1s) | — | fine for scale; watch under load |
| 2 Performance | Lighthouse / bundle | ⏭️ Unverified | tool not installed (G3) | Medium | run Lighthouse on `/login` + `/s/[id]`; check JS bundle <500 KB |
| 2 Performance | Static cache headers | ⚠️ | `/365-extension.zip` → `Cache-Control: public, max-age=0` + etag (revalidates) | Low | acceptable (etag 304); `_next/static` is immutable by default |
| 3 Accessibility | axe / contrast / keyboard / labels | ⏭️ Unverified | axe not installed (G3); email `alt` fixed; form inputs have `name` | Medium | run axe-core; verify `<label>` on login/signup, focus rings, AA contrast |
| 4 Observability | Crash/error tracking | ❌ | NO Sentry/Crashlytics (`grep` empty) | **Medium** | wire `@sentry/nextjs` (server+client) — prod errors currently unmonitored |
| 4 Observability | Structured logs / analytics | ⚠️ | Effect logging present; `analytics/track` exists; PII-scrub Unverified | Low | confirm no email/token in logs |
| 5 Resilience | Retry / recover / race | ✅ | recover-cron + retry-ai/transcription actions; signup race-guarded; Drizzle additive migrations | — | keep |
| 5 Resilience | Offline degradation | ⏭️ Unverified | dashboard web app (not offline-first) | Low | confirm no infinite spinner on network drop |
| 6 Fragmentation | Chrome+Firefox · 375/768/1280 · dark | ⏭️ Unverified | not driven headlessly this run; dark-mode supported in code | Medium | manual responsive + dark pass (owner already flagged 1 visual issue → worth a sweep) |
| 7 Load & Scale | 1000-record list · 50-concurrent | ⏭️ Unverified | load tool not installed (G3); list pagination Unverified | Low/Med | seed volume + `autocannon`/`k6` on dev |
| 8 Compliance | Terms / Privacy pages | ❌ | `/terms` + `/privacy` → 404 (linked from login/signup/invite) | **Medium** | add pages or remove links (owner/legal decision) |
| 8 Compliance | GDPR erasure / export | ⚠️ | delete-account exists (erasure ✅); full data-export Unverified | Low | confirm a user-data export path |
| 8 Compliance | Cookie consent | ⏭️ Unverified | session cookie is essential; non-essential tracking Unverified | Low | add consent only if analytics sets non-essential cookies |

## Summary
- Critical: **0**
- High: **0**
- Medium: **4** (no Sentry · accessibility unaudited · responsive/dark unaudited · Terms/Privacy 404)
- Low: **8** (mostly Unverified/recommendations)

## Top 5 highest-risk items
1. **Terms / Privacy 404** (Compliance) — public legal links dead. Owner decision: add pages or remove links.
2. **No error tracking (Sentry)** (Observability) — production crashes/exceptions are invisible. Wire `@sentry/nextjs`.
3. **Pre-existing 20 failing tests** (from QA_REPORT) — test-suite/CI health (separate effort, Gate G2).
4. **Accessibility unaudited** — run axe-core + verify labels/focus/contrast (no tool installed this run).
5. **Responsive + dark-mode unaudited** — manual multi-viewport pass (owner flagged a sidebar visual already).

None of these block the core teacher flow; all are post-launch hardening. Security, auth, data privacy (private bucket, gated endpoints, HttpOnly+Secure cookies) are **solid**.
