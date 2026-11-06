# RMP12 attitude presentation — proposal (gate 1)

Lane `rmp12-attitude-display`. cwd `/home/ak/.paseo/worktrees/3s8t98rp/rmp12-attitude-display`,
branch `rmp12-attitude-display`, HEAD `0f6f08eed60a06946d11306371dca1841a3f2e26`,
tree clean except the untracked `docs/internal/execution-runs/RMP12-attitude-display/`.

Route: `deepseek/deepseek-flash` on the direct `deepseek` provider
(`api.deepseek.com`; catalog entry `DeepSeek-V4.1-Flash`, reasoning true; the
`1017` suffix exists only on third-party catalogs). `fallbackChains` is empty in
`~/.omp/agent/config.yml`; no proxy/OpenRouter selector was used. The lane
dispatch declares `max` effort; the global config default (`high`) is not the
lane setting and the per-session thinking level is not introspectable from the
worktree — recorded as a dispatch-record check for the coordinator, not claimed
as observed.

No source edit, build, test, formatter or browser run has been performed. The
analysis below is standard-library Python against the shipped formulas plus
read-only analysis of the retained RMP12-knot-split replies and the generated
telemetry fixture. Reproduce with:

```sh
python3 docs/internal/execution-runs/RMP12-attitude-display/derive_attitude.py \
  --evidence ../evidence-rmp12-knot-split/native-wasm-2 \
  --fixture crates/astraea-engine/tests/fixtures/telemetry-parity.json
```

## Verdict

1. The shipped triple is a **defect**, not a legacy idiom. Its three numbers are
   not a decomposition of the simulated attitude under any interpretation:
   over 200 combined attitudes and all 576 interpretations (6 axis orders ×
   6 label→factor maps × 8 sign combinations × {R, Rᵀ}) the best single
   interpretation leaves `max |ΔR| = 0.8649` rad; none is within 0.01 rad.
2. The defect is structural, not a tolerance: the yaw formula is the outer
   angle of `Rz·Ry·Rx`, while the pitch/roll formulas are the middle/inner forms
   of `Rz·Rx·Ry` with the `yz` and `xz` cross terms sign-flipped. It is a chimera
   of two conventions with two transcription signs.
3. **The corrected convention is `R_NB = Rz(yaw)·Rx(pitch)·Ry(roll)`, not the
   tentative `Rz(yaw)·Ry(roll)·Rx(pitch)`.** The code-native rail invariant
   selects it: under `Rz·Rx·Ry` the extracted pitch equals the commanded rail
   elevation and yaw equals minus the commanded rail azimuth to ≤ 4.7e-13 deg;
   under `Rz·Ry·Rx` the same construction is off by up to 40.0 deg in pitch and
   180.0 deg in yaw. On the retained vertical wind-3 flight, `Rz·Ry·Rx` reports
   `|pitch| = 90.0000` for **all 5000** samples while the nose sweeps from +90°
   to −89.76°; the proposed convention reports the actual elevation.
4. Therefore **all three formulas change**, including yaw. "Yaw is exact" holds
   only inside the tentative convention; under the physical convention the
   shipped yaw is wrong whenever pitch and roll are both nonzero (e.g. the
   el=85°, az=30° launch reads yaw −2.4997° instead of −30°).
5. Recommend: correct both runtimes in one commit, regenerate the generated TS
   oracle fixture, replace the old numerator-based parity exemption, and declare
   a reporting migration by disclosure (changelog + output dictionary + the run's
   existing engine identity). Old archives stay byte-preserved and are never
   recomputed. A new matched native/WASM run with the rebuilt artifact is the
   only acceptable C04 evidence; I make no C04 PASS claim.

This is the one point where I am correcting the coordinator's tentative mapping.
Everything the coordinator established about the defect (yaw exact under the
tested composition; best reconstruction far from R; the standard triple exact
for its own composition; shared wrong function explains the parity study) is
reproduced above; the difference is which composition the display is required
to represent, and the rail construction decides it.

## 1. Convention, proven

Frames are the normative ones: navigation ENU; body right-handed, `+Y_B` nose,
`+X_B` pitch axis, `+Z_B` yaw axis; `p = Ω_Y`, `q = Ω_X`, `r = Ω_Z`
(`docs/internal/astraea-normative-physical-contract.md` §1.2-1.3). `q` is the
body→navigation attitude; `quaternion_to_matrix` is the standard active map
(verified against `q v q*` over 100 random attitudes, max diff 3.3e-16).

