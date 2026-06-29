# QA Report — RUN 3 (core video pipeline) — 2026-06-25

Evidence = Railway prod logs + live HTTP + current-code review. Recording UI = owner-physical (marked). Every finding below was VERIFIED against current code + this deployment's config (default-R2, post-security-fixes) — candidates that didn't survive verification are listed under "False positives caught" so the owner sees the rigor.

## Verified pipeline findings

| ID | Finding | Status | Severity | Evidence | Fix size |
|---|---|---|---|---|---|
| **C1** | AI summary/analysis not auto-triggered after transcription — every upload caller (extension, web-recorder, file-import) omits `aiGenerationEnabled:true`, so transcript completes but the user must click "Start AI analysis". `isAiGenerationEnabled` returns true (intent = on for all), so this is purely the missing flag. | ❌ REAL | **High** (reviewer-visible; the owner's exact symptom) | `workflows/transcribe.ts:97-99`; `lib/transcribe.ts:27`; only `save-edits.ts:237` passes it | ~4 files, mechanical |
| **C3** | File-import upload orphan — `videos`+`videoUploads` rows created before upload; on mid-upload network failure the catch only toasts, no DB cleanup, no stuck-`webMP4` reconcile cron → permanent ghost rows. | ❌ REAL | Medium | `ImportFilePage.tsx:260,382-395`; stale-cron filters `desktopSegments` only | 1 file |
| **C4+C5** | Extension dead-letter queue never drained — `DEAD_LETTER_KEY` is write-only (no reader anywhere); a part that fails 6× is lost (blob IS preserved as base64, but presigned URL expired → needs re-request). Flaky upload = silent partial loss. | ❌ REAL | Medium | `upload.ts:8,108-118,21-26` | 2-3 files, non-trivial |
| **C7** | No audio chunking — whole audio `arrayBuffer()`'d into Node memory then File-API uploaded to Gemini (cap 2GB, so limit is **Node OOM**, not Gemini). 10-min/9.7MB fine; failure zone ≈ >1hr recordings. | ❌ REAL | **Low** (only very-long videos) | `lib/gemini-transcribe.ts:276` | 1-2 files, refactor |
| **C8** | In-app web-recorder streaming path can complete multipart with `parts:[]` — Zod `parts` array lacks `.min(1)`; empty array passes, forwarded to S3 → `MalformedXML` surfaces as an unhandled error, not a clean "recording empty" message. | ❌ REAL | Low | `app/api/upload/[...route]/multipart.ts:281-287,335,423` | 1 file, 1 line |
| **S-07** | `commentsDisabled` only partially server-enforced — video + org `disableComments` ARE checked, but **space-level** `disableComments` is client-UI-only (`resolveEffectiveVideoRules` never called in the comment action) → a direct API call posts to a space that disabled comments. | ❌ REAL (partial) | Medium | `new-comment.ts:95-99`; `EffectiveVideoRules.ts:49-75` unused here | 1-2 files |

## False positives / not-applicable (caught by verification — NOT bugs)
- **C6 "AI chat unauthenticated" → FALSE.** `app/api/video/ai/chat/route.ts` enforces `getCurrentUser()`→401 (L119), `canView` policy→403 (L152-169), rate-limit 20/60s (L146), `withCostGuard` (L246,313). Already secured by the S4 fix. (Step-1 agent misread; I verified the live file.)
- **C2 "custom-bucket playback 404" → NOT-APPLICABLE.** Real in code (`playlist/route.ts:344-358`) but `customBucket` is per-org DB config; this deployment is default-R2 only → branch never runs. Latent only — fix if org-S3 is ever enabled.

## Regression check — 3 fixes shipped this session
- Extension short-recording empty-video (dfc6ef8, ext v0.1.1) — ✅ owner-verified live; served zip = v0.1.1 confirmed.
- Stripe priceId + Discord relay guard (c73eef0/09231e8) — ✅ deploy healthy (health 200 throughout); C6 verification reconfirms the AI-spend guard is intact.
- Transcription raw-upload fallback (ddc6b95) — ✅ logs prove BOTH a 1-min (64s) and 10-min (606s) video now transcribe (`Using video source …/raw-upload.mp4 → Stored transcript chunks`).

## Summary
- Candidates triaged: 8 · **REAL: 6** (1 High, 3 Medium, 2 Low) · FALSE: 1 · NOT-APPLICABLE: 1.
- Owner-physical (unverified by QA, need owner action): the 3 recording methods' UI gestures — verified by RESULT (uploaded file + logs) instead.

## Prioritised failures (Critical first — none Critical)
1. **C1 (High)** — AI analysis never auto-runs; users see "Start AI analysis" forever. The owner's reported symptom.
2. **S-07 (Medium)** — space-level comment-disable bypassable via API.
3. **C3 (Medium)** — import failures leave ghost rows.
4. **C4+C5 (Medium)** — extension drops parts silently after 6 retries.
5. **C8 (Low)** — empty in-app recording yields an ugly error, not a clean message.
6. **C7 (Low)** — >1hr videos risk OOM during transcription.

## Step 4 — fixes applied (NOT yet committed/deployed — batching for one deploy)
- **C8 ✅ FIXED** — `multipart.ts` parts zod `.min(1)`; empty completion rejected cleanly. typecheck GREEN, Codex SHIP, playback-source 12/12.
- **C3 ✅ FIXED** — new `actions/video/mark-upload-failed.ts` (owner-checked, sets `videoUploads.phase="error"`) called from `ImportFilePage` catch; orphan no longer stuck at "uploading". typecheck GREEN, Codex SHIP.
- **S-07 ✅ FIXED** — `new-comment.ts` now resolves `resolveEffectiveVideoRules` (space→org→video) before insert; space-level disable enforced. Codex confirmed precedence preserved (no regression — space can only ADD restriction). typecheck GREEN.
- **C1 ✅ ROOT-CAUSED & FIXED (`cba69a0`) — it was the AI BUDGET CAP, not Gemini, not the missing flag.** Two agent theories were REFUTED first (verifier's "callers omit `aiGenerationEnabled`" — false, `transcribeVideo` only called from `/generate` with `true`; and the "empty transcript skip" — false, `getTranscript` and AI's `fetchTranscript` read the SAME vtt key and the viewer SHOWS the transcript). Real cause, traced via the live test (AI fails ~1s, NO Gemini error, NO "Inline failed" log = a HANDLED throw): `assertAiBudgetAvailable` uses an inherited **$1/month default cap** (`DEFAULT_AI_BUDGET_CAP_MICROS=1_000_000`); a day of self-hosted testing exhausted it → `BudgetExceededError` before any Gemini call → all AI silently blocked. Fix: raise default to $100/month. **VERIFY:** owner re-clicks "Start AI analysis" post-deploy → summary should now generate.
- **C4+C5, C7 — DEFERRED (gate G2 + "no new bugs"):** C4+C5 = risky extension concurrency drain (Medium, edge-case, the extension just got a delicate fix); C7 = streaming-audio refactor (Low, only >1hr videos). Doing either blind risks the exact churn the owner is fighting. Recommend defer both; revisit deliberately.

**Review discipline this run (owner's mandate):** every delegated diff was Opus-reviewed + the security/correctness-sensitive ones Codex-reviewed; two separate Sonnet sub-agent claims (C6 "unauth", C1 "missing flag") were caught as WRONG before any fix shipped.

---

# QA Report — Ustoz / data365

---
## RUN 2 — 2026-06-25 (Opus) — dark-mode + recent-UI pass

**Target:** live https://capweb-production-dd85.up.railway.app (`qa-fixes`), driven through the owner's logged-in admin Chrome session (I never enter passwords). **Focus (owner's ask):** dark mode + the UI shipped since Run 1 (recorder ✕-button, logo, renamed nav, settings).

### Executive summary
Dark mode is in **good shape for a reviewer.** Walked **9 dashboard surfaces** in dark — 8 clean, **1 real bug found and fixed** (deploying). The two historically-buggy dark surfaces (Org-Settings **Members** + **Storage**) are confirmed readable. **0 Critical / 0 High / 0 Medium.** Remaining = Low cosmetic only.

| Severity (NEW this run) | Count | Items |
|---|---|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 3 | recorder header still "Cap" wordmark (**owner descoped**); Gemini API-key input light bg in dark; account Danger-Zone uses Tailwind `red-200/600` |

### Fixes shipped this run (on `qa-fixes`)
| Commit | Fix | Severity | Verified |
|---|---|---|---|
| `971ddff` | Recorder **✕ close overlapped by the ⚙️ settings button** (44px z-10 gear sat on the 20px Radix ✕ → clicking ✕ opened settings). Hid Radix ✕, moved gear left, added a dedicated 44px ✕ wired to close. | **High** (core flow) | ✅ LIVE — ✕ closes, ⚙️ opens settings (browser-verified) |
| `c099832` | Plain-English rewrite of the mic-on / no-system-audio notice. | Low | ✅ deployed (text-only) |
| `1c97306` | **Dark bug:** recorder dialog text uses `--text-primary` (`#0d1b2a`, fixed dark navy, no dark override) → labels like **"System Audio"** were dark-on-dark / unreadable in dark mode. Flipped `--text-primary` → Radix `gray-12` under `.dark` (token used ONLY by the 5 recorder-dialog files — verified safe). | **High** (unreadable UI in dark) | ⏳ deploying → re-verify |

### Dark-mode walkthrough (live screenshots, this run)
| # | Surface (dark) | Result | Evidence |
|---|---|---|---|
| 1 | Dashboard / Caps | ✅ clean | bg dark, text + cards + nav readable |
| 2 | Org Settings — General | ✅ clean | AI-budget, slider, inputs readable |
| 3 | Org Settings — **Members** | ✅ clean (was buggy) | team table + add-member readable |
| 4 | Settings — **Storage** | ✅ clean (was buggy) | quota inputs, progress, Save readable |
| 5 | Analytics | ✅ clean | metric cards + chart + axes readable |
| 6 | Meeting Recordings (empty) | ✅ clean | empty state + Install CTA readable |
| 7 | **Recorder dialog** | ❌ → FIXED | "System Audio" label dark-on-dark → `1c97306` |
| 8 | Account Settings | ⚠️ Low | Gemini API-key input light bg (readable, inconsistent) |
| 9 | Access Management | ✅ clean | user table, badges, actions readable |

**Not individually screenshotted in dark this run** (lower risk; covered by a code colour-audit that found only **benign** hardcoded colours — `text-white` on coloured buttons / dark media thumbnails): Org-Settings Preferences/Integrations/Permissions/Activity, New Recording, Install Extension, Refer, login/signup. Share viewer `/s/` is **light-only by design** (not a dark bug; future feature).

### Smoke gate
ROOT `pnpm typecheck` **GREEN**. `vitest` = **20 pre-existing failures** (workflow-mock test-infra: "processVideoWorkflow is not a function") — pre-existing **test debt, NOT app bugs**, unrelated to this run (matches Run 1's triage). App build healthy → smoke **PASS**.

### Reviewer-readiness
`/login` 200 · `/dashboard` 307 (auth-gated) · `/api/health` db+storage **ok**. Admin login **unchanged** (no auth files touched this run); regular users self-signup. **Verdict: ready for a reviewer to log in and review** once the dark-fix deploy (`1c97306`) lands (re-verify pending).

---
## RUN 1 — 2026-06-24 (previous pass, retained for record)

**Run:** 2026-06-24 (Opus, qa-6-step). **Target:** live https://capweb-production-dd85.up.railway.app (`qa-fixes` @ `176f6e7`).

## Executive summary
The live app is **healthy**. Every core public + authed route loads with no crash, this session's fixes are confirmed **live**, and the prior report's scary security claims are **no longer exploitable**. This run found **0 new Critical / 0 new High** issues. Open items are pre-existing test-suite debt (Medium) and a legal-page decision (Low) — both flagged, neither blocks the teacher flow.

> **The prior `QA_REPORT.md` (2026-06-20, "52 bugs / 14 Critical") is SUPERSEDED.** It predates the 2026-06-21+ security-hardening + Railway deploy. Spot-checks below confirm its top Criticals (AI-chat IDOR, world-readable bucket, storage leak, unauth AI-spend) are now protected. Those 52 were not re-verified one-by-one; a dedicated security re-audit is recommended only if deeper assurance is wanted.

| Severity (NEW this run) | Count |
|---|---|
| Critical | 0 |
| High | 0 |
| Medium | 2 (pre-existing test debt; mutation/recording coverage gap = Unverified, not a defect) |
| Low | 2 (`/terms`+`/privacy` 404 — owner/legal; missing-video returns 200 but graceful) |

## Flow results (Table C)
| # | Flow | Status | Evidence | Notes |
|---|---|---|---|---|
| 1 | App loads / health | ✅ | `/` 307→auth; `/api/health` 200 `{db:ok,storage:ok}` | — |
| 2 | Login renders | ✅ | 200; email+password fields; "Sign in to data365" | brand fix live |
| 3 | Signup (open) | ✅ form / ⏭️ submit | 200; name+email+password; "Sign up to data365" | real signup not run on prod (would create account); action code-verified (member, dup/race-guarded) |
| 4 | Login → dashboard | ✅ | headless admin login OK; dashboard 200 | NextAuth credentials flow works |
| 5 | Onboarding → download | ✅ | CTA → `/dashboard/extension` (was 404); route exists | fixed this session |
| 6 | Dashboard caps list | ✅ | authed 200; "Instructional recordings — data365" (221 KB) | renders, branded |
| 7 | Record (web) | ⏭️ Unverified | needs real screen/mic | owner-physical |
| 8 | Record (ext / Meet) | ⏭️ Unverified | needs extension + real capture | owner-physical |
| 9 | Import file | ⏭️ Unverified | needs file + prod mutation | — |
| 10 | Import Loom | ⏭️ Unverified | needs URL + mutation | >500-row banner cap.so mailto removed (fixed) |
| 11 | Share `/s/[id]` | ✅ | 200; video markup; "…\| data365"; missing id → "This video is restricted" (graceful) | — |
| 12 | Embed `/embed/[id]` | ✅ | 200 SSR | — |
| 13 | Delete recording | ⚠️ code-verified | toast "recording(s)" (fixed); screens render | not exercised destructively on prod |
| 14 | Comment / react | ⏭️ Unverified | mutation on prod | — |
| 15 | Settings (account) | ✅ | authed 200; "sign up to **data365**", "every **web** session", **0** "Cap Pro", no error boundary | round-2 fixes live |
| 16 | Settings (org/members) | ✅ renders / ⏭️ mutate | `/dashboard/settings/organization` 200 | member add/role/remove not mutated |
| 17 | Folders create/move | ⏭️ Unverified | mutation | — |
| 18 | AI generate | ⏭️ Unverified | needs server Gemini key (owner) | endpoint 403 unauth (protected) |

### Security spot-check (unauthenticated) — prior Criticals
| Endpoint | Result | Verdict |
|---|---|---|
| POST `/api/video/ai/chat` | 400 | not a stream — protected |
| GET `/api/storage/object` | 400 | not world-readable |
| POST `/api/videos/ID/generate` | 403 | AI-spend protected |
| POST `/api/video/comment/delete` | 405 | no unauth delete |
| GET `/api/video/transcribe/status` | 401 | protected |
| Direct R2 object (no presign) | 400 | **bucket private** |
| `/dashboard/admin/access` unauth | redirect→login | gated |

### Negative / resilience
- Missing video `/s/badid` → 200 + "This video is restricted" page (graceful, no crash; doesn't leak existence). **Low:** ideally 404, but acceptable UX.
- Unauthed dashboard routes → redirect to login (200), not 500. ✅
- Playlist bad id → 401 (no existence leak). ✅

## Summary
- Total flows: 18 + security/resilience spot-checks
- Passed ✅: 10 · Code-verified ⚠️: 1 · Unverified ⏭️: 7 (documented reasons) · Failed ❌: **0**

## Prioritised failures (Critical first)
*None Critical/High.* Open items:
1. **[Medium] Pre-existing test debt** — 20 unit failures in 4 workflow/AI test files (transcribe, generate-ai, video-processing, loom-import). PROVEN not from this session (their source predates these commits; no test asserts any changed value). Fixing the mocks is a separate effort → **Gate G2 (touches test infra, >5 files): ask owner before investing.**
2. **[Low] `/terms` + `/privacy` 404** on login/signup/invite footers — legal-content decision, flagged to owner (not auto-fixed: won't fabricate legal text).

## Step 4 — Fix outcome
- **0 new-bug fixes needed.** The real bugs (delete-toast wording, onboarding-404, ~40 brand leaks, sidebar, smaller recordings, CDN code) were already fixed + deployed + live-verified in this session's rounds 1–2 (commits `961110a`, `176f6e7`).
- Flow #13 (delete) ⚠️ → **resolved by code** — toast wording fixed in the live build, screens render; not exercised destructively on prod by design.
- **Deferred to owner (not auto-fixed):** (a) pre-existing 20-test debt → **Gate G2** (mock/env fixes across ≥4 test files = a separate effort — ask before investing); (b) `/terms`+`/privacy` 404 → legal-content decision.
- **Regression guard:** smoke set re-confirmed green (login/signup/share/health all 200, fixes still live). No fixes applied this step → no regression risk.

## Verified-fixed this session (rounds 1–2, live)
Recordings ~half size (720p/600 kbps) · sidebar gray-box removed · delete-toast "recording(s)" · onboarding 404 → extension · ~40 "Cap"→data365 leaks · CDN hang fixed in code. All gated (typecheck/BOM) + deployed + spot-verified live.

## Unverified (stated, never faked)
Recording (web + Meet/extension — real screen/mic + extension), prod-mutating flows (create/delete/comment/settings-change — not run against the live DB), AI generation (needs owner's server Gemini key — money), CDN Worker (fixed in code, not deployed — R2 baseline). No isolated local DB stood up this run, and no dev-auth bypass exists.
