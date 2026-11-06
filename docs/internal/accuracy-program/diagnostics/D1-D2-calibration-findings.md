# D1/D2 calibration diagnosis — 2026-10-24

State: **ready for coordinator review; no product change proposed to physics.**

Base: `1745adb7265b642c6a7ecfd12e1418b51f159bcb`. Worktree:
`/workspace/astraea-worktrees/diagnostics`, branch `delivery/diagnostics-20261024`.
Routing: gpt-6.1-sol / high, focused source and production-WASM diagnostics.
No subagents, new holdout outcomes, external messages or canonical plan edits.

## Findings and ranked causal interpretation

### 1. The fitted objective and whole-flight apogee answer different questions

**Established objective/application explanation; not a reversed scale or an identified physical cause.**

`src/evidence/calibration.ts:101` minimizes
`sum((m * (-dv_z/dt - g) - 0.5 * rho * v_z^2 * A * Cd)^2)` on selected
coast points. It does not minimize apogee error, fit burnout speed or initialize
the model at measured burnout. `src/evidence/dragFit.ts:64` fits the log,
`:75` fits the model's own separate coast and `:91` returns fitted/model Cd.
`src/console/evidence/CalibrationCard.tsx:153` runs the uncalibrated model from
the pad, then `:159` invokes that fit. Rust multiplies airframe Cd by this
scale in `crates/astraea-core/src/six_dof.rs:1364`; the canopy Cd remains its
declared value. The scale applies during powered flight as well as coast.

The unchanged production WASM reproduces:

| Quantity | Uncalibrated | UI coast fit applied | Recorded log metadata |
|---|---:|---:|---:|
| Scale | 1 | 0.8831673845 | — |
| Apogee, m AGL | 371.704216 | 396.058634 | 291.740 |
| Apogee, s | 7.984941 | 8.301309 | 7.454 |
| Motor burnout speed, m/s | 113.429075 | 116.007419 | 83.434 |
| Motor burnout time, s | 1.860 | 1.860 | 1.887, refined source event |
| Motor burnout altitude, m | 122.780214 | 124.267682 | Not in the tracked extract |
| Model's effective coast Cd, remeasured | 0.555979558 | 0.488258432 | Fit target 0.491023012 |

At the **same declared log clock**, before this extracted fit even opens:

| Time, s | Model altitude, m | Observed altitude, m | Model vertical speed, m/s | Observed vertical speed, m/s |
|---|---:|---:|---:|---:|
| 2.200 | 158.500 | 118.040 | 97.600 | 75.380 |
| 2.305 | 168.560 | 125.816 | 93.315 | 72.810 |

These are interpolated **display telemetry**, rounded by the engine, not dense
state estimates. They nevertheless demonstrate a large already-present
altitude/speed discrepancy. Reducing coast drag leaves that initial-condition
discrepancy unresolved and also increases modeled powered-ascent speed. The
83.434 m/s value is the published sensor-derived metadata value, not an
independent radar velocity measurement. Burnout times on the two sides differ;
the table does not pretend they are identical-state observations.

This rules out the inference that the fit must increase drag merely because
whole-flight apogee is too high. It does **not** prove missing mass is the sole
physical cause. Estimated fins, disputed flown mass, actual motor performance,
sensor reconstruction, attitude and weather remain confounded. The stronger
claim in `src/evidence/flightValidation.test.ts:247`–`:252` that the residual
"is mass" is not established by these observations.

### 2. The 0.818 versus 0.883 difference is reconciled by different fit contracts

**Established arithmetic/input provenance difference, not divergent application.**

The historical scale is literally `0.4526 / 0.5533` at
`src/evidence/flightValidation.test.ts:53`. That test imports the **same tracked
coast extract** at `:29`; `:19` identifies it as every fifth sample between
2.2 and about 7.45 s. Calling this a separate "full-record native fit" is
misleading. The original full raw log may have informed historical work, but
the current source does not recalculate that scale using the full log.

The historical log estimator uses 47 g (`:43`), raw three-point differences
(`:157`) and ISA density at logged altitude alone (`:162`), omitting the 10 m
pad elevation. The current UI uses production dry design mass plus motor casing
(`CalibrationCard.tsx:158`), smoothed derivatives and site + AGL density
(`src/evidence/coastWindow.ts:228`–`:235`). Actual production mass is:

- Design dry mass: **37.8362878405 g**.
- Casing dry mass: **12.3 g**.
- Total coast mass: **50.1362878405 g**.

The 49.9 g statement in `src/evidence/dragFit.test.ts:34` is a test assumption,
not the current production UI's computed coast mass. Changing the assumed mass
on **both sides of the same fixed trajectories** leaves the UI scale unchanged:
35 g, 47 g and 49.9 g each produce 0.8831673845 within floating-point noise.
Both individual Cds scale with mass. This cancellation does not imply a newly
simulated model with changed vehicle mass has the same scale or powered ascent.

