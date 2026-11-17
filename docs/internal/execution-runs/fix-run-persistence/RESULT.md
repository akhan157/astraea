> Moved 2026-11-14 from the repo-root `RESULT.md` (main @ `a57a7c8`, lines 292–405) during owner-approved tidy-up. Text unchanged.

## fix-run-persistence — partial author increment (2026-11-13)

- Base: `250c8f9f478591a9f981a10a2f96e7ad45829031`; overlay increment: `56b5fba` (author; not self-accepted).
- Altimetry imports now appear in the overlay while mounted. Pasting the same trimmed CSV again selects the existing entry. The overlay uses the same grid transformation for both paths. The added UI test failed on the base because the imported flight did not appear; it passed after the change.
- `free -h`: 5.2 GiB available before suite, 5.3 GiB before final typecheck. `npx tsc --noEmit` passed; `npx vitest run src/state src/application src/formats src/console --maxWorkers=2` passed (103 files, 1,095 tests). Focused overlay suite passed (19 tests). No browser suite run.
- **In progress, not accepted:** memory cap and forced-GC evidence, durable IndexedDB recovery and revision guard, recovery error notices, and archived-run reopen behavior remain unimplemented. Overlay logs are still component state and do not survive reload; the new import wiring does not address recovery. No restored-work note is proposed yet. Flight continues to require a rerun; no equivalence rule has been implemented. No schema changes, push, or self-acceptance.
- Next: implement and independently review the remaining three concerns and their failing-on-base tests, including the approved memory cap and stale-tab guard. Review the overlay increment before integration; exact-text duplicate detection does not identify semantically equivalent differently formatted CSVs.

## fix-run-persistence — memory-cap investigation (2026-11-13)

- **In progress; not accepted.** Base `ea1f3550fad8b3d457ed567cc1b4f69898aa932a`. No memory-cap implementation or regression/heap tests were completed. No source was changed. The cap, preservation of evicted-run operations, and bounded retained-object evidence remain to be implemented and independently reviewed.
- History consumers inspected: `withRunCases` in `src/application/runCases.ts`, via `exportableProject` in `src/state/project.ts`, feeds `SavedRuns` listing and comparisons, `loadSavedRun`, `serializeProject` and project save, `Build` export, and `ShareFlightCard`; `SimFlightOverlay` reads flight payloads directly from history; `terminalAnalysisSnapshot` stores history in project undo/redo contexts. `usePreviousRun` / `previousRun` in `src/console/store.ts` feed the live Flight results comparison. Any eviction must address these consumers and references held by snapshots, not only the current history array.
- Observation: the legacy resolve passes `previousRun()`, which reads the current payload's `previous`, rather than its `run`. From a fresh state that field begins null. This deserves a regression test before changing the comparison behavior; do not assume the chain described at Gate 1 is established on every normal run.
- `free -h` reported 5.7 GiB available before checks. `npx tsc --noEmit` passed on the unchanged base. The requested Vitest suite was started on the unchanged base; its result is recorded below. No browser, server, recovery work, push, or self-acceptance.
- Next: implement an archival representation retaining the exact project-save data while covering the overlay and undo snapshots; add failing-on-base consumer and structural-retention tests, then run the requested checks.
- Baseline Vitest result: `npx vitest run src/state src/application src/formats src/console --maxWorkers=2` passed 103 files / 1,095 tests; this does not establish memory-cap acceptance.

## fix-run-persistence — step 2 memory cap (2026-11-13; author, not self-accepted)

Base: `90a287804162c4ec4ab7c4aebfd53677efd55fe2`. Implementation: `9b774f072a0a2798e6485a54150a4dda225ffa44`. Memory only; ready for independent orchestrator review, not accepted. No IndexedDB/recovery work, physics changes, schema changes, push, merge, or register/board/handoff edits.

### Measurement before implementation

