# Goal: target-level accuracy for every rocket Astraea can build

> Copied 2026-11-14 from `accuracy/integration` @ `a055cca` (`docs/internal/accuracy-research/GOAL-general-rocket-accuracy.md`) onto the goal branch `goal/collegiate-accuracy` (base `main` @ `a57a7c8`). This copy is the working record from here on. **Revision 3 at the end governs.** Research-branch paths below refer to `accuracy/integration`.

Status: **proposed 2026-11-14, revised the same day (revised twice; **Revision 3 at the end is the governing version** and takes precedence over §1, §4, §5 and Revision 2 where they differ); not started.** Written by the control session (Claude Fable 5.2)
at the owner's request ("a goal that encompasses all of the above … a general rocket creator …
that level of accuracy for all rockets … without compromising the app"). Owner decisions G0–G6
below are open. No lane is dispatched, nothing is pushed, no sealed source is opened.

Pins: app engine = `main` @ `a57a7c8` (local, not pushed; engine source equals the app-bound
option-2 line `ea8d633` plus the float-roundtrip fix). Research = `accuracy/integration` @
`dd38088`. The graded identity for this goal is the **app engine on `main`**, not
`accuracy/integration`, which carries default-on E-1 and E-7 that the app does not ship.

Relation to other records: this goal sits above
`docs/internal/accuracy-research/GOAL-library-grade.md` on `accuracy/integration` (per-feature evidence map; stays active, not
rewritten) and the adopted
no-new-flights plan (`docs/internal/accuracy-research/flight-accuracy-without-new-flights-plan-2026-11-10.md` on `accuracy/integration`) (Phases 1–3 done;
its Phase 4 is re-timed by decision G2). The numeric target is the one in `docs/road-to-1.0.md`;
nothing here relaxes it.

## 1. End state

Astraea is a general rocket creator, so the claim must hold per rocket type, not for one
showcase set. The goal is finished when **every cell of the envelope matrix (§3) is one of**:

- **Proven**: blind result meets the target on that class, with the frozen source SHA and WASM
  hash; or
- **Labelled unproven in the app**, on the result the user sees, with the measured development
  error for that class and the exact data that would prove it.

An honest "this class is unproven, here is why" counts as done for that cell. A claim without a
blind result never does. [INFERENCE] With the data held today, most cells will end as labelled,
not proven; §6 lists the external inputs that change that.

## 2. Target

Unchanged from `docs/road-to-1.0.md`: per-vehicle median apogee error within ±10 %; mean of
vehicle medians within ±5 %; ≥ 80 % of blind flights inside the predicted 5–95 % range (model
uncertainty included); ≥ 6 blind vehicles from ≥ 2 sources; every flight reported.

Gaps in the target itself, to be closed by decision G4, not invented here:

- It covers apogee only. Stability margin, max speed/Mach, time to apogee, descent rate and
  landing have no numeric target and no measured dataset (scorecard ST-02, DY-01–03, recovery).
- Its public scope is single-stage subsonic. "All rockets" is a scope change (decision G1) and a
  dated edit to a public doc; this goal does not edit `docs/road-to-1.0.md` or `docs/accuracy.md`.
- Six vehicles is a pooled count. A per-class claim needs vehicles in each class (decision G1).

## 3. Envelope matrix (backbone; to be completed in Phase 0)

What the app can build and fly today, from `src/core/types.ts` and the engine (`main`):

| Axis | Values |
|---|---|
| Staging | single-stage only: the engine manifest lists "multi-stage separation and staging events" as unsupported scope (`models.rs`), and stage composition is a design proposal only (`docs/internal/stage-composition-ui-design.md`). No cluster support found `[INFERENCE]`; confirm in Phase 0 |
| Nose | conical, ogive, parabolic, von Karman, elliptical; optional tip radius |
| Body | tubes, conical transitions, boattails |
| Fins | trapezoid, elliptical, freeform; cross-sections square, rounded, double-wedge, airfoil |
| Motors | bundled certified, imported `.eng`/ThrustCurve, user-designed BATES grains |
| Mach | subsonic, transonic, supersonic (to about M 3) |
| Size | model (Mini DX3 class) to high-power/collegiate |
| Outputs | apogee, max speed/Mach, stability margin/CP, rail exit, descent and landing |

Known coverage facts that shape the matrix:

