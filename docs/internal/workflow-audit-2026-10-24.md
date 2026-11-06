# WF-01 workflow audit — 2026-10-24

Task: P1/P2 product workflows. State: motor registry, project-boundary isolation, and reproduced async I/O fixes ready for bounded integration review.

Base: `1745adb7265b642c6a7ecfd12e1418b51f159bcb`; worktree `/workspace/astraea-worktrees/workflows`, branch `delivery/workflows-20261024`. Motor fix: `7294efd`. Assigned coding/source audit agent; no model/usage telemetry exposed in the task context. No fresh holdouts, external flight data, native sessions or team witnesses were inspected.

## Findings, ranked by consequence

### WF-H1 — project replacement carries unrelated completed and late runs into the next saved project (confirmed and fixed)

At the original audited base, `src/state/project.ts:608–666` replaces project/motors/drafts and advances `projectEpoch`, but does not reset or scope analysis history. `exportableProject()` at line 696 sends **all** session history to `withRunCases`. `src/application/runCases.ts:82–129` accepts every completed flight/ensemble with a resolvable motor; it has no project identity check. `src/state/analysis.ts:96–109` accepts completion when its token is latest for the kind; opening another project does not change that token. The epoch is currently used for loaded-log isolation, not runs.

Minimal reproduction at the store boundary:

1. Start an ensemble analysis on project A, using its motor and an A-specific input key.
2. Complete it either before or after replacing A by New, opening a distinct envelope B, or loading another preset.
3. Serialize the new project using the real `serializeProject()` → `readProject()` path.
4. Actual: B contains A's `monteCarlo` case, A's input key, and A's motor record reference. Expected isolation assertion `cases === []` fails in all six transition/timing combinations.

The exact temporary diagnostic and all six failures are preserved outside the source tree:

- `/workspace/astraea-plan/evidence/workflows/workflowHistory.diagnostic.test.ts`
- `/workspace/astraea-plan/evidence/workflows/project-history-diagnostic.log`

Replay: copy that test into `src/state/`, source `/workspace/astraea-plan/env.sh`, run `pnpm exec vitest run src/state/workflowHistory.diagnostic.test.ts --maxWorkers=1`, then remove the temporary test. Exit 1 is the captured defect, not a passing acceptance. Synthetic ensemble payloads exercise the persistence boundary; they do not claim production engine execution.

Policy constraint: `src/state/openRunIdentity.test.ts` intentionally requires a completed same-design flight to remain current after saving and reopening that envelope, including a fin shear override. A blanket `analysis.reset()` on every open breaks this existing contract. Recommend a separate packet that isolates export history and invalidates pending completions at replacement while retaining only the explicitly allowed same-input completed presentation. Keep the same-design reopen tests and add distinct-project and pending-completion coverage. Preset loading is currently undoable and may need a separate history policy from opening a document.

Implemented the coordinator's boundary policy without schema/kernel changes: New clears analysis; opening retains only completed records whose exact generated case ID and input key occur in the incoming envelope. Matching geometry alone is insufficient. Preset replacement captures terminal context for undo/redo, strips running records, and advances the project epoch on boundary undo/redo. Analysis resolution accepts only running tokens. Console flight and ensemble callbacks are epoch guarded; replacement resets job chrome and aborts the ensemble where supported. This also prevents an old callback from completing or reporting an error on a newer project's job.

Saved implementation evidence: `project-boundary-after.log` (9 files, 95 tests passed), `project-boundary-tsc.log` (typecheck exit 0). Resume verification inspected the saved diff and reran only `pnpm exec vitest run src/state/projectBoundary.test.ts src/state/openRunIdentity.test.ts src/console/projectJobs.test.ts --maxWorkers=1`: exit 0, 3 files, 16 tests (`project-boundary-resume.log`). Coverage includes six replacement/timing combinations, terminal-only preset undo/redo, exact reopen identity, and old successful/failed flight/ensemble callbacks while new jobs run. No numerical source changed and prior full checks were not repeated.

### WF-H2 — undo restored binding/geometry but retained the edited/imported motor (confirmed and fixed)

