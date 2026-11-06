# RMP13 scenario provenance — gate-1 proposal (no source edits performed)

**cwd confirmed** `/home/ak/.paseo/worktrees/3s8t98rp/rmp13-scenario-provenance`
**branch** `rmp13-scenario-provenance`
**HEAD** `0f6f08eed60a06946d11306371dca1841a3f2e26` = accepted integration pin
**tree** clean except untracked `docs/internal/execution-runs/RMP13-scenario-provenance/`
(plus this PROPOSAL/ later records).

**Routing.** Session model line is the direct provider selector
`deepseek/deepseek-flash`; `omp models deepseek --json` (run in this worktree,
2026-10-29) resolves that selector to catalog name **DeepSeek V4.1 Flash 1017**,
`reasoning: true`, `thinking: ["low","high","max"]`, 1,000,000 ctx. Activation
record for this lane: max effort, no fallback. I do **not** claim an observed
`resolvedModelIsFallback` bit — that is not visible from inside the session; what
is verified is that the active selector is the direct `deepseek` provider id and
no proxy/OpenRouter selector is in play. `[INFERENCE]` only for the internal
effort flag (max), from the lane record + catalog support.

**Gate state.** Read-only work only. No source edit, build, test, formatter,
dependency install, preview server or browser has been run. Commands executed:
`git rev-parse/status/log`, `read`/`grep`, `xd://lsp references` (4 symbols),
`sha256sum`, `free -h`, `omp models deepseek --json`.

Host: 8.2 GiB available, 8 cores; all plans below assume ≤2 jobs and re-check
before each heavy step.

---

## 1. The claim defect, exactly

`src/sim/motorVariance.ts` (135 lines) is a suggestion module that manufactures a
per-class certification narrative:

| Line | Content |
| --- | --- |
| 9–13 | Premise: NFPA 1125 Ch. 8 "paraphrased at thrustcurve.org" — certified batch total-impulse **σ ≤ 6.7 %**, and the file itself states "the certification ceiling is class-independent". |
| 15–24 | Unsupported leap: the ceiling is read as a "typical" band of **±6–10 %** that "tapers with class", justified by an uncited "drag-corrected flight-dispersion reading that batch variability shows up most strongly in small, cheap motors". |
| 26–27 | "The modeled 1σ is therefore set AT the certification bound — a conservative upper estimate". |
| 42–47 | `CLASS_TOLERANCE_PCT` = arbitrary literals A–E 10, F–G 9, H–I 8, J–K 7, L–O 6. |
| 76–95 | `sigmaForImpulseClass` returns `sigmaPct = tolerance` and a note calling the band "NAR/Tripoli certification tolerance for class X". |
| 99–117 | `describeUncertaintyDisplay` → "TYPICAL range: class X motors deliver within −10 % to +10 % … (NAR/Tripoli commercial certification tolerance)" and "sigma set at the certification bound as a conservative Gaussian default". |
| 124–132 | `defaultImpulseSigma(motor)` recommends that band-edge σ as the Monte-Carlo impulse default. |

Why the premise cannot establish any of this:

1. **Ceiling ≠ band ≠ distribution.** "σ ≤ 6.7 %, class-independent" bounds one
   scalar for certified batches. It cannot produce a per-class number, a
   two-sided "TYPICAL range", or a family.
2. **The module contradicts its own premise.** For A–E it sets the 1σ suggestion
   to 10 % while citing σ ≤ 6.7 % for the very same certified batches (1.49× the
   ceiling it quotes). "σ at the band edge is conservative" is therefore false
   as stated, and a ±σ Gaussian is never a coverage statement about a ±6.7 %
   tolerance (a 6.7 % σ Gaussian leaves ≈32 % of mass outside ±6.7 %).
3. **The taper has no source.** The only citation says manufacturers "hold
   tighter tolerances in production", i.e. the opposite direction of a
   small→large taper argument; the "drag-corrected flight-dispersion reading" has
   no cited source at all.
