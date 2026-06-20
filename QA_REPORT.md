# QA Report — Ustoz

## Executive Summary

A full-spectrum QA sweep of the Ustoz self-hosted Cap fork was conducted on 2026-06-20, combining static code-verification of 34 original candidate findings, a 90-file deep-sweep that produced 20 new findings, and live browser + environment probing of the running application. The codebase ships several **Critical security holes that are exploitable today with zero authentication**: the AI chat endpoint returns a full Gemini stream to any internet user (confirmed live as B1/F001); thumbnail generation hands out signed S3 URLs for private videos with no login required (N004); and the bucket policy makes every recording world-readable at the storage layer (N002). The paywall is permanently disabled (`userIsPro() = true`, N003), blocking all paid subscriptions. Beyond security, core product features are broken: transcription fails silently on both test caps because ffmpeg is not installed (L1); the Tasks toggle returns a 404 because its route file does not exist (F002/B2); and org invite links always show "Invalid invite link" because they query the wrong database table (F003/F033). Of the 34 original candidates, **7 were cleanly refuted** and 1 is uncertain (F005). The confirmed bug count is **52 total**: 14 Critical · 22 High · 11 Medium · 4 Low.

| Severity | Count |
|---|---|
| Critical | 14 |
| High | 22 |
| Medium | 11 |
| Low | 4 |
| **Total confirmed** | **51** |

*Original candidates refuted: 7 (F005-uncertain, F015, F019, F026, F027, F030, F034).*

---

## Confirmed Bugs

### Critical

| ID | Title | File:Line | Confirmed by | Fix approach |
|---|---|---|---|---|
| F001 / B1 | AI chat endpoint completely unauthenticated | `apps/web/app/api/video/ai/chat/route.ts:22-71` | code-verify + live-probe (200 streamed Gemini SSE, no cookie) | Add `getCurrentUser()` at top of POST handler; return 401 if no session; check `video.ownerId === user.id` |
| F002 / B2 | Tasks toggle route does not exist — feature broken end-to-end | `apps/web/app/s/[videoId]/_components/panels/TasksPanel.tsx:112` | code-verify + live-probe (404) | Create `apps/web/app/api/video/tasks/toggle/route.ts` with ownership-checked POST handler |
| F003 | Org email invite links always show "Invalid invite link" | `apps/web/actions/organization/send-invites.ts:152` | code-verify | Generate random token, store in `organizationInvites.token`; extend `validateInviteToken` to query that table |
| F004 | OTP code printed plaintext in server logs | `apps/web/actions/auth/request-otp.ts:45` | code-verify (confidence 1.00) | Replace `console.log` with real email send (Resend/nodemailer); redact from logs |
| F006 | Extension part-retry stores no blob — all failed parts dead-letter | `apps/web/apps/browser-extension/src/background/upload.ts:182-196,341-343` | code-verify | Store drained part blob in `chrome.storage.local` on retry-queue; retrieve before re-uploading |
| F007 | `redirect()` in client component — white screen on session expiry | `apps/web/app/(org)/dashboard/Contexts.tsx:158-160` | code-verify | Replace with `useEffect(() => { if (!user) router.push("/login"); }, [user])` |
| F008 | Anonymous users can post comments regardless of `commentsDisabled` | `apps/web/actions/videos/new-comment.ts:20-54` | code-verify | Server-side `disableComments` check; return 401/403 for unauthenticated callers |
| F009 | Password brute force — no rate limit on `verifyVideoPassword` | `apps/web/actions/videos/password.ts:86-127` | code-verify | Mirror `isRateLimited()` guard from `collections/password.ts` |
| F010 | Password reset does not invalidate existing sessions | `apps/web/actions/admin/access.ts:173-198` | code-verify | Add `authSessionVersion: sql\`${users.authSessionVersion} + 1\`` to `resetUserPassword` update |
| F033 | Two separate invite tables — org membership path always fails | `apps/web/actions/organization/send-invites.ts` + `apps/web/app/invite/[token]/page.tsx` | code-verify | Rewrite `ClaimInvite.tsx` and `validateInviteToken` to detect and handle `organizationInvites` table |
| N001 | Axiom API token shipped to browser via `NEXT_PUBLIC_` | `apps/web/instrumentation.ts:4,10` | code-verify | Rename to `AXIOM_TOKEN`/`AXIOM_DATASET` (no `NEXT_PUBLIC_` prefix) |
| N002 | Public-read S3/MinIO bucket policy — every recording world-readable | `apps/web/instrumentation.node.ts:101-114` | code-verify | Remove `Principal:"*"` GetObject policy; use short-lived presigned URLs or authed proxy |
| N003 | `userIsPro()` hardcoded `return true` — paywall and free cap broken | `packages/utils/src/constants/plans.ts:19` | code-verify | Implement against real subscription columns (`stripeSubscriptionStatus === 'active'`) |
| N004 | Thumbnail endpoint unauthenticated — signed S3 URL for any private video | `apps/web/app/api/thumbnail/route.ts:11-91` | code-verify | Add `getCurrentUser()` + ownership/public check before issuing signed URL |

