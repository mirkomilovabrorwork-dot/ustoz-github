# QA_FLOWS.md — Ustoz / Cap fork — Full Flow Inventory

**Generated:** 2026-06-20 · **Re-verified:** 2026-06-24
**Areas covered:** AUTH · REC · SHARE · AI · DASH

## ⚡ 2026-06-24 DELTA (this QA run)
The 132-flow map below is still structurally valid. Changes since 2026-06-20:
- **Open signup is LIVE** (`actions/auth/signup.ts`) — Table-A "/signup = invite-only message" is STALE; the real signup form now creates a `member` (dup/race-guarded, never admin). → Flow #3.
- **Onboarding download 404 FIXED** → CTA now `/dashboard/extension` (was `/download/{platform}`, which 404s — no desktop app here).
- **Delete toasts FIXED** ("365"/"cap" used as the recording noun → "recording(s)" in Caps.tsx + Meetings.tsx).
- **Recordings ~half size** (720p / 600 kbps) · **sidebar org-switcher polish** · **~40 user-visible "Cap"→data365** · **CDN Worker hang fixed in code** (not deployed).
- **OPEN ISSUE:** `/terms` + `/privacy` 404 on auth footers (flagged to owner — legal-content decision).
- **Out-of-scope for this self-host** (Pro gating effectively off): billing/Stripe, developer-API apps, SSO, custom domains, referrals, auto-topup. Step-3 priority = the **Critical** teacher-core rows (auth, record, upload, share/watch, AI).

## Totals

| Metric | Count |
|---|---|
| Total flows | 132 |
| Critical flows | 42 |
| Smoke flows | 46 |
| Gap A (missing feature) | 3 |
| Gap B (missing cleanup/lifecycle) | 9 |
| Gap C (missing/wrong route) | 10 |
| Gap D (missing state update) | 6 |
| Gap E | 0 |
| Gap F (missing auth/access check) | 13 |
| Gap G (missing rate limit) | 2 |
| Gap H (missing UX / error path) | 12 |
| Gap I (incomplete impl) | 1 |
| Gap J (missing audit) | 1 |

---

## Table A — Platform Map

