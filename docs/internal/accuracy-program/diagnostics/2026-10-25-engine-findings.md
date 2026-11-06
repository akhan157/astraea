# ENG-D1: matched CP paths and bounded timestep sensitivity

**The two CP paths disagree at identical geometry and Mach. A signed transition
term is lost in flight preparation, separately from the differing Mach laws.**
Refining the two tested development flights' macro step changes apogee by
centimeters, while their existing conditional discrepancies are tens to hundreds
of meters. These findings justify a signed-algebra repair proposal and further
coefficient-definition work, not selecting a Mach law or fitting apogee.

Source base: `d3afdf1e06d7f51f1d1fd33c74652fca4ff9564f`. The unchanged production
WASM is `/workspace/astraea/src/engine/astraea_engine.wasm`, SHA-256
`e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985`.
The adjacent [CP JSON](2026-10-25-engine-cp.json) and
[timestep JSON](2026-10-25-engine-convergence.json) record source hashes, inputs,
model conventions and results. No production source changed in this packet.

## Matched-condition experiment

The [reproducible harness](../../../../scripts/diagnostics/engine-cp-convergence.mjs)
reads production-WASM `stability` contributions and `aero_curves`. It recreates
the exact positive-only preparation split in engine `models.rs:469–486`, then
executes the **verbatim extracted Rust** `normal_slope_at_mach` in a tiny native
scalar harness. The extracted function SHA-256 is
`0d6c6c7329dac76664542375a561070e39f9b933cf41ed07361afc35adb837bc`.
This is an exact-source reconstruction, **not production in-flight telemetry**
or an independent binary-to-source attestation. A separate TS loads oracle
cross-checks the scalar and its moment application.

Both stations are meters aft of the same nose datum. Each comparison uses the
same complete vehicle, Mach, combined motor/airframe CG, sea-level ISA,
coasting motor time, zero rates/cant/wind, no recovery and no rail constraint.
The Mach sweep is 0, 0.3, 0.8, 1, 1.1, 1.2, 1.4, 1.5, 2, 3 and 4; the local
incidence sweep is 0, 1, 5, 10 and 15 degrees. These are controlled local states,
not necessarily reachable trajectory points. Neither CP scalar accepts AoA;
the sweep checks the force/moment application, not measured CP-versus-AoA.
At Mach zero the aerodynamic force vanishes and incidence is undefined; the
reported scalar is a coefficient limit, not an observable force station.

| Mach | NASA preset curve CP, m | Flight scalar CP, m | Difference, calibers |
|---:|---:|---:|---:|
| 0 | 2.409175 | 2.409175 | 0 |
| 0.8 | 2.432956 | 2.409175 | +0.156455 |
| 1.4 | 2.511470 | 2.409175 | +0.672996 |
| 2 | 2.374975 | 2.211735 | +1.073947 |
| 4 | 2.357875 | 1.802413 | +3.654353 |

The nominal reference diameter is 0.152 m. The curve increases selected fin
weight through its swept-normal-Mach finite-wing expression, then applies a
separate forward-shift heuristic above Mach 1 (`aero.rs:1577–1596,1950–1990`).
Flight keeps its slopes fixed through Mach sqrt(2), then reduces all fin
contributions using `min(1,1/sqrt(M²−1))` (`six_dof.rs:1223–1242`). Both describe
overlapping conditions. This probe establishes arithmetic disagreement; it does
not establish either as physically superior. Multi-fin, elliptical-fin and
special ARCAS-rake cases were not tested.

The synthetic boattail control replaces the NASA preset's equal-diameter
transition with 0.152-to-0.120 m contraction and changes its downstream booster
diameters to 0.120/0.113 m. Its reference diameter becomes 0.120 m; compare
calibers within each vehicle. At Mach 0 its curve CP is 2.446661445 m while
flight is 2.390571723 m: +0.056089722 m or +0.467414350 calibers. Its signed
Barrowman transition contribution is CNalpha = -1.208888889 at 1.457647059 m.
Stability retains that force and first moment; flight preparation discards it.
The signed stability sum is 20.107110923 /rad, while flight's retained positive
sum is 21.316 /rad. This is a method-conformance defect independent of the
transonic-law question. The modified geometry is an analytic diagnostic, not a
qualified flown configuration.

