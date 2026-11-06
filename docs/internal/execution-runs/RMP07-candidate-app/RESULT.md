# RMP07 candidate application and persistence — author result

Status: **review-ready local implementation, not accepted.** The author did not
self-accept, edit the acceptance register/manifest/index/TASKS/handoff, or claim
all RMP07/RMP15 checks complete. The gate proposal is preserved unchanged at
`PROPOSAL.md`; this result records the gate amendments and actual delivery.

## State and routing

| Item | Value |
| --- | --- |
| lane base | `101e9e7afd4de70a75f3397738a6ace868acec0d` (exact activation pin) |
| source commits | `0e09a8e` contract/schema, `aaac9e6` console journey, `88bdd46` persistence/consumers, `f1e480b` browser harness schema tracking, `8d1689e` mount-field preservation test |
| author route | OMP direct `deepseek/deepseek-flash`, catalog **DeepSeek V4.1 Flash 1017**, `resolvedModelIsFallback: false`, `thinkingLevel: max`; verified from the lane session metadata and `omp models deepseek --json` |
| host/toolchain | 8.0–8.5 GiB available at build/test start; rustc/cargo 1.99.1, Node 26.11.1, pnpm 12.14.0. No dependency install: checks reused the sibling worktree’s existing offline `node_modules` through a temporary symlink, removed before delivery. |
| proposal | unchanged, 944 lines, SHA-256 `86fb54cdc26be4581f31c48151bf8d74ab325297c1c891883dd6dfd42c0c1454` |

## Supplement correction — current review cycle

> Historical correction: its unapproved 1.13 schema bump and the F1/F2b gaps
> were returned by `REVIEW-SUPPLEMENT.md`; current source and checks are in this
> section. Its original observations and logs remain intact.

Status: **review-ready correction, not accepted.** The coordinator's
`REVIEW-SUPPLEMENT.md` findings are ground truth and are retained verbatim in
the repository. The 1.13 envelope bump was unapproved and has been reverted to
the originally approved 1.12 cutover; the prior 1.13 rework receipts remain
historical and are not rewritten. The author did not self-accept or edit the
register/manifest/TASKS/handoff.

| Item | Current value |
| --- | --- |
| prior lane HEAD | `9c7982a509196263feea2de232a1a6539cb3c808` |
| supplement source commit | `3ed90bbc6bfaec4d6f6dd12ee8484b6502e09e8d` |
| project schema | approved `1.12.0`; identity-only `1.11.0 -> 1.12.0`; candidate fields only at 1.12 |
| retracted | unapproved `1.13.0` and empty `1.12 -> 1.13` step; no changed-format contract exists |
| author route | direct `deepseek/deepseek-flash`, catalog **DeepSeek V4.1 Flash 1017**, `thinking: max`; lane `model_change` records `resolvedModelIsFallback: false`; no fallback requested/observed |
| host/toolchain | 9.2–9.6 GiB available before heavy work; rustc/cargo 1.99.1, Node 26.11.1, pnpm 12.14.0; offline cache; max 2 test workers |

### Supplement fixes

- **F2b:** `runMonteCarlo` under a candidate selection now changes only the
  refusal text; it does not clear `jobs.running`, `candidateAbort`, or
  `runToken`. The command-palette action therefore cannot re-enable Run, remove
  Cancel, admit a second mass request or dispatch a second candidate case while
  the first admission is active. Wording now states the selected experimental
  candidate contract is unsupported for ensembles, not an increment placeholder.
- **F1:** the archive parser now requires the retained final sample's position,
  velocity and flags to equal `finalState`/`finalFlags`, and requires the exact
  declared retention count: all samples below the 5000 cap, or exactly the
  capped subset above it. The weak event-adjacency assertion was removed because
  it was guaranteed by first/final samples and could not prove decimated context;
  no stronger claim is made. Actual coordinator 1.12 retained-final and
  omitted-context negative fixtures now fail closed.