| Area | Screen/Route | Entity | Main user actions | Related screens | Risk |
|---|---|---|---|---|---|
| AUTH | /login | User, Session(JWT) | Email/password login | Dashboard, Signup, Onboarding | Critical |
| AUTH | /signup | — | Only "invite-only" message (nothing) | Login, Invite | High |
| AUTH | /invite/[token] | User, Invite, OrgMember | Validate token, create account, auto-login | Login, Dashboard | Critical |
| AUTH | /onboarding/[...steps] | User(onboardingSteps) | Welcome, org, domain, invite, download | Dashboard | High |
| AUTH | Navbar | Session | Clear JWT, redirect to login | Login | High |
| AUTH | /dashboard/settings/account | User, Session, AuthApiKey | bump authSessionVersion + delete all sessions/keys | Account settings | High |
| AUTH | /dashboard/admin/access | User, Invite | Create user, reset pw, admin toggle, revoke, invite | Admin panel | Critical |
| AUTH | /dashboard/settings/organization/members | OrgMember, OrgInvite | Send/resend/delete invite | Org settings | High |
| AUTH | /dashboard/settings/organization/layout.tsx | User, OrgMember | admin/owner check | Org settings | High |
| AUTH | /s/[videoId] | VerificationToken | request OTP, verify | Video share | Medium |
| AUTH | /api/auth/[...nextauth] | Session | NextAuth sign-in/out callbacks | all protected routes | Critical |
| REC | /dashboard/caps (web recorder dialog) | Video, videoUploads | Screen/window/tab source selection, start recording | Dashboard | Critical |
| REC | /dashboard/caps (camera/mic selection) | MediaStream | Select camera, mic, configure | Recorder dialog | High |
| REC | Chrome MV3 extension recorder | Video, Extension RetryItem | Record from extension, upload chunks | Dashboard | Critical |
| REC | POST /api/upload/signed | Video, S3 object | Presigned/single-part upload | Upload pipeline | High |
| REC | /api/upload/multipart/initiate|presign-part|complete|abort | videoUploads, S3 | Multipart upload lifecycle | Upload pipeline | Critical |
| REC | instrumentation.node.ts (S3/MinIO bootstrap) | S3 Bucket, CORS config | Bucket create, CORS apply at boot | All uploads | Critical |
| REC | Recording recovery spool | IndexedDB blob | Auto-recover after crash | Recorder | High |
| SHARE | /s/[videoId] (public share page) | Video, Comment, Reaction | Watch, comment, react | — | Critical |
| SHARE | /s/[videoId] PasswordOverlay | VerificationToken | Enter password, unlock | Share page | High |
| SHARE | /s/[videoId] AuthOverlay | User, Session | Email OTP / Google sign-in to unlock | Share page | High |
| SHARE | ShareHeader | — | Copy link plain / timestamped | Share page | Medium |
| SHARE | SharingDialog | Video | Toggle visibility, set password, manage access | Dashboard, Share | High |
| SHARE | CapVideoPlayer | Video | Seek, play, pause, fullscreen | Share page | High |
| SHARE | PendingRecordingShare / RecordingInProgress | Video | Watch upload progress | Share page | Medium |
| SHARE | Comments / Reactions sidebar | Comment, Reaction | Post comment, emoji react | Share page | High |
| SHARE | /api/analytics/track | ViewEvent | Track view count | Share page | Low |
| SHARE | Activity/Analytics tab | ViewEvent | View analytics overlay | Share page | Medium |
| SHARE | /api/video/og | OG metadata | Social preview image | Social embeds | Medium |
| SHARE | /s/[videoId]/edit (owner) | Video | Trim, rename, annotate | Share page | High |
| AI | Server transcription pipeline | TranscriptChunk | Auto-transcribe on page load / desktop finalize | Share/Watch | Critical |
| AI | GET /api/video/transcribe/status | TranscriptChunk | Poll transcription status | Share/Watch | High |
| AI | POST /api/videos/[videoId]/retry-transcription | TranscriptChunk | Retry failed transcription | Share/Watch | High |
| AI | GET /api/video/ai (summary/chapters/aiTitle) | AiSummary | Fetch / trigger AI generation | Share/Watch | Critical |
| AI | POST /api/videos/[videoId]/retry-ai | AiSummary | Retry AI generation | Share/Watch | High |
| AI | POST /api/video/ai/chat | TranscriptChunk | RAG chat over transcript | Share/Watch | Critical |
| AI | POST /api/video/tasks/toggle (MISSING ROUTE) | Task | Toggle task completion | Share/Watch | Critical |
| AI | TranscriptPanel / RefinedTranscriptPanel | TranscriptChunk | View, search transcript | Share/Watch | Medium |
| AI | SummaryPanel / SummaryChapters | AiSummary | Read AI summary, chapter nav | Share/Watch | High |
| AI | TasksPanel | Task | View/complete tasks | Share/Watch | Critical |
| AI | AIChatPopup | ChatMessage | Converse with AI about video | Share/Watch | Critical |
| AI | Client status polling | TranscriptChunk, AiSummary | Poll until ready | Share/Watch | Medium |
| DASH | /dashboard/caps (CapCard grid) | Video, Folder | Browse, paginate, bulk-delete | Dashboard | Critical |
| DASH | CapCard dropdown | Video | Copy link, share, settings, analytics, download, duplicate, edit, trim, password, delete | Dashboard | High |
| DASH | Inline rename (cap) | Video | Rename in place | Dashboard | Medium |
| DASH | Folders (rename, delete, toggle public) | Folder | Manage folders | Dashboard | High |
| DASH | /dashboard/folder/[id] | Folder, Video | View folder contents | Dashboard | High |
| DASH | Spaces sidebar / /dashboard/spaces/[id] | Space | Navigate spaces | Dashboard | Medium |
| DASH | SharingDialog | Video | Manage video visibility/password | Dashboard | High |
| DASH | SettingsDialog | Video | Video settings | Dashboard | Medium |
| DASH | PasswordDialog | Video | Set video password | Dashboard | Medium |
| DASH | DashboardSearch | Video | Search across caps | Dashboard | Medium |
| DASH | SelectedCapsBar (bulk delete) | Video | Delete selected caps | Dashboard | High |
| DASH | /dashboard/analytics | ViewEvent | Org-level analytics | Dashboard | High |
| DASH | Org settings (general/members/billing/integrations/permissions/delete) | Organization | Manage org | Settings | High |
| DASH | Account settings (+ Gemini key add/remove) | User, GeminiKey | Edit profile, manage API keys | Settings | Medium |
| DASH | Notifications | Notification | View notifications | Dashboard | Low |
| DASH | Developers portal | AuthApiKey | Create/revoke API keys | Settings | Medium |
| DASH | Admin panel | User | Admin actions | Dashboard | Critical |
| DASH | Empty states | — | See empty dashboard | Dashboard | Medium |

---

## Table B — Entity Lifecycle Matrix