Convention: **`R_NB = Rz(yaw)·Rx(pitch)·Ry(roll)`**, i.e. intrinsic
yaw→pitch→roll about the body axes (`z`, then the new `x`, then the new `y`);
equivalently fixed-axis `Ry` then `Rx` then `Rz` (extrinsic Y-X-Z). Quaternion
form `q = qz(yaw)·qx(pitch)·qy(roll)`. Composition test: `R(qz·qx·qy)` equals
`Rz·Rx·Ry` to 2.2e-16, and the extraction below inverts it to ≤ 1e-12 deg on
3000 random attitudes with all three axes non-degenerate.

Proof of selection (not just exactness — both candidate orders are exact for
their own composition):

| Check | `Rz·Rx·Ry` (proposed) | `Rz·Ry·Rx` (tentative) |
| --- | --- | --- |
| Rail invariant over el ∈ [70,89], az ∈ [−180,180]: `max|pitch−elevation|` | **4.7e-13** | 40.0 |
| same, `max|yaw+azimuth|` | **4.3e-13** | 180.0 |
| el=85 az=30 first telemetry sample | **85.000 / 27.590 / −30.000** | 85.566 / 2.313 / −2.500 |
| roll equals the geometric twist about the nose (el85/az30, el70/az90, el80/az−45) | **27.589910 / 70.000000 / −38.331472** | n/a |
| retained wind-3 5000 samples: `pitch` range | **−89.76 … 90.00** | −90.000 … 90.000, all 5000 at ±90 |

The rail attitude is the only attitude the code commands directly: the shipped
initial condition aligns body `+Y` with the rail vector
(`six_dof.rs:2208-2240`; TS `sixDofSimulator.ts:425-458`). A display that does
not return the commanded elevation/azimuth at launch, and that collapses to
±90° for the whole vertical flight, is not the attitude. `pitch = elevation`
and `yaw = −azimuth` (positive yaw turns North toward West about `+Z`) follow
algebraically from the product and were verified numerically.

`q` and `−q` produce identical output (max deviation 0.0 over 2000 attitudes,
both the shipped and corrected functions).

## 2. Defect, not idiom

- No interpretation reconstructs `R`: 576 interpretations, best `max|ΔR| =
  0.8649` rad on 200 combined attitudes; 0 of 576 within 0.01 rad. A deliberate
  presentation idiom would at least be one consistent decomposition.
- The three formulas come from two different products. Shipped
  `yaw = atan2(2(wz+xy), 1−2(y²+z²))` is exactly `atan2(R₁₀, R₀₀)` for
  `R = Rz·Ry·Rx`; shipped pitch/roll are that product's middle/inner forms for
  `R = Rz·Rx·Ry` with the `yz` (pitch) and `xz` (roll) terms sign-flipped. All
  three formulas individually pass a per-axis test (pure x, pure y, pure z
  recover the angle), which is why the defect survived every naive check.
- User-visible magnitude on retained bytes: both telemetry-parity cases launch
  at rail elevation 90°. The old pitch is exactly `90.0` on **all 16,069**
  fixture rows and all 5,000 wire rows of the wind-3 case, while the nose
  actually pitches over to −89.76°. Old vs corrected at one retained sample
  (t = 0.55 s, wind 3): shipped `90.0 / −172.9 / −0.0`; corrected
  `90.0 / 7.8 / −0.0` in **both** runtimes. This is not a rounding question.
- Not a tolerance/fixture special case: the corrected formulas are analytic
  inverses (recovery ≤ 1e-12 deg; recomposition `max|ΔR|` = 1.2e-13 on 5000
  retained samples), the wrong variants are separated by 14.7-18.8° at a
  single witness, and nothing is keyed to a fixture row, a tolerance, or a
  rounding step.

## 3. Corrected formulas

