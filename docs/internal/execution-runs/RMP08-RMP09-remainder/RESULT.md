# RMP08/RMP09 remainder — author result

Status: **bounded local check complete; external remainder recorded; coordinator
review pending.** No register status is proposed or promoted here.

## Identity

- Packet/subpacket: RMP08 C01/C03/C04/C08 and RMP09 C02/C03/C04/C05/C07
  remainder.
- Branch/worktree: `rmp08-rmp09-remainder`,
  `/home/ak/.paseo/worktrees/3s8t98rp/rmp08-rmp09-remainder`.
- Base: `58945a4d3d1fe85ee03f45cca5f963f7afc90f10`.
- Commits: `21b54b9` (assignment), `758825d`
  (`test(rmp09): verify recovery event ordering and failure paths`), this
  records commit.
- Owner/routing: OMP `openrouter/deepseek/deepseek-v4.1-flash-1017`, max
  effort, one serial author. No subagents, no independent reviewer session, no
  engine/WASM rebuild. Usage telemetry not supplied; no usage-limit message.
- Source identity: `crates/astraea-core/src/six_dof.rs` SHA-256
  `46bca2ddf79f6592902b1ebe5181e7657c385a9f7a06478f1e77a5e982355972`
  (test additions only; production `detect_events`/`EventState` unchanged).

## Delivered

1. **RMP09-C04 executable evidence.** Seven additions-only tests drive the
   public recovery FSM (`detect_events`/`EventState`) with declared synthetic
   configurations (no flight evidence):
   `recovery_sequence_nominal_orders_drogue_before_main_and_touchdown`,
   `..._main_deploys_at_apogee_when_threshold_is_above_apogee`,
   `..._delayed_main_crossing_precedes_touchdown`,
   `..._failed_main_trigger_is_forced_at_touchdown`,
   `..._seeded_main_deployed_suppresses_duplicate_deploy`,
   `..._seeded_apogee_reached_suppresses_duplicate_drogue`, and
   `..._main_cannot_deploy_before_apogee`.
   They assert event identity, ordering, duplicates and forced-touchdown
   behaviour, not incidental values.
2. **Guard mutations.** Each listed guard was removed in turn, the relevant
   test failed, the tree was reverted with `git checkout --`, and `git status`
   was clean before the next run. Logs are external and inventoried in
   `EVIDENCE.json`; no mutation remains.
3. **Records** for RMP08-C04 (candidate regime audit), RMP09-C02 (motor/
   timebase/provenance), RMP09-C03 (guide gap) and RMP09-C05 (section-energy
   gap), plus this RESULT and `EVIDENCE.json`.
4. **No production change.** No engine/WASM, no motor database, fixture,
   `aero.rs`, `aero_coefficients.rs` or `flight_provider.rs` edit.

## Verification actually run

Commands (after `free -h`; PATH included `~/.cargo/bin`; isolated target):

```sh
CARGO_TARGET_DIR=/home/ak/.paseo/worktrees/3s8t98rp/target-rmp08-rmp09 \
  cargo test --offline -j2 --manifest-path crates/astraea-core/Cargo.toml \
  --lib recovery_ -- --test-threads=2
```

- Focused: **7 passed; 0 failed; 212 filtered** (0.00 s).
- Full core lib: **219 passed; 0 failed** (12.30 s), confirming no pre-existing
  core regression.
- `git diff --check` clean on the test addition.

## Mutation results (all reverted)

| Mutation | Anchor | Test | Observed |
| --- | --- | --- | --- |
| Remove `!s.is_main_deployed` from the main-crossing guard | `six_dof.rs:906` | `recovery_sequence_seeded_main_deployed_suppresses_duplicate_deploy` | **FAILED** — duplicate MainDeploy, left 1 right 0, panic at test line 4051 |
| Remove `s.is_apogee_reached` from the main-crossing guard | `six_dof.rs:906` | `recovery_sequence_main_cannot_deploy_before_apogee` | **FAILED** — main before apogee, left 1 right 0, panic at 4073 |
| Disable the touchdown forced-main block | `six_dof.rs:936` | `recovery_sequence_failed_main_trigger_is_forced_at_touchdown` | **FAILED** — no main after failed trigger, left 0 right 1, panic at 4039 |

