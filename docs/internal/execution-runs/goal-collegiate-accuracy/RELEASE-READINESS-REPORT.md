# Release Readiness Report: collegiate accuracy release candidate

**Status: APPROVED by the owner at hard stop (d), 2026-11-16: "Approve + add legacy sentence".** P9 is accepted as a recorded limit. The legacy-fallback sentence lands through lane A3. Approval does not authorise merging into `main` or pushing. Nothing has been merged to `main`, pushed, tagged or deployed.

## 1. What is being released

| | |
|---|---|
| Candidate branch | `goal/collegiate-accuracy` @ `e95353b` (report commits follow; no code after it) |
| Base | `origin/main` @ `32183fd` (the live site) is fully contained in the candidate (merged at `4721eb3`). Local `main` @ `400fd1c` is one docs-only commit ahead of `origin/main`, and that commit is not in the candidate. A main merge ships the goal branch: the K3, K4, W1, E1, A1 and A2 changes plus internal records |
| Engine WASM | sha256 `4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535`, built from this worktree path after the E1 merge `dc210c4` (Amendment 1: the hash depends on the checkout path). Step 0 was `bc19590b`. E1 changed robustness only; the cohort rows are byte-identical (§2) |

**User-visible changes:**

| Change | Merge | Owner decision |
|---|---|---|
| The improved built-up axial drag is the **default** flight drag. Refused shapes keep the legacy tables, with the reason shown. A declared nozzle exit of 0–1 m carries back-pressure thrust by default. A project with an active legacy-fitted drag calibration stays on legacy drag | K3 `c2b31dd` | Approved at stop (c), 2026-11-15 |
| One line under the Flight apogee: "Typical error ±X % (dev. data, 20 airframes)", with a per-regime in-sample MAE. Withheld, with a reason, for legacy or refused drag, a drag calibration, a missing site temperature, or a run outside the tested range | K4 `3bde5ae` | "Typical error" chosen, 2026-11-15 |
| Banner, model panel and landing accuracy text rewritten to development wording | W1 `d3a2f78` | "Development wording" chosen, 2026-11-15 |
| Engine robustness after the physics review: a nozzle exit wider than the aft body is refused with a clear error; the drag ladder no longer fails under wind (cross-phase nearest fill, or a stated legacy fallback); Cd is rescaled to the solver's reference area; the pressure-thrust term applies only while the motor thrusts; extreme or invalid wind, a motor longer than its mount and a zero-impulse thrust curve return errors instead of trapping the engine | E1 `dc210c4` | In scope of the physics-review fixes; no cohort or template number moved |
| Wording after the physics review: banner "apogee error averaged 5.6–5.9% … (development data)"; the full claim states both input conditions (5.6 % / 18 of 20 with site temperature and nozzle exit set, 5.9 % / 16 of 20 blank) and that refused shapes have no blind test; the error line reads "Average apogee error ±X % (dev. data, 20 rockets; not a limit)"; the "Legacy (supported)" chip is removed and the chooser reads "Change flight model…"; the nozzle hint states the aft-body limit and the sea-level thrust-curve assumption; the ensemble model-status row warns on a refused shape; `docs/accuracy.md`, `README.md`, `release.yml` and a new CHANGELOG entry carry the same claim | A1 `b222574` | Owner wording decisions, 2026-11-16 (two sets) |

**Template apogees** (approved at stop c):

| Template | Before | After |
|---|---|---|
| Alpha III | 298.92375069659687 m | 304.0294885865904 m |
| NASA Student Launch | 532.8435782954323 m | 546.5369328003885 m |
| Spaceport America | 5013.508465461415 m | 5013.508465461415 m (refused shape, flies legacy drag) |

## 2. Benchmark against the step-0 baseline (frozen spec, P1–P10)

