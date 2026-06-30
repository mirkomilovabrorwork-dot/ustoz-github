# Ustoz recovery handoff - 2026-06-28

This folder is the preserved local working copy, not the clean deploy baseline.

Current role:

- Preserves local work from before/after Windows reinstall.
- Branch: `qa-fixes`.
- Upstream: `origin/qa-fixes`.
- 139 commits ahead of `origin/main` at time of audit.
- Contains uncommitted local changes. Do not discard.

Recovery protection:

- Snapshot branch: `backup/local-recovery-20260628-202614`.
- Recovery bundle/diffs also exist under `..\_recovery\20260628-202848`.

Known status:

- `pnpm install --frozen-lockfile` passed.
- `pnpm typecheck` passed.
- `NODE_ENV=production pnpm build` passed.
- `pnpm lint` failed with many Biome diagnostics.
- `pnpm test` failed with workflow/mock related failures.

Deploy baseline:

- Use `..\_deploy-baselines\ustoz-github-origin-main-e2d2aca` for clean GitHub-main continuation.
- That baseline is on branch `continue/ustoz-from-main-e2d2aca`.
- Exact Railway live commit still needs Railway/GitHub auth confirmation.

Do not:

- Do not reset or clean this folder.
- Do not deploy from `qa-fixes` until lint/test failures are understood.
- Do not change Railway, Cloudflare R2, MySQL, or GitHub Actions cron without user approval.

Next safe steps:

1. After `gh auth login`, push `backup/local-recovery-20260628-202614`.
2. Verify exact Railway live commit.
3. Decide whether to continue from Railway live commit, `origin/main`, or `qa-fixes`.