- **Schema:** `PROJECT_SCHEMA_VERSION` and all callers/tests are back on 1.12;
  the `PROJECT_SCHEMA_V1_12_0` constant, extra step and false “1.12 predates
  candidate” comments are gone. The retained actual 1.12 candidate receipt
  imports successfully; 1.13 files stay raw historical evidence.
- **Browser import preservation:** the actual 1.12 receipt imports, while the
  actual 1.12 final-sample and omitted-context negatives are refused with
  `Could not load` and the current candidate selection/document remains.
- **Cancellation:** normal bounded 2 s / 0.01 s request, test-only delayed worker
  delivery; Cancel remains available and records no result/case.

### Supplement checks (actual commands/results)

| Check | Result |
| --- | --- |
| `node_modules/.bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| focused candidate/result/schema/import tests (6 files) | **182 tests passed** |
| final full suite `node node_modules/vitest/vitest.mjs run --maxWorkers=2` | **134 files / 1742 tests passed**, exit 0 |
| `PATH="$HOME/.cargo/bin:$PATH" pnpm build` | exit 0; engine/site built |
| engine WASM | 1,827,192 bytes SHA-256 `da38461e247274f605b52abe06e71fad2c8eadbd76d55aa0ee31f069d0ce9ac6`; dist asset identical |
| rebuilt app asset | `app-Cuy6nalO.js` SHA-256 `c9a07aa4ffbc4ae94ac69cf4a0d490bf274c9b689bc053ae7b187d592a3122cc` |
| production-CSP Chromium supplement | exit 0; no page/runtime/CSP errors |
| candidate result | input/model digest `8f1173f6513d13cd6038e17476e9a746f1586257e2224fc4f8df9755a0e23820`; executed WASM equals dist SHA |
| palette F2b | two synchronous Run activations plus real palette action → Run stayed disabled, Cancel stayed present, refusal text shown, exactly **1** aggregate mass and **1** candidate worker call |
| F3 | real legacy run then candidate opt-in hid target, gates and `Run rN` sidebar; screenshot retained |
| F1 imports | actual 1.12 accepted; final-sample and omitted-context 1.12 negatives refused; open document preserved |
| save/reopen/load/rerun | passed; Saved Runs showed candidate archive and engine/input digests |
| normal cancellation | 2 s / 0.01 s; `Cancelled — no result recorded.`; no case appended |

Durable supplement receipts: `../evidence-rmp07-candidate-app/supplement-2026-10-29/`
(build log `df3db8d1…287b`, browser log `fc9d07d5…ce0e`, focused log
`0993405a…da67`, full-suite log `ab04d454…e40b`, typecheck log `850a697f…731b`,
palette screenshot `2aa25728…be9d`, negative-import screenshot
`d08b0c9a…f8632f7`, cancellation `2f168621…7546`, harness
`8c5ac024…d50f5`, retained 1.12 receipt and both negative files). The
coordinator receipts remain untouched in the durable root.

### Supplement failures retained

- The supplement itself recorded actual pre-fix acceptance of the final-sample
  and omitted-context tampering, the palette admission escape and the 1.12
  file rejection by the 1.13 bump. Those observations were not rerun merely to
  confirm; they are preserved in `REVIEW-SUPPLEMENT.md` and the durable
  coordinator JSON/WebP receipts.
- The earlier `pnpm build` without `$HOME/.cargo/bin` on PATH failed with
  `spawnSync cargo ENOENT`; rerun with PATH succeeded. Earlier interrupted suite
  and first F3 sidebar/cancellation attempts remain retained in the prior
  rework section.
- The first supplement browser attempt used a stale 1.13 transient fixture and
  could not find Run; fixtures were regenerated to the approved 1.12 envelope,
  then the final proof passed. This is retained as a test-harness attempt, not a
  product failure.

The engine's `curveMatchesReferenceSample=false` observation is retained for the
engine owner; no assertion relaxation, fixture retuning or app workaround was
made. Long-request/tiny-step response-size limits remain a runtime risk. No Rust,
physics, defaults, IO caps or build flags changed.

## Historical correction — 1.13 correction rework (superseded)

Status: **historical correction record; superseded by the supplement** (the
1.13 bump was unapproved and F1/F2b gaps remained). This section supersedes the
older first-implementation schema/check counts below; the original first-implementation observations
remain intact. The author did not self-accept or edit the register/manifest/
TASKS/handoff. The coordinator `REVIEW.md` is retained verbatim and committed
with this record.

| Item | Current value |
| --- | --- |
| lane base / previous HEAD | `99f2a5684841146809f84ef94c08aef9852698a3` (19-file F1–F5 correction commit) |
| correction source commits | `99f2a56` (archive/consumer/admission corrections), `59e5566` (final consumer/freshness tests), `44bb481` (malformed candidate import preservation) |
| first source commits | retained below: `0e09a8e`, `aaac9e6`, `88bdd46`, `f1e480b`, `8d1689e` |
| author route | OMP direct `deepseek/deepseek-flash`, catalog **DeepSeek V4.1 Flash 1017**, `thinking: max`; lane session `model_change` records `resolvedModelIsFallback: false`, `thinking_level_change` records `max`, and a fresh coordinating catalog re-resolved the alias to the same 1017 entry. No provider fallback was observed or requested. This is route metadata, not a server-build attestation. |
| toolchain | rustc/cargo 1.99.1, Node 26.11.1, pnpm 12.14.0; offline dependency store reused; no downloads |
| current project schema | `1.13.0`, identity-only `1.11.0 -> 1.12.0 -> 1.13.0`; candidate fields fail before 1.13 |
| current record state | coordinator `REVIEW.md` untracked before the record commit; no tracked dirty source at start; no running temporary server/browser/compiler remained |

### Review findings closed

- **F1:** `candidateResult.ts` now checks supported identity/status/policy
  domains, nonnegative/ordered event/sample/query/peak times inside the run,
  `CompletedRequestedHorizon` completion, apogee/event agreement, final
  query/reference state/flags/time, curve grid/reference and supported Machs,
  and mandatory sample context. Archive parsing with context links horizon,
  curve grid, source/environment/geometry, axial and motor-station data to the
  archived request/selection. Unknown report/archive result schemas are refused;
  nullable CP/flow/coefficients and historical schemas remain accepted.
- **F2:** run admission claims a monotonic token and abort before the first await;
  every continuation/cleanup is epoch/token guarded. Cancellation during hashing
  or mass preparation cannot dispatch later, cancellation during dispatch
  rejects its analysis record, and late callbacks cannot clear a newer run.
  Tests include deferred preparation/double activation and worker cancellation.
- **F3:** Mission target, Verify gates/stale notice, Aero history, preview,
  Build, header/sidebar and Model status are guarded by selected/recorded model.
  A real built legacy run then candidate opt-in showed no legacy apogee target,
  gate rows, Flight sidebar `Run rN`, or Model-status result; history remains in
  Saved Runs. The first rework browser screenshot exposed the sidebar/mission
  readout; `FlightInspector`, `LaunchInspector`, `ModelStatusPanel` and the
  Verify stale notice were corrected, then the real browser journey was rerun.
- **F4:** candidate capture uses a detached `structuredClone` and freezes only
  the snapshot; a regression mutates caller project/vehicle/launch after capture
  and verifies the retained invocation is unchanged.
- **F5:** one canonical invocation comparison (model/selection/vehicle/motor/
  launch/environment) is used by `useFreshness`, `useAnalysisFreshness` and
  `useFlightQualification` in addition to the existing FNV display key. A forced
  key-collision regression marks header/Flight/Build freshness stale while the
  key remains equal.

### Current final checks (actual commands/results)

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json` | exit 0 |
| focused `candidateResult`, `candidateProject`, `candidateStore`, `projectIo` | 4 files / 83 tests passed |
| final full suite `node node_modules/vitest/vitest.mjs run --maxWorkers=2` | **134 files / 1738 tests passed**, exit 0 |
| `PATH="$HOME/.cargo/bin:$PATH" pnpm build` | exit 0; engine + site built |
| engine WASM | 1,827,192 bytes SHA-256 `da38461e247274f605b52abe06e71fad2c8eadbd76d55aa0ee31f069d0ce9ac6` |
| dist engine asset | `astraea_engine-tQCJxEIX.wasm`, same bytes/SHA |
| rebuilt app asset | `app-CmNNAPOk.js` SHA-256 `a3a940ea6ed8f676f4aefd416c35e200daa98c9d56a434ce4666bae59c6ac101` |
| production-CSP Chromium rework | exit 0; no page/runtime/CSP errors |
| browser candidate result | input/model digest `8f1173f6513d13cd6038e17476e9a746f1586257e2224fc4f8df9755a0e23820`; executed WASM `da3846…9ac6` |
| double activation | exactly one candidate worker post from two synchronous Run activations |
| browser sidebar/target/gates | legacy run existed, candidate selection hid Mission target, Verify gates and `Run rN` sidebar readout |
| save/reopen, stale import, cancellation | passed; cancellation normal bounded horizon (2 s / 0.01 s) with a test-only delayed dispatch window; no case appended |

