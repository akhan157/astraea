# Lane: flight-layout

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design`
  at the commit that adds this file. Rename it to `flight-layout`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

## Why this lane exists

Coordinator review of `viewport-look` (`docs/internal/execution-runs/viewport-look/REVIEW.md`,
finding 1). At 1280×800, the desktop app's default size, the Flight stage leaves the
3D canvas only about 170 px tall. The free area below the Play/Full flight/ISO
toolbar and above the scrubber is about 57 px, so the correctly fitted rocket is only
about 40 px tall. The owner has delegated 1280 layout decisions to the coordinator
("for the 1280-wide issue, u decide").

Causes (at the base commit):
- `src/console/stages/Flight.tsx:93` and `:112` use `WithDock storageKey="flight"` with a
  fixed `initial={400}` px dock (timeline/events/Monte Carlo/weather/results). That is
  half the window at 800 px tall.
- Above the canvas, the stage stacks the header, the flight-model chooser row and the
  "Whole-design readiness" row.
- Inside the canvas, the toolbar row and, on small viewports, the compact pose readout
  strip each take a full-width row (`src/console/stages/FlightTimeline.tsx`).

## Decided outcome (coordinator)

At 1280×800 the posed rocket must be clearly visible, with the canvas free region at
least **220 px** tall. At 1600×1000 it must not get smaller than today. Approach,
open to Gate 1 refinement:
1. The default dock height scales with the window instead of a fixed 400 px. For
   example, the dock is about 38% of the stage height, with a 200 px floor, on first
   use. A stored user preference (`ws.dock.flight`) still wins.
2. The flight-model chooser and the readiness line share one row on short windows
   instead of two.
3. The canvas toolbar (Play, Full flight, view presets) and the compact pose readout
   share one row, or the readout moves into the toolbar row, on short windows.

Nothing may be removed. All controls, the readout values and the readiness text stay
reachable and keep their accessible names. The `viewport-look` Flight safe-region fit
stays; it just gets more room.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the
  session. Never open .png/.jpg/.webp files. Verify with DOM rects and numbers. The
  coordinator does the visual checks.
- No engine, schema, preset, export or caveat-text changes. No viewport rendering
  changes (only the layout around it). Existing browser journeys (`pnpm test:browser`)
  keep passing, including RMP15-C05 header fit at 800×600 and the `viewport-look`
  Flight-pose-in-free-region assertion.
- Add assertions only to `scripts/preview-journeys.mjs`. Tests next to changed files.
- The author cannot self-accept. Run `free -h` before heavy steps. Use
  `vitest --maxWorkers=2`. No subagents. No push, merge, release or publish.

## Gate 1

Send a short design note and stop for approval: measured base numbers (canvas height,
free-region height and rocket bbox height at 1280×800, 1600×1000 and 1024×768), the
exact changes, the expected numbers after, and the falsifier (a browser assertion
that fails at base: free region ≥ 220 px at 1280×800).

## Evidence and report

Write evidence to `.paseo/worktrees/3s8t98rp/evidence-flight-layout/` (JSON and numbers;
screenshots may be written for the coordinator but not read). Run `tsc`, the full
vitest suite, `pnpm build` and `pnpm test:browser`. Write
`docs/internal/execution-runs/flight-layout/RESULT.md` + `EVIDENCE.json`. Commit with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
