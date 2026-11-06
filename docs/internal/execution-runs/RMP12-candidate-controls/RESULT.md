# RMP12b candidate-only diagnostic controls — experiment complete, default failure retained

Planning base `803b76b5`; frozen contract/plan committed `2b56012`; implementation
`b8c4e39` + review fixes `d734bc3`/`3f40fcc`/`ab0dbb0`; sealed source `ab0dbb0`
(a descendant of `3f40fcc` — contains it). The experiment executed **exactly
once**: 7 profile + 1 legacy process attempts, 30 s kill/wait, **zero retries**,
fresh output directory, RUN-SEAL verified before every call. Two earlier checker
invocations failed in pre-flight before `output.mkdir` and before any native
process (rustc PATH; frozen-input path resolution); they consumed zero attempts
and are retained in [pre-seal-invocations](../../execution-runs/RMP12-candidate-controls/),
disclosing that their raw stderr was overwritten by later same-path logs.

## Result: the two interventions separate cleanly

Provisional software reserves (rail 1e-4 s, position 1e-2 m, velocity 2e-2 m/s;
NOT owner decision budgets):

| Case | Controls | Rail error | Position / velocity error | Mechanism | Reserves |
|---|---|---|---|---|---|
| A absent | inherited, no split | **1.050e-4 s** | 7.367e-3 m / 5.020e-3 m/s | 21 straddles | **FAIL** |
| B explicit | inherited, no split | 1.050e-4 s (≡A) | identical to A | 21 straddles | **FAIL** |
| C | inherited + knot split | **2.401e-6 s** | 1.503e-4 m / 9.256e-5 m/s | 21 clips | **PASS** |
| D | hundredth, no split | **1.245e-4 s** | 8.392e-3 m / 5.720e-3 m/s | 22 straddles | **FAIL** |
| E | hundredth + knot split | **2.401e-6 s** | identical to C | 21 clips | **PASS** |

F/G refusals matched their frozen reason/phase (fractional stage time at
t≈2.0000000000000013 s; tabulated-coverage rejection at t=0.057 s; both
`adaptive-endpoint-stage; speculative=true`). H legacy output byte-identical to
the frozen `f37d195f…` hash. Experiment integrity: **complete** — all eight
frozen dispositions matched, all seven request delta sets exactly equal the
frozen `caseDeltaSets`, no retries.

## Interpretation (bounded to this experiment)

1. **Under this single synthetic vertical case at 20 ms macro steps, the
   provisional rail/position/velocity diagnostic failures under inherited
   defaults are dominated by adaptive trials straddling piecewise-linear thrust
   knots — not by the absolute tolerance magnitudes.** Splitting trials at the
   knots with bitwise-exact endpoints removes a factor ~43.7 in rail error and
   ~49.0 in position error (44×/49× rounded), while 100× tighter absolute
   tolerances alone leave the failure.
2. **C and E are bit-identical physical reports** (post-hoc bit-aware
   comparison: zero changed leaves after stripping only `contentIdentity`/
   `activePolicies` and the `diagnosticNumerics` leaf; identities differ). The
   tolerance change was therefore **inert once knots were split — in this case**:
   with clipping active the error estimates never bound step selection. This
   does not establish tolerance irrelevance in other step/knot regimes.
3. **D is not evidence that tighter tolerances are harmful.** A and D committed
   samples are bit-identical through 0.20 s; D's only observed difference is one
   extra rejection near the 0.209 s knot (22 straddle events over 21 distinct
   knots, one duplicate at 0.209) which shifted the dt sequence. The A→D delta
   (+1.95e-5 s rail) is that one-rejection sequence effect — the confound the
   frozen plan acknowledged, not a tolerance-size conclusion.
4. The two plateaus must not be conflated: A/B/D share a straddle plateau
   (~5e-3 m/s velocity error at the .22–.24 s knots); C/E plateau near 9.3e-5
   m/s, close to the declared model-mismatch floor (9.80665e-6 m/s²) — C/E
   residuals are not pure numerical remainders.
5. The reference brackets a **numerical** root of the implemented stepping
   routine (fixed left-grid-state RK4 reintegration, ≤1e-8 s bracket), not the
   exact ODE root or a rigorous global bound. Manufactured crossing (same
   bisection routine) bracket 5.2e-9 s; coarse/fine reference deltas within the
   original frozen reference reserves; comparisons resolved.

## What this does NOT establish

- Not adaptive convergence order, a global/continuous error bound, or a
  universal knot rule: one case, one macro step (20 ms), one fixture.
- Not full-6D, canopy, continuous-peak, physical/source/empirical accuracy,
  native-WASM parity, installed-platform or mission qualification.
- **No production default change and no closed RMP12-C02.** The retained default
  failure is reproduced bit-for-bit (A report leaf-identical to the retained
  RMP12a output; `retainedDefaultFailureReproduced: true`). The passing optional
  configurations C/E never close it: a default/tolerance change needs separately
  reviewed evidence, broader applicable checks and RMP05 decision budgets.
- The nine-attempt RMP12a study and its 105.0167 µs failure remain untouched.

## Evidence and review chain

- Executed outputs: external-only `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp12-candidate-controls/run-1/`
  (result.json, attempts.json + per-attempt reservations, inputs/stdout/stderr,
  plan + seal copies, post-hoc analysis, pre-seal invocation record).
- [Post-hoc saved-output analysis](../../execution-runs/RMP12-candidate-controls/) —
  zero native calls: every recorded per-attempt stdout/stderr/reservation/input
  hash was recomputed against the raw saved bytes and matches (the legacy row's
  input hash is carried in its reservation, recorded as `not-recorded` in the
  ledger row rather than silently passed); missing files would report
  `missing-file`, never a vacuous pass; bit-aware C-vs-E row; burnout-event residuals per case (C/E:
  1.42e-4 m / 5.79e-5 m/s vs A: 6.93e-3 m / 3.18e-3 m/s, all at the declared
  1.86 s burnout); A/D divergence characterization.
- Review chain: contract ACCEPT after three focused rounds; implementation
  REQUEST_CHANGES (including a controls-injection blocker that would have burned
  the frozen budget) → fixes → ACCEPT; results/interpretation review
  REQUEST_CHANGES on two record-level claims → substantiated by the post-hoc
  analysis and corrected wording → focused re-review. Same installed model,
  fresh read-only sessions; independent authorship reasoning, **not** multi-model
  scientific consensus and not qualification. See [REVIEW](REVIEW.md).
- Mechanism evidence for every case (straddle/clip counts and times, dt-window
  trials, exact cut lists) lives in per-attempt stderr sidecars, outside the
  compared candidate reports; F/G record N/A with refusal reason.

## Honest limitations of the record

The two pre-flight failures' raw stderr logs were overwritten by later
same-path invocations; their tracebacks are summarized in the session record and
in `pre-seal-invocations.json` rather than reconstructed. `result.json`'s
top-level `"status": "pass"` means **plan conformance / experiment integrity
only**; `reserveStatus` keeps A/B/D failures visible and
`anyProvisionalReserveFailed: true` is explicit.

## Next concrete work

Candidate-only next steps (each separately reviewed): evaluate the knot-split
policy over additional macro steps/knot densities as a NEW frozen experiment
(the fifth split-with-dt-reset case also needs a new plan); decide whether a
reviewed default candidate policy proposal may proceed to broader RMP08–10/RMP05
evidence. RMP07 candidate calibration/consumer/status exposure and all
scientific/mission/team/platform/release gates remain open and unchanged.