Baseline `UndoEntry` held project/mission/shear but omitted the session motor registry. Curve edits write only that registry; same-designation imports replace registry entries. `undo()`/`redo()` restored envelopes without restoring the overlay, while motor resolution and `exportableProject()` give the overlay precedence.

Consequences: an operator could undo a thrust edit and still run/save the edited curve; undoing registration left its catalog record in export; undoing a same-designation replacement retained the replacement content. The baseline motor-undo test asserted only the binding, missing these effects.

`7294efd` captures the immutable registry reference with every undo entry, including merged console edits, and transfers it through undo/redo. No public schema, serialized format, numerical implementation or package dependency changed. Existing state updates replace registry objects and curve/import records, so history references remain stable under supported store actions. Undo storage is session-only; no migration is needed. Reverting the commit restores prior behavior and does not affect document readability.

Regression proof uses effective motor resolution and validated serialized/reopened motor records, plus catalog membership, for import/undo/redo, valid curve edit/undo/redo, and same-designation replacement/undo/redo. Three behavioral assertions fail against baseline production source and pass after the fix. The synthetic motor fixture was given a positive curve so serialized validity is exercised.

### WF-R3 — saved cases cannot reconstruct all earlier variant inputs (source-confirmed limitation; no schema change proposed)

`SimCase` (`src/formats/projectJson.ts:134–144`) stores an id, motor id, optional weather snapshot id and scalar summary. Snapshot kinds at lines 147–158 are weather and dispersion. `withRunCases` stores a content key and summary, not a frozen vehicle/launch configuration or motor content. Editing the geometry or replacing a same-id motor and saving leaves earlier run summaries without the earlier full inputs. A hash identifies content but cannot reconstruct it.

This prevents claiming that a single saved document reconstructs both baseline and variant inputs merely because its cases survive. Separately saved complete baseline/variant envelopes can still serve that workflow; production-engine replay and another operator remain required. A durable case-input schema is a coordinator-owned design decision, not part of the localized undo fix.

### WF-R4 — asynchronous persistence status and import ordering (confirmed and fixed)

Four real parser/storage reproductions fail at `92a6bfc`: a save followed synchronously by an edit or New writes the correct older snapshot but marks the current document saved; reversed completion of imports A then B leaves A current; and a pending import can replace New. The diagnostic controls only `File.text()` timing and uses actual localStorage/parser/adoption. See `projectIoRaces.diagnostic.test.ts`, `project-io-races-before.log` (exit 1, 4 failed), and `io-race-proposal.md` under the evidence directory. This is a false saved-state/lost-current-document defect, not demonstrated disk corruption.

After coordinator approval, `projectIo.ts` captures epoch and full exported content before asynchronous work. A durable save still commits its captured snapshot and preserves storage optimistic concurrency; only an unchanged document with the latest feedback intent receives its saved marker. Changed live content is reported as still unsaved. Older success/error feedback is suppressed, including native file-save callbacks.

A shared latest-request sequence covers project, geometry and motor imports, picker requests from before the dialog wait, and durable slot opens. A newer canceled/refused request does not resurrect older reads. Epoch/content guards stop reads from applying after New, preset, or committed document/registry/mission/shear changes. Background analysis completion does not cancel explicit load intent; Save still compares full exported content, including completed runs. A latest request canceled by changed content in the same document reports that it changed while loading; unrelated document replacements receive no stale feedback. There is no new schema/API, storage algorithm or numerical behavior.

Final focused verification: `pnpm exec vitest run src/state/projectIo.test.ts src/state/openRunIdentity.test.ts --maxWorkers=1` exits 0, 2 files/46 tests (`project-io-races-after.log`); `pnpm exec tsc --noEmit` exits 0 (`project-io-races-tsc.log`). Tests include actual stored snapshot bytes/revision, mission-only changes, conservative marker behavior on identical content after a newer request, reversed imports, each import kind after New/edit, canceled picker, slot-vs-drop ordering, changed-document read failure and late successful/failed native save feedback. These are parser/state and mocked native-seam checks, not installed-app acceptance.

