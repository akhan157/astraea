# E1 engine robustness — author report; independent review pending

Base: `68e9877edae4bf80623983a347edfa3ecbd26627`. This lane cannot self-accept; independent review remains required. The section below records the earlier failed candidate `85ea449`; its failures and open test gaps are superseded by the clamp-drop section at the end. No thresholds were changed and no cohort tuning was done.

## Baseline inventory

Measured before production edits using `inventory.probe.ts` and `aggregate_mass`; maximum and reference diameters are metres. `aft` is the last axial external component's aft diameter. No declared exit triggers the bound. Every motor curve has zero thrust at t=0; no curve has an interval between adjacent zero-thrust knots. “Pressure” indicates the app-derived nozzle term is on, so its zero-thrust point occurs with the term enabled. Inventory raw evidence: `$HOME/astraea-evidence/goal-collegiate-accuracy/E1/baseline/inventory.json`, SHA-256 `5e7c24d557103efb7f2c25efbd6a14dba99f46578196b370ce9c27060e89d4ba`. Probe/config are in the E1 evidence directory.

| Design | Max m | Ref m | Aft m | Exit m | Bound | Pressure at t=0 |
|---|---:|---:|---:|---:|---|---|
| qu8k | 0.212725 | 0.212725 | 0.17018 | 0.1524 | no | yes |
| proteus6 | 0.1524 | 0.1524 | 0.127 | 0.12192 | no | yes |
| dontdebatethisn5800mindia | 0.10541 | 0.10541 | 0.10541 | 0.0631952 | no | yes |
| kinsel-p4935-a-601-rocket | 0.1651 | 0.1651 | 0.1651 | 0.078486 | no | yes |
| full-metal-jacket1 | 0.10795 | 0.10795 | 0.10795 | 0.0635 | no | yes |
| full-metal-jacket2 | 0.10795 | 0.10795 | 0.10795 | 0.0635 | no | yes |
| l500roc | 0.057404 | 0.057404 | 0.057404 | 0.0254 | no | yes |
| torrent | 0.104775 | 0.104775 | 0.104775 | 0.041275 | no | yes |
| rabia | 0.079375 | 0.079375 | 0.079375 | 0.0301752 | no | yes |
| rabia-shortfincan | 0.081026 | 0.081026 | 0.081026 | 0.0301498 | no | yes |
| blister | 0.079375 | 0.079375 | 0.079375 | 0.0333375 | no | yes |
| raven | 0.04445 | 0.04445 | 0.04445 | — | no | no |
| iondrive | 0.1016 | 0.1016 | 0.0635 | — | no | no |
| cancerdescending | 0.1524 | 0.1524 | 0.1524 | — | no | no |
| byrum | 0.0762 | 0.0762 | 0.0762 | — | no | no |
| calisp4 | 0.07874 | 0.07874 | 0.07874 | 0.016002 | no | yes |
| calisp5 | 0.07874 | 0.07874 | 0.07874 | 0.016002 | no | yes |
| ezi65-1 | 0.1016 | 0.1016 | 0.1016 | — | no | no |
| calisp1 | 0.07874 | 0.07874 | 0.07874 | 0.016002 | no | yes |
| gibb | 0.0762 | 0.0762 | 0.0762 | — | no | no |
| calisp2 | 0.07874 | 0.07874 | 0.07874 | 0.016002 | no | yes |
| calisp3 | 0.07874 | 0.07874 | 0.07874 | 0.016002 | no | yes |
| thunder-lightning | 0.07874 | 0.07874 | 0.07874 | — | no | no |
| estesAlpha | 0.0248 | 0.0248 | 0.0248 | — | no | no |
| nasaStudent | 0.152 | 0.152 | 0.152 | — | no | no |
| spaceport | 0.102 | 0.102 | 0.088 | — | no | no |

## Trap

The unmodified calisp1 0.5 m case was reproduced through native `dispatch_json` with `RUST_BACKTRACE=1` (`baseline/trap.txt`): `integrate_rigid_adaptive`, `six_dof.rs:515`, panicked after exceeding 5,000 total adaptive trials. The WASM panic becomes `unreachable` and poisons the instance. This changes that limit path to return an error. The regression test forces the trial limit directly: it fails on base (exit 101, `baseline/test-trial-limit.txt`) and passes on the candidate. A WASM probe verifies 0.05 and 0.07874 m succeed, 0.5 and 1 m return errors, and a subsequent normal calisp1 run succeeds in the same instance (`recovery.json`). **Open:** that same-instance probe exercises the nozzle refusal, not the trial-limit error itself; a WASM input reaching the trial-limit path without the nozzle refusal has not been demonstrated.

