# RMP13 scenario provenance — author RESULT (not self-accepted)

Status: **bounded cleanup implemented; awaiting coordinator review and
integration.** No check status was promoted, no self-acceptance, and the
production-CSP browser receipt is deliberately left to the coordinator in the
integration tree (gate amendment 1).

## Scope delivered vs unfinished

Delivered (option (a) as approved):

- Deleted `src/sim/motorVariance.ts` and `src/sim/motorVariance.test.ts`: the
  module read a class-independent 6.7 % certification σ ceiling as an invented
  per-class ±6–10 % "typical" band, set the suggested 1σ at that band edge
  (10 % for the small classes, above the ceiling it cited), and asserted a
  Gaussian family, per-class taper and physical meaning with no cited
  distribution.
- Reduced the closed benchmark inventories explicitly and kept
  `scripts/emit-benchmark-metadata.cjs` certifiable (cited-file hashes and
  collected-suite list, plus the emitter fixture listing).
- Rewrote the sampler contract comments so the impulse sigma is stated as a
  declared scenario scale and each non-zero sigma as an independent draw.
- Ensemble presentation now names the three sampled inputs, the inputs held
  fixed, and states that percentages and radii are sample fractions: stat
  labels "Sample 50/90/99 % radius", ring legend "… of samples within …", no
  internal field names in user copy.
- Public accuracy line now says Monte Carlo is scenario sensitivity over three
  sampled inputs with everything else fixed, not a probability/coverage
  forecast.
- Changelog records the removal and the explicit inventory reduction.

Unfinished by design: independent review, merge/integration, and the
production-CSP browser proof at 1280×800 (coordinator, integration tree, bound
to `13da44d5…`).

## Identity

- Worktree/branch: `rmp13-scenario-provenance`.
- Base/pin: `0f6f08eed60a06946d11306371dca1841a3f2e26`.
- Commits: `774b2f2` (C1 delete + inventory repair), `5b10592` (C2 sampler
  comments), `9a83398` (C3 presentation), `d05c9e5` (C4 changelog + accuracy),
  and this C5 records commit.
- Routing: OMP direct `deepseek/deepseek-flash`, catalog-verified
  **DeepSeek V4.1 Flash 1017** (`omp models deepseek --json`), max effort per
  lane record, no fallback selector. No subdelegation.
- Single author; no engine build, no browser, no server.

## Defect being closed

`src/sim/motorVariance.ts:9-27,42-47,76-132` presented an arbitrary per-class
6–10 % taper as a "NAR/Tripoli certification tolerance/typical band" and
recommended σ at that band edge as the Monte-Carlo impulse default, on the
strength of a class-independent 6.7 % certification σ ceiling. That premise
cannot establish a measured distribution, a per-class taper, a Gaussian family,
correlations or physical coverage; the module also set A–E σ to 10 %, 1.49× the
ceiling it cited, and competed with the persisted 5 % workspace default.

## Consumer ledger (LSP, verified before the change)

`sigmaForImpulseClass`, `defaultImpulseSigma`, `describeUncertaintyDisplay`,
`SUPPORTED_IMPULSE_CLASSES` had no runtime consumers: LSP references resolved
only inside `motorVariance.ts`, its own suite, the `monteCarlo.ts` doc comments
and the benchmark inventory/fixture lists. The console ensemble runs the Rust
WASM `run_ensemble_chunk` path (`store.ts:752` → `adapter.ts:569-630`).

Running ensemble inventory (unchanged): three independent scalar draws — wind
direction (deg), rail elevation (deg), one uniform thrust-curve scale (percent
of nominal; burn shape/time unchanged) — with wind speed/shear, atmosphere,
mass/CG/geometry, rail length/azimuth, drag calibration and deployment fixed;
no cross-sigma correlation; persisted defaults 10°/1°/5 %, seed 20260927,
`per-run-v2`.

## Verification actually executed

1. **Full suite, before edits** — `npx vitest run --maxWorkers=2`:
   `134 passed (134)` files, `1739 passed (1739)` tests, 225.71 s.
2. **Full suite, after all edits** — same command: `133 passed (133)` files,
   `1731 passed (1731)` tests, 345.86 s. Arithmetic: −1 file, −8 cases, exactly
   the deleted 8-case suite; no other suite referenced the deleted files.
3. **Emitter self-test** — `node scripts/emit-benchmark-metadata.test.cjs`:
   `all 49 tests passed`, including M1 (inventory ⊆ cited test hashes, exact set
   equality) and the "inventory file missing from collection" negative case.
   Run before and after the final test-only edit.
4. **Typecheck** — `npx tsc --noEmit` clean before and after the final edit.
5. **Focused reruns** — the 9 suites that import the touched modules
   (`runCases`, `SavedRuns`, `store`, `ensembleDeterminism`, `engine`,
   `projectJson`, `waiverContainment`, `monteCarlo`, `stageRendering`) plus
   `SavedRuns.test.tsx` alone (20 passed) after the wording-pin deletion.
