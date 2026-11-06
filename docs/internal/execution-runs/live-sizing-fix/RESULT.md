# Lane live-sizing-fix — result

Status: implementation complete after coordinator review, pending re-review. This lane cannot self-accept.

- Branch: `live-sizing-fix`
- Base: `4a914ea159cbef349e4ac36367a1e107cf6b7e99` (tip of `frontend/design`)
- Assignment commit: `5adc8f86307f5b52ded61ec008e6f7cfcd36b491`
- First implementation: `4ff792fc181635d9199cfce39bf4925ae84fce86`
- Review fixes: `5d84eccc4e75495e1b803f058a7fa5d861a37916`
- Marker fix: `6d532ee1f0d58b2f705acfc8be0d6621ad10c880`
- Track-press fix: `39b4dad72b01b1acd518db6d025992f6c01fbbee`
- Report commit: this commit (RESULT.md + EVIDENCE.json)

## Coordinator review findings and fixes

1. **Dropped pending requests (blocker).** Pending targets are now a `Map` keyed by
   cache key, re-inserted on re-request so the newest is last. The pump first drops
   pending keys with no rendered consumer and no cached result, then dispatches the
   most recently requested remaining target, keeping leading+trailing 120 ms and one
   call in flight. A committed/ghost/mixed-model key is never overwritten by drag
   steps, and three concurrently subscribed keys all dispatch. Regression tests:
   three concurrent keys; a 20-step drag burst (≤2 dispatches for the dragged slot,
   intermediates unsubscribed); a subscribed committed key pending during a burst.
   The three-key test fails on `4ff792f` with `[1, 3]` (`review-4ff-three-key.log`).
2. **Tube length still allowed an overhang.** A body tube's length minimum (slider
   and field) is now the furthest child axial end, `max(offset + extent)` over parts
   whose parent is that tube. The tube inspector warns and names every part already
   past its end, matching the part-side warning. Tested from the tube side.
3. **2D drawing mismatch.** `Drawing2D` now draws `snapshot.vehicle` with
   `snapshot.layout`, the same pairing as 3D.
4. **Mixed aero-model keys.** `Viewport` and `Drawing2D` take an `aeroModel` prop
   supplied by the caller that owns the vehicle. Airframe/Aero pass the preview
   design's model; flight playback passes the committed design's model; the ghost
   uses `ghostAeroModel` (committed design); `PartsTree` uses the committed design's
   model. No component reads the preview model for a committed vehicle.
5. **Markers.** The opt-in is now the explicit `markers` prop, independent of
   loading: Airframe and Aero pass `markers`, flight playback does not. CG/CP come
   from `snapshot.breakdown` — the same breakdown that produced the drawn shape —
   so the stale loading window keeps both markers on the last drawn shape. The
   `cg`/`cp` props and the last-prop ref were removed. The viewport exposes
   `data-markers`, `data-marker-cg` and `data-marker-cp` for the probe. The new
   test holds the next solve and asserts the previous breakdown's CG/CP remain; at
   `5d84ecc` it finds no `data-markers` attribute (`review-5d8-markers.log`).
6. **Track press recomputed the window.** A press on the slider track changes the
   value before focus/change settle; `onFocus` then replaced the pointerdown window
   with one recomputed around the pressed value, so the first move jumped. The last
   pre-gesture window is now held in a ref, the freeze happens once per gesture,
   focus cannot replace an active frozen window, and pointerup/cancel/blur clear it.
   Min/max are snapped inward to the display step (1420, not 1420.0000000000002;
   the inner-diameter cap 151.5 floors to 151 so it never exceeds the cap). The
   regression presses the track, changes to a far value, focuses, and asserts the
   pre-press window survives. At `6d532ee` it observes max `5600` instead of `2900`
   (`review-6d5-track-press.log`).

## What changed

### Keep the last layout

`useLayoutSnapshot(vehicle, aeroModel)` returns `{ layout, vehicle, breakdown }`.
The snapshot is replaced only when the native result for the current
`contentKeyOf(vehicle)|aeroModelKey(aeroModel)` is ready; while the next solve is in
flight it returns the last ready snapshot. `Viewport` renders `snapshot.vehicle` with
`snapshot.layout`, so part lengths and axial positions cannot disagree, and CG/CP
use the snapshot breakdown. Camera framing and the grid use the snapshot length.
`useLayout` delegates for `PartsTree`, `Drawing2D` and `MassBudget`.

The viewport exposes `data-layout-state` (`empty | stale | ready`) and
`data-layout-length`. No TS-side layout was added.

### Coalescing and cache bound

- Pending targets: one per cache key in an insertion-ordered `Map`; re-request moves
  the key to the newest slot. Before dispatching, pending keys that are cached or
  have no active subscriber are deleted. The newest remaining key goes next.
