# RMP10-C06 — qualified output archive, trace and Saved Runs consistency

## Bounded result

Accepted for bounded software consistency after author-independent coordinator
review and built-browser verification (see final REVIEW.md). This is a consumer
increment inside RMP10-C06, not an acceptance promotion. It closes the findings the
prior RMP10-C06 review escalated (F1 native off-nominal flag dropped; F2 saved
summaries lacked the canonical outputs/qualification; F3 saved deltas ignored
the live presentation policy).

- **Owner/model/effort:** Pi coding agent, `openrouter/deepseek/deepseek-v4.1-flash-1017`, high. No subagents or author-run reviewers.
- **Base:** `80296584103f247614120235e3fc4c3ee08203fb`.
- **Branch/worktree:** `rmp10-qualified-output-archive`, `/home/ak/.paseo/worktrees/3s8t98rp/rmp10-qualified-output-archive`.
- **Resulting source commit:** one local commit containing this record; its self-hash cannot be embedded and is supplied in the coordinator handoff.
- **Dirty/protected state:** no acceptance register, packet index, manifest, TASKS/GOAL-HANDOFF, coordination file, other worktree, Rust/aero/physics/default/engine/worker change.

## Behavior by file

1. `src/console/data/contract.ts` — `RunSummary.offNominalExcursion: boolean` is a required native-backed field (native `off_nominal = saw_unsupported || saw_extrapolated`); it is retained separately from `validity` so the readout/export can explain an `UNKNOWN` result.
2. `src/console/data/adapter.ts` — `toFlightRun` copies `res.offNominalExcursion` unchanged. Validity, envelope and all physics are untouched.
3. `src/console/stages/Build.tsx` — the trace's `simulation` block exports `offNominalExcursion` beside `validity`/`enveloped`. Dictionary revision is now `RMP10-C06/2`.
4. `src/console/data/recoveryResults.ts` — new `savedFlightOutputs(run)` projects the existing `flightOutputDictionary` (no second formula) plus `{dictionaryRevision, flags, sampledMaxQ?}`. `flags` = `validity`, `enveloped`, `offNominalExcursion`, `landingNominal`, optional `terminationReason`.
5. `src/application/savedFlightOutputs.ts` — canonical id/label/unit metadata, `SavedFlightOutputs` types and `parseSavedFlightOutputs`. Strict: exact top-level/flags/peak keys, known output ids, exact entry keys, each id's canonical producer unit from `SAVED_FLIGHT_OUTPUT_UNITS`, finite `available` value or `null` + non-empty `unavailableReason` (never both), qualification/validity enums, nonnegative counters with `validSampleCount <= sampleCount` and `sampleCount <= MAX_SAVED_TELEMETRY_POINTS` (5000), non-empty `dictionaryRevision` preserved verbatim, and landing/descent availability consistent with archived timeout/non-nominal flags. Unknown ids/fields, contradictions and schema injection are refused; historical revision strings remain readable.
   `src/application/flightLanding.ts` now owns the single `landingAvailability` rule used by readouts, the parser and Saved Runs.
6. `src/application/runCases.ts` — new flight cases archive `flightOutputs`; the flat summary also gains `offNominalExcursion`. Existing inputs/events/telemetry/moment-history behavior is unchanged (telemetry still only for source-bound records).
7. `src/formats/projectJson.ts` — `SimCase.flightOutputs?`, schema `1.10.0 -> 1.11.0`, identity-only migration. Telemetry stays legal for 1.10.0 and 1.11.0; events for 1.9.0+; `flightOutputs` only for 1.11.0, so older-version injection fails closed. Case validation runs the strict parser and refuses `flightOutputs` on ensembles.
8. `src/console/stages/SavedRuns.tsx` — when both selected records are flights carrying `flightOutputs`, the comparison table uses canonical ids (including `maxQ`, `burnoutAltitude`, `weathercockAngleDeg`), `units.ts::show` through `ResultValue`, and the existing `DeltaChip` (unit conversion + small-delta suppression). Unavailable/null shows `N/A — reason` on both cells and withholds the delta; an available `0` stays `0`. Landing/descent rows re-apply the archived flags at render time, so an in-memory archive advertising an available landing under timeout/non-nominal flags still shows `N/A — reason`. A delta is withheld (`—`) when the two stored units disagree or either differs from the shared canonical unit; no value is converted or rewritten. Flight/ensemble mixes never show deltas. Each canonical record also shows revision, flags and sampled-peak context read-only. If either record lacks the dictionary, the legacy stored-unit table remains with an explicit historical/unqualified note; nothing is upgraded or backfilled. Empty retained telemetry keeps its own disclosure.
9. `docs/internal/output-dictionary.md` revision `RMP10-C06/2` documents the saved archive contract and marks F1–F3 resolved; `CHANGELOG.md` has one user-facing entry.