## Measurements

Scratch build: `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs`, exit 0. Candidate SHA-256 `e50ced301fee734ca287988734344222e6f3ecf45d059bbc2c763ea8c940f2b9`. Baseline scratch SHA-256 `2528a27c22e5505f9f02e1f208ec658b1fe0e193cc71e3dd33054422addbc1f7`. Both built in this lane checkout; they are not the release WASM. The goal-worktree build remains the orchestrator's responsibility.

K3 cohort probe exit 0; `candidate-compare.cjs` exit 1 (`compare-final.log`). P1 **FAIL**: all-20 MAE 5.662656341451668% vs 5.623962788961215% ceiling. P2 **FAIL**: supersonic MAE 6.2209625343776% vs 6.066188324415789% ceiling. P3 MAE/count inequalities pass for frozen and fully blank arms, but the comparison also fails its frozen arm-C identity checks for supersonic and all. No result is self-accepted.

All apogee changes from the baseline scratch probe, metres (all unlisted rows and three templates were numerically unchanged):

| Flight | Arm | Before | Candidate |
|---|---|---:|---:|
| qu8k | default | 32495.715840496465 | 32491.734811094517 |
| qu8k | frozen C | 30231.166747590978 | 30227.51473759989 |
| qu8k | B without nozzle pressure | 29493.282348325854 | 29489.761542674696 |
| proteus6 | default | 22759.99263319612 | 22559.340084761283 |
| proteus6 | frozen C | 21513.21744781413 | 21314.953705176315 |
| proteus6 | B without nozzle pressure | 21221.643518502784 | 21037.770104254552 |

Templates, before and after: Alpha 304.0294885865904 m; NASA SL 546.5369328003885 m; Spaceport 5013.508465461415 m. [INFERENCE] The power-on base clamp is the likely source of the two affected designs; no isolated A/B test has established causality.

Wind probe exit 0: 23 designs × 0, 3, 6, 10 m/s = 92 runs, zero errors. Both full-metal-jacket flights used the normal ladder at 0 and cross-phase fill at 3, 6 and 10 m/s. `fixed/wind.json` records paths and outputs.

## Checks and remaining work

- `cargo test --offline --manifest-path crates/astraea-core/Cargo.toml -j 2 -- --test-threads=2`: exit 0.
- `cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 -- --test-threads=2`: exit 0 (`engine-test-final.log`). The first run failed one unrelated no-nozzle error-order test after validation was added; this was fixed without changing its assertion.
- New nozzle test fails on base (`--lib`, exit 101, `baseline/nozzle-test-final.log`) and passes on candidate (`nozzle-test-final.log`). New trial-limit test likewise fails on base and passes on candidate. **Open:** dedicated regression assertions for cross-phase fallback, reference-area scaling, pressure zero intervals, and the calisp1 trap recovery path have not been added and demonstrated against base.
- Template and wind probes exited 0; detailed outputs and logs are in `$HOME/astraea-evidence/goal-collegiate-accuracy/E1/`.
- Required next action: resolve the frozen benchmark failure under the existing no-tuning rule; finish the missing regressions and demonstrate recovery after the actual trial-limit path in the same WASM instance. Do not integrate this candidate as passing.

Final evidence SHA-256: cohort `96737d2dc5e3acaa9b3a6c6826c64891b7789edb35c5d86fa972acedc2e2dc44`; wind `32809913a2abb0fd6d855bdbb2e0695d26da99f1418e86ea8dee32f99b9b8f5e`; templates `a78b92dfec798e4008b1182c849f75980b6104dde9b6ab06078c66df18d4ae2e`.

## Clamp dropped under the frozen rule