```rust
// crates/astraea-core/src/six_dof.rs:185
// R_NB = Rz(yaw) * Rx(pitch) * Ry(roll). pitch = asin(2(wx+yz)) is the nose
// elevation; roll = atan2(2(wy-zx), 1-2(x^2+y^2)) is the right-handed spin
// about the longitudinal +Y; yaw = atan2(2(wz-xy), 1-2(x^2+z^2)) is the
// right-handed rotation about +Z. Non-authoritative presentation; q is canonical.
let sin_pitch = 2.0 * (w * x + y * z);
let pitch = if sin_pitch.abs() >= 1.0 { sin_pitch.signum() * (PI / 2.0) }
            else { sin_pitch.asin() };
let roll = (2.0 * (w * y - z * x)).atan2(1.0 - 2.0 * (x * x + y * y));
let yaw  = (2.0 * (w * z - x * y)).atan2(1.0 - 2.0 * (x * x + z * z));
```

The TS mirror is the same expression with `Math.asin`/`Math.atan2`; the 0.1°
display rounding and full-precision touchdown sample are unchanged. Derivation:
`R[2][1] = 2(xw+yz) = sin(pitch)`; `R[2][0] = 2(xz−yw) = −cos(pitch)·sin(roll)`
and `R[2][2] = 1−2(x²+y²) = cos(pitch)·cos(roll)`; `R[0][1] = 2(xy−zw) =
−cos(pitch)·sin(yaw)` and `R[1][1] = 1−2(x²+z²) = cos(pitch)·cos(yaw)`. With the
principal `pitch ∈ [−90,90]`, `cos(pitch) ≥ 0`, so both `atan2` pairs are scaled
by a non-negative factor and the angles are exact. For attitudes outside the
principal branch the returned triple is the equivalent representative and still
recomposes `R` exactly (verified over 4000 full-range attitudes, `max|ΔR| =
5.7e-12`).

Range/lock contract:
- `pitch ∈ [−90,90]` (principal; a nose that passes vertical is represented by
  the equivalent `yaw±180, roll±180` triple, still exact for `R`).
- `roll, yaw ∈ (−180,180]`.
- Gimbal lock at `|pitch| = 90`: the `atan2` pair magnitude is
  `|cos(pitch)|`, so roll and yaw are undefined; the function returns the
  `atan2` representative (e.g. 90/90 at an exact lock), finite and
  non-authoritative. `asin` clamps only a roundoff-level `|arg| ≥ 1`; it cannot
  turn a real 95° pitch into 90° because pitch is the principal elevation.
  A perturbation of `1e-15` in `q` at an exact lock moves roll/yaw by up to
  241.6° — the lock is genuinely undefined, not merely inaccurate.
- The function expects a unit quaternion, as before; the sim normalizes every
  committed state. The clamp also keeps a marginally non-unit input finite.

## 4. Consumers and invalidated receipts

| Surface | Location | Effect |
| --- | --- | --- |
| Core conversion | `crates/astraea-core/src/six_dof.rs:185-198` | body changes |
| Display telemetry (0.1° rounding) | `six_dof.rs:2781`, `:2797` | values change |
| Touchdown sample (full precision) | `six_dof.rs:2877`, `:2892` | values change |
| DTO passthrough | `crates/astraea-engine/src/models.rs:783-785`, `:1060-1062` | no field/schema change |
| Wire series | `commands::simulate_flight` | three fields change |
| TS mirror | `src/sim/sixDofSimulator.ts:280-302` | body changes |
| TS display sample | `sixDofSimulator.ts:1155`, `:1172-1174` | values change |
| TS touchdown record | `sixDofSimulator.ts:1270`, `:1291-1293` | values change |
| Saved telemetry parse | `src/application/savedTelemetry.ts:20-23`, `:124-126` | unchanged; values preserved |
| Saved runs | project schema ≥ 1.10.0 (`PROJECT_SCHEMA_VERSION` 1.12.0) | new runs carry corrected bytes; old runs keep theirs |
| KML export | `src/formats/exportPreview.ts:283-295` | positions only; no Euler |
| Report/saved outputs | `savedFlightOutputs.ts`, dictionary revision `RMP10-C06/2` | does not carry telemetry Euler |
| UI pose | `src/console/stages/FlightTimeline.tsx:22-75` | uses `q`, not Euler |
| UI timeline | same file, panes altitude/speed/Mach/AoA/q | **no current chart plots pitchDeg/rollDeg/yawDeg** |
| Engine parity test | `crates/astraea-engine/tests/telemetry_parity.rs:28-32`, `:148-160`, `:296-310` | exemption rule must be replaced |
| Generated oracle fixture | `crates/astraea-engine/tests/fixtures/telemetry-parity.json` | Euler columns regenerate |
| Literal TS fixtures | `savedTelemetry.fixture.ts`, `console/testFixtures.ts`, `largeProject.fixture.ts`, `exportPreview.test.ts` | saved-data shapes, not conversion pins; unchanged |

