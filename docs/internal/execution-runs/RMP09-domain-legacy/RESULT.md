# RMP09 C06/C08 domain/legacy evidence — reviewed bounded result

- Packet and exact scope: RMP09 acceptance C06 (domain/error) and C08 (legacy
  preservation) pre-registered by the coordinator; this lane adds the missing
  temporal/error/native-domain invariant evidence. It does not reopen C01/C07,
  does not qualify any physics, and proposes no production change.
  Unfinished by design: measured terrain/datum data (none exists), recovery
  inflation/opening-shock and multibody suspension (not modeled; unsupported),
  candidate product migration/default activation (not authorized).
- Owner/model/effort: OMP author `openrouter/deepseek/deepseek-v4.1-flash-1017`,
  high. No usage-limit message was supplied. No subagents, no reviewer session.
- Base `82c595df544dcdb883ca2fe81274bff7c4664a50`; code commit
  `67a5f9d73f5af51c49b2c2f87a48a9b4300f544e` (tests/comments only, additions
  only: +219 lines); records commit is this file's commit. Branch
  `rmp09-c06-c08-domain-legacy`, clean after the records commit.
- Concrete change: none to behavior/physics/default. Five permanent tests were
  added to the existing modules (`six_dof.rs` tests, `flight_provider.rs` tests);
  no public API, model identity, threshold or DTO changed.
- Source/equation/input identities: legacy `flight-signed-normal-plus-wind-drag-v1`
  (`compute_flight_loads`), shared driver `simulate_driver`, candidate
  `candidate-static-rate-composition/1.0.0` with `static-body-total-SB1/1.0.0`,
  `legacy-dimensional-rate-couple/1.0.0`, `legacy-primitive-mass-inertia/1.0.0`,
  `legacy-isa1976-powerlaw-wind/1.0.0`, `no-historical-calibration/1.0.0`.
  Domain inventory and line anchors: `SOURCE-DOMAIN-LEDGER.md`.
