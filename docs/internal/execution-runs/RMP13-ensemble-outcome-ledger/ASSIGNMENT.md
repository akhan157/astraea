# Assignment / file and resource lease — RMP13-C05 / RMP13-C06 ensemble outcome ledger

- Packet/subpacket and acceptance IDs: RMP13-C05 (probability meaning:
  interval/footprint inclusion assessed with the outcome denominator) and
  RMP13-C06 (failure handling: unsupported/failed runs stay
  denominator/ledger-visible; cancellation never returns stale partial
  results). This lane closes the consumer/engine contract needed by both; it
  does not promote either acceptance ID to pass, does not claim empirical
  coverage, and does not change RMP13-C01/C02/C04/C07.
- Exact current integration base SHA (not historical default):
  `a68c03e95540fd6a3fb0e1a0384ec732accc75624`, branch
  `rmp13-ensemble-outcome-ledger`, worktree
  `/home/ak/.paseo/worktrees/3s8t98rp/rmp13-ensemble-outcome-ledger`. Clean at
  dispatch except the untracked dispatch note. Archive integration (`1edea79`)
  and calibration applicability integration (`d5bdffe`) are already in the
  base; no dependency is pending.
- Owner / model / effort / why appropriate: single worktree owner, OMP /
  OpenRouter DeepSeek V4.1 Flash 1017, high reasoning. No subdelegation or
  independent reviewer in this lane; the coordinator owns independent review,
  integration and acceptance. The coordinator explicitly requires the exact
  API/classification/denominator proposal before material shared edits.
- Isolated branch/worktree; existing user work preserved: only this worktree
  may be edited. Any dirty/untracked user work present at dispatch is preserved.
- Actual source/input/OS/tool availability and sealed-data boundary: source and
  tests are present; LSP is available; the supplied real-WASM probes are
  `../evidence-rmp13-ensemble-outcome-ledger/before.json` and `more-before.json`,
  with the browser-exported input under
  `../evidence-rmp10-qualified-output-archive/browser-project.astraea.json`.
  No protected outcomes, no new holdout, no measurements, no spending,
  outreach, publication or release. Prior shipped WASM
  `b32e7b7c0df33b70c51ea645612f74660648212b76a368ccfb5e852f69bc5b3b`
  is preserved as before evidence.
- Owned existing files and proposed CREATE paths:
  - `crates/astraea-core/src/monte_carlo.rs` (classification, per-index ledger,
    coverage-aware finalization).
  - `crates/astraea-engine/src/commands.rs`, `models.rs`, `lib.rs`
    (classified `fly` closure and wire DTOs; no new command unless required).
  - `src/sim/monteCarlo.ts`, `src/sim/monteCarloWorker.ts` (types, chunk
    classification, coverage/complete finalization).
  - `src/tauri/bridge.ts` (forward classified DTO; command names/payloads
    otherwise unchanged).
  - `src/console/data/adapter.ts`, `src/console/data/contract.ts`,
    `src/console/store.ts`, `src/console/stages/Flight.tsx`,
    `src/console/stages/SavedRuns.tsx` (progress, display, archive semantics).
  - `src/application/runCases.ts`, `src/application/runInputs.ts`,
    `src/application/workspace.ts` (saved classification/counts/policy; legacy
    absence stays legacy).
  - `src/formats/projectJson.ts` (strict optional validation; no retroactive
    rewrite).
  - Adjacent tests; rebuilt `src/engine/astraea_engine.wasm` (generated,
    ignored).
  - CREATE `docs/internal/execution-runs/RMP13-ensemble-outcome-ledger/`
    (`ASSIGNMENT.md`, later `RESULT.md`, `EVIDENCE.json`).
- Shared-file leases/dependencies and other active owners: single owner. Shared
  files (`monte_carlo.rs`, engine models/commands, `adapter.ts`,
  `projectJson.ts`, `runCases.ts`) integrate sequentially; no parallel owner.
  Coordinator retains register/manifest/packet-index/TASKS/handoff and
  review/integration/browser verification.
- Read-only/prohibited files and product/physical invariants: no physics,
  sigma, tolerance, seed, default or acceptance-budget change; no new
  statistical acceptance rule or coverage claim; no silent reinterpretation of
  legacy frozen ensembles; no measured/probability claim for scenario-only
  footprints; no fabricated validity for exceptions; no retroactive archive
  rewrite. Existing exact source identity, migration and archive budgets
  remain binding. Do not reset the old research engine pin in
  `scripts/diagnostics/accuracy-execution.mjs` blindly; record it as
  invalidated and leave it outside this lane unless the coordinator says
  otherwise.
