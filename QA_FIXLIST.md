# QA Fix List — "fix everything" (2026-06-25, Codex full analysis)

Triaged from 2 independent Codex passes (security + correctness) + my QA. Each item is VERIFIED in code before fixing (Codex can false-positive). Status: ⬜ todo · 🔧 in progress · ✅ done+gated · 🚀 deployed · ❌ rejected (false positive).

## P0 — Security ship-blockers → 7/7 SHIPPED (c73eef0 + 09231e8, deploying)
- ✅🚀 **S1 Account-takeover** — `session.ts` `port` now numeric-validated (no token-leaking redirect). gate GREEN.
- ✅🚀 **S2 Folder/space IDOR** — folders add/remove/move verify folder AND space belong to caller org.
- ✅🚀 **S3 Org shared-video remove authz** — owner/admin remove any; member only videos they shared.
- ✅🚀 **S4 Anonymous AI spend** — AI chat requires auth; cost-guard enforces default cap (no fail-open).
- ✅🚀 **S5 Stripe priceId/quantity client-trusted** (`09231e8`) — VERIFIED not exploitable as configured (Stripe key absent + paywall removed: `userIsPro→true`, UpgradeModal `null`, no `/pricing`, `IS_CAP` warned-off → every authed subscribe 400s). Hardened anyway (defense-in-depth for future re-enable): web + desktop `/subscribe` reject any priceId not in `STRIPE_PLAN_IDS` allowlist (new `isValidStripePriceId` in `plans.ts`); web route clamps `quantity` to a positive int ≤1000. gate GREEN, vitest 15/15.
- ✅🚀 **S6 Upload key path-traversal** — `utils.ts` rejects `..`/leading-slash/backslash/reserved (+type-fix). vitest 20/20.
- ✅🚀 **S7 Desktop logs→Discord unauth relay** (`09231e8`) — VERIFIED inert unless `DISCORD_LOGS_WEBHOOK_URL` set in Railway (absent in all committed config). Kept intentionally-unauth (pre-sign-in diagnostics) but now rate-limited (`developerRateLimiter`, per IP/auth) + size-capped (log 2MB, diagnostics 100KB) → no unauth spam/large-payload abuse.

## 🔴 C0 — Meet recorder drops data on SHORT recordings (LIVE, found 2026-06-25)
Symptom: a ~5s Google-Meet recording → `result.mp4` = **1237 bytes** (header-only; "Could not load a playable video source", 0:00). ~15s works. Owner-reported live (video `mf5fbn3kcg6frq2`).
Root cause: extension offscreen recorder (`apps/browser-extension/src/offscreen/recorder.ts`) — `ondataavailable` is async (`await arrayBuffer()`) but `onstop` sends `RECORDER_STOPPED` immediately → the final media chunk's `RECORDER_CHUNK` reaches the SW AFTER state left "recording" and is dropped (`upload.ts:336`). With `timeslice=1000`, short clips lose most/all media → multipart completes with only the ~1.2KB init segment. No guard stops the broken video being shared.
Fix (✅🚀 `dfc6ef8`, owner-verified live): (A) defer `RECORDER_STOPPED` until all pending chunk-sends finish (pendingChunks/finishStop) in offscreen + meet-detect + recorder-page; (B) timeslice 1000→200ms; (C) `finalizeUpload` guard: `totalBytes < 10KB` → error "too short, re-record", don't completeMultipart; (D) SW `enqueueRecorder` promise-chain serializes chunk/finalize (Codex-flagged residual race). manifest 0.1.0→**0.1.1**; rebuilt served `apps/web/public/365-extension.zip` (bsdtar, clean root entries). **Users must re-download+reload the extension** (side-loaded, no auto-update); refresh the Meet tab (content script). LESSON: a "fix doesn't work" was STALE code — verify the new build is actually loaded first ([[playbook_tech_gotchas]]).

## P1 — Correctness, reviewer-visible
- ⬜ **C1 AI not automatic** — `workflows/process-video.ts` skips transcription; manual only. VERIFIED. Fix: auto-trigger AI after upload OR clear "preparing" state. (BIG — careful)
- ⬜ **C2 Comments fail silently** — optimistic text lost on error. `CommentInput.tsx`,`Comments.tsx`. (fix: surface error, keep text)
- ⬜ **C3 AI chat exposed when not ready** — FAB always on; 409 shown as generic error. Gate by readiness + specific message.
- ⬜ **C4 Import: rows before upload, no cleanup on fail** — `import/file/ImportFilePage.tsx`.
- ⬜ **C5 Upload quota bypass (server-processing path)** — `create-for-processing.ts` no quota.
- ⬜ **C6 Loom import buffers whole file in memory** — `workflows/import-loom-video.ts`.
- ⬜ **C7 Share page breaks if owner deleted** (inner join) — `s/[videoId]/page.tsx`.

## P2 — Polish / a11y / branding
- ⬜ **P1 "Cap" branding leftovers** — upload titles, recorder download name, emails, AI prompt "Cap AI", sitemap/layout/install cap.so URLs.
- ⬜ **P2 `/terms` + `/privacy` 404** — linked but no route. (add pages or remove links)
- ⬜ **P3 Mobile nav a11y** — drawer focus-trap/scroll-lock; div triggers → buttons.
- ⬜ **P4 Recorder: silent-start after capture fail** (Codex earlier).
- ⬜ **P5 Recorder dialog overflow on small screens** (max-h + scroll).
- ⬜ **P6 Mobile bottom-tab + recorder-stop aria-labels; blank top titles** (meetings/extension/admin/access/import).
- ⬜ **P7 Gemini API-key input light bg in dark** (account settings).

## Done earlier this session (live)
- ✅🚀 Recorder ✕ overlap (971ddff) · plain-English audio notice (c099832) · dark recorder text (1c97306) · header hygiene (aefa1ff) · mobile hamburger (11bd143).

## Rejected (false positives — verified)
- ❌ Sonnet subagent's "viewer dark-mode bugs" — viewer is LIGHT-ONLY (confirmed live).
- ❌ Sonnet subagent's owner/members null-safety "crashes" — code + TS types guarantee presence.