- Leading + trailing, `STABILITY_COALESCE_MS = 120`, at most one native call in
  flight; the newest target always runs after the burst.
- Cache key includes the aero model.
- LRU cache, `STABILITY_CACHE_LIMIT = 48` settled entries. Reads/writes touch the
  key; eviction skips in-flight and currently rendered keys (refcounted).

### Slider window

Rule, in display units (SI `min`/`max` converted by `show()`):

```
lo = max(hardLo, v / 2)
hi = min(hardHi, 2 v)
if hi - lo < minSpan:  expand around v to minSpan, clamped to [hardLo, hardHi]
minSpan: length 50 mm (2 in), mass 0.1 kg (0.22 lb), raw = full spec range
```

The window freezes on `pointerdown` or keyboard focus. It is recomputed after
release (re-frozen around the value while the control still has focus) and whenever
the value leaves the frozen window. Hard caps clamp inside the window. Sliders are
full-width below the label+number row; typed fields keep their full range.

Worked examples (metric):

1. **1.45 m tube.** `v = 1450 mm`, hard 20–6000 mm → window 725–2900 mm
   (2175 mm). At ~300 px this is 7.25 mm/px; the old 92 px full range was ~65 mm/px.
2. **0.18 kg chute.** `v = 0.18 kg`, hard 0–20 kg → window 0.09–0.36 kg
   (0.27 kg). With a 5 g step: 54 positions, ~5.6 px per step.
3. **0.0048 m fin thickness.** `v = 4.8 mm`; doubling gives 2.4–9.6 mm (7.2 mm),
   below the 50 mm minimum, and the hard span (0.5–30 mm = 29.5 mm) is also below
   50 mm, so the slider uses the full hard range; 0.1 mm step → 295 positions.

Imperial equivalents: tube `v = 57.09 in` → 28.55–114.17 in; chute `v = 0.397 lb` →
0.198–0.794 lb; thickness `v = 0.189 in` → full 0.02–1.18 in.

### Cross-field caps

- `idMax = max(0, outerDiameter - 0.0005 m)` on slider and field.
- `odMin = max(0.01 m, innerDiameter > 0 ? innerDiameter + 0.0005 m : 0.01 m)` on
  slider and field. No dependent rewrite of the inner diameter.
- `offsetMax = max(0, parentTube.length - extent)` on slider and field. Parent =
  nearest preceding body tube (`core/mass.ts` rule). Extent: trapezoid/elliptical
  `rootChord`; freeform root length from `freeformExtents`; mass `length`;
  parachute `packedLengthM ?? 0.05`.
- `tubeLengthMin = max(offset + extent)` over the tube's children, on the tube's
  slider and field. If this exceeds the generic 6 m maximum, the field maximum
  expands to it so the range stays coherent.
- Warnings: ID ≥ OD; part extent past parent; tube length below a child's end
  (names the overhanging parts). Existing values are not rewritten; focus/blur of an
  out-of-range number field is a no-op.

### Mass steps and aero table

Mass rows and weighed mass step by 5 g metric / 0.01 lb imperial; lengths 1 mm /
0.05 in; walls and thickness 0.1 mm / 0.005 in. Number-field nudge steps unchanged.
Aero rows remember the vehicle that produced them; while stale they are dimmed,
`aria-busy`, `data-aero-preview="updating"`, with “Previous geometry; updating.”
Rows are cleared only on candidate/defect refusal.

### Optional fields

Rail-guide, launch-lug and launch-shoe rows get sliders once entered, alongside the
weighed-mass row. README wording and the screenshot were updated.

## Verification

Raw logs are outside the repo in
`.paseo/worktrees/3s8t98rp/evidence-live-sizing-fix/`.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no diagnostics (`fixed-tsc.log`) |
| `npx vitest run --maxWorkers=2 src/console` | 44 files, **372 tests passed** (`fixed-console-tests.log`) |
| focused four regression files | 20 tests passed (`focused-fixed-tests.log`) |
| marker persistence test | 1 passed (`focused-marker-test.log`) |
| inspector suite (track-press regression included) | 15 passed (`focused-track-test.log`) |
| `pnpm --config.verify-deps-before-run=false build` | built in 0.712 s (`fixed-build.log`); flag required because `node_modules` is a symlink, no install run |
| current regression tests at base `4a914ea` | 10 failed / 10 passed (`base-tests-current.log`) |

Base `4a914ea` failures (current tests, detached worktree, no stash):

- mass slider step was 1 (expected 0.005 kg)
- inner-diameter slider max 1000 mm (expected ≤151.5)
- fin-offset slider max 6000 mm (expected ≤1130)
- tube-length slider min 20 mm (expected ≥1420)
- no tube-side overhang warning
- no part-side overhang warning
- no optional-row slider
- no aero updating state
- layout null while the next solve is held
- layout request omits the selected aero model