| Area | Entity | Create | Read/List | Edit | Delete | Manage | Missing logic | Priority |
|---|---|---|---|---|---|---|---|---|
| AUTH | User | ✅ invite-claim+admin | ✅ getCurrentUser/admin | ✅ patchAccountSettings | ⚠️ deleteAccount (videos orphaned) | ✅ admin reset/toggle/revoke | No self password change; no email verification; delete doesn't clean caps | Critical |
| AUTH | Session(JWT) | ✅ NextAuth sign-in | — | — | ✅ signOut + signOutAllDevices | — | JWT not revocable before expiry; CSRF sameSite:none | High |
| AUTH | Account(OAuth) | ✅ DrizzleAdapter | ✅ getUserByAccount | — | ✅ unlinkAccount | — | OAuth providers not configured; accounts table empty | Medium |
| AUTH | VerificationToken | ✅ createVerificationToken+requestOtp | ✅ verifyOtp | ✅ upsert | ✅ deleted on use | — | OTP printed plaintext via console.log; verifyOtp no rate-limit | Critical |
| AUTH | Invite(admin) | ✅ generateInviteLink | ✅ getInvites | — | ✅ revokeInvite | — | Expiry not checked; used invite not deleted | High |
| AUTH | OrganizationInvite | ✅ sendOrgInvites/createInviteLink | ✅ members page | — | ✅ removeOrgInvite | ✅ resendOrgInvite | Email invite URL uses record.id not token — ALL email invite links broken | Critical |
| AUTH | OrgMember | ✅ invite-claim/inviteMember | ✅ members page | ✅ update-member-role | ✅ removeOrgMember | — | Ghost user created (no password) — can never log in | High |
| AUTH | Organization | ✅ DrizzleAdapter+redeemInvite | ✅ getDashboardData | ✅ update-details | ⚠️ soft-delete, no UI | ✅ settings | No owner transfer — owner can't delete account | High |
| AUTH | AuthApiKey | ✅ developer settings | — | — | ✅ signOutAllDevices (all wiped) | — | No individual key revoke; all deleted at once | Medium |
| REC | Video(Cap) | ✅ createVideoAndGetUploadUrl | ✅ dashboard | ✅ rename/edit | ✅ delete | ✅ duplicate | No duplicate guard; orphan cleanup may race | Critical |
| REC | videoUploads | ✅ INSERT ON DUP KEY | ✅ status polling | ✅ phase update | — | — | No client-visible recovery; orphaned multipart never aborted | High |
| REC | S3 object/key | ✅ multipart/single PUT | — | — | ✅ deleteObject | — | No duplicate-key guard (silent overwrite); copyObject metadata-fix skipped on MinIO | High |
| REC | Recording spool (IndexedDB) | ✅ create on streaming start | ✅ recoverBlob | — | ✅ cleared after upload | — | Force-kill mid-write may corrupt; recoverBlob returns partial silently | High |
| REC | Extension RetryItem | ✅ addToRetryQueue | ✅ retryQueue | — | ✅ moveToDeadLetter | — | Part retry stores NO blob data → failed parts always dead-letter | Critical |
| REC | MediaRecorder/stream | ✅ new MediaRecorder | — | — | ✅ stopRecording | — | Partial orphan window if startRecording throws after videoInstantCreate | Medium |
| SHARE | Comment | ✅ newComment | ✅ list on share page | — | — | — | No auth check; ignores commentsDisabled setting server-side | Critical |
| SHARE | Reaction | ✅ newComment path | ✅ sidebar | — | — | — | No auth required to react | High |
| SHARE | ViewEvent | ✅ trackVideoView | ✅ analytics tab | — | — | — | Owner view inflates count; silent failure on Tinybird error | Low |
| AI | TranscriptChunk | ✅ transcription pipeline | ✅ TranscriptPanel | — | ⚠️ retry doesn't delete old | — | Old chunks not cleaned on retry → RAG duplicates; race on multi-viewer | High |
| AI | AiSummary | ✅ GET /api/video/ai (triggers generation) | ✅ SummaryPanel | — | — | ✅ retry-ai | No ownership check on trigger endpoint (IDOR-write) | High |
| AI | ChatMessage | ✅ POST /api/video/ai/chat | — | — | — | — | No auth; unbounded history forwarded to Gemini | Critical |
| AI | Task | ✅ (AI generates) | ✅ TasksPanel | ⚠️ toggle route missing | — | — | /api/video/tasks/toggle route does not exist → 404 | Critical |
| DASH | Folder | ✅ create folder | ✅ folder list sidebar | ✅ rename inline | ✅ delete | — | Delete with caps has undefined behavior; no warning about child loss | High |
| DASH | Space | ✅ create space | ✅ spaces sidebar | ✅ rename | ✅ delete | — | — | Medium |
| DASH | Notification | ✅ server push | ✅ notification panel | ✅ mark read | — | — | — | Low |
| DASH | GeminiKey | ✅ account settings | ✅ account settings | — | ✅ immediate delete (no confirm) | — | No deletion confirmation dialog | Medium |

---

## Table C — Flow Inventory

> Columns: # | Flow | Trigger | Steps (brief) | Expected | Edge cases | Gap type | Critical? | Smoke?

### AUTH Flows

