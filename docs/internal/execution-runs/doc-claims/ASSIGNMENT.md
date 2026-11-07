# Lane: doc-claims

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at the
  commit that adds this file. Rename it to `doc-claims`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.
- Approval: the owner approved fixing the 7 flagged doc claims (2026-11-07), with **each
  change shown to the owner before it merges**.

## Why

`public-docs-audit` flagged 7 public-doc claims that are outdated or contradict each
other; it changed none of them. The list, with file:line, is in
`docs/internal/execution-runs/public-docs-audit/RESULT.md` under "Claims for owner review":
1. Windows acceptance (README:146-148 vs docs/road-to-1.0.md:72)
2. "Astraea 0.9 is a beta" (docs/road-to-1.0.md:3) vs package 0.10.0
3. CHANGELOG 0.9.0 "planned first public release" vs the 0.10.0 section
4. CHANGELOG:315 "signed in-app updates" vs SECURITY.md:32-34 fixture key
5. docs/accuracy.md:43 G69N +32 %: before or after the fin-edge drag fix?
6. docs/flight-validation/README.md:13 "Current" replay heading and date
7. index.html:37 platform list vs README platform status

## How

For each claim, **find the truth in the records, not by guessing**: delivery reviews,
`docs/internal/desktop-acceptance-checklist.md`, the Windows VM evidence records
(2026-10-29), `docs/accuracy.md` sources, the CHANGELOG history, `git log` of the
relevant files. Then propose the smallest correct wording. Rules:
- Correct only what the records prove. If the records do not settle a claim, propose
  conservative wording that states only what is known ("pending", "as of <date>") and
  mark it **NEEDS OWNER**.
- Do not upgrade any status (never turn "pending" into "verified" without a cited record).
  Downgrading an overstatement to match the record is allowed.
- Keep the public docs short. Change only the flagged sentences or rows.
- A historical CHANGELOG section stays historical: mark it as superseded or dated rather
  than rewriting what was true at the time.

## Gate 1: the owner sees every change (stop for approval)

Send a table: claim #, file:line, current text, proposed text, evidence (file:line or
SHA), and OK / NEEDS OWNER. **No edits before approval.**

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the session.
- Docs and `index.html` text only. No code, no tests, no `public/`, no images.
- The author cannot self-accept. No push or merge. No subagents. Long commands in the
  foreground.

## After approval

Apply exactly the approved text. Run the link check from `public-docs-audit` (0 broken)
and `npx vitest run --maxWorkers=2` (the `index.html` version test must pass). Commit with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`; write RESULT.md.