Integration exposed three project menu/drop regressions: the initial full-export load guard canceled ordinary file loads when background analysis finished. Reproduced at `7e20aa7`: `project-io-chrome-before.log`, 3 failed/11 passed. Coordinator revised the policy to distinguish explicit document edits from background results. Open/import now fingerprints actual committed project, motor registry, mission and shear; Save retains the full-export comparison. Updated the completed-run load regression to require a successful replacement, and added a separate Save regression proving later run cases stay unsaved. Final command `pnpm exec vitest run src/console/shell/projectChrome.test.tsx src/state/projectIo.test.ts src/state/projectBoundary.test.ts src/state/openRunIdentity.test.ts --maxWorkers=1`: exit 0, 4 files/68 tests (`project-io-chrome-after.log`); typecheck exit 0 (`project-io-chrome-tsc.log`). This is a policy correction based on integrated UI evidence, not a weakened committed-edit guard.

### WF-R5 — RockSim information-loss boundaries remain narrower than full project fidelity (source review only)

ORK explicitly refuses unsupported mass/CG overrides (`src/formats/orkParser.ts:331–356`) and preserves supported component mass overrides. RockSim imports recreate supported geometry with fixed material/position defaults and do not read KnownMass/KnownCG/UseKnownMass (`src/formats/rktParser.ts:105–241`). Its user disclosure says single-stage geometry only with staging/motor limits (`src/io/files.ts:245–255`). Do not equate successful geometry import with mass/CG fidelity. A rights-qualified real RKT fixture and explicit preservation/refusal matrix would resolve the remaining scope; no speculative parser expansion was made.

## Evidence and coverage boundary

Commands ran on Linux, Node 24.19.0, pnpm 12.14.0, one Vitest worker; sources pinned above except the motor fix and its regressions. Evidence directory: `/workspace/astraea-plan/evidence/workflows/`.

| Check | Actual result | Evidence |
|---|---|---|
| `pnpm install --frozen-lockfile --store-dir /workspace/.toolchains/pnpm-store` | Exit 0; 280 reused packages, none downloaded; isolated worktree dependencies | Tool output; lockfile unchanged |
| `pnpm exec vitest run src/state/stores.test.ts --maxWorkers=1` before production fix | Exit 1; 3 failed, 15 passed; semantic failures | `motor-undo-before.log` |
| `pnpm exec vitest run src/state/stores.test.ts src/state/projectIo.test.ts src/state/componentOps.test.ts src/state/missionPersistence.test.ts src/state/finShearPersistence.test.ts --maxWorkers=1` | Exit 0; 3 existing files, 42 passed. Last two requested paths do not exist and were not checks | `motor-undo-after.log` |
| `pnpm exec tsc --noEmit` | Exit 0 | `motor-undo-tsc.log` (empty successful output) |
| `pnpm exec vitest run src/console/store.test.tsx src/console/componentActions.test.ts src/console/shell/projectChrome.test.tsx src/state/openRunIdentity.test.ts --maxWorkers=1` | Exit 0; 4 files, 38 passed, including same-design save/reopen current-result policy | `motor-undo-console.log` |
| History-isolation diagnostic described above | Exit 1; 6/6 failed invariants | `project-history-diagnostic.log` |

The console check initially ran zero tests because the isolated worktree lacked generated WASM. With coordinator authorization, copied the unchanged baseline artifact into this worktree (an independent file, not a mutable shared link); SHA-256 verified `e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985`. No engine build or numerical source change was required. The final console log records the successful retry. These compatibility tests use the existing engine stubs where defined; this is not a new production-flight claim.

No baseline full frontend/core/engine/Chromium suite was repeated. Baseline evidence at unchanged `1745adb` remains in `/workspace/astraea-plan/evidence/bootstrap/`; it is not new evidence for this patch. No native installed-app acceptance, Firefox/WebKit run, baseline/variant production-WASM replay, or external team-led session was performed by this task. Existing Chromium evidence covers cancellation/repeatability/import refusal/ZIP checks at its named baseline; it does not close newly found defects.

## Recommended next decision

Integrate the reviewed motor, boundary and I/O fixes. Next bounded investigations: separately saved baseline/variant production-WASM replay; and the supported geometry/mass/CG refusal matrix. Native and actual team-led acceptance remain external gates. No push, deployment, outreach, publication, canonical plan/status edit or release-readiness claim occurred.