Durable rework receipts (new directory; historical `/tmp` copy remains intact):
`../evidence-rmp07-candidate-app/rework-2026-10-29/` — build log
`3d013456…e265`, browser log `6319d6c6…468c`, focused log
`4c1e4e73…c03b`, full-suite log `a837f782…1c40`, screenshots including
`candidate-browser-03b-candidate-hides-legacy.png` (SHA-256 `f0ddf949…ca6`),
`04-result` (`4a0e354a…102d`), `05-reopened` (`de3b9566…7785`),
`06-stale-refusal` (`2e49e871…cce`), `07-cancelled` (`b6330460…cb24`), and
the transient rework harness (`710a0ae5…ad4b`). The original coordinator
receipts (`coordinator-parser-probes.json`, `coordinator-duplicate-run.json/.webp`)
remain untouched in the durable root.

### New failures retained

- The first rework `pnpm build` failed with `spawnSync cargo ENOENT` because the
  shell PATH lacked `$HOME/.cargo/bin`; the same command with that PATH added
  succeeded. No build flag or source changed.
- The previous session’s final full suite was interrupted by SIGTERM at
  2026-10-29T12:27:27Z and left only the RUN header; it is not counted as a pass.
  The suite was rerun after coherent source and passed 1737 tests; adding the malformed-import regression made the final count 1738.
