# Engine and validation roadmap (handoff from the UI direction session)

**Date:** 2026-10-03. **Origin:** a frontend/UI-direction session (`claude/upbeat-allen-ol4h5e`, prototypes in `design-concepts/`) drifted into engine and validation questions. This document carries those decisions to an engine-focused session. No engine code was changed in that session; everything below is findings, decisions, and proposed work.

Read with: [`docs/project-status.md`](../project-status.md), [`docs/clean-room-ip-compliance.md`](../clean-room-ip-compliance.md), [`docs/validation-datasets.md`](../validation-datasets.md) (research report produced in that session).

The AI copilot is split into its own branch (`claude/copilot-experimental`) and is out of scope here, except that every number the copilot shows must come from the engine work below.

---

## 1. Product principles agreed with the owner

- **No fluff.** Nothing is shown that the engine does not actually compute. Specifically rejected: surface "color maps" of pressure, temperature or stress painted on the rocket (nothing in the engine produces distributed surface fields), and fake solver "residual convergence" plots (the 6-DOF integrator is a time-marching ODE solver, not an iterative solver).
- **Graded confidence ("the in-between").** Every result should carry a provenance/confidence level instead of looking equally certain. The levels proposed:
  1. **Measured:** from hardware (altimeter log, static fire).
  2. **Calibrated:** model tuned to the team's own data.
  3. **Modeled:** a standard method used inside its valid range (for example Barrowman stability at subsonic Mach).
  4. **Extrapolated:** a method used past its valid range (for example subsonic CNα above Mach 0.8).
  5. **Unknown:** cannot be computed.

  The owner wants this to be subtle in the UI, not a flag on every number; the UI treatment is a frontend task. **The engine task is to emit the level and the reason with each result.** Existing hooks: `LoadValidity`/`StageValidity` in `src/dynamics/loads.ts` (load validity at aero-table Mach clamps) and `GateOutcome` (`pass | fail | unknown`) in `src/store/runStore.ts`.
- **Validated results are the selling point.** The highest-value engine work is whatever closes the loop between real flights and the model.

## 2. Current pipeline (verified in code on 2026-10-02)

Flow: `UI → zustand stores → application/caseResolver (immutable, content-addressed case) → tauri/bridge.ts → 7 Tauri commands → crates/astraea-core (Rust)`. TS engines are parity oracles only; the browser preview cannot compute.

| Stage | Status | Feeds the next stage? |
|---|---|---|
| Vehicle definition and import (.ork, .rkt, .cdx1, .eng/.rse, presets) | Working | Yes |
| Mass/CG (`aggregate_mass`) | Working | Yes |
| Aero/stability (Barrowman, drag buildup, transonic) | Working | Yes |
| Motor selection (certified library, ThrustCurve live search, file import) | Working | Yes |
| **Motor design** (6 grain regressions, Gibbs chemistry, nozzle) | Separate panel, labeled "no vehicle wiring" | **No** |
| 6-DOF flight, wind, weather | Working | Yes |
| Monte Carlo (chunked, cap 1000, cancel) | Working | Yes |
| Recovery (packing, charges) | Separate calculators | Partly |
| **Evidence** (log import, provenance, overlay, Cd fit) | Cd fit is "analysis-only candidate" | **No (never fed back)** |
| Output (project JSON, .ork/.rkt/.cdx1/.eng/.rse, STEP/STL, blueprint, KML) | Working | n/a |

## 3. Work items, in recommended order

### E1. Validation against real flights (highest priority)
- Use [`docs/validation-datasets.md`](../validation-datasets.md). Start order: **NDRT 2020** (subsonic baseline, most complete dims, measured stability 2.875 cal) → **Prometheus SAC 2022** (two AltOS logs, Mach 0.93, transonic drag) → **Andromeda / Cavour** (Mach about 0.93 to 1.0) → **Juno III** (SRAD motor; resolve the feet/offset discrepancy first) → stretch: Defiance Mk. IV, Intrepid III (supersonic).
- Rebuild each vehicle from the RocketPy notebook parameters. **Ignore the team-supplied Cd curves** when testing Astraea's own drag buildup.
- Compare apogee, time to apogee, max velocity, burnout altitude and descent, not only apogee. Run Monte Carlo over Cd, mass and thrust scatter.
- Publish the residuals and model limits. RocketPy's own published errors on the same flights (about +0.6% to +7.5%, and -9% on Halcyon) are a ready benchmark to compare against.
- **Data licensing:** RocketPy is MIT, but the flight data is shared by team permission, not under a data licence. Credit the teams and RocketPy (Ceotto et al., J. Aerospace Eng. 34(6), 2021). **Fetch the data at test time; do not commit the CSVs into this repo.**
- **Cheap first comparison:** Valetudo ships RASAero Cd curves. Plot Astraea's drag buildup against them on the same geometry to see where the two diverge, especially Mach 0.8 to 1.2.

### E2. Close the calibration loop
- Today `src/evidence/calibration.ts` (`calibrateCd`) produces a candidate Cd that is never applied.
- Proposal: an explicit, user-confirmed "apply calibration" step that stores a Cd correction, with its provenance (which flight and log, and the RMSE), in the project. Later runs use it and tag results **Calibrated**. It must be reversible and visible.

