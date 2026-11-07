# Lane layout-polish — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash` (variant max). The author did not self-approve.
This is independent review, not owner acceptance.

- Base `92b7083`. Lane commits `d55ce14`, `c7f4d32`. Merged as `fefb81c`.
- Approval: UI items 6c–6e queued by the owner via the input session; Gate 1 decisions
  by the coordinator (stats cards may scroll; 6d no change; the 3-column controls and
  counts-after-controls reflow accepted under the minimal-change rule).

## Diff review

`LandingScatter` derives every ring, point, tick and label from one measured square
(`landingScatterSize`: floor 80, cap 340); the ResizeObserver is cleaned up on unmount.
Its only caller is Flight's Monte Carlo panel, so no other surface can collapse to the
floor. No labels, text, colours, Monte Carlo sampling, seed, counts or exports changed.
Mass-table name column minimum: 170 → 190 px.

## Coordinator attempt that was reverted (retained)

The ring legend wraps "within 31 / m" at 1280×800. I tried keeping the value and unit
together (`whitespace-nowrap`). Screenshots then showed the legend overflowing its column
into the outcome counts at 1280×800, which is worse. Reverted; nothing committed. The
lane's wrapping version stays inside its column (legend left edge 320/331 px at 1280/1600).

## Checks run by the coordinator on the merged tree (fefb81c)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 166 files, 1951 tests passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0, including "Monte Carlo plot, ring legend, Run and outcome counts fit the default dock at 1280×800 and 1600×1000" |
| Coordinator screenshots | MC panel at 1600 and 1280 shows plot, legend, Run and counts at the default dock; mass names on one line at 1280 with both panels open; no page errors |

Author falsifiers: `pnpm test:browser` exits 1 at base `92b7083` and 0 after.
6d: no change, trade-off table in RESULT.md.

## Disposition

Accepted increment. Owner acceptance pending. Not exported to public `astraea`; no
public push was authorized for this lane.
