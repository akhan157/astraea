# RMP12c — paired knot-split/macro-step investigation

**Experiment integrity complete; retained 20 ms default reserve failure.**
Independent saved-output results review **ACCEPT** (no material findings). This is one synthetic vertical 2 s
prefix, not complete-flight, adaptive-convergence, physical or release
qualification. No production/default change.

## Freeze, sources and execution

- Accepted contract commit `47908a8`; runner source `51611d1`; pre-execution
  seal commit `4a425f2`. [CONTRACT](CONTRACT.md), [EXPERIMENT](EXPERIMENT.json),
  [RUN-SEAL](RUN-SEAL.json), [review chronology](REVIEW.md).
- Same RMP12b native binary bytes and Rust sources; no Rust/default/tolerance/
  equation changes or production WASM rebuild. Checker dependencies loaded only
  after both pinned hashes pass. Independent software implementation review
  ACCEPT; 19 final pure/manufactured checks pass (zero native experiment calls).
- Exactly **6 profile + 1 legacy process attempts**, once, zero retries; fresh
  `run-1`, durable pre-spawn reservations/pending ledger, 30 s timeout per call.
  One experiment-checker invocation; no experiment pre-flight failure. Earlier
  unit tests used mocks/saved outputs, not hidden native probes.
- Both 20 ms request hashes and stdout hashes match RMP12b anchors; ordinary
  legacy stdout remains `f37d195f…`. All seven expected dispositions match.
- Primary runner recomputed **28/28** actual input/stdout/stderr/reservation
  hashes. Separate saved-output-only analysis verifies those again plus frozen
  plan/seal copies (**30/30**), reservation input/binary fields, sidecars, ledger
  vs original result and request echoes. No missing/not-recorded file passes.
- Coarse/fine reference controls pass for all six cases; max position difference
  ≤3.376e-13 m, velocity ≤2.416e-13 m/s, refined rail-time difference 0 on these
  grids. Manufactured crossing passes. These are implemented numerical checks,
  not exact-ODE/global error bounds. Comparisons are resolved.

## Frozen provisional outcomes

All errors are against the same independent vertical reference used in RMP12b;
maxima cover committed samples, final state and rail/burnout event quantities.
Reserves remain position 0.01 m, velocity 0.02 m/s, rail time 100 µs plus unchanged
symmetry/reference checks. **Not owner-approved mission decision budgets.**

| Case | Macro | Rail error (µs) | Max position error (m) | Max velocity error (m/s) | All provisional checks | Samples |
|---|---:|---:|---:|---:|---|---:|
| A-dt020 absent/no split | 20 ms | 105.014 | 0.00736679 | 0.00502006 | **FAIL rail** | 101 |
| C-dt020 inherited/split | 20 ms | 2.40119 | 0.000150254 | 0.0000925570 | pass | 101 |
| A-dt010 absent/no split | 10 ms | 17.1234 | 0.00120710 | 0.000850506 | pass | 201 |
| C-dt010 inherited/split | 10 ms | 2.40119 | 0.000131029 | 0.0000813012 | pass | 201 |
| A-dt005 absent/no split | 5 ms | 17.1234 | 0.00120710 | 0.000850506 | pass | 402 |
| C-dt005 inherited/split | 5 ms | 2.40119 | 0.000131029 | 0.0000813013 | pass | 402 |

The reference/model gravity mismatch is **9.80665e-6 m/s² pointwise** beside every
residual/check in the machine record; it is not a proved propagated state-error
floor or bound. Original result explicitly separates `integrityStatus: complete`
from `anyProvisionalReserveFailed: true` and retained default failure reproduced.

At fixed step, A/C rail-error ratios are **43.734×** (20 ms) and **7.131×**
(10/5 ms); position-error ratios **49.029×** and **9.212×**; velocity-error ratios
**54.238×** and **10.461×**. These are paired descriptive ratios for this fixture,
not convergence rates or performance guarantees.

## Mechanism/event/sample context

| Macro | Raw A straddle / C clip events (global) | A/C trial attempts starting in [0.18,0.25] s | A straddle / C clip events in that window |
|---|---|---|---|
| 20 ms | 21 / 21 | 8 / 11 | 3 / 3 |
| 10 ms | 21 / 21 | 14 / 16 | 3 / 3 |
| 5 ms | 21 / 21 | 14 / 17 | 3 / 3 |

Events are trial→first-interior-knot records, including rejected proposals,
not all possible interior knots. A straddles and C clips are different event
types. Global counts are raw events, not rates; only the specified window has a
trial denominator. Total adaptive-trial/integration-call counts are **unavailable
in the sealed binary**; no full-flight normalized rate/efficiency claim.

Candidate rail events: A20 0.5057617187500001 s, A10/A5
0.5058496093750002 s; C20/C10 0.5058691406250002 s, C5
0.5058691406250004 s. Nearest committed containing intervals are ~[0.50,0.52],
[0.50,0.51], [0.505,0.510] s respectively (unrounded values in metrics).
The **configured** refinement-width limit is 1e-5 s; actual final candidate
refinement brackets are unavailable. Separate reference brackets are retained
in the raw result, not misrepresented as candidate brackets.

Both 5 ms rows include 1.9999999999999793 s and exact 2.0 s as distinct samples,
hence 402, not 401 samples. Nothing is deduplicated/hidden. Sample-set maxima
and within-series trends conflate integration error, event service, knot/grid
alignment and straddle durations/populations. Equal global event counts do not
imply equal integration errors; local step sequences differ. Rail-error
plateaus from 10→5 ms do not prove convergence or a global floor.

## Bounded conclusion and remaining gates

The split effect persists at **all three tested macro steps**; the observed
no-split reserve failure occurs only at 20 ms among these three settings. This
supports coarse-step dependence **in this fixture/selected grid**, not a
universal threshold or a macro-step default recommendation. Only paired A/C
changes at a fixed step isolate the split intervention including dt-sequence
changes. D/E tolerance-arm findings remain bounded to RMP12b's 20 ms regime.

Passing A10/A5 or any C never closes the retained A20 default failure or
RMP12-C02. RMP12 remains partial. Any default-policy proposal (including macro
step) needs broader RMP08–10 evidence and RMP05 decision budgets. No full-6D,
other knot densities/motors, complete flight, native/WASM parity, empirical,
mission/platform/install/team/release qualification follows.

## Artifact availability / reproduction

Portable: this run's frozen inputs/contract/plan/seal, summary above,
[metrics.json](metrics.json), and [saved-output analysis](analyze-saved-output.py).
The portable metrics include exact residuals/ratios, file hashes, reference
checks, sample/event context and nonclaims. The primary runner/tests are in
`scripts/diagnostics/`; it refuses stale seals/reused output directories.

External-local-only original raw files:
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp12c-regime-expansion/`:
`run-1/{result.json,attempts.json,reservations/,*.input.json,*.stdout,*.stderr}`,
`run-1.invocation-*.json`, `execute-1.log`, unit logs and implementation review.
Contract reviews remain in external `evidence-rmp12-candidate-controls/` as
inventoried in RUN-SEAL. No claim these raw artifacts are in Git.

To verify retained outputs without native calls:

```sh
python3 docs/internal/execution-runs/RMP12c-regime-expansion/analyze-saved-output.py \
  /path/to/retained/run-1 > /new/path/metrics.json
```

Do **not** rerun the seven-attempt experiment as a continuation/probe. Any new
matrix needs its own prospective reviewed contract. Next useful independent
product lane: RMP07 consumer consistency/migration reporting. Nothing pushed,
released, deployed or activated.
