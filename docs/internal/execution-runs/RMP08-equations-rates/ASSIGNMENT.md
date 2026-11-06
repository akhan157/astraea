# RMP08 equations/rates/geometry/limits lane — assignment

Status: author work in progress on an isolated branch. Coordinator owns
independent review, integration and acceptance promotion. REVIEW.md stays
pending until that independent review exists.

## Identity and base

- Packet: RMP08-C02, RMP08-C05, RMP08-C06 and bounded RMP08-C07 disposition.
- Branch/worktree: `rmp08-c02-c05-c06-equations` /
  `/home/ak/.paseo/worktrees/3s8t98rp/rmp08-c02-c05-c06-equations`.
- Base SHA at dispatch: `82c595d`.
- Author routing: OMP / OpenRouter `deepseek/deepseek-v4.1-flash-1017`, high
  effort, as explicitly requested by the owner. No subagents or external
  reviewer (serial host policy).
- One owner, one worktree. Shared `flight_provider.rs` integrates sequentially;
  no concurrent editor in this session.

## Scope

Source-informed computational and equation verification only. No physics
retuning, no new fitted coefficient, no model/default/DTO/WASM/release change.

1. **C02 equation verification.** Independently source-map units, signs,
   symbols, reference S/L, midchord versus leading-edge fin sweep, body C/J
   intervals, fin station/slope/interference, exact wind transform and
   pure-couple/cancellation preservation. Reuse existing invariants; add only
   missing independent analytic/boundary tests, not formula echoes. Record
   independent derivations in `EQUATION-VERIFICATION.md`.
2. **C05 rates.** Document body rate order `omega=(pitch,roll,yaw)`, velocity
   evaluated at CG, reduced rates `omega*Lref/(2V)`, static-subtracted rate
   increment at the same flow, and the inherited dimensional rate couple versus
   source-normalised derivatives. Verify the reduced-rate normalization and the
   composition identity `aero moment = static CG moment + rate couple` through
   the actual evaluator. Do not duplicate the existing signed-couple and
   off-axis-datum tests.
3. **C06 geometry refusal.** Exercise the actual `FrontendVehicle` adapter so
   that unsupported/multiple fins, unknown profiles/attachments and
   non-converged quadrature reject without changing the input vehicle
   (serialization before/after) and localize the failing component. No invented
   feature support.
4. **C07 limits.** Record per-check disposition with bounded computational
   scope and open empirical/source/geometry/regime requirements. No global PASS.

## Source lease

- `crates/astraea-core/src/aero_coefficients.rs` — tests only.
- `crates/astraea-core/src/aero_profiles.rs` — read-only unless a genuinely
  missing invariant requires a test.
- `crates/astraea-core/src/flight_provider.rs` — rate tests/documentation only.
- `crates/astraea-engine/src/sb1_geometry.rs` — tests only.
- `crates/astraea-engine/src/supplied_aero.rs` — tests/documentation only.
- New run records under
  `docs/internal/execution-runs/RMP08-equations-rates/`.

Not touched: `six_dof.rs` (RMP09 lease), other branches/worktrees,
`CHANGELOG.md`, `TASKS.md`, `acceptance-register.json`, `manifest.json`,
protected outcomes, coordinator/frozen records.

## Out of scope

- Production model changes, new damping/cant/transonic laws, default provider
  activation, acceptance promotion, pushes, merges, releases, spending or
  external contact.
- Rebuilding WASM, resealing `target-rmp01`, `pnpm test/build`, holdout scoring,
  RMP12 study reruns.
- Claiming empirical qualification from computational checks.

## Verification plan

- `PATH=$HOME/.cargo/bin:$PATH`,
  `CARGO_TARGET_DIR=/home/ak/.paseo/worktrees/3s8t98rp/target-rmp08`,
  `cargo test --offline -j2 --manifest-path crates/astraea-core/Cargo.toml <filters> -- --test-threads=2`.
- Focused engine tests for `sb1_geometry` and `supplied_aero` modules, same
  target and job cap.
- Throwaway native example smoke exercising the actual evaluator/adapter
  outside the test harness; delete the scaffold afterwards.
- `free -h` before heavy work; do not start below 2 GiB available.
- Raw logs in
  `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-equations-rates/`.

## Success and handoff

Focused tests and native smoke pass without weakening an existing assertion;
new tests assert consumer-visible invariants or boundaries, not source text,
wording, defaults or copies. RESULT.md/EVIDENCE.json carry exact commands,
hashes and limits. REVIEW.md remains explicitly pending author-independent
scientific review; no acceptance-register status is promoted.
