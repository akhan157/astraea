# viewport-look — RESULT

Lane `viewport-look-b`, base `ac805fc` (the lane's pinned base), checkpoint
`c9d90da` (previous author, unreviewed). This session reviewed the checkpoint,
finished the four Gate 1 amendments and the Flight clipping finding, and stopped
for coordinator review. **Not self-accepted.**

| commit | what |
| --- | --- |
| `ac805fc` | base (before capture) |
| `c9d90da` | checkpoint from the crashed author session (kept as-is) |
| `8116188` | selection dim 0.62 + emissive lift |
| `673929f` | Flight safe-region fit, gizmo corner, stable refit, hull probe |
| `99852d1` | browser-smoke assertions + CHANGELOG |
| this commit | RESULT + EVIDENCE |

## What the coordinator asked for, and where it stands

**New finding — Flight clipping.** Fixed. The Flight fit used the *unposed*
silhouette in the whole canvas, so a tilted/descending pose ran under the
Play/Full-flight/ISO strip and the pose card. The viewport now measures the
chrome drawn over the canvas (its own toolbar plus absolutely positioned cards a
stage floats on it), fits the model into the free region that remains, and
centres the model there. Flight fits the *pose-invariant envelope* (the sphere
that contains the drawn model at any attitude) instead of the instantaneous
posed box: a pose cannot leave the frame, and the distance does not pulse while
the scrubber plays. Cost on this slender rocket: 1.5% of fill
(`hypot(1.485, 0.256) / 1.485`). The probe asserts, at 1600×1000 and 1280×800,
for rail / burnout / apogee / T+28.98 s / touchdown, that the rocket's projected
silhouette stays inside the canvas, inside the app's reported free region, and
clear of the toolbar, pose readout, scrubber and gizmo. All 30 assertions pass;
minimum clearance 24 px at 1600×1000 and 11 px at 1280×800.

**A. Static shadows must not go stale.** Every caster-moving change raises
`shadowMap.needsUpdate`: the layout identity (length, parts added/removed), the
canvas size, the attitude quaternion (every frame of playback), the ghost vehicle
and its opacity, and the view preset. Evidence:

- `data-shadow-updates` rises once per pose change across the five scrubber
  samples and by 7–9 during a 2 s playback window.
- A part-length change raises it by 1.
- Rendered proof: with the camera fixed, **3 690 floor pixels outside the
  rocket's on-screen silhouette change** across five poses (a frozen map would
  leave every one of them bit-identical). The silhouette mask comes from the
  viewport's own projected hull, so a tilted rocket's axis-aligned box cannot
  swallow the floor.
- The ghost/compare caster dependency is in the same effect, but this session
  could not draw a ghost (no edit checkpoint existed and opening the compare
  panel also resized the canvas), so that path is **code-verified only** — see
  "not proven" below.
- Sanity check during the review: a diagnostic build with
  `shadowMap.autoUpdate = true` rendered **byte-identical** images to the shipped
  static path in Airframe and Flight (0 differing pixels), so "static" is not
  lagging "dynamic" at a given pose.

**B. Selection focus-dim only while selected.** `SELECTION_DIM = 0.62` (the
approved number). Hover never dims; the CG/CP markers, the parachute and motor
overlays and the ghost outline never route through the tone resolver
(`appearance.test.ts` pins both the behaviour and the single call site). One
honest deviation: flat, 0.62 leaves the two palest shell tones at 2.8:1 against
the accent, under the design's own 3:1 floor, so the selected part carries the
designed emissive lift (0.45) and the test measures the rendered pair (≥3:1 for
all 18 tones) rather than two flat swatches.

**C. Refit must not break keep-last-layout during drags, and no camera jitter.**
The checkpoint's zoom-preservation read the live camera distance as a user zoom
and fed the refit back into itself (measured 2.4% distance steps on frames where
nothing changed). A zoom is now measured from the orbit controls' own `change`
events, with the fit's own writes excluded; a length drag has no such gesture, so
the distance is exactly the fit. `layoutPersistence.test.tsx` still passes
untouched. Probe on the final build: direction bit-stable (0.000°), distance steps
on frames where neither the length nor the canvas changed: **0** (12 samples),
and a resize plus a length change after an orbit keeps the orbit (0.36°).

