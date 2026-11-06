# RMP12 attitude presentation — result (implementation for independent review)

Lane `rmp12-attitude-display`; worktree `/home/ak/.paseo/worktrees/3s8t98rp/rmp12-attitude-display`;
branch `rmp12-attitude-display`; accepted integration pin `0f6f08e`.
Proposal gate: APPROVED WITH AMENDMENTS (`REVIEW.md`), sequence corrected to
Z·X·Y after the coordinator's independent re-derivation.

Status: **implementation complete, NOT self-accepted.** The coordinator owns the
independent review, the merged-tree rerun and the register disposition.
RMP12-C02/C04 are not closed by this lane.

## Commits

| Commit | Scope |
| --- | --- |
| `e37f303` | Rust conversion `attitude-euler/1.0.0` + focused core tests |
| `92a59a9` | TS mirror, exported presentation helper, comments, shared vectors |
| `45154c2` | independently regenerated Euler fixture + scoped parity exemption |
| `e2b31ba` | changelog + output-dictionary disclosure |
| (this record) | lane records (ASSIGNMENT, PROPOSAL, REVIEW, derivation/regeneration scripts, RESULT, EVIDENCE) |

## Changed files

`crates/astraea-core/src/six_dof.rs` (conversion + `attitude_presentation_tests`),
`src/sim/sixDofSimulator.ts` (mirror + field comments), new
`src/sim/attitudePresentation.test.ts`, `crates/astraea-engine/tests/telemetry_parity.rs`,
`crates/astraea-engine/tests/fixtures/telemetry-parity.json`,
`docs/internal/engineering-changelog.md`, `docs/internal/output-dictionary.md`.
Nothing else was modified (verified with `git diff --stat 0f6f08e..HEAD`).

## Convention and implementation

`R_NB = Rz(yaw)·Rx(pitch)·Ry(roll)` (intrinsic yaw→pitch→roll; equivalently
fixed-axis Ry, Rx, Rz). `pitch = asin(2(wx+yz))` is the nose elevation,
`roll = atan2(2(wy−zx), 1−2(x²+y²))` the right-handed spin about +Y, and
`yaw = atan2(2(wz−xy), 1−2(x²+z²))` the right-handed rotation about +Z.
Independently verified before implementation (PROPOSAL): composition 2.2e-16,
rail invariant ≤ 4.7e-13 deg, exact recovery ≤ 1e-12 deg, `q`/`−q` identical.

Documented gimbal-lock gauge (amendment 5): at `|pitch| = 90` the roll/yaw split
is indeterminate (both `atan2` pair components are `|cos pitch|`). The function
pins `roll = 0`, snaps `pitch` to ±90 and puts the combined z-rotation in `yaw`
(`yaw+roll` at +90, `yaw−roll` at −90), so the returned triple still reconstructs
the attitude instead of returning an arbitrary `atan2(0,0)` value. Threshold
`|cos pitch| ≤ 1e-8` (~5.7e-7 deg from vertical), a roundoff-level branch, not a
display tolerance. Just outside the band the ordinary formulas are used
(no snap). Tested at ±90 with four roll/yaw combinations each sign (recompose
≤ 1e-9; exact values asserted), just outside the band, and for `q`/`−q`
bit-equality. The triple remains non-authoritative; `q` is canonical.

## Independent fixture regeneration (amendment 1)

`regenerate_euler_columns.py` (lane record) reimplements the convention from
scratch and patches only the three Euler tokens of each point row; it does not
import or call the Rust/TS code. `derive_attitude.py` is the separate independent
derivation/receipt. All non-Euler values and every other byte are preserved
(asserted by parsing both documents and field-comparing). Display rule preserved:
nonterminal 0.1° rounding, terminal row full precision.

| Case | Rows | pitch changes | roll changes | yaw changes | nonterminal changes (p/r/y) | max angular delta (p/r/y) |
| --- | --- | --- | --- | --- | --- | --- |
| wind0 | 8138 | 0 | 0 | 0 | 0/0/0 | 0/0/0 |
| wind3 | 7931 | 7910 | 7871 | 7910 | 7909/7870/7909 | 180.0 / 180.0 / 90.0 |

Terminal wind3 row (full precision) changes all three: `90 / 155.77225468204585 / −179.9999999999998`
→ `−18.188865213612637 / −90.00000000000007 / 90`. Fixture SHA-256
`7639cd7e…` → `5a8064c4cb3aa66d3188d26ba56c546947a1b6a8f5b4ec2b4998991ee3cc411f`
(2,324,960 → 2,318,941 bytes); the full regeneration receipt is
`fixture-regeneration.json`. The `generatedBy` string now states that the Euler
columns were regenerated independently and the rest is the 2026-10-16 TS oracle.

Retained-quaternion recomputation (no rerun): applying the corrected formulas to
the retained wind0/wind3 reply quaternions gives **0 failing field comparisons**
at display resolution (wind0 exact; wind3 max unrounded difference
1.5e-12/4.0e-11/3.8e-11 deg for pitch/roll/yaw), versus the retained receipt's
5009 disagreements (4975 roll, 34 yaw).

## Verification actually run

| Command | Result |
| --- | --- |
| `cargo test --offline -j 2 --manifest-path crates/astraea-core/Cargo.toml --lib -- --test-threads=2` | **230 passed**, 0 failed |
| `cargo test --offline --locked -j 2 --manifest-path crates/astraea-engine/Cargo.toml --tests -- --test-threads=2` | **102 passed in 11 suites**, 0 failed (includes `telemetry_parity`: 2 passed) |
| `node node_modules/vitest/vitest.mjs run src/sim/attitudePresentation.test.ts src/sim/sixDofSimulator.test.ts --maxWorkers=2` | **20 passed** in 2 files |
| `node node_modules/typescript/bin/tsc --noEmit` | exit 0 |