The orchestrator directed the clamp be dropped after the candidate at `85ea449` failed P1/P2. Before editing the lane, an archive of that exact commit was built with **only** the two `cd_on` base clamps reverted. Scratch WASM SHA-256 `aad207377de92c0fa037fcdd18d2a5cd680366983b846cf2268843ea553e2f86`; `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs`, exit 0. K3 cohort probe exit 0. The 37,840-byte JSON `rows` portions of its `cand.json` and the pre-change scratch baseline match byte for byte; the default values are qu8k **32495.715840496465 m** and proteus6 **22759.99263319612 m** on both. This isolates the observed movements to the clamp. Evidence: `unclamp/cand.json` SHA-256 `8ae7663335b1605bbcd1bb7204978e8d93f5e9f464a1c9f67577244e123f4140`; `baseline/cand.json` SHA-256 `74902b59aea9eda2502ec108fafdae96e565cee9e989492adbbcdaced5edb5d2`. Rows were compared as raw UTF-8 bytes beginning at the `"rows"` key; metadata differs because the build path and hash differ.

The clamp was then removed from the lane. The nozzle input bound, trial-limit error, cross-phase fill, reference-area rescaling, positive-thrust pressure gate and cleanup remain. **Residual:** near the aft-body diameter, such as proteus6's nozzle-to-aft ratio 0.96, the power-on base term can be negative. This known physical limit is not fixed. No tuning or threshold change was made.

Production scratch build, `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs`, exit 0: WASM SHA-256 `36195432a5d5ba732f92c05305aec2755bd4a05d98e896790bb14ad9d25e455a`, built in this lane checkout, not the release goal-worktree path. K3 cohort probe and `candidate-compare.cjs` each exited 0: **P1, P2 and P3 PASS**, including frozen arm-C identity. The full `rows` bytes also match the baseline. All-20 MAE 5.623962788961215%, within ±10% 18; supersonic MAE 6.066188324415789%. `drop/cand.json` SHA-256 `a7e215e2a098423840d82955f60eaf2ac7d026544b571f315d945db016e8c102`; comparison log `drop-compare.log`.

Template probe exit 0: all compared baseline and candidate output fields were identical for Alpha III (304.0294885865904 m), NASA SL (546.5369328003885 m), and Spaceport (5013.508465461415 m). `drop-templates.json` SHA-256 `71ec49cc49fd07932c2f80b8b121a8b09f4c1c20b73a099fbe4d54f68fa435ff`. Wind probe exit 0: 92 runs (23 designs × 0/3/6/10 m/s), zero errors. Both full-metal-jacket cases use normal ladder at 0 and cross-phase fill at 3/6/10. `drop-wind.json` SHA-256 `3442974ee4d5c8914c8a50371a369dfeca4efc0f930153431eba468aa705b827`.

Regression evidence (all candidate checks exit 0):

| Test | Base `68e9877` | Candidate | Evidence |
|---|---|---|---|
| Full-metal-jacket 1 and 2 at 3 m/s | exit 101: missing powered ladder | exit 0, manifest reports cross-phase fill | `baseline/wind-test.log`, `wind-test.log` |
| Wider-nose synthetic reference-area force | exit 101: raw and solver force differ | exit 0, both powered and coasting station forces preserved | `baseline/area-test.log`, `area-test.log` |
| Pressure correction at zero thrust, including interior zero segments | exit 101: nonzero correction | exit 0; positive-thrust control changes as expected | `baseline/pressure-test-r2.log`, `pressure-test.log` |
| Trial limit and same WASM instance | exit 1: `unreachable` on injected trial limit | exit 0: returned trial-limit error, then same instance flies calisp1 to 1151.6179688019195 m | `baseline/hook-recovery.log`, `hook-recovery.json` |

The last comparison adds only the same feature-gated test injection to an archived `68e9877`; its original panic remains. The injection lowers the limit to one trial, then resets it to 5000 in the same WASM instance. The `e1-test-hooks` feature is absent from ordinary builds and is used only for this test; hook WASM SHA-256 `96cf52861f6aa48f160cea73e844067bfb8b1f195b1a1142367ec1df9d060d29`. JS test: `crates/astraea-engine/tests/e1_trial_limit.probe.ts`. Full-metal-jacket regression is explicitly ignored in ordinary suites because the published manifest is outside Git, and was run separately with `ASTRAEA_E1_MANIFEST` set.