- Acceptance ID -> mechanism -> result -> evidence:
  - **RMP09-C06 (temporal persistence)**
    `six_dof::tests::airframe_ascent_domain_excursion_survives_later_canopy_deployment`:
    the real legacy assembly flies the frozen Estes/C6 fixture with a declared
    crosswind; 8 m/s produces a committed `Extrapolated` and 15 m/s a committed
    `Unsupported` airframe ascent, both strictly before the drogue event, while
    every committed sample with a live canopy is `Valid`; the summary stays
    `validity == "UNKNOWN"` with `off_nominal_excursion == true`, terminates, and
    keeps all six nominal events. For 8 m/s `enveloped == true`, so `UNKNOWN`
    cannot be attributed to `!enveloped`. Result: PASS for this invariant.
  - **RMP09-C06 (committed vs speculative)**
    `six_dof::tests::rejected_adaptive_trial_validity_is_not_folded_into_the_committed_prefix`
    (a rejected trial's seven speculative stage labels never reach
    `committed_validity`; positive control folds real labels) and
    `six_dof::tests::fold_prefix_consumes_only_steps_starting_before_the_event_time`
    (prefix folding stops at the localized root). Result: PASS.
  - **RMP09-C06 (canopy Mach definition)**
    `flight_provider::tests::canopy_mach_support_is_inclusive_exactly_at_the_declared_limit`:
    computed stage Mach exactly `1.0` -> `Supported` with canopy force; the next
    representable speed -> `UnsupportedDomain` ("Mach <= 1"); the airframe branch
    still refuses the same sonic state. Result: PASS for the retained definition.
  - **RMP09-C06 (zero speed, profile coverage, terrain)** — re-verified existing
    evidence, not duplicated: `zero_speed_policy_and_nonfinite_inputs_fail_closed`
    (zero rates supported with absent flow; nonzero rate at `V=0` refused) and
    `profile_coverage_never_gets_a_zero_speed_rail_canopy_or_negligibility_waiver`
    (actual E1 coverage/time validity, no rail/canopy/zero-speed waiver). Terrain
    datum support is AGL + declared altitude only in both models; nothing was
    invented. Legacy `V=0` with nonzero rates silently returns a zero rate couple
    (`∝V` term) and is frozen; the candidate refuses instead — documented, not
    unified.
  - **RMP09-C08 (explicit activation + legacy preservation)**
    `flight_provider::tests::explicit_candidate_activation_leaves_the_legacy_native_run_bit_identical`:
    a native legacy `simulate_flight` run before and after an explicit candidate
    run preserves summary/event numeric bits and statuses (coordinator replaced
    the author's Debug comparison with direct `to_bits` comparisons), keeps
    `validity == "PASS"`, `off_nominal_excursion == false`, the
    `flight-signed-normal-plus-wind-drag-v1` diagnostic identity and the frozen
    apogee oracle (`rel < 1e-6`); the candidate reports its own composition,
    static-provider, rate, mechanical and calibration identities,
    `CompletedRequestedHorizon`, unqualified empirical / UNKNOWN dynamic status,
    no landing, and independent forward-flight physics (aft body axial force,
    positive wind-axis drag). Result: PASS for this invariant.
    Additional pre-existing evidence reused (not duplicated):
    `poisoned_legacy_slope_and_drag_carriers_cannot_change_a_candidate_run`,
    `zero_wind_landing_parity`, and engine
    `candidate_is_not_reachable_from_app_dispatch_or_the_legacy_command`.
- Failed attempts / sensitivity: two deliberate mutations were run and reverted
  (`evidence-rmp09-domain-legacy/mutation-checks.txt`): clearing
  `saw_unsupported`/`saw_extrapolated` once a canopy is live made the temporal
  test fail with `PASS` instead of `UNKNOWN`; folding a rejected trial's validity
  made the speculative test fail. Working tree is additions-only after revert.
- Actual checks (native, this host):
  `cargo test --offline -j2 --manifest-path crates/astraea-core/Cargo.toml --lib -- --test-threads=2`
  -> 202 passed, 0 failed (13.12 s), log
  `evidence-rmp09-domain-legacy/core-lib-tests.txt`. The five new tests were
  also run individually (all ok). Throwaway native example
  `rmp09_domain_smoke` exercised the legacy summary across crosswinds
  0/6..15 m/s, real legacy load labels (incidence 20° `Extrapolated`, 40°
  `Unsupported`, canopy at 40° `Valid`, canopy Mach 1.179 `Extrapolated`,
  2.359 `Unsupported`), the explicit candidate run (identities, 101 committed
  samples, `TimeLimit`), canopy Mach 1.0 supported vs next ulp refused, airframe
  sonic refusal, zero-speed rest supported with absent flow and zero
  force/moment, and zero-speed spin refused; log
  `evidence-rmp09-domain-legacy/native-smoke.txt`. The example file was deleted.
- Evidence classification: synthetic fixtures and declared-constant carriers;
  no measured observation, no new outcome, no empirical or general mechanics
  qualification. Candidate remains empirically unqualified and dynamically
  UNKNOWN.
- Not run / unavailable: no engine/WASM build, no pnpm wrappers, no sealed
  `target-rmp01`, no RMP08 worktree content, no protected outcomes, no RMP12
  studies, no browser/desktop. RMP08 integration is the coordinator's.
- Processes/resources: no background processes, servers or agents left; the
  isolated target `target-rmp09` and external log directory are retained.
- Coordinator independent review accepted current-model C06/C08 scope (REVIEW.md).
  Corrected the negligible-force ledger, strengthened bit comparisons and removed
  a tautological loop from the referenced engine-dispatch test. Combined tree:
  206 core tests pass; 99 engine tests pass across 11 suites, offline, two jobs.
  The native smoke was also executed directly by the coordinator.
- Open prerequisites: measured terrain datum/AGL-MSL definitions, recovery
  inflation/shock data and authorization for any candidate default/migration.
  RMP09-C07 measured comparison and broader physical qualification stay open;
  no unsupported terrain/recovery physics is made supported by this acceptance.