Correction to the assignment premise: there is no attitude chart reading these
fields today. The 3D pose uses `q`; the timeline plots altitude, airspeed, Mach,
AoA and q. The Euler triple is an IPC/saved-telemetry presentation contract, so
the fix is still real but its user-visible reach is saved JSON and any external
consumer, not a current chart.

Fixture byte deltas (rounded values, from the script):

| Case | Rows | pitch changes | roll changes | yaw changes | max angular delta (pitch/roll/yaw) |
| --- | --- | --- | --- | --- | --- |
| wind0 | 8138 | 0 | 0 | 0 | 0 / 0 / 0 |
| wind3 | 7931 | 7910 | 7871 | 7910 | 180.0 / 180.0 / 90.0 |

Retained receipts:

- `RMP12-knot-split/MATCHED-RUNTIME-EVIDENCE.json` keeps its identity and
  non-Euler claims for the exact reply bytes: quaternions, trajectory, events,
  loads, validity, hashes and the 125,030/130,039 non-singular numeric fields
  are untouched. Its Euler bytes are the legacy function and its `eulerFields`
  (4975 roll, 34 yaw) and `existingEulerRule` explanation are historical, not a
  property of the attitude. Recomputed from the retained `q` (no rerun), the
  corrected triple gives **0** failing field comparisons and identical rounded
  values in both runtimes (wind3 max unrounded difference 1.5e-12/4.0e-11/3.8e-11
  deg; wind0 0). The old wind-3 "strict all-field parity fails" verdict is
  therefore a consequence of the formula defect.
- The generated fixture's wind-3 Euler columns are superseded; wind-0 columns are
  identical. Its old revision stays in git history, not rewritten in place by
  hand.
- The RMP12 packet/review text stays historical; this lane's RESULT records the
  corrected finding. No register/manifest/board edit.

## 5. Migration (declared reporting change)

- No project-schema change and no new field. Project schema stays 1.12.0. Saved
  telemetry is only persisted when the run carries an engine identity
  (`src/application/runCases.ts:248-249`), so every archived Euler byte is
  already bound to a recorded engine identity; that identity is the pre/post
  boundary. `dictionaryRevision` (`RMP10-C06/2`) describes the saved
  flight-output dictionary, not the telemetry, and is not repurposed.
- Old archives are byte-preserved; nothing is recomputed, backfilled or
  migrated. A saved sample's `q` remains the authoritative attitude; consumers
  that need the physical angles may recompute them under the declared
  convention, but the recorded Euler fields are a historical legacy presentation.
- Disclosure 1 — `docs/internal/engineering-changelog.md` (Unreleased, Changed):
  name the old formulas, the convention defect, the corrected product form, the
  affected bytes, the fact that pre-fix runs' pitch/roll are not a physical
  attitude, and that trajectory/quaternions/events/loads/non-Euler fields are
  unchanged. Include the built engine identity (WASM SHA-256 and bytes) when it
  exists.
- Disclosure 2 — `docs/internal/output-dictionary.md` telemetry section: define
  `pitchDeg/rollDeg/yawDeg` as the non-authoritative extraction of the sample's
  `q` under `attitude-euler/1.0.0`: `R_NB = Rz·Rx·Ry`, `pitch = asin(2(wx+yz))`
  (elevation), `roll = atan2(2(wy−zx), 1−2(x²+y²))` (right-handed about +Y),
  `yaw = atan2(2(wz−xy), 1−2(x²+z²))` (right-handed about +Z; a launch azimuth
  `a` reads `yaw = −a`), undefined roll/yaw at `|pitch| = 90`, and the legacy
  disclaimer for archives produced before the recorded engine identity.

Evidence that stays valid for its bytes: every quaternion, position, velocity,
speed, Mach, acceleration, rate, AoA, drag, thrust, mass, q, altitude, event,
validity and hash in the retained receipts and fixtures; the wind-0 Euler bytes
(identical under the fix); the old artifact identities. Invalidated for new
values: only the three Euler fields, and any conclusion that the old roll/yaw
disagreements were an unavoidable gimbal-lock limit.