The extracted Rust CP matches the TS local-load CP within 4.45e-16 m; slope
agreement is within 7.11e-15 /rad. The pitch moment identity residual is
2.05e-12 N m. For positive pitch-plane incidence the actual implemented law is

`M_x = (CP - CG) * [q S CNalpha sin(alpha) + D sin(alpha)]`.

Here `D` is wind-axis drag magnitude. Flight applies its CP arm to the full
body-transverse force, including drag projection (`six_dof.rs:1422–1474`). The
probe records both force terms; its CP-only substitution holds flight slope,
drag and CG fixed. That substitution is a mechanical sensitivity, not a
self-consistent alternative model or a measured trajectory delta. Dividing
moment by the normal contribution alone would introduce the extra factor
`1 + CD/CNalpha`. Curve margins use dry CG; these CP comparisons do not substitute
that margin for the flight's combined-CG arm.

## Macro-step refinement at fixed adaptive tolerances

Six sequential production-WASM flights used frozen existing Cosmic Cargo and
Mini DX3 reconstructed inputs at macro steps 0.020, 0.010 and 0.005 s. No raw
outcomes were reread and no input, coefficient or fit was adjusted.

| Case | Apogee at .020 s, m | At .010 s, m | At .005 s, m | Full tested spread, m | Default-to-fine delta, m |
|---|---:|---:|---:|---:|---:|
| Cosmic Cargo | 371.685178 | 371.704216 | 371.714501 | 0.029323 | +0.010285 |
| Mini DX3 | 1174.011109 | 1173.936844 | 1173.957344 | 0.074265 | +0.020500 |

Default-step apogees reproduce the existing D3 results. Default-to-fine apogee
time changes are +0.000087891 s and +0.000097656 s. Burnout-speed changes are
+0.004474093 m/s and +0.004722462 m/s; rail departure-speed changes are below
8e-15 m/s. Every run terminates at touchdown. Cosmic retains native `PASS`,
Mini DX3 retains `UNKNOWN` and `offNominalExcursion=true` at all steps; native
validity is not empirical qualification. Mini's native event list has no apogee
event although the scalar apogee output is present; that pre-existing event
behavior was not diagnosed by this packet.

The adaptive DP5(4) tolerances remain `r=1e-3 m, v=1e-2 m/s, q=1e-5,
w=1e-3 rad/s` (`six_dof.rs:1765`); each macro interval uses maximum adaptive
step `min(.05, interval)` and initial step `min(.005, interval)` (`:1820`).
Event refinement uses the same tolerances and a 1e-5 s bracket-width target
(`:2441–2466`). This experiment refines the macro bracket and associated maximum
internal step, not adaptive tolerances or the root target. It demonstrates
limited timestep sensitivity across this range, **not a general solver
convergence proof, asymptotic error bound or empirical accuracy**. Mini's
apogees are not monotone under refinement. Relative to the previously exposed
conditional +79.964 m/+319.387 m apogee residuals, these particular changes
provide no evidence that macro-step refinement alone explains the discrepancy.

Cosmic's flown mass/geometry/weather remain uncertain; Mini's individual flown
mass/CG and conditions remain conditional. Their input clocks, reconstruction,
reference atmosphere and motor assumptions remain those of D3. A nominal
near-vertical development run does not isolate a CP correction from propulsion,
mass, axial drag or attitude errors. No new holdout was selected or inspected.

## Next scientific question and scoped repair proposal

