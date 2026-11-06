# RMP10a proposed observable contract — sampled flight-model history

Planning base `78d27f3130ccfb4bd22419b1ed5877675004619d`.
**Pre-implementation proposal; not yet accepted/frozen. Zero new native calls.**
This selects an observable from the existing production model, not a new law,
solver, model default, eligibility declaration or numerical/physical qualification.

## 1. Question and useful end-to-end increment

Can a teammate inspect the modeled evolution of motor-depleted CG and the normal
moment-arm quantities that the actual committed flight used, rather than
mistaking geometry-only static margin or the separate Mach-curve CP for that
history? Deliver a sampled, result-bound history and its input/model/runtime
provenance through native computation, bridge, adapter and an app readout/plot.
No new stable/unstable/competition verdict or certified through-burnout minimum.

Missing team measurements and decision budgets block qualification, not recording
the model's own existing values. Existing geometry-only labels (29f7ba4) and
recorded pressure-peak retention (ad8448b) are completed work, not this increment.

## 2. Source observations already verified read-only

- `six_dof::compute_flight_loads` produces `FlightLoadsDiagnostic` for every
  legacy evaluation. It includes model_id, signed C/first moment J/CP, combined
  motor+dry CG, exact Mach/incidence/q, aero-body force, static/damping/total
  moment, validity, recovery/rail/powered flags. No second RHS is needed.
- `DriverLoads::from(FlightLoads)` currently drops the diagnostic; macro_detail
  is the actual evaluator result at a committed state before telemetry rounding.
