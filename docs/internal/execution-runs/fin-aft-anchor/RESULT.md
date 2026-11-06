# Lane fin-aft-anchor — result

Status: implementation complete after coordinator review, pending re-review. This
lane cannot self-accept. The review found one drift bug in the gesture round trip;
it is fixed in `c60d5d8` with the regression `65481e0`.

- Branch: `fin-aft-anchor`
- Base: `10f0cf691f612cade167291efc3e2817aba05550` (tip of `frontend/design`
  after the live-sizing-fix merges)
- Assignment commit: `3ac97a2bc141fb490600382e70d8376fa4a32a4e`
- Production commit: `a14348e4bd725aceb9d934504e3f800cc0d7c2e7`
- Tests commit: `70a70ed2ca933187437c0a2273ba125dca10f555`
- Review fix (production): `c60d5d830ca96cda5b57e285666964b8c80907bb`
- Review fix (regression test): `65481e0c59970f1b1f388faf4d17fca634762ae8`
- Report commit: this commit (RESULT.md + EVIDENCE.json)

## Review fix

`tubeLengthPatches` used to return only the tube patch when `delta === 0`. During a
gesture the anchor is fixed, so a drag that went 1450 → 1000 → exactly 1450 staged
the tube length back but left the fins at the 1000 mm offset, breaking the aft
margin. The early return is gone: every live fin is always re-derived as
`anchor.axialOffset + delta`, and a patch is skipped only when the fin's current
preview offset already equals that target. Coming back to the anchor therefore
writes the anchor offset again (a no-op draft entry is avoided only when the value
already matches).

## What changed

### Production

- `src/console/shell/partBounds.ts` — aft-anchored tube-length helpers.
  - `captureTubeAnchor(components, tubeIndex)` snapshots the tube length and every
    attached fin set's `axialOffset` at gesture start.
  - `tubeLengthPatches(components, tubeIndex, anchor, nextLength)` returns the tube
    patch plus one `axialOffset = base + (nextLength − anchor.length)` patch per
    attached fin set. Fins use the existing nearest-preceding-body-tube rule; both
    trapezoid and elliptical root chords and freeform `freeformExtents(points).rootChord`
    are already covered by `childAxialExtent`.
  - `tubeLengthFloor(components, tubeIndex)` replaces the old "furthest child end"
    minimum:
    ```
    floor = max(
      0,
      max over mass/parachute children of (offset + extent),   // front-anchored, unchanged
      max over fin children of (length − offset)               // = extent + current aft margin
    )
    field min = max(spec min 0.02 m, floor)
    ```
    For NSL this is `max(0.90 chute, 0.35 fins) = 0.90 m`.
- `src/state/project.ts` — `stageComponentPatches(studio, entries)` stages several
  component patches in **one** store write. All-or-nothing: an empty patch, a
  non-finite value, a removed id or an unknown id rejects the whole set and stages
  nothing. `stageComponents(id, patch)` now delegates to it, so the validation rule
  has one implementation.
- `src/console/kit/Fields.tsx` — `NumberField` exposes `onGestureStart` /
  `onGestureEnd` on the unit-scrub pointerdown/up/cancel; `SliderField` exposes them
  when its existing `freeze()` / `unfreeze()` transitions happen. The freeze still
  uses the pre-press window; it cannot be replaced by focus mid-gesture.
- `src/console/shell/Inspector.tsx` — one `stageTubeLength(next, anchor?)` closure is
  the only path for a body-tube length edit (typed field, unit scrub, arrow nudge,
  slider). It stages the length and all attached fin offsets atomically with
  `stageComponentPatches`. The length row passes the gesture callbacks, so slider
  and scrub steps all measure from the gesture-start anchor; typed commits and
  nudges capture the current preview per call. `Revert Length` reuses the same
  helper with the committed length, restoring the fins with it.

Behavior details:

- Both directions follow `Δ = next − anchor length`: lengthening also moves the
  fins aft with the aft end. The aft margin `length − (offset + extent)` is
  invariant for every fin.
