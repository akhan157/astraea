# ui-polish-2 — RESULT

Status: **implementation complete, waiting for coordinator review.** The author
cannot self-accept; this file claims no PASS. `REVIEW.md` is the coordinator's.

- Base: `6de01f63ad45230d6dc40f37fb8f4540374b4d82` (= `524fadd` + this lane's
  `ASSIGNMENT.md`; `git diff --stat 524fadd..6de01f6` is the assignment only).
- Branch: `ui-polish-2`, worktree `/home/ak/.t3/worktrees/astraeat3/t3-29fbe0a8`.
- Commits (no push, merge, tag or release):
  - `731010a13a295550d0d794cfa2d5b33bc8c3a581` — Aero secondary rows + `DataTable` sections.
  - `2b6362e45927eb0b66828e48b4e33e70c377770b` — 1280 label fit (palette, mass header, Motor tabs).
  - `9747baa3d5654045f49ba08a4416580feffaaf95` — inspector auto-open/close + Escape deselect.
  - a docs commit follows this file (`CHANGELOG.md`, `RESULT.md`, `EVIDENCE.json`).
- Evidence root: `~/.paseo/worktrees/3s8t98rp/evidence-ui-polish-2/`.
  `gate1-base/` is the before build; `gate2-base/` holds the base dist and the
  shared falsifier; `gate2-after/` holds the after logs, JSON and screenshots.

## A — inspector auto-opens and auto-closes

Implemented in `src/console/Workstation.tsx` with the approved empty condition:

- Empty = Airframe/Aero/Recovery, no component resolves for `selectedId`, and
  no staged airframe edits. Mission, Flight and Build always have content;
  Motor and Verify diagnostic placeholders stay visible as approved.
- `src/console/shell/Inspector.tsx`: the staged-edits banner moved above the
  `if (!c)` return, so Apply/Discard remain reachable after deselecting. An
  empty panel with staged edits therefore keeps the inspector open.
- Auto-close runs inline and in the drawer. Auto-open runs only inline
  (`!compact`), never the drawer. `RunReadiness` and the tour keep working
  because any non-auto `rightOpen` write is treated as a user action.
- Pins: `manualOpenEmpty` (open while empty stays open) and `manualClosedFor`
  (close with content stays closed until the selection changes). `]`, the
  toggle and the existing `explicitRight`/`autoCollapse` breakpoint semantics
  are unchanged. `lastSelection` clears the close pin on any selection change,
  including select → deselect → same part.
- Motion: the inline panel is always mounted while wide; closed is
  `width: 0`, `opacity: 0`, `aria-hidden` and `inert`. CSS is
  `transition-[width,opacity] duration-[160ms]` with
  `motion-reduce:transition-none`. The 3D viewport re-frames with its container.
- Focus: a `focusin` tracker catches focus that is unmounted by a preset swap
  before the effect runs. On collapse, focus goes to the selected tree item if
  one exists, else `[data-stage-header]` (new `data-stage-header` +
  `tabIndex={-1}` in `src/console/stages/common.tsx`, approved).
- Escape stays two-step: discard staged airframe edits exactly as before; only
  when nothing was staged and the palette, shortcuts sheet and any
  `[role="dialog"]` are closed, clear `selectedId`. The dialog guard is stricter
  than requested: it also protects the provenance dialog and an open inspector
  drawer. Empty 3D click deliberately does not deselect, as approved.

Browser measurements (`gate2-after/probe.json`):

| Check | Result |
|---|---|
| 1600 load, Airframe, no selection | `aria-expanded=false`, width 0, inert + hidden |
| Select a tree part | opens, width 320, `transitionend` width = **160 ms** |
| Escape with nothing staged | selection cleared, panel closes; see note |
| `]` while empty | open, placeholder visible, stays open |
| Manual close with content | stays closed; next selection reopens |
| 1024 selection | drawer stays shut (`drawer: 0`) |
| 1024 `]` | drawer opens (`drawer: 1`) |
| Reduced motion | no width transition (`transition-duration: 1e-06s`) |