| Fact | Source |
|---|---|
| Calibrated drag (the 9.56 % → 5.62 % gain) is opt-in and **refuses** elliptical fins, freeform fins, extra transitions and a body tube after the boattail or fin can; those fly legacy drag | `crates/astraea-core/src/calibrated/from_vehicle.rs`; R44 |
| Small model rockets read +25–30 % (Mini DX3, Cosmic Cargo); **cause unresolved**: R7 found Mini DX3 unexplained after measured Cd, thrust and mass, and Cosmic not explained by mass or drag | R7, R40, R41 |
| Legacy base drag disagrees with measurement power-off; boattail law fails held-out (E-1) and stopped twice (E-2) | R33, R34, R46 |
| Nose pressure drag and transonic rise disagree or are unqualified; no measured ogive data held | scorecard DR-03, DR-07; R35 |
| CNα at incidence lacks crossflow lift; CP has no agreed band | scorecard ST-01, ST-02; R36 |
| Uncertainty band width 25.9 % vs 20 % cap; no model-discrepancy term | R5, roadmap M-5 |
| Protuberance drag is 0.0 on flight; declared surface finish is inert | scorecard DR-06, DR-02 |
| 14 of 23 published-cohort flights are supersonic; user-designed motors have no flight evidence | R40; scorecard PR-01–04 |
| The cohort figures were run on the app-bound source (`ea8d633`); **no record found** of a rerun on `main`'s built WASM | appbound records searched 2026-11-14; plan done-when 2 |

## 4. Owner decisions (open)

| # | Decision | Recommendation | Why |
|---|---|---|---|
| G0 | End state: a class with no blind data finishes as **labelled unproven in the app**, not as proven. This is narrower than "target accuracy for all rockets". | Accept, as the only honest end state with the data held; the alternative is to keep the goal open until G5 data arrives for every class | The owner asked for accuracy on all rockets; this row makes the reduction explicit. The per-class label is new UI and is the owner's call (standing preference: minimal UI change). |
| G1 | Scope: "all rockets" = every single-stage rocket the app can build, judged per class in §3. Multi-stage and clusters stay out until the app can build them. | Yes | It matches the product; a pooled number hides weak classes. |
| G2 | When to spend the sealed flights (Emerald Streak, LOC DD Vulcanite, Mini DX3 F67W, SP-109 Arcas, Deacon, Zenodo). | **Hold** until the model is frozen for this goal (after Phase 3) | Any later model change turns blind flights into development data. This goal means more model changes, and the sets can be used once. This supersedes "run Phase 4 next". |
| G3 | Lift pause D5 on the legacy-law work (E-2 boattail, E-4 crossflow) and add coverage for the shapes calibrated drag refuses. | Yes | D5 assumed flight moves to calibrated drag. It cannot for elliptical/freeform fins and multi-transition bodies, so those classes still fly the legacy laws. |
| G4 | Set targets for outputs beyond apogee. | Have Phase 0 propose them from what can be measured; owner approves | No numbers should be invented without a measurement method. |
| G5 | External data: outreach to teams (`docs/team-data-request.md`), public report downloads, sweep spend (about US$2.42 of US$5 used), nozzle exit diameters, a weighed model-rocket flight. | Approve outreach drafts and public downloads; decide spend and measurements case by case | The six-vehicle rule, the 80 % coverage proof (14 vehicles) and the small-rocket error cannot close from data in hand. |
| G6 | Calibrated drag on by default, and the reference-provenance decision it rests on. | Decide only after the blind result (Phase 4) | A default change moves every user's numbers. |

## 5. Phases

Each phase is split into bounded lanes under the orchestrator workflow: Gate 1 design note,
independent review by a different model family, merged-tree checks. Engine lanes are serial.

| Phase | Work | Type | Needs |
|---|---|---|---|
| 0 | Complete the §3 matrix cell by cell (grade, development error, data held, data needed). Rerun the 23-flight cohort on `main`'s built WASM. Propose non-apogee targets. Write back the stale hand-off state. | local, records + tests | G1 |
| 1 | Close model gaps by class, largest measured error first: calibrated-drag coverage for refused shapes or a qualified legacy path; base/boattail re-derivation; nose/transonic; crossflow CNα; protuberance and finish. A gap with no measured data stops at Gate 1 and becomes an "unproven" label, not a tuned law. | local, engine | G3 |
| 2 | Honest uncertainty: add a model-discrepancy term so the 5–95 % range covers 80 % of flights. **Tension:** that term widens a band already at 25.9 % against the 20 % cap, so both rules may not be reachable together; if so this phase ends in an owner stop, not a tuned band. | local, engine | Phase 1 residuals |
| 3 | Data: qualify inputs for the sealed sets; outreach and public sources for more independent vehicles per class; small-rocket mass measurement. | **external** | G5 |
| 4 | Freeze source and WASM, commit predictions, open the sealed sets once, report every flight by class. | records, irreversible | G2, Phases 1–3 |
| 5 | Ship: per-class "proven / unproven" label on results; defaults (G6); public wording stating only results that exist. | app + docs | G6, owner OK to push |

