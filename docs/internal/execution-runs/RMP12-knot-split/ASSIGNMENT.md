# RMP12-knot-split — lease and assignment

- Packet: RMP12, owner-approved C1 (knot-aware step splitting) + C3
  (`EVENT_ROOT_WIDTH_S = 1e-7`, midpoint root). Authorized default
  integration-policy change, not a tolerance waiver.
- Worktree: `/home/ak/.paseo/worktrees/3s8t98rp/rmp12-knot-split`; branch
  `rmp12-knot-split`; base `c0140d4`.
- Author lane: OpenRouter `deepseek/deepseek-v4.1-flash-1017`, reasoning
  `max` (`PI_PROVIDER`/`PI_MODEL`/`PI_REASONING_LEVEL` in this session).
  No subagent, no reviewer, no subdelegation.
- Coordinator: parent `be115c77-6ca9-430f-ad6f-b89911a71dc4` on
  `srv_Cbc5BtNPqVpO`. Design submitted before edits; approved with the
  anti-stall guard, corrected expected numbers and the old-binary falsifier
  ruling (message `8819b9d9-839b-44d0-97c0-a1e4b17ce2c9`).
- Read first: `rmp12-knot-split-dispatch.md`,
  `docs/internal/execution-runs/RMP12-rail-timing/DIAGNOSIS.md`, packet
  `RMP12.md`, `RMP12-candidate-controls/RESULT.md`,
  `RMP12c-regime-expansion/RESULT.md`, CONTROL-LOOP, DECISIONS and the
  integrator/event-refinement source.

## Writable lease

- `crates/astraea-core/src/six_dof.rs`
- `crates/astraea-engine/src/candidate_identity.rs`
- `crates/astraea-engine/src/native_candidate.rs`
- engine tests and parity fixtures under `crates/astraea-engine/tests/`
- `src/dynamics/rigidBody.ts`, `src/dynamics/rigidBody.adaptive.test.ts`
- `src/sim/sixDofSimulator.ts`
- this run directory (`ASSIGNMENT.md`, `RESULT.md`, `EVIDENCE.json`,
  `run_rows.py`) and the external evidence directory
  `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp12-knot-split/`.

No register/manifest/TASKS/acceptance edits. No status promotion. No
self-acceptance. Old archives, old engine SHAs and old experiment records are
never rewritten. No physics/force/atmosphere/recovery/threshold changes; no
reserve/budget/sigma/seed change; schema 1.11.0, archive budgets, calibration
applicability and the classified ensemble contract stay intact.

## Approved design

1. Cut list: exact sorted-unique `MotorSpec.thrust_curve[i].time` plus
   `burn_time`; finite values only, `total_cmp`, bitwise dedup, burnout once.
   The validator already rejects unsorted/duplicate/non-finite/endpoint-bad
   curves; the helper remains independently normalized and tested. Only
   time-tabulated thrust breakpoints are cut; state-tabulated Mach/atmosphere/
   wind breakpoints are explicitly not covered and remain residual risk.
2. One choke point in `integrate_rigid_adaptive`: clip a proposed trial to the
   first knot strictly inside the window, so no accepted step or RK stage
   contains a knot strictly inside. The macro `t += dt` grid is unchanged.
   Absent diagnostics select the split default; explicit
   `splitAtThrustKnots:false` is the legacy no-split falsifier arm.
3. Anti-stall guard: a knot within
   `EPSILON * max(1, |t|, |t_end|)` of `t` is coincident (no split); a knot at
   exactly `t` is skipped; no zero/near-zero step. Unit-tested at `t`,
   `t+1e-18`, `t+1e-12` and an interior knot.
4. C3: `EVENT_ROOT_WIDTH_S = 1e-7`; `refine_crossing` reports the bracket
   midpoint and the state there, while simultaneous-tie checks use the
   separately returned crossed endpoint.
5. Identity: `inherited-candidate-driver-numerics/2.0.0`,
   `candidate-native-diagnostic-numerics/2.0.0`; envelope/descriptor include
   the applied split and `eventRootWidthS`. Old 1.0.0 records stay historical.
6. TS parity: optional sorted `cutKnots` in `rigidBody.ts` (default empty),
   the active stage's list from `sixDofSimulator.ts`, and the same 1e-7
   midpoint in `refineCrossing`. The engine 1e-9 oracle test must pass without
   relaxing any tolerance.

## Required checks (final, once)

- `free -h` before heavy work; `CARGO_BUILD_JOBS=2`; isolated
  `CARGO_TARGET_DIR=/home/ak/.paseo/worktrees/3s8t98rp/target-knot-split`
  outside the worktree.
- Rust: `cargo test --offline --manifest-path crates/astraea-core/Cargo.toml
  --lib --jobs 2`; `cargo test --offline --locked --manifest-path
  crates/astraea-engine/Cargo.toml --jobs 2`.
- Engine rebuild: `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2
  CARGO_TARGET_DIR=... node scripts/build-engine.mjs`; record target dir and
  new WASM SHA.
- TS: adaptive/simulator, engine parity + ensemble + classified ledger,
  Monte Carlo/pool, console/application; `--maxWorkers=2`.
- Diagnostics: A20/A10/A5/C20, the F20 split-off falsifier, and the recorded
  old profile binary on A20. One execution, no retries; raw outputs external.
- Record old/new WASM SHA, old/new profile binary SHA, old/new diagnostic
  numbers, every consumer whose identity moved, remaining risk, and the
  evidence that would show the split is incomplete.

## Stop conditions

Missing/changed artifacts, non-fresh output, a failing required check, or an
unresolved numerical/semantic issue stops the affected claim; do not relax a
test or overwrite a failed attempt. The RMP12-C02 packet status remains the
coordinator's decision; this lane reports evidence only.