Built the pinned source with `npx vite build`, served it with `npx vite preview --port 5222 --strictPort --host 127.0.0.1`, and copied the supplied script and harness into `out/`, changing the origin to port 5222 and keeping evidence local to this lane. Extended the simulation loop to 30 runs. Chromium used the supplied headless SwiftShader launch, production assets/CSP, keyboard inputs, and two CDP `HeapProfiler.collectGarbage` calls per checkpoint. `node out/split.mjs` on the base produced:

| Forced-GC heap (decimal MB) | Start | 100 switches | 200 switches | 10 runs | 20 runs | 30 runs |
|---|---:|---:|---:|---:|---:|---:|
| Base | 16.6 | 21.5 | 21.9 | 57.9 | 92.6 | 127.2 |

Base growth from run 10 to 30: **69.3 MB**. Evidence: `out/heap-base.log`.

The first 30-run snapshot attempt failed with Node `RangeError: Invalid string length` when joining chunks. This produced no snapshot verdict. Retried four runs using streamed snapshot chunks: `LABEL=base4 node out/retainer-run.mjs`; snapshot `out/base4.heapsnapshot`. The first map-heavy analyzer was stopped; its output is not a verdict. The typed-array analyzer succeeded: `node --max-old-space-size=1800 out/retainers-lite.cjs out/base4.heapsnapshot`, output `out/paths-base.log`.

The four-run snapshot contains **5 full FlightRun objects and 25,000 telemetry points**. Four distinct runs have direct strong paths `Object.history → Array.[0..3] → Object.payload → Object.run → telemetry`; `series` and the other display data remain reachable through the same run. The fifth full run did not yield a history path within the bounded reverse search; its exact root is not claimed. This establishes history as the growing owner, rather than attributing the measured slope to worker transfer buffers. A `previous` chain was not established by this baseline: fresh runs have null `previous`. The implementation therefore preserves scalar comparison semantics and handles non-null previous records without retaining their telemetry. Undo snapshot ownership was established in source and regression tests, not claimed as the cause of this particular run-only browser slope.

### Implementation and preservation

- Analysis history retains at most the last **3 completed flight/ensemble full payloads plus 2 distinct selected runs**. Selection is wired to SavedRuns comparison and SimFlightOverlay. Latest-per-kind `records` and `completed` maps follow eviction too; an old ensemble cannot bypass the cap through those maps.
- Older history records have `payload: null` and a compressed copy of the **existing saved-case projection**: summaries, captured inputs, engine identity, canonical outputs, events, existing bounded telemetry, candidate archives, and dispersion snapshots as applicable. Uses `fflate` gzip in memory; no storage/recovery dependency. The existing report JSON writer preserves signed zero. No sample truncation, interpolation, thresholds, physics, saved-project schema, or historical identity changes.
- `withRunCases` merges compact archives and preserves motor aliases/collisions and legacy project-owned imported motor references. `exportableProject` and serialization continue to supply saved cases to consumers. Overlay decodes the selected archived telemetry; summary/validity metadata does not require decoding all old runs.
- `previous` is now a scalar projection (`summary`, `rev`, optional `terminationReason`), preserving live delta and landing-availability behavior without a reference to a full FlightRun. Null stays null on a fresh run.
- `terminalAnalysisSnapshot` contains compact records only. Weak maps/WeakRef may reconnect an original still-live record during undo; snapshots never strongly own it. After collection, inputs and saved telemetry remain historical, while Flight requires an explicit rerun. Saved data alone is never promoted into a fresh current result. Restore re-applies the cap.
- Opaque/malformed historical payloads cannot prevent taking a project-boundary snapshot. Their original export refusal is recorded and rethrown on save; invalid data is not repaired or silently made exportable.

`pnpm add fflate@0.8.3 --ignore-scripts` failed because the lane's node_modules is a symlink (`out/dependency.log`). Declared the direct dependency and its existing 0.8.3 lock entry explicitly; the installed package resolved successfully in TypeScript, Vitest, and the production build. node_modules was not staged.

### Regression evidence and checks

