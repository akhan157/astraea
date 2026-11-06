# Lane declutter-fold — result

Status: implementation complete, all required checks run and green. **Pending coordinator review; this lane cannot self-accept.**

- Branch: `declutter-fold` (same worktree: `/home/ak/.t3/worktrees/astraeat3/t3-b1aecbc4`)
- Pin / assignment commit: `c09c3f0d8111f637d1c1d7eeb2bfe7194be04e7f`
- Gate 1 note: `~/.paseo/worktrees/3s8t98rp/evidence-declutter-fold/gate1.md` (approved with amendments)
- Implementation commits:
  - `5f6d111463fcedb2d0c6214141817dd8912924f4` — production code
  - `30a803cdf88ab85d8e41efd052d12686f7d0a377` — unit tests
  - `11e380563aa63ea70034b28af37a282fa54c7d26` — browser journeys
  - Report commit: this commit (`RESULT.md` + `EVIDENCE.json`)

## What changed

**Shared fold kit — `src/console/kit/Caveat.tsx`**
- `isOverflowing(el)` = `scrollWidth > clientWidth + 1` (one-pixel tolerance, exported for tests).
- `FoldButton`: the existing Caveat More/Less button extracted unchanged (underlined
  dotted, `C.muted`, `text-[11px]`, `aria-expanded`, `aria-controls`, More/Less). Optional
  `isolate` stops `click`/`keydown` propagation for use inside the clickable gate row.
- `OverflowFold`: one `min-w-0 truncate` line (ellipsis) plus an inline `shrink-0` More.
  The control appears when the line overflows, or always when `always` is set. A
  `useLayoutEffect` measures after layout and a `ResizeObserver` re-measures on every
  width change. While open it keeps the collapsed decision (the wrapped text is not the
  collapsed width) and re-measures when closed. Open drops `truncate` on the same node;
  the full text is never unmounted.
- `Caveat` rendering is unchanged; it now uses the shared `FoldButton`.

**Airframe stability card — `src/console/stages/Airframe.tsx`**
- With both lines (`m > 3`): amber sentence (`C.changed`, `#F5B544`) then grey sentence
  (`C.dim`, `#5E646D`) on one ellipsized line with More; expanding renders the same two
  spans as blocks in their original colours. Always folded (item 1 has no overflow
  qualifier), matching the owner-approved preview.
- `m <= 3`: the single grey line renders exactly as before — no fold, no More.
- The `data-margin-unavailable` warning (line 37 area) is untouched: full text, outside
  every fold, never merged into it, and still rendered before the grey line.
- Exact sentences (asserted in unit tests and journeys):
  - `Above generic geometry band (>3 cal). Weathercocking requires flight analysis.`
  - `Component rollup only; selected motor and powered-flight margin history unavailable.`

**Aero breakdown intro — `src/console/stages/Aero.tsx`**
- The intro paragraph is the same `OverflowFold`, same `px-3 py-2 text-[12px]` and
  `C.muted`: one line + More only when it overflows, unchanged where it fits.
- Exact sentence: `Subsonic component geometry and mass rollup; excludes the selected
  motor and depletion history. Pad all-up, burnout and powered-flight minimum margins are
  unavailable here.`

**Gate reasons — `src/console/kit/Status.tsx`**
- `GateReason` keeps `data-gate-reason` and `title` on the text node.
- `status === 'fail'` renders the previous `break-words` div unchanged: never folded.
- Every other status folds only when the measured line overflows; More expands in place.
- `isolate` stops click/keydown propagation so the nested control never selects the row's
  gate; a row click elsewhere still does.

**Validation card — `src/console/stages/Verify.tsx` + `src/state/session.ts`**
- Heading row is a `<button type="button" data-validation-toggle aria-expanded
  aria-controls>` with a leading `ChevronRight` (11 px, `C.dim`, rotates when open — the
  same treatment as `kit/Disclosure.tsx`). The existing paragraph and `EvidenceStudio`
  stay in the DOM inside `<div id hidden={!open}>`.
