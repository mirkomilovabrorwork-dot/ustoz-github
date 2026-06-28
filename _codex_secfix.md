Implemented. Changed only these files:

- `apps/web/actions/folders/add-videos.ts` - verifies folder org ownership and validates non-all-spaces `spaceId` before writing `spaceVideos`.
- `apps/web/actions/folders/remove-videos.ts` - rejects folders outside `user.activeOrganizationId`.
- `apps/web/actions/folders/moveVideoToFolder.ts` - verifies target folder org ownership and validates non-all-spaces `spaceId`.
- `apps/web/actions/organizations/remove-videos.ts` - owner/admin can remove any shared video; member can remove only videos they shared.
- `apps/web/app/api/video/ai/chat/route.ts` - blocks anonymous POSTs before AI work.
- `apps/web/lib/ai-cost-guard.ts` - adds safe default cap when no AI budget is configured, checked before spend.
- `apps/web/app/api/upload/utils.ts` - rejects unsafe upload key segments: `..`, leading slash, backslash, empty/reserved names, and unsafe chars.

Did not run git, typecheck, or build. Also verified the edited files have no UTF-8 BOM.