## 6. Local vs external

| Item | Kind | Unblocking input |
|---|---|---|
| Matrix, cohort rerun on `main` WASM, coverage and law lanes, uncertainty term, in-app labels | local | owner go on G1, G3 |
| ≥ 6 blind vehicles from ≥ 2 sources, per class | external | one more qualifying vehicle (Zenodo or a new flight), then more per class via team outreach |
| 80 % coverage proof | external | 14 independent vehicles (R5); 2 found so far |
| Small model rockets | external | a weighed, measured Mini DX3/Cosmic airframe or a weighed repeat flight (needed to find the cause; not a known fix) |
| Nozzle back-pressure by default | external | source-backed nozzle exit diameters |
| Ogive nose drag; conical boattail series; fin edge drag; lug increment | external | measured datasets named in scorecard DR-03/04/05/06 |
| Stability, damping, weathercocking | external | a flight with measured attitude and wind |

## 7. Protecting the app (non-negotiable)

- Every engine change reaches the app opt-in first, with an identity proof that no-option
  flights are unchanged on the three templates.
- App-bound branches are cut from the app line, never from `accuracy/integration` (the
  `2472314` lesson: that merge carried default-on research laws).
- Full build, unit suite and browser smoke on the merged tree for every bundle; built-app
  check for anything the user sees.
- No tuning to held-out or sealed data; no threshold, tolerance or fixture changes to make a
  check pass; failed attempts are kept.
- No physical gate is promoted from software checks. The register moves only on measured data.
- A default change, a push, spend, outreach, a download or opening a sealed source each need
  their own owner OK.

## 8. Done when

1. The §3 matrix is complete and every cell is Proven or Labelled per §1.
2. The shipped build reproduces the recorded cohort and blind tables by WASM hash.
3. One blind score per held class is recorded, pass or fail, every flight reported.
4. The app shows the per-class status on results, and `docs/accuracy.md` states exactly those
   results and the open gaps.
5. Default flights on the three templates are unchanged except by owner-approved default changes.

## Revision 2 — 2026-11-14: collegiate priority and the middle ground (owner direction)

Owner, 2026-11-14 (dictated, paraphrased closely): new flight data **cannot be obtained** ("I already
looked online and I couldn't get flight data for every single version"). The aim is a middle
ground: designs accurate enough for teams to rely on, plus "an extra layer of validation on their
end for their rocket". Priority is **collegiate-level rockets**, highest accuracy there first.

Control-session reading, recorded: "rockets that are going to orbit" is read as **high-altitude
collegiate and space-shot single-stage rockets** (IREC 30k, the M ≥ 2 rows below). Orbital
vehicles need staging and guidance the app does not have, so they stay out.

### What changes

- **New flight data is not a dependency.** §6's outreach and new-flight items become optional
  upside, not blockers. The sealed sets (Emerald Streak, LOC DD Vulcanite, Mini DX3 F67W, SP-109,
  Deacon, Zenodo) are now the **only** blind evidence available, so the G2 hold stands: spend them
  once, after the model is frozen.
- **The finish line is three layers, not "proven per class"** (replaces §1 and G0):
  1. **Best default model for the collegiate class**, measured on the published cohort by speed
     regime and labelled as a development result.
  2. **Expected error shown with each prediction**, from the regime the user's rocket falls in,
     plus a clear notice when the design is outside what was checked.
  3. **Team validation built in**: the team flies (a subscale, a test flight or a previous
     vehicle), imports the altimeter log, and the app tightens its prediction for their rocket.
- **Priority class** (from `accuracy-program/collegiate-mission-and-decision-matrix.md`): NASA
  Student Launch (4,000–6,000 ft), IREC 10k COTS, IREC 30k COTS; single-stage commercial solid,
  passive stability, dual-event recovery. SRAD motors, staging and clusters are the matrix's M5
  backlog.

### Measured starting point (computed 2026-11-14, read-only)

Source: `/home/ak/astraea-evidence/appbound-r42-r44-r47-e1b/r44/cohort.json` (app-bound option 2,
the engine on `main`). Cohort: RASAero's published flight comparisons (23 hobby and high-power
flights, 20 airframes with qu8k excluded). This is a reference developer's showcase set, **not
collegiate data as such**, partly in-sample, with published altitudes treated as AGL (R40). It
is a development result, never a validation. Per-airframe median apogee error:

| Regime (max Mach) | Airframes | Default today: mean abs. / within ±10 % | Improved model (opt-in): mean abs. / within ±10 % / bias |
|---|---:|---|---|
| Subsonic, < 0.8 | 8 | 7.0 % / 6 of 8 | 5.5 % / 7 of 8 / +2.9 % |
| Transonic, 0.8–1.5 | 7 | 7.6 % / 6 of 7 | 5.4 % / 7 of 7 / −0.7 % |
| Supersonic, ≥ 1.5 | 5 | 16.6 % / 1 of 5 | 6.1 % / 4 of 5 / −2.8 % |
| All (qu8k excluded) | 20 | 9.6 % / 13 of 20 | 5.6 % / 18 of 20 / +0.2 % |

qu8k (M 3.4, space-shot class) goes from −29.7 % to −12.2 %; proteus6 (M 2.8) stays at −12.2 %.
Worst subsonic row after the change: thunder-lightning +11.3 %.

Gaps this table exposes for the priority class:

- The gain needs the improved model **switched on** plus a nozzle exit diameter and nose tip
  radius per rocket. Phase 0 must check what a team that leaves those blank gets.
- 19 of 23 runs carry the app's own **UNKNOWN** validity label (a load evaluation outside the
  classified domain). For collegiate users that label must become meaningful or be fixed.
- Space-shot rows (M > 2.7) are still about 12 % low.
- The improved drag refuses elliptical and freeform fins, extra transitions, and a tube after the
  boattail or fin can.
- **Team validation today is exact-case only.** "Fit drag to this log"
  (`src/console/evidence/CalibrationCard.tsx`) applies only while airframe, motor, site and
  options match the fitted flight (`src/application/calibrationApplicability.ts`). It does not
  carry from a subscale to the full-scale, or to a new motor. Transfer is new work, and
  scorecard CA-01 is development-only on one vehicle.

### Decisions (replace G0–G6 where they differ)

| # | Decision | Recommendation |
|---|---|---|
| H1 | Adopt the three-layer finish line and the collegiate priority class above. | Yes |
| H2 | Make the improved model the **default** for designs it supports, with the old model kept for the shapes it refuses (replaces G6). Needs Phase 0 proof of blank-input behaviour and the three-template identity record; it moves every user's numbers. | Yes, after Phase 0, as its own owner OK |
| H3 | Show an expected-error band per regime on results. It is new UI; wording is the owner's call (standing preference: minimal UI change). | Yes, one compact line on the apogee result |
| H4 | Build the team-validation layer: carry a fitted drag correction to a changed motor, mass or site on the same airframe, and from a subscale to the full-scale where geometry is similar, with the prediction band tightening only as far as the evidence supports. | Yes; research Gate 1 first, since transfer accuracy is unproven |
| H5 | Hold the sealed blind sets until H2–H4 are frozen (G2 unchanged). | Yes |
| H6 | Public wording states "development result on 20 published flights" by regime, blind only where it exists. Target in `docs/road-to-1.0.md` unchanged. | Yes; draft for owner approval, no edit now |

### Phases (replace §5)

| Phase | Work | Type |
|---|---|---|
| 0 | Rerun the cohort on `main`'s built WASM; blank-input behaviour of the improved model; meaning of the UNKNOWN label on the cohort; refused-shape coverage of typical collegiate designs; non-apogee checks the IREC/USLI rules use (rail exit speed, stability margin 7.5 %/10 %, descent rates) and which outputs have evidence | local, read + tests |
| 1 | Default switch (H2) as an opt-in-first bundle with identity proofs | local, engine + app |
| 2 | Expected-error display (H3) and the out-of-envelope notice | local, app |
| 3 | Team validation layer (H4): research Gate 1, then implementation | local, engine + app |
| 4 | Space-shot and refused-shape gaps, largest error first; no tuning without measured data | local, engine |
| 5 | Freeze, then one blind shot on the sealed sets (H5); report by regime | records, irreversible |
| 6 | Public wording (H6) and push, each with owner OK | external gate |

§7 (protecting the app) is unchanged and applies to every phase.

## Revision 3 — 2026-11-14: the best version, through a full release cycle (governing)

Owner, 2026-11-14: "I said middle ground, but what I really meant was the best version that we
can create", covering "the entire cycle of producing, testing, benchmarking" so "we get a final
validated final answer" that is known good "to push and merge".

### End state