First preserve signed component force slopes and their nose-datum first
moments through actual production preparation and loads. Carry body/fin sums
`B, JB, F, JF` directly, without dividing either group's moment by its slope.
The existing signed Barrowman transition formula and linear force/moment
superposition support this repair; see the coordinator's independent scientific
review at `/workspace/astraea-plan/evidence/2026-10-25/cp-scientific-review.md`.
Keep the current flight Mach factor and drag/moment definition. Define explicit
finite/near-zero/nonpositive total-slope failure before using a derived CP arm.
Use a native diagnostic evaluator calling actual production preparation and
loads, analytic component-sum/moment-translation cases, and frozen four-case
before/after predictions to qualify the implementation. No repair is included
in this diagnostic commit.

Separately, **does the adopted CNalpha mean total body-normal force or an
additional normal force alongside wind-axis drag, and what consistent CNalpha
and moment-derivative law is supported versus Mach/AoA?** The relevant comparison
needs force and moment derivatives together, with fixed reference area, datum,
axes and motor/CG conventions. Neither CP agreement nor apogee improvement can
choose a physically supported law.

After numerical and signed-algebra isolation, preregister bounded input
perturbations from existing measurement uncertainty: dry mass and CG separately,
thrust impulse/time shape separately, axial Cd scale, fin geometry and launch
wind/angle. Record sensitivities of rail departure, burnout altitude/speed and
apogee; do not infer measured uncertainty ranges or fit an input to the outcome.
Without independent flown mass/motor/attitude observations, that design can
identify conditional sensitivity and confounding, not uniquely attribute the
current apogee residuals.

## Reproduction, checks and resource accounting

From the worktree, source `/workspace/astraea-plan/env.sh` and use the existing
`node_modules` symlink. No install, Cargo build, WASM build or broad suite was
run. The scalar `rustc` compilation is confined to temporary harness source,
which is deleted on completion.

```sh
node scripts/diagnostics/engine-cp-convergence.mjs cp
node scripts/diagnostics/engine-cp-convergence.mjs convergence
```

The CP command passed in 2.102 s, largest-child RSS 948,616 KiB. Initial plumbing
attempts found absent `/usr/bin/time` and a scalar-harness stdin EOF timeout;
using Python resource accounting and argv input resolved these. No flight ran
in those failed CP attempts. Vite emits an unused HMR socket EPERM message even
with HMR disabled; module execution and all assertions completed.

The first six-flight refinement run passed in 2.847 s, largest-child RSS
972,880 KiB. It mistakenly serialized nonexistent `event.type`, retaining only
event times. A coordinator-authorized six-flight repeat corrected serialization
to native `event.name` and added actual validity fields; it passed in 2.897 s,
largest-child RSS 972,024 KiB. The reported deterministic flight scalars did not
change. Total simulation count is twelve, not six. RSS is the largest child,
not aggregate process RSS. Both leases are released; no processes remain.

The harness assertions validate reconstruction agreement and the matched moment
identity. They do not test a numerical source change, since there was none.
This packet does not pass a numerical-accuracy, release or competition gate.

### Baseline reproduction after subsequent repairs

The scalar harness above depends on the pre-repair preparation/function layout.
Run it from the diagnostic checkpoint `b4cc67d` with the matching unchanged
kernel source, rather than against later signed-assembly source. After a new
production WASM is built, set `ASTRAEA_DIAGNOSTIC_WASM` to the preserved artifact
`/workspace/astraea-plan/evidence/signed-contributions-20261025/before.wasm`.
The harness still asserts the original SHA-256; this override does not accept an
unrelated/new binary. The separate signed-repair evaluator records subsequent
production-source results without rewriting these baseline measurements.

Use the updated harness from the current integration checkout while the working
directory is a separate worktree at `b4cc67d`; the historical script itself
predates the environment override. For this managed workspace, for example:

```sh
cd /path/to/baseline-worktree-at-b4cc67d
ASTRAEA_DIAGNOSTIC_WASM=/workspace/astraea-plan/evidence/signed-contributions-20261025/before.wasm node /workspace/astraea/scripts/diagnostics/engine-cp-convergence.mjs cp /tmp/baseline-cp.json
```

The baseline worktree also needs the documented toolchain and existing Node
dependencies. The new output records the actually inspected source commit/hashes.