### E3. Wire motor design into flight
- The pieces exist (`grainRegression.ts`, `chamberPressure`, Gibbs/nozzle), but nothing assembles a `MotorSpec` (`src/propulsion/motorDatabase.ts`).
- Chain to build: grain geometry → burn area vs web → Pc(t) → thrust = Cf·Pc·At (Cf from nozzle performance) → thrust curve + propellant mass → `MotorSpec` → `putCustomMotor` in `rocketStore` → selectable in Flight.
- Burn rate is a placeholder constant (`BURN_RATE_M_S = 0.004` in `PropulsionStudio.tsx`). Replace it with Saint-Robert's law r = a·Pcⁿ, with a and n per propellant from published sources. Designed motors are tagged **Modeled** until a static-fire curve is imported, then **Measured**.

### E4. Propellant recipe editor (the ProPEP 3 capability)
- Today the Gibbs solver (`crates/astraea-core/src/gibbs.rs`) is fixed to one recipe (70% AP / 18% Al / 12% HTPB) with 10 species. It is well validated (60 NASA-CEA cases), but users cannot enter their own formulation. KNSB/KNDX sugar motors are impossible because there are no potassium species.
- Build: an ingredient table (formula, heat of formation, density) from public sources; more product species (K, Mg, Na compounds, condensed phases); arbitrary formulations. Outputs: Tc, γ, MW, c*, theoretical Isp. These are the inputs to E3.
- **Reference:** NASA CEA (public domain). Validate against CEA directly. ProPEP 3 may be used only as an occasional cross-check (closed freeware; do not copy its code or database).

### E5. External-value import (legal access to closed tools' results)
- **RASAero drag table import:** the app exports .cdx1 but cannot import a Cd-vs-Mach table and fly with it. Add the import; flights using it are tagged "drag: RASAero (external)". This was already planned in `docs/rocketry-tools-reverse-engineering.md` ("CD(Mach) table ingestion").
- **External flutter speed** (for example from AeroFinSim), compared against max velocity in a Verify gate.

### E6. Fin flutter honesty
- `finFlutter.ts` implements NACA TN-4197, which was built for metal fins. For composite fins the result depends heavily on the shear modulus input. Let the user override G with a measured or published value for their layup, and show the dependency. Default confidence: **Modeled**, with that caveat.

### E7. Real project file on disk
- Save/Open is currently a revisioned slot in localStorage. Add Save As / Open to a real `.astraea` (versioned JSON envelope) file so teams can share and version designs, like `.ork`.

### E8. Export traceability (small)
- When exporting STEP/STL/DXF, write a small manifest alongside: revision, whether the sim is current, key results, gate states and confidence levels. Optional additions: a 1:1 fin template DXF and a cut-list CSV. Export stays one-way; Astraea is the source of truth for flight-relevant geometry.

## 4. Data and licensing decisions (my reading, not legal advice)

| Source | Licence | What we may use |
|---|---|---|
| RASAero II | Closed freeware | Public theory only (Barrowman, Missile DATCOM, Van Driest). **Do not** copy, or mass-sample to reconstruct, its tuned data. Users may import their own RASAero outputs (E5). |
| AeroFinSim | Commercial, closed | Public NACA TN-4197 only; user-entered external values (E5). |
| ProPEP 3 | Closed freeware | Benchmark occasionally only. Use NASA CEA (public domain) as the reference. |
| OpenRocket | GPL-3.0 | Ideas and equations, not code or the parts database (Astraea is Apache-2.0). |
| openMotor | GPL-3.0 | Not its files. Take propellant a/n coefficients from the original published papers and test reports. |
| RocketPy | MIT | Code and methods with credit. Flight data per team permission; fetch, don't bundle. |
| ThrustCurve.org | Site terms | Already integrated (live search). Check the terms before bundling curves offline. |
| NASA CEA, US Std Atmosphere | Public domain | Free to use. |

Being free and open source does **not** relax any of this. Apache-2.0 redistribution means everything included must be passable to every downstream user. Open source does help when asking authors and teams for permission and data.

## 5. Open questions for the owner
- Which telemetry formats to support first for log import. AltOS is primary today; others are Featherweight, Eggtimer, StratoLogger, RRC3, Blue Raven and CATS. A configurable column/unit mapping editor (status doc item S6) is the deterministic path; AI-assisted mapping is a copilot-branch feature.
- Whether to contact Rogers Aeroscience (RASAero) and the ProPEP author to ask what they would permit.

## 6. UI data contract (requested by the owner, 2026-10-03)
The frontend is being designed while features are still in flux. It designs against agreed **data shapes** with mock data rather than waiting for finished engine code. Please own `docs/ui-data-contract.md` (TypeScript interfaces plus short prose) defining what the engine hands the UI:
- **Every result:** `{ value, unit, confidence: 'measured' | 'calibrated' | 'modeled' | 'extrapolated' | 'unknown', reason, source? }`.
- **Run and case identity, and freshness:** `current` / `stale`, and what changed since the committed run.
- **Gate result:** `{ id, label, value, criterion, outcome: 'pass' | 'warn' | 'fail' | 'unknown', confidence }`.
- **Flight timeline series and events** (for the Flight-stage timeline), the stability breakdown per component, and the flutter margin over time.
- **Long-running jobs:** progress, cancel, partial results (the Monte Carlo chunk host already does this).
- **Imports:** a provenance block (checksum, dialect, units, skipped lines; `logProvenance.ts` already exists).

Keep it versioned. The frontend branch (`claude/upbeat-allen-ol4h5e`) and the copilot branch both consume it, so change it deliberately and note changes at the top.