One **release candidate** of Astraea, merged into a candidate branch off `main`, with a
**Release Readiness Report** that a reviewer can check without trusting prose. The report states
the exact source SHA, WASM hash, every check that ran with its output, the benchmark tables, the
blind result, what was deliberately not done, and a recommendation. The owner's OK on that
report authorizes the merge to `main`, the push (which deploys the website), the public export
and the public wording. Until then nothing is pushed.

"Best version" means: every improvement the data we hold can support is built and kept only if
it beats today's `main` on the frozen benchmark. Revision 2's three layers (best default model,
expected error on results, team validation) are the minimum contents, not the ceiling.

### The cycle (replaces Revision 2's phases)

| Step | What happens | Output |
|---|---|---|
| 0. Freeze the yardstick | Before any model change: freeze the benchmark suite and its pass rules (below), the blind protocol and the list of sealed sets. Rerun the benchmark on today's `main` built WASM as the baseline. | Committed benchmark spec + baseline table, hashed |
| 1. Produce | Lanes under the orchestrator workflow, serial for the engine: improved model as default with fallback for refused shapes; space-shot and refused-shape drag; UNKNOWN validity label made meaningful; uncertainty with model error; expected-error line on results; team validation (subscale/previous-flight transfer); non-apogee outputs (rail exit, stability margin, descent) checked against the sources the rules use. Each lane: Gate 1, independent review by another model family, merged-tree checks. A change that does not beat the baseline is dropped and recorded. | Reviewed merges on the candidate branch |
| 2. Test | Full suite on the merged candidate: build, `tsc`, unit tests, engine tests, ARCAS benchmark, full browser smoke with production CSP, built-app checks of every changed screen with screenshots, native desktop smoke on Linux (Windows/macOS where a host is available, otherwise recorded as not run). | Logs with exit codes |
| 3. Benchmark | Run the frozen suite on the candidate's built WASM and compare to the step-0 baseline. | Before/after tables by regime |
| 4. Validate | Physics review of the final model by an independent model family. Then the one blind shot: freeze source and WASM, commit predictions, open the sealed sets once, report every flight. | Review verdict + blind table, pass or fail |
| 5. Release gate | Release Readiness Report to the owner; on OK: merge to `main`, push, public export, `docs/accuracy.md` wording from the results that exist. | Owner decision, then release |

If step 2, 3 or 4 fails, the work returns to step 1 for that item. The blind sets are spent once
only, so step 4 runs after everything else is final; a later model change makes them
development data and is recorded as such.

### Frozen benchmark suite (proposed; frozen at step 0)

| Benchmark | Measures | Pass rule for the release |
|---|---|---|
| Published cohort, 23 flights / 20 airframes | Apogee error by regime | No regime worse than baseline; all-airframe mean absolute ≤ 5.6 %, ≥ 18/20 within ±10 % (today's improved-model level) |
| Three app templates | Default identity | Changes only where an owner-approved default change explains them, each listed |
| ARCAS CP/CNα (`pnpm test:arcas-runtime`) and the P1 frozen gate | Stability | Passes as today |
| Development vehicles (R44 `dev_vehicles`) and Monte Carlo ensembles | Regression, solver domain | No new failures |
| Uncertainty coverage on the cohort | Fraction inside the 5–95 % range, band width | Reported against the 80 % rule and 20 % cap; a miss is reported, not tuned |
| App performance (render probe, run time) | No slowdown | Within the noise of the baseline |

### What "validated" will and will not mean

- **Will:** every benchmark above passes on the exact shipped build, independent reviews found no
  blocking issue, and the blind shot is reported on every qualifying sealed flight.
- **Will not:** the full road-to-1.0 target. With the sealed sets at most five airframes qualify
  and the 80 % coverage proof needs 14 vehicles, so the blind result cannot meet the six-vehicle
  rule. The report says so. Whether to push is the owner's call on that evidence (decision K2).

### Decisions (replace H1–H6 where they differ)

| # | Decision | Recommendation |
|---|---|---|
| K1 | Adopt this cycle and end state | Yes |
| K2 | Release rule: push when every benchmark passes, tests and built-app checks pass, reviews are clean and the blind result is reported, **even if the blind set is too small for the full 1.0 target**. Public wording then says "development result on 20 flights; blind result on N" | Yes; the alternative leaves the improvement unshipped indefinitely, since no more flights are coming |
| K3 | Improved model on by default (was H2), inside step 1 with identity proofs | Yes |
| K4 | Expected-error line on results (was H3) | Yes, one compact line; wording at review |
| K5 | Team validation transfer (was H4) | Yes, research Gate 1 first |
| K6 | Benchmark pass rules above | Approve at step 0, before any model change |
