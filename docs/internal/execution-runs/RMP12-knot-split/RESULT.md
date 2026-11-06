# RMP12-knot-split — C1 + C3 implementation and bounded diagnostic result

Status: implementation complete; required tests pass; one bounded diagnostic
execution; **not self-accepted**. RMP12-C02 packet status, qualification and
budget conclusions remain the coordinator/reviewer decision. No register,
manifest, TASKS, acceptance, schema, reserve, seed or physics change.

## Source and identity

- Worktree `/home/ak/.paseo/worktrees/3s8t98rp/rmp12-knot-split`, branch
  `rmp12-knot-split`, base `c0140d4`; changes left uncommitted for review.
- Lane: OpenRouter `deepseek/deepseek-v4.1-flash-1017`, reasoning `max`
  (`PI_PROVIDER`/`PI_MODEL`/`PI_REASONING_LEVEL`). No subagent or reviewer.
- Old WASM SHA-256 `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`
  (recorded RMP12-ensemble-determinism artifact).
- New WASM SHA-256 `688046089df012a0ee8307a34df8a5501d0b872776f4d4ae24be032a69b47fc7`
  (release build into target dir
  `/home/ak/.paseo/worktrees/3s8t98rp/target-knot-split`, copied to the
  gitignored `src/engine/astraea_engine.wasm`).
- Old profile example SHA-256
  `bf18b6faadaa180a9a31f4ef7be50d57aec609ee0a1beb5acbbe5aa1a0cb7e5c`.
- New profile example SHA-256
  `dcf3a2b05934914f18e96d569a406e62e987c8cb915593893c44a0cc893298ea`
  (`CARGO_TARGET_DIR=/home/ak/.paseo/worktrees/3s8t98rp/target-knot-split`).
- Candidate identity: inherited `inherited-candidate-driver-numerics/2.0.0`;
  explicit `candidate-native-diagnostic-numerics/2.0.0`; envelope/descriptor
  include `splitAtThrustKnots`, `knotCutPolicyId` and `eventRootWidthS=1e-7`.
  New absent-control digests: native
  `80c447b8426ef64fa93509dbc07e75bba1859c01bbdfa586f0e7da8b9ffdb1b4`, profile
  `5e07b4b7cbfbee2e56a17d34e4c2707543a34f41b38cddc7d5534e3518524769`.
  The old RMP07a digests `2fa123…` / `4bc2cb…` remain in that record as
  historical identities; they are inactive by design, not rewritten.

## What changed

1. `thrust_cut_times` is the single normalized cut list: exact
   `MotorSpec.thrust_curve[i].time` plus `burn_time`, finite, `total_cmp`
   sorted, bitwise deduplicated, burnout exactly once. The validator still
   rejects unsorted/duplicate/non-finite/endpoint-bad curves; the helper is
   independently tested for unsorted, duplicate and empty curves.
2. `integrate_rigid_adaptive` always receives the cut list. It clips the
   proposed trial to the first knot strictly inside `(t, next_time)`, so no
   accepted step or RK stage contains a knot strictly inside. The macro
   `t += dt` grid, telemetry cadence and committed sample counts are unchanged.
   Absent diagnostics select split on; explicit `splitAtThrustKnots:false` is
   the legacy no-split arm.
3. Anti-stall guard: a knot within
   `EPSILON * max(1, |t|, |t_end|)` of `t` is coincident (no split); a knot at
   exactly `t` is skipped; no zero/near-zero step. Tested at `t`, `t+1e-18`,
   `t+1e-12` and an interior knot.
4. `EVENT_ROOT_WIDTH_S = 1e-7`; `refine_crossing` reports the bracket midpoint
   and state there. The crossed endpoint is returned separately and used only
   for simultaneous-tie predicate checks, so the reported midpoint is never
   silently treated as a predicate-satisfied state.
5. TS mirror: optional sorted `cutKnots` in `rigidBody.ts` (default empty);
   `sixDofSimulator.ts` passes the active stage's global cut list and uses the
   same 1e-7 midpoint in `refineCrossing`. The engine 1e-9 oracle test still
   passes without a tolerance change. State-tabulated Mach/atmosphere/wind
   breakpoints are not cut; see residual risk.
6. Identity and sidecar: policy IDs bumped and the envelope now binds the
   split flag and root width; the sidecar reports `adaptiveTrialTotals`
   (accepted/rejected/trials), effective split, clips, straddles and root
   width. Old 1.0.0 records are untouched.

## Diagnostic rows (one recorded external execution; no retried attempt)