`cargo test --offline --manifest-path crates/astraea-core/Cargo.toml -j 2 -- --test-threads=2` and the equivalent engine command both exited 0 (`drop-core-test.log`, `drop-engine-test.log`). The release WASM must still be rebuilt from the goal-worktree path and measured by the orchestrator. This author report is not self-acceptance; independent review and integration remain.

## Round 3 — independent review findings

Author changes on `8a93cb42d5fd325d2424e47e1485cf3a0b755ce4`; independent review of these changes remains required. The engine already rejected NaN and negative wind via `finite_opt` and the nonnegative check; those guards were retained. Nonfinite adaptive-stage loads and adaptive no-progress/rejection failures now return errors. No arbitrary upper wind limit was added: no physical upper cap was established in the repository. The native regression exercises `1e9`, `1e300`, NaN and -1; the WASM regression exercises the representable JSON values and confirms a subsequent normal flight on the same instance. JSON has no NaN, so NaN is tested natively.

The evidence seam now derives manifest text after constructing the ladder, and its full-metal-jacket test checks `cross-phase nearest fill`. Both-empty fallback now reports `legacy drag used (refused: ...)`; the app classifies that at `src/console/data/builtUpDrag.ts:45`. Its unit test clears baseline telemetry and checks the actual fallback and message.

### Motor-diameter proposal, measured first

All 23 default cohort and three template designs have either no declared exit or an exit no larger than the motor; none would be newly refused in those baseline runs. The R41 development manifest has 11 Mini DX3 entries, Cosmic Cargo, Top Shot and Adventurer; none declares a nozzle exit or option, so none would be newly refused under the measured inputs. Exact measured rows are in `round3-inventory.json` (SHA-256 `db5077ea665e3076aeda54690360da3e2ce3a3d6b2e6a78b7ff5cd40d6d70022`) and `round3-dev-inventory.json` (SHA-256 `e15cef56950056ad520d1e897330bb6c0be8b2d8962a2a90fe631399daf67bb2`) under the E1 evidence directory.

**Not implemented:** `min(aft,motor)` would reject the specifically required byrum equal-aft input: aft 0.07619999999999999 m, motor 0.038 m, exit set to that exact aft value. Those values are equal as represented, with no tolerance; the separately written literal 0.0762 is one representable step above that stored aft value. The requested exact-aft regression passed on both `8a93cb4` and this candidate. The geometric aft-only rule remains, with the previously recorded negative-base-drag residual. Other inputs with exits between the motor and aft diameters could also be newly refused by the proposal.

| Design | Aft m | Motor m | Declared exit m |
|---|---:|---:|---:|
| qu8k | 0.17018 | 0.203 | 0.1524 |
| proteus6 | 0.127 | 0.152 | 0.12192 |
| dontdebatethisn5800mindia | 0.10541 | 0.098 | 0.0631952 |
| kinsel-p4935-a-601-rocket | 0.1651 | 0.152 | 0.078486 |
| full-metal-jacket1 | 0.10795 | 0.098 | 0.0635 |
| full-metal-jacket2 | 0.10795 | 0.098 | 0.0635 |
| l500roc | 0.057404 | 0.054 | 0.0254 |
| torrent | 0.104775 | 0.075 | 0.041275 |
| rabia | 0.079375 | 0.075 | 0.0301752 |
| rabia-shortfincan | 0.081026 | 0.054 | 0.0301498 |
| blister | 0.079375 | 0.054 | 0.0333375 |
| raven | 0.04445 | 0.038 | — |
| iondrive | 0.0635 | 0.054 | — |
| cancerdescending | 0.1524 | 0.075 | — |
| byrum | 0.0762 | 0.038 | — |
| calisp4 | 0.07874 | 0.038 | 0.016002 |
| calisp5 | 0.07874 | 0.038 | 0.016002 |
| ezi65-1 | 0.1016 | 0.054 | — |
| calisp1 | 0.07874 | 0.038 | 0.016002 |
| gibb | 0.0762 | 0.038 | — |
| calisp2 | 0.07874 | 0.038 | 0.016002 |
| calisp3 | 0.07874 | 0.038 | 0.016002 |
| thunder-lightning | 0.07874 | 0.038 | — |
| estesAlpha | 0.0248 | 0.018 | — |
| nasaStudent | 0.152 | 0.054 | — |
| spaceport | 0.088 | 0.075 | — |

