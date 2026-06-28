# RUN 3 — Core Video Pipeline (2026-06-25)

**Scope:** Record → Upload → Trim → Play → Transcript → AI analysis → Share/Viewer  
**Method:** Static code read, no execution  
**Source repo:** `C:\Users\localhost\Desktop\ustoz-github`

---

## RUN 3 Totals

| Metric | Count |
|---|---|
| Total Table-C rows | 50 |
| Critical flows | 22 |
| Smoke flows | 21 |
| Gap A (missing mgmt action) | 1 |
| Gap B (incomplete CRUD / lifecycle) | 6 |
| Gap C (broken journey / dead-end) | 4 |
| Gap D (missing state sync) | 3 |
| Gap E (missing relationship handling) | 0 |
| Gap F (missing permission) | 4 |
| Gap G (missing automation control) | 1 |
| Gap H (missing feedback / error handling) | 10 |
| Gap I (looks-interactive-but-isn't) | 2 |
| Gap J (missing audit / history) | 0 |

---

## Top 8 Most-Likely-Real Gaps (ranked by severity)

| Rank | Gap ID | Description | File:Line | Type |
|---|---|---|---|---|
| 1 | C1 | AI analysis does NOT auto-run after transcription unless `aiGenerationEnabled` flag was set in the original dispatch job payload — flag source is `isAiGenerationEnabled(user)` read at page level and forwarded into the transcription job. If the job was queued without the flag (e.g. via desktop finalize, import, or any path that doesn't pass the flag), transcription completes silently and the user sees no summary, no action items, no chapters, with no error and no prompt to trigger AI. | `apps/web/workflows/transcribe.ts:97-99`, `apps/web/utils/flags.ts`, `apps/web/lib/generate-ai.ts:16` | G |
| 2 | C2 | `processVideoWorkflow` deletes the `videoUploads` row and never creates `result.mp4`. Playlist route priority 3 falls back to `raw-upload` via `resolveRawPreviewKey` — but priority 6 (custom bucket + isMp4Source) has NO raw fallback and returns 404. Any self-hosted install using a custom bucket with `isMp4Source` gets a permanent playback 404 after processing. | `apps/web/workflows/process-video.ts:37`, `apps/web/app/api/playlist/route.ts:priority-6` | C |
| 3 | C3 | Upload orphan on import network failure: if `uploadWithTarget` throws mid-upload, `ImportFilePage.tsx` catch (line 382) shows a toast but never cleans up the `videos` row or `videoUploads` row created at line 260. Row stays at `phase:uploading` forever; no retry path exists for this state from the dashboard. | `apps/web/app/(org)/dashboard/import/file/ImportFilePage.tsx:260,382` | B |
| 4 | C4 | Extension dead-letter queue: `moveToDeadLetter` writes to `capExtDeadLetterQueue` in `chrome.storage.local` but there is zero code anywhere to read, drain, or clear it. Failed upload parts accumulate silently indefinitely. User sees a notification but has no way to retry. | `apps/browser-extension/src/background/upload.ts` | B |
| 5 | C5 | Extension `kind:"part"` RetryItem stores no blob bytes — the retry handler re-reads the bytes from `inMemoryBuffer` which is already cleared after finalization. Every failed part goes straight to dead-letter on the first retry attempt. | `apps/browser-extension/src/background/upload.ts:scheduleRetry` | B |
| 6 | C6 | AI chat is completely unauthenticated: `POST /api/video/ai/chat` has no auth check. Any anonymous user can query the transcript and drain the video-owner's Gemini API key. Rate limiter is an in-process Map — resets on deploy, not shared across instances. | `apps/web/app/api/video/ai/chat/route.ts` | F |
| 7 | C7 | No audio chunking for transcription: the entire extracted MP3 is sent as a single URL to Gemini. Very-long videos (>60 min audio) will hit Gemini's file-size/token limits and fail with `transcriptionStatus=ERROR` — the retry button re-runs the same full-file request. | `apps/web/workflows/transcribe.ts:290-342` | H |
| 8 | C8 | Camera-denied and screen-share-cancelled show the same generic toast ("Could not start recording.") — no actionable differentiation. Also, a 0-second recording (accidental start+stop, empty blob) is only caught at `recording-upload.ts` (`blob.size === 0` check) for buffered path; the streaming-webm path has no such guard and will attempt multipart complete with 0 parts. | `apps/web/app/(org)/dashboard/caps/components/web-recorder-dialog/recording-upload.ts`, `web-recorder-dialog/useWebRecorder.ts` | H |

---

## Table A — Platform Map (Core Video Pipeline)

| Area | Screen / Route | Entity | Main user actions | Related screens | Risk |
|---|---|---|---|---|---|
| Record — Web | `/dashboard/caps` → Web Recorder Dialog | Video, MediaStream, videoUploads | Select source (screen/window/tab/camera), configure mic, start, pause, stop, cancel | Dashboard | Critical |
| Record — Extension | Chrome MV3 extension popup / recorder tab | Video, MediaRecorder chunks, RetryItem | Start screen/tab/meet recording, stop, auto-upload | Dashboard | Critical |
| Record — Desktop (Tauri) | Native desktop app (external binary) | Video, desktop segments | Record, finalize via `/api/upload/recording-complete` | Dashboard | High |
| Upload / Create | `/api/upload/multipart/*`, `actions/video/create-for-processing.ts`, `actions/video/upload.ts` | Video, videoUploads, S3 objects | Initiate multipart, presign parts, complete, abort; single-part upload | All recording paths | Critical |
| Import — File | `/dashboard/import/file` | Video, videoUploads | Drag/drop video file, optional client-side trim, upload | Dashboard | High |
| Import — Loom | `/dashboard/import/loom` | Video, videoUploads | Paste Loom URL, bulk CSV import | Dashboard | Medium |
| Trim | `/dashboard/import/file` → PreUploadTrimmer (client-side) | Video (new), trimmed File | Set in/out points (lossless or precise), upload trimmed result as new Video | Import, Dashboard | Medium |
| Play / Playlist | `/api/playlist/route.ts`, `/s/[videoId]` | Video, S3 objects (result.mp4 / raw-upload / segments) | Request video source, adaptive fallback selection | Viewer | Critical |
| Viewer — Share page | `/s/[videoId]` | Video, Comment, Reaction, TranscriptChunk, AiSummary | Watch video, view tabs (Summary/Action Items/Transcript/Refined), comment, react, AI chat | Share | Critical |
| Transcript | `workflows/transcribe.ts`, `GET /api/video/transcribe/status` | TranscriptChunk | Auto-transcribe on page load, retry | Viewer | Critical |
| AI Analysis | `workflows/generate-ai.ts`, `GET /api/video/ai`, `POST retry-ai` | AiSummary (summary, chapters, action items, refined transcript) | Auto-run after transcription (gated), manual "Start AI analysis", retry | Viewer | Critical |
| AI Chat | `/api/video/ai/chat`, `AIChatPopup.tsx` | ChatMessage, TranscriptChunk | Converse with AI about video content | Viewer | High |
| Share / Viewer — Comments | `actions/videos/new-comment.ts`, Sidebar | Comment | Post comment (guest or auth), delete own, react | Viewer | High |

---

## Table B — Entity Lifecycle Matrix (Core Video Pipeline)

| Entity | Create | Read / List | Edit | Delete / Archive | Manage / Configure | Missing logic | Priority |
|---|---|---|---|---|---|---|---|
| Video | ✅ `createVideoAndGetUploadUrl` / `createVideoForServerProcessing` at `actions/video/upload.ts:109`, `actions/video/create-for-processing.ts:33` | ✅ dashboard grid, `/s/[videoId]` server query | ✅ rename, settings | ✅ `deleteVideo` action (cascades S3 delete) | ✅ visibility, password, folder | Orphan row if upload never completes and user never returns; no self-healing expiry | Critical |
| Upload (raw) / videoUploads | ✅ `db.insert(videoUploads)` on multipart initiate or create-for-processing | ✅ polling via `rpc.GetUploadProgress` | ✅ phase progression (`uploading→processing→deleted`) | ✅ deleted by `processVideoWorkflow` (happy path) or abort endpoint | ❌ no manual retry/cleanup from dashboard | Rows stuck at `phase:uploading` forever if upload fails or browser crashes mid-upload; no expiry cron | Critical |
| Transcript | ✅ `workflows/transcribe.ts` writes VTT to S3 + `transcriptChunks` rows | ✅ `TranscriptPanel`, `GET /api/video/transcribe/status` | ❌ not editable | ⚠️ retry does NOT delete old `transcriptChunks` rows first (`transcribe.ts:47-102`) | ✅ retry button in `GenerateAiPanel.tsx:209` | Old transcript chunks accumulate on retry → duplicate RAG context; no purge step | High |
| AI Analysis (summary / action-items / chapters) | ✅ `workflows/generate-ai.ts:133` via `startAiGeneration` | ✅ `SummaryPanel`, `TasksPanel`, `BelowVideoTabs.tsx` | ❌ not editable post-generation | ❌ no delete; only overwrite via regenerate | ✅ retry (`POST /api/videos/[videoId]/retry-ai`) + manual trigger (`GenerateAiPanel.tsx:236`) | Auto-trigger gated on `aiGenerationEnabled` flag in job payload — missing from several upload paths (see C1 gap); no ownership check on `GET /api/video/ai` (IDOR) | Critical |
| Comment | ✅ `actions/videos/new-comment.ts` (guest or auth) | ✅ loaded server-side at page load, static (no real-time) | ❌ no edit for guest comments | ✅ auth'd delete (own or video owner) | ❌ `commentsDisabled` flag NOT enforced server-side | Guest can post even when `commentsDisabled=true`; no server-side auth guard on create; static (no push/SSE — multi-viewer sees stale list) | High |

---

## Table C — Flow Inventory (Core Video Pipeline)

| # | Flow | Trigger | Steps | Expected result | Edge cases | Gap type | Critical? | Smoke? |
|---|---|---|---|---|---|---|---|---|
| **RECORD** | | | | | | | | |
| R-01 | Web recorder: screen + mic, streaming-webm path | User opens web recorder dialog, selects screen source | `getDisplayMedia` → `getUserMedia(audio)` → `MediaRecorder.start()` → chunks stream to `InstantRecordingUploader` → multipart presign-part PUT per 5 MB → stop → finalize → multipart complete → `startVideoProcessingWorkflow` auto-triggered via `isRawRecorderUpload` check | Recording appears in dashboard; playable immediately | `apps/web/app/(org)/dashboard/caps/components/web-recorder-dialog/useWebRecorder.ts:683` | — | YES | YES |
| R-02 | Web recorder: screen permission denied | User cancels `getDisplayMedia` dialog | `NotAllowedError` / `AbortError` caught by `isUserCancellationError()` → generic `toast.error("Could not start recording.")` | Distinct "permission denied" message vs "you cancelled" | Both errors produce identical toast; no actionable guidance | H | YES | YES |
| R-03 | Web recorder: camera permission denied | Camera mode, user denies camera access | `getUserMedia` → `NotAllowedError` → `useMediaPermission` state `"denied"` → re-thrown → generic toast | "Allow camera access in browser settings" message | Generic toast only; `CameraSelector` pill shows denied but user may not see it | H | NO | YES |
| R-04 | Web recorder: mic unavailable | Mic fails after screen share succeeds | `getUserMedia(audio)` fails → `toast.warning("Microphone unavailable. Recording without audio.")` → continues | Warning toast + silent-mic icon | Icon only (`<MicOff>`), no banner; user may not notice recording is silent | H | NO | YES |
| R-05 | Web recorder: 0-second / empty recording (buffered-raw path) | Accidental start+immediate stop | `blob.size === 0` check in `recording-upload.ts` → `throw "Cannot upload empty file"` | User sees clear error, no upload attempted | Caught and shown as toast; ✅ handled | — | NO | NO |
| R-06 | Web recorder: 0-chunk recording (streaming-webm path) | Start + immediate stop before first 5 MB chunk | `InstantRecordingUploader.finalize()` called with no parts uploaded; multipart complete sent with 0 ETags | Error surfaced to user | S3 may reject 0-part complete; no guard in `InstantRecordingUploader`; behaviour depends on S3 impl | H | YES | YES |
| R-07 | Web recorder: very short recording (<1 s) | Quick start+stop | Blob created, upload proceeds | Upload succeeds; short video playable | No minimum-duration guard in either path; a 200 ms blob uploads and plays fine (blank frames) | — | NO | NO |
| R-08 | Web recorder: browser crash / tab close during streaming upload | Tab killed mid-recording | IndexedDB spool (`recoverBlob`) contains partial data; on next open, recovery toast shown | Full recording recovered or partial clearly labelled | Partial blob returned silently without byte count; user doesn't know how much was saved | H | NO | NO |
| R-09 | Extension: tab/screen recording start | Extension popup → "Record" | `chrome.tabCapture.getMediaStreamId` / `getDisplayMedia` → offscreen recorder → `RECORDER_STARTED` → `initializeUpload` → chunks via `RECORDER_CHUNK` | Recording begins; upload starts | No minimum-size check; very-short recording sends `totalBytes < 10 KB` → `finalizeUpload` catches and errors (✅ guard exists at `upload.ts`) | — | YES | YES |
| R-10 | Extension: Google Meet auto-detect and nudge | User joins Meet call | `meet-detect.ts` MutationObserver + `setInterval` polls `isInMeeting()` → shows nudge card | Nudge shown; user can start recording | Google changes "Leave call" selector → detection breaks; no fallback | H | NO | NO |
| R-11 | Extension: upload part network failure → dead-letter | A multipart PUT fails after 6 retries | `moveToDeadLetter` appends to `capExtDeadLetterQueue` in `chrome.storage.local` | User can see and retry failed parts | Dead-letter queue is write-only; never drained; `kind:"part"` RetryItem has no blob → dead-letter on first retry | B | YES | NO |
| R-12 | Extension: late `RECORDER_STARTED` after cancel | User cancels then a delayed `RECORDER_STARTED` arrives | SW `sw.ts:694`: state not `"arming"` → silently falls back to mode `"instruction"` with undefined IDs | Orphan upload rejected | Orphan upload initialized with undefined videoId/uploadId | H | NO | NO |
| R-13 | Extension: MIME type unsupported | Browser lacks all codec candidates | `pickMimeType()` returns `"video/webm"` regardless of `isTypeSupported` result | Error surfaced | Silent fallback to unsupported type; `MediaRecorder` will throw on start | H | NO | NO |
| **UPLOAD / CREATE** | | | | | | | | |
| U-01 | Multipart upload: full happy path | Web recorder streaming-webm stop | `POST /multipart/initiate` → `POST /multipart/presign-part` × N → `PUT` parts to S3 → `POST /multipart/complete` → `isRawRecorderUpload` → `startVideoProcessingWorkflow` → `processVideoWorkflow` deletes `videoUploads` row | Video row exists, `videoUploads` deleted, video playable | — | — | YES | YES |
| U-02 | Multipart upload: browser navigates away before complete | User closes tab during upload | No `beforeunload` guard in web app; multipart left open in S3; `videoUploads` row stays `phase:uploading` | Stale row cleaned by cron or user retry | No cron to abort stale S3 multiparts; row stuck forever | B | YES | YES |
| U-03 | File import: upload fails mid-way | `uploadWithTarget` throws | `ImportFilePage.tsx:382` catch shows toast, returns false | `videos` + `videoUploads` rows cleaned up | Both rows orphaned; no cleanup | B | HIGH | YES |
| U-04 | File import: `@remotion/media-parser` fails | Unusual video codec | Parse error silently swallowed at line 252-256 | Duration/resolution stored | Upload proceeds with no metadata; pro gate (300s limit) cannot fire | H | NO | NO |
| U-05 | File import: `triggerVideoProcessing` fails | S3 `headObject` retries exhausted | `triggerVideoProcessing` throws; `ImportFilePage.tsx:375` shows toast | `videoUploads` phase set to `error` | Phase stays `uploading`, not `error`; retry logic (`shouldForceRetryProcessing`) won't apply for 90 s | D | HIGH | YES |
| U-06 | `processVideoWorkflow`: deletes videoUploads, never creates result.mp4 | Any upload path triggers processing | `process-video.ts:37` deletes row; returns "skipped" | result.mp4 created by transcoding | No transcoding; raw file IS the served file; naming is vestigial | — | YES | YES |
| U-07 | `processVideoWorkflow`: DB delete fails | `db().delete(videoUploads)` throws | `setProcessingError` called → tries to UPDATE deleted row → 0 rows affected → error state not persisted | Error state written to DB | Silent: error never recorded | H | NO | NO |
| U-08 | Loom import: `retryVideoProcessing` passes empty `loomDownloadUrl` | Loom video retry triggered | `retry-processing.ts:97` passes `loomDownloadUrl:""` | Non-empty URL passed | Empty string is a contract violation; `importLoomVideoWorkflow` re-fetches via `fetchFreshLoomDownloadUrl` so it works today, but fragile | H | NO | NO |
| **TRIM** | | | | | | | | |
| T-01 | Client-side lossless trim (pre-upload) | User trims before import | ffmpeg.wasm `-c copy -avoid_negative_ts make_zero` → trimmed `File` → `createVideoForServerProcessing` (new Video row) → upload to `raw-upload.mp4` | Trimmed video uploaded as new cap | Cut on nearest keyframe, not frame-accurate; user may see a few extra frames | — | NO | YES |
| T-02 | Client-side precise trim | User selects "precise" mode | ffmpeg.wasm full re-encode (`libx264/aac`) → new Video row → upload | Frame-accurate trim | Slow for long videos (client-side CPU); no progress indicator during re-encode | H | NO | NO |
| T-03 | Trim of already-uploaded video (post-upload) | Search for post-upload trim | No post-upload trim dialog found in codebase; `PreUploadTrimmer` is only in import flow | Post-upload trim available | ❌ Post-upload trim does not exist as a separate flow; "Edit/trim cap" in dashboard CapCard dropdown navigates to a route that may not implement server-side trim | A | NO | NO |
| T-04 | Trim cancel mid-ffmpeg | User cancels during re-encode | ffmpeg.wasm has no cancel API in current usage; browser tab must be closed | Cancel button aborts operation | No cancel possible during encode; UX freezes | H | NO | NO |
| **PLAY / PLAYLIST** | | | | | | | | |
| P-01 | Viewer loads; video plays (S3, mp4 type, result.mp4 missing → raw fallback) | User opens `/s/[videoId]` | `GET /api/playlist?videoId=...` → priority 3: checks result.mp4 → zero-size/missing → `resolveRawPreviewKey` → 302 redirect to raw-upload signed URL | Video plays | `resolveRawPreviewKey` probes `raw-upload.mp4` then `.webm` via `headObject`; if both missing, 404 | — | YES | YES |
| P-02 | Viewer: custom bucket + isMp4Source → no raw fallback | Self-hosted custom bucket | Playlist priority 6: `result.mp4` only; no `resolveRawPreviewKey` fallback | 404 → "Could not load a playable video source" | Since `processVideoWorkflow` never creates result.mp4, ALL custom-bucket installs get permanent playback 404 | C | YES | YES |
| P-03 | Viewer: video still uploading / processing | User opens share link before processing done | `useUploadProgress` polls `rpc.GetUploadProgress`; player shows progress ring + status text | Playback starts when ready | Polling stops when `videoUploads` row deleted (by `processVideoWorkflow`) — player transitions to playing | — | YES | YES |
| P-04 | Viewer: upload stalled > 5 min | Upload hung | `useUploadProgress` detects stall → "Upload stalled before processing finished" overlay | User can retry | No retry button shown from this state; user must navigate to dashboard | H | NO | NO |
| P-05 | Viewer: `segments` type HLS | Desktop app recording | Playlist reads `segments/manifest.json`; returns HLS playlists; player uses hls.js | HLS plays | If `manifest.is_complete=false` and `requireComplete` set, 404 | — | YES | YES |
| P-06 | Viewer: deep-link `/s/[videoId]` opens correct video | User receives share link | Server component reads `params.videoId` → DB query → render | Correct video shown | Wrong videoId → policy returns `true` (IDOR) then `notFound()` | F | YES | YES |
| P-07 | Viewer: video with no audio track | Video recorded without mic | Player renders; no audio control; VTT transcript may be empty | Clear "no audio" indicator | No visual indicator that audio is absent; `NO_AUDIO` transcription status not surfaced as user message | H | NO | NO |
| P-08 | Viewer: very long video playback | Video > 2 hours | Signed URL expiry vs playback duration | URL valid for full playback | S3 presigned URL default expiry (typically 1 hr) may expire mid-playback for very long videos | H | NO | NO |
| **TRANSCRIPT** | | | | | | | | |
| TR-01 | Auto-transcription triggered on page load | `/s/[videoId]` first load | `GET /api/video/transcribe/status` (client) or server-side trigger → `transcribeVideoWorkflow` → Gemini → VTT → `transcriptChunks` | Transcript appears | Race: multiple viewers simultaneously trigger transcription; no distributed lock | H | YES | YES |
| TR-02 | Transcription: no audio in video | Video has no audio track | `extractAudio` → `checkHasAudioTrack` → `transcriptionStatus = "NO_AUDIO"` | "No audio" message in UI | `NO_AUDIO` status not surfaced as user-visible message in viewer (`GenerateAiPanel.tsx` may hide button) | H | YES | YES |
| TR-03 | Transcription: very long video (> ~60 min) | User uploads long lecture/meeting | Entire MP3 sent as single URL to Gemini; no chunking | Chunked transcription | Gemini file size / token limit hit → `transcriptionStatus = "ERROR"`; retry re-runs same full-file request; no chunking fallback | H | YES | YES |
| TR-04 | Transcription fails (Gemini error / quota) | Gemini API error | Outer catch sets `transcriptionStatus = "ERROR"` | "Retry" button shown | `GenerateAiPanel.tsx:209` shows Retry ✅; stale-jobs cron recovers stuck `PROCESSING` → `ERROR` ✅ | — | YES | YES |
| TR-05 | Retry transcription: old chunks not deleted | User clicks "Retry" | `POST retry-transcription` resets status → re-queues | Old `transcriptChunks` purged before re-run | Old chunks NOT deleted; RAG embedding accumulates duplicates → AI chat gives stale/doubled context | B | NO | YES |
| TR-06 | Transcript panel renders | User opens Transcript tab | `TranscriptPanel` renders `transcriptChunks` | Transcript with timestamps shown | No empty-state message when transcript is empty but status is not yet started | H | NO | YES |
| **AI ANALYSIS** | | | | | | | | |
| AI-01 | Auto-AI after transcription: gated by `aiGenerationEnabled` flag | Transcription completes | `transcribe.ts:97-99`: if `aiGenerationEnabled` → `queueAiGeneration()` | AI runs automatically | Flag set only if passed in original job payload; import path and desktop path may not set it → user must manually click "Start AI analysis" | G | YES | YES |
| AI-02 | Manual "Start AI analysis" trigger | User clicks button in `GenerateAiPanel.tsx:236` | `POST /api/videos/[videoId]/generate` → `startAiGeneration` → `QUEUED` → `PROCESSING` → `COMPLETE` | Summary, chapters, action items generated | No ownership check on endpoint; any authenticated user can trigger AI on any video (IDOR-write, billed to owner's Gemini quota) | F | YES | YES |
| AI-03 | AI analysis: BUDGET_EXCEEDED | Gemini billing limit reached | `aiGenerationStatus = "BUDGET_EXCEEDED"` | Clear "quota exceeded" message + link to add Gemini key | Status stored but `GenerateAiPanel.tsx` may show generic error; no tailored UI path found | H | NO | YES |
| AI-04 | AI generation fails (Gemini error) | Gemini API error | `aiGenerationStatus = "ERROR"` | Retry button shown | `GenerateAiPanel.tsx:209` shows Retry ✅; stale-jobs cron recovers stuck `PROCESSING` ✅ | — | YES | YES |
| AI-05 | View Summary tab | User opens Summary tab | `SummaryPanel` renders `aiSummary.summary`; `SummaryChapters` renders chapters list | Summary + chapters shown | Chapters clickable → player seeks ✅; empty state if AI not yet run shown as `GenerateAiPanel` | — | NO | YES |
| AI-06 | View Action Items tab | User opens Action Items tab | `TasksPanel` renders `aiSummary.tasks` | Tasks listed with checkboxes | Toggle calls `POST /api/video/tasks/toggle` which does NOT exist → 404; tasks appear interactive but are not | I | YES | YES |
| AI-07 | AI chat: unauthenticated | Anonymous user opens AI chat FAB | `POST /api/video/ai/chat` — no auth check | Auth required | No auth guard; drains video owner's Gemini key; exposes transcript | F | YES | YES |
| AI-08 | AI chat: chat before transcript ready | User sends message before transcription | Empty `transcriptChunks` → Gemini has no context → hallucinated response | "Transcript not ready" guard | No guard; Gemini responds with fabricated content | H | YES | YES |
| AI-09 | AI chat: rate limit | User sends 21st message in 60 s | In-memory Map → HTTP 429 | Rate limit persists across server restarts | Map resets on each deploy/restart; not shared across instances | H | NO | NO |
| AI-10 | Stale-jobs cron recovers stuck AI/transcript jobs | `PROCESSING` job hangs > N minutes | `app/api/cron/recover-stale-ai-jobs/route.ts:65,79` sets status to `ERROR` | Recovery fires; user sees error + retry | ✅ cron exists; retry path works | — | NO | NO |
| **SHARE / VIEWER** | | | | | | | | |
| S-01 | Deep-link to `/s/[videoId]` opens correct video | User taps share link | Server query by `videoId` → render video page | Correct video shown | ✅ correct | — | YES | YES |
| S-02 | Viewer: refresh mid-playback | User presses F5 at timestamp 45 s | Page reloads; player starts from 0 (no persisted position) | Player resumes at last position | No playback position persistence | H | NO | YES |
| S-03 | Kill + relaunch browser, open share link | Browser killed; user reopens link | Fresh page load; video loads from start | Session-independent; video loads | ✅ stateless share link works | — | YES | YES |
| S-04 | Viewer: server error during page load | DB unreachable | Next.js error boundary or 500 page | Friendly error page | Standard Next.js 500 shown | — | NO | YES |
| S-05 | Viewer: long/special-char video title | Title contains `<script>` or 4000-char string | Title rendered in `<h1>` via React (escaped) | XSS blocked; title truncated | React escapes HTML ✅; no length cap in DB schema found | — | NO | NO |
| S-06 | Viewer: comment submission server error | DB write fails in `newComment` | Error caught in server action → `console.error` only | Error toast shown to user | Silent failure; no user feedback | H | YES | YES |
| S-07 | Viewer: comment posted when commentsDisabled=true | Guest posts comment on video with commentsDisabled | Server action `new-comment.ts` does NOT check `commentsDisabled` flag | Comment rejected server-side | Comment saved regardless of setting | B+F | YES | NO |
| S-08 | Viewer: cancel share dialog mid-flow | User opens SharingDialog, partially changes settings, closes | Dialog close without save | Changes discarded | ✅ no auto-save; close = discard | — | NO | NO |
| S-09 | Viewer: very long video streaming | User plays 3-hour recording | S3 signed URL redirect; player streams | Playback works end-to-end | Signed URL may expire (default 1 hr) before video ends; player gets 403 mid-playback; no refresh mechanism | H | NO | YES |
| S-10 | Viewer: tabs (Summary/Action Items/Transcript/Refined) render and navigate | User clicks each tab | `BelowVideoTabs.tsx` shows/hides panel; URL `?tab=` updated | Correct panel shown | Action Items tab shows interactive checkboxes that 404 on click; Refined tab only shown if `refinedTranscript` exists | I | YES | YES |

---

---

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