Note: the Escape-close *wall clock* sample is 385 ms because the software
renderer starves timers while the 3D highlight changes; the CSS duration is
0.16 s and the manual close records a 160 ms `transitionend` on the same
element. Recorded honestly in `probe.json` (`closeDurationMs`, `closeElapsed`).

Tests in `src/console/shell/inspectorAuto.test.tsx` (11): load/selection/Escape,
manual pins, staged-edit content, no drawer auto-open, focus transfer, all four
Escape guards (staged, palette, shortcuts, typing), the guided-tour fin step,
and the deselected staged banner.

## B — remaining 1280/1024 issues

Sweep: eight stages × {1600×1000, 1280×800, 1024×768} × {inline closed, open},
48 captures before and after, text-line and overflow measurement
(`gate2-after/sweep/sweep.json`, `sweep-summary.json`).

| Finding (base) | Fix | After |
|---|---|---|
| Airframe mass header “Share of dry mass” wrapped at 1280 open | `whitespace-nowrap` on every `DataTable` header + Mass/CG/Δ columns narrowed from 110/120/80 to 96/108/68 so the last column still fits | 1 line, table `scrollWidth == clientWidth == 636` |
| Palette clipped to “Search, or type span 2…” at 1280 | below 2xl the label is `Search` + key hint; 2xl keeps the full typed-command hint; aria-label/title unchanged | 1280 `Search`, not clipped; 1600 full phrase |
| Motor tool tabs wrapped at 1280 open | hide the 10.5 px note below 2xl | all five tabs 1 line; **`Segmented whitespace-nowrap` was not needed** |
| Aero headers/table at 1280 with the inspector open | existing widths fit once verified (no change) | 5 headers 1 line, 636/636 |

Base sweep found **30** matching items; after finds **0**. Zero console errors
and zero CSP violations in both runs. The sweep's `History N` tab false
positive (count span has a smaller font box but shares the line) is excluded
and documented in `sweep-summary.json`.

`scripts/preview-journeys.mjs` gained assertions only (palette label, one-line
headers, last mass column inside the table, Motor tabs, Aero divider/footnote).
The complete `pnpm test:browser` suite passes, including the earlier
`ui-polish-pass` journeys and the RMP15-C05 800×600 header/Run fit.

## C — Aero non-lifting parts

- `DataTable` (`src/console/kit/Table.tsx`) accepts either `rows` or
  `sections=[{key,label?,rows,quiet?}]`; a labelled section after the first gets
  a full-width divider row (`role="cell" aria-colspan`, `data-table-divider`);
  `quiet` dims its rows (`opacity-70`, full on hover) while keeping
  hover/click/active. Existing flat callers are unchanged.
- `classifyBreakdownRows` (`src/console/stages/aeroBreakdownText.ts`): positive
  rows sorted by share; unknown non-lifting types (body tube, parachute, mass
  item) and engine exact zeros in the secondary group; other unknowns stay
  warning lines with `unknownRowSentence` and the engine reason.
- Aero table: header **Part**; secondary rows show `—` for Share, CP and Δ run;
  unknown CNα shows `—` (never 0); an engine zero renders `ResultValue` `0.00 /rad`.
  Rows keep hover-to-find and click-to-select. One footnote, exact text:
  “— not modelled as a lifting surface in this subsonic rollup. These parts move
  the CG, not the CP.”
- Removed `carryNoLiftSentence`, `nonLiftingSentence` and the singular/plural
  label map; `unknownRowSentence` stays. The engine citation
  (`crates/astraea-core/src/aero.rs:1302-1312`) still supports the footnote
  statement and the engine was not touched.

Aero at 1600 shows 2 lifting rows, the divider and 5 dimmed secondary rows
(Payload & Avionics Bay, Airframe Coupler, Booster & Motor Section, both
parachutes). Hover over a different secondary row changed the 3D canvas hash
(`af5dfa4c…` → `475a4ffa…`), so the hover highlight renders. Clicking a
secondary row selects its tree item. Screenshots: `C-1600-aero-table.png`,
`C-1600-secondary-hover.png`, `C-1280-aero-table.png`.

