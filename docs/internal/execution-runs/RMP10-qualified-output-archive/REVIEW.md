# RMP10-C06 qualified output archive — independent review

Status: **ACCEPT for the bounded software consumer/archive increment**, after
author-independent coordinating GPT review and built-browser verification.
RMP10-C06 remains in progress; no physical or release qualification is promoted.

## Coordinator review request on `0585080` (verbatim scope)

> Coordinator review REQUEST_CHANGES on 0585080; one focused rework in same lane,
> no integration yet. I directly exercised your actual parser and retained
> evidence at evidence-rmp10-qualified-output-archive/coordinator-parser-before.json.
> (1) Changing outputs.apogee.unit to 'ft' is accepted though archive contract is
> canonical units; SavedRuns subtracts a.value and b.value then interprets BOTH in
> kindOf(b.unit), so same metric with conflicting stored units can show a false
> zero/incorrect delta. Enforce each known output's canonical unit based on
> actual producer (m,s,m/s,1,g,Pa,J,deg), preferably shared declarative metadata
> so parser/presentation cannot drift. Do not convert/rewrite historic raw values.
> Defensively withhold comparison for incompatible metric units/contract semantics
> if such data can reach UI. (2) flags.terminationReason='timeout' plus
> landingNominal=true and outputs.landingSpeed={value:5,unit:'m/s',confidence:'modeled',available:true}
> is accepted; canonical SavedRuns then presents valid landing because it trusts
> entry.available and no longer applies flags' shared landing availability. Refuse
> inconsistent canonical landingSpeed/landingEnergy/apogeeToTouchdown availability
> for timeout/non-nominal flags, or enforce the shared availability rule at
> consumer boundary too. Don't impose unsupported physical validity equivalences
> such as PASS <-> nominal; just current declared availability contract. Add real
> failing-before/passing-after behavior tests for unit mismatch and timeout/non-nominal
> canonical availability, including zero, and ensure generated snapshots remain
> valid. Do not merely repin wording or assert mock copies. Check other directly
> related parser invariants (peak metadata count bounds actual 5000 cap if
> applicable), report rather than grow scope. Resolve these two material findings,
> keep original source/logs and review request in REVIEW.md, update source/evidence
> and run final affected/type/build checks only after rework. Return one correction
> commit; no new subagent or acceptance promotion. LSP is working on this host.
> Coordinator owns final browser proof.

## Author response (correction commit)

1. `SAVED_FLIGHT_OUTPUT_UNITS` is shared declarative metadata in
   `src/application/savedFlightOutputs.ts`; the parser refuses any other unit and
   Saved Runs uses the same table for rendering and deltas. In-memory archives
   with unlike/non-canonical units show the recorded value with its stored unit
   and withhold the delta (`—`), never converting or rewriting it.
2. The availability rule moved to `src/application/flightLanding.ts` and is used
   by readouts, the parser and the Saved Runs boundary. The parser refuses an
   available `landingSpeed`/`landingEnergy`/`apogeeToTouchdown` under
   `terminationReason: 'timeout'` or `landingNominal: false`; Saved Runs also
   re-applies the archived flags at render time. No validity/nominal equivalence
   was introduced.
3. Failing-before probe at `0585080` (`red-before-rework.log`) failed all four
   new behaviors; the committed tests now pass. Generated dictionaries are checked
   against the unit metadata and parsed in `runCases.test.ts`.
4. Peak metadata `sampleCount` is now bounded by the existing
   `MAX_SAVED_TELEMETRY_POINTS` (5000) mirror used by saved telemetry; no other
   related invariant was found in scope.

## Author limitations

- LSP status on this worktree returned "No language servers configured for this
  project", contrary to the coordinator note; the `landingAvailability` move was
  traced with search across all references (`Build.tsx`, `Flight.tsx`,
  `Recovery.tsx`, `SavedRuns.tsx`, `recoveryResults.ts` and its test).
- jsdom/Vite only; no built-browser journey executed by the author.
- No acceptance-register status changed.

## Coordinator approval (archive resource policy)

The coordinator approved `64 MiB` native project archive / unchanged `8 MiB`
foreign import, exact UTF-8 byte budget shared by every native save/export/open
path, a clean cutover with no alias, and refusals that never promise browser-slot
success. The implementation follows that approval: `MAX_IMPORT_BYTES` removed,
`MAX_PROJECT_ARCHIVE_BYTES`/`MAX_FOREIGN_IMPORT_BYTES` + `projectArchiveBudget`
in `src/io/files.ts`; gates in `saveProjectToFile`, Build project export,
`exportVehicleFile('json')` and `readDroppedProject`; actual `File.size` checked
before reading and serialized text before any write.

Correction evidence: the supplied 9,584,081-byte file is refused by the old gate
(`real-file-probe.json`, `red-real-file-8mb-gate.log`) and imports after the
change (`green-real-file-64mb-gate.log`); over-limit save/export tests assert no
picker/download/ZIP write and unchanged state. Final 65 files / 819 tests,
typecheck and Vite pass. Browser proof and acceptance remain with the coordinator.

## Final coordinator review — ACCEPT

Reviewed source `f082b675d09753e3e0926898fc1381e97d42650d` and its
`0585080` / `e337a24` predecessors. Reviewer is the coordinating
`openai-codex/gpt-6.1-sol` session, independent of the DeepSeek author family.

- Directly exercised the corrected parser: noncanonical units, available
  timeout/non-nominal landing values and over-cap peak metadata are refused;
  nominal available zero survives. LSP returned 19 shared landing references.
- Independently found the actual producer-file size failure during browser
  acceptance. The approved 64 MiB native / 8 MiB foreign resource split now
  applies before native file reads and before native file writes/ZIP creation.
  No sample truncation or physical-model change was introduced.
- Final built Chromium under the built production CSP opened the exact
  9,584,081-byte, two-flight file and resaved it byte-for-byte. Unit conversions
  and deltas survived reopen. Explicitly manufactured zero/timeout/non-nominal
  fixtures distinguish available zero from unavailable landing/descent values.
  A 1.10 summary-only fixture remains historical, with no invented flags or run.
- Ran a fresh actual WASM flight, exported the real ZIP, and independently read
  it with Python's standard-library ZIP reader. Its 14,374,307-byte project has
  three saved flights; dictionary values, off-nominal flag and input key exactly
  agree with the trace. Two actual flight calls total in the final browser:
  mount plus explicit run, none from import/view/unit/save actions. No browser
  runtime errors. Browser and temporary preview were stopped.
- Author's final affected suite: 65 files / 819 tests, typecheck and Vite pass.
  Coordinator smoke is separate evidence, not a claimed rerun of that suite.

External proof: `evidence-rmp10-qualified-output-archive/`:
`coordinator-parser-after.json`, `browser-save-reopen-before.json`,
`browser-final.json`, `browser-final-zip-proof.json`, actual ZIP/project/trace,
canonical/unavailable screenshots and the final legacy/availability records.
Automation failures and fixture corrections are retained, including the Eval
Bun JSZip dependency failure; the actual ZIP was inspected using Python instead.

Accepts F1/F2/F3 correction and save/open resource consistency only. Continuous
peak resolution, guide/structural/measurement qualification, applicable rule
sources and wider provider scope remain open. No RMP10 acceptance PASS, default
activation, physics retuning, publication or release follows from this review.