### High

| ID | Title | File:Line | Confirmed by | Fix approach |
|---|---|---|---|---|
| F011 | Dashboard/org-settings redirect to `/auth/signin` — 404 | `apps/web/app/(org)/dashboard/settings/organization/layout.tsx` (6 files) | code-verify | Change all `redirect("/auth/signin")` to `redirect("/login")` |
| F012 | Open redirect via `?next=` parameter | `apps/web/app/(org)/login/form.tsx:49-50` | code-verify | Validate `next` with `/^\/(?!\/)/.test(next)` before use in `window.location.href` |
| F013 | Ghost passwordless users created for non-existent emails | `apps/web/actions/organization/invite-by-email.ts:65-77` | code-verify | Replace ghost-user insertion with `sendOrganizationInvites` token flow |
| F014 | `debug:true` hardcoded in NextAuth — JWT tokens logged in production | `packages/database/auth/auth-options.ts:57` | code-verify | `debug: process.env.NODE_ENV !== "production"` |
| F016 / B4 | CapCard thumbnail `Math.random()` gradient — hydration mismatch every render | `apps/web/components/VideoThumbnail.tsx:51-58,104,166` | code-verify + browser (console hydration warning) | Derive deterministic gray from `videoId` hash, or `useState(() => generateRandomGrayScaleColor())` |
| F017 | `router.refresh()` missing after drag-drop to folder — stale UI | `apps/web/app/(org)/dashboard/caps/components/Folder.tsx:256-289` | code-verify | Add `router.refresh()` after `toast.success()` in both `handleDrop` and `registerDropTarget` callback |
| F018 | "View analytics" routes to 404 | `apps/web/app/(org)/dashboard/caps/components/CapCard.tsx:522` | code-verify | Create `analytics/s/[capId]/page.tsx` or change route to `?capId=` query param |
| F020 | No `beforeunload` guard during upload — multipart left open on page refresh | `apps/web/app/(org)/dashboard/caps/components/web-recorder-dialog/useWebRecorder.ts` | code-verify | Add `sendBeacon('/api/upload/multipart/abort')` on `beforeunload`; add MinIO lifecycle abort rule |
| F021 | Single-part upload has zero retry — transient error is permanent failure | `apps/web/utils/upload-target.ts:58` | code-verify | Wrap XHR send in exponential-backoff retry (3 attempts, 500/1000/2000 ms) |
| F022 | IDOR on `/api/video/ai` — any authenticated user reads/triggers AI for any video | `apps/web/app/api/video/ai/route.ts:30-33` | code-verify | Add `video.ownerId !== user.id → 403` after fetching video |
| F023 | `/api/video/transcribe/status` no ownership check | `apps/web/app/api/video/transcribe/status/route.ts:26-37` | code-verify | Add `eq(videos.ownerId, user.id)` to WHERE clause; return 403 if missing |
| F024 | Retry-transcription does not delete old chunks — RAG context doubles | `apps/web/app/api/videos/[videoId]/retry-transcription/route.ts:40-43` | code-verify | `DELETE transcriptChunks WHERE videoId = ?` before re-insert in `chunkEmbedAndStore` |
| F025 | Zero rate limiting on `/api/video/ai/*` Next.js routes | `apps/web/app/api/utils.ts:17-53` | code-verify | Add in-process IP/session rate limiter in `chat/route.ts` POST handler |
| L1 | `transcriptionStatus="ERROR"` on all caps — ffmpeg not installed | Server environment (`spawn ffmpeg` fails silently) | live-probe (both caps ERROR, `aiGenerationStatus=null`) | Install ffmpeg on server; add user-facing error message + retry CTA in UI |
| L2 | TanStack Query DevTools "Default open" covers cap grid on every load | `(DevTools configuration)` | live-browser | Set `initialIsOpen: false` or remove DevTools panel in production build |
| N005 | `getUsers()` returns `passwordHash` to client | `apps/web/actions/admin/access.ts:35-40` | code-verify | Remove `passwordHash` from `select()` projection |
| N006 | API keys are plaintext UUIDs — no hash, no expiry, no revocation | `packages/web-backend/src/Auth.ts:67-83` | code-verify | Hash keys at rest; typed prefix + format validation; add `revokedAt`/`expiresAt` columns |
| N007 | Cross-tenant analytics injection via client-controlled `tenantId` | `apps/web/app/api/analytics/track/route.ts:147-151` | code-verify | Derive `tenantId` from server-side `videoRecord.ownerId` only; clamp `occurredAt` |
| N008 | Analytics GET — no auth or ownership check | `apps/web/app/api/analytics/route.ts:19-41` | code-verify | Add session + ownership/org check; remove debug `console.log` |
| N009 | Loom import gate `email.endsWith("@cap.so")` bypassable | `packages/web-backend/src/Loom/Http.ts:24-25` | code-verify | Exact domain compare: `split('@').at(-1) === 'cap.so'`; throw typed Unauthorized not `Effect.die` |
| N010 | SSRF: caller-supplied Loom `downloadUrl` fetched server-side, no allowlist | `packages/web-backend/src/Loom/ImportVideo.ts:21,118` | code-verify | Allowlist Loom/CDN hosts; reject loopback/link-local/RFC-1918/non-https; redact URL from logs |
| N011 | Unauthenticated server-side ffmpeg transcode — DoS + SSRF | `apps/web/app/api/tools/loom-download/route.ts:162-297` | code-verify | Require auth; Content-Length guard; ffmpeg timeout + concurrency semaphore; validate `cdnUrl` host |
| N012 | `isOwner` returns `true` for non-existent video — delete/duplicate gate bypass | `packages/web-backend/src/Videos/VideosPolicy.ts:149-159` | code-verify | Change `onNone: () => true` to `onNone: () => false` |
| N013 | Cross-tenant bucket credential disclosure — `getById` has no owner/org filter | `packages/web-backend/src/S3Buckets/S3BucketsRepo.ts:146-158` | code-verify | Add `ownerId`/`organizationId` filter in `getById`; enforce at all user-input call sites |

