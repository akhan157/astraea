# RMP01 / A1d-2 assignment, file and resource lease

Recorded before the first source edit, per [CONTROL-LOOP](../../execution-package/CONTROL-LOOP.md).

- **Packet/subpacket and acceptance IDs:** RMP01 (A1d-2 native candidate
  trajectory, load query and curves), acceptance `RMP01-C01`…`RMP01-C14`.
- **Exact current integration base SHA:** `c80e7d356fe0a777bd793c56815388960ea597c7`
  (`delivery/integration-20261024`, remote head equals local head at dispatch).
  Work branch/worktree: `execute-rmp01-package-c80e7d3` at
  `/home/ak/.paseo/worktrees/3s8t98rp/furry-fish` (clean at dispatch).
- **Owner / model / effort:** single coordinating author session (Sol-class
  reasoning model, high effort) for cross-file numerical code; the same session
  acts as coordinator for review/integration. Independent scientific review is
  requested separately after the author result (see below). No subdelegation
  beyond that review.
- **Isolated branch/worktree; existing user work preserved:** existing worktree
  above; other worktrees (`/home/ak/astraea` at `18e63f0`, development-bench,
  linux-beta-acceptance, estrella-casino, freeform-fins, release, val2) are
  untouched and were not switched/reset/cleaned. The interrupted candidate branch
  `engineering/candidate-flight-20261026` (`ccc6c98`) is untouched.
- **Actual source/input/OS/tool availability and sealed-data boundary:**
  Linux x86_64, 15 GiB RAM, Rust `1.99.1`/Cargo `1.99.1` via `~/.cargo/bin`
  (not on the default PATH), `node 26.11.1`, `pnpm 12.14.0`, `python3 3.14.8`.
  Offline registry cache contains exactly serde 1.0.229/serde_json 1.0.154 and
  dependencies; `cargo test --offline` for both crates builds. No Docker, no
  browser binary assumed or needed. No scoring/holdout command, dataset, telemetry
  generator or empirical benchmark is used.
- **Owned existing files and proposed CREATE paths:**
  - `crates/astraea-core/src/lib.rs` (module registration only),
  - `crates/astraea-core/src/six_dof.rs` (visibility of the A1d-1 seam, extraction
    of the mechanical/flow carrier, canopy-axial and inherited rate-couple
    expressions shared by the legacy assembly, candidate horizon/outcome bridge,
    focused tests),
  - `crates/astraea-core/src/flight_provider.rs` (CREATE: prepared object, static
    query, curve sampler, composition, bounded candidate result, tests),
  - `crates/astraea-engine/src/lib.rs` (module registration only),
  - `crates/astraea-engine/src/native_candidate.rs` (CREATE: DTO -> adapter +
    mechanical carrier + prescribed CA0 helper),
  - `crates/astraea-engine/examples/native_candidate_flight.rs` (CREATE),
  - `crates/astraea-engine/tests/native_candidate.rs` (CREATE),
  - `crates/astraea-engine/tests/fixtures/native-candidate-request.json` (CREATE),
  - `docs/internal/accuracy-program/diagnostics/A1d2-native-candidate-2026-10-26.md`
    (CREATE: method/source/limits note),
  - this run record directory.
- **Shared-file leases/dependencies and other active owners:** `six_dof.rs`,
  core `lib.rs`, engine `lib.rs` have one owner (this session). No other agent is
  editing them; no RMP02/RMP03/RMP04 lane was launched by this session. RMP02/03/04
  remain `not_started`.
- **Read-only/prohibited files and product/physical invariants:** old core
  `aero.rs`, `aero_coefficients.rs` (reused, not edited), engine `models.rs`,
  `commands.rs`, all frontend/project schema/dispatch/WASM/desktop/config files.
  No `SimulationResult` field, default 300 s legacy horizon, validity string,
  telemetry or legacy load law changes. Legacy slope/CP/drag carriers must stay
  irrelevant to candidate evaluation.
- **Required reading and accepted interface/source decisions:** START-HERE,
  STATE, CONTROL-LOOP, CHECKS, WIP-RECOVERY, INTERFACES, RMP01, P0 contract, A1d
  design, E1b/A1d-1 review. Frozen semantics: `static-body-total-SB1/1.0.0`,
  `legacy-dimensional-rate-couple/1.0.0`,
  `candidate-static-rate-composition/1.0.0`, forward flow `0<=M<0.8`,
  incidence<=5 deg, cant exactly zero, airframe drag scale omitted/1.
- **Ordered small commits; first useful end-to-end increment:**
  1. this lease/run record + WIP reuse-or-clean decision;
  2. `six_dof.rs` extraction + horizon/outcome bridge (legacy output must stay
     byte-identical to the `f37d195…` snapshot);
  3. core `flight_provider.rs` prepared object + query + curve + composition and
     boundary tests;
  4. core bounded trajectory wrapper/result and off-grid/time-limit tests;
  5. engine DTO helper + example + fixture + native integration test (the first
     useful end-to-end increment: a real DTO -> adapter -> prepared object ->
     finite ascent + query + curves);
  6. method/limits note, evidence, coordinator integrated checks, independent
     review disposition.
- **Mechanism/expected result/evidence for each acceptance ID:** see the
  acceptance matrix in `docs/internal/execution-package/packets/RMP01.md`;
  statuses are recorded in `RESULT.md` + `EVIDENCE.json` in this directory.
- **Safe test commands and required capabilities; no scoring by default:**
  `CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=<external> cargo test --offline --manifest-path
  crates/astraea-core/Cargo.toml`; `… --locked --manifest-path
  crates/astraea-engine/Cargo.toml --all-targets`; the new example with its
  synthetic fixture; the retained `legacy_flight_snapshot` before/after pair.
- **Independent reviewer and exact physical/numerical question:** post-author
  independent review of (a) static datum/CG wrench translation and
  dimensionalization, (b) rate-couple units/signs/lengths and that static
  diagnostics stay static, (c) support/refusal and result-truth semantics, (d)
  that no legacy calibration/CP/drag carrier enters the candidate.
- **Resource allocation/isolated targets; reassess current host:** one Cargo
  job, `CARGO_TARGET_DIR=/home/ak/.paseo/worktrees/3s8t98rp/target-rmp01`
  (about 11 GiB available at dispatch, Paseo scope 3 GiB). No parallel heavy job.
- **Deliverable evidence directory/manifest and artifact availability:** small
  summaries in this directory; raw logs, binaries and full responses under
  `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp01/` (not committed).
- **Stop/rework/escalation boundaries; exact successor:** stop if
  mechanics/rate/recovery semantics would need changing a legacy equation or a
  product promise; record the concrete design choice. Successor after acceptance:
  RMP06/RMP07 expansion using these actual interfaces.
- **Authority:** local reversible engineering only; no push, main merge, tag,
  release, deployment, spending, outreach or new holdout access.