- Fins are no longer part of the tube-length floor because they move; front-anchored
  mass/parachute children still cap it and are named by the existing overhang
  warning when they block a length.
- Freeform and multiple fin sets on the same tube shift by the same Δ, each keeping
  its own margin. An intervening transition does not change the parent rule (same
  `parentTubeOf` rule as the existing caps).
- Direct `stageComponents({ length })` does not move fins: anchoring is an edit
  gesture, not a store invariant. Opening an existing file keeps every number.
- No schema, file-format, engine, aero/physics, preset-value, gate or threshold
  change.

### Tests

- `src/console/shell/inspector.test.tsx` — new `describe('aft-anchored fins')`:
  typed entry, unit scrub anchored to gesture start, 45-step slider drag with the
  margin invariant checked every step plus a two-change batch, **a drag that comes
  back to the exact gesture-start length without releasing**, arrow nudge,
  revert/discard, multi-fin-set + freeform + cross-parent + mass/chute untouched,
  fin-only floor and flush fin, fin at the tube front.
- `src/state/stores.test.ts` — all-or-nothing bulk staging: an unknown id or a
  non-finite value in one entry stages nothing; two valid entries land together.

**Re-pinned expectations (owner-mandated behavior change, not a relaxation):**

- `src/console/shell/inspector.test.tsx` track-press window test:
  `beforeMin` changed `'1420'` → `'900'`; the window-freeze assertion is unchanged.
- The former "caps a tube length at the furthest axial end of its children" test
  became "floors a tube length at its front-anchored children; attached fins move
  with the aft end": `>= 1420` → `= 900`.

Reason: the owner chose "move with aft end". The fins no longer floor the tube, so
the NSL booster minimum is the main chute end (0.85 + 0.05 m), not the fin end
(1.10 + 0.32 m). The assignment's "fin aft end at the tube aft end" was imprecise
and was confirmed to mean "aft margin unchanged": at 1.45 m the NSL fin root
trailing edge is 30 mm forward of the aft end; at 1.00 m it is still 30 mm forward
(offset 0.65, end 0.97). A synthetic flush fin proves the equal-end case.

## Verification

