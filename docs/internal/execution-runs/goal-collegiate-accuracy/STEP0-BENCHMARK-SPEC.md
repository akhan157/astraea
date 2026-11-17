# Step 0: frozen benchmark, pass rules, blind protocol, sealed list

Status: **FROZEN 2026-11-14 (revision b, commit `1dc199e`), owner-approved at gate (a); see §8.** ⟨L0⟩ values pending.

- Approval freezes the **rule forms** in §4 and the lists in §3 and §6.
- The numeric thresholds marked ⟨L0⟩ are filled by lane L0 from the baseline WASM
  `bc19590b…` **before any model change**, and are then fixed.
- After approval this file changes only by a dated amendment made before the candidate it
  applies to is measured. No model change has been made on this branch.

Baseline runs: [STEP0-BASELINE.json](STEP0-BASELINE.json). Raw outputs are outside Git at
`astraea-evidence/goal-collegiate-accuracy/step0/` (`SHA256SUMS`).

## 1. Baseline identity

| | |
|---|---|
| Source | `goal/collegiate-accuracy` @ `9801ad7`. The engine equals option-2 `ea8d633` except: `serde_json` gains the `float_roundtrip` feature in both crates; the `float_roundtrip.rs` test; one fixture |
| WASM | sha256 `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`, 2,072,808 bytes |
| WASM determinism | same hash from an incremental rebuild **and** from a clean build in a fresh `CARGO_TARGET_DIR` |
| Cohort run | native engine through `appbound_bundle_cohort.rs`. This is not the app path; see G-1 |

## 2. Baseline (published cohort, 20 airframes; qu8k reported separately)

Values are per-airframe median apogee errors. The arms are pinned to the harness code
(`absent_options` / `bundle_options` in `appbound_bundle_cohort.rs`):