Development inventory (14 flights): Mini DX3 aft 0.040894 m / motor 0.038 m (11); Cosmic Cargo 0.0254 / 0.018; Top Shot 0.041656 / 0.024; Adventurer 0.0468376 / 0.038. All have no declared exit.

The 1 m exit's vacuum pressure term is π/4 × 101325 = **79,580.468906 N**, or 79.5805 kN; the comment now says approximately 79.6 kN. Powered/coasting table selection remains `t_stage < motor.burn_time` at `crates/astraea-core/src/six_dof.rs`.

### Verification and regression evidence

| Command or check | Exit | Result |
|---|---:|---|
| `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs` | 0 | Scratch WASM `c4f4dc319a17fecaf1883ee8eb048299cfd8d85d84af9c2018176a1f8d114498` from this lane path |
| K3 cohort probe with that WASM; `node docs/internal/execution-runs/K3-improved-default/candidate-compare.cjs <round3 evidence dir>` | 0 / 0 | P1/P2/P3 pass; raw `rows` bytes match baseline exactly |
| `vitest run --maxWorkers=2 --config docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.vitest.config.mjs` | 0 | All three template outputs identical to baseline |
| `ASTRAEA_E1_MANIFEST=<published manifest> cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 --test e1_wind -- --ignored --test-threads=2` | 0 | All three tests pass, including 23 × 4 winds 0/3/6/9, zero errors |
| `ASTRAEA_E1_MANIFEST=<published manifest> E1_WASM=<scratch WASM> vitest run --maxWorkers=2 --config crates/astraea-engine/tests/e1_extreme_wind.vitest.config.mjs` | 0 | 1e9, 1e300 and -1 return errors and same instance flies again |
| `cargo test --offline --manifest-path crates/astraea-core/Cargo.toml -j 2 -- --test-threads=2` | 0 | Core suite passes |
| `cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 -- --test-threads=2` | 0 | Engine suite passes; manifest-dependent tests deliberately ignored here, run separately above |
| New extreme-wind core test on `8a93cb4` | 101 | Panic at nonfinite stage load; candidate passes |
| New seam assertion on `8a93cb4` | 101 | Seam lacks cross-phase text; candidate passes |
| New both-empty manifest test on `8a93cb4` | 101 | Missing `refused:` marker; candidate passes |
| Exact-aft byrum test on `8a93cb4` | 0 | Existing equality behavior; regression protects it, not a new fix |

The 23-design sweep expands existing wind coverage rather than fixing a baseline defect, so it is not expected to fail on `8a93cb4`. NaN and negative input validation were already present there. Full raw logs and probes are in `$HOME/astraea-evidence/goal-collegiate-accuracy/E1/`. Round-3 cohort JSON SHA-256 `69bbc0a00874a5ecf18fcbec407414de40830c31c6f13ccb8e97328751c428f9`; template JSON SHA-256 `d1e7ca1c59d3bdc89e9d59ac517713394d7d5baa34d17af292b4899a130d2c01`. No release WASM was built; the orchestrator must rebuild and verify from the goal checkout. No self-acceptance.

## Round 4 — review findings; author report, not acceptance

Base `2af65270f7131acd02077dd0ad3ba416b164afc1`. Independent review is required. No cohort, template or development-vehicle value was edited, and no tolerance or threshold changed. No app source was edited. The scratch WASM was built in this lane, not the goal checkout; orchestrator rebuild and verification remain required.

- **F1:** Default preparation and the candidate use the same `validate_motor_placement` rule. The internal mechanics assertion also calls that rule; public default preparation now refuses before reaching it. The calisp1 1.55 m native regression returns the placement error without a panic. On the scratch WASM the error is `motor forward end -0.045050000000000257 m lies outside the vehicle (mount station 1.5049499999999998 m, motor length 1.55 m)`; a normal flight in that same instance then reaches 1151.6179688019195 m. The app's mount check rejects some motors with insufficient overlap but explicitly returns without a check when no mount exists; it is not a universal pre-filter for this case. Direct internal mechanics calls still assert on invalid placement; the input boundary must run first.
- **F2:** Both accepted-state validation failures now return `Err`. No end-to-end input was found that reaches these paths; no reachability claim or regression is made.
- **F3:** The ignored manifest sweep now runs 23 designs at 0, 3, 6, 9 and 10 m/s: 115 flights, zero errors.
- **F4:** The byrum test asserts the exact `0.07619999999999999` m aft diameter, accepts it, and verifies that its next representable value is rejected by nozzle validation.
- **F5:** The refusal now distinguishes the values: `simulate6DofFlight: options.nozzleExitDiameter 0.0762 m must be finite and within 0..=0.07619999999999999 m (aft-body diameter)`.