| # | Flow | Trigger | Steps | Expected | Edge cases | Gap type | Critical? | Smoke? |
|---|---|---|---|---|---|---|---|---|
| AUTH-1 | Email/password login | User visits /login, submits form | Enter email+pw → NextAuth → JWT → redirect dashboard | Session created, dashboard loads | Wrong creds, locked account | — | YES | YES |
| AUTH-2 | Open redirect via ?next= on login | Attacker crafts /login?next=//evil.com | form.tsx L49-50 uses window.location.href = dest without re-check | Redirect blocked | //evil.com passes startsWith("/") check | F | YES | YES |
| AUTH-3 | Invite token claim (new user) | User clicks /invite/[token] link | Validate token → create account → auto-login → onboarding | Account created, logged in | Expired token, reused token | — | YES | YES |
| AUTH-4 | Invite token claim (existing user) | Existing user clicks invite link | Validate token → try create → dead end | Graceful merge or re-login | No handler for already-registered email | C | YES | YES |
| AUTH-5 | Org email invite: broken URL | Admin sends email invite | sendOrgInvites builds /invite/${record.id}; /invite/[token] queries invites table → "Invalid link" | Member joins org | Always fails — wrong table | C | YES | YES |
| AUTH-6 | Org link invite: wrong claim table | User uses org invite link | ClaimInvite checks invites table, not organization_invites | Org membership granted | Two tables never merge | C | YES | YES |
| AUTH-7 | Onboarding steps (no auth check on external page) | New user completes onboarding | Multi-step wizard → Dashboard | User onboarded | External page accessible unauthenticated | — | NO | YES |
| AUTH-8 | Dashboard/org settings → redirect 404 | Unauthenticated user visits protected route | org settings layout redirects to /auth/signin → page does not exist | Login page shown | 404 error page instead | C | YES | YES |
| AUTH-9 | Admin create user (plaintext password shown) | Admin creates user in /dashboard/admin/access | Fill form → createUser → success toast | User created, password emailed | Password shown plaintext in browser | H | NO | NO |
| AUTH-10 | Admin password reset (old sessions stay valid) | Admin resets user password | resetUserPassword → updates hash only | Old sessions invalidated | authSessionVersion not bumped → JWT valid until expiry | F | YES | YES |
| AUTH-11 | Admin revoke user (no server-side check) | Admin revokes non-admin user | Frontend blocks revoking admin; server has no check | Admins cannot be silently revoked via API | Direct API call bypasses frontend guard | F | NO | NO |
| AUTH-12 | Admin toggle admin (no audit log) | Admin toggles another user's admin flag | toggleAdminRole → DB update | Change recorded in audit log | No audit trail | J | NO | NO |
| AUTH-13 | Sign-out (one device, JWT valid until expiry) | User clicks sign out | Clear cookie → redirect /login | Session dead server-side | JWT remains valid server-side until expiry | D | NO | YES |
| AUTH-14 | Sign-out all devices (no confirm/success) | User clicks "sign out all devices" | bump authSessionVersion + delete sessions/keys | Confirmation + success message | No feedback, no confirm dialog | H | NO | NO |
| AUTH-15 | Self password change (does not exist) | User tries to change own password | No UI or API endpoint exists | Self-service password change | Must contact admin | A | YES | YES |
| AUTH-16 | OTP video protection: code to console, no email, no rate limit | Protected video visited | requestOtp → console.log code; no email; verifyOtp has no throttle | OTP delivered via email; rate limited | Brute forceable; code visible in server logs | F+H | YES | YES |
| AUTH-17 | Account deletion (orphaned data) | User deletes account | deleteAccount → user removed | Caps, invites, API keys cleaned up | Videos/caps orphaned; invites and keys not cleaned | B | NO | NO |
| AUTH-18 | Org settings gate (restricted card) | Non-admin visits org settings | Admin/owner check → restricted card shown | Good UX gating | — | — | YES | YES |
| AUTH-19 | Ghost user creation (passwordless member) | Admin invites non-existent email to org | Creates passwordless user+member; no invite email sent | User gets invite email, sets password | User can never log in | B | YES | NO |
| AUTH-20 | Session version check (DB query every request) | Any authenticated request | getCurrentUser → DB query authSessionVersion | Revocation works | Bottleneck under load | D | NO | NO |

### REC Flows

