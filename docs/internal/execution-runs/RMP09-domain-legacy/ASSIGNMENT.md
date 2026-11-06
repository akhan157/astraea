# RMP09 domain/legacy lane lease (C06 + C08)

- Packet/subpacket: RMP09 domain/error (C06) and legacy preservation (C08) evidence
  lane. C01/C07 are not reopened; no physical qualification claim is added.
- Exact base SHA: `82c595df544dcdb883ca2fe81274bff7c4664a50` (branch and worktree
  `rmp09-c06-c08-domain-legacy`, isolated, clean at claim time).
- Owner/model/effort: OMP author, `openrouter/deepseek/deepseek-v4.1-flash-1017`,
  high. No subagents, no reviewer session (coordinator owns independent review).
- Actual availability: offline Rust 1.99.1 toolchain; no paid capacity, no new
  data, no browser, no WASM build, no sealed `target-rmp01`, no pnpm wrappers.
  Memory preflight (`free -h`) before the single verification pass; abort below
  2 GiB available. Two compiler/test jobs maximum, `--test-threads=2`.
- Owned existing files (tests/documentation only unless a concrete bug is
  escalated, none proposed): `crates/astraea-core/src/six_dof.rs` test modules,
  `crates/astraea-core/src/flight_provider.rs` test module.
  CREATE: this run record set (`ASSIGNMENT.md`, `RESULT.md`, `REVIEW.md`,
  `EVIDENCE.json`, `SOURCE-DOMAIN-LEDGER.md`) and an external evidence log
  directory `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp09-domain-legacy/`.
  Throwaway native example created, executed and removed in the same session.
- Read-only: engine `models.rs`/`dispatch`, `native_candidate.rs`, profile bridge
  implementation, `aero_*`/`sb1_geometry`/`supplied_aero`, frontend/schema/
  defaults, coordinator `CHANGELOG.md`/`TASKS.md`/`acceptance-register.json`/
  `manifest.json`, other worktrees, RMP12/RMP08 artifacts.
- Frozen semantics under test: legacy `validity`/`off_nominal_excursion`
  labeling is cumulative over committed stages and must never improve when a
  canopy branch later applies; candidate support is fail-closed per stage with
  no canopy/rail/negligibility waiver and no legacy fallback; candidate
  activation is explicit only and the legacy `simulate_flight` wrapper and its
  result schema are unchanged.
- Ordered work (one end commit): (1) C06 temporal evidence through the real
  shared driver/summary; (2) C06 committed-versus-speculative seam evidence;
  (3) C06 canopy Mach boundary retained definition; (4) C08 candidate
  run surrounded by bit-identical native legacy runs plus explicit identities
  and existing oracle link; (5) worksheet + result/evidence records.
- Acceptance mapping: RMP09-C06 -> tests named in RESULT.md, observed native
  run; RMP09-C08 -> same, plus existing engine dispatch/poisoned-carrier/
  parity evidence referenced, not duplicated.
- Reviewer question (coordinator): does the injected airframe-domain failure
  constitute sufficient driver-level evidence that legal `Unsupported`/
  `Extrapolated` ascent flags survive canopy deployment, given the fixture
  physically reaches drogue/main/touchdown?
- Authority: local reversible engineering only; no push/merge/tag/release/
  deploy/outreach/payment; no protected outcomes; no physics retuning.