Commands ran from the lane root, with long processes detached and output recorded in `$HOME/astraea-evidence/goal-collegiate-accuracy/E1/round4/`. `free -h` showed 8.7 GiB available before the checks. Manifest SHA-256 was `3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5`.

| Command or check | Exit | Evidence |
|---|---:|---|
| `cargo test --offline --manifest-path crates/astraea-core/Cargo.toml -j 2 -- --test-threads=2` | 0 | `core-final2.log` |
| `cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 -- --test-threads=2` | 0 | `engine-final2.log` |
| `ASTRAEA_E1_MANIFEST=<manifest> cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 --test e1_wind -- --ignored --nocapture --test-threads=2` | 0 | `wind-final.log`; four tests, 115 wind flights |
| `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs` | 0 | `build-final.log`; SHA-256 `e8a237df8cd3c51063a27021c023cd5ad1379a15d669feb464ece58f4c04f8ea` |
| `ASTRAEA_E1_MANIFEST=<manifest> E1_WASM=<scratch wasm> ./node_modules/.bin/vitest run --silent=false --maxWorkers=2 --config crates/astraea-engine/tests/e1_motor_placement.vitest.config.mjs` | 0 | `wasm-verbose.log`; refusal followed by same-instance flight |
| Same WASM probe using round-3 scratch WASM `c4f4dc319a17fecaf1883ee8eb048299cfd8d85d84af9c2018176a1f8d114498` from `2af6527` | 1 | `base-wasm.log`: `internal failure ... unreachable` |
| `git archive 2af6527` into a temporary copy, copy the new test, then `ASTRAEA_E1_MANIFEST=<manifest> cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 --test e1_wind calisp1_motor_beyond_mount_returns_error -- --ignored --test-threads=2` | 101 | `base-native.log`: original mechanics panic; no production changes in archive |
| `L0_WASM=<scratch wasm> L0_WASM_SHA256=<scratch sha> K3_OUT=<output> ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/K3-improved-default/vitest.config.ts` | 0 | `cohort.log`, `cand.json` |
| `node docs/internal/execution-runs/K3-improved-default/candidate-compare.cjs <output>` | 0 | `compare.log`: P1/P2/P3 pass |
| `PROBE_OLD_WASM=<round-3 wasm> PROBE_NEW_WASM=<scratch wasm> PROBE_OUT=<output> ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.vitest.config.mjs` | 0 | `templates.log`, `templates.json` |
| Raw `rows` bytes vs E1 baseline and all old/new template output fields | 0 | `identity.log`: both identical |

The expanded sweep and boundary assertions protect existing behavior and are not claimed to fail at base. `core-final.log` records a failed intermediate run (exit 101): an initial refactor changed the internal assertion message. The message was restored through the shared rule, then the final core and engine suites, sweep and build above were rerun. Initial interrupted attempts from the preceding turn exited 130. Cohort JSON SHA-256 `1eb89f6045aeb2828fb53de008f02816cb58df723b41eb285831c6e001121258`; template JSON SHA-256 `ad88c2b08da4eceaea9fa8fd384cbcd27a131f454ba5351ed5ed4d9cd2695076`. No release WASM, push, or self-acceptance.

## Round 5 — zero-impulse refusal; author report, not acceptance

Base `0d564d90263bc0945f5220cfe8341ec67aeaf6ec`. Independent review remains required. The shared `validate_motor_spec` now checks the existing integrated-impulse rule; candidate validation reuses it rather than retaining a duplicate. The engine's shared frontend motor conversion invokes the validator before integration, including `simulate_flight`, `flight_summary`, `run_ensemble`, `run_ensemble_classified`, and `run_ensemble_chunk`. Geometry-only vehicle preparation remains independent of motor-curve validity. The internal `motor_impulse_total` assertion remains a guard for callers that bypass validation.

