# RMP10-C03 — peak evidence result

## Completed scope

Added independent synthetic analytic/refinement evidence for the existing bounded native display-sample max-Q path. A test-only transcription of the native recorder/decimator covers nonterminal display rounding, terminal precision, event/endpoint retention, forced highest-valid-recorded-q retention, uniform stride and the 5,000-point cap. It does not call Rust, WASM or another TypeScript decimator.

The adapter and manifest now state the evidenced limits plainly: sampling/decimation can miss the continuous-time peak by an unbounded amount, and nonterminal integer-Pa rounding can make the displayed peak exceed that continuous peak. No numeric tolerance or resolution claim was introduced. Existing sample-selection, confidence and gap semantics are unchanged.

The read-only consumer audit covered `src`, the RMP10 packet, the prior output-contract audit and this run. Labels and comments describe Sampled Max-Q as a bounded display sample and deny continuous-bound interpretation; no positive continuous-maximum/bound claim was found.

## Independent synthetic evidence

All inputs are manufactured analytic functions, not measured flights or protected outcomes.

- Exact-hit parabola: retained/displayed 40,000 Pa at 2 s equals the closed-form maximum; a 20× refinement also attains 40,000 Pa at 2 s. Rounded adjacent maxima may tie, so the test does not invent a unique refined time.
- Off-grid parabola: closed-form maximum 50,000 Pa at 2.023 s; the 0.05 s display record reports 49,947 Pa at 2 s, exactly 53 Pa below the analytic maximum. The unrounded value at 2 s is 49,947.1 Pa. A 0.001 s independently sampled grid attains 50,000 Pa.
- Smooth narrow Gaussian family: amplitudes 1,000, 1,000,000 and 1,000,000,000 Pa produce identical 50,000 Pa display histories while their analytic maxima differ by the full amplitude. Thus the returned samples supply no finite missed-peak bound for this smooth family.
- Rounding overshoot: analytic maximum 100.6 Pa becomes a 101 Pa nonterminal display sample, 0.4 Pa above the continuous maximum. The displayed value is therefore not a rigorous lower bound.
- Native-cap retention: 30,001 synthetic recorded points decimate to 5,000; the forced recorded peak survives while the counterfactual without that obligation loses it. The retained recorded peak remains below the analytic between-sample peak.

Bookkeeping tests cover nonfinite/negative q, invalid/negative/nonfinite times, total versus valid counts, malformed-run unknown confidence, absent gap for fewer than two or invalid/decreasing times, zero gap for equal non-decreasing times, and absent max-Q/derived event when no valid sample exists. No bookkeeping defect was found.

## Red-first chronology and verification

1. Initial focused run (`vitest-peak-red.log`): 5 failed / 8 passed. Four failures were fixture/expectation errors: rounded refinement ties, arithmetic using the unrounded 52.9 Pa rather than displayed 53 Pa deficit, first-tie peak time, and a counterfactual peak that happened to lie on stride. The intended claim assertion also failed. The original failed log is retained.
2. Corrected analytic fixtures (`vitest-peak-red-2.log`): 1 failed / 12 passed. The sole failure was the adapter reason omitting the evidenced unbounded-miss statement. No production assertion was weakened.
3. After only the adapter/manifest reason and contract-comment clarification (`vitest-peak-green.log`): 13/13 focused tests passed.
4. First broader affected run (`vitest-affected.log`): three suites could not load the absent WASM asset; 46 tests passed and 3 skipped in the other suites. This setup failure is retained, not counted as a code regression.
5. Copied the authorized sealed WASM without rebuilding. Source, test asset and Vite output SHA-256 are all `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`; byte count 1,546,041. Final affected run (`vitest-affected-with-wasm.log`): 8 files, 61/61 tests passed.
6. `pnpm exec tsc --noEmit`: exit 0, no diagnostics. `pnpm exec vite build`: exit 0, 3,112 modules transformed. `git diff --check` and package validator final logs are external. Package integrity: pass, 18 packets / 117 checks / 29 recorded passes, unchanged by this lane.