Build environment: `cargo 1.99.1`, lane target dir `.target-rmp12` (local
exclude), `CARGO_BUILD_JOBS=2`, `free -h` checked before heavy work (≥ 9 GiB
available, never below 2 GiB).

Parity contract now in force (amendment 2): all 26 fields are compared at the
standing `rel <= 1e-9` (`abs <= 1e-9` near zero). `pitchDeg` is strict.
`rollDeg`/`yawDeg` are compared modulo 360 at the same bound; the only exemption
is a roll/yaw disagreement when `|cos pitch| <= 1e-6` in either row (gimbal-lock
split; conditioning band, not a display tolerance). The frozen fixture must use
**zero** exemptions and the test asserts that. The corrected formulas are
exercised at full precision in the core and TS focused suites, not waived here.

## Matched native / production-WASM receipt (amendment 7)

Same serialized `simulate_flight` requests as the retained RMP12-knot-split
experiment (fixture vehicle/motor/options, winds 0 and 3). External evidence
root `../evidence-rmp12-attitude-display/` (outside Git); harness
`native-wasm.mjs`, summary `native-wasm/summary.json`.

| Identity | Value |
| --- | --- |
| Production WASM (this lane's build; unchanged flags) | `be0aa3641ef91a8859f6c5daaba1d01a735098c10a02bb9839ae0689e4964bdc`, 1,827,400 bytes |
| Native example (`legacy_flight_snapshot`, dev profile) | `70562e37054c66f1bb16842ae02653287e84329f185c1edec9f96a3ba283f59e` |
| Fixture bytes | `5a8064c4…` (see above) |
| Invoked buffer | the WASM bytes above, instantiated directly from `src/engine/astraea_engine.wasm`; inputs hashed per case in the summary |

Results: wind0 — 115,039 non-Euler numeric fields, max scaled native/WASM error
2.64e-16; wind3 — 115,039 fields, max 1.44e-14; all 15,000 Euler fields per case
agree (pitch strict, roll/yaw modulo 360); **0 lock exemptions used**. The new
native and WASM replies match the retained replies exactly on all 115,039
non-Euler numbers per case (`exact: true`, max scaled 0), so trajectory,
quaternions, loads, events, validity and manifest text are untouched. Sample
18 of wind3: retained roll −172.9 (native) / −176.4 (WASM) → corrected
82.2 / 90 / −90 in both runtimes (pitch/roll/yaw).

The historical WASM `cf57158b…` stays historical. This build was produced in
this lane; the integration tree rebuilds for itself and no cross-root byte
identity is claimed.

## Retained receipts and historical status (amendment 3)

- `RMP12-knot-split/MATCHED-RUNTIME-EVIDENCE.json`: its **Euler bytes and
  `eulerFields`/`existingEulerRule` analysis are now historical** and remain
  valid only for those exact old-reply bytes with engine identity
  `cf57158b…`/`141a7990…`. Its non-Euler fields, quaternions, trajectory,
  events, hashes and field counts remain valid for the same bytes.
- The generated fixture's pre-regeneration revision remains valid as the
  2026-10-16 TS-oracle record for its own bytes; it is superseded as an Euler
  expectation, not rewritten in place.
- All saved telemetry archives keep their recorded bytes. `engineIdentity` is
  the pre/post boundary; nothing is recomputed, backfilled or migrated. A
  pre-correction archive's `pitchDeg`/`rollDeg` are not a physical attitude and
  must not be compared with corrected values. No schema bump (project schema
  stays 1.12.0); no new field; `dictionaryRevision` is not repurposed.

## Read-only surfaces (not touched)

Engine dispatch and `crates/astraea-engine/src/flight_provider.rs` and
`native_candidate.rs`, all physics/integrator/event/quaternion/load code outside
the presentation conversion, numeric tolerances and policy identities,
`models.rs`/DTOs, `telemetry.rs`, `v8_math.rs`, project schema and
`savedTelemetry.ts`/`projectJson.ts`/`exportPreview.ts`/`reportJson.ts`/
`savedFlightOutputs.ts`/`runCases.ts`, all `src/console/**` and `src/io/**`, TS
fixtures with literal Euler values, package/Cargo manifests and locks, the
execution package (register, manifest, packet index, TASKS, handoff, CHECKS),
the RMP12-knot-split records, the rmp13 ensemble/sampler surfaces and the rmp18
beta/notices surfaces. No chart was added; no beta or sampler copy changed. No
push, merge, tag, release, deploy, publication or data acquisition.

## Failed attempts / corrections (retained)

- The first core test run failed in the lock test because the test helper's
  `angle_gap` used `%` (sign-of-dividend) instead of `rem_euclid` at the ±180
  wrap. Fixed in the test helper only; production code was not changed.
- The fixture regenerator's dry run caught its own index assertion and a
  mis-specified rounding-boundary assertion before any file was written; both
  fixed in the tooling. The final regeneration asserts the nearest-tenth
  distance (`> 1e-9` in 0.1 units) for every nonterminal value, so no
  round-half tie exists.
- The proposal's convention correction (tentative Z·Y·X → Z·X·Y) is recorded in
  `PROPOSAL.md` and confirmed independently in `REVIEW.md`.

## Not claimed / open

No numerical-budget, physical-qualification or full-6D claim. RMP12-C02 and C04
remain `in_progress`; their closure needs the coordinator's merged-tree rerun and
the separate budget work. No register/manifest/TASKS/handoff edit was made. The
author does not accept this work.
