# RMP08-ARCAS — per-band transonic scoring and honest CP claims

Owner-authorized increment 11 (past the 10-increment cap) on `continue-task`.
Tests/reporting only. No physics, model, threshold, Rust or WASM change.

## Delivered

1. **Per-band scoring.** `src/validation/arcas/arcas-benchmark.ts` now breaks
   every residual out by band (subsonic / transonic / supersonic) and body
   (ARCAS-short / ARCAS-long) for both CA and CP. The previous output pooled all
   bands into one MAE.
2. **A real gate.** The inherited 15 % research target — already declared in the
   file header, not invented here — is now applied **per band** instead of
   pooled. This is the same number applied where it can actually fail.
3. **The false pass is caught.** `CA transonic ARCAS-short` is 15.72 % and now
   **fails**. Previously the pooled MAE was under 15 % and the gate passed while
   this band was over target.
4. **CP reported per band**, with no pass/fail threshold. The roadmap forbids
   inventing accuracy budgets and none has been approved for CP, so CP stays
   report-only — but now the per-band structure is visible instead of a single
   pooled `MAE=4.6, bias=1.7`.
5. **Supersonic is stated as unvalidated**, not untested: a test asserts both
   supersonic bands have no base-corrected comparable data.
6. **`docs/accuracy.md`** now carries the per-band table and names the transonic
   failure and the wrong-direction supersonic CP shift.

## Measured results (production curve, tunnel Reynolds number)

| Band | Body | CA MAE | CP MAE | CP bias |
| --- | --- | --- | --- | --- |
| subsonic | ARCAS-short | 11.2 % | 2.5 pp | +2.5 pp |
| subsonic | ARCAS-long | 4.9 % | 1.1 pp | +1.1 pp |
| **transonic** | **ARCAS-short** | **15.7 % (FAIL)** | 4.7 pp | −1.9 pp |
| transonic | ARCAS-long | 13.8 % | 3.8 pp | +1.9 pp |
| supersonic | ARCAS-short | not validated | 5.2 pp | +1.9 pp |
| supersonic | ARCAS-long | not validated | 6.4 pp | +4.7 pp |

Prior pooled figures (12/11 quarantined/excluded readings unchanged) were
`CAcorr MAE < 15 %` (pass) and `CP n=19, MAE=4.6, bias=1.7`. The pooled CP number
is not wrong, but it concealed the band structure.

## Retained failure

`pnpm benchmark:arcas` **fails** on `CA transonic ARCAS-short MAE 15.72 %`:

```
AssertionError: CA transonic ARCAS-short MAE 15.72% (CA≈non-base CD at α≈0)
must meet the inherited 15% research target:
expected 15.717557349012338 to be less than 15
```

This failure is **the deliverable**. Per the project rules the physics was not
tuned to make it pass. The benchmark config already documents this posture
("Research targets may fail; keep them separate from application unit tests")
and `arcas-benchmark.ts` is excluded from the application suite.

## Why this matters

- The prior pooled gate was a **false pass on a bounded claim**: a 15.7 % band
  error laundered into a sub-15 % aggregate. A consumer reading "CAcorr MAE <
  15 %" would have believed the model met the target everywhere. It does not.
- The transonic regime is where collegiate competition vehicles live (IREC
  targets 10k–45k ft), and where the incumbent reference tool (RASAero II)
  explicitly validates. This is the highest-leverage accuracy gap.

## Not done here (deliberately)

- **No physics change.** The transonic fin CNa compressibility correction
  (Mechanism A in `docs/internal/validation/arcas/transonic-cp-findings.md`) is
  the leading candidate and is source-cited, but implementing it is a model
  change requiring independent scientific review. Separate increment.
- **No CP accuracy budget invented.** CP remains report-only until an approved
  budget exists. Owner/team input required.
- No supersonic drag claim — no comparable data exists.
- No acceptance-register promotion.

## Verification

- `pnpm benchmark:arcas`: 1 failed / 4 passed — the retained red above.
- Application suite: 126 files / 1580 tests pass (`arcas-benchmark.ts` is not
  matched by the default include pattern, so the research target cannot break
  the application suite).
- `tsc --noEmit` clean. `git diff --check` clean. `validate-package.py` pass.
- Evidence: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-arcas-transonic-scoring/`.
