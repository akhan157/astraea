# RMP08-ARCAS — per-band transonic scoring and honest CP claims

Owner-authorized continuation past the 10-increment cap (owner: "Ok" to the
proposal to scope the ARCAS transonic scoring run). This is increment 11 and is
bounded to scoring/reporting only.

## Finding (observed in the current benchmark output)

`src/validation/arcas/arcas-benchmark.ts` reports CA and CP residuals **pooled
across Mach bands**, then gates on the pooled number:

- `subsonic ARCAS-short: MAE 11.2%`, `transonic ARCAS-short: MAE 15.7%`,
  `transonic ARCAS-long: 13.8%` (report lines), yet the gate
  `expect(mae).toBeLessThan(15)` **passes** — because `mae` is computed over all
  CAcorr rows at `mach <= 1.2` in one pool. A 15.7% transonic error is laundered
  into a sub-15% pooled value. This is a false pass on a bounded claim.
- CP is explicitly "report-only": the summary prints `scored n=19, MAE=4.6,
  bias=1.7` with **no per-band breakdown and no gate**. Pooled CP MAE 4.6 pp
  conceals the transonic behaviour already documented in
  `docs/internal/validation/arcas/transonic-cp-findings.md` (ARCAS-short error
  grows to +13.3 pp at M=1.2; the engine's supersonic shift moves CP forward,
  the wrong direction).
- `supersonic` bands print "no base-corrected comparable data (NOT VALIDATED)".

## Change (tests/reporting only — no physics, no model, no thresholds invented)

1. Break every residual summary out **per band and per body** (subsonic /
   transonic / supersonic × ARCAS-short / ARCAS-long) for both CA and CP.
2. Apply the **existing inherited 15% research target per band**, not pooled.
   This is not a new accuracy budget — it is the same number already in the file,
   applied where it can actually fail. Do not invent or tune a new threshold;
   the roadmap forbids inventing accuracy budgets.
3. Red first: `transonic ARCAS-short` at 15.7% must **fail** the 15% per-band
   gate. Retain that failure as evidence (same posture as RMP12-C02).
4. Do **not** change `transonicAero.ts`, `barrowman.ts`, any Rust, or any
   coefficient to make the gate pass. A physics correction (transonic fin CNa
   compressibility, Mechanism A in the findings doc) is a separate increment
   requiring independent scientific review.
5. Update `docs/accuracy.md` with an explicit transonic CP/CA status so the
   product claim reflects the measured gap rather than silence.

## Lease

`src/validation/arcas/arcas-benchmark.ts`, `src/validation/arcas/measured-arcas.ts`
(read-only reference unless a data error is found), `docs/accuracy.md`,
`docs/internal/execution-runs/RMP08-arcas-transonic-scoring/`, CHANGELOG.md if a
user-facing claim changes. Evidence: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-arcas-transonic-scoring/`.

## Non-goals

- No physics/model change, no retuning, no new tolerance invented.
- No acceptance-register promotion; no accuracy budget declared.
- No WASM rebuild, no cargo, no RMP12 study rerun.
- No claim of supersonic validation (no comparable data exists).

## Verification

`pnpm benchmark:arcas` (vitest only, no cargo) must show per-band output and the
red transonic failure. `pnpm exec vitest run src --maxWorkers=2`,
`tsc --noEmit`, `vite build`, `git diff --check`, `validate-package.py`.
Independent MiMo no-tools review before acceptance.

## Success

A reader can state, per band and per body, exactly how far the model is from
measured ARCAS data — and the benchmark cannot pass while a band exceeds the
inherited research target.