- Open state is `useSessionStore().validationOpen` (default `false`), so it survives
  stage switches (Verify unmounts on stage change). **Session-only**: it is not part of
  the project store, envelope, run inputs, project JSON or any export; toggling both ways
  remains standard disclosure behaviour.

## Tests added / changed

- `src/console/kit/fold.test.tsx` (new): `isOverflowing` boundaries; always-fold
  More/Less with the full text in the DOM; overflow-only folding with jsdom metrics
  stubbed to 500/100 (More) and 100/100 (none); failing gate never folds; passing gate
  folds and expands; Enter and Space on More expand without selecting the gate, while a
  row click still calls `onOpen`.
- `src/console/stages/declutterFold.test.tsx` (new): renders **Airframe and Aero** and
  asserts the same card fold in both (exact strings, one More, amber-first order,
  computed colours `rgb(245, 181, 68)` / `rgb(94, 100, 109)`, expanded blocks); `m <= 3`
  leaves the grey line unfolded with no More; `cpUnavailable` warning is full, has no
  fold ancestor and is not merged; Validation starts closed, opens on the heading, and
  stays open across a remount.
- `src/console/stages/aeroBreakdown.test.tsx`: intro folds only with stubbed overflow and
  shows no More when it fits, with the exact sentence asserted.
- `src/console/evidence/ShareFlightCard.test.tsx`: this test renders `Workstation`
  directly on Verify without clicking the disclosure, so its `beforeEach` now seeds
  `validationOpen: true` (session-only). The disclosure interaction itself is covered by
  `declutterFold.test.tsx`; the browser journeys click the real heading.

## Journeys — `scripts/preview-journeys.mjs`

- `assertGateReasonsWrapped` replaced by `assertGateReasonsReachable`: each
  `[data-gate-reason]` must be fully visible (`scrollWidth <= clientWidth + 1 &&
  scrollHeight <= clientHeight + 1`) or have `button[aria-controls="<reason id>"]` with
  `aria-expanded="false"` that, when clicked, makes it fully visible. The Flight Results
  basis-cell assertion is unchanged.
- `openValidation(page)` clicks `[data-validation-toggle]` only while collapsed, then
  asserts it is expanded. Called after the Verify entry in `previewJourneys` (altimetry),
  six times in `calibrationJourney`, and twice in `shareFlightJourney`.
- New Airframe step: one More inside the fold, collapsed line ellipsized
  (`scrollWidth > clientWidth`), amber before grey, computed colours on the two
  `[data-fold-part]` spans, click → Less, both exact sentences, not clipped, more than one
  line high.

## Checks actually run (this tree, foreground, `--maxWorkers=2`)

| Command | Result | Log |
| --- | --- | --- |
| `pnpm exec tsc --noEmit` | exit 0 | `tsc.log` |
| `pnpm exec vitest run --maxWorkers=2` | 164 files, 1944 tests passed, exit 0 | `vitest-full.log` |
| `PATH=… CARGO_BUILD_JOBS=2 pnpm build` | build:engine + tsc + vite build, exit 0 | `build.log` |
| `pnpm test:browser` | Chromium smoke + all journeys passed (38 acceptance lines), exit 0 | `browser.log` |

Browser log includes `all eight stages, themed controls and reachable gate reasons`,
`Airframe caveat folds to one line and expands to both full sentences`, the calibration
journeys with the Validation card opened, and `share this flight: bundle files, log bytes
and checksum`.

## Deliberately not done

- No image opened, read or attached; the approved-preview PNGs were listed by filename
  only. Visual comparison is the coordinator's.
- No fold on Flight Results basis cells; their assertion is byte-unchanged.
- No label, wording, colour, layout, engine, physics, schema or export changes.
- No push, merge, release or publish; no self-acceptance.
