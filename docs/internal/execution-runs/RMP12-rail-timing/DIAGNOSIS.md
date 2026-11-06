# RMP12-C02 rail-timing failure — read-only diagnosis

Author: DeepSeek V4.1 Flash 1017 lane `2af61f7a` at max effort, base `308ad43`,
worktree `rmp12-rail-timing`. No source edits, no build, no tolerance or
benchmark change. Transcribed by the coordinator; all numbers below are the
author's, derived from the sealed `A-dt020` run and `metrics.json`.

## 1. Origin of the 105.014 µs

The rail-departure root finder is not the cause. The reported number is an
upstream along-rail trajectory bias minus the root finder's upper-endpoint
overshoot:

- served event `t = 0.5057617187500001 s`, `altitude = 3.0001136534711517 m`,
  `speed = 13.081438656641536 m/s`;
- converged reference crossing `0.5058667327880859 s`, bracket `6.1e-9 s`
  (`bisect_from_left_state`, `scripts/diagnostics/check-candidate-controls.py:196-213`);
- height bias at the event `1.48705 mm`, matching the accepted `1.4870 mm` in
  `RMP12-native-reference/RESULT.md:37`;
- `1.4870 mm / 13.0782226 m/s = 113.70 µs` true path error;
- upper-endpoint overshoot `(3.0001136534711517 − 3.0)/13.0814387 = 8.688 µs`;
- `113.70 − 8.69 = 105.014 µs`. Independent estimates agree within 0.002 µs.

Mechanism: the 20 ms macro bracket lets 15 ms controller trials straddle the
thrust-curve slope kinks at 0.192, 0.209 and 0.231 s. The 0.209 s kink breaks
the slope from +176.2 to −126.2 N/s; the velocity error jumps
`1.09e-3 → 4.875e-3 m/s` over 0.20–0.22 s and the position error accumulates to
1.487 mm by rail exit. `EVENT_ROOT_WIDTH_S = 1e-5` and the sample grid cause
only the 8.69 µs overshoot; refinement re-integrates from the already-biased
0.5 s state (`six_dof.rs:2318, 2995`) and returns the bisection upper endpoint
`b` (`six_dof.rs:3002-3010`).

The identical 17.123 / 2.401 µs rows are shared step sequences and shared
dyadic bisection endpoints, not convergence plateaus — consistent with the
retained RESULT warning.

## 2. Measurability

Measurable, but only from the state bias, not the raw event time.

- Reference side: coarse/fine rail delta `0.0 s`, position delta `3.4e-13 m`,
  bracket `6.1e-9 s`; noise ≈ 0.01 µs. The recorded `9.80665e-6 m/s²` is a
  pointwise bound, not a propagated error floor (~0.1 µs even propagated).
- Candidate side: served time is the upper end of a bisection stopping at
  `1e-5 s`, a one-sided later shift in `[0, 9.77e-6] s`. Measured overshoots:
  A20 8.69, A10/A5 1.89, C20 5.68, C10/C5 5.21 µs.
- De-biased path errors: **A20 113.70 µs**, A10/A5 19.02, C20 8.08, C10/C5 7.61.
- The 100 µs reserve equals 1.3078 mm of rail travel; A20's 1.4870 mm is
  **13.70 µs over**. The retained FAIL stands and is worse than its headline;
  the 5.014 µs must not be read as a physical margin.

## 3. Candidate fixes (none admissible as an in-lane default change)

- **C1 knot-aligned trial splitting.** No RK stage crosses a slope kink.
  Measured: reported 105.014 → 2.401 µs, position 7.367 → 0.150 mm, velocity
  5.020e-3 → 9.256e-5 m/s. Cost: changes the step sequence, trajectory,
  telemetry and output identity; 21 extra clips; integrator-policy change
  requiring a reviewed contract, broader RMP08–RMP10 evidence and RMP05 budgets.
- **C2 5 ms effective cap.** A10/A5 pass with ~5× margin (19.02 µs path) but
  ~4× trials, still not discontinuity-aware, changes all outputs, and is weaker
  than C1 at higher cost.
- **C3 measurement honesty.** Tighten `EVENT_ROOT_WIDTH_S` to ~1e-7 s and return
  the midpoint. No trajectory change; reported A20 becomes 113.70 µs (still
  FAIL). Fixes future 5 µs-scale misreads, not the error.
- **C4 owner/RMP05 budget decision.** If the mission-derived rail budget is
  ≥114 µs the result may be inside the real budget, but the provisional 100 µs
  was still missed and this must be recorded as a budget change, never a waiver.

Rejected: reserve widening, special-casing A20/0.209/fixtures, tolerance-only
tweaks, bracket-only "fixes" (they enlarge the reported error), projected/chord
roots, event-state-only re-integration, rail length/predicate/physics changes.

## 4. Falsifiers

- Universal: measure `δs = z_candidate(event) − z_ref(event)`. A candidate
  leaving `δs ≈ 1.49 mm` is cosmetic. C1 must reach ~0.106 mm, C2 ~0.249 mm;
  C3 leaves `δs` unchanged and is therefore not a fix.
- C1: disable the split and the 105 µs / 1.49 mm must return bit-for-bit; test
  a different knot density or drag breakpoint.
- C2: knot spacing below 5 ms must still show `δs ≈ 1.5 mm` if the cap is not
  general; a sign flip without `|δs|` reduction is sequence coincidence.
- C3: after tightening, A20 must rise to ~113.7 µs; if it drops below 100 µs
  the fail was a bisection artifact.

## Bottom line

C02 cannot be honestly closed by a local event fix. The smallest real fix is
knot-aware splitting (or an equivalent discontinuity-aware controller), which
changes the committed trajectory and default identity and therefore needs a
separately reviewed default-policy packet plus owner/RMP05 budgets. Without
that, the retained FAIL stands; the only other admissible path is the owner's
budget decision.
