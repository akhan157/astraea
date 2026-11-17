# L0 benchmark results — awaiting independent review

G-1, G-2 and G-4 ran. This proves the WASM binary and its entry point with engine DTOs from the manifest, not the app’s TS RocketVehicle→DTO conversion. The archived baseline WASM is identified by SHA-256 `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`; its build path is recorded in spec Amendment 1. The manifest hash was asserted. No result is self-accepted.

G-3 was dropped by Amendment 2: the ensemble returns landing points only (`crates/astraea-engine/src/models.rs:1687`, `src/sim/monteCarlo.ts:366`). No product apogee interval was measured.

## Commands

- `free -h (before each run)`: exit 0
- `pnpm exec vitest run --config docs/internal/execution-runs/L0-benchmark-harness/vitest.config.ts > out/L0/vitest.log 2>&1`: exit 0
- `cargo test --offline -j 2 --manifest-path crates/astraea-engine/Cargo.toml --test l0_arm_c -- --test-threads=2` (author run; orchestrator later marked the test `#[ignore]`, so the rerun form is `--test l0_arm_c -- --ignored --test-threads=2` > out/L0/cargo.log 2>&1`: exit 0
- `node docs/internal/execution-runs/L0-benchmark-harness/summarize.cjs > out/L0/summary.log 2>&1`: exit 0

## Per-flight relative differences (WASM versus native)

| Flight | A | B | C |
|---|---:|---:|---:|
| qu8k | 0 | 0 | 0 |
| proteus6 | 0 | 0 | 0 |
| dontdebatethisn5800mindia | 1.2293369815266575e-16 | 0 | 0 |
| kinsel-p4935-a-601-rocket | 0 | 3.0956974640790901e-16 | 0 |
| full-metal-jacket1 | 1.6637112845318026e-16 | 0 | 0 |
| full-metal-jacket2 | 6.4298877587121665e-16 | 0 | 0 |
| l500roc | 0 | 0 | 0 |
| torrent | 2.1687333135335567e-16 | 0 | 1.1543115582551821e-16 |
| rabia | 3.3576614492676574e-16 | 3.7014139987913022e-16 | 1.2780310631761054e-16 |
| rabia-shortfincan | 1.4068455905310683e-16 | 0 | 3.1470699068071324e-16 |
| blister | 0 | 3.61540140689341e-16 | 0 |
| raven | 0 | 0 | 0 |
| iondrive | 0 | 0 | 0 |
| cancerdescending | 0 | 0 | 0 |
| byrum | 0 | 0 | 0 |
| calisp4 | 0 | 0 | 3.1544126288131132e-16 |
| calisp5 | 0 | 0 | 0 |
| ezi65-1 | 0 | 0 | 0 |
| calisp1 | 0 | 0 | 0 |
| gibb | 0 | 0 | 3.6831855994100735e-16 |
| calisp2 | 0 | 0 | 0 |
| calisp3 | 0 | 0 | 0 |
| thunder-lightning | 0 | 0 | 0 |

Maximum relative differences: A 6.4298877587121665e-16, B 3.7014139987913022e-16, C 3.6831855994100735e-16. None exceeds 1e-12.

## Regime results

MAE and bias are percentage points; count is within ±10%. Values are per-airframe median residuals.

| Source / arm | Regime | n | MAE | Count | Bias |
|---|---|---:|---:|---:|---:|
| native-A | subsonic | 8 | 7.020023422666 | 6 | 5.848695066582 |
| native-A | transonic | 7 | 7.569323699419 | 6 | 4.608301335556 |
| native-A | supersonic | 5 | 16.584467593584 | 1 | -5.689944591948 |
| native-A | all | 20 | 9.603389562259 | 13 | 2.529897346091 |
| native-A | qu8k residual | 1 | 29.696903259430 | 0 | -29.696903259430 |
| native-B | subsonic | 8 | 5.541437441112 | 7 | 2.851404029764 |
| native-B | transonic | 7 | 5.402402089750 | 7 | -0.663886219765 |
| native-B | supersonic | 5 | 6.066188324416 | 4 | -2.764136134896 |
| native-B | all | 20 | 5.623962788961 | 18 | 0.217167401264 |
| native-B | qu8k residual | 1 | 12.236585269340 | 0 | -12.236585269340 |
| native-C | subsonic | 8 | 4.505418193281 | 7 | -0.558222954095 |
| native-C | transonic | 7 | 5.191765141842 | 6 | -4.255852388568 |
| native-C | supersonic | 5 | 6.936313550333 | 3 | -6.509947329055 |
| native-C | all | 20 | 5.353363464540 | 16 | -3.340324349901 |
| native-C | qu8k residual | 1 | 18.352608753609 | 0 | -18.352608753609 |
| wasm-A | subsonic | 8 | 7.020023422666 | 6 | 5.848695066582 |
| wasm-A | transonic | 7 | 7.569323699419 | 6 | 4.608301335556 |
| wasm-A | supersonic | 5 | 16.584467593584 | 1 | -5.689944591948 |
| wasm-A | all | 20 | 9.603389562259 | 13 | 2.529897346091 |
| wasm-A | qu8k residual | 1 | 29.696903259430 | 0 | -29.696903259430 |
| wasm-B | subsonic | 8 | 5.541437441112 | 7 | 2.851404029764 |
| wasm-B | transonic | 7 | 5.402402089750 | 7 | -0.663886219765 |
| wasm-B | supersonic | 5 | 6.066188324416 | 4 | -2.764136134896 |
| wasm-B | all | 20 | 5.623962788961 | 18 | 0.217167401264 |
| wasm-B | qu8k residual | 1 | 12.236585269340 | 0 | -12.236585269340 |
| wasm-C | subsonic | 8 | 4.505418193281 | 7 | -0.558222954095 |
| wasm-C | transonic | 7 | 5.191765141842 | 6 | -4.255852388568 |
| wasm-C | supersonic | 5 | 6.936313550333 | 3 | -6.509947329055 |
| wasm-C | all | 20 | 5.353363464540 | 16 | -3.340324349901 |
| wasm-C | qu8k residual | 1 | 18.352608753609 | 0 | -18.352608753609 |

Native A and B match the printed §2 values at their stated precision; the full-precision all-20 B MAE matches exactly. The spec prints the other figures rounded, so 1e-9 pp cannot be established against those printed literals. Full per-airframe medians and flight values are in `out/L0/summary.json`.

## Output hashes

- `out/L0/cargo.log`: `8f08dce3b617349d3051a1bd4fb66bcfd23945944e221104f9a629103838ca6d`
- `out/L0/native-c.json`: `2ccf34b3db0af25cf626dd8ee0d7b619fd671d0f2097a4703bbf12b7c46d92cc`
- `out/L0/summary.json`: `134dbefdd918bfe1a51a46abd68108a14f1e61a715341d92073fd446e763eb4d`
- `out/L0/summary.log`: `5e68a45a2657245ef2372e140cbe77f063e9529e40c9e244edb83cbef05852af`
- `out/L0/vitest.log`: `aaa739fc90306e1bfbc40e281b5baf29da74c37033b976c18134fb24f4d2e70a`
- `out/L0/wasm.json`: `4194b0f5f080468d521482e8d5d7c5a140bdf549cef08140c618e4116c5011c9`

## Not done

No engine or app source, existing fixtures or assertions were changed. No candidate thresholds were written into the frozen spec; the orchestrator and independent reviewer decide acceptance. No commit was made.

## Per-airframe median residuals (%)

| Airframe | Native A | Native B | Native C | WASM A | WASM B | WASM C |
|---|---:|---:|---:|---:|---:|---:|
| blister | -4.846578021927 | -8.560601847546 | -11.465658287791 | -4.846578021927 | -8.560601847546 | -11.465658287791 |
| byrum | 8.048026888545 | -8.324967507532 | -12.835420249516 | 8.048026888545 | -8.324967507532 | -12.835420249516 |
| calisp1 | -4.685313424336 | -2.435166137858 | -5.725686663278 | -4.685313424336 | -2.435166137858 | -5.725686663278 |
| calisp2 | 0.452373541119 | 2.642031319389 | -0.976327159519 | 0.452373541119 | 2.642031319389 | -0.976327159519 |
| calisp3 | 1.975211595658 | 4.262400243625 | 0.840856257231 | 1.975211595658 | 4.262400243625 | 0.840856257231 |
| calisp4 | -3.913339823069 | -4.942077311494 | -6.986549614752 | -3.913339823069 | -4.942077311494 | -6.986549614752 |
| calisp5 | -1.603660428521 | -2.208675443655 | -4.506850540869 | -1.603660428521 | -2.208675443655 | -4.506850540869 |
| cancerdescending | 4.493273395201 | 1.922481254253 | -0.717130517190 | 4.493273395201 | 1.922481254253 | -0.717130517190 |
| dontdebatethis | -14.190563410208 | 2.882200473438 | 1.065915553195 | -14.190563410208 | 2.882200473438 | 1.065915553195 |
| ezi65 | 16.123860016335 | 6.194314162296 | 4.367378130612 | 16.123860016335 | 6.194314162296 | 4.367378130612 |
| full-metal-jacket | -6.430269740439 | 1.724018561427 | -1.492043509285 | -6.430269740439 | 1.724018561427 | -1.492043509285 |
| gibb | 6.093478012691 | 7.274043182089 | 3.519404079299 | 6.093478012691 | 7.274043182089 | 3.519404079299 |
| iondrive | 4.452784070666 | 6.662685052436 | 2.353947282236 | 4.452784070666 | 6.662685052436 | 2.353947282236 |
| kinsel | 27.236307504090 | -9.855904299790 | -13.981190687305 | 27.236307504090 | -9.855904299790 | -13.981190687305 |
| l500roc | -12.230270520370 | 3.648911438934 | -1.113984029693 | -12.230270520370 | 3.648911438934 | -1.113984029693 |
| proteus6 | -22.834926792815 | -12.219906848490 | -17.028433972185 | -22.834926792815 | -12.219906848490 | -17.028433972185 |
| qu8k | -29.696903259430 | -12.236585269340 | -18.352608753609 | -29.696903259430 | -12.236585269340 | -18.352608753609 |
| rabia | 2.395139640820 | -5.520654480609 | -9.410418800605 | 2.395139640820 | -5.520654480609 | -9.410418800605 |
| raven | 28.342261177673 | 4.973301288559 | -0.697184112416 | 28.342261177673 | 4.973301288559 | -0.697184112416 |
| thunder-lightning | 14.288650507446 | 11.276095721853 | 7.061142489600 | 14.288650507446 | 11.276095721853 | 7.061142489600 |
| torrent | 7.431502733253 | 4.948819203951 | 0.921747354222 | 7.431502733253 | 4.948819203951 | 0.921747354222 |

## Orchestrator addendum, 2026-11-15 (author text above unchanged)

- The author's "No commit was made" was true for the author run; the lane was committed by the
  orchestrator as `fd053c0`. The author's output hashes above are from the author run.
- After review, the orchestrator changed four things:
  - `cohort.probe.ts` writes `{wasm_path, wasm_sha256, manifest_sha256, rows}` and creates
    `out/L0`.
  - `summarize.cjs` hash-checks the manifest and native baseline, refuses a WASM file without
    provenance, asserts WASM-vs-native ≤ 1e-12 per arm and asserts native A/B reproduce
    `STEP0-BASELINE.json` to 1e-9 pp, then exits 1 on any failure.
  - `l0_arm_c` is `#[ignore]` and creates `out/L0`.
- **Rerun after the fixes, from an empty `out/L0`:** all three commands exit 0. Rows,
  summaries and max differences are identical to the author run. New output hashes:
  `wasm.json` `55ca56b9…c7fa`, `summary.json` `474947bf…1f68`, `native-c.json` unchanged
  `2ccf34b3…92cc`. Evidence: `astraea-evidence/goal-collegiate-accuracy/L0/SHA256SUMS`.
- **Guard test:** with flight 6 arm-B WASM apogee scaled by (1 + 1e-9), `summarize.cjs`
  exits 1 with "WASM-vs-native max relative difference B=1.0000000088404929e-9 > 1e-12".
- Arm C keeps `vehicle.nozzleExitDiameter` (spec §2; review finding 5a). "Blank inputs" means
  no nozzle *option*, no site temperature and no nose tip radius.