| # | Flow | Trigger | Steps | Expected | Edge cases | Gap type | Critical? | Smoke? |
|---|---|---|---|---|---|---|---|---|
| REC-1 | Screen/window/tab source selection | User opens recorder dialog | getDisplayMedia → source list → select → confirm | Source selected, recording ready | Permission denied, no sources | — | YES | YES |
| REC-2 | Camera + mic selection | User configures inputs | getUserMedia → device list → select | Inputs captured | Device not available | — | NO | YES |
| REC-3 | No codec support → crash | Browser lacks codec | Codec check fails → null pipeline | Toast + fallback download | No fallback → crash toast, no download | H | YES | YES |
| REC-4 | Streaming-webm record + instant chunk upload | User starts recording | MediaRecorder ondataavailable → presign → PUT chunk | Chunks uploaded in real time | Network drop mid-chunk | — | YES | YES |
| REC-5 | Buffered recording (non-streaming) | User records buffered mode | MediaRecorder → full buffer → stop → process | Recording buffered locally | Large file fills RAM | — | NO | YES |
| REC-6 | Stop recording → finalize | User clicks Stop | stopRecording → finalize pipeline → dashboard | Cap appears in dashboard | Race between stop + onFatalError | — | YES | YES |
| REC-7 | Extension record start | User clicks extension icon | Extension MV3 → getDisplayMedia → start | Recording begins | No apiKey configured | H | YES | YES |
| REC-8 | Buffered-raw stop → MP4 convert → single-part upload (no retry) | Stop buffered recording | Convert to MP4 → single PUT → done | Upload succeeds | Network failure → permanent loss, no retry | H | YES | YES |
| REC-9 | Single-part upload network failure (no retry) | xhr.onerror fires | onerror → reject → error toast | Auto-retry | No retry logic | H | YES | NO |
| REC-10 | Multipart upload: initiate → presign parts → complete | Large file upload | POST initiate → GET presign-part × N → PUT × N → POST complete | Multipart upload completes | Part failure, ETag missing | — | YES | YES |
| REC-11 | Multipart upload: abort | User cancels upload | POST abort → S3 cleanup | Multipart cleaned up | Abort fails silently | — | NO | NO |
| REC-12 | Refresh/navigate during upload → orphaned multipart | User refreshes tab | No beforeunload guard | Abort sent to S3 | Multipart left open forever; row stuck phase:uploading | C | YES | YES |
| REC-13 | Extension multipart upload | Extension records and uploads | Same pipeline via extension | Upload completes | No blob in RetryItem → dead-letter on failure | C | YES | YES |
| REC-14 | S3 CORS setup at boot (MinIO 501 silently swallowed) | App boots | instrumentation.node.ts applyS3BucketCors → 501 → catch only handles BucketAlreadyOwnedByYou | CORS applied | Error swallowed; CORS never set | C | YES | YES |
| REC-15 | Browser PUT to MinIO with no CORS header | Any streaming upload | Browser XHR PUT to presigned URL → CORS preflight → blocked | Upload succeeds | All multipart part PUTs fail | C | YES | YES |
| REC-16 | Extension no apiKey → silent failure | Extension tries to upload | No apiKey → console error only, no popup | User sees error in extension popup | Silent failure | H | YES | YES |
| REC-17 | Extension part retry has no blob → dead-letter | Extension part fails, retries | kind="part" RetryItem has no blob → immediate moveToDeadLetter | Part retried successfully | Always dead-letters | C | YES | NO |
| REC-18 | Recording recovery from IndexedDB spool | App crash mid-record | On reopen → recoverBlob → offer resume | Full recording recovered | Partial blob returned silently | — | NO | NO |
| REC-19 | onFatalError race with stopRecording | Error fires during stop | Both paths trigger → contradictory toasts | Single clear error | Double toast shown | H | NO | NO |
| REC-20 | ETag missing from MinIO PUT response | MinIO presigned PUT | CORS ExposeHeaders missing ETag → "Missing ETag for part N" | ETag returned in response | Multipart complete fails | H | YES | YES |
| REC-21 | Duplicate initiateMultipartUpload on same videoId | Retry or race condition | Previous S3 multipart abandoned (no abort) | Previous cleaned up | S3 multipart leak | B | NO | NO |
| REC-22 | createS3Bucket silently swallows errors | Boot | Non-BucketAlreadyOwnedByYou errors caught and ignored | Error surfaced to ops | Silent failure | H | NO | NO |
| REC-23 | Video instant-create orphan on startRecording error | startRecording throws | videoInstantCreate already called; no cleanup | Orphan cleaned up | Orphan Video row + S3 key | B | NO | NO |
| REC-24 | Desktop app finalize → transcription handoff | Desktop recording stops | Finalize → trigger transcription | Transcription queued | Race if page also triggers | — | YES | YES |
| REC-25 | Share link 403 if bucket policy not set | Bucket create fails silently | public-read policy not applied → GET returns 403 | Share link works | All share video URLs 403 | C | YES | YES |

### SHARE Flows