- `out/tests-base.log`: the initial seven structural/consumer retention assertions failed on the pinned base (including 30 full payloads versus the required three, and strong payloads in snapshots).
- For actual UI/export consumers, an archived source copy of the exact pin was used under `out/basecheck`. The first attempt lacked the gitignored WASM and produced import failures, not behavioral verdicts. After supplying the same existing WASM, `npx vitest run --root out/basecheck src/state/runRetention.test.ts src/console/stages/SavedRuns.test.tsx src/console/evidence/SimFlightOverlay.test.tsx src/console/evidence/ShareFlightCard.test.tsx src/console/stages/buildExport.test.tsx --maxWorkers=2 -t 'evicted|keeps the session motor|writes a zip'` produced **7 assertion failures**, all at the required eviction boundary (`out/consumers-base-valid.log`). These exercise project projection, serialization, saved-input load, SavedRuns listing/comparison, overlay selection, Build project export, and the ShareFlightCard ZIP project.
- Intermediate checks exposed signed-zero loss, legacy imported-motor omission, lost previous-run scalar comparisons, and opaque-payload snapshot failures. They were corrected without relaxing existing assertions. Failed logs remain in `out/`. One intermediate regression invocation also discovered tests in the temporary baseline copy; that mixed result is not a lane verdict. Baseline test filenames now have a `.baseline` suffix and are excluded from normal discovery.
- Final structural coverage includes 30-run retention, two selected payloads and release, latest-per-kind eviction, previous scalar-only retention, snapshot structure, deterministic collected-WeakRef restoration, preservation of export refusal, and exact evicted saved-case data. Consumer tests use the actual component/export paths; no existing assertions were removed.
- Final `npx tsc --noEmit`: passed (`out/tsc-final.log`).
- Final `npx vitest run src/state src/application src/formats src/console --maxWorkers=2`: **104 files / 1,107 tests passed**, 81.72 s (`out/suite-final.log`).
- Final `npx vite build`: passed, 2.27 s (`out/build-final.log`). `git diff --check` passed before commit.

### Forced-GC falsifier on the fix

An initial fixed build reran the full stage-switch script: **16.9 → 21.9 → 27.2 MB** for start/100/200 switches, then **33.8 / 34.0 / 34.1 MB** for 10/20/30 runs: **0.3 MB growth after run 10** (`out/heap-fix.log`). A streamed snapshot was also captured after entering Build (`out/fix.heapsnapshot`); it was not parsed for a new retainer verdict.

After the comparison, latest-map, and opaque-snapshot fixes, rebuilt the exact implementation source and ran `node out/final-split.mjs` against port 5222. This is the same forced-GC and 30-run keyboard loop, omitting the already-measured stage-switch prelude and the large snapshot capture. Final browser process exited 0 and closed normally.

| Final production build (decimal MB) | Start | 10 runs | 20 runs | 30 runs |
|---|---:|---:|---:|---:|
| JS heap | **16.9** | **30.5** | **30.8** | **31.0** |
| CDP backing storage | 3.894 | 6.402 | 9.667 | 12.933 |

Exact JS growth run 10 → 30: **465,388 bytes (0.465 MB)**, versus 69.3 MB on the base. Backing storage grows **6.531 MB** over those 20 runs (about **327 KB/run**). Historical saved telemetry is deliberately retained, so this is a bound on full live payload graphs, not a claim of constant total archive memory. Saving/exporting or displaying saved telemetry can transiently materialize the archived samples. No history deletion/count cap was introduced.

Evidence: `out/heap-final.log`, `out/heap-final.json`, `out/final-split.mjs`, `out/harness.mjs`. Both base and final browser probes reported `buildRunRows: 193` after 30 runs. Artifact sizes/hashes and the implementation pin are in `out/memory-evidence.json` (SHA-256 `1e70d6de07913bc4d4eac7dec393946124d7ae42525a3b736a7abcac95e8981e`). Build asset manifest: `out/build-final-manifest.json`, SHA-256 `8777f258cd179d6125a1142beeb3544b8206646b5e0ed0e29f055ea80d813ebc`. Existing source WASM SHA-256: `0618bdf03f1da176e00b58b001d792395e12be5eb1951f28c31c99da0975626c`; it was not modified or committed.

### Disposition and cleanup

