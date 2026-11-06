# RMP08/RMP09 remainder — assignment and file lease

- Packet/subpacket and acceptance IDs: RMP08-C01, RMP08-C03, RMP08-C04,
  RMP08-C08; RMP09-C02, RMP09-C03, RMP09-C04, RMP09-C05, RMP09-C07.
  Accepted neighbours RMP08-C02/C05/C06 (`39d944c`), RMP09-C01 (`a47bcb5`) and
  RMP09-C06/C08 (`cc79b11`) are not reopened.
- Exact current integration base SHA: `58945a4d3d1fe85ee03f45cca5f963f7afc90f10`.
- Owner/model/effort: OMP `openrouter/deepseek/deepseek-v4.1-flash-1017`, max
  effort, one serial author. No subagents, no reviewer session, no engine/WASM
  rebuild. `no Rust rebuild` in the dispatch means no `astraea-engine`/WASM
  rebuild; compiling/testing `astraea-core` in the isolated target below is
  authorised by the coordinator's 2026-10-28 approval.
- Isolated branch/worktree: `rmp08-rmp09-remainder`,
  `/home/ak/.paseo/worktrees/3s8t98rp/rmp08-rmp09-remainder`. Worktree was clean
  except the pre-existing untracked `rmp08-rmp09-dispatch.md`.
- Actual source/input/OS/tool availability: Linux `cachyos-x8664`; Cargo/rustc
  1.99.1 at `~/.cargo/bin` (not on default PATH); offline registry cache
  present; no `node_modules`, no pnpm run, no downloads. `free -h` before work:
  8.2 GiB available, swap 15 %. No sealed/protected outcome is read.
- Owned existing files and proposed CREATE paths:
  - Owned existing: `crates/astraea-core/src/six_dof.rs` **test module only**
    (`#[cfg(test)] mod tests`), additions only, new tests prefixed `recovery_`.
  - Created records: `docs/internal/execution-runs/RMP08-RMP09-remainder/`
    (`ASSIGNMENT.md`, `RESULT.md`, `EVIDENCE.json`,
    `RMP08-C04-REGIME-AUDIT.md`, `RMP09-C02-MOTOR-TIMEBASE.md`,
    `RMP09-C03-GUIDE-GAP.md`, `RMP09-C05-SECTION-ENERGY-GAP.md`).
- Shared-file leases/dependencies: none. Single owner in this worktree. No
  register, manifest, TASKS, schema, archive, physics, default, tolerance or
  accepted-evidence edits.
- Read-only/prohibited: all production Rust, `aero.rs`,
  `aero_coefficients.rs`, `flight_provider.rs`, engine/WASM sources,
  `src/propulsion/motorDatabase.ts`, engine fixtures and every accepted run
  record. The certified-vs-fixture motor discrepancy is recorded, never edited.
- Required reading (completed): `rmp08-rmp09-dispatch.md`; packets RMP08/RMP09;
  RMP08 equations/rates RESULT/REVIEW/EQUATION-VERIFICATION, RMP08 ARCAS
  RESULT/REVIEW, RMP09 domain/legacy RESULT/REVIEW/SOURCE-DOMAIN-LEDGER, RMP09
  mechanics RESULT/REVIEW; RMP02 result; CONTROL-LOOP, DECISIONS, CHECKS;
  accepted register dispositions; P0 contract, A1b eligibility, model-path,
  data-path-transonic.
- Ordered small commits and first useful increment:
  1. this assignment;
  2. the RMP09-C04 recovery-FSM test matrix (single material increment);
  3. RESULT/EVIDENCE plus the four check notes.
- Mechanism/expected result/evidence per acceptance ID:
  - RMP09-C04 (local executable): public `detect_events`/`EventState` FSM with
    declared synthetic configurations covering drogue→main ordering,
    main-at-apogee, delayed/low crossing, failed trigger forced at touchdown,
    seeded `is_main_deployed`, seeded `is_apogee_reached` and no pre-apogee
    main. Each guard mutation must fail its test.
  - RMP08-C04: docs-only contract/call-graph audit; no new test, no code.
  - RMP09-C02: docs-only motor/timebase/provenance record; no curve or fixture
    edit; “certified vs fixture” recorded as an identified provenance defect.
  - RMP09-C03/C05: docs-only gap statements.
  - RMP08-C01/C03/C08, RMP09-C07: external remainder with citations.
- Safe test command (only executable local item):
  `free -h`, then
  `CARGO_TARGET_DIR=/home/ak/.paseo/worktrees/3s8t98rp/target-rmp08-rmp09 cargo test --offline -j2 --manifest-path crates/astraea-core/Cargo.toml --lib recovery_ -- --test-threads=2`
  with `PATH="$HOME/.cargo/bin:$PATH"`. No scoring, browser, server or engine.
- Independent reviewer and exact question: coordinator. It must decide the
  bounded RMP09-C04 disposition (single-body only; trigger latency and
  independent/suspended sections not modelled) and whether the recorded
  external remainder is sufficient. No self-acceptance.
- Resource allocation: core crate only; `-j2`; isolated target outside the
  worktree; serial; stop any build immediately after the test run.
- Deliverable evidence directory/manifest: repository records above; raw logs
  in `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-rmp09-remainder/`
  (inventoried, not committed).
- Stop/rework/escalation: if a guard mutation cannot be reverted cleanly, stop
  before committing and report. If a test requires production/non-test edits,
  stop. No status promotion. Exact successor: coordinator review/integration.
- Authority: local reversible engineering only; no push, merge, tag, release,
  deployment, external contact, new outcome access or paid capacity.
