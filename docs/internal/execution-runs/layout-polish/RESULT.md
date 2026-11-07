# Lane layout-polish — result

Status: **implementation complete, awaiting coordinator review. I cannot self-accept.**
No push, merge, release or publish.

- Base pin: `92b7083e35eab3b1be6af88cd15c08988e3619d0` (branch `layout-polish`,
  assignment commit, parent `208aa5f`).
- Implementation commit: `d55ce14fe980ce9cf2a48594e8b68f58314f4b88`.
- Worktree: `/home/ak/.t3/worktrees/astraeat3/t3-533d58d6`, branch `layout-polish`.
- Gate 1 note: `~/.paseo/worktrees/3s8t98rp/evidence-layout-polish/GATE1-DESIGN-NOTE.md`.
- Evidence: `~/.paseo/worktrees/3s8t98rp/evidence-layout-polish/` (JSON probes,
  before/after browser logs, probe scripts).

## What changed (minimal)

| Item | File | Change |
|---|---|---|
| 6c | `src/console/stages/Flight.tsx` | MC body fills the visible panel (`h-full min-h-0`, one fixed grid row); controls 3 columns; Run in the empty 6th cell; outcome counts directly after the controls, before the drag-chip/job/stale rows. No labels, colours, components or behaviour changed; DOM/tab order follows the new visual order. |
| 6c | `src/console/kit/Charts.tsx` | `LandingScatter` measures its box with a cleaned-up `ResizeObserver`; `landingScatterSize(width, height)` = `clamp(80, floor(min(w,h)), 340)`. All rings, points, ticks, `N` and radius labels stay derived from the same `S`, so geometry rescales and text stays 10/11 px. Legend uses the full column width. |
| 6c | `src/console/kit/Charts.test.ts` | New unit test for the size calculation (limiting edge, floor 80, cap 340, whole-pixel floor, pre-measurement fallback). |
| 6e | `src/console/stages/Airframe.tsx` | Part column `minmax(170px,1.4fr)` → `minmax(190px,1.4fr)`; the share bar gives up the 20 px. |
| both | `scripts/preview-journeys.mjs` | New journey falsifiers (MC recap inside the panel at 1280×800 and 1600×1000; every mass name one line at 1280×800). Failures are collected and asserted strictly, so one run reports all of them. |

**6d: no change** (coordinator decision, per the brief's fallback). Trade-off
table measured by live dock-height mutation at 800×600, pose 50 %:

| Dock | Canvas | Free region | Posed rocket | MC panel |
|---|---|---|---|---|
| **240.8 (shipped)** | **161** | **106.3** | **77.7** | 206 |
| 187 | 214.8 | 118.5 | 85.9 (+8.2) | 152 |
| 160 | 241.8 | 145.5 | 103.2 (+25.5) | 125 |
| 145 | 256.8 | 160.5 | 112.1 (+34.4) | 110 |

## Measured after (commit `d55ce14`)

Monte Carlo, 24-flight ensemble, default dock, scrollTop 0:

| Viewport | Panel client/scroll | Scatter | Legend | Controls h | Run | Outcome counts |
|---|---|---|---|---|---|---|
| 1600×1000 | 263 / 702 | 202², 12–214 | below, ~33 | 94 | 113–134.3 | **168–230.8** |
| 1280×800 | 241 / 702 | 147², 12–159 | below, ~66 | 94 | 113–134.3 | **168–230.8** |

All four required elements are fully inside the panel at both sizes. The plot is
202² at 1600 (Gate 1 predicted ~218) because the full-width legend wraps to two
lines at the 572 px column; 147² at 1280 as predicted. Stats cards, the completed
job row and the footnotes remain scrollable (job starts at 242.8 at both sizes),
as the coordinator confirmed. Field labels are not truncated (max text 72.8 px
in 106.7 px cells); no control is clipped.

Mass budget, 1280×800, **parts tree and inspector open**: table 636; part column
**190**, share **102**; all seven names on **one line** ("High-Power Clipped
Delta Fins" needs 181; "Main Parachute (700ft AGL)" 169). At 1600/1024 the name
column stays 252/253.6 (unchanged); at 800 it becomes 190/share 202 and the table
still fits (scrollWidth = clientWidth = 736).

Flight at 800×600 is unchanged: canvas 161, region 106.3, rocket 77.7/80.7
(pose sampling), dock 240.8. The 1280×800 flight-layout guard stays at region
229.5 / rocket 174.3.

## Falsifiers: base vs after

Added to `scripts/preview-journeys.mjs`; both ran against the base build before
any source edit:

- Base `pnpm test:browser` **exit 1** (`base-browser-falsifier.log`):
  - `1280×800: mass-budget part name "High-Power Clipped Delta Fins" must stay on one line (got 2)`
  - 1280 MC: scatter `234–490`, legend `494–560`, counts `317–379.8` of 241 px.
  - 1600 MC: scatter `210.3–530.3`, legend `534.3–583.8`, counts `317–379.8` of 263 px.
- After `pnpm test:browser` **exit 0** (`after-browser.log`):
  `Preview acceptance passed: Monte Carlo plot, ring legend, Run and outcome counts fit the default dock at 1280×800 and 1600×1000`.
  The same run's strict `layoutFailures` assertion (which contains the mass
  one-line check) is empty.

## Checks actually run

| Check | Result |
|---|---|
| `pnpm exec tsc --noEmit` | exit 0 |
| `pnpm exec vitest run --maxWorkers=2` | **166 files / 1951 tests passed**, 248.46 s |
| focused `Charts.test.ts` + `flightLayout.test.tsx` | 2 files / 11 tests passed |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` | exit 0 |
| `pnpm test:browser` (production CSP, real Wasm) | exit 0 |
| base falsifier run (old dist, new journey) | exit 1, seven failures above |

## Deliberately not done

- No 6d source change (trade-off above; the coordinator chose do-nothing).
- No change to Monte Carlo sampling, seed, counts, ensemble config, exports,
  physics, schema or preset data.
- No new UI elements, labels, colours or text; only resize/refit/reflow.
- Stats cards and footnotes kept below the fold by design (confirmed).
- No push, merge, tag, release or publish.

## Known consequences for review

- The scatter is smaller at the default dock (202²/147² vs 320²/256²). Text
  size is unchanged; the ring legend moved below the square and uses the column
  width.
- The left column's right divider ends at the visible row when the panel is
  scrolled; the plot scrolls away with the rest of the content as before.
- The widest Run label exercised was the 100-flight default (98 px) and
  24 flights (93 px) inside the 106.7 px cell; the 1000-flight label was not
  exercised and is the only untested edge of that cell.
- Supplemental base probe `BASE-PROBE2.json` was overwritten by its after re-run
  (`AFTER-PROBE2.json`); the base values it held are preserved in
  `GATE1-DESIGN-NOTE.md` and `base-browser-falsifier.log`, and no claim depends
  on the lost file.
