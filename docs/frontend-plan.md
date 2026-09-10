# Astraea Frontend — Open Work-Package Design Plan

**Worktree:** `akhan157/astraea-frontend` (dispatch `task_8afa1121b518`)
**Status:** brainstorm/design only — no source edits in this pass.
**Scope:** the five open UI items — recovery-bay 3D packing visualizer (E2),
sim-vs-actual flight overlay chart, interactive thrust-curve editor (E5),
PNG blueprint export, background web-worker Monte Carlo — plus UI cohesion
improvements found walking the current app.

---

## 0. Ground truth this plan builds on

- **Shell.** `src/App.tsx` = 4-studio workstation (CAD | Propulsion |
  Trajectory | Evidence) + `FlightSimulationTab` modal. Header owns preset
  switch, `.ork`/`.rkt` import, exports, undo/redo; `StudioId` union is
  `'cad' | 'propulsion' | 'trajectory' | 'evidence'`.
- **Store** (`src/store/rocketStore.ts`). Zustand, vehicle
  (`RocketVehicle.components`), shared `selectedMotorId`/`selectMotor`
  (same id drives FlightSim, Propulsion, Trajectory), `customMotors` +
  `importCustomMotor(motor)`, `stability`, view toggles, and a
  `RocketVehicle[]` undo/redo history. **Motors are outside history.**
- **Style.** Tailwind zinc-950/cyan on dark; studio root card is
  `rounded-2xl border-zinc-700/80 bg-zinc-900 p-5 space-y-5 text-xs`;
  sub-cards `bg-zinc-950/60 rounded-xl border-zinc-800/80 p-4`; numerics are
  `font-mono`; lucide icons; emerald=ok / amber=warn / rose=hazard badges.
  `docs/astraea-ui-ux-design-spec.md` §1.3 reserves violet for avionics and
  requires series identity ≠ safety-state color; §1.4 wants a persistent
  mission status rail; §7 forbids modal-only access to ordinary work.
- **Charts today.** No charting dependency. Existing precedent is hand-rolled
  inline SVG: `PropulsionStudio` burn-area sparkline (`burnAreaPolyline`,
  W=240/H=48 polyline) and `formats/blueprint.ts` (full SVG string with
  embedded `<style>`). Any new dependency (chart lib, raster lib, worker
  bundler) is a master-side decision — the emitter measures installed
  dependency versions from `node_modules`.
