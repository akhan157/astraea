# Frozen development accuracy execution path — 2026-10-25

The existing Cosmic Cargo +79.964 m and Mini DX3 +319.387 m apogee residuals
remain unexplained. Twenty approved production-WASM calls reproduce all four
exposed baselines and measure local numerical/input responses. No solver,
aerodynamic law, calibration, source record or nominal input was changed.
These are development diagnostics, not independent validation or an accuracy
acceptance result. The signed-contribution repair already moved these two
cases by exactly zero; its Adventurer change was about 0.008 m. Selecting a CP
law or changing drag/normal-force conventions is not supported by this work.

## Evidence and reproduction

Production WASM SHA-256:
`c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe`.
Source checkout: `761d6c3fd80ba7188e00603dee741719ef1a41c5` plus the two
diagnostic scripts. The adjacent [JSON](2026-10-25-accuracy-execution.json)
contains full before/after metrics, exact changed source/wire paths, input and
raw-result hashes, frozen source manifests, qualification and output rankings.
Raw inputs/telemetry/residuals and the copied WASM remain outside Git at
`/workspace/astraea-plan/evidence/accuracy-execution-20261025/`.

The runner enumerates only the four declared development cases and their eight
already pinned external files. All eight SHA-256 checks passed. It captures
the actual production benchmark call and actual engine wire DTO through
fail-closed exact-source-anchor instrumentation. All four baseline inputs and
apogee, burnout and rail metrics exactly reproduce the prior frozen replay.
No directory enumeration, new data, holdout, round-two file or network access
was used. Perturbed motors and vehicles are synthetic diagnostic inputs; their
source records remain unchanged and the variants are not certified as flown.

```sh
source /workspace/astraea-plan/env.sh
# Worktree node_modules links the existing /workspace/astraea/node_modules.
node scripts/diagnostics/accuracy-execution.mjs prepare EXTERNAL_EVIDENCE /workspace/astraea-data
# Requires coordinator lease; sequential worker, pinned CPU and 1 GiB JS heap.
taskset -c 1 node --expose-gc --max-old-space-size=1024 scripts/diagnostics/accuracy-execution.mjs run EXTERNAL_EVIDENCE /workspace/astraea-data --approved-initial-20
node scripts/diagnostics/accuracy-execution-summarize.mjs EXTERNAL_EVIDENCE OUTPUT_JSON
```

The run used one worker on CPU 1. Peak measured child RSS was 1,110,992 KiB;
completed-call continuation peaked at 1,021,664 KiB. Total execution time of
the two measured attempts was 10.596 s. Vite printed its known nonfatal denied
HMR socket warning. No job remains running. Initial execution stopped before
call seven on a deliberately strict aero-DTO invariant: uniformly scaling mass
moved dry CG from 0.21817078785252447 to 0.21817078785252450 m and therefore the
25 displayed `staticMarginCalibers` values by roughly 1e-15. Every coefficient,
CP and reference geometry field was identical. The guard now permits only
these margin fields within the explicit 1e-10 relative/absolute comparison;
all other aero DTO fields must match exactly. Both harness identities are
retained. The resumed ledger verifies retained hashes and skips the completed
six calls; exactly twenty calls were made, with no repeat flight.

## Source qualification and timing

Residuals are model minus observation. Apogee times retain each declared source
clock: no alignment or time warping was performed. `ready` qualifies declared
channels, units and references; it does not establish measured as-flown inputs
or an independently synchronized ignition clock.

| Exposed development case | Observed / modeled apogee, m | Apogee time error, s | Ascent RMSE through observed apogee, m | Measured burnout split |
|---|---:|---:|---:|---|
| Cosmic Cargo | 291.740 / 371.704216 | +0.530941 | 58.595 | Metadata 1.887 s |
| Mini DX3 | 854.549472 / 1173.936844 | +1.360527 | 232.861 | Blocked |
| Top Shot | 309.045864 / 301.626753 | −0.689395 | 25.427 | Blocked |
| Adventurer | 3197.291040 / 3040.364142 | −1.351592 | 139.978 | Blocked |

Cosmic's modeled motor burnout is 1.860 s: −0.027 s relative to the metadata
burnout. Modeled burnout-to-apogee duration is 6.124941 s versus observed
5.567 s, a +0.557941 s difference. A common additive source-clock offset cancels
from that duration; the metadata's event-definition comparability still needs
qualification. At observed burnout the model altitude residual is already
+32.548 m, increasing to +78.576 m at observed apogee. Powered and coast RMSEs
are 15.166 m (736 samples) and 67.309 m (2,149 samples). Thus the discrepancy is
already present during the qualified powered interval and grows through coast;
this does not identify a force, mass, motor or timing cause.

Mini DX3, Top Shot and Adventurer have no independently qualified burnout
event. Their Raven accelerometer-integrated velocity remains a sensor
diagnostic, not independent burnout evidence. Do not assign observed powered
versus coast errors from their model burn times or velocity peaks. Their
observed apogees come from sampled barometric maxima, with declared ft-AGL
and seconds conventions. Cosmic uses header-qualified ms/meters and metadata
events. Unknown recorder/ignition offsets affect all absolute timing comparisons.