| Rule | Result | Evidence |
|---|---|---|
| P1: all 20 | **PASS.** MAE 5.6240 % (limit 5.623962788961215 + 1e-9 pp), 18/20 within ±10 %, bias +0.22 % | Re-run on `4c1ec4ed` after E1 (`out/step3-e1.sh`): cohort rows byte-identical to the pre-E1 step 3. `step3-e1/SHA256SUMS` |
| P2: per regime, T = 0 | **PASS.** Subsonic 5.5414 / 7, transonic 5.4024 / 7, supersonic 6.0662 / 4, each equal to arm B | same |
| P3: blank inputs | **PASS.** Frozen arm C is 5.3534 / 16; the fully blank row is 5.8755 / 16. Both beat arm A (9.6034 / 13) in every regime | same |
| P4: templates | **PASS.** On `4c1ec4ed` after E1: 304.0294885865904, 546.5369328003885 and 5013.508465461415 m, exactly the values approved at stop (c) | `step3-e1/templates.json` |
| P5: suites | After E1: tsc 0; cargo core 276 and engine 161 (13 ignored); browser smoke 54/54 on attempt 3 (attempts 1–2 timed out at load 11–17, no assertion failure); vitest 2232/2234, where one failure was a load flake that passes alone and one was the intended E1 nozzle refusal, with the test updated to the exact new error. Merged tree after A1 and B1 (`5f39c3d`): tsc 0, vite build 0, **vitest 2235/2235**, **browser smoke 54/54** (attempt 4; attempt 1 timed out on a click under load, attempts 2–3 were cut off by T3 server restarts). Native Linux desktop smoke **PASS** (546.5369328003885 m, validity PASS) | `step2-e1/`, `step2-merged/` |
| P6: ARCAS | **PASS.** Retained red only, 15.717557349012338 %, equal to the limit | step 2 |
| P7: development vehicles | **PASS.** The step-0 native checks re-run on the merged engine source: `wiring`, `cohort`, `ensembles` and `dev_vehicles` all exit 0, and every output is identical to step 0 apart from the identity block (verdicts pass, no failures) | `step3-e1/native/SHA256SUMS` |
| P8: coverage (report-only) | In-sample typical band: 11/20 inside (4/8, 4/7, 3/5). Below the 80 % rule, within the 20 % width cap. Not tuned | K4 REVIEW, Amendment 5 |
| P9: performance | **FAIL.** The candidate default on `4c1ec4ed` takes a median 1.683× the per-case time of arm A on `bc19590b`: about 134 ms against 80 ms per flight. Aggregate 1.779×, maximum 2.115× (qu8k), 23 of 23 cases above 1.10×. A/A spread 0.046 %, so the measurement is decisive. The A/B changes options and engine together; the built-up default flies a baseline pass and then the built-up pass [INFERENCE]. Reviewer recomputed every number. **Owner decision, 2026-11-16: recorded as FAIL, carry on; blocking decided at stop (d).** No threshold change | B1 `5f39c3d`, `step3-e1/b1/` |
| P10: built WASM | **PASS.** All post-E1 numbers come from `4c1ec4ed`, built from this worktree | `step2-e1/summary.txt` |

**Honest labelling (Amendment 4).** Every cohort design declares the inputs that arm B uses. So P1 and P2 show that the app's default *sends* arm B's inputs; the accuracy evidence itself is arm B. P3 is the independent check for teams that leave inputs blank.

## 3. Validation

