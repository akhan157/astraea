# Collegiate accuracy acceptance specification — proposed v0.1

Date: **2026-10-24**. Baseline: `1745adb`. Status: **for coordinator review; not an approved release gate or public promise**. This document neither relaxes the previous proposal nor rewrites a frozen protocol.

## Proposed claim and unchanged historical proposal

Evaluate useful engineering decisions for a **single-stage commercial-solid collegiate competition vehicle with passive stability and dual-event recovery**, initially represented by an as-flown full-scale vehicle. This comes from the existing project direction and the [mission matrix](collegiate-mission-and-decision-matrix.md). Its actual geometry, Mach/Re/AoA, atmosphere, mass and recovery envelope must be measured and declared. Do not impose Mach <0.8 simply because the present scorable flights fit it. Transonic/supersonic coverage remains open and cannot be inferred from a target altitude or calculator capability.

Preserve the earlier proposal exactly as historical context: six vehicles from two independent sources; per-vehicle median apogee error within ±10%; mean of vehicle medians within ±5%; ≥80% of blind flights inside predicted 5–95% intervals including model uncertainty; all failures/exclusions disclosed. It was drafted after Mini DX3 outcomes and is not preregistered collegiate acceptance. It covers only some apogee questions and has no decision-specific interval-width criterion. Nothing in the examined references independently justifies treating those numbers as a comprehensive collegiate promise.

## Requirement structure

Every accepted claim needs a **mission + output + decision + error budget + measurement method + validation cohort**. Implementation, physical accuracy and flight authorization must be recorded separately. “Unknown” output accuracy does not become acceptable because a computed vehicle margin is large.

For each decision, the team records its usable reserve to a target/constraint and the smallest alternative design change it wants the tool to distinguish. Allocate uncertainty among inputs, observations, model discrepancy and numerical error. Correlations and bias matter; do not add all terms in quadrature without a justified probabilistic model. Use a forward uncertainty study or sensitivity bounds when distributions are not defensible.

**Proposed decision rule:** the prediction may support a decision only when its qualified error/uncertainty envelope fits the documented reserve and yields useful separation of the alternatives. Values close enough that uncertainty overlaps the decision boundary remain unresolved. The chosen confidence/probability level and acceptable false-positive risk must be set with the team/reviewer before scoring. This packet proposes no new universal numerical tolerance.

| Output / proposed requirement | Engineering rationale and consequence | Measurement resolution / method | Evidence and open threshold question |
|---|---|---|---|
| Apogee and design-change effect | Resolve named motor/ballast/geometry choices and target/ceiling reserve; report signed absolute error and normalized error separately | Qualified barometric pressure conversion or GPS with datum, baseline, uncertainty; paired changes or a defensible controlled design for trend validation | Existing one-vehicle evidence is insufficient for collegiate breadth. What absolute altitude reserve and minimum design delta matter at each target, and what remaining error can the team tolerate? Do not derive a percentage from RASAero's mixed postflight table |
| Time to burnout / apogee | Distinguish powered/coast failures, timing logic and recovery planning; an altitude match may conceal timing error | Independent ignition/liftoff offset, sensor sample/clock error, independently observed burnout and apogee | No justified timing tolerance yet. How much of the event margin can model/timebase error consume? Report in seconds; do not shift curves to align apogee |
| Effective rail departure speed and incidence | A wrong event definition or early thrust rise can reverse a departure-margin decision | Survey guide/button travel; qualified fast video/photogate/state measurement and timing error | Source vehicle limits differ by program. Audit event semantics first; then determine speed/AoA error from reserve above the applicable threshold, not a universal percentage. Early acceleration is not validated by apogee alone |
| CP/CNα and static margin through burnout | Assess fin/CG changes and reserve to minimum/maximum margins throughout the Mach/AoA envelope | Matched tunnel coefficients with extraction uncertainty; measured CG versus burn state; CP in meters and calibers, with correct references | ARCAS tests cover specific geometries and conditions; local CP summaries are not general evidence. What CP error can be tolerated after CG uncertainty and rule reserve? Dynamic stability needs separate evidence |
| Airspeed, density, q and loads | Choose structural reserve and avoid missing critical transient/peak loads | Independent velocity/density or load instrumentation, calibration and bandwidth; source-matched aero and material/joint tests | No qualified full-scale q/load cohort here. Require peak convergence/time resolution and load-model bounds before setting a numeric error budget; q error includes correlated density/speed effects. Loads need AoA/CN evidence, not just speed |
| Recovery event state, descent speed/time and landing energy | Size parachutes and inspect per-section energy/altitude reserves; distinguish steady descent from opening transient | Actual trigger time/altitude, inflation interval, section mass, GNSS/baro descent and terrain | No native empirical recovery accuracy claim. Set speed/CdA/trigger error from per-section constraint reserves; declare inflation/opening-shock predictions unavailable until separately modeled and validated |
| Landing vector and dispersion | Support recovery search and boundary-risk decisions, including each independent section | GNSS landing coordinates, horizontal datum/error, wind aloft and issue time, event measurements | No validated containment cohort. Define useful footprint size and acceptable boundary-escape risk before looking at landings. r90/ellipse labels alone do not verify coverage or tail behavior |