Exact multiplicative reconciliation against the documented constants:

| Change, applied in order | Scale |
|---|---:|
| Historical constants 0.4526 / 0.5533 | 0.8180010844 |
| Convert historical numerator from 47 g to 50.1362878405 g | 0.8725859111 |
| Replace historical model-Cd constant with current estimate 0.5559795577 | 0.8683804610 |
| Replace numerator with current smoothed/windowed log fit 0.4910230118 | **0.8831673845** |

The factors are **+6.67295%** for numerator mass convention,
**−0.48195%** for replacing the historical model-Cd constant with the current estimate, and **+1.70282%** for the remaining
log estimator/window/density difference. This is an order-explicit arithmetic
attribution, not a variance decomposition or a causal mass experiment. The
historical model coefficient was not independently rebuilt in this packet. The current log fit at 47 g gives
0.4603069463. A raw central difference at 47 g and the current site density
gives 0.4530298433 across 393 points; the historical path's 10 m density omission
accounts for approximately 0.1% of the difference. No ms/seconds, meters/feet,
kg/grams, area/diameter or ratio-inversion defect was found in the current path.

The older scale, replayed unchanged through production WASM, gives
411.583810 m apogee, consistent with its stronger drag reduction.

### 3. Current window labels and the bias-cancellation explanation overstate what is known

**Confirmed contract/communication limitations; not an established physics defect.**

The tracked log has 406 samples from 2.200 to 7.442 s, with no powered ascent.
`coastWindow.ts:204` picks maximum smoothed velocity and labels it `burnoutS`.
For this already-truncated coast, that is simply its first sample, 2.200 s,
whereas the metadata source event is 1.887 s. The UI calls it
"Burnout → apogee" at `CalibrationCard.tsx:218`; the estimator has no
knowledge that actual burnout was absent from the imported sample range.

The actual selected windows differ:

| Input | Smoothing half-width | Selected time range | Points | Selected speed range |
|---|---:|---:|---:|---:|
| Extracted log | 0.100 s | 2.305–7.278 s | 385 | 5.005–72.787 m/s |
| Baseline model display telemetry | 0.250 s | 2.100–7.450 s | 54 | 5.260–102.201 m/s |

The larger model half-width follows `coastWindow.ts:180`, which widens the
nominal 0.1 s to 2.5 × the median telemetry interval. The same function on both
sides does not imply the same filter, velocity support or sample weights.
The claim that using one estimator keeps smoothing bias out of the ratio
(`dragFit.ts:6`) is stronger than the implementation can guarantee.
OLS weights approximately as velocity to the fourth power, so the support
differences matter. Sampling the model on the extract's timestamps gives
effective Cd 0.558632497 and ratio 0.878973233, about 0.5% below the current
ratio; this is a limited sampling sensitivity, not a corrected target.
Model resampling also truncates its own pre-apogee span at the extract end.

The log contains a declared ejection time of 7.205 s in its preamble, while
the automatically selected speed-filtered window extends to 7.278 s. The
calibrator does not use recovery-event metadata. Those late low-speed points
carry little OLS leverage, but no recovery-free guarantee should be claimed.

The method assumes vertical coast: `-dv_z/dt - g` and `v_z²` at
`coastWindow.ts:228` are not generally a full air-relative aerodynamic force
reconstruction in wind or appreciable inclination. Production uses air-relative
3D speed (`six_dof.rs:1337`), body axial and normal forces, and world gravity
(`:1438`). The current API supplies no measured lateral velocity, attitude,
wind or explicit regime qualification to the fitter. Cosmic's near-vertical
assumed setup makes this a diagnostic; it does not establish validity for all
college flight regimes. Both paths use 9.80665 m/s² gravity; no gravity-sign
discrepancy was found.

### 4. A bounded coast improvement is demonstrable, with clear limits

Using **the identical 385 observed points**, their smoothed log-derived vertical speed and assumed
ISA density, evaluate constant-equivalent-Cd force residuals without trajectory
propagation or apogee alignment:

| Equivalent coefficient | Force RMSE, N | Mean modeled − inferred force, N |
|---|---:|---:|
| Baseline model coast Cd 0.555979558 | 0.130635223 | +0.050639075 |
| Fitted target Cd 0.491023012 | 0.124751318 | +0.022873627 |
| Calibrated WASM coast, remeasured Cd 0.488258432 | 0.124762227 | +0.021691917 |

