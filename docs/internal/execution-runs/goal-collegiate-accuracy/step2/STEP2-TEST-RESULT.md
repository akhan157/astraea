# Step 2: full tests on the merged candidate

| | |
|---|---|
| Source | `goal/collegiate-accuracy` @ `35ca8cd`. The desktop pin fix `627924d` was applied before the native smoke |
| Run by | The orchestrator, 2026-11-16 UTC |
| Evidence | `astraea-evidence/goal-collegiate-accuracy/step2/`, `SHA256SUMS` sha256 `da239ffa092f50b9…` |
| Script | `out/step2.sh` (scratch, gitignored); the commands are listed below |

| Check | Command | Result |
|---|---|---|
| Engine WASM build | `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs` | exit 0. sha256 `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`, identical to the step-0 baseline (P10 identity) |
| TypeScript | `pnpm exec tsc --noEmit -p .` | 0 |
| Production build | `pnpm exec vite build` | 0 |
| Unit and integration | `pnpm exec vitest run --maxWorkers=2` | 0. 193/193 files, 2234/2234 tests |
| Core engine | `cargo test --offline -j 2 --manifest-path crates/astraea-core/Cargo.toml -- --test-threads=2` | 0. 273 passed, 0 failed |
| Engine | `cargo test … crates/astraea-engine … --lib --tests -- --test-threads=2` | 0. 157 passed, 0 failed, 8 ignored (harness tests that need external inputs) |
| ARCAS runtime | `pnpm test:arcas-runtime` | 0 |
| ARCAS benchmark | `pnpm benchmark:arcas` | 1, the **retained red only**: CA transonic ARCAS-short MAE 15.717557349012338 %, equal to the P6 limit. Nothing new failed |
| Full browser smoke | `node scripts/browser-smoke.mjs`, started at load average 5.6 | **0, 54 passed lines.** Flight free region 239.6 px at 1280×800 and 479.6 px at 1600×1000. This also closes T1's owed clean run |
| Native desktop smoke (Linux) | `cargo build --offline -j 2 --features tauri/custom-protocol` (debug binary sha256 `f6670727…`), then `ASTRAEA_SMOKE_OUT=… xvfb-run …/astraea-workstation`, then `node scripts/macos-smoke-check.mjs` | App exit 0, check exit 0. Apogee **546.5369328003885 m** (identical to the browser value), Mach 0.2915, rail exit 18.90 m/s, touchdown, wasm-worker pool, no page errors, validity PASS |

## Defect found and fixed at step 2

K3 updated the browser-smoke pin but missed `scripts/macos-smoke-check.mjs`. That script is used by the packaged-app smoke and the release workflow, and it still pinned 533 ± 2 m. The matching text in `docs/internal/hosting.md` was also stale.

The fix is commit `627924d`: the pin is now 547 m, matching the owner-approved K3 default. The checker's tests pass 10/10, and its 540 m drift case still fails.

## Not run, and why

- **Windows and macOS native smoke:** no host is available. Recorded as not run.
- **T1 negative control:** the deliberately-too-short layout check was not run. The clean full smoke now passes, and T1's wait only adds a settle step before the unchanged 220 px assertion. This stays open as low priority.
- **Installer bundles (deb, rpm, msi, dmg), signing and updater:** not run; these are release steps outside this goal.
- **The Xvfb WebGL renderer string ("Apple GPU")** is a WebKitGTK software stub, not hardware evidence.