## Uncertainty and statistical reporting

1. **Input uncertainty:** independently justified mass/CG, motor, surface, weather, angle, CdA and timing ranges, including correlations. A nominal manufacturer's value is not a measurement distribution.
2. **Measurement uncertainty:** sensor calibration, reference/datum, sampling, filtering, time alignment and event extraction. Reconstructed velocity or altitude may share errors with the quantity being evaluated.
3. **Model discrepancy:** conditioned on mission/regime and output, learned on development evidence with its provenance. Do not pick residual offsets or widen intervals after examining holdouts and call their coverage prospective.
4. **Numerical uncertainty:** integrator/event/sample convergence under the frozen implementation, separately from agreement with another code. Native WASM evidence is needed for Astraea production claims.

Always report per-flight signed residuals and absolute residuals in units; per-vehicle median signed and median absolute residuals; equal-vehicle mean of signed medians; number of flights/vehicles/source families per regime; worst relevant failure and all exclusions. Repeated flights improve within-vehicle understanding but do not create new independent vehicles. Team/source/instrument/motor/aero dependencies belong in the ledger.

For intervals/regions, retain nominal probability, observed inclusion, width/area, center bias, failures and the decision-relevant boundary exceedance. Explain the statistical uncertainty on coverage, accounting for repeated vehicles rather than treating all flights as independent. Six vehicles alone does not determine a reliable tail-calibration claim. Coverage from arbitrarily broad predictions is unusable: preregister maximum useful width/area from the decision margin, and report a proper interval score or equivalent width/coverage tradeoff with a frozen definition. The scoring choice and risk level are unresolved questions, not implied approved thresholds.

## Evidence coverage and closure gaps

| Requirement | Current evidence at baseline | What it closes | Closure dependency |
|---|---|---|---|
| Small-vehicle apogee | One independent scored Mini DX3 vehicle, input-only intervals failing coverage, as already disclosed locally | A truthful narrow residual record, not generalized accuracy | New qualified cohort with final frozen model; outcomes not already exposed |
| Collegiate full-scale and transonic/supersonic | No new measurements inspected/scored here | Nothing empirical | As-flown mission records and protected outcomes across the stated regime |
| Aero/CP | Historical ARCAS assessment and published source comparisons | Configuration-specific aerodynamic diagnostics | Reproduce matched Re/Mach/geometry/reference/base conventions with extraction error; broaden configurations |
| Numerical trajectory | Existing matched-supplied-drag low-speed comparisons in lane brief | Conditional consistency only | Assigned diagnostics/convergence and production-WASM verification; no need to duplicate unchanged checks here |
| Rail speed and stability decisions | Implemented output contracts and source rules | Requirements traceability | Event/length-percent audit, qualified speed and CG/aero evidence |
| q/loads/flutter | Implemented sampled q and engineering estimates | A candidate output inventory | Peak/time convergence, material/joint and aero/load validation |
| Recovery/dispersion | Implemented outputs; inflation/shock, terrain and containment remain limited/unvalidated | Identifies explicit claim gaps | Per-section instrumentation, wind profiles, CdA/event tests and prospective landings |
| Team reproducibility | Existing acceptance proposal | A defined user task | Independent team-led reconstruction/comparison/save/reopen/measurement journey; not developer-operated |

## Proposed acceptance sequence

First accept the mission/decision records and qualify inputs/measurement rights while outcomes remain sealed. Develop and review any model changes against development evidence. Freeze the final production model/WASM, domain, numerical settings, uncertainty treatment, sample/breadth plan, output budgets and exclusions; commit predictions before the custodian releases outcomes. Score the whole ledger and review decision consequences, regressions and calibration usefulness. A model change makes examined outcomes development evidence for the changed model.

The coordinator can accept these research structures now. Final numerical budgets, breadth allocation and a broader collegiate product promise require explicit review; missing empirical data remains a blocker to accuracy acceptance. Public release and outreach remain outside this packet.