After every mutation: `git checkout -- crates/astraea-core/src/six_dof.rs`;
`git status --short` showed only the pre-existing untracked dispatch file. The
committed 7-test run was repeated green after all reverts.

## Bounded check dispositions (for coordinator decision)

| Check | Local result | Evidence / limit |
| --- | --- | --- |
| RMP09-C04 | **pass, bounded single-body** | 7 FSM tests + 3 guard mutations. Trigger latency and independent/suspended sections are **not modelled**; actual vehicle configuration remains external. |
| RMP08-C04 | documented, candidate scope | Docs-only audit: no candidate blend, unsupported gap refused; legacy `aero.rs` transonic blends disclosed as unvalidated and legacy-only. No new test/code. Whole-model transonic C04 not claimed. |
| RMP09-C02 | recorded, not qualified | Certified-curve provenance/hash/integral, mount and pressure assumptions, ignition/burnout conventions. Identified provenance defect: the native fixture calls its 22-point (8.733 N·s) curve “the certified Estes C6 thrust record”, while `motorDatabase.ts` records 25 points / 8.8172 N·s. No file was edited; no claim that the shipped app uses the certified curve. |
| RMP09-C03 | blocked, external | No button positions/effective travel in the model; release is full `rail_length`; first rotational freedom unresolved by the output dictionary and mission matrix. |
| RMP09-C05 | blocked, external | Only whole-vehicle `landing_kinetic_energy`/`landing_mass`; no section masses/states/energy model. |
| RMP08-C01 | blocked, external | RMP02: 0 original source PDFs verified, 0 qualified cases; A1b geometry/convention mismatch; downloads prohibited. |
| RMP08-C03 | blocked, external | ARCAS extract has CAcorr + CP only; no CN/Cm series; P0/model-path require CN(α)+Cm(α) together and reject CP-only. |
| RMP08-C08 | external, process | Author-independent acceptance; no default/primary claim exists to accept; author cannot self-accept. |
| RMP09-C07 | blocked, external | No eligible measured inputs and no approved output budgets; RMP09a measured comparison remains blocked. |

## Limits and failed attempts

- No failed committed test; the only failures were the three deliberate
  mutations above, retained as evidence and reverted.
- The recovery tests prove the **existing** FSM’s single-body ordering and flag
  semantics. They do not add trigger delay/latency, independent sections,
  opening shock, inflation or terrain physics.
- The RMP08-C04 audit is source/call-graph inspection, not a transonic
  measurement; legacy blends remain explicitly unvalidated.
- The motor record is not a flown-motor qualification; the fixture discrepancy
  is an identified provenance defect for coordinator/owner decision.
- No engine/WASM build, no pnpm/frontend run, no browser/desktop, no scoring,
  no downloads, no protected outcomes, no register/manifest/TASKS edit.

## External remainder (with citations)

- **RMP08-C01:** actual source artifact and geometry/convention ledger
  (`packets/RMP08.md` C01; `RMP02-source-eligibility/RESULT.md`;
  `A1b-reference-eligibility-2026-10-26.md`).
- **RMP08-C03:** independent CN(α)/Cm(α) data from original reports
  (`P0-contract.md:123`; `model-path.md:41`; `measured-arcas.ts`; RMP02 result).
- **RMP08-C08:** author-independent scientific review before any default/primary
  claim (`packets/RMP08.md` C08; `DECISIONS.md`).
- **RMP09-C03:** measured guide/button geometry and speed observation
  (`collegiate-mission-and-decision-matrix.md:34`;
  `output-dictionary.md:42`).
- **RMP09-C05:** section masses/CdA/arrangement and per-section energy definition
  (`RMP09-domain-legacy/SOURCE-DOMAIN-LEDGER.md`;
  `RMP10-recovery-readouts/RESULT.md:119`).
- **RMP09-C07:** eligible measured mass/CG, guide/recovery observations and
  predeclared budgets (`packets/RMP09.md` C07; `DECISIONS.md`; RMP09a result).
- RMP09-C02 additionally needs the actual flown motor/mounting/pressure record
  for any vehicle claim; only the committed application curve was recorded.

## Review and next action

Coordinator review is required; no acceptance or status promotion is
self-asserted. The next action is coordinator inspection of the test commit,
mutation logs, the four notes and the external remainder, followed by
register/lease decisions. No push, merge, release or outreach.