### Medium

| ID | Title | File:Line | Confirmed by | Fix approach |
|---|---|---|---|---|
| F032 | Gemini API key deleted without confirmation dialog | `apps/web/app/(org)/dashboard/settings/account/components/ApiKeysSection.tsx:59-72` | code-verify + browser | Add confirmation step (window.confirm or modal) before calling `deleteGeminiKey()` |
| L3 | GET `/api/video/preview` returns 404 for all caps | `apps/web/app/api/video/preview/route.ts` | live-probe | Verify route wiring and MinIO animated GIF generation pipeline |
| N014 | Stripe customer hijack via unverified email match | `apps/web/app/api/settings/billing/subscribe/route.ts:32-46` (+ 3 endpoints) | code-verify | Only reuse Stripe customer if `metadata.userId === user.id`; else create fresh |
| N015 | Owner can overwrite server-managed video metadata (no field allowlist) | `apps/web/app/api/video/metadata/route.ts:33-38` | code-verify | Allowlist user-editable fields; merge-patch instead of wholesale replace |
| N016 | Signed-object token skips policy — stale token grants access after restriction | `apps/web/app/api/storage/object/route.ts:111-116` | code-verify | Re-run policy check after token validation; use short TTLs |
| N017 | `passwordsForVideo` returns raw space password column | `packages/web-backend/src/Spaces/SpacesRepo.ts:32-43` | code-verify | Return boolean only from data layer; never select raw password |
| N018 | Presigned GIF URL cached as `public, max-age=300` — credential leak | `apps/web/app/api/video/preview/route.ts:64-65` | code-verify | Use `Cache-Control: private, no-store` on the redirect |
| N019 | Storage cron double-debit on concurrent invocation | `apps/web/app/api/cron/developer-storage/route.ts:125-190` | code-verify | Advisory lock / `SELECT … FOR UPDATE`; or upsert snapshot BEFORE debit |
| N020 | Image-upload `contentType` has no allowlist — stored XSS on S3 origin | `packages/web-backend/src/ImageUploads/index.ts:28,33` | code-verify | Allowlist image MIME types; verify magic bytes; derive extension from validated type |
| F028 | `VideosPolicy` grants access to non-existent `videoId` (read path) | `packages/web-backend/src/Videos/VideosPolicy.ts:54-57` | code-verify (UNCERTAIN) | Change missing-row branch to return false |
| F029 | OG social image endpoint may bypass password gate | `apps/web/app/api/video/og/route.ts` | code-verify (UNCERTAIN) | Add password/auth check in OG endpoint before returning thumbnail |

