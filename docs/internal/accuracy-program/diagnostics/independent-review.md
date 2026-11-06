# Focused scientific review of D1/D2

2026-10-24. **Accept the direction-of-scale diagnosis and authorize a bounded
semantics/provenance patch; revise several scientific claims. No mathematical
or aerodynamic correction is established by this packet.** This acceptance
does not qualify unrestricted calibration use or establish improved flight
prediction.

Reviewed diagnostic commit `ffb80920e06422dc392ce7c2371203fabd6a92a9`, its two
probe scripts/JSON artifacts, and the relevant estimator, UI, historical test,
and Rust force implementation at baseline
`1745adb7265b642c6a7ecfd12e1418b51f159bcb`. Source references below are relative
to `/workspace/astraea-worktrees/diagnostics`. No new data, simulations, full
tests, or holdouts were opened; conclusions use existing artifacts and source
inspection. No CPU lease was used and no processes remain.

## What the evidence establishes

1. **The 0.883 scale has the expected implemented direction.**
   `dragFit.ts:91` returns 0.491023012 / 0.555979558. Rust multiplies airframe Cd
   by that number (`crates/astraea-core/src/six_dof.rs:1364`), including powered
   ascent. The saved WASM replay increases apogee from 371.704 to 396.059 m
   against 291.740 m observed, and burnout speed from 113.429 to 116.007 m/s.
   The fit minimizes a local force surrogate; it does not minimize apogee or
   identify initial conditions. The model already exceeds the logged altitude
   and vertical speed at 2.200 s (158.50 versus 118.04 m; 97.60 versus 75.38 m/s),
   subject to the declared clock and sensor reconstruction. These facts resolve
   the apparent sign contradiction. They do not identify the physical cause of
   the early mismatch or rule out a drag-model error, especially during boost.
   Replace “established cause” with “established objective/application
   explanation” if necessary to prevent that broader reading.

2. **The historical 0.818 comparison is an arithmetic bridge, not an independent
   full-record reproduction.** `flightValidation.test.ts:53` stores rounded
   constants 0.4526 / 0.5533; its current log calculation reads the tracked coast
   extract, uses 47 g and raw differences, and omits site elevation in density.
   The probe records 50.13628784 g production coast mass and a different model
   estimator/window. The proposed multiplicative bridge is algebraically sound.
   Keep its explicit ordering and qualification: changing only the historical
   numerator's mass convention is a bookkeeping comparison, not a causal
   experiment changing vehicle mass. The historical denominator was not rebuilt
   in this probe; label its replacement “historical model-Cd constant to current
   estimate,” not a uniquely isolated denominator-estimator effect. Preserve
   original constants and dates. The newly recovered full log's native result
   remains unmeasured here.

3. **The same-observed-point residual calculation is correct for its stated
   constant-coefficient surrogate.** `coast-residual-probe.mjs` reuses the same
   385 derived log points, computes x = rho*v_z^2*A/2 and y = m*(-dv_z/dt-g),
   then evaluates x*C-y for each candidate constant C. The fitted constant is
   C_hat = sum(x*y)/sum(x*x). Therefore reducing the training residual relative
   to any other constant is an OLS property, not additional evidence of physical
   accuracy. Report **4.50% lower in-sample force RMSE**, not “the objective
   improves 4.50%”: the stated objective is SSE, whose reduction is about 8.81%.
   Call v smoothed log-derived vertical speed, rho assumed ISA density, and y
   inferred force, rather than directly measured aerodynamic force or density.
   The remeasured calibrated trajectory's effective C is within 0.56% of the
   target, useful implementation closure for this case. Neither C represents
   production force evaluated at each observed state. The scale ratio is also
   not an exact optimizer of production-trajectory fit error: changing scale
   changes trajectory and sampled support. Preserve the high-speed-band
   regression and the explicit lack of independent validation.

## Concrete amendments for the next patch

- In `src/evidence/dragFit.ts:6`, replace guaranteed smoothing/differencing bias
  cancellation with: “Both sides use the same procedure; different sampling,
  smoothing windows, trajectory support and sensor errors can bias the ratio.”
  The saved windows are ±0.10 s/385 points/5–72.79 m/s for the log and
  ±0.25 s/54 points/5.26–102.20 m/s for the model. Effective coefficient weights
  scale as x², approximately v⁴ at fixed density and area. Equal procedure does
  not imply equal effective estimator or cancellation. Keep the 0.5% resampling
  sensitivity labeled conditional; it also changes truncation/support.