| Arm | Vehicle | Options |
|---|---|---|
| **A** (today's app default) | frozen manifest vehicle, including its `nozzleExitDiameter` field and nose `tipRadius` | manifest `options` only: no drag source, no site temperature, no nozzle option |
| **B** (improved, inputs given) | same vehicle | A plus `flight_drag_source="calibrated"`, `launch_site_temperature_c` from the manifest's °F, and `nozzle_exit_diameter` copied from the vehicle field |
| **C** (improved, inputs blank) | vehicle with nose `tipRadius` removed | A plus `flight_drag_source="calibrated"` only: no site temperature, no nozzle option. **Not run yet (G-2)** |

Native-engine figures (the WASM figures from L0 replace these as the thresholds):

| Regime (frozen membership, §3) | n | A: MAE / within ±10 % / bias | B: MAE / within ±10 % / bias |
|---|---:|---|---|
| Subsonic < 0.8 | 8 | 7.0200 % / 6 / +5.85 % | 5.5414 % / 7 / +2.85 % |
| Transonic 0.8–1.5 | 7 | 7.5693 % / 6 / +4.61 % | 5.4024 % / 7 / −0.66 % |
| Supersonic ≥ 1.5 | 5 | 16.5845 % / 1 / −5.69 % | 6.0662 % / 4 / −2.76 % |
| All 20 | 20 | 9.6034 % / 13 / +2.53 % | 5.623962788961213 % / 18 / +0.217 % |

qu8k (M 3.44): A −29.70 %, B −12.24 %.

This matches the 2026-11-11 option-2 run to within last-digit float noise (about 1e-14
relative, inside the harness's 1e-12). This is consistent with the `float_roundtrip` parse
change, for example a nozzle exit of `0.12192` now read where `0.12191999999999999` was read
before.

Other baseline results:

| Check | Baseline result |
|---|---|
| Three templates (app's own requests, `preset-compare.probe.ts`) | Alpha III 298.92375069659687 m, NASA SL 532.8435782954323 m, Spaceport 5013.508465461415 m; every probed field identical to option-2 WASM `445098…` |
| Core / engine suites (`-j 2`, 2 threads) | 273/0/0 (5 suites); 157/0/7 (20 suites) |
| P1 frozen gate (`p1_*` engine tests) | all pass |
| `pnpm test:arcas-runtime` | pass |
| `pnpm benchmark:arcas` | 4 pass, 1 **retained red**: CA transonic ARCAS-short 15.717557349012338 % vs the 15 % research target. RMP08 recorded the same value |
| Dev vehicles (harness) | pass. Adventurer −4.91 %, Top Shot −2.48 % (both refused by improved drag, so they fly default drag). Mini DX3 +29.01 %, Cosmic Cargo +24.58 % (cause unresolved) |
| Ensembles (harness) | pass |
| Validity label | 19 of 23 flights UNKNOWN, 4 PASS |
| Uncertainty coverage on cohort | **not run**, no harness (G-3). Last record: R5 r3, 4 dev airframes, 2/4 covered, width 25.94 % |
| Performance | **Same-build A/A on this host: committed-run median 3769 vs 2352 ms (−37.6 %) for identical code.** Flight per-case times vary up to 2.4× (113–276 ms). Host heavily loaded (13 GiB swap). Baseline `dist` archived |
| `neutrality` harness test | Fails: qu8k, proteus6 and iondrive move materially from the R40/R41 research literals; the rest differ in the last digits only. Our `b0` matches the 11 Nov option-2 run. It was not run in that run's suite either. [INFERENCE] The cause is the E-1b base drag in the app engine plus `float_roundtrip`. Not treated as a regression of this branch |

## 3. Frozen regime membership (by name, never recomputed)

- **Subsonic:** byrum, calisp1, calisp2, calisp3, cancerdescending, ezi65, gibb, thunder-lightning.
- **Transonic:** blister, calisp4, calisp5, iondrive, rabia (2 flights), raven, torrent.
- **Supersonic:** dontdebatethis, full-metal-jacket (2 flights), kinsel, l500roc, proteus6.
- **Reported, excluded from the primary line:** qu8k.

## 4. Pass rules for the release candidate

- **"Candidate default"** is the candidate build's arm-A flight: the frozen manifest
  vehicle with manifest options, through the candidate's own defaults.
- All thresholds ⟨L0⟩ are the **WASM** baseline values on `bc19590b…`.
- Comparisons are exact. A 1e-9 pp tolerance absorbs printing noise only.

| # | Benchmark | Pass rule |
|---|---|---|
| P1 | Cohort, all 20 | Candidate default MAE ≤ ⟨L0: arm-B MAE⟩ **and** within-±10 % count ≥ ⟨L0: arm-B count, 18 native⟩ **and** \|mean signed\| ≤ 5 % |
| P2 | Cohort, per regime | In each regime: candidate default MAE ≤ ⟨L0: arm-B regime MAE⟩ + **T** and within-±10 % count ≥ arm-B count. **T is owner choice Q1** |
| P3 | Blank inputs (K3 guard) | Arm C on the candidate is no worse than ⟨L0: arm-A⟩ in **every** regime, by MAE and by within-±10 % count. If it fails, K3 does not become the default for designs with blank inputs |
| P4 | Three templates | Identical to baseline WASM on every probed field, except changes explained by an owner-approved default change, each listed. Any template change is hard stop (c) |
| P5 | Suites | 0 failures in core and engine; no test removed or newly ignored without a recorded reason |
| P6 | ARCAS + P1 gate | `test:arcas-runtime` passes; `p1_*` pass. `benchmark:arcas` has no new failure; the retained red stays ≤ 15.717557349012338 % |
| P7 | Dev vehicles + ensembles | Harness tests pass. Top Shot and Adventurer stay within ±10 % with \|error\| no larger than baseline. Mini DX3 and Cosmic Cargo are reported, not gated |
| P8 | Uncertainty coverage | Cohort fraction inside the 5–95 % range and the band width are reported against the 80 % rule and the 20 % cap. **A miss is reported, never tuned.** It blocks release only if the owner says so at step 5 |
| P9 | Performance | **Owner choice Q2** (§7). The A/A spread above rules out a fixed 1.10× rule on this host |
| P10 | WASM identity | Step 3 numbers come from the candidate's built WASM through the L0 runner |

Also binding:

- No tuning to sealed or held-out data.
- No threshold, tolerance or fixture changes to make a check pass.
- A model change that fails P1–P3 is dropped and recorded.

## 5. Lane L0 (tests-only; before any model change)

| Gap | L0 builds | Done when |
|---|---|---|
| G-1 | Cohort runner through a built WASM, the app's path | Runs arms A and B on `bc19590b…` and records the WASM-vs-native delta per flight. Any delta above 1e-12 relative is **reported, not hidden**; the WASM values become ⟨L0⟩ |
| G-2 | Arm C as defined in §2 | Baseline C table on WASM recorded |
| G-3 | Cohort coverage from the app's ensemble 5–95 % per airframe | Baseline coverage and width recorded |
| G-4 | Regime summarizer using §3 | Reproduces §2 exactly from the native `cohort.json` |

- L0 changes no engine or app source.
- Author: codex `gpt-6.1-terra`, medium effort (owner instruction; overrides `routing.md`).
  Reviewer: non-OpenAI.
- The orchestrator reruns its outputs and writes the ⟨L0⟩ numbers into this file by dated
  amendment.

## 6. Blind protocol (adapted for already-flown sealed data)

Adapted from `docs/flight-validation/blind-cohort-protocol-DRAFT.md` (`accuracy/integration` @
`a055cca`, written for new flights) and `mini-dx3-protocol.md`.

1. **Qualify inputs from design files only** (ORK, report vehicle pages) before any outcome is
   read. Record every assumed input and its uncertainty. A set that cannot be qualified is
   reported as "not qualified".
2. **Write exclusion rules first:** logger loss, CATO, recovery failure, or no usable altitude
   channel. A flight is excluded only by a rule written here before opening.
3. **Freeze** source SHA and WASM hash. Commit nominal predictions and 5–95 % intervals for
   every flight to Git **before** opening.
4. **Extraction rule, frozen:**
   - Pressure logs: altitude above the pad from the median of the 5 s before liftoff;
     apogee is the maximum of a centred 5-sample running median.
   - GPS-only logs (DD Vulcanite F001): maximum GPS altitude above the pad median, reported
     with "vertical uncertainty unstated".
   - Reports: the stated peak quantity named at qualification.
5. **Open once, per set.** Each opening is owner hard stop (b). Where possible a different
   agent from the predictor extracts the outcomes.
6. **Score every flight:**
   - per-airframe median, by regime;
   - ±10 % per vehicle, ±5 % mean, interval coverage.
7. **No model change after prediction.** A later change turns these into development data,
   and that is recorded.

### Sealed list

Custody: `R6-public-cohort/blind-manifest.json` (sha256 `39a00910…acd7`, 29 objects, every
read logged). Eligibility: R6a `eligibility-manifest.json` @ `0f3d131`.

| Set | Flights (sha256 prefix) | R6a status | Caveat |
|---|---|---|---|
| Estes Emerald Streak (V001) | **10 flights**, 2017-03-09: C6-5 ×3 (`013c6fd5`, `cbb9fb42`, `de709932`), C6-7 ×3 (`6069b319`, `70ca39f9`, `7bef1aff`), D13-10W ×1 (`331cb649`), QC6-5 ×3 (`9be8158f`, `11f0326a`, `09e271ff`); ORK `c10b507d` | qualified_blind | Freeform fins (improved drag refuses them, so they fly default drag). 1 g page-vs-ORK mass gap; weather and rail not recorded; header bytes read only |
| LOC DD Vulcanite (V002) | **2 flights**: I140W-14 2023-02-11 (`0d43f917`, GPS-only), J270W-14 2023-07-08 (`bf706a9e`); ORK `7ccec265` | qualified_blind | CG page-vs-ORK gap 34.9 mm; rail length not recorded |
| NASA SP-109 Bio-Space Arcas, 2 flights | report `07d89dce…` (R14) | sealed; **split undecided** | No CG or inertia. ARCAS geometry is already development data. **Custody unverified:** file not found on this host by name or hash |
| Deacon whole flight (NACA RM L8H26) | `ccb29240…` | held-out | **Partly exposed** (R29 EXPOSURE.md). **Custody unverified** on this host |
| Zenodo flight database v1.0.0 (V012) / v1.2.0 (V013) | zips `23282f39`, `83bd1d9f`, listed, not extracted | sealed; **split undecided** | Overlap with the cohort must be checked by a custodian. A loose `S06-zenodo/V013/flight_comparison.csv` is **not in the custody manifest**: provenance and read state unknown, left unopened |

Left out, with the rule that excludes each:

| Set | Rule |
|---|---|
| Mini DX3 F67W (V006) | **Already spent:** pre-registered blind holdout scored 2026-10-21 (`d824b23`, FAIL). The orchestrator saw its residuals in that commit message on 2026-11-14. Development only (owner question Q3) |
| Standard Vulcanite (V003) | R6a ineligible: same family as V002, mass contradiction, exposure incident INC-R6-001 |
| Bella Lui (V009), NDRT 2020 (V010) | R6a ineligible: already exposed, no ORK |
| Valetudo (V011, collegiate) | R6a pending: measured mass/CG missing, exposure audit needed. Stays sealed; not scorable without those inputs |
| Adventurer, Mini DX3 G69N, Top Shot | Development data |

**Honest arithmetic:** at most 4 airframes can be blind (Emerald, DD Vulcanite, SP-109,
Deacon), plus whatever Zenodo yields. Two of these (SP-109, Deacon) have custody unverified
here. The six-vehicle rule and the 14-vehicle coverage proof are not reachable. The report will
say so (K2).

Component-level held-out reports (split addenda 2026-11-07/08/09) are also read only once.
Reading one for a step-1 law lane is proposed as its own owner stop.

## 7. Owner questions at this gate

- **Q1 (P2 tolerance T):**
  - **0 pp (strict, recommended):** any change that trades even 0.01 pp between regimes is
    dropped.
  - **0.25 pp:** allows small trades, but gives tuning room.
- **Q2 (P9 performance):**
  - **Engine-only, recommended:** `measure-flight` on both WASMs, interleaved, ≥ 10 rounds in
    one session. Pass if the candidate median per-case time ≤ 1.10 × the baseline median **and**
    the same-session A/A spread is under 10 %; otherwise rerun on a quiet host.
  - **Report only:** no gate.
- **Q3:** Reclassify Mini DX3 F67W as development (recommended), or keep it listed and report
  any re-score as development anyway.
- **Q4:** Approve this spec as frozen, with L0 as the next lane.

## 8. Owner decision record (2026-11-14, gate a)

| Question | Decision |
|---|---|
| Q4 freeze | **Approved**: spec frozen; lane L0 next |
| Q1 P2 tolerance | **T = 0 pp** (strict) |
| Q2 P9 | **Engine-only A/B**: `measure-flight` on both WASMs, interleaved, ≥ 10 rounds in one session. Pass if candidate median per-case ≤ 1.10 × baseline **and** the same-session A/A spread < 10 %; otherwise rerun on a quiet host |
| Q3 F67W | **Development data**: removed from the blind pool |

## Amendment 1, 2026-11-15: WASM identity depends on the checkout path (clarification; no rule change)

**What was observed.** The L0 lane rebuilt the engine from identical source and got
`a47fa4cc…`, not `bc19590b…`. The embedded checkout path differs (13 occurrences in each
binary).

**Probe.** `git archive` of `29ac1b7` and `0684feb` (L0 = `29ac1b7` plus one docs file), each
built from the same `/tmp` path:

- both gave `1ee760539b2a316ac5a5da5d6bd0bfbe9a4008c39e65a5514b4143b239604c91`;
- neither gave `bc19590b`.

The hash therefore depends on the build path, not on the source.

**Rules from now on:**

- The baseline WASM is the **archived file**
  `astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm` (sha256 `bc19590b…`).
  It is loaded as-is and never rebuilt.
- Candidate WASMs are built from this goal worktree's path
  (`~/.paseo/worktrees/3s8t98rp/goal-collegiate-accuracy`).
- Every recorded WASM hash states its build path.
- The release report will state that a binary is identified by its hash plus its build path.

## Amendment 2, 2026-11-15: G-3 baseline is "no product apogee interval" (clarification; P8 stays report-only)

**Finding (L0 author, verified by the orchestrator):** the app ensemble (`run_ensemble`,
`run_ensemble_chunk`) returns landing points only. `LandingPointDto` has `x` and `y` only
(`crates/astraea-engine/src/models.rs:1687`). The app's dispersion statistics are landing
radii r50, r90 and r99 (`src/sim/monteCarlo.ts:366`). Apogee intervals exist only in
validation scripts (for example `src/validation/miniDx3`), not on the result screen.

**Baseline record for P8:** the baseline product shows **no apogee 5–95 % range**, so
cohort coverage by a product interval is 0 of 20 by construction. L0 does not build a
test-only stand-in, because that would measure something the product does not ship.

**From now on:** P8 is evaluated on the apogee range the candidate actually shows the user
(K4's expected-error line or an ensemble apogee band), with the coverage and width definitions
of L0 amendment A2. It is still reported against the 80 % rule and the 20 % cap. It is still
never tuned, and it blocks release only on the owner's word.


## Amendment 3, 2026-11-15: ⟨L0⟩ thresholds filled from the baseline WASM (L0 merged `848e7f2`)

**Source.** L0 (tests-only), with independent review ACCEPT WITH FINDINGS (none blocking).
The values come from the WASM cohort runner on the archived baseline `bc19590b…`, and the
orchestrator reproduced them in the merged tree. Native and WASM agree to ≤ 6.43e-16 relative
in every arm, so the native §2 numbers stand as WASM numbers. Evidence:
`astraea-evidence/goal-collegiate-accuracy/L0/` (`summary.json` sha256 `474947bf…1f68`).

Per-airframe median apogee error on the baseline WASM, shown as MAE % / within ±10 % / mean
signed %:

| Regime | n | Arm A (default) | Arm B (improved, inputs given) | Arm C (improved, inputs blank) |
|---|---:|---|---|---|
| Subsonic | 8 | 7.020023422666488 / 6 / +5.8487 | 5.5414374411119525 / 7 / +2.8514 | 4.505418193280608 / 7 / -0.5582 |
| Transonic | 7 | 7.569323699418518 / 6 / +4.6083 | 5.402402089749961 / 7 / -0.6639 | 5.191765141841592 / 6 / -4.2559 |
| Supersonic | 5 | 16.58446759358418 / 1 / -5.6899 | 6.066188324415789 / 4 / -2.7641 | 6.936313550332696 / 3 / -6.5099 |
| All 20 | 20 | 9.603389562259121 / 13 / +2.5299 | 5.623962788961215 / 18 / +0.2172 | 5.353363464539974 / 16 / -3.3403 |

qu8k: A -29.6969 % / B -12.2366 % / C -18.3526 %.

**Thresholds, now fixed:**

- **P1:** candidate default all-20 MAE ≤ `5.623962788961215` %, within ±10 % ≥ 18, and |mean signed| ≤ 5 %.
- **P2 (T = 0):** in each regime, candidate default MAE ≤ the arm-B regime MAE above, and the
  within count ≥ the arm-B count.
- **P3:** candidate arm C is no worse than the **arm-A** row above in every regime, by MAE and
  by within count. The baseline arm C already meets this: subsonic 4.51 vs 7.02, transonic
  5.19 vs 7.57, supersonic 6.94 vs 16.58; counts 7/6/3 vs 6/6/1.

**Observation for K3 (not a rule change):**

- Arm C has a lower all-20 MAE than arm B (5.35 vs 5.62 %) but only 16 of 20 within ±10 %,
  a −3.34 % bias, and a supersonic regime of 6.94 % / 3 of 5.
- A K3 default that equals arm C on the manifest therefore **fails P1** (16 < 18) and **fails
  P2** on transonic and supersonic.
- To pass, K3 must make the default flight carry what arm B carries: site temperature from the
  launch site, and the nozzle exit and nose tip radius when the design declares them.
- Arm C still keeps the vehicle's `nozzleExitDiameter` field (review finding 5a).

## Amendment 4, 2026-11-15: "candidate default" for P1/P2 goes through the app derivation (before any candidate is measured)

**Why.**

- The cohort manifest's engine `options` carry only rail, altitude and wind. The site
  temperature lives in `vehicle.launchSite.temperatureK`, which neither the engine DTO nor the
  app reads.
- So L0 arm A, which sends the manifest DTO straight to the engine, can never see an
  app-level default.

This was found by the K3 author at Gate 1 and verified by the orchestrator:
`src/application/caseResolver.ts:112-122`, manifest keys. It is a measurement definition, not a
threshold change.

**Definition.** "Candidate default" in P1/P2 means:

1. Each manifest vehicle is converted by a documented, committed adapter:
   - `launchSite.temperatureC = temperatureK − 273.15`;
   - `nozzleExitDiameter` and nose `tipRadius` are copied as declared;
   - no explicit drag choice and no `nozzleBackPressureThrust` flag.
2. It is then run through the candidate app's `flightRunOptions`, the dispatch path every app
   run uses, on the candidate WASM.

Thresholds stay as in Amendment 3. The 1e-9 pp printing tolerance in §4 covers the °F→°C vs
K→°C last-digit difference.

**Honest labelling (binding on the Release Readiness Report).**

- On the cohort, every design declares the inputs arm B uses. P1/P2 then check that the app's
  default sends arm B's inputs; the accuracy evidence itself is arm B.
- The report must say this, and must require **per-flight option equality with arm B** as
  part of P1.
- The independent check that the default helps a team that enters nothing is **P3**, arm C on
  the candidate.

**Also measured and reported, not gated:** "arm B without the nozzle option", which isolates
the back-pressure thrust term the default now carries.

## Amendment 5, 2026-11-15: P8 aggregation for a per-regime ± band (K4)

**Why.** Amendment 2 points at "L0 amendment A2" for the coverage and width definitions, but L0 committed no written text for them. K4 asked how airframes with more than one flight count. This amendment fixes the rule before any K4 band is chosen. It is consistent with the per-airframe medians that §2 and §4 already use.

**Error.** For each airframe, e = the median over its flights of (sim − measured) / measured. This is the same e that the regime MAE uses.

**Coverage.** An airframe is *inside* a band of ±X % when |e| ≤ X. P8 coverage for each regime is the number of airframes inside divided by the number of airframes in the regime. It is reported over all 20 as well.

**Width.** 2X, as a percentage of nominal.

**Honesty.** Every band measured this way is **in-sample**: it is measured on the same 20 airframes the model was chosen on. A band set to the regime's maximum |e| covers 100 % by construction, and the report says so. P8 stays report-only: X is never tuned toward 80 %, and a miss blocks release only on the owner's word at step 5.

**Regime of a user run.** The regime comes from the run's maximum Mach: below 0.8 subsonic, 0.8 up to (but not including) 1.5 transonic, 1.5 and above supersonic. On the candidate WASM all 20 cohort airframes fall in their frozen-name regime with this rule (K4 probe, `astraea-evidence/goal-collegiate-accuracy/K4/cand.json`, sha256 `be7d0ef2…`). The frozen §3 membership is still by name and is not recomputed.