- The first cancellation browser attempt detached the button before it could be
  clicked; the final harness delays only the candidate worker dispatch and uses a
  normal 2 s/0.01 s bounded request. The failed observation is retained, not
  presented as a pass.
- The initial F3 rework screenshot showed the legacy `Run r1` sidebar under the
  candidate selection; the consumer guards were fixed and the rebuilt browser
  journey was rerun. This was in addition to the coordinator’s duplicate-run
  receipt, which remains historical evidence of the pre-fix failure.

`curveMatchesReferenceSample` remains an honest `false` observation from the
engine and is retained for the engine owner; no app equality workaround was
added. The long-request/tiny-step response-size limit remains a runtime risk;
no cap, threshold, physics/default, Rust or build-engine change was made.

## Gate amendments applied

1. **Mount fields preserved.** The candidate DTO is the existing full
   `vehicleDto`/`motorDto`; `isMotorMount`/`assignedMotorId` are never dropped.
   `candidatePreflight` refuses any flagged mount with the accepted adapter's
   ambiguity reason. The supported journey uses the existing synthetic native
   candidate geometry, imported as an ordinary project through the UI. The
   aft-fallback station/total-length derivation is archived. No preset was
   rewritten or simplified.
2. **Physical fields and declarations preserved.** No field whitelist bypass:
   the exact source components/motor plus the explicit declarations are in the
   request and declaration hash. Only preflight/consumer behavior was added.
