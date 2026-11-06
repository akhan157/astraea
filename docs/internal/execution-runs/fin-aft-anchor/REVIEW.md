# Coordinator review: fin-aft-anchor

Disposition: **accepted** (merged into `frontend/design` at `801dcb5`).
Owner decision 2026-11-02: fins move with the tube's aft end.
Author: OMP `deepseek/deepseek-flash` (max). Author did not self-accept.

## Review rounds

| Round | Author commit | Finding | Fixed in |
|---|---|---|---|
| 1 | `a14348e` | `tubeLengthPatches` skipped fin patches when delta was 0, so a drag returning to the start length left fins at the previous step's offset | `c60d5d8` (test `65481e0`, fails on `70a70ed` with 0.65 vs 1.10) |

Re-pinned tests (1420 → 900 floor) are owner-mandated behavior, not relaxation.

## Coordinator verification (merged tree `801dcb5`)

- `npx tsc --noEmit` → exit 0; `npx vitest run --maxWorkers=2 src/console` → 44 files, 381 passed.
- Build → success. Independent Chromium probe (`probe3.mjs`, evidence folder above):
  NSL booster 1450 → 905 mm, fins 1100 → 555 mm (aft margin 30 mm), no warnings;
  one-gesture round trip 905 → 1306 → 905 mm ended with fins exactly 555 mm;
  no page/console errors. Screenshots `r4/b-short.png`, `r4/c-fins.png`.

## Known limits (accepted)

Fins at offset 0 block shortening of their tube; direct store edits, preset loads
and reordering do not shift fins (anchoring is an edit gesture); the staged-edit
banner counts tube and fins separately.