| # | Flow | Trigger | Steps | Expected | Edge cases | Gap type | Critical? | Smoke? |
|---|---|---|---|---|---|---|---|---|
| SHARE-1 | Stranger visits public share link → watches video | User opens /s/[videoId] | Page loads → CapVideoPlayer → video streams | Video plays | Video not found | — | YES | YES |
| SHARE-2 | Video not found: policy returns "Access granted" | Missing videoId in URL | VideosPolicy.buildCanView: row missing → returns true → notFound() | 404 shown | Policy says "granted" before notFound() | H | YES | YES |
| SHARE-3 | Private video accessed by stranger → PolicyDeniedView | Stranger visits private video URL | Policy check → denied | PolicyDeniedView shown | IDOR-like if policy misconfigured | F | YES | YES |
| SHARE-4 | Password video: correct password | User enters correct password | verifyVideoPassword → unlock | Video plays | No rate limit | H | YES | YES |
| SHARE-5 | Password video: wrong password brute force | Attacker tries many passwords | verifyVideoPassword no throttle/lockout | Account lockout after N attempts | Brute forceable | F | YES | NO |
| SHARE-6 | Auth overlay: email OTP unlock | AuthOverlay shown | Request OTP → enter code → unlock | Video unlocked | Same OTP issues as AUTH-16 | — | YES | YES |
| SHARE-7 | Auth overlay: Google sign-in | AuthOverlay: Google option | OAuth flow → return → unlock | Video unlocked | OAuth not configured | — | NO | NO |
| SHARE-8 | Owner views own share page | Owner opens /s/[videoId] | Same page but with edit/settings controls | Owner controls shown | — | — | YES | YES |
| SHARE-9 | Owner edits video (trim/annotate) | Owner clicks Edit | /s/[videoId]/edit loads | Edit tools shown | — | — | NO | NO |
| SHARE-10 | Viewer posts comment (logged in); error silent | Logged-in viewer submits comment | newComment → DB insert; errors caught → console only | Comment appears; errors surfaced to UI | Silent failure on error | H | YES | YES |
| SHARE-11 | Anonymous user posts comment (no server auth) | Unauthenticated user submits comment | newComment no auth check; authorId="anonymous" | Anonymous posting blocked or explicit opt-in | commentsDisabled ignored server-side | B+F | YES | NO |
| SHARE-12 | Copy plain link | ShareHeader copy button | Copy /s/[videoId] to clipboard | Correct URL copied | — | — | NO | YES |
| SHARE-13 | Copy timestamped link | ShareHeader timestamp copy | Appends ?t=N to URL | Player seeks to N on load | No player code reads ?t= | H | YES | YES |
| SHARE-14 | Post emoji reaction (not logged in) | Sidebar emoji click | newComment path, no auth | Auth required | No auth check | F | YES | NO |
| SHARE-15 | View count tracked (owner visit) | Page load | trackVideoView regardless of role | Owner excluded from count | Owner inflates count | — | NO | NO |
| SHARE-16 | Tinybird analytics silent failure | View tracked | Tinybird API error → caught silently | Retry or log | Silent swallow | H | NO | NO |
| SHARE-17 | Activity tab: view analytics | Analytics tab click | Load activity data | Analytics shown | — | — | NO | NO |
| SHARE-18 | Share branding displayed | Non-owner views | Branding shown below player | Branding visible | — | — | NO | NO |
| SHARE-19 | RecordingInProgress state shown | Video still uploading | PendingRecordingShare shown | Progress indicator | — | — | NO | NO |
| SHARE-20 | SharingDialog: toggle visibility | Owner opens dialog | Toggle public/private | Setting saved | — | — | YES | YES |
| SHARE-21 | SharingDialog: set password | Owner sets password | Enter password → save | Password required on next visit | — | — | YES | YES |
| SHARE-22 | SharingDialog: remove password | Owner removes password | Clear password → save | Video public again | — | — | NO | NO |
| SHARE-23 | OG social preview | Bot requests /api/video/og?videoId=X | OG route renders metadata | Correct title/thumbnail | May bypass password gate | H | NO | NO |
| SHARE-24 | Video seek to chapter | User clicks chapter | Player seeks to timestamp | Correct seek | — | — | NO | NO |
| SHARE-25 | Video fullscreen | User goes fullscreen | Native fullscreen API | Fullscreen works | — | — | NO | NO |
| SHARE-26 | Comments disabled: still postable via direct API | Owner disables comments | commentsDisabled=true | newComment rejects | Server action not gated | F | YES | NO |
| SHARE-27 | Comment list loads | Share page loads | GET comments → render | Comments shown | — | — | YES | YES |
| SHARE-28 | Video download | Download button | Fetch video URL → download | File downloaded | — | — | NO | NO |
| SHARE-29 | IDOR: guess videoId of private video | Attacker guesses ID | VideosPolicy sees missing row → returns true → notFound() | 404 | Policy logic inverted: grants before 404 | F | YES | NO |
| SHARE-30 | Comments disabled: toggle in SharingDialog | Owner disables comments | commentsDisabled saved | Comments blocked | Server not enforcing | F | YES | NO |
| SHARE-31 | ?t= timestamp seek on load (may be broken) | User opens timestamped link | Player should seek to ?t= | Player seeks | No code reads searchParams.t found | H | YES | YES |
| SHARE-32 | IDOR: VideosPolicy returns true for missing video | Any request with unknown videoId | buildCanView L55 returns true for missing row | Correct denial | Access granted to non-existent video | F | YES | NO |