External raw evidence:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp12-knot-split/run-1/`
(inputs, stdout, stderr, `rows.json`; harness
`docs/internal/execution-runs/RMP12-knot-split/run_rows.py`; test logs under
`.../test-logs/`). The reference is the retained independent RMP12b vertical
reference loaded by exact path; no physics code was added here.

Provisional RMP12b reserves: rail `1e-4 s`, position `1e-2 m`, velocity
`2e-2 m/s` (not owner budgets). `δs` is the de-biased along-rail displacement
at the **reference** rail event time; `maxPos`/`maxVel` are the maxima over
committed samples/events.

| Row | split | rail error | maxPos | maxVel | δs | trials (acc/rej) | wall |
|---|---|---|---|---|---|---|---|
| A-dt020 (new default) | on | **3.2806 µs** | 0.150254 mm | 9.256e-5 m/s | 0.042895 mm | 228 (228/0) | 0.040 s |
| A-dt010 (new default) | on | **2.8229 µs** | 0.131029 mm | 8.130e-5 m/s | 0.036729 mm | 425 (425/0) | 0.073 s |
| A-dt005 (new default) | on | **2.8229 µs** | 0.131029 mm | 8.130e-5 m/s | 0.036729 mm | 442 (442/0) | 0.131 s |
| C-dt020 (explicit split) | on | **3.2806 µs** | 0.150254 mm | 9.256e-5 m/s | 0.042895 mm | 228 (228/0) | 0.041 s |
| F-dt020 (split off) | off | **113.6749 µs** | 7.366790 mm | 5.020e-3 m/s | 1.487393 mm | 207 (207/0) | 0.039 s |
| OLD-A-dt020 (old binary) | off | **105.0140 µs** | 7.366790 mm | 5.020e-3 m/s | 1.487388 mm | unavailable | 0.041 s |

- A20 and C20 are physically identical after stripping only
  `contentIdentity`, `activePolicies` and `effectiveInputs`; the explicit split
  control is the same default policy. Their stdout hashes differ only because
  the identity envelope differs.
- F20 and OLD-A20 share the no-split trajectory (`maxPos`/`maxVel` and δs
  agree); the old binary reproduces the recorded A20 stdout
  `ced63cf42a93ca4a8019f484caacf3e37eb00b1bfc2a4425d061b978baddf98c`
  bit-for-bit. The new F20 stdout is
  `3cd5ad67…`; A20 is `496a38a5…`; C20 is `8d4f9708…`.
- Trial cost: the A20 pair is the direct comparison: 228 vs 207 accepted
  trials (+21, +10.1%) and 21 clips vs 21 straddles; the [0.18, 0.25] s trial
  window grows from 8 to 11 attempts. A10/A5 are 425/442 trials; the old
  sidecar did not record accepted/rejected totals, so no old ratio is claimed.
- Wall time is one debug example process per row, including startup; the A10/A5
  outputs are larger (more committed samples), so the 0.073/0.131 s values are
  not a pure split cost.

## Correction to the dispatch expectations

The dispatch carried the old upper-endpoint/diagnosis figures. The correct
reading is:

- Split A20 is **3.2806 µs**, not 8.08 µs. The old C20 upper endpoint was
  0.5058691406250002 vs the reference midpoint 0.5058667328 (+2.401 µs), with a
  5.68 µs upper-endpoint overshoot (event altitude 3.000074326 m); the true
  crossing is 3.28 µs before the reference, which the C3 midpoint now reports.
  The old 8.08 µs (and 0.106 mm) added the event-height offset and the reported
  time offset, double-counting the same overshoot. The corrected event δs is
  **0.042895 mm**; the trajectory max position is **0.150254 mm** (a different,
  retained max-over-samples quantity).
- No-split under C3 is **113.6749 µs** / **1.487393 mm**, not 105.014 µs. The
  old binary reproduces 105.0140 µs / 1.487388 mm bit-for-bit; the difference
  is the old upper endpoint (8.66 µs) and the new midpoint. The 105.014 is
  retained as the legacy headline, never as the new target.
- The split is still the dominant intervention: no-split → split is
  ~34.7× on the reported rail error (113.6749 → 3.2806 µs), ~49.0× on max
  position (7.36679 → 0.150254 mm) and ~54.2× on max velocity
  (5.020e-3 → 9.256e-5 m/s). The old C20 comparison (2.401 µs) was the
  upper endpoint, not a lower-error estimator.

## Review follow-up: event-time parity assertion

The two Rust engine fixture tests changed only the flight-duration comparison.
Confirmed from the diff and the passing checks:

- (a) `src/engine/engine.test.ts` is untouched: `git diff -- src/engine/engine.test.ts`
  is empty, its `expectClose` remains `1e-9 * max(|b|, 1)`, and the TS engine
  parity/ensemble/classified-ledger run passed 20/20. No tolerance was relaxed
  there.
- (b) Apogee/trajectory parity remains `1e-12`: both `telemetry_parity.rs` and
  `drag_cd_scale_parity.rs` keep `rel_apogee <= 1e-12`; the full telemetry
  series and freeform parity keep their 1e-9/1e-12 comparisons; the
  `zero_wind`/`flight_provider`/`models` 1e-6 pins passed. The duration change
  does not alter any trajectory value in those tests.
- (c) The new bound is tight: `refine_crossing` reports the midpoint of the
  final bisection bracket whose width is at most `EVENT_ROOT_WIDTH_S = 1e-7`;
  each midpoint is within `w/2` of the true root, so two independent bisections
  of the same root can differ by at most `w`. The observed TS/Rust duration gap
  is ~2.1e-9 s (drag), far below `w`; a real trajectory divergence that moves
  the event time by more than `w` would still fail. The old `1e-12` was not an
  event-time accuracy claim: it held because the old code returned the upper
  endpoint, a coarse dyadic value. The apogee and full-series comparisons still
  bound the trajectory itself at 1e-12/1e-9.

Cost and residual risk (also stated above): the direct A20/F20 pair is **+21
accepted trials / +10.1%** (228 vs 207), with 21 clips vs 21 straddles; A10/A5
are 425/442 trials with 0.073/0.131 s debug-example wall time (not a pure split
cost). Only time-tabulated thrust knots are cut; Mach Cd/normal-slope, 11 km
atmosphere and wind-shear breakpoints are state-dependent and remain unsplit; a
transonic/high-altitude fixture is the direct incompleteness falsifier.

## Checks

- Rust core: 223 passed, 0 failed
  (`tests` log `core-tests.log`; isolated target dir, jobs 2).
- Rust engine: 43 lib + 5 + 10 + 1 + 3 + 6 + 7 + 4 + 8 + 11 + 2 = **100
  passed**, 0 failed (`engine-tests.log`). The parity fixtures
  (`telemetry-parity`, `drag-cd-scale-parity`, `freeform-fin-parity`) were
  regenerated from the TS mirror; `telemetry_parity`/`drag` event-time
  assertions now use the declared 1e-7 root width while apogee/trajectory
  assertions remain at 1e-12. This is a C3 root-uncertainty correction, not a
  trajectory-tolerance relaxation.
- TS: adaptive+simulator 49, engine parity+ensemble+classified ledger 20,
  Monte Carlo/pool 32, console/application 22; all passed
  (`ts-*.log`). The engine 1e-9 oracle test passed with no tolerance change.
- Static fixtures: the new WASM is the invoked artifact; no stale old WASM was
  used. Old archives, old experiment records and old engine SHAs were not
  rewritten.

## Consumers whose output identity moved

All default `simulate_flight`/candidate event times and states: `SimEvent`
time/altitude/velocity, `apogee_time`/`apogee_position`, `touchdown_tau`,
`flight_time`, terminal telemetry sample, landing state/metrics, final state;
candidate `finalTimeS`, `landing.timeS`, `apogeeEvent.timeS`, `events[].timeS`,
`serviceEvidence.railEventTimeS`, profile reports; `roots[].time` selection
and effective-time logic; `fold_prefix` boundaries; the simultaneous-tie
predicate path; candidate content identities and mechanism sidecars; the
TS/Rust flight parity fixtures and telemetry-parity series; the reported
engine WASM SHA and the ignored built WASM; the TS simulator trajectories used
by Monte Carlo/console tests. The old 1.0.0 policy IDs, old WASM SHA, old
profile binary SHA and old RMP07a/RMP12 records remain unchanged.

## Remaining risk and incompleteness evidence

- The split covers only **time-tabulated thrust** breakpoints. Mach-dependent
  Cd/normal-slope tables, the 11 km atmosphere branch and wind-shear
  breakpoints are state-dependent and not cut; a step crossing one can still
  kink the derivative. The C6 fixture reaches only low Mach; a transonic or
  high-altitude fixture is the direct falsifier for incompleteness.
- The max position error remains 0.150254 mm and max velocity 9.256e-5 m/s,
  consistent with the retained model-mismatch floor; the split does not remove
  model/reference mismatch. The A20/A10/A5 rows are one synthetic vertical
  fixture; no convergence order, global bound or physical qualification is
  claimed.
- The event root is reported at a 1e-7 s midpoint; TS and Rust event times can
  differ by up to that numerical root width (observed ~2e-9 s at dwell), not
  because the trajectory differs.
- Old calibration fits bound to old engine SHAs become inactive by design.
  New WASM/identity must be recorded by dependent consumers; the old archives
  are not rewritten.
- No owner budget decision, no RMP05 allocation, no full-6D/canopy/empirical
  qualification, no production release claim.

## Next

Coordinator review/integration decision; RMP12-C02 status and any budget/
qualification interpretation remain outside this lane. The direct follow-up
is a transonic/Mach-knot fixture or an explicit statement that state-tabulated
breakpoints are outside the approved C1 scope.

## Evidence

`EVIDENCE.json` in this directory (source hashes, artifact hashes, row
summary, test counts, external paths); raw inputs/stdout/stderr/rows and test
logs in the external evidence directory above. The recorded external execution
ran each row once with no retried attempt; earlier ad-hoc inspections are not
evidence and are not used for any claim.
