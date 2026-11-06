# Lane flight-layout — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash` (variant max). The author did not self-approve.
This is independent review, not owner acceptance.

- Base `89376e4`. Lane commits `4a02a55`, `08231c6`, `fb4b977`. Merged as `5eaf85b`.

## Gate 1 and deviations

Approved with a 0.38 dock rule plus amendments: Timeline panes must scroll, not
squash; Monte Carlo, Weather and Results must stay usable. Two deviations were
reported during implementation, and the coordinator accepted both:
1. A dock content floor of 276 px. The existing 1280×800 journey "Monte Carlo
   controls and Run button fully visible" requires `ratio: 1` visibility, and a
   0.38 dock (231 px) clipped those controls. The assertion was kept unchanged and
   the floor was raised instead. The 1280 free region therefore lands at 229.5 px,
   not the predicted 261.
2. The compact pose readout moves into the scrubber band instead of the toolbar
   row. All six values stay visible on one line; the toolbar merge would have
   hidden three of them behind a horizontal scroll at 1280.

## Checks run by the coordinator on the merged tree (5eaf85b)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 156 files, 1881 tests passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0. Includes "1280×800 Flight free region 229.5 px tall; rocket 172.9 px", "1600×1000 … 479.6 px; rocket 344.1 px" and "1280×800 Monte Carlo controls and Run button fully visible" |
| Author falsifier at base `89376e4` | exit 1: free region 57.5 px < 220 (log in external evidence) |
| Coordinator visual check of the author's after screenshots at 1280 and 1600 | Rocket clearly visible below the toolbar, readout strip in the scrubber band at 1280, floating readout card at 1600, no overlap |

## Disposition

Accepted increment. The 1280×800 Flight free region went from 57.5 to 229.5 px and
the rocket from 44 to 173 px. Owner acceptance pending. The landing/README
screenshot refresh is a separate lane (`screenshots-refresh`), because the capture
script assumes fixed panel positions that the inspector auto-collapse changed.