### AI Flows

| # | Flow | Trigger | Steps | Expected | Edge cases | Gap type | Critical? | Smoke? |
|---|---|---|---|---|---|---|---|---|
| AI-1 | Auto-transcription on page load | /s/[videoId] loads | Page load → trigger transcription → Gemini | Transcript generated | Race if multiple viewers open page simultaneously | H | YES | YES |
| AI-2 | Transcription status polling | Client polls GET /api/video/transcribe/status | Poll until status=DONE | Status updates displayed | — | — | NO | YES |
| AI-3 | Gemini error/quota during transcription | Gemini returns error | status → ERROR | Error surfaced to UI | No user-visible message; polling stops silently | H | YES | YES |
| AI-4 | Retry transcription (manual) | User clicks retry | POST retry-transcription → re-queue | Transcript regenerated | Old chunks not deleted → RAG duplicates | B | NO | YES |
| AI-5 | Transcription complete → auto-generate AI | Transcript status=DONE | Auto-trigger AI generation | Summary/chapters/tasks generated | — | — | YES | YES |
| AI-6 | AI generation: summary + chapters + tasks | GET /api/video/ai | Fetch → generate → store | All three AI artifacts ready | Gemini quota exhausted | H | YES | YES |
| AI-7 | View transcript panel | User opens TranscriptPanel | Render chunks | Transcript displayed | No empty/error state handled | — | NO | YES |
| AI-8 | View refined transcript | User opens RefinedTranscriptPanel | Render refined view | Refined transcript shown | No error/empty state | H | NO | NO |
| AI-9 | AI generation retry: no ownership check (IDOR-write) | Any auth'd user hits GET /api/video/ai?videoId=victim | Generates/reads any video AI metadata | Ownership verified | Billed to victim's quota | F | YES | YES |
| AI-10 | AI chat (unauthenticated access) | Anyone POSTs /api/video/ai/chat | No auth check → reads transcript, uses Gemini | Auth required | Drains owner Gemini quota; exposes private content | F | YES | YES |
| AI-11 | AI chat before transcript ready | User chats immediately | Empty transcript context → Gemini hallucinates | Guard: "transcript not ready" | Hallucinated response returned | H+D | YES | YES |
| AI-12 | AI chat normal flow | Logged-in user sends message | Auth → find video → get chunks → Gemini → respond | Accurate response | — | — | YES | YES |
| AI-13 | AI chat: unbounded history to Gemini | Long conversation | All history forwarded | Trimmed to MAX_MESSAGES | No trim → token cost grows unbounded | H | NO | NO |
| AI-14 | Task toggle → 404 (missing route) | User checks off task in TasksPanel | POST /api/video/tasks/toggle → 404 | Task toggled and persisted | Route does not exist; no tasks table | B+C+I | YES | YES |
| AI-15 | Retry transcription: old chunks not deleted | Retry triggered | Old transcriptChunks remain → RAG contains duplicates | Old chunks purged | Duplicate context in chat | B+D | YES | NO |
| AI-16 | /api/video/transcribe/status: no ownership check | Any auth'd user polls | Read transcription status of any video | Ownership verified | Exposes transcription state | F | NO | NO |
| AI-17 | View summary panel | User opens SummaryPanel | Render summary + chapters | Content displayed | — | — | NO | YES |
| AI-18 | View tasks panel (broken) | User opens TasksPanel | Render tasks from AI | Tasks shown; toggle works | Toggle 404s | C | YES | YES |
| AI-19 | IDOR: GET /api/video/ai reads any video AI data | Attacker queries any videoId | auth but no ownership check → returns summary/chapters | Ownership check | Exposes private video AI metadata | F | YES | YES |
| AI-20 | No Gemini API key configured | AI feature triggered | Missing GEMINI_API_KEY → runtime error | Graceful "AI unavailable" message | Unhandled exception | H | YES | YES |
| AI-21 | No rate limiting on AI routes | Attacker hammers /api/video/ai/chat | developerRateLimiter is Hono-scoped, not Next.js | Rate limited | Unlimited requests drain Gemini quota | G+F | YES | YES |
| AI-22 | AI title generation | AI pipeline completes | aiTitle generated and saved | Video title updated | — | — | NO | NO |
| AI-23 | Chapter navigation via AI | User clicks AI chapter | Player seeks to chapter timestamp | Correct seek | Timestamp off by rounding | — | NO | NO |
| AI-24 | Polling stops on ERROR with no user message | status=ERROR returned | Share.tsx stops polling | Error message shown to user | Silent stop, no message | H | NO | NO |
| AI-25 | Tasks feature structurally incomplete | Any task interaction | No route, no tasks table | Feature works | Treat as unreleased | C+I | YES | YES |

### DASH Flows