- Physics review, round 1 (DeepSeek V4.1 Flash, 2026-11-16): **REJECT**, with two blocking defects (oversized nozzle exit; drag ladder under wind) and five majors (`step4/PHYSICS-REVIEW-1.md`). Fixed by E1 (engine) and A1 (wording).
- Physics re-review, round 2 (DeepSeek V4.1 Flash, 2026-11-16): **ACCEPT WITH FINDINGS** (`step4/PHYSICS-REVIEW-2.md`). 11 of the round-1 findings are fixed, 3 are recorded limits, and 2 are documentation only. New findings: N1 and N6 (wording) and N2 (nozzle bound skips a flagged motor-mount tube) are pending owner decisions; N3–N5 are recorded.
- **Blind shot (owner stop b, both phases approved 2026-11-16): blind result NOT AVAILABLE. 0 of 12 flights are scorable under the frozen rules.**
  - **Predictions.** The 12 flights were predicted before opening and committed at `cbdef58`, merged at `c9f9ea7`, on WASM `4c1ec4ed` (lane BL1).
    - The motors for 6 flights were missing. One owner-authorised download fetched 4 public ThrustCurve curves (`step4-blind/motors/`).
    - The app's ORK import refuses both designs (stage mass/CG override; nested attributes dropped). The predictions therefore use a declared-design reconstruction (BL1 `PREDICTIONS.md` §1).
  - **Extraction (BX1 `c0f473a`).** A separate agent extracted the outcomes without seeing the predictions and opened exactly 13 sealed files.
  - **Exclusions:**
    - E6 (5 s of pad data) fails on all 12: the loggers start at launch.
    - E3 fails on 6. On four V001 flights this is a barometer-step artefact. Both V002 logs end while the vehicle is still airborne.
    - E4 fails on V002-02, which is GPS-only.

    No rule was changed after opening.
  - **Drag model.** All 12 flights fly **legacy drag** because both designs have freeform fins. Even a scorable result would not have tested the new default model.
  - **NON-BLIND development comparison** (owner decision; relaxed rules labelled; SC1 `bf5a22a`). On 10 Emerald Streak flights the legacy fallback predicts **low**:
    - median −26.3 %;
    - 0/10 within ±10 %;
    - mean |error| 27.9 %;
    - 0/10 inside the 5–95 % band;
    - by motor: D13-10W −40.8 %, C6-5 −31.7 %, QC6-5 −25.8 %, C6-7 −21.2 %.

    The cause is not separated. It is the legacy model, the design reconstruction, or both. Both Vulcanite logs end airborne, so the comparison has no Vulcanite flight.
  - **Reviews.**
    - BL1: Sonnet, ACCEPT WITH FINDINGS. The two low labelling notes are that V002 `axialDrag` is null and that the options show "calibrated" although legacy flew.
    - BX1 and SC1: Sonnet, ACCEPT WITH FINDINGS. Four low wording notes. The main one is that the relaxed-rule ordering cannot be shown from git, so the comparison counts as *labelled* non-blind, not pre-registered.
- **The full 1.0 target is not reachable.** At most 2 sets are scorable here, so the six-vehicle rule and the 14-vehicle coverage proof cannot be met. Under K2, release can still go ahead, with the wording "development result on 20 flights; blind result on N".

## 4. Known limits (no change made, by rule)

