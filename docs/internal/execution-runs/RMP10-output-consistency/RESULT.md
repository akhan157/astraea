# RMP10-C06 — output dictionary and recovery/export consistency

## Bounded result

Author-complete, **pending independent review**. RMP10-C06 remains `in_progress`; this record does not mark an acceptance check pass or close parent RMP10. The bounded lane delivered a source-grounded output dictionary, a canonical Build trace projection for flight/recovery outputs, removal of independent gate rounding/qualification loss, one shared KML terminal predicate, and regression-first cross-consumer tests.

- **Owner/model/effort:** Pi coding agent, `opencode-go/kimi-k3.1-pro`, high reasoning. No subdelegation or independent reviewer.
- **Base:** `d278d49421cdd6ecd3e390c8ce3fdd4524e4f692`.
- **Branch/worktree:** `rmp10-c06-output-dictionary`, `/home/ak/.paseo/worktrees/3s8t98rp/rmp10-c06-output-dictionary`.
- **Resulting source commit:** one local commit containing this record; its self-hash cannot be embedded in its own content and is supplied in the final coordinator handoff. Base-pinned current source/log hashes are in `EVIDENCE.json` and the external evidence directory.
- **Dirty/protected state:** no sibling worktree, acceptance register, packet, coordination, contract, adapter, Saved Runs, application, formats, engine/core, schema, default, model, threshold, changelog, or `.pi/` edit.

## Behavior and user consequence

1. `docs/internal/output-dictionary.md` revision `RMP10-C06/1` now defines every requested flight/recovery output, status, sampled-Q metadata, event field and the recorded Apogee → touchdown interval: actual source symbol/formula, frame/datum/timebase, unit, qualification, resolution, null semantics, precision, downstream consumer/rule, and the generic-engine versus competition-rule boundary.
2. Build's trace now has `simulation.outputDictionary`, `simulation.outputs`, and structured `sampledMaxQ`. Outputs come from the same `RunSummary`, `landingAvailability`, and `recordedDescentInterval` used by readouts. Canonical SI value/unit/confidence/reason are preserved; unavailable/non-finite values are explicit null with a factual reason. No display rounding is exported.
3. Landing speed/energy and Apogee → touchdown become null/unavailable in the trace on non-nominal/timeout records, with the same reason shown in Recovery. Drift remains the final-record radial offset, consistent with the current readout and explicitly not nominal-landing evidence.
4. Derived interval confidence cannot exceed the modeled native touchdown-event basis, even if both clock carriers claim a stronger level. Otherwise it uses the weakest of the two clock results and that event basis.
5. Build gate traces no longer round independently to four significant digits. They retain canonical finite value/unit/confidence, gate reason, and value qualification reason; non-finite values remain null.
6. KML preview/final export now share `hasKmlNominalTouchdown`; explicit `terminationReason === 'touchdown'` is still required in addition to shared landing availability. No KML behavior or threshold changed.
7. RecoveryCard required no code change: it is the packing/separation-charge card and delegates those formulas to the existing recovery modules; it contains no flight-result/descent formula.

No physics, numerical method, engine bytes, runtime architecture, event reconstruction, saved schema, or physical/accuracy qualification changed.

## Source/runtime identities

- Production WASM was copied, not rebuilt, solely because the frontend import graph requires the asset. Source and final dist SHA-256 are both `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`; see `wasm-sha256.log` and `wasm-source-and-dist-sha256.log`.
- No Cargo command, WASM execution, RMP12 study, native numerical study, protected outcome, external data, browser run, or TypeScript production fallback was used.
- Tests use existing synthetic fixtures and jsdom/stubbed engine seams. They are software consistency evidence, not physical or measured qualification.

## Red-first chronology and verification

All logs are under `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp10-output-consistency/`.

1. **Setup failure retained:** `red-before-output-trace.log` ran zero tests because the fresh worktree lacked the WASM import asset. The sealed artifact was then copied and its required SHA verified; no rebuild occurred.
2. **Initial behavioral red retained:** `red-before-output-trace-with-sealed-wasm.log` = 8 pass / 3 fail of 11. Two failures reached absent `simulation.outputs`; gate export produced `5.123` instead of `5.123456789` and omitted qualification. The nominal test first stopped on an incorrect test selector for the existing `Drift` aria-label, before its trace assertion.
3. **Selector-only correction retained:** `red-corrected-readout-selector.log` = 8 pass / 3 fail. All three new product assertions now fail for the intended reasons: two absent output dictionaries and one rounded/unqualified gate. No product assertion was weakened.
4. **Implementation greens:** `green-output-trace-1.log` = 26 pass / 2 files; after all-entry/null/non-mutation tests, `green-output-trace-2.log` = 29 pass / 2 files.
5. **Second regression-first qualification correction:** `red-descent-event-qualification.log` = 18 pass / 1 fail of 19; two measured clock carriers incorrectly produced a measured interval despite the modeled native touchdown event. After including the event basis, `green-descent-event-qualification.log` = 19 pass.
6. **Affected suite:** `affected-vitest-1.log` = 71 pass / 7 files before the final qualification/metadata assertions. Final `affected-vitest-final.log` = **72 pass / 7 files**, command used `--maxWorkers=1`: both owned recovery test files plus Build export, Saved Runs, site/telemetry, output contracts, and console data.
7. **Typecheck:** `tsc-1.log` and final `tsc-final.log`, `pnpm exec tsc --noEmit`, exit 0 (empty logs).
8. **Build:** `vite-build-1.log` and final `vite-build-final.log`, `pnpm exec vite build`, exit 0; 3112 modules transformed. No package `build`/`test` script or `build:engine` was invoked.
9. **Bookkeeping failure and correction retained:** the initial pre-commit `git diff --check` passed but did not include the then-untracked dictionary. `git-diff-check-committed.log` subsequently failed on eight Markdown hard-break trailing spaces. Those spaces alone were removed, evidence hashes/chronology updated, and the same single commit amended; `git-diff-check-committed-final.log` is the final clean committed-diff check. Package validation passed before and after (`package-validation.json`, `package-validation-committed-final.log`). Package validation is integrity bookkeeping only.

