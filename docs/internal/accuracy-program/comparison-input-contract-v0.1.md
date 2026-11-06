# Comparison input contract — v0.1 proposed, 2026-10-24

Purpose: make a reference result interpretable and reproducible. A completed form does not establish flight accuracy. This is a research contract, not a product schema change. Applicable source methods are documented in [reference evidence](reference-methods-and-evidence.md).

## Experiment declaration

Every comparison gets an immutable ID, owner, purpose, source commit, executable/version/OS and artifact hash, input-file hashes, UTC date, units, reference frames, datum, numerical/event settings and complete output files. Retain failed runs and exclusions. State precisely which of these experiments is being run:

| Mode | What is held common | What is measured | Permitted interpretation |
|---|---|---|---|
| C1 — coefficient comparison | Geometry, coefficient reference area/length, Mach, Reynolds number, AoA, roll, surface condition, plume/base and correction definitions | Native Cd/CA/CNα/CP against independent coefficients with source uncertainty | Aero discrepancy in the measured configuration/regime |
| C2 — supplied-aero trajectory | Same drag/lift/moment tables, mass/depletion, thrust, atmosphere, gravity, rail and event rules to the extent representable | Time histories, phase events, apogee and state residuals between codes | Solver/model-contract consistency under shared inputs; not native-aero validation |
| C3 — native-aero end-to-end | Common as-flown inputs; each tool's documented native/selected aero | Differences in predictions; measured residuals only if qualified observations exist | Combined implementation/model differences; cross-code agreement is not measurement |
| C4 — fitted reconstruction | Identity of fitted record, fit objective/window, all changed parameters and frozen uncalibrated baseline | Fit residuals and phase changes; later-flight residuals scored separately | Calibration/reconstruction for the identified vehicle; not blind native-aero accuracy |
| C5 — prospective independent measurement | Frozen model, inputs, uncertainty and metric protocol; independent outcome custody | Qualified observed outcomes after committed predictions | Empirical accuracy for the declared cohort and regime |

If one tool cannot represent an input or convention, record the asymmetry and either restrict the question or mark comparison blocked. Never silently replace the motor, remove powered corrections, set unknown nozzle area to zero, change surface assumptions, or call a fitted table native.

## Required input record

| Group | Required contents | Missing-data handling |
|---|---|---|
| Geometry | As-flown axial stations, lengths/diameters, nose kind/tip, boattail, fins: number/planform/cross-section/thickness/cant/root position, protuberances, surface finish; reference area/length | Separate measured, manufacturer nominal, estimated and omitted features. Record implementation substitutions and their regime implications |
| Motor | Manufacturer/reload/serial or batch where available; exact ENG/RSE/native curve and hash, impulse/burn duration/interpolation; propellant and case masses, CG/inertia; test pressure/elevation, nozzle exit area and uncertainty | RASAero powered comparison is blocked without justified nozzle and sea-level thrust mapping. The nominal motor name does not establish the same thrust curve |
| Mass properties | Measured launch and dry masses/CG, motor-included versus excluded definitions, datum and sign; inertia tensor and reference point; depletion law and moving CG | Bounds need physical rationale and correlation, not arbitrary independent percentages. Unknown input precludes scoring the affected decision if it dominates its budget |
| Atmosphere | Site lat/lon/elevation/time; pressure convention and value, temperature, humidity if used, wind vector versus height and its uncertainty; provenance and forecast issue time | Distinguish station pressure from sea-level-reduced pressure and geometric/geopotential altitude. Do not call weather matched until profiles/conversions are inspectable |
| Rail/launch | Actual guide length and geometry; both button positions; effective constraint-release distance; angle from vertical versus horizontal, azimuth/heading, winds and ignition/liftoff convention | Compare first rotational freedom and final release as separate events where tools differ. Record omitted friction/tip-off effects |
| Aero | Model/options, Barrowman variant, laminar/turbulent transition and roughness, power-on/off selection, base/nozzle correction, Mach/Re/AoA/roll grid, reference area and normal/axial versus wind axes | Table origin: measured/CFD/RASAero/OpenRocket/other/fitted, version and hash; interpolation/extrapolation and any scale factor. Reusing a code's table removes independence for that coefficient |
| Recovery | Per-section mass/geometry and parachute CdA/area convention; trigger sensor/logic/threshold/delay/inflation; event datum; canopy/body drag treatment and terrain | Keep near-apogee event, main event, inflation and terminal descent distinct. Do not claim opening loads from a drag-step model |
| Numerics | Integrator/tolerances/step limits, sample/export rate, event localization, force/frame conventions and termination reason | Numerical convergence compares event values as well as exported samples. Display-sample peaks are not certified continuous extrema |
| Measurements | Instrument/sensor channel/units, calibration, timestamp/sampling, raw versus filtered/derived status, altitude datum/conversion, ignition offset and event extraction rule | Qualify before prediction/outcome access. No inferred burnout or time shift chosen to minimize the residual. Missing channels yield unscorable metrics, not imputed success |

## Outputs, reporting and freeze

Publish signed error `prediction − observation` in units and, where meaningful, percent of observation. Record altitude and time at burnout/apogee, effective and final rail release, peak speed/Mach/q with sampling method, CG/CP and stability history, recovery events and landing state. Do not divide small/zero CP, timing or drift values into unstable percentages; use meters/calibers, seconds and two-dimensional displacement.

Keep native, supplied-table and calibrated results in distinct columns. Record any common-mode dependencies. End-to-end residuals do not uniquely identify drag error. Phase comparisons require independently identified boundaries and compatible timestamps.

Before a C5 outcome is opened, freeze source/WASM/executable and input hashes, metrics, exclusions, statistical unit, uncertainty model and useful interval-width limits. Exposure history follows people and data; a new worktree does not restore blindness. All cases in the [exposure ledger](sources-and-exposure.json) remain development/reference evidence for this team. Subsequent model changes invalidate their status as blind evidence for that model.

Completion condition: another member can reconstruct the exact result from the record without choosing undocumented defaults. Runtime access, source rights, input gaps and convention mismatches remain explicit blockers until resolved.
