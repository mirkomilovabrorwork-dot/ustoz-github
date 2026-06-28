# data365 remaining issues

Updated: 2026-06-28

This is the practical backlog after the long-video transcription, manual-only AI, and lazy AI-chat index work. Do not treat every item as urgent; use this as the next safe checklist when the owner asks to fix remaining issues.

## High priority

1. Real long-video verification
   - Test one real 1-2 hour recording end to end after deploy.
   - Expected: audio is split into chunks, transcript completes, captions line up, and manual AI analysis can be started by the owner.

2. Safe storage optimization pipeline
   - Current state: helper logic exists to inspect video metadata and choose copy/remux vs compression.
   - Still needed: wire it into the upload/processing path only after verifying the processed file exists, is playable, has sane duration, and is safely stored before deleting raw input.

3. Extension weak-network recovery
   - Retry queue exists.
   - Still needed: user-visible recovery for failed/dead-letter upload parts so a flaky network does not leave a recording in a confusing failed state.

## Medium priority

4. Loom import memory behavior
   - Large Loom imports may still use too much server memory.
   - Prefer streaming/chunked download and upload instead of buffering whole files.

5. AI spend controls
   - Lazy chat indexing now avoids embedding cost until chat is used.
   - Still useful: per-video max budget, clearer "this may cost" UI for long videos, and chunk-level retry/resume for long transcripts.
   - Keep summary/chat/embedding-style extras manual or lazy. Plainly: AI should spend money only after a user asks for that specific output.

6. Branding cleanup
   - Some legacy Cap/cap.so wording remains in support/messenger/docs/developer-oriented areas.
   - Clean only user-visible data365 surfaces first; avoid changing code identifiers unless needed.

## Polish

7. Mobile and accessibility polish
   - Drawer focus/scroll behavior, small-screen recorder overflow, and aria labels still need a pass.

8. Test debt
   - Some older integration mocks are stale.
   - Do not fake green; fix mocks only when the test proves a real behavior.

9. Uzbek interface coverage
   - Locale switching already exists in Settings, with `uz`, `en`, and `ru` message files.
   - Still needed: replace remaining hardcoded dashboard/viewer strings with translation keys so switching to Uzbek affects the whole app, not only the already-localized surfaces.