## Red-before-fix evidence

A throwaway probe was run in a scratch worktree pinned to the base commit (removed
afterward), `red-before-fix-base.log`:

1. `toFlightRun(flightResult({ offNominalExcursion: true }))` had
   `summary.offNominalExcursion === undefined` — the native flag was dropped.
2. `withRunCases(...)` then `readProject(writeProject(...))` produced a case with
   no `flightOutputs`; `maxQ` and `burnoutAltitude` were absent from the summary
   — no per-output qualification or canonical dictionary existed.

Both probe expectations failed for those exact reasons (2 failed / 2). The prior
Saved Runs test asserted the stored-unit `29.0000` delta; the new canonical test
requires the live `+29 m` presentation, so F3's behavior change is visible in the
diff rather than only in prose.

## Parser/compatibility choices

- New field is optional and version-gated; pre-1.11 documents migrate byte-identically apart from `schemaVersion` and never gain reconstructed outputs/flags.
- `dictionaryRevision` is preserved, not rewritten or required to equal the current constant, so an archived record keeps the contract it was written under.
- Availability is self-consistent (`available` ⇔ finite value; unavailable ⇒ null + reason). This is a shape/integrity check, not physical validation.
- The flat `summary` stays for older consumers; it is not the source of truth for new archives.
- `RunSummary.offNominalExcursion` became required for live runs; historical saved cases remain summary-only and show no flag.

## Verification (actual commands)

- Correction-pass focused: same command set → **10 files / 217 tests pass** (`focused-rework.log`).
- Correction-pass broader affected: `src/console src/application src/formats src/state/projectIo.test.ts src/state/projectBoundary.test.ts --maxWorkers=2` → **62 files / 776 tests pass** (`affected-rework.log`).
- `node node_modules/typescript/bin/tsc --noEmit` → exit 0, empty log (`tsc-rework.log`).
- `node node_modules/vite/bin/vite.js build` → exit 0, 3115 modules (`vite-build-rework.log`). Production WASM was copied unpublished from the sealed target and is unchanged: source/dist SHA-256 `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b` (`wasm-sha256.log`). No Rust build or native validation claim.

## Coordinator rework (correction commit)

The first commit (`0585080`) was reviewed REQUEST_CHANGES. A scratch probe at that
commit (`red-before-rework.log`) failed all four new behaviors: a non-canonical
`ft` unit was accepted, an available canonical landing was accepted under
timeout flags, the comparison produced a delta between unlike stored units, and
Saved Runs presented the advertised landing. The correction commit:

- enforces `SAVED_FLIGHT_OUTPUT_UNITS` in the parser and uses the same table in Saved Runs;
- moves `landingAvailability` to `src/application/flightLanding.ts` and enforces it in the parser and at the Saved Runs render boundary;
- withholds deltas (`—`) for unlike/non-canonical in-memory units without converting values;
- bounds `sampledMaxQ.sampleCount` by the existing 5000-sample telemetry cap;
- adds failing-before/passing-after behavior tests for unit mismatch, timeout/non-nominal availability (including zero) and generated-dictionary validity.

Original logs (`focused-final.log`, `affected-vitest-final.log`, `vite-build.log`,
`red-before-fix-base.log`) are retained. LSP reported no configured language
server in this worktree, contrary to the coordinator note; the availability move
was traced by exhaustive search instead.