Commands used Vitest with `--maxWorkers=1`; builds/tests ran serially. Available RAM before typecheck/build was 8.4 GiB. No Cargo command, engine rebuild, RMP12 numerical study, browser run, full-repository suite, external action or acceptance-register edit occurred.

## Files changed

- `src/console/data/peakEvidence.test.ts`: new independent analytic/refinement, retention, claim and bookkeeping tests (13 tests).
- `src/console/data/adapter.ts`: max-Q result reason and sampledMaxQ manifest wording only.
- `src/console/data/contract.ts`: max-Q/sampledMaxQ documentation only.
- `docs/internal/execution-runs/RMP10-peak-evidence/`: assignment, this result, pending review, structured evidence and package-validation receipt.

## Base, commit and artifacts

Base: `d278d49421cdd6ecd3e390c8ce3fdd4524e4f692`. Exactly one local commit is made on `rmp10-c03-peak-evidence`; its SHA is written after commit to the external `source-commit.txt` and supplied in the author handoff. A commit cannot contain its own hash, so the tracked record uses that external locator.

Raw logs and hashes: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-peak-evidence/`. They are local evidence, not represented as committed artifacts. `REVIEW.md` is pending independent review; no acceptance status is marked pass by this author.

## Exact remaining RMP10-C03 scope

- Coordinator independent review and acceptance disposition remain. This is author evidence, not an approved RMP10-C03 pass.
- The evidence supports only the bounded display-sample claim. Continuous-time max-Q magnitude/timing, a numeric resolution/error budget, and any structural sizing decision remain unqualified.
- No native solver/peak-extraction change or new native trajectory study was made. If a continuous peak is required, a separate justified native method, numerical budgets and production-WASM verification are needed.
- Synthetic analytic agreement is not empirical flight accuracy, instrumentation-bandwidth evidence, physical/model qualification or proof for arbitrary real flight histories.
- Consumer review was a static claim audit; no readout/export behavior or layout changed and no built-browser journey was claimed.

## Native premise citations (post-review addition)

The independent reviewer accepted the increment but asked for evidence of the
native rules the synthetic fixtures transcribe (findings F1/F2). Those rules are
documented at source, cited here so the premise is no longer an assumption:

- **Nonterminal scalar rounding is nearest, half-up on an exact tie** —
  `crates/astraea-core/src/telemetry.rs:63-70` (`js_to_fixed` doc):
  "`toFixed` picks the integer `n` minimizing `|n/10^f - x|` on the EXACT binary
  value, choosing the larger `n` on an exact tie (round half up on the
  magnitude)". This is the premise the rounding-overshoot claim depends on:
  under nearest-rounding a displayed sample can exceed the continuous peak by up
  to half a quantum, whereas truncation could not. The claim is therefore
  grounded, not inferred.
- **Terminal point is full precision** — `telemetry.rs:5-6`: "Nonterminal points
  are NONCANONICAL display data: scalars carry the TS `parseFloat(x.toFixed(n))`
  rounding (reproduced exactly by `js_to_fixed`); the terminal point is full
  precision."
- **Forced recorded-peak retention is explicitly not a continuous bound** —
  `telemetry.rs:153-156`: "keeps the first recorded sample attaining the largest
  finite nonnegative `dynamic_pressure`, if any; this preserves a recorded
  display peak, not a continuous-time extremum or a sampling/rounding error
  bound". The product claim is strictly weaker than the source's own disclaimer.
- **Display cap** — `telemetry.rs:18`: `MAX_TELEMETRY_POINTS: usize = 5000`,
  matching the `MAX_SAVED_TELEMETRY_POINTS = 5000` used by the sibling RMP15-C01
  retention lane.

Residual limitation (unchanged): the tests still do not execute native code, so
they cannot detect a future divergence between this transcription and the
engine. They are separate-implementation synthetic evidence, not a parity test.