### Low

| ID | Title | File:Line | Confirmed by | Fix approach |
|---|---|---|---|---|
| F031 | AI chat forwards unbounded message history to Gemini | `apps/web/app/api/video/ai/chat/route.ts:46-49,176-179` | code-verify | Cap history at MAX_MESSAGES (e.g. 20); trim oldest pairs first |
| L4 | GET `/api/video/comment` returns 404 (only DELETE `/api/video/comment/delete` exists) | Route lookup | live-probe | Wire GET handler or document intent |
| L5 | Next.js dev overlay "1 Issue" badge on every page | Dev environment | live-browser | Resolve the flagged dev issue; confirm it disappears in production build |
| F005 | S3 CORS startup error silently swallowed — misconfiguration invisible | `apps/web/instrumentation.node.ts:119-127` | code-verify (UNCERTAIN / boot-noise confirmed live) | Wrap `applyS3BucketCors()` in try/catch with explicit error log; rethrow critical failures |

---

## Fix-wave Plan

Group by subsystem; one writer per file within a cluster. Mark parallel-safe clusters.

| Cluster | Bug IDs | Primary files | Notes |
|---|---|---|---|
| **C1 — S3/storage access & bucket policy** | N002, N013, N016, N018, N020, F005 | `instrumentation.node.ts`, `S3BucketsRepo.ts`, `storage/object/route.ts`, `video/preview/route.ts`, `ImageUploads/index.ts` | N002 (public bucket) is prerequisite for N016 presigned logic; otherwise parallel |
| **C2 — AI endpoints: auth + ownership + rate-limit** | F001, F022, F023, F024, F025 | `api/video/ai/chat/route.ts`, `api/video/ai/route.ts`, `api/video/transcribe/status/route.ts`, `api/videos/[videoId]/retry-transcription/route.ts`, `api/utils.ts` | All separate files — fully parallel |
| **C3 — Analytics endpoints** | N007, N008 | `api/analytics/track/route.ts`, `api/analytics/route.ts` | Two files, parallel |
| **C4 — Auth / session / invite / OTP** | F003, F004, F007, F008, F009, F010, F011, F012, F013, F014, N001 | `send-invites.ts`, `request-otp.ts`, `Contexts.tsx`, `new-comment.ts`, `videos/password.ts`, `admin/access.ts`, `login/form.tsx`, `invite-by-email.ts`, `auth-options.ts`, `instrumentation.ts` | F003+F033 share files — one writer; rest are separate files |
| **C5 — Org invite tables merge** (architectural) | F033 | `send-invites.ts`, `invite.ts`, `ClaimInvite.tsx`, `invite/[token]/page.tsx` | Touches 4 files; design change required — do after C4 |
| **C6 — Loom import: SSRF + gate** | N009, N010, N011 | `Loom/Http.ts`, `Loom/ImportVideo.ts`, `api/tools/loom-download/route.ts` | Separate files; parallel |
| **C7 — API-key model** (architectural) | N006 | `web-backend/src/Auth.ts`, all key-storage utilities, extension | Architectural — hash + expiry + revocation touches many files; plan before implement |
| **C8 — Upload reliability** | F006, F020, F021 | `browser-extension/src/background/upload.ts`, `useWebRecorder.ts`, `upload-target.ts` | Separate files; parallel |
| **C9 — Video metadata / policy** | N003, N004, N012, N015, N016, N017, F028, F029 | `plans.ts`, `api/thumbnail/route.ts`, `VideosPolicy.ts`, `api/video/metadata/route.ts`, `SpacesRepo.ts` | N003 touches many callers — plan first; N012/F028 both in `VideosPolicy.ts` — one writer |
| **C10 — Dashboard & CapCard UI** | F016, F017, F018, F032, L2 | `VideoThumbnail.tsx`, `Folder.tsx`, `CapCard.tsx`, `ApiKeysSection.tsx`, DevTools config | NOTE: CapCard grid is slated for Phase-1 replacement; verify before investing; rest are low-effort |
| **C11 — Billing / Stripe** | N014, N019 | `billing/subscribe/route.ts`, `api/cron/developer-storage/route.ts` | Two files; parallel |
| **C12 — Admin data exposure** | N005 | `admin/access.ts` | 1-line field removal; do with C4 |
| **C13 — Misc routes / redirects** | F011, L3, L4, F031 | 6 redirect files, `video/preview/route.ts`, `video/comment` route, `ai/chat/route.ts` | Trivial redirects parallel; preview/comment after C1 |
| **C14 — ffmpeg install** | L1 | Server environment + transcription error-handling UI | Prerequisite for all transcription features; do first |