The native regression verifies all five dispatches return `motor thrust curve must deliver a finite positive total impulse (got 0)` without a panic. The WASM probe verifies the same five refusals and then flies normal calisp1 in the same instance to 1151.6179688019195 m. On the exact base, the new native regression exits 101 with `motor depletion: thrust curve delivers no finite positive impulse`; the WASM regression exits 1 with `internal failure in simulate_flight: unreachable`. The base WASM was the prior round-4 scratch build (SHA-256 `e8a237df8cd3c51063a27021c023cd5ad1379a15d669feb464ece58f4c04f8ea`); the native regression ran against a `git archive 0d564d9` copy with only the test copied in.

The byrum test now asserts both printed values, `0.0762` and `0.07619999999999999`. R4-3 remains the accepted reachability-test gap from round 4; no change was made for it. No cohort, template or development-vehicle number moved; no tolerance or threshold changed and no app source was edited.

All long commands were detached and logged under `$HOME/astraea-evidence/goal-collegiate-accuracy/E1/round5/`; `free -h` showed 7.7 GiB available before the run. The published manifest SHA-256 is `3bd280773404b406439dd4684ad0d5a7f484a8fd7e9f61aaf237b2afd1fe54f5`.

| Command or check | Exit | Evidence |
|---|---:|---|
| `cargo test --offline --manifest-path crates/astraea-core/Cargo.toml -j 2 -- --test-threads=2` | 0 | `core.log` |
| `cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 -- --test-threads=2` | 0 | `engine.log` |
| `ASTRAEA_E1_MANIFEST=<manifest> cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 --test e1_wind -- --ignored --nocapture --test-threads=2` | 0 | `manifest.log`: five tests including 115 wind flights, zero errors |
| `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs` | 0 | `build.log`; scratch WASM SHA-256 `22b286db4d22a10a72ffccaefa395d31dfd42de0b60ac153ac178928602931cf` |
| `ASTRAEA_E1_MANIFEST=<manifest> E1_WASM=<scratch wasm> ./node_modules/.bin/vitest run --silent=false --maxWorkers=2 --config crates/astraea-engine/tests/e1_zero_impulse.vitest.config.mjs` | 0 | `wasm.log`: five errors and subsequent normal flight |
| Same probe using round-4 base WASM | 1 | `base-wasm.log`: `unreachable` |
| `ASTRAEA_E1_MANIFEST=<manifest> cargo test --offline --manifest-path crates/astraea-engine/Cargo.toml -j 2 --test e1_wind zero_impulse_refused_by_all_legacy_commands -- --ignored --test-threads=2` in archived base | 101 | `base-native.log`: panic |
| `L0_WASM=<scratch wasm> L0_WASM_SHA256=<scratch sha> K3_OUT=<output> ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/K3-improved-default/vitest.config.ts` | 0 | `cohort.log` |
| `node docs/internal/execution-runs/K3-improved-default/candidate-compare.cjs <output>` | 0 | `compare.log`: P1/P2/P3 pass |
| `PROBE_OLD_WASM=<base wasm> PROBE_NEW_WASM=<scratch wasm> PROBE_OUT=<output> ./node_modules/.bin/vitest run --maxWorkers=2 --config docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.vitest.config.mjs` | 0 | `templates.log` |
| Raw cohort `rows` bytes against E1 baseline and all old/new template fields | 0 | `identity.log`: both identical |

The initial engine suite exited 101 (`engine-initial.log`) because validating during vehicle preparation rejected four geometry-only tests' dummy motors. Validation was moved to the shared motor conversion and the full suite and all evidence above were rerun. Its in-progress manifest run was stopped and retained as `manifest-interrupted.log`; it is not claimed as a pass. Cohort JSON SHA-256 `d58738fc356b60cd5bf6694d4ab23e4d6664fa5de5e99a9cbf0ac19f18a2c21a`; template JSON SHA-256 `6718bfbf5b349dd99b11574c6d19b4212a5e79f5a9e798e85a166a528d362ffa`. The orchestrator must rebuild the release WASM from the goal checkout and independently review; no push or self-acceptance.
