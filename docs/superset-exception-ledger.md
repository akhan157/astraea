# Astraea Superset Exception Ledger

> **Status interpretation (2026-09-26):** This ledger combines implemented engines, UI wiring gaps, external-data prerequisites, and historical evidence counts. For the current verification snapshot and priority order, see [project status](project-status.md). “Tested” does not imply a working desktop user journey or real-flight validation. The September 10 frontend freeze cited below has been superseded by the Tauri frontend promotion.

**Purpose:** track major comparator workflow limits (OpenRocket, RockSim,
RASAero II, RocketPy, openMotor, NASA CEA, AltOS/FlightSketch, ThrustCurve),
their prerequisites, safe alternatives, and re-visit conditions. The
[adapter matrix](adapter-matrix.md) additionally tracks format/UI wiring gaps.
Absence from this ledger is **not** proof of end-to-end implementation or validation.

**Rule:** closing a row = shipping the capability + registering its tests in
`scripts/emit-benchmark-metadata.cjs`. No silent removals.

## Shipped (no exception needed)

Most roadmap Phase 2–4 engines and master-spec interop extras are implemented
and tested; some UI paths remain unwired, as marked below and in the adapter
matrix. Historical evidence at `f5105cf`: 58 suites / 760 cases, emitter
passed=true on a clean tree. Current 2026-09-26 check: 62 frontend files /
791 tests and 72 Rust core tests passed. Neither count proves flight accuracy:

- Subsonic/transonic/supersonic aero (Barrowman+Rogers, Van Driest II, wave,
  base+plume, protuberance, boattail monitor, fin flutter NACA TN 4197,
  fin-structure loads, stability breakdown)
- Certified motor DB + thrust interpolation + mass depletion; custom-motor
  import registry (RASP `.eng`, RockSim `.rse`) wired to upload + studio catalog;
  live ThrustCurve.org API client (`thrustcurveApi.ts`) ships engine-tested with no UI consumer
- BATES/star grain regression + chamber pressure; frozen-flow APCP nozzle chemistry;
  Gibbs element-potential equilibrium solver validated against a 60-case NASA CEA
  corpus (`scripts/cea-corpus.json`, mole fractions 0.01 abs / MW 0.5% rel — see E7, closed)
- 6-DOF adaptive trajectory, ISA atmosphere, live Open-Meteo soundings,
  manual wind tables, Monte Carlo dispersion (chunk API + worker entrypoint
  engine-tested; TrajectoryStudio runs synchronously, cap 200 — see E1);
  per-class impulse-sigma defaults (`motorVariance.ts`); waiver-containment + KML (see E1/KML note)
- Dual-compartment packing math + black-powder sizing + derived-bay 2D packing
  strip (`deriveBays`, EvidenceStudio RecoveryCard — see E2, closed)
- Altimetry CSV + GPX ingest, sim/flight alignment, Cd calibration, GPS back-cast
- `.ork` bidirectional, `.rkt` import + `.rkt` export trigger, `.cdx1` + aero-matrix +
  blueprint SVG/PNG export, STEP/STL/KML/ENG/RSE download triggers with omission
  previews (the `.rse` trigger shipped 2026-09-26; KML refuses until the S4 payload channel publishes)
- Versioned `.astraea.json` project envelope (`projectJson.ts`: migration chain +
  stale-write guard, tested); Header import/export and the App drop path now use
  `readProject`/`createProjectEnvelope`/`writeProject` (2026-09-26). Remaining gap:
  no durable revisioned-save backend is wired, and the envelope carries vehicle +
  motor records + bindings while cases/snapshots/evidenceRefs are not yet populated by the UI
- Workstation shell (five studios, precision context bar, compare dock, edit buffer,
  append-only run registry), onboarding content pack (questionnaire/guidance/explainers/tour, engine only),
  thrust-curve editing primitives (`curveEditing.ts`, engine only — see E5)

## Open exceptions

## Club data intake (E3/E4/E6/empirical — requested 2026-09-23, awaiting reply)

What unblocks each item and the minimum viable payload:

- **Empirical closure:** one flight log (altimeter CSV or GPX) + motor flown +
  vehicle dims/mass (or `.ork`). Intake: `parseAltimeterCsv` / `parseGpxTrack` →
  overlay → Cd calibration. No new hardware needed — any past flight works.
- **E3 `.eeprom`:** one flown `.eeprom` + same flight's AltosUI CSV export +
  firmware version. Either file alone is insufficient (offsets unprovable).
  Only closable if someone flies Altus Metrum hardware.
- **E4 staging:** separation event timing + tip-off notes + vehicle config from
  one staged/clustered flight. Terrain half needs no club data (USGS 3DEP public).
- **E6 certification:** RSO/prefecture answer to "would an emitter artifact +
  calibrated-Cd package count as supporting data, and what does a witnessed
  validation flight require?" Process answer, not a file; long pole, asked early.