## 6. Falsifiers / regressions (both runtimes, same vectors)

1. Per-axis: `qx(θ) → (θ,0,0)` for θ ∈ {10,45,89}; `qy(φ) → (0,φ,0)` for
   φ ∈ {10,89,91,135,179,−100}; `qz(ψ) → (0,0,ψ)` for ψ ∈ {10,89,179,−100};
   each within 1e-9 deg. (The old formulas pass these — non-vacuity requires 2.)
2. Combined witness, convention B, `pitch=23.4, roll=−37.2, yaw=41.5`:
   corrected exact (≤1e-9). Separation at the same attitude:
   shipped 39.6089/−18.4019/24.7245 (18.80° max error); tentative convention A
   28.5143/−33.7020/24.7245 (16.78°); pitch `yz` sign flip 16.21°; roll `xz`
   sign flip 18.80°; yaw `xy` sign flip 14.65°. The exact bound is far tighter
   than every wrong variant, so a sign or form regression cannot pass.
3. Rail invariant end-to-end: build the shipped initial `q` for
   (el,az) ∈ {70,85,89} × {−135,−30,0,45,179}; assert `pitch = el`,
   `yaw = −az` to 1e-9 and that the extracted triple recomposes `R(q)` to 1e-9.
   This is the test the tentative convention fails.
4. `q`/`−q` equivalence: identical outputs bit-for-bit on 2000 random attitudes.
5. Lock: at exactly `pitch=90` the pitch is 90 and roll/yaw are finite but
   non-authoritative; assert the lock predicate and exact recomposition, not
   stability. A genuine 95° pitch is reported as the equivalent
   `85° / ±180° / ±180°` representative that still recomposes `R` (it is not
   clamped to 90°); a marginally non-unit input stays finite.
6. Recompose 2000 random full-range attitudes: `R(extract) == R(q)` within 1e-9.
7. Native/WASM: retained wind-3 `q` values give 0 failed field comparisons at
   display resolution in both runtimes (wind0 too); the live proof is §7.

## 7. Native/WASM after the fix

Both runtimes call the same corrected function, so agreement is expected by
construction; the proof must use actual invoked bytes:

1. Rebuild the production WASM with the declared `build:engine` (2 jobs) from
   the corrected source; record SHA-256 and byte count. The historical
   `cf57158b…` identity does not carry the fix and stays historical.
2. Build the native executable from the same source; run the same serialized
   `simulate_flight` requests as `MATCHED-RUNTIME-EVIDENCE.json` (the two
   synthetic telemetry-fixture cases, winds 0 and 3).
3. Compare with the standing `abs(native−wasm) <= 1e-9*max(abs(native),1)` bound.
   For roll/yaw compare modulo 360; the only exemption is the corrected lock
   (see §8). Prediction from the retained `q`: 0 disagreements, max unrounded
   difference ≤4e-11 deg, so no exemption is used.
4. Record the invoked buffer identity (WASM SHA-256/bytes and the engine
   identity the app records) and the native binary identity. If the coordinator
   wants an app-level receipt, run the production-CSP Chromium smoke and record
   the served/fetched WASM hashes; the pose uses `q`, so no Euler UI value is
   claimed from that run.

## 8. Parity rule replacement (engine test)

`telemetry_parity.rs` currently exempts roll/yaw when the old `atan2` numerator
is ≤1e-9 and calls that gimbal lock. Replace with:
- `pitch`: strict `spacing_ok` (always well-conditioned; the clamp only triggers
  within roundoff of ±90).
- `roll`, `yaw`: strict `spacing_ok` on the modulo-360 difference (angles near
  ±180 legitimately land on opposite sides), except when the lock predicate
  holds in both runtimes: `hypot(2(wy−zx), 1−2(x²+y²)) <= 1e-9` (equals
  `|cos pitch|`), where roll/yaw are non-authoritative. This is the same
  roundoff-level style as the existing rule, not a physical tolerance, and it is
  narrower than the old exemption. The `1e-9` spacing bound itself is unchanged.

## 9. File lease requested

Edit after approval:

1. `crates/astraea-core/src/six_dof.rs` — only `quaternion_to_euler_deg`
   (184-198, doc + body) and focused tests in the existing `mod tests` (3124+)
   or a small new `#[cfg(test)] mod` in the same file.