- `normal_slope_at_mach` is the actual flight law (not aero-curves' heuristic):
  C=body C + fin C×degrade; J=body J + fin J×degrade; CP=J/C. Existing positive
  absolute/relative slope guards refuse undefined/ill-conditioned cases. They
  MUST NOT be weakened to obtain a history. The legacy solver does not return
  successful cancellation/free-couple histories; candidate behavior is separate.
- `stage_mechanics_with_flow` computes motor depletion and instantaneous CG;
  body +Y is noseward and stations are meters aft of the nose. Diagnostics use
  body moment about instantaneous combined CG, not a fixed nose origin.
- Existing display samples are rounded/noncanonical and decimated; reconstruction
  of mechanics/CP from rounded Mach/mass/position or from live project state is
  forbidden. Existing telemetry cadence is not a powered-history resolution proof.

## 3. Observable definition (not physical eligibility)

Name: **Sampled flight-model normal moment-arm history**.
Initial provider: only the existing production legacy flight contract
`flight-signed-normal-plus-wind-drag-v1`; mechanical source remains
`legacy-primitive-mass-inertia/1.0.0` (declared inputs/primitive estimates, not
measured inertia). Source/model IDs and actual invocation-bound engine checksum
travel with the result. Labels must distinguish this from the geometry-only and
Mach-curve APIs, neither of which supplies this history.

At each recorded eligible committed sample, copy exact already-evaluated:
- `timeS` (actual motor/flight clock), origin/purpose and rail/recovery/powered
  flags, computational-domain status;
- `massKg`, `cgFromNoseM`, actual `mach`, `incidenceDeg`, `dynamicPressurePa`;
- normal `cPerRad`, nose-station first moment `jMPerRad`, `cpFromNoseM`, actual
  reference diameter/length and a literal model-law/source identifier;
- actual `aeroForceBodyN`, `staticMomentBodyNm`, `dampingMomentBodyNm` as context,
  so a moment arm is never passed off as the complete dynamic restoring action.

Derived display quantities use only that same point's exact fields:
`normalMomentArmM = cpFromNoseM - cgFromNoseM`,
`normalMomentArmCalibers = normalMomentArmM / referenceDiameterM`,
`normalMomentArmPercentLength = 100 * normalMomentArmM / referenceLengthM`,
`normalRestoringMeasureMPerRad = jMPerRad - cPerRad * cgFromNoseM`.
The last quantity is a model algebraic measure, NOT a total finite-incidence or
dynamic-stability criterion; wind-axis drag, roll torque and rates also affect
the actual moment. No sign-only green stability classification is introduced.

Under live canopy the legacy airframe normal-CP model is not the active static
branch: airframe C/J/CP/moment-arm quantities are **not applicable**, never zero
or a fabricated stability reading. Mechanical CG/mass may still be recorded.
The same principle applies if future candidate providers supply different or
undefined quantities: do not route candidate output through this legacy law.
Existing legacy source-domain failure remains a failure, not a successful null
history or source fallback. Missing historical history remains unavailable.

## 4. Sampling, event context and boundedness

- Record only actual committed macro-state reads, before display rounding;
  never rejected/speculative trials, endpoint probes or root-search iterates.
  No change to adaptive steps, roots, contact/event flags or trajectory clocks.
- Retain initial sample when available and a declared sampling schedule through
  the powered interval. Exact event times are taken from the actual result.
  Do not relabel a nearest sample as an exact burnout state.
- Scope is explicitly **sampled**. Record sample count, exact time range,
  maximum observed gap and whether an exact committed burnout sample exists.
  If not, disclose the last sample vs burnout time; no through-burnout minimum.
- An exact burnout history point, if needed for a subsequent accepted scope,
  requires a real committed-root observation contract. Do not add observer reads
  that influence validity/control flow or silently treat speculative reads as
  committed. This design review must decide whether the first increment needs
  that point; code must not invent it.
- Wire cap is bounded (proposed 5,000 points); overflow refuses the requested
  history explicitly or uses a separately reviewed deterministic retention rule,
  never silently truncates. Sampling/decimation cannot produce a continuous
  minimum/error bound. Lowest-recorded values, if shown, are named as such.

## 5. Compatibility, persistence and actual runtime

Preferred boundary: an explicit optional reporting request, default off, on the
existing flight command; ordinary old calls/ensembles without the request retain
old serialized outputs and numerical behavior. Reporting is not a second model
or mode and must not alter the mechanical/physical input identity.

Exact DTO field placement, strict null/type semantics, history schema ID and
archive-version treatment must be accepted before implementation. New captures
must retain the actual reporting request. Old archive versions/absence must not
be normalized into invented declarations or history. Restoring or comparing old
results never reruns them implicitly and never substitutes live project defaults.
History stays attached to its completed run/recorded engine identity; stale runs
retain that history, and changing motor/geometry/model cannot relabel it.

The end-to-end increment is not complete at a native-only report: bridge/adapter,
readout/plot and save/reopen or explicit unavailable-old-history behavior must be
implemented and tested before offering it. Do not claim a freshly built offered
runtime until intentional WASM build, actual invoked-buffer identity and bounded
browser journey agree. Old WASM/browser evidence is historical only.

## 6. Predeclared verification questions (not an experiment run budget)

Software/analytic checks only initially; no new empirical/scoring/holdout runs:
- Observer off/on leaves trajectory/coarse metrics/events/validity identical;
  off path serialization remains unchanged on synthetic preservation fixtures.
- Every history point copies the same actual committed diagnostic at its exact
  time, not rounded telemetry, geometry stability API or Mach-curve CP.
- Analytic two-mass CG/depletion/zero-propellant limits; frame/station and C/J/CP/
  moment-arm algebra; signed cancellation/undefined cases keep existing refusals.
- Recovery is N/A; rates/static/total moments remain distinct; no fabricated CP
  or output after stop; no event-time reassignment or speculative samples.
- Invalid reporting requests and missing/corrupt/unknown history schemas fail
  closed without replacing a project or promoting an old result.
- Bound/cap, sample timing, exact-burnout presence/absence and lowest-recorded
  semantics; no pressure-peak or existing event retention regression.
- Archived/stale/old-unavailable history, motor edits and save/reopen preserve
  attribution; known engine changes cannot be attributed to geometry alone.
- Independent convention/observable-contract review, source review and actual
  runtime journey where applicable. No mission or accuracy PASS from software.

## 7. Review decision required before shared edits

This is a prospective design, not permission to fill missing values. Resolve:
1. Correct observable/frames/units and limitations given the actual legacy
   static moment also includes wind-axis drag and a separately named rate model.
2. Committed sampling/cap and exact-burnout obligation for the initial scope.
3. Reporting request and archive/schema semantics that preserve original calls
   and histories without a hidden model switch or invented provenance.
4. Smallest coherent source-to-wire-to-UI increment and actual build verification.

If these remain ambiguous, refine this contract before runtime code. Approved
physical/mission budgets and team evidence remain separate open gates.