New owned coverage is 7 test cases: 4 pure dictionary/qualification cases and 3 rendered readout/trace/gate cases. Together with the retained RMP10b cases, the two owned files now have 30 cases (19 pure + 11 rendered). The final affected run has 72 cases total.

## Duplicate-formula audit / full findings

### Resolved or confirmed

- **Recorded interval:** only `recordedDescentInterval` computes Apogee → touchdown. Recovery and Build use it; apogee 10 / delayed drogue 13 / touchdown 30 yields 20, not 17. Missing/duplicate/derived touchdown and invalid/inconsistent clocks remain unavailable. Saved Runs and RecoveryCard have no competing descent formula.
- **Landing availability/deltas:** Flight Results checks both current and previous through `landingAvailability`; Saved Runs uses the same helper for both historical records; Build output projection uses it for both landing values and interval. Non-nominal/timeout values/deltas are withheld; both-nominal control still renders deltas.
- **Build output omission:** resolved by the shared `flightOutputDictionary` projection.
- **Build gate precision/qualification divergence:** resolved by raw canonical values and explicit qualification/reason fields.
- **KML duplicate predicate:** resolved by one shared local guard while retaining its deliberately stricter explicit-touchdown requirement.
- **Other quantities:** no consumer-side duplicate formula was found for apogee, maxima, rail-exit values, landing energy, drift, event values, or plots. RecoveryCard contains no flight-output formula.

### Open coordinator findings (also fully specified in the dictionary)

1. **F1 — `offNominalExcursion` dropped before UI/export.** `src/console/data/contract.ts::RunSummary` / `FlightRun` and `src/console/data/adapter.ts::toFlightRun`; consumer `Build.tsx::useExportCheck`. Expected for independent inspection: retain/export native `SixDofSimulationResult.offNominalExcursion`. Actual: native/DTO provide it and it affects validity, but FlightRun drops it, so Build cannot report it without fabrication. Requires sibling-owned contract/adapter work.
2. **F2 — saved flat summaries are only a subset and lack per-value qualification.** `src/application/runCases.ts::flightSummary`; `src/console/stages/SavedRuns.tsx`. Expected if saved summaries must reproduce the complete dictionary: the same quantities plus unit/confidence/reason. Actual: `maxQ`, `burnoutAltitude`, `weathercockAngleDeg`, `enveloped`, native `offNominalExcursion`, `sampledMaxQ`, and all confidence/reason are absent. No reconstruction or sibling schema edit was made.
3. **F3 — historical delta presentation differs from live Flight.** `SavedRuns.tsx` historical `b - a` / `toPrecision(6)` versus `Flight.tsx::ResultsTable` / `Value.tsx::DeltaChip`. Expected if identical presentation is required: same unit conversion, small-delta suppression, and qualification wording. Actual: Saved Runs intentionally uses stored units/six significant digits and lacks per-value confidence; live Flight converts units and suppresses small deltas. Landing availability itself agrees. Coordinator must decide whether the historical presentation is acceptable.

## Remaining scope / review boundary

- Independent coordinator/MiMo review is pending; `REVIEW.md` is exactly `pending independent review`.
- F1–F3 require decisions/work outside this lease. No silent contract/schema/presentation change was attempted.
- RMP10-C03 continuous peak evidence, complete C04 event/guide/contact/per-section qualification, remaining C06/C07 scope, physical measurements, numerical reserves, model qualification, team/platform/release gates, and applicable external rules remain open.
- jsdom and Vite are not a new built-browser journey, native WASM behavior proof, empirical validation, or installed-platform acceptance.
- No acceptance-register check was changed. No push, merge, release, deployment, outreach, payment, automation restart, or external contact occurred.
- No task-owned dev server, watcher, browser, reviewer, build, or native process remains. The source/compute lease is returned for coordinator review.