- Correct mass language in `dragFit.ts`, `dragFit.test.ts`, the calibration UI,
  and application comments. The common assumed mass cancels **for fixed input
  trajectories**. An erroneous modeled mass can still affect the scale through
  the simulated trajectory. The fit cannot identify mass and physical Cd
  separately or guarantee correction of mass/geometry errors. Do not describe
  49.9 g as the current engine coast mass; retain it only as a declared test
  assumption if useful. Soften “the residual is mass,” “not a drag-model error,”
  and mass-dominance claims in `flightValidation.test.ts:216,247` to the measured
  sensitivity and unresolved competing explanations.
- Replace “Burnout → apogee” (`CalibrationCard.tsx:218`) with observed-feature
  language, e.g. “Velocity peak → highest logged altitude.” On this truncated
  extract the first sample, 2.200 s, is the maximum velocity; it is not the
  1.887 s source burnout. A highest recorded altitude can also be a truncated
  endpoint, not an observed apex. State these events are proxies and identify a
  boundary peak when available. No persisted field rename is required just to
  correct display/comment semantics.
- Remove the guarantee in `coastWindow.ts:16` that waiting one smoothing
  half-width after the velocity peak prevents tail-off contamination. Even in
  an ideal vertical flight, velocity peaks when thrust falls below weight plus
  drag, which can precede motor burnout. A heuristic window is not proof of
  zero thrust. Similarly the 7.205 s declared ejection precedes the selected
  window end 7.278 s; a centered filter can mix post-event samples into earlier
  points too. Do not claim a recovery-free coast or silently clip the data in a
  wording patch.
- Display each side's actual smoothing half-width, speed span and selected time
  span beside the fit. Label RMSE as an in-sample equivalent-force residual,
  without a success color implying accuracy. Remove “the logged apogee above is
  the check” (`CalibrationCard.tsx:243`): it displays uncalibrated apogee and
  does not verify post-application benefit. State that a lower coast-fit Cd can
  raise apogee, and the applied multiplier also affects powered airframe drag.
- Make applicability visible before fitting and alongside the applied result:
  the reconstruction assumes unpowered ascent, approximately vertical
  air-relative motion, negligible wind/lateral aerodynamic effects, constant
  mass and no recovery deployment in the fitted/filter support. ISA density is
  an assumption. A scalar learned on this speed range is not established for
  other Mach/attitude regimes or powered drag. “Calibrated” is provenance, not
  a quality or applicability pass.

## Applicability and coordinator decision

The current UI's `blocked` logic (`CalibrationCard.tsx:131`) checks engine/log/
design state, not these physical assumptions. The fitter receives only altitude
and vertical velocity. Rust uses full air-relative velocity, normal force and
gravity (`six_dof.rs:1335–1438`). In wind or inclined flight, -m*(dv_z/dt+g)
is a vertical resultant, not total drag, while v_z² is not airspeed squared.
During thrust it also contains a thrust contribution. Common processing on
model and log does not generally cancel those differences. Thus existing UI
applicability **does silently exceed the inversion's justified domain**. The
near-vertical, assumed-calm Cosmic fixture does not qualify broader use.

Approve a first patch restricted to the concrete wording, visible limits and
already-available support metadata above; keep coefficients, scale direction,
selection algorithm and engine behavior unchanged. This fixes misleading
claims, but must not be recorded as closing the applicability defect. Reserve
a separate bounded task for physical eligibility/window provenance: distinguish
known versus unverified burnout/recovery events and unsupported conditions,
decide how fit/application should handle them, and validate event/filter support
with controlled cases. Do not invent numerical wind/angle tolerances or choose
them to recover the desired apogee. Existing persistence lacks both windows'
complete smoothing/regime provenance (`src/application/dragCalibration.ts:16`);
any durable extension needs explicit schema ownership and backward handling.

The proposed same-estimator full-log/extract comparison is a reasonable next
development diagnostic, with source events and each support change disclosed;
it is not a prerequisite for correcting false labels now. No extra probe is
needed to make this decision. A future mathematical change must demonstrate a
specific estimator/model failure under declared assumptions, then report its
prediction consequences. Present evidence supports no reversal, apogee clamp,
global Cd retune, or inferred payload correction.

Task: independent focused scientific review. State: ready for coordinator
review. Output: this file only; no product source changes or commit. Model:
gpt-6-astra / high, selected by the coordinator; independent usage telemetry unavailable. Verification:
read-only source/artifact inspection commands completed with exit 0; no tests
or builds claimed. Source/WASM identity is inherited from the probe artifact,
not independently rebuilt or rehashed in this review. Historical full-log
derivation, actual flown mass/geometry/weather, native UI behavior, and external
predictive benefit remain unverified.