Memory implementation and evidence delivered for orchestrator review; **not self-accepted**. Step 3 IndexedDB recovery remains untouched. No wider browser suite was run. No raw evidence, out/, dist/, node_modules, WASM, ASSIGNMENT.md, or GATE1.md was staged. Existing ASSIGNMENT.md changes and untracked GATE1.md were left intact.

`free -h` was checked before build/test/browser work; reported available memory stayed above the 2 GiB stop threshold (snapshot peak observed about 2.1 GiB). Every Vitest invocation used `--maxWorkers=2`. All harness browsers closed, the tool-created preview tab closed, and the lane preview listener on port 5222 was stopped and verified absent with `ss -ltnp 'sport = :5222'`. No other host runtimes were stopped.

## fix-run-persistence — step 3 working-session auto-restore (2026-11-13; author, not self-accepted)

Base: `12d4d53eb642027deb57a603e3284e7bb8076074`. Recovery implementation: `af43d61e21ccd9132ad742227eb8f358e58fa97c`. Steps 1 and 2 remain intact. This is an author delivery for independent review, not acceptance; step 4 reopen labelling remains outside this increment.

### Recovery contract

- Independent version-1 IndexedDB record at `astraea.working-session.v1`, in the existing database's projects object store. No localStorage fallback. `src/formats/projectStorage.ts`, the explicit project slot, its revision handle, and the project-file schema are unchanged.
- Recovery captures `exportableProject()` / `withRunCases`: step 2 compact archives and the same bounded saved-case projection used by explicit save, including captured inputs, engine identity, outputs, events and saved telemetry. It never serializes live analysis records, previous-run graphs, undo stacks or full simulation payloads. Imported altimetry retains source text, exact bytes, units and provenance; overlay flights are now a project-scoped store instead of mounted component state.
- Hard limit: **32 MiB of UTF-8 JSON per record**, including metadata, project and imported logs. Reads and writes enforce it; work is never truncated to fit. IndexedDB's physical allocation/encoding overhead is implementation-dependent. The six-case `largeProject(6)` fixture exceeds 13,000,000 serialized project bytes and round-trips intact below the recovery limit. Oversize writes leave the previous record untouched and the full work in memory, with a notice.
- Writes debounce for 500 ms and execute in a serialized promise chain. Page hide triggers a best-effort flush. A crash can lose the pending debounce window; async page-hide writes are not a guaranteed crash barrier.
- Each record has an independent increasing revision. Atomic read/check/write compares the entire observed record in one IndexedDB readwrite transaction; a stale tab never refreshes its base silently. Once rejected, that tab pauses automatic recovery writes, preserving its in-memory work and the newer tab's record.
- Startup reads and validates before mounting the interactive UI. Invalid JSON, unknown versions, invalid projects or malformed evidence are ignored with a session notice. The explicit save is never deleted or changed. Quota/write failure keeps all in-memory state, notifies once per failure class per startup, and retries on the next change.
- Open/new/preset/other project replacement increments `projectEpoch`, clearing the imported-log and overlay stores. The altimetry card remounts for that epoch. Pending file reads, provenance hashes and ledger imports check the epoch before attaching data; they cannot attach old evidence to the new project. Switching replaces the working record through the same guarded writer.
- Restored cases remain project-owned archives, shown by Build's existing `Inputs archived` treatment and recorded identity. Recovery creates no current/completed analysis result. Flight still requires a rerun; no new equivalence rule is introduced here.
- Exact success note: **`Restored unsaved work from HH:mm`**, using local 24-hour time. A single muted 11 px, dismissible kit-colour strip renders in `App.tsx`, below `ImportReportBanner` and above `Workstation`. Errors reuse that one strip and enter the existing session notices/history. No dialogs or new project controls.

### Regression evidence

