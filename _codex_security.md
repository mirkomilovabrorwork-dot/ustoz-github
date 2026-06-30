Read-only security review completed. I did not modify files.

**Overall Verdict**
Not safe to put in front of real paying users or an external security reviewer right now. The app has some good policy patterns, especially around `/s`, `/embed`, playlist/media access, and owner-scoped video mutations, but there are several real exploitable auth/data-integrity issues.

**Critical**
1. Desktop auth leaks live session/API keys via attacker-controlled redirect  
   [session.ts](<C:/Users/localhost/Desktop/ustoz-github/apps/web/app/api/desktop/[...route]/session.ts:146>) accepts arbitrary `port`, then builds `http://127.0.0.1:${port}?token=...` at lines 203-210.  
   Exploit: a logged-in user can be sent to `...?platform=web&type=session&port=3000@attacker.com/`, causing the browser to redirect with the session token/API key in the URL. This is account takeover. `type=api_key` is worse because it mints a persistent key.

**High**
2. Anonymous public viewers can burn Gemini spend through AI chat  
   [route.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/app/api/video/ai/chat/route.ts:94) allows unauthenticated POSTs, checks only `canView(videoId)` at line 144, then charges usage to the video owner/org at lines 238-255 and 305-411. Public shared videos can trigger paid Gemini calls.  
   [ai-cost-guard.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/lib/ai-cost-guard.ts:59) also fails open when no budget is configured, and checks budget before spend without atomic reservation.

3. Folder/space actions allow cross-tenant data pollution / IDOR  
   [add-videos.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/actions/folders/add-videos.ts:16) trusts client `folderId` and `spaceId`. It checks the caller owns the videos, but does not prove the folder/space belongs to the caller’s org before inserting `sharedVideos` / `spaceVideos` at lines 52-85.  
   [remove-videos.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/actions/folders/remove-videos.ts:33) has the same missing folder/space authorization shape.  
   [moveVideoToFolder.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/actions/folders/moveVideoToFolder.ts:63) validates `folderId`, but not arbitrary `spaceId`.

4. Any org member can remove other people’s shared org videos  
   [remove-videos.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/actions/organizations/remove-videos.ts:31) allows owner or any member, then deletes `sharedVideos` rows for arbitrary `videoIds` at lines 63-90.  
   Exploit: regular member removes admin/owner videos from org collections.

5. Stripe checkout trusts client-supplied `priceId` and `quantity`  
   [route.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/app/api/settings/billing/subscribe/route.ts:13) parses client `priceId`, then sends it directly to Stripe at lines 65-68.  
   Exploit: logged-in user can attempt checkout against old/test/discount/internal prices in the same Stripe account. Quantity also needs server-side validation.

**Medium**
6. Upload object keys accept unsafe subpaths / reserved overwrites  
   [utils.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/app/api/upload/utils.ts:13) parses legacy `fileKey` and subpaths without blocking `..`, leading slash, or reserved filenames.  
   [signed.ts](<C:/Users/localhost/Desktop/ustoz-github/apps/web/app/api/upload/[...route]/signed.ts:98>) and [multipart.ts](<C:/Users/localhost/Desktop/ustoz-github/apps/web/app/api/upload/[...route]/multipart.ts:58>) use this for signed upload targets. S3 treats keys literally, so this is mostly video/object integrity risk, but it is dangerous if any proxy/CDN/path tool normalizes keys.

7. Desktop logs endpoint is unauthenticated relay to Discord  
   [root.ts](<C:/Users/localhost/Desktop/ustoz-github/apps/web/app/api/desktop/[...route]/root.ts:327>) accepts logs with optional auth and posts them to Discord around line 385. This is abuse/spam/data-exfil surface unless tightly rate-limited and size-limited.

8. Collection password brute-force protection can fail open on self-hosted  
   [password.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/actions/collections/password.ts:14) uses Vercel rate limit in production, but catches errors and continues. On self-hosted deploys, public collection passwords may be brute-forced.

9. Space creation/member assignment needs stricter org scoping  
   [create-space.ts](C:/Users/localhost/Desktop/ustoz-github/apps/web/actions/organization/create-space.ts:34) lets any active org user create spaces and add supplied `members[]` without clearly verifying each member belongs to the org. If spaces are admin-managed, this is a tenant integrity bug.

**Areas That Looked Safe**
- Public share and embed access generally use `videosPolicy.canView`: `/s/[videoId]`, `/embed/[videoId]`, playlist, transcript, and storage object routes enforce visibility/password/org rules before returning media.
- Many destructive video actions are owner-scoped: title/date/settings/password/delete/comment edit/delete/upload processing paths mostly check owner or author correctly.
- Manual AI generation route is restricted to video owner or org owner/admin.

**Top 5 Must Fix**
1. Replace desktop token-in-URL flow with one-time codes; validate `port` as numeric localhost-only.
2. Centralize folder/space/org authorization and patch all folder/org video mutation actions.
3. Require server-side paid/allowed AI access for chat; add default caps, atomic reservation, and stronger rate limits.
4. Server-side allowlist Stripe prices and validate quantity.
5. Validate upload subpaths and reserved object names; remove or strictly constrain legacy `fileKey`.

Hozirgi holatda reviewer buni “production-blocking” deb belgilaydi. First safe next step: fix the desktop auth leak first, because it is direct account takeover.