Cosmic's geometry, flown mass/payload and weather remain uncertain. Mini's
geometry/protocol aggregate and certified curve are conditional on unmeasured
per-flight mass/CG and incomplete conditions. Top Shot and Adventurer retain
positive aggregate reconstructions with cylindrical dry inertia, source-linked
model/motor records, ISA pressure-altitude atmosphere, and assumed wind,
rail and recovery. Adventurer reaches Mach 1.0635. Cosmic is runtime PASS;
the other cases remain UNKNOWN for all runs. All reach touchdown. These flags
are model-domain outputs, not empirical accuracy ratings. Full-overlap RMSE
contains descent/recovery and should not drive ascent model choices.

## Controlled numerical cadence probe

Only `options.timeStep` changed from its default 0.01 s. Both 0.005 s and
0.0025 s were evaluated on each frozen baseline.

| Case | Δapogee at .005 s, m | Δapogee at .0025 s, m | Largest absolute Δapogee time, s |
|---|---:|---:|---:|
| Cosmic | +0.010285 | +0.008246 | 0.000087891 |
| Mini DX3 | +0.020500 | +0.015564 | 0.000097656 |
| Top Shot | −2.2e-12 | +0.002331 | 0.000009766 |
| Adventurer | −1.2e-11 | +0.011916 | 0.000019531 |

Burnout speed changes are at most 0.004723 m/s; rail-exit time changes are at
most 9.766 microseconds. These measured responses are much smaller than the
present apogee/timing discrepancies. They are not rigorous error bounds or an
observed convergence order: the sequence is not monotonic. The API controls
macro/event cadence while the adaptive solver's position/velocity/quaternion/
rate tolerances remain fixed at 1e-3/1e-2/1e-5/1e-3 and event-time search at
1e-5 s. Native source sets those constants internally in both ordinary and
event-refinement paths. No API exposes independent tolerance refinement.

## Synthetic one-parameter responses

Cosmic and Mini each received four positive 1% unit perturbations at default
cadence, with every other source input restored and hashed. These unit sizes
are local sensitivity probes, not inferred uncertainties. No fit, target search,
probability distribution or extrapolation to a residual-closing input was made.

| Source API manipulation | Coherence/invariants |
|---|---|
| Dry mass: each structural component `massOverride=baseline rollup mass×1.01`, `cgOverride=baseline local CG`; `masscomponent`/`parachute.mass×1.01` | Fixed geometry and component CGs; dry CG conserved to roundoff; dry cylindrical inertias ×1.01; motor unchanged; aerodynamic coefficient/CP tables unchanged. |
| Impulse: every `motor.thrustCurve[i].thrust×1.01`; `totalImpulse`, `avgThrust`, `maxThrust×1.01` | Fixed times and motor masses; actual curve integral ×1.01. Impulse-normalized depletion fraction remains unchanged at a fixed time. |
| Airframe Cd: `options.dragCdScale=1.01` | Existing production airframe branch only; canopy Cd, reference area, normal-force slopes and CP inputs unchanged. The current formulation also applies its drag projection and associated moment normally. |
| Duration at fixed impulse: every curve time and `burnTime×1.01`; every thrust ordinate, `avgThrust`, `maxThrust÷1.01` | Fixed motor masses and total impulse; curve integral conserved to roundoff. Thrust schedule, depletion and combined-CG timing change. This is not an additive clock shift. |

All baseline and synthetic motors pass production `validateMotorSpec`: ordered
times, zero endpoints, nonnegative finite thrust, peak bound, positive impulse
and wet/dry/propellant identity. Metadata rounding is preserved: Cosmic's
8.8 N s metadata differs from its 8.817238 N s integrated curve; Mini's
136.3014 N s metadata differs from 136.3014130555 N s. Production depletion
uses the integrated curve. No metadata normalization was hidden in a variant.

+1% dry mass adds 0.000378363 kg to Cosmic and 0.003447100 kg to Mini. Actual
liftoff masses change 0.060936288→0.061314651 kg (+0.621%) and
0.545710000→0.549157100 kg (+0.632%). This is not +1% all-up mass. The dry
inertia change is coherent with the current cylindrical approximation; it does
not qualify the true spatial inertia or a particular added hardware location.

Every source and wire changed path is listed in JSON; restoring only those
paths recovers the exact baseline canonical input hash. Actual before/after
apogee, burnout, rail exit and validity values are retained there.