## Falsifiers (base vs after)

One script, `gate2-base/falsifier.mjs`, serves a built dist with the production
CSP and checks all three items behaviourally:

- Base `6de01f6` (preserved dist `gate2-base/dist-6de01f6`):
  `BASE_SHA=6de01f6… node falsifier.mjs ./dist-6de01f6 base` → **exit 1**,
  14 of 17 checks fail: A1, A2, A4, A5, B1, B2, B3, B5, C1, C2, C3, C4, C6, C7
  (`gate2-base/base-falsifier.json`, log).
- After (this tree's `dist`): `node falsifier.mjs <repo>/dist after` →
  **exit 0**, 17/17 pass, 0 console/CSP errors (`gate2-base/after-falsifier.json`).

## Commands actually run (this tree)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 (`gate2-after/tsc.log`) |
| focused `npx vitest run --maxWorkers=2` (6 files) | 31 passed (`gate2-after/vitest-focused.log`) |
| `npx vitest run --maxWorkers=2` | 152 files, 1836 tests passed, 160.08 s (`gate2-after/vitest-full.log`) |
| `PATH=… CARGO_BUILD_JOBS=2 pnpm build` | exit 0, 1.87 s, `app-BFpaatzp.js` (`gate2-after/build.log`) |
| `pnpm test:browser` | exit 0, 27 acceptance passes, no runtime/CSP errors (`gate2-after/browser.log`) |
| after probe | exit 0, 0 console/CSP errors (`gate2-after/probe.log`) |
| after sweep | exit 0, 0 console/CSP errors (`gate2-after/sweep.log`) |

## Files changed

Production: `src/console/Workstation.tsx`, `src/console/shell/{Inspector,Shell}.tsx`,
`src/console/stages/{Airframe,Aero,Motor,common}.tsx`,
`src/console/stages/aeroBreakdownText.ts`, `src/console/kit/Table.tsx`.
Tests: `src/console/shell/inspectorAuto.test.tsx` (new),
`src/console/kit/Table.test.tsx` (new),
`src/console/stages/{aeroBreakdown.test.tsx,aeroBreakdownText.test.ts}`,
`src/console/shortcutLabels.test.tsx`.
Docs/browser assertions: `CHANGELOG.md` (top section),
`scripts/preview-journeys.mjs` (assertions only), this file, `EVIDENCE.json`.

## Deliberately not done

- No changes to `src/console/viewport/*`, `crates/`, `src-tauri/`, engine/WASM,
  physics, gates, thresholds, presets, schema, exports, caveat/claim text,
  `README.md`, `docs/screenshots/`, `public/landing/`.
- Empty 3D click is still not a deselect (approved); Escape is the gesture.
- Motor/Verify diagnostic placeholders are not collapsed (approved).
- `Segmented` did not need `whitespace-nowrap`; only the Motor note hide was
  required. Recorded here as requested.
- No push, merge, tag, release, publish, register/manifest/board/handoff edits.

## Open questions for review

1. The inline panel stays mounted (inert) while closed at wide widths so the
   width/opacity transition can run. Hidden Build/Flight inspector hooks still
   compute their local derived data; this is cheap, but review may prefer
   unmount-after-transition.
2. Escape's guard includes any open `[role="dialog"]` (drawer, provenance),
   which is stricter than the four approved guards. It prevents a deselect when
   a dialog was the Escape target.
3. The close transition's wall-clock sample under SwiftShader is ~385 ms from
   timer starvation while the 3D highlight changes. The CSS duration and the
   manual-close `transitionend` are both 160 ms; a GPU-backed browser should be
   smooth.
4. Mass-budget fixed column widths changed (110/120/80 → 96/108/68) to keep the
   nowrap header and Δ run column inside the 1280 table. Names keep their
   `minmax(170px, 1.4fr)` and titles.
