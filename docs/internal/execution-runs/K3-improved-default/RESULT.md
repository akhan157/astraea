# K3: improved model as the default — result, awaiting independent review

Author: claude-sonnet-5-5. **Not self-accepted.** Base `d635726`; checkout branch `t3/placeholder`.
Gate 1 approved by the orchestrator (decisions: spec Amendment 4, nozzle option (a), every design
without an explicit choice, no schema bump). Commit 1 (`f1a702c`, opt-in first) was accepted by the
orchestrator. **Commit 5 (review fixes, below) comes first, then commit 4, commit 3, commit 2 and commit 1 unchanged.**
The default switch is **owner hard stop (c): nothing here is merged or pushed.**

# Commit 5: review fixes for `efc43e9` (Codex re-review, REJECT; all three earlier findings confirmed fixed)

The smoke-script race is still not touched (step-2 lane).

## Finding 1 (major): "Load saved inputs" silently disabled a provenance-bearing calibration

**Confirmed, and reproduced through the real store.** A calibration fitted with no drag choice flies the legacy tables (the resolution), but `captureRunInputs` archived the
RESOLVED vehicle (`flightDragSource: 'legacy'`). "Load saved inputs" restores the archived vehicle verbatim, so the restored vehicle had another fit key than the calibration's recorded
`uncalibratedRunKey`; `designOf` then marked the calibration inactive and dropped the scale. On `efc43e9`, run, archive, Load saved inputs gives: before `fitKey 251f2461`, status `active`; after,
status `inactive` (the reviewer's probe: 251f2461 to b9ec633b, scale gone).

**Fix.** The capture keeps the user's **declaration** apart from the **dispatch resolution** (`src/application/runInputs.ts`):
- `declared = project.vehicle` is what the archive stores (`inputs.vehicle`), so a restore returns the user's own vehicle and its original fit key; no recorded fit provenance is rewritten.
- `vehicle = withResolvedDragChoice(declared, calibration)` (the active calibration the run carries) drives the dispatched options and the `assertVehicleRunOptions` check only.
- Archive validation (`projectJson.ts`) already re-derives the same resolution from the archived declaration plus the archived calibration (`flown = withResolvedDragChoice(vehicle, dragCalibration)`), so it accepts exactly what was flown with no change; a built-up option beside a held scale is still refused. Pre-switch archives (no drag option, absent field) load unchanged through the same code and the existing pre-switch test.
- **Archives written by commits 2 to 4** (resolved `'legacy'` vehicle plus calibration, no drag option) still load (a test pins it). Restoring one of those still yields an explicit-legacy vehicle, because an explicit choice cannot be told from a resolved one; those builds were never released, so I added no heuristic.

**Every other restore or reopen path checked:**

| Path | Reads the archived vehicle? | Result |
|---|---|---|
| Load saved inputs (`loadSavedRun`, `project.ts`) | yes, restores it verbatim | the leak; fixed by archiving the declaration |
| Reopen a project file (`readProject` then `adoptProject`) | no, the project's own stored vehicle; the archive only has to validate | fine, tested (reopen, then load, same state) |
| Open a saved run in SavedRuns / rerun | via `loadSavedRun` | same fix |
| SavedRuns list and detail | engine options only (`flightDragSource`, scale), vehicle name | fine |
| Run comparison (`runComparison.ts`) | compares `inputs.vehicle` and engine options | rows now show the declaration plus the real options; tested: first run versus rerun after a load compare equal |
| Working-session restore | the project's stored vehicle | fine |
| Ensemble dispatch from `runInputs.vehicle` (`store.ts`) | yes, but it also passes the calibration | `dispatchVehicle` resolves legacy again, tested in commit 4 |

**Tests** (`src/state/loadSavedInputsCalibration.test.tsx`, 5, real `run` job, real capture, real `loadSavedRun`, only the engine invoke is a double): run, archive, Load saved inputs, rerun keeps **applicability, scale, run key, fit key, resolution and dispatched options** unchanged and the stored calibration intact; the same after reopening the project file first; the archive stores the declaration (no choice) while the engine options show legacy and the scale, and validation accepts it; the first run's archive equals the rerun's in the "Archived invocation and analysis inputs" comparison group (0 differences); archives from the earlier K3 builds still load and a built-up option beside the scale is refused. The changed existing assertion in `dragCalibrationDefault.test.ts` (archived vehicle `'legacy'` to no choice) is the intended new meaning.

## Finding 2 (minor): two tests that could not detect a regression

- `defaultDragIdentity.test.ts` compared a value with itself (`keyOf({flightDragSource:'legacy'})` twice). Replaced by: under each of default, `'legacy'` and `'calibrated'`, the three flag states (absent, `false`, `true`) are distinct run identities, and all nine keys are different from each other.
- `nozzleBackPressureDefault.test.tsx` "survives a save and reopen" only parsed the file. It now writes the project, replaces the open project with the automatic default (nozzle sent), **reopens the saved project with `adoptProject(readProject(...))`**, checks the box reads off, flies it and inspects the engine request (no nozzle option, still the built-up default). A second test does the same for the automatic state (no field written, nozzle sent after reopening).
- **Proof they can fail** (`out/K3/vitest-c5-mutations.log`, mutated copy of the tree, repo untouched): mutation 1 (the run key drops an explicit `false` under an explicit drag choice) is **missed by the old test and caught by the new one**; mutation 2 (reopening a project silently drops the explicit nozzle off) is **missed by the old reopen test and caught by the new one**. Without a mutation all old and new versions pass.

## Each new test fails on `efc43e9`

The changed and new tests were copied onto a pristine `git archive efc43e9` tree (`out/K3/vitest-c5-on-efc43e9.log`): **6 fail, 22 pass** (28): the 4 load-saved-inputs tests that exercise the leak (restore keeps the calibration active with the same fit key, scale, run key and request: `inactive` instead of `active`; archive stores the declaration; the reopen path; the comparison) and the two changed `dragCalibrationDefault` archive assertions. The rest are controls that hold on both trees (the compatibility test for earlier-build archives, and the strengthened identity and reopen tests, which assert correct behaviour and are shown by the mutations above to catch defects the old versions missed).

## Reruns on the commit-5 tree

| Check | Result |
|---|---|
| `tsc --noEmit -p .` | exit 0, 0 errors |
| Focused set (every test file K3 touched since `d635726` plus the new ones, `focused-files-c5.txt`) | exit 0, **27 of 27 files, 446 of 446 tests** (26 earlier files plus the new load-saved test file) |
| `vitest run --maxWorkers=2` (full) | exit 0, **191 of 191 files, 2221 of 2221 tests** (`vitest-c5-full.log` `9bf8e9d2…`) |
| Cohort probe and `candidate-compare.cjs` | exit 0; `cand.json` **byte-identical** to commits 3 and 4 (`a8cb5d42…`): **P1, P2 and P3 are unchanged** (candidate 5.6240 % / 18; frozen arm C 4.5054/7, 5.1918/6, 6.9363/3; fully blank 5.8755 % / 16) |
| Template comparison | `presets-commit5.json` **byte-identical** to commits 3 and 4 (`23a20cff…`): Alpha 304.0294885865904 m, NASA SL 546.5369328003885 m, Spaceport 5013.508465461415 m (unchanged) |
| `vite build` | exit 0 |
| Full `node scripts/browser-smoke.mjs` | **exit 0**, 518 s, **54 passed lines** (60 output lines), 1280×800 free region **239.6 px** (rocket 180.3), 1600×1000 **479.6 px** (rocket 344.8) (`browser-smoke-c5-full.log` `1e502827…`). Its calibration journeys include a real "Load saved inputs" rerun and passed. As before, this smoke is exposed to the restore-bar timing race (step-2 lane); it passed here |

Existing assertions changed, old meaning to new meaning: `dragCalibrationDefault.test.ts` "archives what it flew" (archived vehicle carries the resolved `'legacy'`) to (archived vehicle is the declaration, the engine options carry what flew). No assertion was loosened; no smoke script or threshold was touched.

---

# Commit 4: review fixes for `edd5f88` (independent review, codex gpt-6.1-sol, REJECT, three findings)

All three findings were real and are fixed. The smoke-script race (restore bar vs the 220 px read) is **not** touched here; it goes to the step-2 lane.
Spec Amendment 4 is not in this checkout's spec file (the base predates `628b555`); no action.

## Finding 1 (major): only an ACTIVE calibration may force the legacy tables

**Confirmed.** `designOf` resolved the drag choice from `project.dragCalibration`, the stored artifact, so a retained but inactive one (fit inputs or model binding no
longer match, scale excluded) forced legacy drag, and removing that history flipped the flight to built-up drag (new run key, new apogee). The Aero notice also called it "applied".

**Fix.** The choice is resolved from the **active** calibration only, i.e. `activeCalibration(resolveCalibrationApplicability(...))`, which `designOf` already computes as
`design.dragCalibration`. One resolution is used everywhere:

| Site | Before | Now |
|---|---|---|
| `designOf` (`design.vehicle`, so run key, dispatch, preflight, UI) | stored artifact | `calibration` (active) |
| `captureRunInputs` (dispatch options and archived vehicle) | `project.dragCalibration ?? calibration` | `calibration` (the active one the run carries) |
| archive validation (`projectJson.ts`) | archived `inputs.dragCalibration` | unchanged: that field is the active calibration at capture |
| CalibrationCard fit-blocked test and refit vehicle | stored artifact | `designOf(...).dragCalibration` (active) |
| Aero notice and checkbox rule | stored artifact | `design.dragCalibration` (active) |

Notice wording, one line, now true: "Flying legacy drag: this project's drag calibration is active, and it was fitted on the legacy tables. Tick the box to use built-up drag
instead (it needs the built-up aero model), or remove the calibration." (old: "holds an applied drag calibration"). It shows only for an active calibration; an inactive one shows nothing.

**Tests** (`src/application/inactiveCalibrationDrag.test.ts`, 11; `accuracyBundle.test.tsx`): for a fit-inputs-inactive artifact and a foreign-binding-inactive artifact, the project
(a) is `inactive`, carries no scale, resolves no legacy choice; (b) has the **same run key**, the **same engine request** (built-up default, no `dragCdScale`) and the **same capture/archive**
as the same project without the artifact; (c) keeps key and dispatch when the history is removed. Control: an **active** legacy artifact still stays on legacy (and the two cases in
`dragCalibrationDefault.test.ts` still hold). UI: an inactive artifact shows no legacy notice, the box stays on the default, ticking it writes plain `'legacy'` / absent, never `'calibrated'`.

## Finding 2 (major): the nozzle back-pressure box now shows the state a flight really flies

**Confirmed.** With no drag choice and a 0.05 m nozzle the default sends the nozzle, but the box read off; toggling it on and off still sent the nozzle; its hint said "Off leaves flights unchanged".

**Fix: show the automatic state, with a working explicit off.** `nozzleBackPressureThrust` is now `boolean` (`true` on, absent automatic, `false` explicit off).

| State | Box | Ticking / unticking |
|---|---|---|
| built-up default, nozzle exit in 0 to 1 m, field absent | **on** (automatic) | unticking writes `false`; ticking again removes the field |
| built-up default, field `false` | off | ticking removes the field (back to automatic) |
| explicit `'legacy'` / `'calibrated'`, or an active calibration (legacy flies) | on only when `true` | the old rule: tick writes `true`, untick removes it |
| exit above 1 m (not carried) | off | tick writes `true` (the old explicit on; the engine refuses it with its own text) |

The checkbox is `backPressureNozzleActive(design.vehicle)`, i.e. `flightRunOptions(vehicle).nozzleExitDiameter !== undefined`, so it cannot disagree with the request. Hint, under the default only:
"... Off leaves flights unchanged. On by default while a nozzle exit is set and built-up drag flies; untick it to turn it off." The existing sentence is now true because the off really is off.

**Identity handling.**
- **Field value:** `false` is stored only when the user unticks under the default; nothing is written otherwise (an untouched template's saved document is byte-identical, hash `cc6cd1ce`, unchanged test).
- **Run key:** the field is in the vehicle, so automatic (absent), explicit off and explicit on are three distinct run keys and each is stable; returning to automatic restores the original key.
- **Parser:** accepts `true` or `false`, refuses anything else ("must be true or false when present"); the old test that refused `false` is changed accordingly (old meaning: false refused; new: false round-trips, 0 / 'yes' / null refused).
- **Archive:** unchanged rule: the archived options are the derivation of the archived vehicle (`false` means no nozzle option and no `nozzleExitDiameter` archived).
- **Forward compatibility (for the Release Readiness Report):** a project file that carries `nozzleBackPressureThrust: false` is **refused by every build that predates this commit** (their parser accepts only `true`), in addition to the existing `flightDragSource: "legacy"` consequence. Files without the field load in both directions.

**Tests** (`src/console/stages/nozzleBackPressureDefault.test.tsx`, 6, UI to a real committed run to the engine request): the box reads on and the flight sends the nozzle; unticking stores `false`, the box reads off, the flight sends **no** nozzle option (still the built-up default) and the run key changes; ticking again restores absent, the nozzle and the original key; the off survives save and reopen; exit above 1 m; the explicit-`'legacy'` rule. Plus `caseResolver.test.ts` (derivation matrix and `backPressureNozzleActive`) and `defaultDragIdentity.test.ts` (three distinct, stable identities).

## Finding 3 (minor): metadata and admission use the dispatched vehicle

**Confirmed.** The bridge safety net dispatched legacy for a raw vehicle with a scale, but `toFlightRun` and `runMonteCarlo` derived `physicsOptions` and the confidence text from the unresolved vehicle and recorded "built-up requested" for a legacy flight; admission also ran on the unresolved vehicle.

**Fix.** `dispatchVehicle(vehicle, options, activeCalibration?)` (caseResolver) resolves once. Every bridge entry (`simulateFlightRecorded`, `previewFlight`, `runEnsemble`, `runEnsembleClassified`, `runEnsembleChunkRecorded`) resolves first and uses that one vehicle for the admission rule, the vehicle DTO and the derived options; `runFlight` and `runMonteCarlo` resolve first and reuse the same vehicle for the bridge call and for `toFlightRun` / the recorded `physicsOptions`. It is idempotent, so already-resolved callers (the store) are unchanged.

**Tests** (same file, real adapter and real bridge, only the engine invoke is a double): a raw vehicle with an active scale dispatches no drag option, records `physicsOptions` and basis text equal to the explicit-legacy run's and nothing that says "built-up"; with a beta selection it is refused before the engine (admission on the dispatched vehicle); the ensemble dispatches legacy and records no built-up option; control: no calibration still dispatches and records the built-up default.

## Each new test fails on `edd5f88`

The five changed or new test files were copied onto a pristine `git archive edd5f88` tree (`out/K3/vitest-c4-on-edd5f88.log`): **18 tests fail there, 124 pass** (142). The failures are exactly the new behaviour tests: 4 nozzle UI tests, 9 finding-1/3 tests (six inactive-artifact, three real-bridge), the explicit-off derivation matrix, the three-identity key test, the inactive-artifact UI test, and the two changed existing tests (parser `false`, notice wording). The passing ones are the controls that hold on both trees (active legacy artifact, no calibration, explicit-`'legacy'` nozzle rule, exit above 1 m, explicit-choice keys).

## Reruns on the commit-4 tree

| Check | Result |
|---|---|
| `tsc --noEmit -p .` | exit 0, 0 errors (`tsc-c4b.log` empty) |
| Focused set: every test file K3 touched since `d635726` plus the new ones (26 files, `focused-files.txt`; the reviewer's own 18-file list was not given to me) | exit 0, **26 of 26 files, 440 of 440 tests** |
| `vitest run --maxWorkers=2` (full) | exit 0, **190 of 190 files, 2215 of 2215 tests** (`vitest-c4-full.log` `a161e111…`). An earlier run read 196 files / 2392 tests because test files in my own copied probe scripts under `out/` were picked up; those copies are deleted and the count above is the clean one |
| Cohort probe and `candidate-compare.cjs` | exit 0. **`cand.json` is byte-identical to commit 3 (`a8cb5d42…`)**, so **P1, P2 and P3 are unchanged**: candidate 5.6240 % / 18 within, bit-identical apogees to arm B; frozen arm C 4.5054/7, 5.1918/6, 6.9363/3, all 5.3534/16; fully blank 5.8755 % / 16 |
| Template comparison (`preset-compare.probe.ts`, both WASMs `bc19590b…`) | `presets-commit4.json` **byte-identical to commit 3** (`23a20cff…`): Alpha 298.92375069659687 → 304.0294885865904 m, NASA SL 532.8435782954323 → 546.5369328003885 m, Spaceport 5013.508465461415 unchanged |
| `vite build` | exit 0 |
| Full `node scripts/browser-smoke.mjs` (production CSP, real Chromium, unmodified script) | **exit 0**, 539 s, **54 passed lines** (60 output lines), 1280×800 free region **239.6 px** (rocket 180.3), 1600×1000 **479.6 px** (rocket 344.7) (`browser-smoke-c4b-full.log` `3f303e72…`). Note this smoke is the timing race described in the step-2 note: it passes or fails on the restore-bar timing, independent of this change |

Existing tests changed in this commit, old meaning to new meaning: `projectJson.test.ts` nozzle opt-in test (`false` refused) to (`false` accepted, other values refused); `accuracyBundle.test.tsx` held-calibration notice text ("holds an applied drag calibration") to ("drag calibration is active"). No assertion was loosened; no smoke script or threshold was touched.

---

# Commit 3: review fixes for commit 2 (`e613f8a`)

Reviewer findings 1 to 4, then the reruns. Every new regression test below was run against the commit-2 tree (`git archive e613f8a`) and fails
there; the controls pass on both.

## Blocking 1: an applied drag calibration silently changed meaning

**Confirmed.** `snapshotCase` keys on vehicle + options (+ calibration, aero model), not on the derived drag source, so a project with an applied
scale and no drag choice kept its run key across the switch while the dispatch became built-up drag × a scale fitted on the legacy tables. Both the
legacy artifact (`resolveCalibrationApplicability` keeps it active without provenance) and the provenance artifact (its recorded fit key does not
involve the derived source) stayed active.

**Fix chosen: the effective drag source derives `'legacy'` for a project that holds a drag calibration and made no explicit choice** (recommended
option; I did not mark the calibration inactive). Why: (1) it leaves a calibrated project exactly where it was, so its saved scale and its fit keep working with no action; (2)
marking it inactive would not have saved a provenance artifact either: choosing `'legacy'` to reactivate it writes a new field into the vehicle, which moves the fit's
recorded input key, so the artifact would go inactive on "fit inputs" and need a refit.

Mechanism (`resolvedDragChoice`, `withResolvedDragChoice`, `src/application/caseResolver.ts`): the choice is **resolved at the dispatch boundary and never stored
in the project**, so the artifact's recorded fit identity (computed on the stored vehicle in `designOf`, before the resolution) does not move. Applied in:
`designOf` (`design.vehicle`), `captureRunInputs` (dispatch options and the archived vehicle), the archive validation in `projectJson.ts` (a run that
carried a calibration under an absent field is checked as an explicit legacy vehicle; a built-up option next to a held scale is refused), the
`CalibrationCard` (the fit-blocked test and the refit's vehicle), and, as a safety net for any other caller, `deriveRunOptions` in `bridge.ts` (a
dispatch that carries a scale other than 1 on a vehicle with no choice flies the legacy tables). Explicit choices always win: `'legacy'` is unchanged, and the old explicit `'calibrated'`
keeps its old meaning (built-up with the scale on top, which the old UI text already disclosed).

User-visible: one line in the Aero stage while a calibration is held and no choice is stored: "Flying legacy drag: this project holds an applied drag
calibration, which was fitted on the legacy tables. Tick the box to use built-up drag instead (it needs the built-up aero model), or remove the calibration."
Ticking the box then writes the explicit `'calibrated'` opt-in (the only way to ask for built-up while a calibration is held). The result's own
axial-drag line already says "legacy … calibrated drag not requested". Run keys of such projects move once (the resolved vehicle carries `'legacy'`), so a
result saved before the switch reads as stale and is rerun: same physics, conservative.

Regression tests (`src/application/dragCalibrationDefault.test.ts`, 9 tests; 6 fail on `e613f8a`): for a legacy artifact and for a provenance artifact bound to the
stored vehicle, with no explicit choice: the artifact stays active, the design resolves legacy, the project stays unchanged, the fit key is unchanged; the flight dispatches
**no `flightDragSource` and the scale applied** (also for the raw stored vehicle, via the bridge net); the archive records the legacy choice, loads, and a built-up option
beside the scale is refused. Controls: explicit `'legacy'`, explicit `'calibrated'`, and no calibration (a scale of exactly 1 is not a calibration). UI:
`accuracyBundle.test.tsx` (notice shown, box unchecked, tick writes `'calibrated'`, no notice without a calibration).

## Blocking 2: run identity and freshness

**Confirmed, and fixed.** The key (`resolveRun` → `launchCaseInput` → `snapshotCase`, `store.ts:144`, `caseResolver.ts` canonical) held only the vehicle, motor and options, so a
result or saved run from before the default had the *same* key as the same design today and read as current: reopening a saved project or restoring a working session adopts a run
whose `inputKey` equals the current key (`openRunIdentity.test.ts`; the same comparison is made at `Build.tsx:126`, and `SimFlightOverlay.tsx:668` compares the chosen run's
key with the current case key). The live-preview cache (`livePreview.ts:92`) is in-memory only and does not survive a reload; the run comparison reads recorded archives and does no re-derivation.

Fix: `LaunchCase.defaultDragSource: 'built-up'` is set by `launchCaseInput` when the design's vehicle makes no drag choice, and joins the canonical case (so `runKey` and `mcKey`), plus
`RunSnapshot.defaultDragSource` and a `'drag-source'` divergence section with a reason label. **No other key moves:** an explicit `'legacy'` or `'calibrated'` already carries the choice in the vehicle (unmarked key,
asserted equal to the unmarked case); `calibrationFitInputKey` is computed without the marker, so every recorded fit key stays valid.

Tests (`defaultDragIdentity.test.ts`, 5; `openRunIdentityDefault.test.tsx`, 2; the key assertion and the end-to-end "not current" assertion fail on `e613f8a`): the default no longer
has the unmarked key; explicit keys equal the unmarked key; the three identities differ; the fit key equals the unmarked key; the divergence names the drag source; and a project
saved the way a pre-default build saved it (unmarked key, no drag option, no drag line) is **not** presented as the current run when reopened, while a run made by this build is.

## Non-blocking

3. **P3 is now stated on the frozen arm-C definition** (see the commit-2 section, "Result"); the fully blank row is kept as the additional stricter row. Both pass.
4. **Nozzle exit above 1 m: option (a).** The default carries the back-pressure option only when the declared exit is finite and within the engine's flight domain, 0 to 1 m inclusive
   (`NOZZLE_FLIGHT_EXIT_MAX_M`, mirrors `NOZZLE_EXIT_DIAMETER_MAX_M`). Why (a) and not a refusal: the nozzle field also feeds the drag method, an imported file can legitimately hold a
   larger value, and refusing every flight for an input that the default merely adds on top would turn a convenience into a blocker. Nothing in the engine changed. The drop is
   recorded in the Aero stage: "This nozzle exit is above the 1 m flight limit, so it is not sent as back-pressure thrust; it still sets the drag method's nozzle term."
   The explicit back-pressure flag keeps its old rule and the engine its own refusal. Tests: `caseResolver.test.ts` (0.05, 1 and 0 carried; 1.0000001, 1.5, NaN and −0.1 dropped; the flag still sends 1.5),
   `builtUpDrag.test.ts` (real engine: a 1.5 m default flight completes, and the flagged one is refused with the engine's text), `accuracyBundle.test.tsx` (the note).

## Reruns on the commit-3 tree (exit codes)

| Check | Result |
|---|---|
| `./node_modules/.bin/tsc --noEmit -p .` | exit 0, 0 errors (`tsc-c3.log` empty) |
| Focused: `dragCalibrationDefault`, `defaultDragIdentity`, `openRunIdentityDefault`, `caseResolver`, `accuracyBundle`, `builtUpDrag`, `physicsOptionIdentity`, `bridge`, `projectJson`, `runInputs` | all pass |
| `./node_modules/.bin/vitest run --maxWorkers=2` | exit 0, **188 of 188 files, 2194 of 2194 tests** (`vitest-c3.log` `e963f74e…f654`). 21 tests are new in this commit; no existing test was edited except where listed below |
| Cohort probe (`cohort-default.probe.ts`, WASM `bc19590b…`) and `candidate-compare.cjs` | exit 0; **`cand.json` is byte-identical to commit 2** (`a8cb5d42…2437`), so P1, P2 and P3 are unchanged: candidate 5.6240 % / 18, bit-identical apogees to arm B; frozen arm C 4.5054/7, 5.1918/6, 6.9363/3, all 5.3534/16 (reproduces L0); fully blank 5.8755 % / 16 |
| Template field comparison (`preset-compare.probe.ts`, both WASMs `bc19590b…`) | `presets-commit3.json` is **byte-identical to commit 2** (`23a20cff…a162`): Alpha 298.92375069659687 → 304.0294885865904 m, NASA SL 532.8435782954323 → 546.5369328003885 m, Spaceport 5013.508465461415 unchanged; every other field as in the commit-2 table |

| Built app (rebuilt with `vite build`, exit 0), repo smoke `ASTRAEA_ONLY_JOURNEYS=accuracy node scripts/browser-smoke.mjs`, production CSP | **exit 0**: 547 m pin, legacy journey, site temperature, nozzle, built-up drag, refused shape (`browser-smoke-c3-accuracy.log`) |
| Built app, **full** `node scripts/browser-smoke.mjs` | **not a clean pass on this host, and I do not claim one.** Four full attempts on this tree failed at timing-sensitive points: the 1280×800 free-region height (214.1 px against 220, twice) and a 30 s `page.reload` timeout (twice, host load average 15 to 20 from other sessions). On the commit-2 tree (`git archive e613f8a`, same host, same hour) the same smoke also failed, at the 1600×1000 resize wait. [INFERENCE] The 214.1 px reading looks like the working-session restore bar (about 25 px) appearing after the journey's one-shot dismissal check (`preview-journeys.mjs:545`): a race, not a layout change of this commit. The same app code read 239.6 px in five other runs, including on commit 2, and a run of the same dist failed and passed with no change between them. The full smoke passed (exit 0, 54 lines) on commit 2 earlier at `browser-smoke-final2.log`. It needs a quiet host: step-2 rerun |

Existing tests touched in this commit: `candidate-compare.cjs` (P3 now gates the frozen arm-C row and the blank row, and asserts the frozen row reproduces L0 arm C) and `accuracyBundle.test.tsx` / `caseResolver.test.ts` / `builtUpDrag.test.ts` (new tests only, added beside the old ones). No assertion was loosened.

Consequence for the report: a project that holds a drag calibration stays on the legacy flight until the team chooses otherwise (a visible line says so); the built-up default applies to every other design.

---

# Commit 2: the default switch

## What changes, in one paragraph

A vehicle with **no drag choice** now flies the built-up drag (`flightRunOptions` sends
`flightDragSource: 'calibrated'`), plus the back-pressure nozzle option when the design declares a nozzle
exit. `'legacy'` is the explicit old choice (nothing sent, the old tables, exactly as before).
`'calibrated'` is the old explicit opt-in and keeps its old rules (needs the beta aero model, the nozzle
option needs the flag). Blank inputs send nothing: no temperature, no nozzle option, sharp nose. The
engine, `crates/` and the WASM are untouched, so the candidate WASM is the archived
`bc19590b…` (spec P10 holds trivially).

| File | Change |
|---|---|
| `src/application/caseResolver.ts` | `effectiveFlightDragSource`: absent and `'calibrated'` → `'calibrated'`, `'legacy'` → none. Nozzle option carried when the field is absent and a nozzle exit is declared (flag rule unchanged otherwise). New `preSwitchFlightRunOptions` (the pre-switch derivation, for archive validation only) |
| `src/application/flightAdmission.ts` | no drag choice: admitted whatever the selection. `'calibrated'` and `'legacy'` keep their rules byte for byte |
| `src/application/candidate.ts` | candidate preflight refuses only the explicit `'calibrated'`; the default is not applied to a candidate run |
| `src/formats/projectJson.ts` | archive validation by era: absent vehicle field + no archived drag option → checked against the pre-switch derivation (old archives load as recorded); a drag option present → checked against the current derivation. The drag line is expected iff an option was sent |
| `src/application/runCases.ts` | the drag line is archived iff the archived options carry a drag option |
| `src/console/stages/AeroControls.tsx` | the "Use built-up drag in flights (beta)" checkbox is always shown, checked unless `'legacy'`; unchecking writes `'legacy'`, checking removes the field. Label unchanged. The missing-model alert shows only for the old explicit opt-in |
| `src/console/stages/Flight.tsx` | the engine's axial-drag line shows whenever the run recorded one (so every live run says which model flew); an older restored run has no recorded line and shows none |
| `src/console/evidence/CalibrationCard.tsx` | the drag fit is blocked whenever built-up drag flies (now the default). Text unchanged |
| `scripts/browser-smoke.mjs`, `scripts/preview-depth.mjs`, `scripts/preview-journeys.mjs` | see "Tests and scripts changed" |
| `docs/internal/execution-runs/K3-improved-default/{cohort-default.probe.ts,candidate-compare.cjs,vitest.config.ts}` | the committed adapter probe, the P1/P2/P3 script and the probe's vitest config |

## 1. Candidate default on the cohort (Amendment 4)

Command: `K3_OUT=out/K3/cohort-c2 ./node_modules/.bin/vitest run --maxWorkers=2 --config
docs/internal/execution-runs/K3-improved-default/vitest.config.ts` on WASM
`bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff` (path
`/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm`, archived, never rebuilt). The probe
maps each manifest vehicle to an app vehicle (`launchSite.temperatureC = temperatureK − 273.15`, nozzle exit and tip
radius copied, no drag choice, no back-pressure flag) and sends the options the app's own `flightRunOptions` derives.
The app's `vehicleDto` equals the manifest vehicle's components, nozzle, finish and turbulence for all 23 flights.

**Per-flight option equality with arm B (23 flights):** 1 identical, 22 differ only in the site temperature by
2.13e-14 °C (about 6 ulp: `K − 273.15` gives 26.666666666666686, `(°F − 32)/1.8` gives 26.666666666666664; relative
8e-16). No other option differs in any flight (same keys, same values for rail, altitude, nozzle, drag source).
**The apogees are bit-identical to L0 arm B in all 23 flights** (max relative difference 0).

`node docs/internal/execution-runs/K3-improved-default/candidate-compare.cjs` (exit 0):

| Row (candidate WASM = baseline) | Subsonic MAE / within / bias | Transonic | Supersonic | All 20 | qu8k |
|---|---|---|---|---|---|
| **Candidate default** | 5.5414 % / 7 / +2.8514 | 5.4024 % / 7 / −0.6639 | 6.0662 % / 4 / −2.7641 | **5.6240 % / 18 / +0.2172** | −12.24 % |
| Arm B (L0, Amendment 3 ceiling) | 5.5414 / 7 | 5.4024 / 7 | 6.0662 / 4 | 5.623962788961215 / 18 | −12.24 % |
| **Arm C, all inputs blank** (default derivation; temperature, nozzle exit and tip radius removed) | 4.5125 % / 7 / −0.5797 | 5.2188 % / 6 / −4.3623 | 8.9756 % / 3 / −8.9756 | 5.8755 % / 16 / −4.0026 | −24.98 % |
| Arm A, baseline (P3 floor, Amendment 3) | 7.0200 / 6 | 7.5693 / 6 | 16.5845 / 1 | 9.6034 / 13 | −29.70 % |
| Baseline arm C reproduced (explicit `'calibrated'`, tip and temperature removed, vehicle nozzle kept as drag input) | 4.5054 / 7 | 5.1918 / 6 | 6.9363 / 3 | 5.3534 / 16 | −18.35 % (apogees equal L0 C bit for bit) |
| **B without the nozzle option** (explicit `'calibrated'`, B's temperature and tip, no flag) | 5.4351 % / 7 / +2.5463 | 5.7490 % / 7 / −1.1809 | 6.7505 % / 3 / −5.3359 | 5.8738 % / 17 / −0.7287 | −20.35 % |

**Result: P1 PASS** (MAE 5.6240 ≤ 5.623962788961215 + 1e-9, 18 ≥ 18, |bias| 0.217 ≤ 5, option equality as above),
**P2 PASS** (T = 0, every regime equal to arm B).
**P3 PASS on the frozen arm-C definition** (spec §2: explicit `'calibrated'`, tip radius and site temperature removed, the vehicle's
nozzle field kept as a drag input only; row "Baseline arm C reproduced", which equals L0 arm C bit for bit): subsonic 4.5054 < 7.0200,
transonic 5.1918 < 7.5693, supersonic 6.9363 < 16.5845, all 5.3534 / 16; counts 7/6/3 ≥ 6/6/1 (arm A). **P3 also passes on the
additional, stricter fully blank row** (nozzle exit removed too, default derivation): 4.5125 < 7.02, 5.2188 < 7.57, 8.98 < 16.58; counts 7/6/3 ≥ 6/6/1.
`candidate-compare.cjs` now gates both rows, and fails if the frozen row stops reproducing L0 arm C.

**What this does and does not show (Amendment 4 labelling, binding on the report).** On the cohort every design
declares the inputs arm B uses, so P1 and P2 check that the app's default sends arm B's inputs; the accuracy evidence is
arm B. The independent check that the default helps a team that enters nothing is P3, and that holds, with these
honest limits: the blank arm C is at 5.88 % but only 16 of 20 within ±10 %, its bias is −4.0 %, the supersonic regime is
8.98 % with all errors low, and qu8k is −25 % (arm A −29.7 %). The nozzle option matters: without it the 18 drops to 17
within ±10 % and the all-20 MAE rises 5.62 → 5.87 %; the default carries it and so carries back-pressure thrust physics for
every design that declares a nozzle exit. Blank inputs: a design with no nozzle exit loses the drag-side nozzle term as well
(that is why the blank row is below the baseline arm C, which kept the vehicle nozzle field).

## 4. Template table (`preset-compare.probe.ts`, both WASMs `bc19590b…`, against step 0)

Every probed field of the three templates was compared (`out/K3/preset-diff.txt`, sha256 `8144af04…f5ea`). Fields not listed
are identical, including stability margin, CP and the aero-panel Cd at Mach 0.3/0.8/1.0/1.2.

| Field | Alpha III + C6 | NASA SL + K550W | Spaceport + M1820 |
|---|---|---|---|
| apogee | 298.92375069659687 → **304.0294885865904 m** (+5.11 m, +1.71 %) | 532.8435782954323 → **546.5369328003885 m** (+13.69 m, +2.57 %) | 5013.508465461415 → **unchanged** |
| max velocity | 100.08281599715359 → 98.98516511071072 | 98.92149809230357 → 99.02282039159903 | unchanged |
| max Mach | 0.29444399571152263 → 0.29121370839393707 | 0.2911650769565252 → 0.29146373891018335 | unchanged |
| flight duration | 82.19359157562769 → 83.61128810883156 | 67.83963031768579 → 68.64115283965886 | unchanged |
| landing velocity | 4.929660552299002 → 4.929660331338177 | 5.950277381099366 → 5.950277856882681 | unchanged |
| rail exit velocity | 17.66535237529297 → 17.66893129132325 | 18.898682609745265 → 18.90053796205939 | unchanged |
| `runManifest.axialDrag` | "legacy 25-station… calibrated drag not requested" → "calibrated build-up axial drag (alpha = 0)… nose tipRadius none (sharp); design nozzle exit none (method default); method reference air…; not a validated model" | same change | "…calibrated drag not requested" → "…**legacy drag used (refused: calibrated unsupported feature: fin set 'sac-fins' does not follow a body tube)**" |
| dispatched `options.flightDragSource` | none → `"calibrated"` | none → `"calibrated"` | none → `"calibrated"` |

Reasons: Alpha and NASA SL have no temperature, nozzle exit or tip radius, so they fly the built-up drag with blank inputs
(the blank rule sends nothing extra). Spaceport's fins sit on the boattail, which the built-up method refuses
(`resolve_flight_drag` returns `Refused`, `models.rs:1413`; `tables()` returns `None`, `models.rs:1445`), so it flies the
legacy tables and its apogee is bit-identical; only the manifest text and the dispatched option change.
Browser check of the same numbers: the repo smoke reads 547 m for NASA SL and the preset check reads 304 m / 547 m / 5,014 m.

## 5. Archive: recorded runs are not rewritten

- Mechanism: see the `projectJson.ts` row above. A saved project's vehicle is never rewritten on load; re-running an old
  project now flies the new default.
- Old fixtures: `readProject` → `writeProject` of both `src/formats/__fixtures__/*.json`, re-run on the commit 2 tree, is
  **identical** to pristine `d635726` (`out/K3/fixtures-commit2.json` `6b58e949…2c82`, `cmp` equal to `fixtures-base.json`); the project and archive suites pass.
- New tests (`src/application/flightDragLegacyChoice.test.ts`): a pre-switch archive (no drag option under an absent
  vehicle field, nozzle declared but flag off) loads exactly as recorded; a default-era archive carries the option, the nozzle
  option and the drag line, and is refused if the nozzle option is stripped; an option that no derivation produces is refused;
  a `'legacy'` run archives no drag option and no line.

## 6. Suites and built app

| Check | Result |
|---|---|
| `tsc --noEmit -p .` | exit 0, 0 errors (`out/K3/tsc-c2.log` empty) |
| `./node_modules/.bin/vitest run --maxWorkers=2` | first run after the switch: **126 failed of 2160** (all of them the changes listed below). After the test updates, run 1: **2172 passed, 1 failed of 2173, 185 files** (`out/K3/vitest-c2.log`). The failure, `ShareFlightCard.test.tsx` "survives Verify → Flight → Verify", is a timing flake: 3/3 pass alone (`--maxWorkers=1`). **Second full run, no change in between: 185 of 185 files and 2173 of 2173 tests pass** (`out/K3/vitest-c2-rerun.log` `f24496c7…218f`) |
| Build | `./node_modules/.bin/tsc` then `./node_modules/.bin/vite build` (exit 0, 3 s). **I did not run `pnpm build:engine`**: `pnpm` tries to reinstall into the symlinked `node_modules`, and the engine source is unchanged, so the archived `bc19590b…` WASM stays in place instead of a path-dependent rebuild (Amendment 1). The orchestrator should rerun `pnpm build` in the goal worktree if a rebuilt WASM is wanted |
| `pnpm test:browser` equivalent (`node scripts/browser-smoke.mjs`, production CSP from `dist/_headers`, real Chromium) | **exit 0, 54 journey lines, 11 min**. Before my script edits it failed at its first assertion (547 m against the 534 pin), as expected from the template table (`out/K3/browser-smoke-unchanged.log`) |
| Screenshots (production CSP, 1600×1000) | `out/K3/screenshots/`: Aero stage with the checkbox on by default (`aero-built-up-drag-default.png`), the explicit legacy choice (`aero-legacy-choice.png`), Flight results with the built-up line (`flight-built-up-drag-default.png`), with the legacy line (`flight-legacy-drag-choice.png`), and Spaceport with the refusal (`flight-built-up-drag-refused-default.png`) |
| Servers and browsers | none left running |

## Tests and scripts changed (old meaning → new meaning). No assertion was loosened.

Two mechanisms: **(a)** a test that was about archives, comparison, fitting or persistence on the legacy flight keeps doing
exactly that through the explicit `'legacy'` choice (helper `pinLegacyFlightDrag()` in `src/console/testFixtures.ts`,
`resetConsoleState()` uses it unless `{ defaultFlightDrag: true }`); **(b)** a test that pinned "default sends nothing" now
pins the same thing for `'legacy'`, and a new test pins what the default sends.

- `testFixtures.ts` `resetConsoleState`: clean preset project → clean preset project on the legacy flight (so ~60 console tests, see (a)).
- `runInputs.test.ts`, `momentArmHistory.test.ts`, `runRetention.test.ts`, `openRunIdentity.test.ts`, `workingSession.test.tsx`, `buildExport.test.tsx`, `SavedRuns.test.tsx`, `siteAndTelemetry.test.tsx`, `EvidenceStudio.test.tsx` (setup only): preset opened on the default → opened on `'legacy'`, (a).
- `largeProject.fixture.ts`: size-fixture project on the default → on `'legacy'` (cases with no drag option and no drag line), (a).
- `runCases.test.ts` `base()`, `projectJson.test.ts` (`PRE_SWITCH_VEHICLE` for captured archives and `savedCase`): default vehicle → `'legacy'` vehicle, (a).
- `engine.test.ts` (4 tests) and `flightValidation.test.ts` (1): WASM flies the default compared with the TS oracle → WASM flies `'legacy'` compared with the TS oracle (the oracle has no built-up drag), (a).
- `caseResolver.test.ts` (3 tests): `flightRunOptions` of an unmodified template equals `{}` etc. → same expectations on the `'legacy'` vehicle, plus two new default tests, (b).
- `physicsOptionIdentity.test.ts` (4 tests): base request / site temperature / aero nozzle / back-pressure on the default vehicle → same exact strings and hash `cbdf481f` on the `'legacy'` vehicle; plus two new tests pinning the default request (exactly one added option, `flightDragSource`; and the nozzle option with a declared nozzle exit), and that the saved document of the unchanged template is still byte-identical (hash `cc6cd1ce`), (b).
- `bridge.test.ts` (5 tests): the vehicle-derivation, restate, selection-only refusal, ensemble admission and live-preview tests on the default → on `'legacy'`; plus two new default tests (temperature+nozzle+drag source sent; selection with no drag choice admitted), (b).
- `consoleData.test.ts` (4 tests): run physics options absent "by default" and the selection-only refusal → the same on `'legacy'`; plus two new default tests, (b).
- `builtUpDrag.test.ts` (real engine): `false` meant the unmodified template → `false` now means `'legacy'`; new test: the default flies exactly as the explicit opt-in (bit-identical apogee, same line), and Spaceport's default is refused with its legacy apogee.
- `builtUpFlightDrag.test.tsx`: rows 1 and 3 ("no opt-in") now run on `'legacy'` (via the reset); new rows "1 (default)" and "3 (default)".
- `accuracyBundle.test.tsx`: "hides the checkbox until the model is selected" → "the checkbox is always shown and checked by default; unchecking is the explicit legacy choice"; "shows the checkbox with the model" → same with the model, unchecked-by-click writes `'legacy'`; malformed-drag tests: `?.textContent` → `?.textContent ?? ''` (the malformed line is now not rendered at all, and the assertion that nothing malformed leaks is the same); the Aero block runs on the default via `resetConsoleState({ defaultFlightDrag: true })`; new tests for the legacy line and the default line.
- `flightDragLegacyChoice.test.ts`: my commit-1 test (absent == `'legacy'`) → rewritten for the switch (absent is the default; `'legacy'` equals the pre-switch derivation); new archive-era tests.
- `scripts/browser-smoke.mjs`: apogee pin 534 ± 2 m → 547 ± 2 m (NASA SL default 546.54 m); this is the P4 template change and needs the owner's hard stop (c).
- `scripts/preview-depth.mjs`: the accuracy journey's baseline is the legacy flight, chosen with the checkbox (idempotent, because the journey follows a restored project); its "default project shows no axial line" now asserts the legacy line is shown ("calibrated drag not requested") while the other new lines stay absent.
- `scripts/preview-journeys.mjs`: the calibration journeys fit on the legacy flight (the card blocks a fit under built-up drag); the second design sets `flightDragSource: 'legacy'` in the script.

## Findings and consequences the owner should see

1. **Drag calibration is blocked by default.** A scale fitted from a flight log is fitted against legacy tables only, so "Fit drag to this log" is disabled until the team unchecks the built-up drag. The card already says so. A project that already **applied** a drag scale fitted on legacy drag will now fly the built-up drag × that scale on re-run; I did not add protection for that.
2. **The nozzle carry changes thrust.** Any design that declares a nozzle exit now also gets back-pressure thrust in flight (the accuracy browser journey measures +2 m on NASA SL with a 0.05 m exit, on the legacy tables with the flag; the default's own effect is the "B without the nozzle option" row above). A nozzle exit above 1 m would now fail the engine's own 0…1 m domain check on a flight; the field's UI limit is 1 m.
3. **Re-running an old project gives a new number**, by design (the owner decision). Recorded runs keep their archive and their line.
4. **Forward compatibility (no schema bump, owner decision).** Builds from before commit 1 refuse a project file that carries `flightDragSource: "legacy"`. Files without it load both ways. Archives written under the default carry a drag option that an older build rejects ("not derived by the archived vehicle").
5. **Wording:** the existing refused string says "was requested", which is slightly off for a default run (kept, as agreed). The Flight stage chip still reads "Flight model: Legacy (supported)"; that is the flight-model name, separate from the drag source, and was left alone.
6. **The beta aero model and the default:** with no selection the flight uses built-up drag while the aero and stability panels stay legacy. The existing basis text says "lift and stability in flight use the legacy model".

## Not done

- No merge, push or release (hard stop (c)); `pnpm build` with a rebuilt engine; Cargo/engine suites (no Rust changed); P8 and P9 (not part of this step); the Monte Carlo timeout rerun on a quiet host (recorded for step 2).
- The `node_modules` symlink is untracked and must not be committed.

## Output hashes (`out/K3/`, git-ignored)

| File | sha256 |
|---|---|
| `cohort-c2/cand.json` | `a8cb5d4200711ed8468594c214eba91689eb5ae0a67c6ad1c632a64ea0f12437` |
| `cohort-c2/candidate-compare.json` | `a79953db13aa06d461c58cae4f1393022e4ca7bc70d985a14750aa647b03606c` |
| `presets-commit2.json` | `23a20cffb623b25424e28e58d965dafc8153ec84b9f21e0aa86955614b56a162` |
| `preset-diff.txt` | `8144af045775bdaf592dac2393595c33648539ca7587c5fa63bb28cc3e0ff5ea` |
| `vitest-c2-run1.log` (126 failures, before test updates) | `718a139d5ecbc1ebe9c3b0f38c86310a908cd716451209a0a0d1185049d3643c` |
| `vitest-c2.log` (1 flaky failure) | `21d14a1f4b84c30d6f84c56de2d6ed68453aed9ee15316ffcdd499cd8be5ba3e` |
| `vitest-c2-rerun.log` (2173/2173) | `f24496c7937ff2fb11b248119bc280bd16bd4dfd0c594e8fb90b5ccd0180218f` |
| `tsc-c2.log` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` (empty) |
| `vite-build.log` | `4ecd360f638a19b270c47af2bf7b73a25b68609246e9869a3715a2682da4ca78` |
| `browser-smoke-final2.log` | `66d1c852ae9e40ca3ff125a869fc1d97541ce19770f4f7ce156a101e0fc04fce` |
| `browser-smoke-unchanged.log` (fails at the 534 pin) | `ce3c719b62d543ce8f9e3ce8310364f048bcb8e9fc0c952c69d12e969007d82c` |
| `screenshots/aero-built-up-drag-default.png` | `8a515cb5a4b142060644b8dfa71ac678b5969f4724e31f35e251d9371ab3da90` |
| `screenshots/aero-legacy-choice.png` | `0fc43004b33accd06ca4dede4e00902d1aff4fc7dda652994c16b974cce4eec2` |
| `screenshots/flight-built-up-drag-default.png` | `8e2efa0ecac4e43ef862439280175ca61cd1a4c4879688fda331799142f016d3` |
| `screenshots/flight-legacy-drag-choice.png` | `5e5aa2467002cfbc1100920bd61dee22ce443c679e1004452b8599d926f928d0` |
| `screenshots/flight-built-up-drag-refused-default.png` | `c689549ae496fa28150793a97888d5dc2786ba49137fabea4262bfd4066813e0` |

---

# Commit 1 (opt-in first), as recorded when it was committed

## What commit 1 does

It adds the explicit choice `vehicle.flightDragSource: 'legacy'` and one reader for the field,
`effectiveFlightDragSource(vehicle)` (`src/application/caseResolver.ts`). **An absent field still means
legacy, and no flight changes.**

| File | Change |
|---|---|
| `src/core/types.ts` | field type is `'calibrated' \| 'legacy'`, doc updated |
| `src/application/caseResolver.ts` | new `effectiveFlightDragSource`; `flightRunOptions` uses it. `'legacy'` and absent both send no engine option |
| `src/application/flightAdmission.ts` | opt-in test uses the helper (`'legacy'` is not an opt-in) |
| `src/application/candidate.ts` | candidate refuses only the opt-in, not `'legacy'` |
| `src/application/runCases.ts`, `src/formats/projectJson.ts` (archived drag line) | archived-opt-in test uses the helper |
| `src/formats/projectJson.ts` (vehicle parser) | accepts `'legacy'`, rejects any other value |
| `src/console/data/adapter.ts` | confidence text uses the helper |
| `src/console/stages/AeroControls.tsx` | beta-off clears only `'calibrated'`; opt-in state from the helper. No label or layout change |
| `src/application/flightDragLegacyChoice.test.ts` | new: 6 tests |

The engine, `crates/` and the WASM are untouched.

**Deviation from Gate 1 §7, stated plainly.** The archive-validation relaxation (an archived
`flightDragSource` option with an absent vehicle field) is **moved to commit 2**. Commit 1 changes no
derivation, so no archive can need it, and adding it now would loosen an existing refusal test
(`projectJson.test.ts` "is not derived by the archived vehicle") for nothing. Commit 2 will change that
test's meaning and record it.

## Tests changed (A3)

**No existing test was edited.** One new file, `flightDragLegacyChoice.test.ts`, with these
(old meaning → new meaning: none; all new):
`'legacy'` derives the same options as absent; admits and refuses as absent; same confidence text;
round-trips and rejects other values; no candidate refusal; archives a `'legacy'` run with no drag option
and no drag line.

## Identity proofs (all outputs under `out/K3/`, git-ignored)

All use the archived baseline WASM `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`.
"Pristine" is `git archive d635726` exported to a temp directory, run with the same commands.

| Check | Command (summary) | Result |
|---|---|---|
| Three templates, field for field | `preset-compare.probe.ts`, `PROBE_OLD_WASM = PROBE_NEW_WASM = bc19590b…`, run on this tree and on pristine `d635726` | The two output files are **byte-identical**, sha256 `8ba51eb015fb7096d9cc5ba06df7083ff864ac6b1822bd3d8d62d1add8a1aaaa`. Apogees: Alpha III 298.92375069659687 m, NASA SL 532.8435782954323 m, Spaceport 5013.508465461415 m. Dispatched options include no drag option; `runManifest.axialDrag` still says "calibrated drag not requested" |
| Cohort + `summarize.cjs` | L0 `cohort.probe.ts` and `summarize.cjs` copied to `out/K3/tools/` with output paths changed only; `native-c.json` copied from the L0 evidence (`2ccf34b3…92cc`) | probe passes; `summarize.cjs` exit 0 (WASM-vs-native max A 6.43e-16, B 3.70e-16, C 3.68e-16; native A/B reproduce the step-0 baseline). `summary.json` = `474947bf…1f68` and `wasm.json` = `55ca56b9…c7fa`, **both equal to the L0 records**. MAE/within: A 9.6034 % / 13, B 5.6240 % / 18, C 5.3534 % / 16 |
| Archived fixtures | `readProject` then `writeProject` of both `src/formats/__fixtures__/*.json`, hashed, on this tree and on pristine | **identical** (`project-main-1.0.0` `8adf1dc4…014f`, `project-workbench-1.1.0` `af543f0a…d181`); fixture tests also pass in the full suite |
| `tsc` | `./node_modules/.bin/tsc --noEmit -p .` | exit 0, 0 errors (`out/K3/tsc.log` empty) |
| Unit suite | `vitest run --maxWorkers=2` | **185 files: 184 passed, 1 failed; 2155 tests: 2154 passed, 1 failed** (`out/K3/vitest-full.log`) |

**The one failure is a timeout, not a regression.** `src/sim/monteCarlo.test.ts` "keeps every perturbed
rail elevation inside the solver domain at both bounds" hit the 300 s limit during the full run on a loaded
host (about 9 GiB used, swap in use). Alone (`--maxWorkers=1`, `-t`), it **passes** on this tree in 97 s and
on pristine `d635726` in 119 s. I changed no timeout and did not touch the test. It should be re-run on a quiet host.

## Not done

- Cargo/engine suites: not run, because no Rust source changed.
- `pnpm build`, `pnpm test:browser`, screenshots: commit 2 only (A5).
- No push. The default switch, the nozzle carry, the UI checkbox, admission change and the archive relaxation are commit 2.

## Setup used, for reproducibility

This checkout had no `node_modules` or engine WASM (both git-ignored). I symlinked `node_modules` from the goal worktree
and copied its `src/engine/astraea_engine.wasm`, which has the same sha256 `bc19590b…`. Because `pnpm exec` tries to
reinstall into a symlinked `node_modules`, I called `./node_modules/.bin/{tsc,vitest}` directly. The `node_modules`
symlink is untracked and must not be committed.

## Forward-compatibility consequence (for the Release Readiness Report)

No schema bump (owner decision). A project file that carries `flightDragSource: "legacy"` is **refused by builds that
predate this change** (their parser accepts only `"calibrated"`). Files without that value load in both directions.
This only matters once the app can write `'legacy'`, which is commit 2.
