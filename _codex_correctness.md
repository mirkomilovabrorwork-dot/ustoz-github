No files modified. I did a read-only static audit of the main flows; I did not run a browser smoke/dev server.

**Critical**
1. AI pipeline is not automatic after record/upload/import. The product promise says “upload → transcript/summary/chat”, but upload only triggers `processVideoWorkflow`, and that workflow now just deletes the upload row and returns success. Transcription is explicitly manual.
   - `apps/web/actions/video/trigger-instant-recording-processing.ts:28`
   - `apps/web/actions/video/trigger-processing.ts:52`
   - `apps/web/workflows/process-video.ts:35`
   - `apps/web/actions/videos/get-status.ts:110`
   - `apps/web/app/s/[videoId]/_components/GenerateAiPanel.tsx:216`
   - User-visible result: teacher records, shares link, students can watch, but transcript/summary/chat may never appear unless owner/admin opens the share page and clicks generate. For an external reviewer, this looks broken.

**High**
1. File import creates DB rows before upload and does not clean them up if upload fails.
   - `apps/web/app/(org)/dashboard/import/file/ImportFilePage.tsx:259`
   - `apps/web/app/(org)/dashboard/import/file/ImportFilePage.tsx:344`
   - User-visible result: network drop/large upload failure can leave dead videos or “processing” ghosts. Share page may show preparing state for a while, then broken playback.

2. Server-processing upload path bypasses quota checks while older upload path has quota checks.
   - Checked path with quota: `apps/web/actions/video/upload.ts:144`
   - Bypass path: `apps/web/actions/video/create-for-processing.ts:33`
   - UI also says “up to any size”: `apps/web/app/(org)/dashboard/import/file/ImportFilePage.tsx:186`
   - Result: self-hosted storage/R2/S3 can be filled accidentally. Katta fayl bilan production risk bor.

3. Loom import downloads whole video into memory.
   - `apps/web/workflows/import-loom-video.ts:172`
   - Result: large Loom videos can spike memory or crash the worker/server instead of streaming safely with size limits.

4. AI chat is exposed even when transcript index is missing, and the client hides the real server error.
   - FAB rendered regardless of readiness: `apps/web/app/s/[videoId]/_components/ShareVideo.tsx:588`
   - API correctly returns 409 when chunks are missing: `apps/web/app/api/video/ai/chat/route.ts:190`
   - Client throws generic error before reading JSON: `apps/web/app/s/[videoId]/_components/AIChatPopup.tsx:310`
   - Indexing failures are swallowed after transcript completion: `apps/web/workflows/transcribe.ts:433`
   - Result: student clicks AI chat and sees “Something went wrong”, not “AI is still preparing”.

5. Folder add action does not verify the folder belongs to the active org/space.
   - `apps/web/actions/folders/add-videos.ts:32`
   - Then writes shared/space folder rows: `apps/web/actions/folders/add-videos.ts:55`
   - Result: if a user knows/gets a folder id, they can potentially attach their videos into another org/space folder context. This is auth/data-integrity risky.

**Medium**
1. Comments fail silently and optimistic text is lost.
   - Input clears before server success: `apps/web/app/s/[videoId]/_components/tabs/Activity/CommentInput.tsx:43`
   - Submit failure only logs: `apps/web/app/s/[videoId]/_components/tabs/Activity/Comments.tsx:138`
   - Delete failure only logs: `apps/web/app/s/[videoId]/_components/tabs/Activity/Comments.tsx:202`
   - Result: student thinks comment was posted, refreshes, comment yo‘q. Bad classroom UX.

2. Share page breaks if owner user row is missing/deleted.
   - Inner join to users: `apps/web/app/s/[videoId]/page.tsx:432`
   - Result: old shared links can become 404/dead instead of showing a graceful unavailable/owner-deleted state.

3. Uploads stuck longer than 1 hour stop being treated as active.
   - `apps/web/app/s/[videoId]/page.tsx:423`
   - Result: stale upload changes from “processing” to trying playback, likely broken player/dead state.

4. AI provider availability is inconsistent. Share UI requires server `GEMINI_API_KEY`, but chat/transcription can use owner saved Gemini key.
   - UI/server availability: `apps/web/app/s/[videoId]/page.tsx:552`
   - AI workflow requires server env key: `apps/web/workflows/generate-ai.ts:176`
   - Chat resolves owner key: `apps/web/app/api/video/ai/chat/route.ts:199`
   - Result: self-hosted teacher with personal key can see AI unavailable or generation failing inconsistently.

5. Desktop share deep-link to transcript can show a blank panel on xl screens.
   - Active tab reads query: `apps/web/app/s/[videoId]/_components/BelowVideoTabs.tsx:39`
   - Transcript tab hidden on xl: `apps/web/app/s/[videoId]/_components/BelowVideoTabs.tsx:99`
   - Active transcript panel also hidden: `apps/web/app/s/[videoId]/_components/BelowVideoTabs.tsx:137`
   - Result: `/s/[id]?tab=transcript` can open to an empty below-video area on desktop.

6. Mobile nav exists, but accessibility is incomplete.
   - Drawer has no dialog semantics/focus trap/body scroll lock: `apps/web/app/(org)/dashboard/_components/Navbar/Mobile.tsx:21`
   - Some popover triggers are divs, not buttons: `apps/web/app/(org)/dashboard/_components/Navbar/Items.tsx:193`
   - Result: keyboard/screen-reader users can get confusing navigation.

**Low**
1. Cap/cap.so branding is still widespread.
   - Default upload titles: `apps/web/actions/video/upload.ts:214`
   - Failed recorder download name: `apps/web/app/(org)/dashboard/caps/components/web-recorder-dialog/useWebRecorder.ts:110`
   - Emails: `apps/web/lib/Notification.ts:320`
   - AI prompt says “Cap AI”: `apps/web/workflows/generate-ai.ts:788`
   - Result: external reviewer will see this is an unfinished fork, not data365.

2. `/terms` and `/privacy` are linked, but no app route files were found for them.
   - Login/signup/share auth links: `apps/web/app/(org)/login/form.tsx:178`, `apps/web/app/(org)/signup/form.tsx:244`, `apps/web/app/s/[videoId]/_components/AuthOverlay.tsx:94`
   - Result: legal links likely 404. Not core-flow, but reviewer-visible.

3. Remaining cap.so URLs in install/sitemap/metadata paths.
   - `apps/web/app/sitemap.ts:67`
   - `apps/web/app/layout.tsx:45`
   - `apps/web/app/install-cli.cmd/route.ts:3`
   - Result: SEO/install/support flows point away from data365.

**What Looks Mostly Fine**
Recorder has serious recovery work: local spool fallback, multipart retry/stall logic, pending-video cleanup on recorder failure, and a clear completed share link. Mobile hamburger buttons have labels. Comment creation server-side permission checks are reasonable.

**Top 5 Must-Fix**
1. Auto-start or explicitly orchestrate transcript/summary/index generation after successful record/upload/import.
2. Gate AI chat by readiness and show specific errors/retry states.
3. Add quota/size enforcement and cleanup for file imports; stream Loom imports instead of buffering whole files.
4. Fix folder org/space authorization in `add-videos`.
5. Replace Cap branding/dead `/terms`/`/privacy` before external review.

**Verdict**
Teacher core flow is **not production-ready for real users or an external reviewer right now**. Basic “record → upload → share video → student watches/comments” is close, but the advertised AI flow is not automatic, failure states are too silent, and branding/legal leftovers make it feel half-migrated. For reviewer-ready, fix the top 5 first.