- **Tests.** Every component ships a scoped `@testing-library/jsdom` suite.
  `scripts/emit-benchmark-metadata.cjs` enforces a **closed**
  `FIXED_TEST_FILE_INVENTORY` (~line 160): a new `*.test.*` file that is not
  listed fails certification ("executed but outside the fixed test-file
  inventory — unacknowledged suite"); listed files that don't execute or
  whose source case count drifts also fail. `HASHED_REQUIRED_FILES` /
  `HASHED_INFORMATIONAL_FILES` additionally cite the component/fixture files
  by sha256. **Every new test file below therefore requires a one-line
  emitter inventory registration (+ one sha256 list entry where cited).**
- **Sim result.** `SixDofSimulationResult.telemetry: SixDofTelemetryPoint[]`
  (time, altitude, speed, thrust, drag, mach, accel, …) is explicitly
  noncanonical display data; canonical records are terminal metrics, per-point
  quaternions, and the run manifest. Charting must treat telemetry as
  presentation-grade, and the master-spec `no false certainty` invariant
  applies: charted point density/rounding must not imply precision.

---

## 1. E2 — Recovery-Bay 3D Packing Visualizer

### Problem
`src/recovery/packing.ts` (bay volume, packed density, 1-D axial clearance,
loose/ok/tight/jammed advisory) and `charges.ts` (shear-pin target pressure,
BP mass) are shipped and rendered **numerically** in `EvidenceStudio`
`RecoveryCard`. There is no spatial rendering of folded chutes, cords, and
the avionics sled inside the airframe; overpacking/jam risk is text-only.
The gap-analysis row and ledger E2 both name "X-ray 3D rendering of packed
chutes/cords inside bays" as the missing half.

### Proposed UX (progressive, spec §7: no modal required for ordinary work)
1. **Bay strip (in EvidenceStudio, replacing today's bare readouts).** A
   2.5-D axial cross-section SVG: the bay cylinder drawn as a horizontal
   tube (inner radius at scale, length to scale), items stacked end-to-end
   with per-item color (parachute=violet avionics token, sled=violet, BP
   charge=amber), overrun drawn past the aft station in rose. Advisory badge
   (LOOSE/OK/TIGHT/JAMMED) stays, now anchored to the drawing.
2. **X-ray 3D (in-workstation, expandable).** A rotated isometric view of
   the same bay: translucent tube (half-shell), items as packed cylinders;
   clearances annotated (min axial gap, radial gap). Interaction: drag a
   rotation slider (angular resolution cheap — this is a fixed mix-mode
   scene, not a flight sim); hover an item → tooltip with name/dims; overrun
   flush is rose.
3. (Later, not this batch) CAD-studio "Recovery view" viewport mode reusing
   the existing Three.js canvas. Rationale: the CAD viewport is
   orbit/interactive-camera machinery (rocket workspace); a bay-inspect
   scene is a compact self-contained renderer — reusing the full camera rig
   buys nothing for a 1-second-or-less static inspection.

Layout: one translation of the packing math into drawable frames.

### Component / file layout
```
src/components/EvidenceStudio.tsx        – RecoveryCard gains the strip + 3D toggle
src/components/RecoveryPackingView.tsx   – NEW: strip + isometric scene, hover/rotate
src/components/RecoveryPackingView.test.tsx – NEW (register in emitter inventory)
src/viewport/recovery/
  proceduralBayScene.ts                  – NEW: bay half-shell + packed-item meshes (Three.js, mirrors viewport/geometry/*)
src/recovery/packing.ts                  – extend: bay layout resolver (below)
```
The 3D scene builder stays pure-typed (component tree → typed primitive
list) so the jsdom suite tests the layout math without a GL context, exactly
as `proceduralNosecone.ts` etc. are pure today.

### Engine-level gaps (master contract decisions — see §7 Q1–Q3)
- **No bay concept in the component tree.** `parachute` components carry
  `axialOffset` relative to the assembly, but nothing declares "this body tube
  interval is the recovery bay, bounded fore/aft by bulkheads". Options:
  (a) new `recoverybay` component type with fore/aft bulkhead stations —
  touches `core/types.ts`, parsers (`.ork` import/export has no such node),
  rocketStore history snapshots, stability/blueprint consumers; (b) derive
  bays from bodytubes + the `axialOffset` ranges of their chutes — zero type
  churn, but bulkhead positions are guesses and two chutes in one tube are
  indistinguishable (both currently just `axialOffset`).
- **Packed geometry of a chute.** Existing math only needs mass+volume.
  A visual needs folded height/diameter. Empirical packed-size function from
  (diameter, mass, material) is guesswork without data; asking the user for
  packed dims means new optional fields on `ParachuteComponent` (orks round
  trip? default?). Needs a master pick: physics-free heuristic vs
  user-entered packed dims vs draw-to-fit annotation.
- **Avionics sled.** Sleds are `masscomponent` (point mass, no extents).
  Visual needs bounding dims: extend `MassComponent` with optional
  width/height/length, or hardcode a sled preset (ugly for 6"-airframe
  competition builds).

### Effort
M–L (2–4 focused days incl. scoped test suite + emitter registration). The
math exists; the cost is the interaction surface (strip + isometric + hover)
and the two type-level contracts above. S if the bay is derived and chutes
are drawn as stylized cylinders keyed by advisory only (no packed-dim
accuracy).

---

## 2. Sim-vs-Actual Flight Overlay Chart

### Problem
The evidence lane is computation-rich, visualization-poor: `AltimetryCard`
parses + resamples CSV and shows apogee as a **number**; `alignSimToFlight`
computes `{timeOffsetS, apogeeDeltaM, burnoutVelDeltaMs}` and nothing draws
it; `FlightSimulationTab` shows the full 6-DOF result numerically. The
"simulated vs actual telemetry overlay" gap row names a synchronized
multi-plot comparison as the missing feature. Comparators do this in Excel —
that is the workflow being replaced.

### Proposed UX
1. **Overlay plot in EvidenceStudio** (the studio, not a modal — the log is
   evidence, inspection is ordinary work). Two series on one axes:
   - sim: `(t, altitude)` from the *last committed* `SixDofSimulationResult`
     (telemetry is presentation-grade — fine for display; label it
     "modeled");
   - flight: resampled logged altitude, shifted by `timeOffsetS` from
     `alignSimToFlight`.
   Sync anchored on apogee (Open MCT-style linked time cursor): a draggable
   vertical cursor shows t, sim alt, flight alt at the cursor; markers at
   sim burnout, apogee, main-deploy, touchdown (from `result.events`) and
   logged apogee. Callout chips: **Δapogee**, Δburnout-velocity (when the
   log carries velocity), and descent-rate delta.
2. **Bounded interaction:** hover-to-read + cursor. No zoom/pan in v1
   (`prefers-reduced-motion`, dense data, and the plot has at most a few
   hundred points after resampling).
3. **Calibration link:** when `CalibrationCard` has a fitted Cd, a chip shows
   "calibrated Cd applied" — the chart must not silently imply model change
   (spec invariants §2/§3: no silent model substitution). In v1 the link is
   informational (which Cd the sim used), because piping calibrated Cd back
   into a *sim run* is a contract decision (Q6-adjacent), not a chart one.

Series identity uses the semantic tokens (Q11), not cyan: sim = cyan solid,
flight = violet dashed, safety states only on badges.

### Component / file layout
```
src/components/EvidenceStudio.tsx        – OverlayCard (or extend AltimetryCard)
src/components/TrajectoryOverlayChart.tsx – NEW: reusable SVG chart primitive
src/components/TrajectoryOverlayChart.test.tsx – NEW (register in emitter inventory)
src/evidence/overlay.ts                  – NEW pure: sim telemetry → TrajectorySample[];
                                            resample + align + cursor-index helpers (testable without DOM)
```
The overlay logic lives in `src/evidence/overlay.ts` (pure, deterministic,
jsdom-testable); the component is a thin renderer. This is the first real
"chart" — a small generic SVG axes/line/cursor helper should be extracted
here and reused by §5 (landing scatter), §3 (thrust editor) instead of three
private polyline builders.

### Engine-level gaps (master contract decisions — §7 Q4/Q11)
- **Telemetry sampling contract.** `simulate6DofFlight` returns telemetry at
  an internal grid whose density/length is not part of the public contract,
  and points are rounded display data. Overlay needs a documented sampling
  story: fixed re-grid (e.g. dt=0.1 s from `resample`) plus a downsampler
  cap for long flights. Deciding "telemetry grid is a display consumer,
  always resample to a declared dt" keeps the master contract intact with
  zero sim-engine change — but should be stated master-side.
- **Which sim result is "the" overlay input?** FlightSim's last run lives in
  FlightSim local state; EvidenceStudio has none. Store contract: persist a
  `lastSimResult` (or a declarative `lastSimRun` summary: telemetry +
  events + motor/options key) in the store so Evidence can overlay without
  forcing a modal open. Shape is small; add to `RocketStoreState` (Q8-adjacent
  store growth must be master-approved).

### Effort
M (1.5–2.5 days incl. tests + registration). Most of the engine work
(`parseAltimeterCsv`, `resample`, `alignSimToFlight`) exists and is
tested — this is chart + wiring + the store contract.

---

## 3. E5 — Interactive Thrust-Curve Editor

### Problem
`MotorSpec.thrustCurve: ThrustPoint[]` is a piecewise-linear F(t);
`getMotorThrustAt` interpolates, `getMotorImpulseTotal` trapezoid-integrates,
`getMotorMassAt` depletes by impulse fraction. Users can **import** edited
curves (`.eng`/`.rse` → `importCustomMotor`) or author in openMotor/
ThrustCurve, per ledger E5; they cannot edit in-app. PropulsionStudio already
shows a burn-area sparkline — precedent for an SVG curve surface exists.

### Proposed UX
1. **Curve editor panel in PropulsionStudio** (motor-authoring is propulsion
   work; stays out of the modal hierarchy). Left: SVG axes `F (N)` vs `t (s)`
   with draggable points; right: the existing motor readout now recomputes
   live — `totalImpulse` (trapezoid), `avgThrust`, `maxThrust`, `burnTime`,
   plus a mass-depletion readout from the consistency law (Q6).
2. **Interaction:** drag a point (pointer capture; click a segment to
   insert; click a point to delete; guard >2 points and monotonic time).
   Undo of drags at the panel level (local undo stack of ThrustPoint[]).
   Keyboard path: point list with arrow/`Del` (spec §5: no pointer-only
   operations).
3. **Save semantics:** "Save as custom motor" → new store action
   `upsertCustomMotor(motor)` (replaces `importCustomMotor`'s
   copy-in-add-only path), appears in the shared motor catalog
   (`{...CERTIFIED_MOTORS, ...customMotors}` already merges) → selectable in
   FlightSim, Trajectory, Propulsion instantly. Export to `.eng` (gap: no
   writer exists — see Q9).
4. **Validation is fail-closed:** every edit point feeds
   `validateMotorSpec`; a curve that would break `getMotorImpulseTotal`/
   `getMotorMassAt` (nonfinite, negative thrust, non-monotonic time, zero
   impulse) is rejected with the violation shown, not clamped silently.

### Component / file layout
```
src/components/PropulsionStudio.tsx      – hosts the editor section
src/components/ThrustCurveEditor.tsx     – NEW: SVG drag surface + point table
src/components/ThrustCurveEditor.test.tsx – NEW (user-event drag tests; register in emitter inventory)
src/propulsion/curveEditing.ts           – NEW pure: hit-test, insert/delete/move,
                                           curve invariants, local undo stack (jsdom-testable)
src/propulsion/engParser.ts              – add exportToEng(motor): string (Q9)
src/store/rocketStore.ts                 – add upsertCustomMotor
```

### Engine-level gaps (master contract decisions — Q6/Q7/Q9)
- **Consistency law after edit.** `MotorSpec` stores `totalImpulse`,
  `avgThrust`, `maxThrust`, `burnTime`, **and** `propellantMass`/
  `totalMass`/`dryMass` independently. Mass depletion
  (`getMotorMassAt`) integrates impulse; `propellantMass` feeds the
  6-DOF vehicle mass and the impulse perturbation in `runMonteCarlo`
  (`impulsePctSigma` scales... which quantity?). After the user drags points:
  recommended — recompute `totalImpulse` = trapezoid, `burnTime` = last t,
  `avgThrust` = J/burnTime, `maxThrust` = max F; **propellant mass stays
  user-entered** (matches how imported `.eng` records carry nominal
  propMass) and mass-flow scaling follows the existing impulse-fraction law.
  Master must bless the pair (which fields recompute / which are fixed) —
  wrong pick silently changes depletion in every downstream sim.
- **Motor undo scope.** `history`/`future` are `RocketVehicle[]`; a motor
  edit creates a motor-side snapshot the vehicle history doesn't capture.
  Decide: motor edits replay through a parallel action-history lane, are
  excluded from Ctrl+Z (risky — silent work loss), or snapshot motor records
  into the vehicle history as a sidecar. Needs a store-shape decision.
- **`.eng` writer.** Import exists; export needs a `exportToEng` following
  the RASP-format dialect the parser accepts (round-trip property test:
  import(export(m)) ≈ m). Small, but it is a new formats contract.

### Effort
M–L (2–3 days incl. drag interaction + tests + store action). The drag
surface and local undo are the bulk; the mass-law decision unblocks it.

---

## 4. PNG Blueprint Export

### Problem
Blueprint export exists and is exercised: `exportBlueprintSvg(vehicle)`
returns a standalone, dimensioned, dark-CAD SVG; `InteropExportPanel`
downloads it as `image/svg+xml`. Teams printing for fabrication handouts want
raster (paper workflows, embedded docs, no SVG viewer). No PNG path exists,
and no rasterization dependency is installed.

### Proposed UX
1. **Blueprint button → small split/dropdown:** "Blueprint" keeps SVG;
   adjacent "PNG" rasterizes the same drawing client-side. No new modal;
   follows the existing button strip.
2. **Rasterization, zero-dependency** (recommended; Q10):
   `svg string → Blob URL → <img> → <canvas> drawImage → canvas.toBlob('image/png')`.
   Native browser SVG renderer — same pixels as the SVG, no lib.
   Fallback guard: if the canvas is tainted or unsupported (never for a
   same-origin blob), surface a fail-closed message like other exports
   (`InteropExportPanel` error span pattern).
3. **Surface choice:** keep dark default (matches on-screen); export a light
   "print" variant — render option to `exportBlueprintSvg` (a light theme
   uses the existing `<style>` block's CSS variables; spec §1.2 requires
   print/export presentation with white backgrounds SHOULD exist). Decide
   v1 scope: dark-only PNG (simplest) vs theme toggle (small).
4. **DPI/scale:** fixed scale in v1 (SVG's own 900-px budget; no DPI
   multiplier) with `title`/`desc` preserved. Add DPI later only if asked.

### Component / file layout
```
src/components/InteropExportPanel.tsx       – PNG button + invoke
src/formats/blueprintPng.ts                 – NEW: renderBlueprintPng(svg: string): Promise<Blob>
                                              (canvas machinery; thin)
src/formats/blueprintPng.test.ts            – NEW (jsdom lacks canvas: keep the test to
                                              contract guards — reject empty svg, tainted-canvas path,
                                              mime — and cover the light-theme variant string in
                                              blueprint.test.ts; register in emitter inventory)
src/formats/blueprint.ts                    – optional: exportBlueprintSvg(vehicle, {theme:'light'|'dark'})
```
The png module stays a promise-returning pure-as-possible function so the
component test can stub the canvas once.

### Engine-level gaps
None blocking. Master decisions only: (Q10) accept the zero-dep native
raster path vs adding a raster lib (unnecessary — blob-SVG→canvas is the
boring, dependency-free route), and (Q11-adjacent) whether the light/print
theme ships in this batch. PNG tests in jsdom are inherently shallow (no
real canvas); the emitter's requirement is registration + executed case
counts, not pixel truth — flag this in the emitter's fixtures so a future
pixel-level check is recognized as the real coverage.

### Effort
S (0.5–1 day incl. tests + registration). Smallest item; fully independent
of the other four, ideal first milestone in a worktree.

---

## 5. Background Web-Worker Monte Carlo

### Problem
Monte Carlo ships (ledger E1 marks only the worker orchestration open):
`runMonteCarlo(baseInput, perturbations, nRuns, seed)` is pure, seeded
(`mulberry32` + Box-Muller), deterministic, and capped in the UI at 200
runs because it runs **synchronously on the UI thread**. Competition
ensembles need 500–1000 runs without freezing the workstation.

### Proposed UX
1. **TrajectoryStudio MC section gains a "Competition mode":** runs
   500–1000 via a background worker; live progress (`n / N` + %), Cancel,
   and the existing FRESH/STALE badge extended to the ensemble. Result
   identical to main-thread: same `DispersionResult` stats, same
   determinism contract ("fixed seed — deterministic per input set").
2. **Incremental landing scatter** (additive, not blocked on worker): as
   chunks land, the existing stats grid + a new landing-scatter SVG
   (East/North points with 1σ/2σ containment rings from
   `computeDispersionStatistics`) update per chunk. The chunked accumulation
   IS the progress UX; no fake progress bar.
3. **Cancel semantics:** stop accepting chunks; stats shown come from
   completed chunks only and are labeled "partial" (spec §6 no fabricated
   responsiveness — partial ≠ final, must be marked).

### Component / file layout
```
src/sim/monteCarlo.ts            – extend later? No: add sibling chunk API below (Q12)
src/sim/monteCarloWorker.ts      – NEW: worker entrypoint
  new Worker(new URL('./monteCarloWorker.ts', import.meta.url), { type: 'module' })
  – Vite-native worker asset; imports sixDofSimulator/motorDatabase purity
src/sim/monteCarloStream.ts      – NEW pure: runMonteCarloChunk(baseInput, perturbations,
                                   nRuns, seed, chunkIndex, chunkSize) + accumulateLandings
                                   (chunkwise + final stats); reused by the worker AND
                                   a main-thread fallback path
src/components/MonteCarloSession.tsx – NEW: run orchestration (worker|main-thread fallback),
                                   progress, cancel, partial-label, scatter
src/components/MonteCarloSession.test.tsx – NEW (register in emitter inventory)
src/components/TrajectoryStudio.tsx – hosts section; existing caps/sigmas/seed untouched
```
Split determinism: `mulberry32(masterSeed)` → per-run sub-seeds
(`subSeed[i]` derived from master + i) so any chunk partition of the same
`(inputs, nRuns, seed)` reproduces the identical ensemble — chunk layout
becomes an implementation detail, protecting the determinism contract.

### Engine-level gaps (master contract decisions — Q12)
- **API shape:** add `runMonteCarloChunk` / an `accumulateMonteCarloChunks`
  pair to `src/sim/monteCarlo.ts` (same module, demonstrating the
  all-or-nothing `runMonteCarlo` stays the reference), or keep streaming
  in a separate module to avoid any risk to the shipped API. Recommend
  same-module additions + a **redundancy test**: chunked result ≡
  `runMonteCarlo` result for the same inputs (the determinism guarantee,
  provable in the existing suite).
- **Perturbation semantics recheck:** `impulsePctSigma` and the mass-law
  coupling from §3/Q6 change what "impulse" means after curve edits —
  master should pin that MC perturbs `totalImpulse`-consistent quantities.
- **Worker packaging:** Vite module-worker asset vs a single self-contained
  worker source (no imports, dupes the math). Vite asset is correct; verify
  the deployed `dist` serves the worker with correct `Cross-Origin-Resource-Policy`
  headers (static hosting decision, not code).

### Effort
M (2–3 days incl. chunk API + worker orchestration + scatter + tests +
registration). The physics is done; this is plumbing + presentation.

---

## 6. UI Cohesion Improvements (walking the current app)

1. **Shared control primitives are thrice-duplicated.** `NUMERIC_INPUT`
   (TrajectoryStudio module const), `NumberField`/`KvRow`/`Card`
   (EvidenceStudio-local), and inline `px-1.5 py-1 rounded-md border-zinc-600/80`
   repetition in PropulsionStudio/PropertyInspector all encode the same
   field/card/label pattern with **different border widths, radii, and
   label heights**. Before the five items above ship five more surfaces,
   extract one `src/components/studio.tsx` (`Field`, `Card`, `SectionHeader`,
   shared class strings) and migrate the four studios to it. Also fixes a
   subtle a11y drift: TrajectoryStudio's numeric inputs lack `<label>`
   association (aria-labels only), while EvidenceStudio's have real labels.
2. **Semantic series-color discipline (spec §1.3).** Cyan currently plays
   triple duty — CAD accent, "fresh/active" badge, and would-be data-series
   identity. With overlay charts, MC scatter, and thrust curves arriving,
   codify now: cyan = airframe/CAD; violet = avionics + **flight-log
   series**; emerald = satisfied gates; series identity never reproduced by
   safety-state color. A small alias token set (`--series-*`) in the
   Tailwind config + one style-guide paragraph beats retrofitting six
   components later.
3. **Status freshness is per-card, not per-workstation (spec §1.4 P0/P1).**
   FlightSim and MC each render FRESH/STALE badges; nothing aggregates
   "what does the current vehicle believe" — validity, stability margin,
   motor, weather age, active run state live scattered across studios. The
   MC worker work (§5) introduces a genuine active-run state; land a slim
   **mission status rail** in the App shell (one row: config validity ·
   stability · motor · sim freshness · weather age · run state) as part of
   that same milestone — composing the existing badges, replacing none. Low
   effort, high spec conformance; also naturally surfaces the `lastSimRun`
   store field from §2.

(Flagged, decided-out-of-scope: `FlightSimulationTab` is a modal while spec
§7 wants ordinary work modal-free. Revisit as a product call when studios
absorb sim; not part of this batch.)

---

## 7. Consolidated master contract questions

| # | Decision | Blocks | Recommended |
| :-- | :-- | :-- | :-- |
| Q1 | Recovery bay: new `recoverybay` component type vs derive bays from bodytube chute `axialOffset` ranges | §1 | Derive in v1; type churn ripples through parsers/store/ork export |
| Q2 | Packed-chute geometry: empirical folded-dims fn vs user-entered packed dims on `ParachuteComponent` | §1 | User-entered packed dims (optional fields, defaults) — no unvalidated heuristics |
| Q3 | Avionics sled geometry: extend `MassComponent` (w/h/l optional) vs separate sled component | §1 | Extend `MassComponent` with optional bounding dims |
| Q4 | Telemetry display contract: overlay always re-grids telemetry to a declared dt + downsampler; no sim-engine change | §2 | Document dt + cap master-side; keep telemetry presentation-grade |
| Q5 | Persist `lastSimRun` (telemetry+events+key) in store so Evidence overlays without opening the sim modal | §2 | Add minimally-shaped `lastSimRun`; part of rail work (§6.3) |
| Q6 | Thrust-edit consistency law: which MotorSpec fields recompute vs stay user-fixed (prop mass stays fixed; J=ΣF·Δt; avg=J/t; max; burn=last t) | §3 | As stated; bless once so mass depletion & MC impulse stay consistent |
| Q7 | Custom-motor undo scope: parallel motor-history lane vs no Ctrl+Z for motor edits | §3 | Parallel sidecar history (or exclude-with-confirmation in v1) |
| Q8 | `upsertCustomMotor` store action (replaces add-only import path) | §3 | Add; keep `importCustomMotor` as thin wrapper |
| Q9 | `.eng` writer in `formats/engParser` (round-trip: import(export(m)) ≈ m) | §3 | Add with round-trip test |
| Q10 | PNG rasterization: zero-dep native canvas (blob-SVG→img→canvas) vs new raster lib | §4 | Zero-dep native; no new dependency |
| Q11 | Charting dependency policy: hand-rolled SVG primitives (sparkline/blueprint precedent) vs chart lib; series-color token set | §2/§4/§5 | Hand-rolled; any new dep is explicitly master-approved |
| Q12 | MC chunk API in `monteCarlo.ts` (chunk ≡ full determinism test), per-run sub-seeds from master seed, Vite module worker | §5 | Same-module chunk pair + equivalence test; worker via `new URL(..., import.meta.url)` |

Test/emitter note for all: each new `*.test.*` file lands in
`FIXED_TEST_FILE_INVENTORY` (+ hashed-files list) in the same commit or
`emit-benchmark-metadata.cjs` fails certification.

---

## 8. Suggested sequencing (worktree milestones)

Wave A — independent, lowest risk (can run in parallel worktrees):
1. **PNG export** (§4, S) — zero contract risk, first milestone.
2. **Sim-vs-actual overlay** (§2, M) — Q4/Q5 are shallow; builds the chart
   primitives (§6.2 tokens) that §5 reuses.
3. **Worker MC** (§5, M) — Q12; bundles the mission rail (§6.3).

Wave B — need master answers to act:
4. **Thrust-curve editor** (§3, M–L) — Q6/Q7/Q9 gate the save path.
5. **Recovery packing visualizer** (§1, M–L) — Q1–Q3 gate the layout model.

Ordering rationale: Wave A items each deliver user-visible value with only
shallow master decisions; Wave B's contracts change shared types/store, so
they should follow rather than precede Wave A's stable shakedown of the
workstation shell.