# RMP12a native reference experiment — completed, diagnostic FAILURE retained

Frozen contract `40fb607`; implementation `46e74e633c9e5f890ca9f1be64960b8703453ec0`, base `d77c0557ed60c4de4f6652b6e7676f4b9e3f2b6e`. **Exactly9/9 native calls executed once, no retry or threshold change.** One independent contract review ACCEPT before implementation/experiments. Independent implementation/results review ACCEPT for experiment integrity and interpretation, **including retained diagnostic failure**, not numerical qualification. Core/engine/numerical/default/production-WASM source unchanged.

## What actually ran

Independent Python vertical RK4 reference with exact piecewise-linear delivered impulse/depletion, first thrust-weight liftoff, E1 altitude-dependent isothermal/log-pressure density and prescribed CA0. Reference splits at liftoff, motor knots and requested comparison times;200us/100us reference refinement. Carrier drymass/S frozen from accepted synthetic metadata: not independent mass/geometry-rollup validation. Nine analytic/reference unit tests PASS; they execute zero native calls.

Fresh offline example build: `cargo build --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --example profile_candidate_flight -j2`, exit0(.03s,existing cache). Invoked executable SHA256 `fefe4b8cbc62371fe99317050d13d90145844a7f5b906f020e3ae9ed4a9429a2`. Experiment: `python3 scripts/diagnostics/check-candidate-numerics.py <that example> <new external run-1>`, exit1 because the frozen diagnostic reserve failed, not because results were omitted. Full inputs/stdout/stderr/attempt ledger and logs external `evidence-rmp12-native-reference/run-1/`; [portable complete metrics/hashes](native-result.json).

| Planned case | Result |
|---|---|
| horizon2.0s,macro20ms | Native bounded prefix completed; provisional rail reserve FAIL |
| horizon2.0s,macro10ms | All selected diagnostic reserves pass |
| horizon2.0s,macro5ms | All selected diagnostic reserves pass; plateau is not adaptive convergence |
| horizon2.003s,macro20ms | Native exact off-grid prefix completed; same rail reserve FAIL |
| horizon2.003s,macro10ms | All selected diagnostic reserves pass |
| horizon2.003s,macro5ms | All selected diagnostic reserves pass |
| horizon2.003s,macro10ms repeat | stdout byte-identical to its original, not general seed/chunk/cancellation proof |
| validity ends at launch+2s,request2.003s | Required fractional-expiry refusal with actual adaptive-endpoint-stage,time>2,speculative=true |
| launch at profile upper altitude100m,later ascent | Required altitude-coverage refusal with actual adaptive-endpoint-stage,time>0,speculative=true |

All committed samples, final states and rail/burnout scalar states were checked. Exact horizons, declared burnout1.86s and honest prefix semantics (no apogee/landing,unqualified physics/unknown dynamics) retained. Transverse/rate/quaternion symmetry checks passed. No continuous peak, full6D, canopy, adaptive-tolerance or WASM experiment was conducted.

## Failure and reference controls

- Rail error for both20ms runs: **0.00010501673039775561s**, exceeding frozen provisional **0.0001s**. Do not round it down, widen the reserve or mark C02 complete.
-10/5ms rail error:0.000017125523269267973s. Their near-identical states are a plateau under shared adaptive stepping, not an observed convergence order or global accuracy guarantee.
- Largest selected position error:0.007375894555089246m (20ms,off-grid); largest speed error0.005020062311348106m/s. Both within the frozen provisional.01m/.02m/s reserves.10/5ms max position about.001208583m and speed.000850506m/s.
- Reference refinement differences are at most about3.4e-13m,2.5e-13m/s and5.87e-9s rail **between these two numerical references**. They do not certify an exact/global error or independent physical measurement. The fine reference's rail interpolation bracket remains about100us; its interpolation estimate is not a bisection/proven root-error bound.
- Candidate negligible-aero substitution differs from the continuous-drag reference. Its pointwise acceleration bound is9.80665e-6m/s²; no unsupported propagated nonlinear trajectory bound is inferred.

## Saved-output diagnosis (zero additional native calls)

[Analysis](saved-output-analysis.json) reintegrates only the reference against already-saved native output times. Contact/liftoff residuals are small (20ms speed error at.06s about9.26e-5m/s). The larger speed bias accumulates around thrust-curve corners:20ms error at.20s=.0010903m/s,at.22s=.0048750,at.24s=.0050201;10/5ms peak about.0008505 near.21s.

The driver uses inherited absolute state tolerances r1e-3m/v1e-2m/s,q1e-5,w1e-3,initial adaptive step<=5ms and root bisection width1e-5s. It does not split every thrust interpolation corner. This evidence points to upstream integration/corner-partition error under inherited tolerances, **not proof that the root bisection width bounds true event error**. At20ms native rail service, height bias against the reference is.0014870m while its root overshoot above3m is only.00011365m. Tightening root time alone cannot remove an upstream trajectory bias. Exact adaptive-trial causal isolation was not instrumented; no sole-cause claim or source/default change follows.

## Independently reviewed check/parent dispositions

C01 pass for frozen complete reporting; C02 fail for this selected provisional native rail experiment; C03/C04 not_run; C05 in_progress for one byte-repeat only; C06 blocked on owner decision budgets/final model; C07 pass for unchanged source/default identities only. Parent RMP12 partial, not native/WASM or mission numerical qualification.

Next possible engineering is a separately reviewed candidate-only diagnostic-control/corner-partition experiment; do not spend additional unrecorded native calls or change defaults to make this provisional threshold green. Final tolerances/reserves require RMP05 actual mission/decision allocations and downstream finalized models. No old N1 rerun, protected outcome, source acquisition, build installation, app activation, push/release or automation restart occurred.