| Case / +1% parameter | Δapogee, m | Δapogee time, s | Δburnout altitude, m | Δburnout speed, m/s | Δrail-exit time, s | Δrail-exit speed, m/s |
|---|---:|---:|---:|---:|---:|---:|
| Cosmic dry mass | −1.050372 | +0.004072 | −0.744266 | −0.582163 | +0.000381 | −0.034447 |
| Cosmic impulse | +3.602251 | +0.020918 | +1.255401 | +1.063678 | −0.000596 | +0.056460 |
| Cosmic Cd | −1.906229 | −0.025039 | −0.124888 | −0.214737 | 0 | −0.000301 |
| Cosmic duration | +0.250857 | +0.012275 | +0.969735 | −0.332112 | +0.001475 | −0.112215 |
| Mini dry mass | −3.331405 | +0.002900 | −1.602704 | −1.147161 | +0.000576 | −0.072383 |
| Mini impulse | +11.398453 | +0.043164 | +2.600875 | +2.003191 | −0.000908 | +0.113460 |
| Mini Cd | −6.101312 | −0.045439 | −0.161119 | −0.284469 | 0 | −0.000249 |
| Mini duration | +0.473611 | +0.011719 | +2.248535 | −0.431878 | +0.001143 | −0.119911 |

Duration also moves modeled burnout time +0.0186 s/+0.0200 s; every other
perturbation leaves burnout time fixed. For both cases the absolute response
ranking is impulse > Cd > dry mass > duration for apogee; Cd > impulse >
duration > dry mass for apogee time; impulse > duration > dry mass > Cd for
burnout altitude; impulse > dry mass > duration > Cd for burnout speed;
duration > impulse > dry mass > Cd for rail-exit time and speed. Rankings apply
only to these unit perturbations, cases, current method and operating point.

Impulse, Cd and dry mass therefore provide resolvable meter-scale local
responses, individually smaller than the current 80/319 m residuals. Similar
apogee responses can arise from different inputs or deficient physics; a single
apogee cannot identify four parameters. Adding an unsynchronized apogee time
still cannot identify four parameters and introduces another nuisance input.
The trajectories and outputs are coupled, and no rank/conditioning or real
uncertainty budget has been established. This ranking prioritizes measurement
value and method checks; it is not an apogee-fitting recommendation.

## Exact next work packets

1. **Numerical verification, independent of observations.** Build a native
   diagnostic harness from the frozen source into an external directory,
   preserving production preparation/loads and recording compiler/source/binary
   identities. Permit numerical controls only in generated diagnostic source,
   never the shipped kernel. First verify native defaults against the frozen
   WASM and stop on unexplained differences. Then use the same four inputs at
   macro cadence .01 s with tolerance vectors at 1, 0.1 and 0.01 times defaults:
   twelve total native flight calls including four defaults, after a new lease.
   Tighten both ordinary and crossing-refinement integrations, log accepted/
   rejected steps and preserve event order, state norms, termination and all
   metrics. In a separately approved eight-call event probe, keep the tight
   integration controls fixed and vary event-time tolerance 1e-6/1e-7 s on four
   cases. Compare differences to the coarse-cadence series; report plateaus or
   failure rather than fitting a convergence order. This separates integration,
   event search and display sampling. No new observations are needed.
2. **Analytic verification before interpreting that sweep.** Exercise the
   verbatim adaptive integrator/dense output on constant-gravity translation
   (`z=z0+v0t−gt²/2`, known apogee time/height), constant-acceleration rail
   crossing (`t=sqrt(2L/a)`), zero-torque constant-rate rotation and a linear
   damped oscillator with known state solution. Sweep tolerances and maximum
   steps separately; check dense event roots, attitude norm and force-axis
   conventions against analytic solutions. These numerical fixtures do not
   establish aerodynamic accuracy. The production whole-flight API cannot
   perform this isolation today; any diagnostic numerical seam needs its own
   review before execution and must not become a solver repair by implication.
3. **As-flown mass and motor discrimination.** Obtain independently documented
   dry/loaded masses, CG and recovery/payload configuration for each existing
   flight, retaining motor inclusion conventions. Compare a time-resolved motor
   trace/lot impulse and duration with ignition-synchronized rail-exit and
   burnout speed/altitude. The measured response signatures above predict
   stronger powered/rail changes from impulse/mass/duration than Cd. An
   independently timed burnout separates duration changes from a clock offset;
   weighing separates mass from thrust. Do not use Raven integrated velocity
   alone as independent truth. Source acquisition requires a separate packet;
   no outreach or acquisition was performed here.
4. **Coast drag/atmosphere discrimination.** First qualify clock and independent
   vertical speed/altitude through coast, plus pad pressure/temperature and wind
   profile. For a known mass and near-vertical segment, observed deceleration
   after gravity constrains drag per mass; compare at matched airspeed/density
   with uncertainty in attitude and sensor response. This can separate a motor
   impulse discrepancy from excess coast energy retention. Cd, density,
   reference area and attitude remain confounded without those measurements.
   Source-derived geometry/coefficient conventions must be checked before a
   coefficient-law proposal. No CP/Mach law is selected by this diagnostic.
5. **Frozen admission and decision.** Preserve these four cases as exposed
   development evidence; preregister any new admissible independent coefficient
   or flight comparisons, units, clocks, event definitions, operating envelope,
   uncertainty and rejection criteria before outcomes are read. Keep reserved
   evidence closed. Author a physical-method change only when analytic/source
   evidence distinguishes it, then report frozen predictions and independently
   review the change. Numerical smallness and improved development apogee alone
   are insufficient acceptance criteria.