3. **Actual serializer null semantics.** Flow, coefficients, CP, normal
   derivatives, canopy drag, landing and apogee are nullable; CP may carry null
   station/kappa with a reason. No nullable value is rejected merely for being
   null or zero-filled. Runtime samples are projected once into the bounded
   display subset; query/curves retain the curated nullable fields.
4. **Sample retention.** First/last, event-adjacent and every observed-prefix
   peak time context are retained before even fill; mandatory context over the
   5000-sample cap refuses rather than dropping it. Counts/policy are stored.
5. **One projection.** `candidateOutputDictionary` feeds live Flight, Saved Runs
   and Build trace numeric readouts. Candidate IDs explicitly say observed
   prefix/not apogee; landing availability uses the candidate record's actual
   touchdown only. The legacy dictionary revision is untouched.
6. **Tests are behavioral.** New tests cover mount/geometry refusal, request
   preservation, nullable result parsing, mandatory sample context, archive
   version gates, old 1.11 dictionary migration, no legacy dispatch, cancellation,
   undo/redo, load-inputs no-auto-run, save/reopen and tampered import. No
   source-text or copy/echo tests were added.
7. **Actual checks once.** One production engine build, one Vite build, one final
   full suite, one production-CSP Chromium candidate journey, plus the standing
   legacy browser smoke. Focused corrections were rerun only for the failed
   parser/wind/scenario/selector paths.
8. **Browser proof is external and transient.** `.candidate-journey.mjs` and
   `candidate-app` receipts/screenshots live outside Git under
   `/tmp/rmp07-candidate-evidence/`; the script is removed after proof. Dist WASM
   SHA is the new build root's identity; no prior receipt was transferred.

## Implemented contract

- `flightModel` union: exact legacy v1 descriptor or exact candidate v2
  descriptor with CA0/source declarations/interpretations/quadrature/design
  declaration SHA and request settings. Unknown selections fail closed.
- Project schema `1.12.0`; identity-only `1.11.0 -> 1.12.0`; 1.11 canonical
  dictionary documents still migrate; candidate selection/v3 inputs/candidate
  results are allowed only at 1.12 and fail before migration on older versions.
- Candidate case inputs version 3 carry the exact `simulate_candidate` request,
  aggregate-mass derivation (aft fallback only), context and no legacy engine
  options/calibration/shear/ensemble/report history.
- Candidate result archive is strict, versioned (`astraea-candidate-result-archive/1.0.0`)
  and separate from the legacy output dictionary; exact engine report schema
  `astraea-native-candidate-report/2.0.0`, result schema and content-identity
  scheme are enforced. Executed WASM identity is stored on the case, separate
  from the engine-reported input/model digest.
- Console: real opt-in panel (CA0/provider/source/declarations/interpretations/
  quadrature/horizon/step/curves), one-call candidate dispatch with an abort
  signal, `Cancel run`, result/query/curve/status presentation, save/reopen/
  import/load-inputs/undo/redo, and explicit refusals for preview, ensembles,
  legacy aero/stability, copilot flight checks, calibration fit/apply,
  moment-arm history, KML and arbitrary query.

## Final checks and evidence