- Required reading and accepted interface/source decisions: dispatch
  `ensemble-outcome-ledger-dispatch.md`; `CONTROL-LOOP.md`, `DECISIONS.md`;
  `packets/RMP13.md`; `RMP12-ensemble-determinism/ASSIGNMENT.md`;
  `RMP13-calibration-applicability/{ASSIGNMENT,RESULT,REVIEW}.md`;
  actual `monte_carlo.rs`, `commands.rs`, `models.rs`, `to_flight_dto`,
  `src/sim/monteCarlo.ts`, worker, bridge, adapter, `contract.ts`, `runCases.ts`,
  `projectJson.ts`, `SavedRuns.tsx`, `Flight.tsx`. Proposed contract sent to the
  coordinator before edits; confirmed by the coordinator: (a) strict
  eligible-only footprint denominator; (b) `classified-v1` policy token with
  optional fields and no schema migration; (c) separate classified whole entry
  point while preserving the legacy `run_ensemble` contract; (d) native
  validity/termination vocabulary carried unchanged.
- Ordered small commits; first useful end-to-end increment:
  1. Rust core classification + per-index chunk ledger + coverage finalizer
     (tests at core level).
  2. Engine DTO/commands classified cutover (whole-ensemble + chunk).
  3. TS sim/finalizer coverage + all-failure/timeout behavior.
  4. Bridge/adapter/store + UI counts/qualification + archive summary/snapshot
     guards.
  5. Rebuild WASM, real-runtime probe on the supplied inputs, focused tests.
- Mechanism/expected result/evidence for each acceptance ID:
  - RMP13-C05: every requested index carries a class; footprint denominator and
    eligible count are explicit; zero eligible landings produce no fabricated
    statistics; scenario-only labeling persists. Evidence: classified before/
    after probe on the same synthetic declared conditions plus nominal/
    unsupported/timeout/failure mixtures.
  - RMP13-C06: all five classes count in the ledger; missing/duplicate/
    overlapping chunk indices cannot be complete; cancellation/stale replies
    cannot commit an archive. Evidence: deterministic whole/chunked/reordered
    comparison and cancellation test on real engine path.
  - Both: UI/archive preservation and source-bound engine identity after
    rebuild.
- Safe test commands and required capabilities; no scoring by default:
  `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs`; focused `cargo test`
  targets with `-j 2`; `pnpm vitest run ... --maxWorkers=2`; `tsc --noEmit`;
  Vite-only build only if needed for the shipped-runtime smoke. Check `free -h`
  before heavy work; clean up servers/watchers; final affected checks once
  after implementation.
- Independent reviewer and exact physical/numerical question: none in-lane;
  coordinator review. Exact question for review: does the classification and
  denominator preserve every run without implying physical support or
  probability, and does completion reject missing/duplicate/partial chunks?
- Resource allocation/isolated targets; reassess current host: at most two
  compiler/test jobs; no concurrent subagents; serial work only. Host snapshot
  at dispatch: ~9.1 GiB available, swap ~15% used, pressure normal.
- Deliverable evidence directory/manifest and artifact availability:
  this run directory; `EVIDENCE.json` records base/commit/source/WASM hashes,
  commands, pass/fail/blocked dispositions, failed attempts, probe paths and
  limitations. Large/raw artifacts stay outside Git and are inventoried.
- Stop/rework/escalation boundaries; exact successor: stop at the coordinator's
  policy decision or an unexpected engine/contract conflict; one focused rework
  in this lane. Do not expand into RMP14 scoring, full benchmark, protected
  outcomes or release work. Successor: coordinator acceptance and integration;
  then RMP13-C05/C06 remain evidence-bounded until real uncertainty/coverage
  inputs exist.
- Authority: local reversible engineering only; no publication, spending,
  outreach, protected-outcome access, push/merge/tag/release, or acceptance
  promotion by the author.

## Coordinator steering after independent review of `4d7e377`

- Independent review found the approved support rule was incomplete at
  `crates/astraea-core/src/monte_carlo.rs:644-654` as reviewed in `4d7e377`:
  the `classify_observation` Supported branch omitted `off_nominal_excursion`,
  so a terminated, touchdown-nominal, validity-PASS, enveloped observation
  with an excursion could enter the qualified footprint. The coordinator
  required `!obs.off_nominal_excursion` in the Supported branch so that case
  falls to `UnsupportedNominalTouchdown`, exactly as the approved proposal
  stated.
- The coordinator required one focused manufactured-observation regression
  test for PASS/enveloped/nominal-touchdown/excursion-true and a valid-timeout
  sanity pairing; no WASM rebuild for this Rust-only classification/test
  rework; consumer-visible wording in the final source/test/evidence.
- This note is append-only after the earlier confirmed-decision record; the
  history above is preserved.
