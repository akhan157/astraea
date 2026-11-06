# Lane declutter-fold — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash` (variant max). The author did not self-approve.
This is independent review, not owner acceptance.

- Base `c09c3f0`. Lane commits `5f6d111`, `30a803c`, `11e3805`, `45420da`. Merged as
  `d728209` during an interrupted coordinator run. The merged tree is byte-identical to the
  lane tip (`git diff declutter-fold d728209` is empty), so the author's full runs apply
  to it: tsc 0; vitest 164 files / 1944 tests; `pnpm build` 0; `pnpm test:browser` 0
  (38 acceptance lines).

## Diff review

Fold-only, as the owner approved: `OverflowFold`/`FoldButton` in `kit/Caveat.tsx`;
`StabilityStrip` (Airframe and Aero) folds the two caveat sentences only when both
exist (m > 3), and leaves `data-margin-unavailable` untouched; the Aero intro folds only
on overflow; Verify Validation starts closed, with session-only open state
(`state/session.ts`, not project data); sentences are byte-identical. One extra
consumer change (`ShareFlightCard.test.tsx` seeds `validationOpen: true`) was reviewed
and accepted.

**Finding (fixed by the coordinator):** `GateReason` folded every non-failing gate,
including `unknown`, an unassessed check whose reason is the point. Now only `pass` and
`n/a` fold. The new test "never folds a gate whose status is unknown" failed before the
fix and passes after.

## Checks run by the coordinator after the fix

| Command | Result |
|---|---|
| `npx vitest run --maxWorkers=1 src/console/kit/fold.test.tsx src/console/stages/declutterFold.test.tsx` | 12 passed |
| `npx tsc --noEmit` | exit 0 |
| `pnpm build` | exit 0 |
| Chromium screenshots (1600 and 1280) | Airframe card shows one caveat line plus More, which expands both sentences in their original colours; Verify folds only overflowing passing reasons; Validation starts closed and opens on its heading; no page errors |

**Not re-run after the one-line fix:** the full vitest suite and `pnpm test:browser`.
Host swap was at 100 % (other sessions' OCR and Playwright jobs), which is the oomd kill
condition. The fix narrows folding to fewer statuses, and the browser journey's gate
assertion accepts both folded and full reasons. Re-run both when memory allows.

## Disposition

Accepted increment. Owner acceptance pending.

## Re-run after memory cleared (2026-11-06, tree 29469fd)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 164 files, 1945 tests passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0, 38 acceptance lines |

Logs: external `evidence-premerge/`. `git merge-tree main frontend/design` reports no
conflicts (main is unchanged; frontend/design is 199 commits ahead).