## Remaining scope / browser acceptance

- Author executed no built-browser journey; jsdom/Vite are software evidence only. Coordinator-owned browser acceptance can use: build and serve the current `dist`; run a flight; open Build → Saved Runs and select two saved flights (canonical table, unit switch, deltas); export/save the project and reopen it (schema 1.11.0, same table); open a pre-1.11 project (`src/formats/__fixtures__/project-main-1.0.0.json` or any 1.10 document) and confirm the historical/unqualified table and absent flags; inspect the Build trace for `simulation.offNominalExcursion`. A non-nominal/timeout run must show `N/A — …` for landing and descent outputs; an available zero must render `0`.
- RMP10-C03 peak evidence, complete C04 qualification, measurements/physical qualification, RMP12 budgets and applicable competition rules remain open. No acceptance status was changed; `REVIEW.md` stays pending.

## Browser archive-budget correction (correction 2)

Coordinator browser acceptance exposed a real save→open break: two normal
full-telemetry runs produced a 9,584,081-byte project file, and Save wrote it
happily while Open refused it at the single global 8 MiB import gate. The
supplied bytes were measured and parsed byte-exactly (`real-file-probe.json`:
9,584,081 bytes, 2 cases, exact save-open-save round trip), so the gate — not
the data or schema — was the blocker.

Approved policy and clean cutover:

- `src/io/files.ts` now has two explicit software resource budgets:
  `MAX_PROJECT_ARCHIVE_BYTES = 64 MiB` for native project JSON, and
  `MAX_FOREIGN_IMPORT_BYTES = 8 MiB` for `.ork`/`.rkt`/`.eng`/`.rse`.
  `MAX_IMPORT_BYTES` was removed, not aliased.
- `describeImport` picks the budget by kind; native over-limit is refused on
  actual `File.size` before any read. `projectArchiveBudget(text)` measures the
  serialized UTF-8 bytes before any write and is used by `saveProjectToFile`,
  Build's project export (before `saveExport`/ZIP), `exportVehicleFile('json')`
  and `readDroppedProject`.
- Refusals write/read nothing, keep the current design open, name the limit and
  size cause, and state that the browser slot is a separate quota-bound option,
  not a guaranteed backup. No compression, schema trick, sample trimming or
  foreign-limit change; serialization (including signed zero) and stale-write
  semantics are untouched.
- Browser-slot saving is unchanged: it is IndexedDB-backed (compact JSON) and
  quota-bound, not a file archive.

Evidence: `red-real-file-8mb-gate.log` / `real-file-probe.json` show the supplied
9.58 MB file parsed and round-tripped exactly but refused by the old gate;
`green-real-file-64mb-gate.log` shows the same actual bytes pass the native gate
and import as 2 cases. Committed tests use a generated valid project equivalent:
`projectIo.test.ts` imports a >8 MiB (<64 MiB) project and refuses an over-limit
save with no picker/download call and unchanged state; `buildExport.test.tsx`
refuses over-limit project export before any write; `io.test.ts` pins the
8 MiB foreign / 64 MiB native boundaries and UTF-8 byte measurement.

Final checks: `final-budget-vitest.log` **65 files / 819 tests pass**
(`--maxWorkers=1`, memory-safe for the size-heavy cases), `tsc-budget.log` exit
0, `vite-build-budget.log` exit 0 (3115 modules). WASM unchanged
`b32e7b7c…5b3b`; no Rust rebuild. Browser acceptance remains parent-owned.

## Coordinator verification

Source `f082b675d09753e3e0926898fc1381e97d42650d` accepted after review.
Built Chromium under production CSP: real 9,584,081-byte two-flight project
save/open/save byte-exact; canonical imperial units/deltas; synthetic
zero/timeout/non-nominal consumers; 1.10 historical summary with no invented
flags. Actual three-flight export ZIP contains a 14,374,307-byte project whose
outputs/off-nominal flag/input key agree with its trace. No browser runtime
errors, no import/view/save reruns; runtimes stopped. Evidence and limits are
recorded in final REVIEW.md and EVIDENCE.json. RMP10-C06 remains in progress.