### E1. Background MC host (wind-CSV import view shipped 2026-09-26)
- **Missing:** the chunk engine (`runMonteCarloChunk` / `accumulateMonteCarloChunks` /
  `finalizeMonteCarloChunks`, `monteCarloWorker.ts`) is tested and bit-identical across
  partitions, but no host drives it: TrajectoryStudio calls synchronous `runMonteCarlo`
  (cap 200, no progress/cancel), so 500–1000-run competition ensembles still mean
  sequential 200-batches concatenated by hand. `parseWindProfileCsv` now has a UI
  consumer: TrajectoryStudio's Import CSV replaces the manual table fail-closed.
- **Why deferred:** worker orchestration + progress/cancel UI, not physics; this
  UI integration has not yet been delivered (the former frontend freeze is historical).
- **Prerequisite:** engineering time only (chunk protocol + CSV parser already pinned).
- **Alternative:** run sequential batches of 200 and concatenate landings;
  statistics functions accept concatenated clouds; type wind rows by hand.
- **Re-visit:** when a competition team needs >200-run ensembles interactively (drives the S5 host).

### E2. CLOSED — recovery-bay 2D strip (C9 minimal; full 3D rejected)
- **Shipped:** `deriveBays` (bodytubes + chute/sled spans, entered/assumed/missing provenance,
  ambiguity surfaced never guessed) + the RecoveryCard 2D axial strip (length to scale,
  bore exaggerated, overrun blocks, density advisory) in EvidenceStudio. Decision C9:
  the strip earns its place (legibility + mistake-catching); full 3D X-ray does not
  (folded-chute shape unknowable, cord unmodelable, density bands heuristic — a 3D
  render would add no new prediction).
- **Not built and not planned:** X-ray 3D rendering of packed chutes/cords inside bays.

### E3. AltOS .eeprom binary parsing
- **Missing:** raw AltOS flight-computer flash-image ingestion; generic
  CSV/logger ingestion is shipped.
- **Why:** .eeprom is a raw flash dump whose record layout is firmware-
  version dependent; parsing it without the exact firmware image risks
  silent misalignment. No validated parser reference available in-repo.
- **Prerequisite:** AltOS firmware record-layout documentation for the
  specific version flown, or a flown .eeprom + matching .csv pair to
  validate against.
- **Alternative:** export CSV from AltOS tools and ingest directly.
- **Re-visit:** on receipt of documented layout + validation pair.

### E4. Terrain-aware landing / tip-off / staging / clustering
- **Missing:** flat-Earth ground plane only; no terrain elevation, launch-lug
  tip-off dynamics, multi-stage separation, or clustered-motor ignition
  modeling.
- **Prerequisite:** validated terrain dataset integration + staging test
  data (out of subsonic single-stage scope).
- **Alternative:** single-stage workflow with conservative dispersion
  ellipses; stage separately as independent vehicles.
- **Re-visit:** with a staged-vehicle program sponsor + test data.

### E5. Interactive thrust-curve editor UI (engine ships, no surface)
- **Missing:** hand-editing of thrust-curve points in the GUI. The engine
  (`curveEditing.ts`: structural insert/move/delete, `validateCurve` gate,
  undo/redo stack, `deriveEditedMotor` Q6 derivation) is tested and round-trips
  through both `.eng` and `.rse` writers; curve *visualization* in-app is the
  burn-area sparkline only, and custom `.eng`/`.rse` *import* is wired to upload.
- **Why deferred:** editor surface (point dragging, validation display, derived-record
  labeling) is UI work under the frontend freeze — engine contract already pinned.
- **Prerequisite:** engineering time only (engine + round-trip suites pinned).
- **Alternative:** author curves in openMotor/ThrustCurve, export .eng,
  import into Astraea.
- **Re-visit:** on user request for in-app motor design editing (renders the tested engine).

### E7. CLOSED — Gibbs solver validated against NASA CEA corpus (species-coverage caveat documented)
- **Shipped:** `solveEquilibrium` (element-potential/Lagrange-Newton, NASA RP-1311 method)
  regresses against 60 TP-equilibrium cases from the public NASA CEA package
  (`scripts/cea-corpus.json`: 3 APCP blends × 5 pressures × 4 temperatures,
  restricted to Astraea's 10-species set with solid AL2O3): mole fractions
  within 0.01 abs (worst observed 0.004, H radical), MW within 0.5% rel
  (worst observed 0.2%). Suite: `gibbsEquilibrium.test.ts` "NASA CEA corpus
  regression (E7)". CEA gamma_s is shifting-equilibrium and not compared
  (Astraea's mixture gamma is frozen by design).
- **Known model boundary (not a solver bug):** the full 238-species CEA HP
  chamber runs ≈3610 K vs the frozen-10-species HP root ≈3739 K — minor
  Al-Cl/OH species carry formation-energy sinks the restricted set cannot
  model. `apcpEquilibrium` keeps its calibrated frozen-composition preset
  (Tc ≈ 3523 K, anchors pinned ±2%) until a shifting-equilibrium nozzle
  path is specified; the solver stays available for TP analysis.
- **Not built:** solver→preset coupling and shifting-equilibrium nozzle expansion.