| Item | Status | Record |
|---|---|---|
| Space shots (M > 2.5) | About 12 % low on 2 published flights; cause unproven | S1 |
| Refused shapes (elliptical or freeform fins, extra transitions, a tube after the boattail or fin can, …) | Fly legacy drag. The only flown cases come in at −2.5 % and −4.9 % on legacy | S2 |
| "Validity unknown" | On 17 of 20 cohort airframes. The engine merges its domain reasons into one flag, so the cause cannot be named without an engine change | S3 |
| Non-apogee outputs | Report-only, final engine. Time to apogee, simulated − measured, with unsynchronised clocks: Cosmic Cargo +0.52 s (7.97 vs 7.45), Mini DX3 +1.29 s (13.83 vs 12.55), Top Shot −0.69 s (8.15 vs 8.85), Adventurer −1.35 s (22.29 vs 23.65); Top Shot and Adventurer fly legacy drag (freeform fins). Proteus 6 max Mach 2.79 vs a measured 2.94: non-comparable (the source does not define its Mach). Rail-exit speed, stability margin, descent rates and landing drift have **no evidence**. Competition thresholds are not cited in the repo | S4 |
| Team-validation transfer | Dropped: fewer than 2 independent repeat-flight airframes with telemetry | K5 |
| Mini DX3 development rocket | Predicted +13 % to +91 % high (known motor and mass issues). Unchanged since step 0 | step 0 |
| Templates show no error band | They carry no site temperature | K4 |
| Negative base-drag component | The power-on base term can go negative. It scales with (nozzle/max diameter)², so it is not limited to exits near the aft diameter (proteus6 and qu8k). An exit equal to the aft diameter inflates apogee by 4–21 %. A clamp was tried and dropped because it worsened P1/P2 (N5) | E1, review 2 |
| Nozzle bound is geometric | The limit is the aft-body diameter, not the motor diameter; a motor-diameter bound would refuse a required byrum case | E1 |
| Speed | See P9: about 1.7× slower per flight | B1 |
| Nozzle bound and motor-mount flag | The aft-body bound skips a rearmost tube flagged as the motor mount, so an oversized exit can pass there and the error message names the wrong bound (physics review N2). Owner: record, no fix | Review 2 |
| Cross-phase drag fill | When a phase has no eligible ladder rows, the fill borrows the other phase's altitudes, up to about 33 kft. This shifts skin friction; FMJ1 apogee moves −0.3 % (N3) | Review 2 |
| Transonic table resolution | 25 stations under-resolve the transonic Cd peak by 1.4–5.1 % (round-1 finding 8) | Review 1 |
| Site temperature | Cohort temperatures are design inputs on a standard-day basis (round-1 finding 13) | Review 1 |

## 5. Compatibility and identity

- **Forward compatibility:** builds before this release refuse project files that contain `flightDragSource: "legacy"` or `nozzleBackPressureThrust: false`. There is no schema bump (an owner decision).
- **Old projects** re-fly with the new default. Their saved results read as stale ("built-up drag is now the default"). Recorded runs are never rewritten. Archives from the unreleased K3 commits 2–4 restore as explicit legacy.
- **WASM identity depends on the checkout path** (Amendment 1). Release builds must come from a path that reproduces `4c1ec4ed`, or the new hash must be recorded.
- **Engine refusals are new.** An oversized nozzle exit, a motor longer than its mount and a zero-impulse thrust curve now return an engine error. The app's own motor validator already rejects the last two before the engine.

## 6. Still to settle before release

- **P9 FAIL** (about 1.7× slower per flight, roughly 134 ms against 80 ms): does it block release? Owner decision.
- **Legacy-fallback wording.** The public claim says refused shapes "use legacy drag, which has no blind test on those shapes". That is still true. But the non-blind comparison shows legacy drag 26 % low on a small freeform-fin rocket. Owner decision: keep the text, or add the finding (see §7).
- **ORK import gap.** The app refuses both blind designs' ORK files (stage mass/CG override). A user cannot load them as-is. Recorded; no fix in this release.
- The claim keeps "blind test pending" for the new default model. No blind data in custody exercises it.
- Windows and macOS native smoke: not run, no host.
- T1 negative control: not run. The clean smoke passed.

## 7. Recommendation

**Approve this candidate as a beta release, with one wording change first.**

- The new default drag model meets every frozen accuracy rule on the development cohort:
  - P1–P3 pass and match step 0 byte for byte after E1.
  - Templates are exactly as approved.
  - Suites, smoke, desktop smoke and the development vehicles all pass.
  - Two independent physics reviews end in ACCEPT WITH FINDINGS, with every blocking defect fixed.
- Its accuracy evidence is still development data only. The public text says so.
- P9 is a real FAIL, but the absolute cost is about 0.05 s per flight. Recommendation: accept it as a recorded limit.
- The blind shot produced no blind score and did not test the new model. The non-blind comparison suggests the legacy fallback can be badly low on some shapes. Recommended wording change, a small app/docs lane before release, owner-approved text:

  > "Shapes it cannot model use legacy drag, which has no blind test on those shapes; on one small rocket with freeform fins it predicted about 26% low (10 flights, development comparison)."

Approving this report does **not** authorise merging to `main` or pushing; that remains a separate owner action (it deploys the website).