2. `src/sim/sixDofSimulator.ts` — only `quaternionToEulerDeg` (277-302: export
   for the shared analytic tests, doc, body) and the field comments at 55-58.
3. `crates/astraea-engine/tests/telemetry_parity.rs` — the header doc (28-32),
   `atan2_numerator` → lock predicate (148-160), the Euler assertion block
   (≈296-310). No change to `spacing_ok`, `POINT_FIELDS` or non-Euler checks.
4. `crates/astraea-engine/tests/fixtures/telemetry-parity.json` —
   **regenerate with `npm run fixtures:telemetry`** (generated TS-oracle
   artifact; the generator documents regeneration as expected). This is the one
   exception I need from the "do not edit fixtures" rule; the alternative
   (asserting Euler against a second formula copy inside the test) is weaker and
   tests the test. Verified expectation: wind0 unchanged, wind3 only the three
   Euler columns change, per §4.
5. New `src/sim/attitudePresentation.test.ts` with the shared vectors; or the
   same block added to `src/sim/sixDofSimulator.test.ts` if the coordinator
   prefers no new file.
6. `docs/internal/engineering-changelog.md` — the declared disclosure.
7. `docs/internal/output-dictionary.md` — the telemetry convention + legacy
   note (short).
8. `docs/internal/execution-runs/RMP12-attitude-display/` — this proposal, the
   derivation script, later RESULT.md/EVIDENCE.json.

Read-only: all other code in `six_dof.rs` (matrix, integrator, events,
quaternions, loads, tolerances, `EVENT_ROOT_WIDTH_S`), `crates/astraea-core/src/telemetry.rs`,
`v8_math.rs`, the engine dispatch and `flight_provider.rs` (rmp06), `models.rs`,
`commands.rs`, `src/application/savedTelemetry.ts`, `src/formats/projectJson.ts`
and project schema, `exportPreview.ts`, `reportJson.ts`, `savedFlightOutputs.ts`,
`runCases.ts`, `src/console/**`, `src/io/**` and every TS fixture with literal
Euler values, `scripts/generate-telemetry-fixture.mjs` (run only), package/
Cargo manifests and locks, the execution package (register, manifest, packet
index, TASKS, handoff, CHECKS), the RMP12-knot-split records and external
evidence, the ensemble/sampler surfaces (rmp13) and the beta/notices surfaces
(rmp18). No push/tag/release/deploy/publication, no downloads, no outreach, no
new services.

## 10. Execution plan after approval, and limits

1. Edit the two conversions and the tests; add the analytic vectors; update the
   parity rule.
2. Regenerate the fixture; diff it and confirm only the Euler columns changed
   (wind0 zero rows; wind3 counts as measured).
3. Focused checks with ≤2 jobs and `free -h` first (stop below 2 GiB):
   `cargo test --offline -j 2 --manifest-path crates/astraea-core/Cargo.toml --lib -- --test-threads=2`;
   `cargo test --offline --locked -j 2 --manifest-path crates/astraea-engine/Cargo.toml --test telemetry_parity -- --test-threads=2`;
   the new/updated vitest files with `--maxWorkers=2`; `tsc --noEmit`.
4. Rebuild production WASM (`build:engine`, `CARGO_BUILD_JOBS=2`) and run the
   matched native/WASM experiment of §7; capture the artifact identities.
5. Write RESULT/EVIDENCE with exact commands, hashes, failed attempts and the
   remaining scope; stop every runtime; remove throwaways. No self-acceptance,
   no register/manifest/TASKS/handoff edits, no commit outside the lane.

## 11. Gate decisions requested

1. **Confirm the convention correction**: `Rz·Rx·Ry` (pitch = rail elevation,
   roll = spin about +Y, yaw = −azimuth) rather than the tentative `Rz·Ry·Rx`.
   If `Rz·Ry·Rx` is insisted on, the display cannot report the rail elevation
   and its pitch is ±90 for the entire retained vertical flight — I recommend
   against it.
2. **Approve regenerating the generated telemetry fixture** (the one fixture
   exception), or specify the alternative.
3. **Approve exporting `quaternionToEulerDeg`** for the shared analytic tests
   (or restrict TS coverage to the end-to-end rail sample).
4. **Confirm disclosure-only migration** (no schema/version field) with the
   existing per-case `engineIdentity` as the pre/post boundary.

Stopping at the coordinator gate. No source, build, test or browser action until
approved.
