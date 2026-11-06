# RMP12c frozen design contract — knot-split regime expansion

Planning base `1695382c6fbb4eda0e05f58b36d8b8bfd17d6cce`. This contract authorizes
only its reviewed bounded experiment, not a default change or numerical/
physical qualification. RMP12a's nine-attempt failure and RMP12b's accepted 2×2
result remain immutable history. **No new native experiment has run.**

## Question

RMP12b established, on one synthetic vertical case at 20 ms macro steps, that
provisional rail/position/velocity diagnostic failures under inherited defaults
are dominated by adaptive trials straddling thrust knots (splitting: rail
1.050e-4 → 2.401e-6 s) and that 100× tighter tolerances alone do not help.
RMP12a data at 10/5 ms (different binary era) showed no-split rail errors around
1.71e-5 s (passing). Does the knot-split effect persist across macro steps, and
is the no-split failure a coarse-macro-step phenomenon?

## Frozen matrix (6 profile + 1 legacy process attempts, zero retries)

Anchor `A-dt020` is byte-identical to RMP12b's `A-inherited-absent` request
(same frozen BASE-INPUT). All cases keep horizon 2.0 s, 90° rail, same motor
knots, same reference and **same provisional reserves** as RMP12b.

| Case | Controls | Macro | Expected |
|---|---|---|---|
| A-dt020 | absent (inherited, no split) | 20 ms | prefix-success; **stdout byte-identical to run-1 A** (determinism) |
| C-dt020 | inherited + knot split | 20 ms | prefix-success; stdout byte-identical to run-1 C (determinism) |
| A-dt010 | absent | 10 ms | prefix-success; reserves observed, not promised |
| C-dt010 | inherited + knot split | 10 ms | prefix-success; reserves observed |
| A-dt005 | absent | 5 ms | prefix-success; reserves observed |
| C-dt005 | inherited + knot split | 5 ms | prefix-success; reserves observed |
| H-legacy | legacy request | — | stdout byte-identical to frozen `f37d195f…` |

`caseDeltaSets` (relative to A-dt020): A-dt020 `[]`; C-dt020
`["diagnosticNumerics"]`; A-dt010/A-dt005 `["candidate.launch.timeStepS"]`;
C-dt010/C-dt005 `["diagnosticNumerics", "candidate.launch.timeStepS"]`. Same
fail-closed alias (`diagnosticNumerics` → `candidate.diagnosticNumerics`) and
exact-set checks as RMP12b; per-attempt ledger records request hashes and
enumerated delta sets.

## Controls, reference and reporting (unchanged from RMP12b)

- Same sealed native example binaries (engine/core unchanged since RMP12b);
  same toolchain; same RUN-SEAL protocol; fresh output directory; 30 s
  kill/wait; durable pre-spawn reservations; no retries; no extra CLI calls.
- Same independent vertical reference equations (byte-identical gate), same
  bisection-from-left-state rail root (≤1e-8 s bracket), 200 µs/100 µs grids,
  manufactured crossing control; reference-control failure ⇒ comparisons
  unresolved (no third grid).
- Per case: every committed sample/final/rail/burnout state vs reference; max
  position/velocity errors; rail-time error; transverse/rate/quaternion
  symmetry; model-mismatch floor (9.80665e-6 m/s²) beside every residual;
  mechanism sidecar (straddle/clip counts and times, dt window, cut list).
- Cross-case table: error vs macro step for A and C separately, and the
  paired A/C deltas per macro step, with committed sample counts beside maxima.
  Include candidate rail-event time, the containing committed interval (derive
  the two nearest bracketing samples, not the entire ±20 ms diagnostic window),
  configured refinement-width limit (1e-5 s, NOT an observed final bracket), and
  the separate reference-root bracket. The reused binaries do not expose final
  candidate refinement brackets, total adaptive trials or integration-call
  counts: report these as unavailable, never infer them from sample counts.
  Report global straddle/clip counts as raw events, not rates. As a bounded
  denominator already exposed without instrumentation changes, also report
  every trial starting in [0.18,0.25] s (stepWindowTrials count) and the subset
  of straddle/clip events starting in that window. This denominator is local
  only; no normalized full-flight trial-rate or efficiency claim is permitted.
- Determinism rows compare raw stdout bytes to the frozen run-1 hashes
  (A: `ced63cf42a93ca4a8019f484caacf3e37eb00b1bfc2a4425d061b978baddf98c`,
  C: `bab6133971df1d84517e0fa179dc28d22c4f1b8a2ac900583e1b7695956408f8`).
  A mismatch is a reported failed attempt, never regenerated. Before any
  reservation/spawn, check round-trip serialization of BASE-INPUT
  (`json.dumps(..., indent=2) + "\n"`) and both 20 ms request hashes against
  run-1's recorded input hashes: A `f790a247…`, C `70711ea6…` (full values in
  EXPERIMENT.json). The prior attempts ledger hash and anchor row IDs are
  bound in that plan; anchor provenance is not inferred from output equality.

## Interpretation boundaries (frozen before execution)

- The A-series probes macro-step specificity; the C-series probes knot
  splitting at the three declared steps only. Within-series trends conflate
  integration error, event service, knot/grid alignment, straddle population
  and the different sample sets used for maxima. Only paired A/C changes at a
  fixed macro step isolate the split intervention for this fixture, including
  its dt-sequence effects. Unavailable global trial/call denominators prevent
  full-flight normalized mechanism/efficiency comparisons. Neither series
  establishes convergence order, a global error bound, or a universal rule.
- Passing configurations never close the retained 20 ms default failure or
  RMP12-C02. In particular, A-series passes at 10/5 ms are not a macro-step
  default recommendation. Any default-policy proposal (including macro step)
  needs broader RMP08–10 evidence and RMP05 decision budgets. Provisional
  reserves remain software diagnostics.
- D/E (tolerance arms) are NOT rerun: their findings are bounded to RMP12b's
  20 ms regime; no claim extends them to other regimes.
- Integrity (7/7 dispositions, seals, delta sets, determinism rows) is reported
  separately from per-configuration reserve status; no aggregate green.

## Process and resources

Read-only contract review before implementation; separate review of the runner
implementation; RUN-SEAL binding plan/contract/sources/checker/binaries/toolchain
before any call. The runner verifies the concrete pinned hashes of both
check-candidate-controls.py and check-candidate-numerics.py before executing
any dependency code; it loads the former by exact resolved path via importlib
(no sys.path insertion/shadowing) and runs its equation gate before comparisons.
The checker is read-only; the new runner owns the matrix, attempt accounting
and cross-case tables. Verify the whole seal once at startup, then rehash the
binary and actual serialized input for every durable reservation before spawn.
Pre-flight failures before the first reservation consume zero attempts; retain
unique invocation logs and disclose them rather than overwriting or hiding them. ≤2 compiler jobs; serial reviewers;
no push/release/outreach/holdout/protected data/automation restart; no engine/
core/physics/default changes of any kind.
