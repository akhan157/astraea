# Astraea Superset Exception Ledger

**Purpose:** every comparator workflow (OpenRocket, RockSim, RASAero II,
RocketPy, openMotor, NASA CEA, AltOS/FlightSketch, ThrustCurve) that Astraea
does **not** implement end-to-end is listed here with the exact missing
feature, why it cannot currently be produced, the unavailable prerequisite,
the closest safe in-app alternative, and the re-visit condition. Anything not
listed here is implemented and covered by the test suite + evidence emitter.

**Rule:** closing a row = shipping the capability + registering its tests in
`scripts/emit-benchmark-metadata.cjs`. No silent removals.

## Shipped (no exception needed)

All roadmap Phases 2–4 plus master-spec interop extras are implemented,
tested, and wired into the workstation shell (58 suites / 760 cases per
`f5105cf`, evidence emitter passed=true on a clean tree):

- Subsonic/transonic/supersonic aero (Barrowman+Rogers, Van Driest II, wave,
  base+plume, protuberance, boattail monitor, fin flutter NACA TN 4197,
  fin-structure loads, stability breakdown)
- Certified motor DB + thrust interpolation + mass depletion; custom-motor
  import registry (RASP `.eng`, RockSim `.rse`) wired to upload + studio catalog;
  live ThrustCurve.org API client (`thrustcurveApi.ts`) ships engine-tested with no UI consumer
- BATES/star grain regression + chamber pressure; frozen-flow APCP nozzle chemistry;
  Gibbs element-potential equilibrium solver (`gibbsEquilibrium.ts`) ships engine-tested,
  uncoupled from the chamber preset and unvalidated against a CEA corpus (see E7)
- 6-DOF adaptive trajectory, ISA atmosphere, live Open-Meteo soundings,
  manual wind tables, Monte Carlo dispersion (chunk API + worker entrypoint
  engine-tested; TrajectoryStudio runs synchronously, cap 200 — see E1);
  per-class impulse-sigma defaults (`motorVariance.ts`); waiver-containment + KML (see E1/KML note)
- Dual-compartment packing math + black-powder sizing + derived-bay 2D packing
  strip (`deriveBays`, EvidenceStudio RecoveryCard — see E2, closed)
- Altimetry CSV + GPX ingest, sim/flight alignment, Cd calibration, GPS back-cast
- `.ork` bidirectional, `.rkt` import + `.rkt` export trigger, `.cdx1` + aero-matrix +
  blueprint SVG/PNG export, STEP/STL/KML/ENG download triggers with omission previews
- Versioned `.astraea.json` project envelope engine (`projectJson.ts`: migration chain +
  stale-write guard, tested); Header/App still read/write the legacy bare vehicle (cutover pending)
- Workstation shell (five studios, precision context bar, compare dock, edit buffer,
  append-only run registry), onboarding content pack (questionnaire/guidance/explainers/tour, engine only),
  thrust-curve editing primitives (`curveEditing.ts`, engine only — see E5)
## Open exceptions

### E1. Background MC host + wind-CSV import view (worker orchestration + S5 UI)
- **Missing:** the chunk engine (`runMonteCarloChunk` / `accumulateMonteCarloChunks` /
  `finalizeMonteCarloChunks`, `monteCarloWorker.ts`) is tested and bit-identical across
  partitions, but no host drives it: TrajectoryStudio calls synchronous `runMonteCarlo`
  (cap 200, no progress/cancel), so 500–1000-run competition ensembles still mean
  sequential 200-batches concatenated by hand. `parseWindProfileCsv` is likewise
  tested with no UI consumer — the studio keeps a manual table.
- **Why deferred:** worker orchestration + progress/cancel UI + wind mapping/units import
  view, not physics; frontend frozen until the feature set reconciles in one pass.
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

### E7. Gibbs solver ↔ chamber-preset coupling + CEA corpus validation
- **Missing:** `solveEquilibrium` (element-potential/Lagrange-Newton, NASA RP-1311 method,
  `gibbsEquilibrium.ts`) ships tested — mass balance to 1e-9, pure-substance limits,
  APCP hierarchy (all Al → Al2O3, all Cl → HCl, all N → N2, C mainly CO), fail-closed
  on infeasible feeds — but nothing calls it: `apcpEquilibrium` still solves the
  rigid-vessel balance on a caller-supplied frozen composition, and no CEA reference
  output corpus exists in-repo for regression across propellant families.
- **Why deferred:** coupling (equilibrium composition → chamber Tc/γ/molWeight → `performance`)
  plus corpus validation, not solver physics; decision C16 stays BUILD-expanded pending the corpus.
- **Prerequisite:** CEA reference output corpus for regression testing.
- **Alternative:** `equilibriumTemperature` with caller composition +
  `apcpEquilibrium` preset; import custom .eng curves for measured motors.
- **Re-visit:** with a CEA reference output corpus for regression testing (then wire the tested solver in).