| # | Flow | Trigger | Steps | Expected | Edge cases | Gap type | Critical? | Smoke? |
|---|---|---|---|---|---|---|---|---|
| DASH-1 | Dashboard loads with 0 caps → crash | User has no caps | DashboardContexts useCurrentUser double use() + redirect() in client → white screen | Empty state shown | "Rendered more hooks" crash | A+C | YES | YES |
| DASH-2 | CapCard thumbnail hydration mismatch | Dashboard loads | generateRandomGrayScaleColor() Math.random() in render → server/client diverge | Consistent thumbnail color | Hydration error every render | H | NO | YES |
| DASH-3 | Browse and paginate caps | User opens /dashboard/caps | Load CapCard grid → paginate | All caps load correctly | — | — | YES | YES |
| DASH-4 | Delete single cap | User deletes cap from dropdown | Confirm → delete → remove from list | Cap deleted, list updated | List not refreshed after delete | B+D | YES | YES |
| DASH-5 | Bulk delete | User selects caps → delete all | SelectedCapsBar → bulk delete | All selected caps deleted | Empty state crash risk; partial failure no per-item feedback | H+D | YES | NO |
| DASH-6 | Move cap to folder (drag) | User drags cap to folder | moveVideoToFolder → toast (no router.refresh()) | Cap moves; list updates | Cap stays in root list visually | D | YES | NO |
| DASH-7 | Move cap OUT of folder | User wants to unassign folder | No UI action available | Remove-from-folder action | Feature missing entirely | A | YES | NO |
| DASH-8 | Delete folder with caps | User deletes folder | rpc.FolderDelete; no warning about child caps | Confirm with warning; caps moved or listed | Possible silent data loss | B+H | YES | NO |
| DASH-9 | Inline rename cap | User clicks cap name | Edit in place → save | Name updated | — | — | NO | YES |
| DASH-10 | Inline rename folder | User clicks folder name | Edit in place → save | Name updated | — | — | NO | NO |
| DASH-11 | Create folder | User creates folder | New folder → add to sidebar | Folder created | — | — | NO | NO |
| DASH-12 | Toggle folder public | User toggles folder public | updateFolder → save | Visibility updated | — | — | NO | NO |
| DASH-13 | Open /dashboard/folder/[id] | User clicks folder | Load folder contents | Folder page loads | Empty folder | — | YES | YES |
| DASH-14 | redirect() in client component | Session expires on dashboard | DashboardContexts:158 redirect("/login") in "use client" | Redirect to login | White screen / throw | C | YES | YES |
| DASH-15 | View analytics for a cap → likely 404 | User clicks "View analytics" in CapCard dropdown | Routes to /dashboard/analytics/s/${cap.id} | Analytics page loads | Route does not exist → 404 | C | YES | YES |
| DASH-16 | Dashboard search | User types in search | DashboardSearch → API → results | Matching caps shown | — | — | NO | YES |
| DASH-17 | SharingDialog: manage visibility | User opens sharing dialog | Toggle public/private/password | Settings saved | — | — | YES | YES |
| DASH-18 | SettingsDialog: video settings | User opens settings | Edit metadata | Settings saved | — | — | NO | NO |
| DASH-19 | PasswordDialog: set password | User sets password | Enter password → save | Password required on share | — | — | NO | NO |
| DASH-20 | Download cap | User clicks download | Fetch file URL → download | File downloaded | — | — | NO | NO |
| DASH-21 | Duplicate cap | User duplicates cap | Copy video → new record | Duplicate appears | — | — | NO | NO |
| DASH-22 | Edit/trim cap | User opens trim | Trim editor loads | Trim saved | — | — | NO | NO |
| DASH-23 | Copy share link | User copies link | URL to clipboard | Correct link | — | — | NO | YES |
| DASH-24 | View org analytics | User opens /dashboard/analytics | Load org-level analytics | Analytics displayed | — | — | NO | NO |
| DASH-25 | Org settings: update general details | Admin opens org settings | Edit name/domain → save | Settings saved | — | — | NO | NO |
| DASH-26 | Org settings: manage members | Admin opens members tab | Invite/remove/change roles | Member list updated | — | — | YES | YES |
| DASH-27 | Drag-drop to folder: list not refreshed | User drags cap to folder | router.refresh() not called | UI updates after drop | Cap stays in root list | D | YES | NO |
| DASH-28 | Account settings: remove Gemini key (no confirm) | User removes Gemini key | Immediate delete, no confirmation | Confirm dialog shown | Accidental key deletion | H | NO | NO |
| DASH-29 | Spaces navigation | User clicks space in sidebar | Load /dashboard/spaces/[id] | Space content shown | — | — | NO | NO |
| DASH-30 | Analytics route 404 | User navigates to analytics | /dashboard/analytics/s/[capId] not defined | Analytics loads | 404 | C | YES | YES |