| Check | Result |
| --- | --- |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |
| focused candidate/project/store tests | 4 files / 23 tests passed |
| affected regression batch | 18 files / 308 tests passed |
| final full vitest suite | **134 files / 1725 tests passed** |
| production engine build | `CARGO_BUILD_JOBS=2 CARGO_NET_OFFLINE=true node scripts/build-engine.mjs`; rustc 1.99.1; **1,827,192 bytes**, SHA-256 `da38461e247274f605b52abe06e71fad2c8eadbd76d55aa0ee31f069d0ce9ac6` |
| production site | `node node_modules/vite/bin/vite.js build`; dist WASM `astraea_engine-tQCJxEIX.wasm` same SHA/bytes |
| production-CSP Chromium journey | passed: explicit selection; actual candidate run; query/curves; save file; browser slot save/reload/open; undo/redo; load saved inputs; explicit rerun; tampered import refusal; actual bounded worker cancellation; no page/runtime/CSP errors |
| browser identity | app-recorded executed WASM SHA equals dist SHA; candidate case input/model digest `dcf399474ad6561a948a43f53428d128cd6d3370bb096b0bafa5be323712090f` |
| same-state presentation | query equality `true`; curve equality `false` at reference Mach 0.061643410537415046 (also false in a separate 1.8 s probe). Both are displayed from the engine report; the app makes no equality/accuracy claim. `candidate-equality.png` SHA-256 `05132259b847d1e227f8ee70bc415c5e0026d7ea4c663d1530cc3608f126448c`. |
| saved project receipts | `candidate-project-saved.astraea.json` 273,549 bytes SHA-256 `dd9b7330b044b0542ce5984b2c98ce989e8da7a59385c6b02705cef8bb5b618a`; post-cancellation project 542,813 bytes SHA-256 `05a0f7d4832fb4dee0c94b7cde4cd6d999cc5243529fac8113f4d52cfe5e6778` with exactly two candidate cases (two explicit runs; cancellation appended none) |
| standing legacy browser smoke | exit 0: 533 m legacy baseline, all eight stages, exports/imports, freeform, cross-tab stale save refusal, 1000-run ensemble, copilot, calibration save/reopen and share bundle. The first attempt failed on the harness’s stale `1.7.0` schema assertion; `f1e480b` tracks `1.12.0`; rerun passed. |

The candidate journey used the retained synthetic native candidate geometry
(two internal parachutes, no flagged mount), calm air, rail elevation 85 deg,
horizon 2 s, step 0.01 s, and an explicit CA0 0.35 declaration. It is a supported
prefix, not a useful full-flight or accuracy claim.

## Failed attempts retained

- First production-CSP candidate attempt: the result parser required curated
  top-level sample keys and rejected the engine's nested `state`/`mechanics`
  samples. Fixed by a one-way runtime-sample projection; focused tests added.
- Second attempt: the journey project carried 3 m/s surface wind and a single
  parachute; the engine refused incidence at t=0. The accepted synthetic fixture
  uses calm air and two internal parachutes; the proof was moved to that
  permitted scenario. No support rule, tolerance or fixture was changed.
- A save-file attempt returned `Save cancelled — nothing was written` because
  headless Chromium's `showSaveFilePicker` aborted; the transient journey
  disables that picker to exercise the existing download fallback (as the
  standing browser harness does).
- Slot save status was initially read before its async update; the final journey
  waits for `Saved locally` and verifies `Opened saved project`.

## Residuals / not claimed

- No candidate ensemble, monte carlo, profile/E1 dispatch, local axial source,
  or arbitrary user-state query.
- No empirical/numerical qualification; candidate output remains
  experimental-unqualified with observed-prefix labels.
- Long-horizon/tiny-step response size remains a runtime risk; no engine cap or
  new IO budget was added.
- The one-parachute variant of the synthetic geometry was refused by the engine
  in this scenario; it remains a real candidate limitation, not a reason to
  alter support.
- The accepted runtime reported `curveMatchesReferenceSample: false` in this
  scenario even at a nonzero reference Mach (query equality true). The UI shows
  the false value; no engine/support change or equality workaround is claimed.
- Candidate/legacy cross-model result deltas are withheld; archived input
  differences remain historical.
- No Rust, build-engine, core-equation, default, budget, threshold or historical
  identity change. No protected data or external service was accessed.

## Acceptance

Author cannot accept. This delivery supplies candidate-scoped evidence for
RMP07-C01/C04/C05/C06/C07 and RMP15-C01, retains RMP07-C02's existing PASS
without regression, and supplies a new RMP07-C08 receipt for the new bytes.
Coordinator review/integration and the final register dispositions remain open.
