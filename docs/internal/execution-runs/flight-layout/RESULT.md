# Lane flight-layout — result

Author: OpenCode Go `opencode-go/deepseek-v4.1-flash` (variant max), lane
`flight-layout`, branch `flight-layout`. Base pin
`89376e47044dd0fa6f1a87779b0bff6d9df212bd`.

**Status: implementation complete, coordinator review pending. The author does
not accept this work; nothing here is merged, pushed or released.**

## Commits

| SHA | What |
|---|---|
| `4a02a55` | `feat(flight-layout)`: scaled dock default, one-row chrome on short windows, full-width pose strip in the bottom band, `useMediaQuery` moved to `hooks.ts`, `flightLayout.test.tsx` |
| `08231c6` | `test(flight-layout)`: free-region, rocket-size, dock-tab and chart-pane browser assertions (added only) |
| (this commit) | `docs(flight-layout)`: RESULT and EVIDENCE for review |

## What changed

- `src/console/stages/common.tsx` — `WithDock` accepts a scaled default
  (`initial: number | (available) => number`), reads the stored separator height
  (`ws.dock.*`), follows the stage through a `ResizeObserver` while no stored
  value exists, persists a drag or an arrow-key nudge, and keeps the existing
  120 px drag floor and `calc(100% - 166px)` main-area floor. Aero (320) and
  Airframe (260) keep their fixed defaults.
- `src/console/stages/Flight.tsx` — `flightDockDefault`; `FlightChrome` renders
  the chooser and the readiness line side by side under
  `(max-height: 860px)`; both Flight branches (no-run and run) share it and the
  same dock default.
- `src/console/shell/RunReadiness.tsx` — optional `inline` form (`min-w-0 flex-1`
  plus a left divider); text, repair buttons and `aria-label` are unchanged.
- `src/console/stages/FlightTimeline.tsx` — the compact pose readout is chosen
  when the canvas is narrow or short (`w < 700 || h < 420`) instead of
  `w < 560 || h < 300`, and in that form it shares the bottom band with the
  scrubber rather than taking its own row under the toolbar.
- `src/console/hooks.ts`, `src/console/Workstation.tsx` — `useMediaQuery` moved
  to `hooks.ts` (same implementation) so the stage can use it.
- `CHANGELOG.md` — one user-facing entry under 0.10.0 / Changed.

No engine, schema, preset, export, caveat-text or `src/console/viewport/*`
change. Nothing was removed; every control, readout value and readiness sentence
keeps its accessible name.

## Measured result

Headless Chromium (SwiftShader), built `dist/` with the production CSP from
`dist/_headers`, real native Wasm run, stage remounted per size so the dock reads
its first-use default. Free region = the viewport's own `data-safe-region`;
rocket = `data-rocket-bbox` at 50 % scrub. Raw: `BASE-MEASUREMENTS.json`
(89376e4) and `AFTER-MEASUREMENTS.json` (08231c6), copied from
`~/.paseo/worktrees/3s8t98rp/evidence-flight-layout/`.

| Viewport | Canvas h base → after | Free region base → after | Rocket h base → after | Dock base → after |
|---|---|---|---|---|
| 1280×800 | 167.5 → **325.8** | 57.5 → **229.5** | 44.0 → **172.9** | 400 → 276 |
| 1600×1000 | 377.6 → **479.6** | 377.6 → **479.6** | 281.7 → **357.8** | 400 → 298 |
| 1024×768 | 161.0 → **293.8** | 51.0 → **197.5** | 38.9 → **148.9** | 374.5 → 276 |
| 800×600 | 161.0 → 161.0 | 51.0 → **106.3** | 38.9 → **77.7** | 206.5 → 240.8 |

Requirement: region ≥ 220 px at 1280×800 (met, 229.5) and no smaller than base
at 1600×1000 (met, 479.6 / 357.8).

### Measured against the Gate 1 predictions

| Viewport | Predicted region | Measured | Why |
|---|---|---|---|
| 1280×800 | ~261 | **229.5** | the dock sits at its 276 px content floor, not the 231 px 38 % share (see below) |
| 1600×1000 | ~481 | 479.6 | — |
| 1024×768 | ~352 | 293.8 | same 276 px floor instead of 218 px |
| 800×600 | ~202 | 161.0 | the 276 px floor is clamped by the existing `max-height: calc(100% - 166px)`, so the canvas keeps its 160 px minimum |

