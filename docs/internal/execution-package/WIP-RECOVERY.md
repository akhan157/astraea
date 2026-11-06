# Recover the interrupted candidate work safely

## What exists

Remote branch `engineering/candidate-flight-20261026` at
ccc6c983e08873ec47d1585a3946cb856cea8949 is based on roadmap d583f56.
It changes only `crates/astraea-core/src/lib.rs` and `six_dof.rs`, plus its root
WIP note. Its declared `flight_provider` module was never written. No build/test/
scientific acceptance exists for these fragments. The accepted branch still
builds without them. The source-only [patch](wip/candidate-flight.patch) is included
so inspection does not require fetching that separate branch.

## Mandatory recovery sequence (execute only after new-session continuation)

1. Record completed branch current HEAD and dirty state. Do not check out the WIP
   over a user's edited tree or use reset/clean. Read RMP01 and INTERFACES first.
2. Inspect the packaged patch and optional remote branch diff. Confirm its old
   source context against the completed code; only the design intent is accepted.
3. Create an isolated worktree/branch from the completed current head. Record its
   exact SHA in the assignment. Suggested name `engineering/candidate-flight-resume`;
   choose a new name/path if occupied. Do not overwrite an existing worktree.
4. Choose one recorded approach: (A) reuse carefully reviewed hunks and finish the
   missing module/result/driver implementation, or (B) implement cleanly from the
   accepted design while retaining this patch/branch for provenance. The coordinator
   may choose routinely; no owner reconfirmation is needed for reversible local work.
5. If reusing hunks, first `git apply --check` inside the isolated worktree, inspect
   ownership/diff, then apply only after the choice is recorded. A clean apply is
   not correctness evidence. Do not cherry-pick the incomplete commit into integration.
6. Follow RMP01's subcommits/checks/review. The WIP's uncompiled placeholders never
   inherit the old154/61 passing results. New model/source changes need fresh checks.

## Known engineering traps already resolved by design

- Old stability preparation and legacy drag-table production both depend on CP.
  Do not compute old loads then overwrite them, or just bypass one guard.
- Shared DriverLoads omits required legacy CP diagnostics. Candidate needs its
  own nullable diagnostic/sample/result types, not fabricated zero/NaN fields.
- Old driver evaluates `[previous_time,current_macro_time]`, then advances its
  macro counter. Substituting a shorter max_sim_time can leave the last state
  earlier than the reported final time. Define/test exact off-grid horizon and
  committed-state semantics before adding a candidate wrapper.
- Domain errors on rejected adaptive trials or event reconstructions still abort.
- Do not give the old SimulationResult PASS/landing fields to a bounded candidate
  prefix, or plot rejected stages as committed trajectory samples.

The updater lane has no WIP code. Its pending fixture proposal is in RMP04 and
SESSION-HANDOFF; it requires technical review before any actual build/apply.