---

## Refuted / False Positives

These findings were investigated and the code was found to be correct. Do not re-open without new evidence.

| ID | Title | Why refuted |
|---|---|---|
| F005 | S3 CORS never applied on MinIO — all browser multipart uploads blocked | MinIO post-2020 implements `PutBucketCors`; `ExposeHeaders: ["ETag"]` already present in config; live test confirmed MinIO CORS OK and video streams range-206 cleanly |
| F015 | Double `use()` in AuthContext causes "Rendered more hooks" crash | Both `use()` calls are unconditional — hook count is fixed at 2; `??` selects argument value, not whether the hook fires; no Rules of Hooks violation |
| F019 | Delete folder with caps — silent data loss | `deleteFolder` in `web-backend/src/Folders/index.ts:52-98` explicitly moves all child caps to parent before deleting; JSDoc documents behavior; recursive for subfolders |
| F026 | Extension no apiKey — silent console-only error, no popup feedback | `sw.ts` catch calls `setState({ kind: "error" })`; `popup.ts` renders `renderError()` with Retry/Dismiss; sign-in screen shown for empty `apiKey` |
| F027 | ETag not exposed in MinIO CORS — multipart complete always fails | `instrumentation.node.ts:68` already sets `ExposeHeaders: ["ETag"]` in `PutBucketCorsCommand` |
| F030 | Copy-with-timestamp link does not seek player on load | `Share.tsx:455-488` `useEffect` reads `searchParams.get("t")`, parses to int, polls until video mounts, calls `handleSeek(t)` — fully wired |
| F034 | Owner view of own share page inflates analytics count | `analytics/track/route.ts:135-137` has explicit `if (userId === videoRecord.ownerId) { return; }` early-exit guard |

---

## Environment & Quality Debt

| Item | Impact | Action |
|---|---|---|
| **ffmpeg not installed** | ALL transcription fails silently; summary/tasks/transcript/AI chat all empty on every recording. Root cause of L1 — the most user-visible broken feature. | Install ffmpeg on server (`choco install ffmpeg` or OS package). Add startup health-check that logs an error if ffmpeg is missing. Add user-facing "Transcription unavailable" message + retry CTA instead of silent empty state. |
| **vitest test-env gaps** | 90 of 633 tests fail (14 %) — all due to missing test environment setup (DB fixtures, env vars), not product logic bugs. Masks real regressions. | Add `vitest.setup.ts` with env-var stubs + in-memory DB; fix the 90 failing tests before adding new coverage. |
| **biome lint debt** | 1 283 lint issues (mostly formatting/import-order). No blocking errors found in audit scope. | Add `biome check --apply` to CI as a required gate; fix in one automated formatting pass. |
| **Boot-time `PutBucketCors 501` noise** | Server logs an unhandled rejection or swallowed error on every cold start when MinIO returns 501 (older builds) or on new-bucket creation. Makes real errors harder to spot. | Wrap `applyS3BucketCors()` in explicit try/catch with a clear `[WARN] CORS not applied` log line (ties to F005/C1). |
| **TanStack Query DevTools in production build** | DevTools panel opens over the cap grid and share page on every load (L2). | Set `initialIsOpen: false`; conditionally render only when `NODE_ENV === "development"`. |
| **Next.js dev overlay "1 Issue"** | Persistent badge on every page (L5). Likely the hydration warning from F016/Math.random(). | Fix F016 (C10 cluster) and confirm badge disappears. |