Raw logs and screenshots are outside the repo in
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-fin-aft-anchor/`.

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no diagnostics (`tsc.log`) |
| `npx vitest run --maxWorkers=2 src/console` | 44 files, **381 tests passed** (`console-tests.log`) |
| `npx vitest run --maxWorkers=2 src/console/shell/inspector.test.tsx src/state/stores.test.ts` | 43 passed (`focused-tests.log`) |
| `PATH=$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=2 pnpm --config.verify-deps-before-run=false build` | exit 0, built in 1.10 s (`build.log`); `node_modules` symlink, no install |
| new tests + store tests at base `10f0cf6` | **12 failed / 31 passed** (`base-tests.log`) |
| round-trip regression at the buggy `70a70ed` | **1 failed**; fin stayed `0.6500000000000001`, expected `1.1` (`review-return-anchor-70a70ed.log`) |

### Base failures at `10f0cf6`

Detached worktree, new test files copied, `node_modules` symlinked, same command.
Exactly the nine new behavior tests, the two re-pinned expectations and the store
test failed; the other 31 passed.

| Test | Base observation |
|---|---|
| atomic bulk staging | `stageComponentPatches is not a function` |
| track-press window (re-pin) | min `'1420'`, expected `'900'` |
| tube floor (re-pin) | min `1420`, expected `900` |
| typed 1.00 m | tube clamps to `1.42`, expected `1.0` |
| unit scrub | clamps to `1.42`, expected `1.35` |
| slider drag | min `1420`, expected `900` |
| drag round trip to the anchor | fin offset `1.1`, expected `0.65` after the first stage |
| arrow nudge | stops at `1.42`, expected `1.4` |
| revert | fin offset `1.1`, expected `0.65` after the length edit |
| multi-fin set | floor `1420`, expected `1050` |
| flush fin | no length patch (`undefined`), expected `0.32` |
| fin at tube front | window min `500`, expected `1000` |

### Built surface probe

`dist` built, served by `vite preview` with the production CSP from
`dist/_headers`; Chromium under SwiftShader, 1600×1000, real pointer drags
(`slider-probe.mjs`, `probe-run.log`, `probe.json`). Initial state: booster
1450 mm, fin offset 1100 mm, layout 2.970 m, slider window 900–2900 mm.

| Run | Start | Samples | Final booster | Final fin offset | Layout | Result |
|---|---|---|---|---|---|---|
| Round trip | thumb at 1450; drag to ~1011 and back to the same pixel, **no release** | 26 | **1450 mm** | **1100 mm** | 2.970 m | drag returned to 1449 (native range pixel grid); one ArrowUp landed exactly on the anchor while the pointer stayed down; final delta-0 step rewrote the fin anchor; window 900/2900 throughout |
| Drag 1 | track at the thumb (27.5%) | 24 | **1011 mm** | **661 mm** | 2.531 m | `661 = 1100 − (1450 − 1011)`; window frozen at 900/2900 |
| Drag 2 | **track at 80%, away from the thumb** (thumb at ~10%) | 26 | **962 mm** | **612 mm** | 2.482 m | press jumped to 1817 mm, then monotonic left to 962; window stayed 900/2022 in all 27 samples; `612 = 1100 − (1450 − 962)`; aft margin 30 mm |

Layout deltas match the tube deltas exactly (drag 1 −0.439 m, drag 2 −0.049 m;
the round trip restores 2.970 m). Zero page errors and zero console errors.

The round-trip gesture is one pointerdown/pointerup: the drag goes 1450 → 1011 →
1449, then a single `ArrowUp` (anchored key nudge, no release) reaches exactly
1450, the gesture-start value. A pure pixel drag cannot always land on the
gesture-start value because the native range quantizes ~2000 mm over ~300 px (~4
mm/px). The final delta-0 step is the one the review found: it now re-derives the
fin offset from the anchor. On the buggy `70a70ed` the equivalent jsdom step
staged 1000 → 1450 and left the fin at `0.6500000000000001`
(`review-return-anchor-70a70ed.log`).

Screenshots (`/home/ak/.paseo/worktrees/3s8t98rp/evidence-fin-aft-anchor/`):

- `probe-before.png` — 1450 mm booster, window 900–2900.
- `probe-before-fins.png` — fin inspector at 1100 mm.
- `probe-round-trip-mid.png` — mid round trip, tube ~1011 mm, fins slid forward.
- `probe-round-trip.png` — after the round trip, back at 1450 mm / 1100 mm.
- `probe-drag1-mid.png` — mid-drag, fins attached at the aft end, 2 parts staged.
- `probe-after-fins.png` — after release, fin offset **661 mm**, fins still at the
  aft end, layout length updated.
- `probe-drag2-mid.png` — mid track-started drag.
- `probe-after2-fins.png` — after the away-from-thumb track drag, fin offset
  **612 mm**.

## Deliberately not done

- No engine, WASM, schema, file-format, preset-value, gate, tolerance or physics
  change; `axialOffset` keeps its stored meaning and no file is rewritten on open.
- No automatic fin shift for edits made directly through `stageComponents` or
  preset/project replacement; only inspector length gestures move fins.
- No fin-shift on root-chord edits, part reordering, transitions or nose cones.
- No new cap/warning for legacy invalid fin offsets; the existing part/tube
  warnings remain the only surface, and an anchored edit preserves the existing
  (possibly negative) margin.
- No attempt to attribute fin "changed" dots to the tube gesture: the fin's own
  revert stays independent (approved), and reverting it can recreate an overhang
  that the existing warnings name.
- No push, merge, release or register/manifest/TASKS/handoff edits.

## Open questions for the owner

1. Editing a tube length while a fin sits at the tube front cannot shorten the tube
   at all (floor = current length). The alternative would clamp the fin at 0 and
   break the "move with aft end" invariant. Current behavior follows the approved
   formula; confirm it is the intended UX.
2. A length edit now stages every attached fin set, so the pending banner counts
   the tube plus each fin ("2 parts" for NSL). No UI change was made; confirm that
   is acceptable.
