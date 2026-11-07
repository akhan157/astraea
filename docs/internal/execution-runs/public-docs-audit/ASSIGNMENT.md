# Lane: public-docs-audit

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at the
  commit that adds this file (parent `759dbb0`). Rename it to `public-docs-audit`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.
- Approval: owner, via the input session (thread c8b84f3d), 2026-11-06. Items 1 and 2.

## Why

The repo is now public (`akhan157/astraea`, a clean export of this tree minus
`docs/internal/session-handoff/` and `docs/internal/SESSION-HANDOFF.md`; see
`docs/internal/execution-runs/public-repo/RECORD.md`). The public-facing docs were
written for a private repo.

## Scope

1. **Public docs**: `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`,
   `docs/accuracy.md`, `docs/road-to-1.0.md`, `docs/team-data-request.md`,
   `docs/flight-validation/README.md`, `.github/ISSUE_TEMPLATE/*`, and the landing page
   text/links in `index.html`. Make them **short and accurate** for a public reader:
   - remove or reword links that point into `docs/internal/` from public-facing docs
     (for example README.md:159 to `docs/internal/execution-package/`, CHANGELOG.md:4 to
     `docs/internal/engineering-changelog.md`). Prefer plain wording ("internal
     engineering records live in `docs/internal/`") over a link to process records;
   - remove text that only makes sense for a private repo or for the maintainer's own
     workflow (private-repo wording, handoff/session/agent-process references);
   - check that every link in these files resolves within the public tree (a relative
     path exists, or an external URL) and that commands such as the clone URL are correct.
2. **Dangling handoff links**: 31 links in `docs/` (outside the excluded folder) point
   at `docs/internal/session-handoff/...` or `docs/internal/SESSION-HANDOFF.md`, which do
   not exist in the public tree. Replace each link with plain text naming the record (for
   example "private coordination notes") **without** changing the surrounding sentence's
   meaning. List each file:line in RESULT.md.
3. **CI manual trigger**: add `workflow_dispatch:` to the `on:` block of
   `.github/workflows/ci.yml`. Change nothing else in workflows.

## Hard rule: no new or changed claims

Accuracy statements, validation status, platform support, version and beta wording,
licensing, and security commitments must keep **exactly** the same meaning. If any
public doc states something you believe is **wrong or outdated** (for example a test
count, a platform status or a version), do not fix it. List it in RESULT.md under
"Claims for owner review", with file:line, current text and why. The owner decides.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the session.
- Docs and `ci.yml` only. No `src/`, `crates/`, `scripts/` or `public/` changes.
- Keep the README short. The owner has repeatedly cut over-documentation; do not add sections.
- The author cannot self-accept. No push, merge or release. No subagents. Run `free -h`
  before heavy steps. Leave other worktrees alone.

## Checks

- A link checker over the scoped files plus every changed file, against the public file
  set (this tree minus the two excluded paths): report 0 broken relative links.
- `npx vitest run --maxWorkers=2` must still pass (some tests read files under
  `docs/internal/`; confirm you moved or renamed none).
- Run long commands in the foreground. Commit with
  `git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
- Write `docs/internal/execution-runs/public-docs-audit/RESULT.md` with a per-file change
  list, the claims-for-review list and the link-check result. No Gate 1; stop for
  coordinator review when done.