4. **Family and dependence are invented.** "Gaussian default" is asserted; the
   sampler draws impulse independently of wind/rail; no measured distribution,
   no correlation, no physical coverage exists anywhere in the citation.
5. **Competing default source.** The running console ensemble uses persisted
   workspace sigmas (`src/application/workspace.ts:78-82`: nRuns 100, seed
   20260927, `per-run-v2`, wind 10°, rail 1°, impulse **5 %**). The module
   advertises a *different* per-class impulse default (6–10 %) that no caller
   uses. One of these must not look like a certified default.

No new source acquisition is needed to stop the claim, and none is authorized.

---

## 2. Consumer ledger — LSP references (not text search)

Server: `typescript-native`, fresh. Each export queried at its declaration line.

| Symbol (decl line) | LSP references | Real runtime consumers |
| --- | --- | --- |
| `sigmaForImpulseClass` (76) | 8: def; internal 103 (`describeUncertaintyDisplay`), 131 (`defaultImpulseSigma`); own test 14, 29, 40, 78 | **none** |
| `defaultImpulseSigma` (124) | 4: def; own test import 4, calls 78, 84 | **none** |
| `describeUncertaintyDisplay` (99) | 6: def; own test import 3, calls 47, 62, 70, 71 | **none** |
| `SUPPORTED_IMPULSE_CLASSES` (136) | 7: def; own test import 6, uses 12, 13, 29, 31, 61 | **none** |

Non-test references are **text only**:

- **Adverts in the sampler contract**: `src/sim/monteCarlo.ts:52-61` (the
  `impulsePctSigma` doc block, field at `:62`, names `defaultImpulseSigma`,
  `describeUncertaintyDisplay`, "NAR/Tripoli certification tolerance
  (NFPA 1125)" and "TYPICAL range (certification tolerance) vs ESTIMATE") and
  `src/sim/monteCarlo.ts:400-403` (`runMonteCarlo` `@param perturbations`
  "see `defaultImpulseSigma(motor)`/`describeUncertaintyDisplay()` … for
  certification-grounded defaults").
- **Benchmark metadata inventories** (`scripts/emit-benchmark-metadata.cjs`):
  `:142` `src/sim/motorVariance.test.ts` and `:190` `src/sim/motorVariance.ts`
  inside `HASHED_REQUIRED_FILES`; `:268` the same test inside
  `FIXED_TEST_FILE_INVENTORY`. Enforcement points: `:1109` (a null cited-file
  hash ⇒ `evidence: <path> missing — cannot hash cited source`), `:875-883`
  (an inventory suite not collected ⇒ `… silent suite retirement fails
  certification`; an executed test outside the inventory ⇒ unacknowledged suite).
  The emitter's own suite asserts exact set equality between cited test files
  and the inventory (`scripts/emit-benchmark-metadata.test.cjs:874-883`, M1) and
  builds its fixture file list at `:240` (`acceptanceFiles`) with a mock source
  entry at `:296`.
- **Historical archive prose** (read-only, will not be edited):
  `docs/internal/archive/superset-exception-ledger.md:36` lists
  "per-class impulse-sigma defaults (`motorVariance.ts`)".

**Runtime consumer ledger for the ensemble (what actually runs).** The console
never calls the TS sampler either: `src/console/store.ts:705-760` →
`src/console/data/adapter.ts:569-630` → `runEnsembleChunkRecorded` →
Rust/WASM `run_ensemble_chunk` (`crates/astraea-engine/src/commands.rs:154`).
`src/sim/monteCarlo.ts` remains the TS oracle/equivalence reference
(`src/engine/engine.test.ts:76-88`).

---

## 3. What the running ensemble actually perturbs

### 3.1 Sampled — exactly three scalars, independent, fixed order

| # | Input | Units | Implementation | Effect |
| --- | --- | --- | --- | --- |
| 1 | `options.windAzimuthDeg` (wind **direction**, not speed) | deg | `crates/astraea-core/src/monte_carlo.rs:432-436`; TS oracle `src/sim/monteCarlo.ts:371-375` | base azimuth + z·σ |
| 2 | `options.railElevationDeg` | deg | `monte_carlo.rs:438-441`; `monteCarlo.ts:376-380` | base elevation + z·σ |
| 3 | impulse scale `1 + (σ/100)·z` | % of nominal | `monte_carlo.rs:442-446`, applied by `crates/astraea-engine/src/commands.rs:47-61` | multiplies **every thrust-curve sample** and `max_thrust`; burn shape and burn time unchanged |

- Per-run semantics: `apply_perturbations` clones the base and, for each σ > 0,
  consumes exactly two uniforms in that fixed order
  (`monte_carlo.rs:424-449`; oracle `monteCarlo.ts:360-393`). Zero σ leaves the
  field untouched (`validate_sigmas`, `monte_carlo.rs:407-421`;
  `monteCarlo.ts:342-356`).
- **Correlations: none.** Three independent draws from one seeded stream; no
  joint law, no cross-sigma correlation parameter exists in the DTO
  (`SigmasDto`, `crates/astraea-engine/src/models.rs:128-133`).
- Note (inventory, not a defect claim): the TS oracle additionally pre-scales
  `totalImpulse`/`avgThrust` (`monteCarlo.ts:381-390`) before scaling the curve;
  the production engine scales only curve samples + `max_thrust`
  (`commands.rs:47-61`). `engine.test.ts:76-88` asserts the two landings agree.

### 3.2 Fixed (never sampled)

`crates/astraea-engine/src/models.rs:95-112` fixes: rail length, rail azimuth,
launch altitude ASL, wind **speed** (surface), `mainDeployAltitudeAGL`, time
step, fin cant, `dragCdScale`. Atmosphere is fixed ISA via `getAtmosphereAt`
(`crates/astraea-core/src/six_dof.rs:1062`, ISA-1976 density/speed of sound). Vehicle mass/CG/geometry, motor curve shape, recovery
settings, and the currently applied drag calibration are held at their entered
values for every run. Wind shear is the fixed power-law surface model — no
sounding is sampled.

### 3.3 Persisted defaults and seeds

- `src/application/workspace.ts:78-82`: nRuns 100, seed 20260927,
  `per-run-v2`, wind-azimuth σ 10°, rail-elevation σ 1°, impulse σ 5 % of
  nominal.
- `src/console/store.ts:752` passes those workspace values verbatim;
  `src/console/data/adapter.ts:574` fallback `{20, 1, 3}` applies only when a
  caller omits sigmas (the console does not); `MC_SEED = 20260909`
  (`adapter.ts:54`), chunk size 25 (`adapter.ts:53`).
- Validation: nRuns 1–1000, sigmas ≥ 0 (`workspace.ts:160-163`).

### 3.4 Immutable archive fields (no schema/IO change proposed)

- Case inputs archive the sampler settings verbatim:
  `src/application/runInputs.ts:29, 71, 111` (`EnsembleSettings` = nRuns, seed,
  version, three sigmas) — never recomputed.
- Case summary + snapshot binding: `src/application/runCases.ts:188-215`
  (`runsSucceeded/runsFailed`, `sigma1M/sigma2M`, `r50M/r90M/r99M`, five counts,
  `outcomePolicy`, `statisticsAvailable`, `dispersionSnapshotId`); snapshot
  payload `runCases.ts:96-117` (`mean`, `covariance`, `sigma1/2`, `thetaDeg`,
  `containmentRadii`); typed finite validation
  `src/formats/projectJson.ts:1315-1335`; existing ids are never rewritten
  (`runCases.ts:133-140, 200-210`).
- Engine identity is attached to the dispersion record (`adapter.ts:623`) and
  displayed per saved case (`src/console/stages/SavedRuns.tsx:170`).

### 3.5 What the UI claims today about probability/coverage

| Surface | Text | Assessment |
| --- | --- | --- |
| `src/console/stages/Flight.tsx:250` | "…are scenario-only, never physical probability." | Correct, already present |
| `Flight.tsx:210` | empty state: "scenario variation is not probability" | Correct |
| `Flight.tsx:236-238` | stats labelled **"50 % within" / "90 % within" / "99 % within"** | Reads as containment probability; no qualifier on the number |
| `Flight.tsx:203` + `src/console/kit/Charts.tsx:175` | rings labelled `50% / 90% / 99%`, legend **"50% within 40 m"** | Same implication |
| `Flight.tsx:215` | controls labelled by raw keys `windAzimuthDegSigma`, … | No units, no statement of what varies/is fixed |
| `SavedRuns.tsx:173, 188` | "Scenario-only; …" / "Scenario variation is not calibrated probability." | Correct, already present |
| `docs/accuracy.md:106-107` (public, linked from README) | "The predicted Monte Carlo range is **too narrow**: it does not yet include model uncertainty." | Correct but says nothing about sampled-vs-fixed inputs |

**Gaps this lane must close:** (i) the false certification provenance and its
advertised defaults; (ii) nowhere states *which three inputs vary, that they are
independent, and that everything else is fixed*; (iii) nowhere states the sigmas
are user-declared assumptions with no measured provenance; (iv) the
"percent within" phrasing presents sample fractions as if they were coverage.

---

## 4. Minimal cleanup: choose (a) delete, and why

**(a) Delete `src/sim/motorVariance.ts` + `src/sim/motorVariance.test.ts`, strip
the adverts, keep the metadata inventories runnable.** ← **Recommended.**

**(b) Retain the module, strip the certification claim, mark it scenario-only.**

Why (a) matches the roadmap:

- RMP13-C01 requires *every assigned* range/distribution to have provenance **or**
  explicit scenario-only status. What actually runs is assigned by
  `workspace.ts:78-82` (three sigmas); the module assigns nothing and is called
  by nothing (LSP: zero runtime references). Deleting it removes a fabricated
  claim instead of qualifying it, and the assigned ranges get their
  scenario-only statement where they are actually entered and read (§5).
- It is a *second* default source competing with the persisted 5 % impulse
  default; RMP13's own failure list warns against choosing convenient sigma.
  Keeping the table — even relabelled — preserves an unsupported per-class
  structure and invites exactly that.
- The packet's rule is "expose missing uncertainty … rather than displaying
  calibrated probability without evidence"; a dead suggestion API whose entire
  content is the ungrounded claim has no residual value to preserve.
- Engineering direction in this repo: delete dead weight; no shims. If measured
  per-class distributions ever arrive, their shape (σ per class, correlations,
  sample counts) must be designed from that data, not pre-shaped by these
  literals.
- (b) is also *more* work in the wrong place: it forces rewriting ~135 lines plus
  its 8 wording-shaped tests, i.e. re-pinning copy we are told to delete.

What breaks, and the exact repair:

| Breakage if not repaired | Repair |
| --- | --- |
| `evidence: src/sim/motorVariance.ts missing — cannot hash cited source` (emitter `:1109`) | remove line `scripts/emit-benchmark-metadata.cjs:190` from `HASHED_REQUIRED_FILES` |
| `tests: inventory file src/sim/motorVariance.test.ts not collected — silent suite retirement fails certification` (`:875-883`) | remove `:268` from `FIXED_TEST_FILE_INVENTORY` **and** `:142` from `HASHED_REQUIRED_FILES` |
| emitter self-test fixture/assert mismatch (M1 exact-set equality `test:874-883`) | remove `test:240` (`acceptanceFiles`) and `test:296` (mock source map) |
| dangling advert references | rewrite `monteCarlo.ts:52-62` and `:401-404` (§5) |
| suite arithmetic | full suite loses exactly 8 cases in 1 file (8 `it(` in `motorVariance.test.ts`); no other suite imports it (LSP) |
| no runtime/UI/API break | verified by §2 ledger |

Guard weakening is acknowledged: the closed inventory exists to make *silent*
retirement fail. Removing this file is an explicit, reviewed inventory change
(the script's own comment says additions/removals must be explicit, `:203-206`);
the guard stays intact for every other suite.

Not touched: historical benchmark records, committed `EVIDENCE.json` hash maps
(e.g. `RMP13-ensemble-outcome-ledger/EVIDENCE.json:36` pins an old `Flight.tsx`
hash — that record stays as recorded), `docs/internal/archive/superset-exception-ledger.md:36`
(stale path left as history, disclosed in the changelog entry).

---

## 5. Affected surfaces and the exact wording proposed

### 5.1 Delete (no replacement)

- `src/sim/motorVariance.ts`, `src/sim/motorVariance.test.ts`.

### 5.2 `src/sim/monteCarlo.ts` — comments only (behavior untouched)

Replace lines 52-61 (`impulsePctSigma` doc block; field at 62) with:

```
  /**
   * 1σ motor impulse spread, percent of nominal (uniformly scales the thrust
   * curve; burn shape and burn time are unchanged).
   *
   * Declared scenario assumption, not a measured distribution: no measured
   * batch spread, certification tolerance, correlation with the other sigmas
   * or landing-probability meaning is established for this value. A non-zero
   * sigma varies this scenario's impulse only.
   */
```

Replace lines 400-403 (`@param perturbations`) with:

```
 * @param perturbations  1σ Gaussian spreads; zero/missing sigma leaves the
 *                       corresponding field untouched. Each non-zero sigma is
 *                       an independent draw (no cross-sigma correlation); the
 *                       impulse sigma is a declared scenario scale with no
 *                       measured motor distribution behind it.
```

### 5.3 `src/console/stages/Flight.tsx` — presentation only

- Lines 236-238 labels: `"50% within" / "90% within" / "99% within"` →
  `"Empirical 50% radius" / "Empirical 90% radius" / "Empirical 99% radius"`
  (layout re-checked in the browser proof; fallback wording `"Sample 50% radius"`
  if the 3-column grid wraps badly).
- Line 250 note replaced by two paragraphs, exactly:

```
Scenario sensitivity, not physical probability. Three inputs are sampled
independently as 1σ Gaussian draws with no correlation between them: wind
direction in degrees (windAzimuthDegSigma), launch-rail elevation in degrees
(railAngleDegSigma), and one uniform thrust-curve scale applied to every thrust
sample in percent of nominal impulse (impulsePctSigma); burn shape and burn time
are unchanged. Every other input is held fixed: wind speed and its shear
profile, atmosphere, mass/CG/geometry, rail length and azimuth, drag
calibration, deployment settings.

The sigma values are declared scenario assumptions — not measured
distributions, certification tolerances or fitted spreads. Percentages and
radii are sample fractions of this synthetic cloud over supported nominal
endpoints only; they are not a physical landing probability or coverage
guarantee, and no finite-sample confidence is computed.
```

Keep as-is: line 210 empty-state copy ("scenario variation is not probability"),
line 246 zero-eligible message, line 213 header, the five-count ledger block,
`SavedRuns.tsx:173, 188` (already scenario-only).

### 5.4 `src/console/kit/Charts.tsx:175` — legend template only

`{r.label} within {dist}` → `{r.label} of samples within {dist}`
(reads "50% of samples within 40 m"; rings keep `50% / 90% / 99%` labels;
`LandingScatter` is the only consumer, `Charts.tsx:156`).

### 5.5 `scripts/emit-benchmark-metadata.cjs` / `…test.cjs`

Remove the five inventory lines listed in §4. Nothing else in the emitter
changes; the fixed inventory stays closed for all remaining suites.

### 5.6 Docs / changelog

- `docs/internal/engineering-changelog.md`, under `## Unreleased`, new entry:

```
### Removed — unsupported per-class motor-impulse certification defaults

- Deleted `src/sim/motorVariance.ts` and its suite. It read a class-independent
  6.7 % certification σ ceiling as an invented per-class ±6–10 % "typical" band,
  set the suggested 1σ at that band edge (10 % for A–E, above the ceiling it
  cited) and asserted a Gaussian family and class taper with no cited
  distribution. LSP references show no runtime consumer: only its own tests, the
  `monteCarlo.ts` doc comments and the benchmark inventories named it.
- The sampler contract now states that the impulse sigma is a declared
  scenario-only scale drawn independently of the wind and rail sigmas. No
  numerical default, sampler policy, Rust code, project schema or archive field
  changed; the workspace sigmas remain 10°/1°/5 % with seed 20260927.
- The closed benchmark inventories were reduced explicitly (cited-file hashes
  and collected-suite lists) so `scripts/emit-benchmark-metadata.cjs` still
  certifies; no historical metadata record was edited.
```

- **Optional, needs your call** (`docs/accuracy.md`, public via README:9,32):
  append one sentence to the Monte-Carlo bullet at `:106-107`:
  "It is scenario sensitivity over three independently sampled inputs — wind
  direction, rail elevation and impulse scale — with every other input fixed; it
  is not a landing-probability or coverage forecast."
- Not edited, disclosed as historical: `docs/internal/archive/superset-exception-ledger.md:36`.

### 5.7 Explicitly unchanged

Numeric defaults, sampler policy/RNG/order, Rust sources, project schema/IO,
candidate runtime semantics, core physics, protected inputs, register/manifest/
TASKS/handoff, any historical evidence or recorded identity.

---

## 6. Verification plan

### 6.1 Numerical-preservation probe (throwaway, run outside the committed suite)

Fixed request: `PRESET_ESTES_ALPHA` + `CERTIFIED_MOTORS.estes_c6`, options
`{railLength 3, railElevationDeg 85, railAzimuthDeg 0, windSpeedSurface 3,
windAzimuthDeg 0, finCantAngleDeg 0, mainDeployAltitudeAGL 300}`,
sigmas `{20, 1, 3}`, seed `4242`, runs `[0, 8)`, `per-run-v2`.

1. **Baseline, before any edit, at `0f6f08e`:** build the engine once from
   current source (`CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs`) and record
   `sha256` + byte size of `src/engine/astraea_engine.wasm`. Run the probe:
   - instantiate the **real** `src/engine/astraea_engine.wasm` bytes via
     `src/engine/core.ts`, route through `src/tauri/bridge.ts`
     `runEnsembleChunk` (same harness shape as `engine.test.ts:29-90`);
   - hash the canonical JSON of `{run_start, run_end, landings, runs, counts,
     failed_runs, first_failure_message, outcome_policy}`;
   - hash the same canonical JSON from the TS oracle `runMonteCarloChunk`;
   - print `DEFAULT_WORKSPACE.ensemble` (`10/1/5`, seed 20260927, nRuns 100,
     `per-run-v2`) as a recorded (throwaway) snapshot, not a committed pin;
   - save outputs to external evidence, outside Git.
2. **After the edits**, with **no** engine rebuild: re-run the identical probe
   and require (i) wasm `sha256` unchanged, (ii) both canonical hashes identical
   to baseline, (iii) `git diff -U0 src/sim/monteCarlo.ts` shows comment-only
   hunks (the `applyPerturbations` body is byte-identical), (iv)
   `git diff --stat` shows no change to `workspace.ts`/`adapter.ts`/`store.ts`/
   Rust/schema.
3. If the baseline declares the on-disk artifact stale (currently
   `13da44d5a70af2bd4e8feee082f49277a4ce92e07fed97743d4d3aedf0022328`,
   1,827,128 bytes, untracked build artifact; the ledger record's integrated
   identity was `9adeaf2c…`), the rebuild names the actual bytes and I disclose
   root-dependent reproducibility rather than reusing or rewriting a recorded
   identity. Hand-off for your integration build is explicit.

### 6.2 Committed tests

- **Delete** `src/sim/motorVariance.test.ts` (8 cases). No replacement copy test:
  asserting the new strings would be exactly the wording pin this lane is told to
  delete instead of re-pin.
- **No new committed tests.** There is no behavior change to pin: no exported
  symbol survives, no sampler/adapter/archive/store logic changes, and the
  existing behavioral coverage for the touched UI surface (outcome counts, zero
  eligible ⇒ no stats, stale/rerun, cancel) already exists from the accepted
  ledger lane and stays untouched.
- Run: `npx tsc --noEmit`; `npx vitest run --maxWorkers=2 src/sim/monteCarlo.test.ts
  src/console/data/consoleData.test.ts src/engine/engine.test.ts
  src/engine/ensembleDeterminism.test.ts src/console/stages/SavedRuns.test.tsx
  src/console/store.test.tsx src/application/caseResolver.test.ts`; then
  `node scripts/emit-benchmark-metadata.test.cjs` (fixture-only, no repo
  mutation) to prove the reduced inventory still certifies. Optional once, if
  memory ≥2 GiB: full `npx vitest run --maxWorkers=2`, reporting exact
  file/test counts before/after.

### 6.3 Production-CSP browser proof (changed visible surface)

1. `npx tsc --noEmit && npx vite build`; assert `dist/assets/*.wasm` `sha256`
   equals the probe-executed bytes.
2. Throwaway Playwright script modeled on `scripts/browser-smoke.mjs:1-45`
   (`vite preview` + real `dist/_headers` CSP, Chromium swiftshader,
   1440×1000, two-worker cap), evidence outside Git:
   - wind 15 m/s, 2 runs, sigmas 10/1/5, seed 123 → "No supported footprint",
     five counts visible, no rings, zero-eligible message;
   - wind 3 m/s, same settings → supported footprint, rings + legend
     "… of samples within …", new stat labels "Empirical 50/90/99% radius", both
     new note paragraphs present verbatim;
   - save the project and reopen it: Saved Runs shows the archived ensemble
     settings (10/1/5, seed, `per-run-v2`), "Scenario-only", and the executed
     engine SHA-256 equal to the probe's wasm sha;
   - zero page errors; screenshot(s) captured; preview server and browser
     stopped immediately; no leftover processes.
3. Failure handling: any CSP violation, count mismatch, missing label, or engine
   SHA mismatch stops the lane for review instead of being explained away.

### 6.4 Cleanup

Throwaway probe/config/Playwright script and any `/tmp` artifacts removed after
evidence capture; `git status` ends with only the intended source/doc changes plus
this lane's records.

---

## 7. RMP13 check split — locally closable vs genuinely external

Register today: C01/C02/C04/C07 `not_run`, C03/C05/C06 `in_progress`
(`docs/internal/execution-package/acceptance-register.json`). This lane claims
**no** status change; it delivers a bounded cleanup and names what remains.

| Check | Locally closable by this cleanup | Genuinely external | Exact missing input / role / reopening condition |
| --- | --- | --- | --- |
| **C01** Input distributions | Yes, for the assigned surface: remove the fabricated per-class provenance; state the three sampled inputs, their units/implementation, independence, and the fixed remainder; declare the sigmas scenario assumptions in the sampler contract and the ensemble UI. No numeric change. | Measured per-class (or per-motor) impulse distributions, measured wind-direction and rail-angle spreads, and their correlations. | Input: ≥1 eligible measured dataset with sample counts, measurement method, units and rights, recorded in the RMP02-style eligibility ledger. Role: owner/team data custodian + independent scientific/statistical reviewer. Reopen: only with that recorded source; until then these stay explicitly scenario-only. |
| **C02** Identifiability | No local part. No fit is introduced, changed or claimed here; impulse-vs-drag-vs-mass-vs-weather confounding is not resolved by deleting a suggestion table. | Eligible physical development observations by output/regime plus a predeclared model/discrepancy structure and an identifiability argument. | Input: development flights/measurements with provenance, plus an approved decision record constraining or refusing confounded fits. Role: owner/team + scientific reviewer. Reopen: decision record showing resolvable observation support; confounded cases explicitly refused. |
| **C04** No leakage / roles | No local part: no fitting, scoring, holdout or data-role code is touched; archive/summary fields unchanged. | Declared development/scoring splits, custody of unseen outcomes, dependency-aware statistical unit. | Input: eligible independent outcomes held by a custodian, with signed role/split rules. Role: data custodian + owner authorization + scoring custodian. Reopen: signed split/role record before any scoring; no developer-invented holdout. |
| **C05** Probability meaning | Yes, for the display/contract surface: stop presenting sample fractions as coverage ("Empirical … radius", "… of samples within …"), state zero empirical coverage and that no finite-sample confidence is computed, and separate "input sensitivity" from "predictive probability" in both live and saved views. | Any actual coverage/interval-width usefulness assessment, source/vehicle dependence, finite-sample uncertainty. | Input: independent measured flights across vehicles/sources, a predeclared coverage/width metric and method. Role: owner/team data + statistical reviewer approving the metric. Reopen: eligible flights + approved method; scenario-only software is not physical qualification. |
| **C06** Failure handling | Yes, by preservation: sampler, ledger, five counts, zero-eligible rule, time-limit/unsupported/non-nominal classifications and cancel-discard are untouched; the probe proves identical counts for fixed inputs. No denominator change. | None for the software part (the accepted ledger increment owns visibility). Physical failure-threshold semantics remain unchanged and out of scope. | Reopen condition: only if a future approved decision changes classification semantics; this lane creates no external dependency. |
| **C07** Final freeze | No local part: `docs/internal/execution-package/templates/decision-budget.json` stays `status: incomplete-do-not-freeze-or-score` with nulls. | Approved budgets (input uncertainty, model/numerical error allocation, interval width/area, tolerable risk), frozen metrics, custody and team participation. | Input: recorded owner/team agreement filling the decision budget, plus an independent reviewer signature. Role: owner/team + custodian + independent reviewer. Reopen: recorded and dated budget/decision before any unseen outcomes are authorized. |

No local obligation is reclassified as external, and nothing here is claimed as
PASS.

---

## 8. Risks and disclosures

1. **Engine byte staleness.** The worktree's untracked
   `src/engine/astraea_engine.wasm` is `13da44d5…` (mtime 2026-10-28 22:02Z-04,
   1,827,128 bytes), while the ledger record names integrated `9adeaf2c…`.
   Nothing here proves the on-disk bytes were built from current Rust source. Plan
   §6.1 builds once from current source, records the resulting identity, and uses
   *those* bytes for both the numerical probe and the browser receipt; prior
   recorded identities are neither reused nor rewritten. This is one compile job,
   disclosed, and the coordinator will rebuild again at integration.
2. **Inventory shrinkage** weakens the silent-retirement guard for exactly this
   one suite; explicit reviewed removal is the only sanctioned path, and the
   changelog records it.
3. **Copy-only UI changes** are proven by screenshot, not by a test; a test here
   would be a prohibited wording pin.
4. **Not in scope / not touched:** candidate runtime, calibration eligibility,
   archive schema, physical qualification, RMP13-C03 dispositions, register
   arithmetic, release authority.
5. **Self-acceptance:** none. This proposal ends at your gate.

---

## 9. Decisions requested at this gate

1. Approve cleanup **(a)** (delete module + own suite, strip adverts, reduce the
   three metadata inventories + emitter fixture).
2. Approve one engine build in this worktree for byte-bound receipts (§6.1), with
   root-dependence disclosed.
3. Approve the exact wording in §5.2–5.5, including the stat-label change
   ("Empirical 50/90/99% radius") and the legend change ("… of samples within …").
4. Approve or decline the one-sentence public `docs/accuracy.md` addition (§5.6).
5. Confirm whether the full suite should run once after the edits (memory-gated)
   or whether the focused set + emitter self-test is the required final check.

Stopping here as instructed. No source, test, formatter, build or browser action
has been taken.