**D. Drag frame time, before and after.** Reported plainly below.

## Measured numbers

Framing, final build (reported box = exact projected silhouette; "lit" = pixel
bounding box of bright pixels, a lower bound; before numbers from the original
`before/probe.json`):

| shot | canvas | box (px) | reported w/h | lit w/h | before lit w/h |
| --- | --- | --- | --- | --- | --- |
| Airframe 1600×1000 | 1031×596 | 82,208–907,354 | **0.800** / 0.245 | 0.795 / 0.219 | 0.521 / 0.147 |
| Airframe 1280×800 | 711×382 | 55,129–624,230 | **0.800** / 0.263 | 0.795 / 0.232 | 0.485 / 0.146 |
| Airframe fin 1600×1000 | 706×596 | 61,234–626,336 | **0.800** / 0.170 | 0.797 / 0.149 | 0.761 / 0.147 |
| Airframe fin 1280×800 | 386×382 | 34,156–343,212 | **0.800** / 0.146 | 0.793 / 0.131 | 0.891 / 0.146 |
| Aero 1600×1000 | 706×536 | 60,205–625,306 | **0.800** / 0.189 | 0.796 / 0.166 | 0.684 / 0.147 |
| Aero 1280×800 | 386×326 | 33,128–342,184 | **0.800** / 0.170 | 0.795 / 0.150 | 0.762 / 0.150 |
| Flight 1600×1000 | 956×378 | 437,46–538,305 | 0.105 / 0.687 | 0.098 / 0.669 | (mask included chrome) |
| Flight 1280×800 | 636×168 | 311,86–327,124 | 0.024 / 0.223 | 0.008 / 0.036 | (mask included chrome) |

`data-fit-fraction` is a fraction of the half-canvas; in Flight it is 0.80 of the
*free region* (0.2746 of the half-canvas at 1280×800), not 0.80 of the canvas.
The two "before" Flight rows are not a framing comparison: the original pixel
mask did not exclude the stage chrome.

Gizmo: 62 px at the top-right with a 40 px margin (961,10–1021,70 on a 1031-wide
Airframe canvas); 203 axis-coloured pixels in the top-right corner and 0
foreground pixels where the old cube sat. In Flight it drops below the pose card
(886,252–946,312 at 1600×1000; 566,78–626,138 at 1280×800, between the pose strip
and the scrubber).

Drag frame time, 1280×800, real pointer drag on the booster length slider,
SwiftShader, `requestAnimationFrame` deltas:

| capture | build | p50 (ms) | p95 (ms) | mean | frames |
| --- | --- | --- | --- | --- | --- |
| before (original) | `ac805fc` | 150.0 | 266.7 | 147.1 | 196 |
| before2 (re-run, paired) | `ac805fc` | 150.0 | 250.0 | 142.6 | 198 |
| after (final) | `99852d1` | 183.4 | 316.6 | 196.7 | 187 |
| after (run 2) | `673929f` | 183.3 | 250.0 | 170.6 | 188 |
| after (run 3) | `673929f` | 183.3 | 283.4 | 179.2 | 188 |

**p50 is +22% on the paired runs; p95 ranged +0% to +27%.** This must be read
with the host's own variance: the *identical* `ac805fc` build also measured
p50 33.4 ms and the identical after build 66.7 ms in other runs (load average
2.7–11 on an 8-core laptop shared with other work). That variance is larger than
the effect, so this measurement cannot rule out a regression anywhere in the
0–25% band, and it does not show one above 25% except the single p95 sample. The
only new per-frame cost is one shadow pass per geometry change (1024², one caster
set, `PCFSoft`), which is the behaviour amendment A requires. **Re-measure on a
quiet machine before accepting the performance claim.**