## Deviation from the approved Gate 1 note (one finding, two consequences)

While implementing, the existing journey **"1280×800 Monte Carlo controls and Run
button fully visible" (D5, `preview-journeys.mjs`)** failed: it requires every
Monte Carlo field and its Run button to be fully in the viewport (`ratio: 1`),
not merely reachable by scrolling. Measured with the dock at the planned 231 px,
the Monte Carlo panel is 198 px tall while its controls end at 236.3 px. That is
the amendment's "the smaller dock must not hurt the tabs", so the approved 38 %
rule alone cannot ship.

1. **The dock default has a content floor of 276 px** (`38 %` share, floored at
   276, capped at 400, still clamped by the stage). 276 px measured as the
   smallest dock that keeps D5 green with slack (panel 243 px vs 236.3 px
   needed; at 270 px the slack is 0.7 px). A stored `ws.dock.flight` still wins.
2. **The compact pose readout moved into the bottom band with the scrubber.**
   With the dock at 276 px, keeping the readout under the toolbar gives a
   325.8 − 77.5 − 32.5 = **215.8 px** region — under the 220 px gate. Sharing the
   scrubber band gives **229.5 px** and keeps all six values on one visible line;
   merging the readout into the toolbar row (the coordinator's item 3) would give
   ~252 px but hides three of six values behind a horizontal scroll at 1280.

Both are layout decisions inside the stage, covered by the amendment's tab
usability requirement; the coordinator should confirm them.

## Falsifier

Base run (exact sequence):

```
git switch --detach 89376e4
git checkout flight-layout -- scripts/preview-journeys.mjs
PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build   # exit 0
pnpm test:browser                                              # exit 1
```

```
AssertionError [ERR_ASSERTION]: 1280×800: the Flight free region must be at
least 220 px tall (got 57.5 px)
    at previewJourneys (.../scripts/preview-journeys.mjs:353:12)
```

Log: `base-browser-falsifier.log`. On `08231c6` the same command exits 0 with
`1280×800 Flight free region 229.5 px tall; rocket 172.9 px`
(`after-browser.log`).

## Checks actually run

| Command | Where | Result |
|---|---|---|
| `pnpm install --frozen-lockfile` | 89376e4 | exit 0 |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` | 08231c6 | exit 0 |
| `npx tsc --noEmit` | 08231c6 | exit 0 |
| `npx vitest run --maxWorkers=2` | 08231c6 | 156 files, 1881 tests passed |
| `pnpm test:browser` | 08231c6 | exit 0, 42 passes including the 5 new ones |
| `pnpm test:browser` | 89376e4 + new journey | exit 1 on the new 220 px assertion (expected) |

The new assertions also pin, at 1280×800 and 1600×1000: the dock tab bar inside
the window with all five tabs rendered, the Timeline's 5 × 64 px chart stack
(344 px svg) scrolling rather than squashing, and — at 1280×800 — Monte Carlo,
Weather and Results rendering with every control visible, unclipped and
reachable, plus 14 result rows.

## Deliberately not done

- No merge of the readout into the toolbar row (hides values at 1280; recorded
  above).
- No change to other stages' dock defaults, the viewport fit, the engine, the
  schema, presets, exports or caveat text.
- No existing journey assertion was relaxed or edited; the file only gained
  checks.
- No source edits were made before Gate 1 approval.

## Remaining / limits

- Visual acceptance is the coordinator's: I cannot read images. Screenshots for
  all four sizes (base and after) are in
  `~/.paseo/worktrees/3s8t98rp/evidence-flight-layout/` and were never opened by
  me.
- 800×600 keeps a 161 px canvas because the dock's existing `max-height` reserves
  the 160 px main area; the rocket there still grows 38.9 → 77.7 px.
- Once the user drags the separator (or uses its arrow keys) the stored height
  wins and the default stops tracking the window — by design.
- The 1600×1000 dock default drops 400 → 298 px; the canvas grows 377.6 → 479.6
  and the rocket 281.7 → 357.8 px. This is the approved trade-off.