Additional blocker check: at `4ff792f`, the three-concurrent-keys test observed
`[1, 3]` (key 2 dropped), matching the review (`review-4ff-three-key.log`). The
marker test at `5d84ecc` waits for `data-markers="present"` and receives
`undefined` (`review-5d8-markers.log`). Base `tsc` rejects the two-argument
`useLayout` falsifier, so the base bundle was built with `npx vite build` only.

### Built surface

Production CSP from `dist/_headers`, Chromium under SwiftShader, real pointer drag
on the NASA Student Launch body-tube length slider, 24 moves at 8 ms inside a
1600×1000 viewport.

Marker-aware final run:

| Drag frames | Markers present | Markers absent | `empty` viewport | `stale` | Release → final |
|---|---|---|---|---|---|
| 40 | **40** | **0** | **0** | 30 | 447.8 ms |

`data-marker-cg` changed through 24 distinct values at stale updates; the marker
never disappeared. Artifact `fixed-markers-latency.json`.

Track-press run: pressed the length slider track at 80% width (thumb was at 2%),
then dragged left in 30 steps. Every one of the 31 samples kept `min="1420"` and
`max="2900"`; values went 2630 → 2599 → … → 1690, monotonic with the leftward
drag. Artifact `track-drag-steps.json` (full per-step log).

Note, not changed: with the NSL fins at 1100 mm and a 320 mm root chord, the
booster length slider cannot go below 1420 mm. Shortening that tube is therefore
effectively blocked under the current cap; re-anchoring is an owner decision.

Earlier stability-only runs (same drag, before the marker opt-in change):

| Run | Drag frames | `empty` viewport frames | `stale` frames | Release → final layout |
|---|---|---|---|---|
| 1 | 41 | **0** | 28 | 518.6 ms |
| 2 | 40 | **0** | 29 | 771.1 ms |
| 3 | 32 | **0** | 26 | 686.8 ms |

Artifacts `fixed-review-final-latency-run{1,2,3}.json`. The spread is software-GL
and native-solve variability; no frame had an empty viewport. Final layout length
was 4.698 m in all runs.

Earlier base `4a914ea` probe (same drag form): 56 frames, 36 without a stability
result, release→final 878.8 ms. It did **not** visibly blank in 12 screenshot frames
or 36 CDP compositor frames (bright-pixel range 2.25–5.65%). That blank was not
reproduced at the built surface; the hook falsifier and the fixed build's zero empty
frames remain the evidence for the keep-last change. Artifacts:
`base-latency.json`, `base-probe.json`, `base-screencast.json`,
`base-frame-brightness.txt`, `base-screencast-brightness.txt`.

The README image is a 2000×1375 capture from the fixed bundle during a fin-span drag
with `data-layout-state="stale"` and valid geometry
(`fixed-live-sizing-final.png`).

## Findings disposition

1. **Physically impossible README rocket** — fixed: valid screenshot, part offset
   caps, part- and tube-side warnings. Neither side can create a new overhang.
2. **3D blanks during a drag** — fixed at the code level; 0 empty frames on the
   built fixed surface, and 40/40 drag frames kept the CG/CP markers. Base visual
   blanking was not reproduced.
3. **Uncoalesced calls / unbounded cache / missing aero model** — fixed; per-key
   pending queue prevents dropped keys; tests.
4. **Mass sliders in 1 kg steps** — fixed; 5 g steps tested.
5. **Length sliders too coarse** — fixed with the value-following window and
   full-width slider; the window freezes from the pre-press value on track
   presses and bounds are snapped to the step; worked examples above.
6. **Invalid geometry reachable** — fixed for ID/OD, tube length and parent axial
   extent; existing invalid designs warn, never rewrite.
7. **Aero table stale rows presented as live** — fixed with the updating state.
8. **README overstates sliders** — fixed: optional rows have sliders.

## Deliberately not done

- No fin/load/chute re-anchoring when a parent shrinks; warning/cap only.
- No TS-side 3D preview during a drag.
- No engine, WASM, schema, preset-value, gate, tolerance or physics changes.
- No push, merge, release or acceptance-register/manifest/TASKS/handoff edits.
- The parachute 3D envelope still draws `packedLengthM ?? 0.12` while the mass
  rollup uses `?? 0.05`; the cap uses 0.05. Recorded, not changed.

## Open questions for the owner

1. Should the drawn parachute envelope use the mass rollup's 0.05 m default instead
   of 0.12 m when `packedLengthM` is absent?
2. The window doubles around the current value, so a large single-gesture change
   needs repeated drags (or typing). Confirm the tradeoff.