Shadow: 3 690 floor pixels outside the silhouette change across the five poses;
mean shadow luma 8.84; playback raises the map 7–9 times in 2 s.

## Commands actually run (final tree `99852d1`, clean)

- `pnpm install --frozen-lockfile` — once at the start, ok.
- `pnpm build:engine` — ok (`src/engine/astraea_engine.wasm`).
- `npx tsc --noEmit` — exit 0.
- `npx vitest run --maxWorkers=2 src/console/viewport/` — 6 files, 44 tests passed.
- `npx vitest run --maxWorkers=2` — **156 files, 1 875 tests passed**.
- `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` — ok, bundle
  `app-CXYbeTkc.js`, sha256 `31d31e64ac3a85d9721020bc14320382484559d055c13312cee0c837ec77b180`.
- `pnpm test:browser` — passed, including the new assertions:
  `3D view auto-frames at 0.800 @ 1600×1000, 0.800 @ 1280×800; presets still
  re-orient`, `Flight playback refreshes the shadow map with the pose (6 refreshes
  in 1.2 s)`, `Flight pose stays inside the free canvas region at 0.25 s / 6.10 s
  / 11.05 s / 12.16 s`.
- `node probe.mjs --label after …` — 37 assertions, 0 failed (evidence
  `after/probe.json`, screenshots `after/*.png`).

## Bugs found in the checkpoint during review (fixed here)

1. `silhouettePoints` crashed on a fin set without a layout contribution —
   three shell test files (`inspectorAuto`, `projectChrome`, `ShareFlightCard`)
   failed for that reason. Found by the full suite.
2. The zoom-preservation feedback loop (amendment C).
3. The frame report first read the camera matrix and produced boxes 2× too large
   in Airframe; the pixel cross-check caught it. It now uses the same pure
   projection as the fit, and applies the *scene* quaternion
   (`attitudeToThree`), not the raw engine quaternion — that one was caught by
   comparing the reported box with the lit pixels in Flight.
4. The gizmo's reported rect went stale after a canvas resize (moved to a size
   signal).
5. The preview-journeys shadow assertion raced the canvas mount; it now polls.

## Deliberately not done

- No push, merge, tag, release or publish. No register/manifest/board/handoff
  edits. No subagents.
- No edits outside the lane's scope: stages (including `FlightTimeline`), engine,
  schema, presets, exports, README, `docs/screenshots/`, `public/landing/`.
- No new drei import (the four shell test mocks are untouched); the gizmo is the
  custom axis gizmo, and fins use the stored `component.color`.
- No camera tween anywhere, so there is nothing new for `prefers-reduced-motion`.
- Did not recapture the documentation screenshots (coordinator's call).

## Not proven / open questions

1. **1280×800 Flight is cramped.** The stage gives the 3D canvas 636×168 px; the
   pose strip (44–74) and scrubber (139–156) leave 57.5 px, so the fitted rocket
   is ~40 px tall. That is the layout, not the framing; a stage-layout change is
   out of this lane's scope. Recommendation: give the Flight 3D view more height
   at short viewports (or move the pose strip), then the same fit will fill it.
2. **Ghost/compare shadow refresh** is code-verified only (see A). To prove it,
   a session needs an edit checkpoint so the ghost is actually drawn.
3. **Drag performance** — re-measure on a quiet machine (see D).
4. **0.62 vs the flat 3:1 falsifier** — resolved with the emissive lift; confirm
   the resolution is acceptable, or say the dim should drop to 0.55 and the flat
   ratio should win.
5. **Pose-invariant envelope** rather than the instantaneous posed box; 1.5%
   under-fill, no zoom pumping. Confirm.
6. In Flight the ISO shadow is a thin strip largely behind the rocket (a vertical
   rocket's floor shadow is narrow); it is visible and it moves, but if the look
   should show a stronger floor shadow, the key light wants a more side-on
   azimuth. Out of scope for this lane.