- `fake-indexeddb` was already installed in node_modules and used by the existing project-storage tests. No dependencies or lockfiles were changed.
- `src/state/workingSession.test.tsx`: IndexedDB reload of runs + ledger + exact altimetry bytes + overlay, archived Build display and empty current Flight result, atomic concurrent stale-tab rejection, stale running-tab pause, corrupt/unknown records, explicit-slot isolation, quota preservation/one notice/retry, project switch isolation, pending-import isolation, 13 MB fixture round-trip/oversize refusal, and debounced serialized writes including a change during an in-flight write.
- `src/state/workingSessionReload.test.tsx` uses the actual overlay ingest/UI and ledger path. On the exact base archived into `out/recovery-base`, optional startup discovery finds no recovery implementation; the reload assertion executes and **fails because the ledger has zero entries instead of one**. Command: `npx vitest run --root out/recovery-base src/state/workingSessionReload.test.tsx --maxWorkers=2`; log `out/recovery-base.log`. This is a behavioral assertion failure, not a missing-module/import failure. The same assertion passes on the implementation. The new storage-interface tests require the added module; individual stale/quota/validation assertions were not separately executed on the pre-feature base.
- Final recovery tests: `npx vitest run src/state/workingSession.test.tsx src/state/workingSessionReload.test.tsx --maxWorkers=2`: **2 files / 12 tests passed**, `out/recovery-last-unit.log`.
- Recovery plus existing overlay: **3 files / 32 tests passed**, `out/recovery-final-focused.log` (the command also named nonexistent loadedLog/altimetry test paths; those added no tests). Existing ShareFlightCard rerun: **1 file / 3 tests passed**, `out/recovery-share.log`.
- `npx tsc --noEmit`: passed, `out/recovery-tsc.log`. Initial typecheck found three unused test bindings; fixed before these final checks.
- `npx vite build`: passed, `out/recovery-build.log`. This build preceded only the final validator guards (array rejection for unit overrides and safe revision increment), which are covered by the final typecheck/unit run. No built browser/desktop verification is claimed; that remains independent orchestrator review.
- First requested full command `npx vitest run src --maxWorkers=2`: **168 files passed / 1 failed; 1,948 tests passed / 1 failed**, 508.81 s, `out/recovery-suite.log`. Failure: `ShareFlightCard.test.tsx:52` waited for the first imported file's `Source file` span, which did not appear before the existing wait expired. The standalone unchanged ShareFlightCard assertions subsequently passed (3/3). [INFERENCE] Runtime contention may have contributed; no claim that the full run passed or that its cause was proven. Final full rerun is recorded below separately; assertions and timeouts were not relaxed.
- Final full rerun on implementation `af43d61e21ccd9132ad742227eb8f358e58fa97c`: `npx vitest run src --maxWorkers=2` — **170 files / 1,950 tests passed**, 353.22 s. Log: `out/recovery-suite-final.log`. The previous failure is retained above and in its original log; no assertion or timeout was changed to obtain this result.
- Command/log hashes, byte sizes, source pin and bounded-check outcomes: `out/recovery-evidence.json` (outside the committed source). These checks are author evidence, not independent acceptance.

### Disposition and cleanup

Step 3 implementation delivered for independent review; **not self-accepted**. Final typecheck and full `src` suite passed. No browser or desktop preview was run, and no temporary server/browser was started. No test processes from this work remain running. Memory was checked before builds and test runs and stayed above the 2 GiB stop threshold (initial 7.3 GiB; final 7.1 GiB available); every Vitest run used `--maxWorkers=2`.

No push, merge, release, dependency additions, engine/physics changes, project-file schema changes, explicit-slot guard changes, or step 4 reopen changes. Recovery intentionally excludes uncommitted studio drafts, undo/redo stacks and fresh current simulation results; it preserves the committed project and requested run/evidence/import archives. Raw logs, copied baseline source, dist/, out/, node_modules, WASM, ASSIGNMENT.md and GATE1.md were not staged. The pre-existing ASSIGNMENT.md modification and untracked GATE1.md/node_modules were left intact.

Next: orchestrator independently reviews the recovery diff and verifies reload/relaunch and the muted note in the built surface, then decides acceptance. The 500 ms pending-write crash window, 32 MiB refusal behavior, and stale-tab pause are deliberate bounded behaviors described above.
