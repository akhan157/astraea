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
tested, and wired into the 4-studio shell (30 test files / 333 tests,
evidence emitter passed=true on a clean tree):

- Subsonic/transonic/supersonic aero (Barrowman+Rogers, Van Driest II, wave,
  base+plume, protuberance, boattail monitor, fin flutter NACA TN 4197)
- Certified motor DB + thrust interpolation + mass depletion; custom-motor
  import registry (RASP `.eng`, RockSim `.rse`) wired to upload + studio catalog
- BATES/star grain regression + chamber pressure; ideal nozzle chemistry (APCP)
- 6-DOF adaptive trajectory, ISA atmosphere, live Open-Meteo soundings,
  manual wind tables, Monte Carlo dispersion
- Dual-compartment packing math + black-powder sizing
- Altimetry CSV ingestion, sim/flight alignment, Cd calibration
- `.ork` bidirectional, `.rkt` import, `.cdx1` + aero-matrix + blueprint SVG export
- 4-studio workstation shell (CAD, Propulsion, Trajectory, Evidence)
## Open exceptions

### E1. Background 500–1000-run Monte Carlo (Web Workers)
- **Missing:** deep competition mode in background workers; only main-thread
  runs (default 50, UI cap 200) are shipped.
- **Why deferred:** worker-thread orchestration + progress/cancel UI, not
  physics; main-thread engine (`runMonteCarlo`) is complete and tested.
- **Prerequisite:** none (engineering time only).
- **Alternative:** run sequential batches of 200 and concatenate landings;
  statistics functions accept concatenated clouds.
- **Re-visit:** when a competition team needs >200-run ensembles interactively.

### E2. Recovery-bay 3D packing visualizer
- **Missing:** X-ray 3D rendering of packed chutes/cords inside bays; only
  the math (volumes, densities, clearances, advisories) is shipped.
- **Prerequisite:** none (engineering time only).
- **Alternative:** numeric clearance + density advisories in Evidence studio.
- **Re-visit:** with the recovery-visual work package.

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

### E5. Interactive thrust-curve editor
- **Missing:** hand-editing of thrust-curve points in the GUI; curve
  *visualization* (sparkline) and custom .eng/.rse *import* are shipped.
- **Prerequisite:** none (engineering time only).
- **Alternative:** author curves in openMotor/ThrustCurve, export .eng,
  import into Astraea.
- **Re-visit:** on user request for in-app motor design editing.

### E6. Formal flight-safety certification (TRA/NAR L1–L3 sign-off)
- **Missing:** no certification body has accredited Astraea outputs for
  waiver or certification flights.
- **Why:** accreditation is organizational, not technical; it requires
  witnessed validation campaigns outside this repo.
- **Alternative:** evidence emitter artifact + calibrated-Cd workflow as
  supporting engineering data for RSO review.
- **Re-visit:** through a club/prefecture validation partnership.

### E7. Gibbs free-energy minimization (full CEA equilibrium solver)
- **Missing:** chamber composition is caller-supplied (frozen) with a
  documented APCP preset; no iterative species-equilibrium solver.
- **Why:** a from-scratch equilibrium solver needs validation against CEA
  reference outputs across propellant families, not available in-repo.
- **Alternative:** `equilibriumTemperature` with caller composition +
  `apcpEquilibrium` preset; import custom .eng curves for measured motors.
- **Re-visit:** with a CEA reference output corpus for regression testing.