The fitted constant reduces **in-sample equivalent-force RMSE by 4.50%**
and SSE by approximately **8.81%**. Lower training SSE than any other constant
is expected from OLS; it is not additional evidence of physical or predictive
accuracy. The calibrated WASM's
remeasured effective coast coefficient is within **0.56%** of the target.
This is useful implementation closure for this case, independent of
whole-flight starting altitude and speed. It is **not** an actual native
per-state force evaluation or a measured-initial-state trajectory restart,
and using the same fitted data provides no independent predictive validation.
The ratio is not an exact optimizer of production-trajectory fit error, because
changing scale changes the trajectory and its sampled support.

The 50–75 m/s band worsens (0.189433 → 0.195587 N), while lower bands improve.
Thus even the equivalent coefficient does not improve every part of the coast.
Production initializes position and velocity to zero in
`six_dof.rs:1706`–`:1708`; `FlightOptionsDto` at
`crates/astraea-engine/src/models.rs:98` exposes no observed-state restart.
No second solver or API instrumentation was introduced to manufacture that check.

## Recommended minimum correction and decision

Do **not** reverse the scale, clamp it to improve apogee, retune aerodynamic
terms, or fit an undocumented payload to this observation. The current numerical
ratio and production direction are internally coherent.

Authorize a small subsequent semantics/provenance correction: call the operation
an **effective vertical-coast drag fit**, state that it does not match launch-to-
apogee behavior or establish physical Cd when mass is uncertain, label inferred
burnout as a velocity-peak proxy, expose the effective smoothing/window support,
and correct the historical comparison to identify its different mass, density
and derivative conventions. Preserve historical constants and reported outcomes.
Soften "the residual is mass" and unconditional bias-cancellation language to
the supported conditional interpretation. No API/physics change is justified yet.

## Evidence and resource accounting

Production WASM was read in place, unchanged, from
`/workspace/astraea/src/engine/astraea_engine.wasm`:
SHA-256 `e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985`.
Tracked coast CSV:
`eef176a2c3c0515e2b251e8362d1cc60a8ca2b2a27e0d9f8b7df3c25720ae18d`.
Lockfile remains unchanged:
`8098fac5500fa1b8cce4e8566423f7369764347aeca908f8257ceeb1ae84ed41`.

Commands from this worktree, after sourcing `/workspace/astraea-plan/env.sh`:

1. `pnpm install --offline --frozen-lockfile --store-dir /workspace/.toolchains/pnpm-store`
   failed because pnpm supply-chain metadata was not available offline.
2. Coordinator-authorized network retry with the same command without `--offline`
   passed; 280 packages reused, none downloaded, lockfile unchanged.
3. `node docs/internal/accuracy-program/diagnostics/calibration-probe.mjs > docs/internal/accuracy-program/diagnostics/calibration-probe.stdout.log 2>&1`
   passed, exit 0; three sequential production-WASM flights, no build. Initial
   Vite startup printed an unused HMR socket EPERM warning; all module loads and
   calculations completed. Probe now disables HMR for subsequent reproduction.
4. `node docs/internal/accuracy-program/diagnostics/coast-residual-probe.mjs > docs/internal/accuracy-program/diagnostics/coast-residual-probe.stdout.log 2>&1`
   passed, exit 0; no simulator invocation.

Machine-readable results are adjacent `calibration-probe.json` and
`coast-residual-probe.json`. These are new diagnostic results; baseline broad
suites in BOOTSTRAP were accepted without duplication. No tests or builds were
rerun because this packet changes no product source. One-worker lease released;
no running processes remain.

## Data status, remaining uncertainty and next packet

Inventory has now recovered previously examined development files under
`/workspace/astraea-data`: full Cosmic log, Top Shot log/ORK/E12 curve and
Adventurer log/ORK/J510W curve. I independently checked Cosmic's full-log digest
`adce6e39cf0fa9919c0349c83725ffe431b44a8b03db5ccbb71d6a7aad4066b8`.
The inventory lane reports the other declared hashes match. Mini DX3 G69N FIP
remains absent. No new holdout outcomes were opened.

The four-case development replay has since completed unchanged; see
[D3 development replay summary](D3-development-replay-summary.md) and its source/
artifact hash manifest. This does not rerun the full Cosmic file through the
native fit or compare that fit with the exact tracked extract. Native Windows/
Mac calibration traces remain unavailable; browser evidence does not substitute
for them. No new holdout outcomes were opened.

The scientific review authorizes the bounded semantics/provenance correction,
not a numerical correction. Physical eligibility and event/filter provenance
remain an open defect: the existing fitter does not verify zero thrust,
approximately vertical/calm conditions, constant mass or absence of recovery in
its support. A separate scoped change must decide how unknown or unsupported
conditions affect fitting/application and validate controlled event/filter
cases. Full durable smoothing/regime provenance also needs schema ownership and
backward handling. Actual flown mass/geometry/weather and independent predictive
benefit remain unverified; this packet does not establish 1.0 empirical accuracy.