6. **Numerical preservation probe** (throwaway, deleted from the tree after the
   run; harness and raw results kept outside Git):
   fixed request `PRESET_ESTES_ALPHA` + `estes_c6`, options `railLength 3,
   railElevationDeg 85, railAzimuthDeg 0, windSpeedSurface 3, windAzimuthDeg 0,
   finCantAngleDeg 0, mainDeployAltitudeAGL 300`, sigmas `20/1/3`, seed `4242`,
   runs `[0,8)`, `per-run-v2`; executed bytes
   `sha256 13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`
   (1,827,128 bytes, unchanged before/after).
   Full result-vector digests (sha256 over a stable-stringified object with
   sorted keys), pre-edit vs post-edit, are **identical**:

   | Digest | Pre-edit | Post-edit |
   | --- | --- | --- |
   | WASM chunk (`run_ensemble_chunk`) | `bdeca85c…68a1cb` | identical |
   | WASM whole classified (`run_ensemble_classified`) | `360e1f2c…c0d6c8` | identical |
   | TS oracle chunk | `ea889335…b11993c8` | identical |
   | TS oracle whole | `6fb72f34…15fb3e16` | identical |
   | persisted defaults `{100, 20260927, per-run-v2, 10, 1, 5}` | `5b7ab4a2…4ceafc80` | identical |

   The whole result objects (landings, per-run outcomes, counts, statistics),
   not just selected scalars, compared equal; counts were
   `requested 8 / supportedNominalTerminal 8`, all other classes 0.

No browser/preview/server was started in this lane. No engine was built.

## Failed attempts / corrections (retained)

1. **Wording pin found by the suite, not by my inventory.** The first post-edit
   full run failed `1/1731`: `SavedRuns.test.tsx:45` asserted
   `getByText('50% within')` (and `:57` asserted its absence, tautological after
   a rename). My proposal-time grep covered "90% within" but not "50% within".
   Fix: deleted both assertions instead of re-pinning; the ledger-count,
   display-clearing and undo assertions in the same behavioural test are
   untouched. Re-run: `SavedRuns.test.tsx` 20/20.
2. **Probe harness timeout.** The final probe run first reported failure with
   `Error: Test timed out in 20000ms` under the repo's default `testTimeout`,
   after the result file had already been written; comparison data was valid but
   the receipt was not green. Fix: probe `it(..., 120_000)` and re-ran green.
   Recorded here rather than dropped.
3. Baseline/final full-suite runs each exceed the 60 s foreground window and ran
   as background jobs; both were collected, not re-run to "confirm" a result.

## Deliberately not done

- No engine build (`pnpm build` / `build-engine`): Rust untouched; the
  integration root's `13da44d5…` build is used only as the probe's executed
  bytes, and no other identity is cited. The repo-root-dependent rebuild was
  avoided per gate amendment 1 and the RMP12 finding.
- No production-CSP browser run, screenshot or UI layout claim; 1280×800
  readability of the new note is for the coordinator's post-merge browser proof.
- No Rust, sampler policy/RNG/order, numeric default, project schema/IO,
  candidate runtime, core physics, protected-input, register/manifest/TASKS/
  handoff, historical-evidence or committed hash-record change.
- No new tests: the only test edit deletes two copy pins; no assertion on the new
  copy exists.

## Residuals / external prerequisites (unchanged by this lane)

- **C01** measured per-class/motor impulse distributions and measured
  wind-direction/rail-angle spreads plus correlations — owner/team data
  custodian with an RMP02-eligible provenance record, independent scientific
  reviewer; reopen only with that dataset.
- **C02** eligible development observations by output/regime and a predeclared
  model/discrepancy structure — owner/team + scientific reviewer; confounded
  fits stay refused/constrained.
- **C04** declared roles/splits and custodied unseen outcomes — data custodian +
  scoring custodian + owner authorization.
- **C05** any real coverage/width assessment — independent measured flights, a
  predeclared coverage metric and finite-sample method approved by a statistical
  reviewer.
- **C06** preserved here (sampler, ledger counts, zero-eligible rule, cancel
  semantics untouched; digests prove identical counts); no new external input
  for the software part.
- **C07** approved budgets/custody/freeze/team participation — owner/team +
  custodian + independent reviewer; `decision-budget.json` still
  `incomplete-do-not-freeze-or-score`.

External evidence: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp13-scenario-provenance/`
(`probe-pre-0f6f08e.json`, `probe-final3.json`, `probe-post.json`,
`probe-final*.json`, `probe-final2.log`, `probe-preservation.test.ts`).

Stopping at the coordinator gate: no acceptance claimed.
