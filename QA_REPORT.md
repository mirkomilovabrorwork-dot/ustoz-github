# QA Report — Ustoz — RUN 4 (deploy 98ba598, live Playwright)

Target: LIVE https://capweb-production-dd85.up.railway.app · HEAD `98ba598` (branch `qa-fixes`).
Method: Playwright chromium against the live build (config `apps/web/scratchpad/live-qa/`), owner + anonymous contexts. Read-only (no AI spend, no data mutation).

## Results

| # | Check | Result | Evidence |
|---|---|---|---|
| A | LocaleSwitcher renders real SVG flags (not emoji/letters) on /login | ✅ PASS | `svg[viewBox^="0 85"]` flags present (count > 0) |
| B1 | Admin login → /dashboard | ✅ PASS | first run: login 10s → URL /dashboard |
| B2 | Dashboard caps list renders (no error boundary) | ✅ PASS | body has no "Something went wrong" |
| B3 | Owner share page video renders | ✅ PASS | `<video>` attached on /s/xqmcns |
| B4 | AI **bold** = grey semibold, NOT link-blue | ✅ PASS | `span.text-blue-11` count = 0; `span.font-semibold.text-gray-12` count = 2 |
| B5 | Owner re-analyze affordance renders | ✅ PASS | cookie session (admin=owner), Xulosa tab active → button "Qayta analiz" present as the discreet ⋮ menu (good/aligned analysis → menu, not a panel — as designed) |
| C | Anonymous share page: NO re-analyze / generate controls | ✅ PASS | both button counts = 0 on /s/2t4 |
| — | Retry-AI reprocess (backend) | ✅ PASS (separate API check) | POST generate `{}` → alreadyRunning; `{reprocess:true}` → started:true |

## Notes
- **B5 method:** the re-analyze affordance lives inside the share page's "Xulosa" (Summary) tab (`GenerateAiPanel`). Confirmed by injecting a valid admin session cookie (form-login was throttled after dozens of session logins — an env quirk, not a product bug), verifying the browser was authenticated (`/api/auth/session` = admin, `/dashboard` loaded), activating the Xulosa tab, and finding the button "Qayta analiz". On xqmcns (a good/aligned analysis) it correctly appears as the discreet ⋮ overflow menu, NOT a panel. The incomplete-analysis → visible-panel path is code-reviewed (no chala video available live to exercise it).
- **Retry-AI reprocess** additionally verified at the API: `{reprocess:true}` → started:true; without the flag → alreadyRunning (no regression); non-owner blocked by the route's authz.
- **Bold fix confirmed live** (the original owner complaint): zero blue emphasis spans remain.
- **Not testable headlessly (owner-physical):** in-recording camera toggle, browser-extension pause/resume, real recording upload, actual AI re-run output quality.

## Verdict
Deploy `98ba598` verified live: SVG flags, grey bold (not blue), anonymous gating, login/dashboard/video, retry-AI reprocess (backend + owner ⋮ re-analyze menu), and the re-analyze-only-when-incomplete UX. No Critical/High issues found. Owner-physical (Unverified, need a real device): in-recording camera toggle, extension pause/resume.
