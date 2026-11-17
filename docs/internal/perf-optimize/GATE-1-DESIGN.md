# Perf lane — Gate 1 baseline and design note

Status: **Gate 1 only. No production code changed.** Awaiting orchestrator
approval before implementation. This note cannot self-accept.

- Worktree: `<lane-worktree>`
- Branch: `perf/optimize`
- Base: `main` @ `4916a4b48f35fad1e81d58c011acaca9ce9aa103`
- Lane head at this checkpoint: `c237bf5fa6763319c48dfd613e609778f2df5a61` (ASSIGNMENT commit)
- Date: 2026-11-09
- Machine: i7-1165G7 (8 threads), Intel Iris Xe (TGL GT2), 15 GiB RAM,
  Linux 7.2.11-1-cachyos, Wayland session
- Toolchain: Node 26.12.1, pnpm 12.14.0, rustc 1.99.1
- Browser probe: Chromium via Playwright 1.64.1 on the real GPU
  (`ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL ES 3.2)`)
- `free -h` before each measured run: ≥ 3.7 GiB available. Every compiler/test
  run used at most two jobs (`CARGO_BUILD_JOBS=2`, `--maxWorkers=2`).

Raw evidence (outside Git):
`<evidence-root>/perf-optimize/`, index
`SHA256SUMS` (`1146f63ba3aae78ba461643836880b79dcd1e6f289057c507662fe9f4cd255dc`).

## What was measured

All timings are wall clock. N=3 per surface unless stated. Medians are quoted in
prose; every individual sample is in the tables or in the evidence JSON.

### 1. Cold start / build

| Measure | Command | Samples (ms) | Median |
| --- | --- | --- | --- |
| Engine build, cold target | `env CARGO_BUILD_JOBS=2 pnpm build:engine` | 62,072 | 62,072 |
| Engine build, warm ×3 | same | 1,271 / 1,116 / 970 | 1,116 |
| Full build ×3 | `env CARGO_BUILD_JOBS=2 pnpm build` | 9,473 / 11,802 / 10,881 | 10,881 |
| App: shell visible | `node scripts/perf/measure-ui.mjs --out <e> --label baseline-gpu --runs 3 --gpu` | 239 / 203 / 202 | 203 |
| App: first committed 6-DOF result | same | 686 / 393 / 393 | 393 |
| App: FCP | same | 332 / 204 / 204 | 204 |
| Dev server ready (engine + Vite) | `node scripts/perf/measure-dev.mjs --out <e> --runs 3 --port 5199 --gpu` | 637 | 637 |
| Dev app: shell visible | same (3 loads, one server) | 1,691 / 666 / 669 | 669 |
| Dev app: committed result | same | 2,098 / 901 / 909 | 909 |

Bundle (production `dist`, after `pnpm build`):

| Artifact | Raw bytes | Gzip (build log) | SHA256 |
| --- | --- | --- | --- |
| `three-*.js` | 937,124 | 252.01 kB | `5b633baf476cad6e5b1766b5bb8941f235c38814e15a675122c6e41e6bd4bf4d` |
| `app-*.js` | 832,575 | 242.09 kB | `53d9a207b234d5739b4cfb99ad6ba0e906ee789214e9725f4e945ab12e7769eb` |
| `vendor-*.js` | 407,514 | 131.39 kB | `dcdb7d5eb0e0afa406c09bf5e3964ee528fd351e1f9a4602d96aa1d4d620cb13` |
| `react-*.js` | 181,670 | 57.14 kB | `97949cf1a978ca973953831ce6a0168bd8c69a15f94fdd5e781edea4247fd585` |
| `astraea_engine-*.wasm` | 2,003,935 | 647.38 kB | `6dc1b10b21ee4d4cb310589412d9c45e2290c2e7a8e1674b29ee91fda0484d9e` |
| `dist/` total | 5,867,520 | — | — |

Full `dist/` hashes: `bundle-hashes.txt` in the evidence root.

First-load JS raw total is 2,364,281 B (~682.6 kB gzip); with the wasm the
workstation first load is ~1.33 MB gzip / ~4.3 MB raw. The workstation (`/app/`)
loads all of it, which its default 3D Airframe stage and on-load flight use.

Input data hashes (pinned, outside Git):

- `<data-root>/cosmic-cargo-2986.csv` `adce6e39cf0fa9919c0349c83725ffe431b44a8b03db5ccbb71d6a7aad4066b8`
- `<data-root>/dofpro/G69_30JUN2017_G69N-P_1_FIP.csv` `9fa2c518448d18b553d0cb2e17b443e92a7fcf3beeacf95e1c90749f42d8da51`
- Engine wasm `6dc1b10b21ee4d4cb310589412d9c45e2290c2e7a8e1674b29ee91fda0484d9e` (2,003,935 B)

### 2. UI responsiveness (real GPU)

| Interaction | Samples per run (ms) | Note |
| --- | --- | --- |
| First switch to Aero | 31 / 25 / 24 | settled repeats 18–32 |
| First switch to Flight | 59 / 49 / 49 | settled repeats 20–31 |
| First switch to Verify | 35 / 29 / 31 | settled repeats 23–32 |
| First switch to Airframe | 43 / 35 / 35 | settled repeats 20–32 |
| Canvas cadence, 120 frames | median 16.7, p95 16.8 | 60 fps; max 33–50 ms |
| Scrub drag, 40 moves, 4,999-point chart | median 16.7, p95 16.8 | 0 long tasks |

Controls that explain why earlier headless numbers must not be ranked:
with SwiftShader the same scrub took 117–200 ms median with 27–41 long tasks
per drag; with WebGL disabled (app's SVG 2D fallback) it returned to 16.7 ms and
0 long tasks. The stalls are software-GL raster cost, not chart code. Raw
`ui/baseline/` (SwiftShader) and `ui/baseline-2d/` (no WebGL) are retained.

### 3. Flight-sim engine

| Measure | Command | Samples (ms) | Median |
| --- | --- | --- | --- |
| `benchmark:flight`, all 4 cases | `pnpm benchmark:flight -- --data-root <data-root> --out-dir <e>` | 1,850 / 1,061 / 1,058 | 1,061 |
| App on-load run (`durationMs` in footer) | browser probe | 473 / 206 / 204 | 206 |
| App warm re-run wall | browser probe (Ctrl+Enter) | 246 / 217 / 218 | 218 |

Per-case wall (same module/inputs as `benchmark:flight`, timed per case by
`scripts/perf/measure-flight.mjs`; N=3):

| Case | Samples (ms) | Residuals |
| --- | --- | --- |
| `mini-dx3-g69n-2017-06-30` | 144.8 / 111.7 / 112.8 | 656 |
| `cosmic-cargo-2986` | 194.4 / 188.5 / 191.7 | 9,591 |
| `top-shot-e12-2017-12-14` | 76.9 / 68.5 / 61.4 | 347 |
| `adventurer-j510w-2021-04-17` | 223.9 / 192.7 / 206.2 | 1,029 |

`crates/astraea-engine/Cargo.toml` already sets `opt-level = 3`, `lto = true`,
`codegen-units = 1`, `strip = true`; the wasm is 2.0 MB. In-browser
`WebAssembly.compile` of the shipped bytes measured 2.3–2.4 ms (GPU run) and
`compileStreaming` 7.6–8.0 ms, so module compile is not a hotspot.

### 4. Test/build

| Measure | Command | Samples (ms) | Median |
| --- | --- | --- | --- |
| Test suite ×3 | `env CARGO_BUILD_JOBS=2 pnpm test --maxWorkers=2` | 260,258 / 232,115 / 228,016 | 232,115 |

Each run: 168 test files, 1,967 tests, all passing. Vitest reports ~445 ms
worker spawn per file and estimates ≥ ~37 s could be saved with
`isolate: false`; that changes test isolation semantics and is not proposed here.

## Ranking and the one chosen hotspot

| Rank | Surface | Measured user-facing cost | Bounded headroom | Decision |
| --- | --- | --- | --- | --- |
| 1 | Public landing entry `/` | 1,493.2 kB decoded / 434.0 kB transfer JS, 6 scripts, on a page with **0 canvases** | 99.9% of that JS can be removed; mechanism validated | **chosen** |
| 2 | Workstation cold start `/app/` | FCP 204 ms, shell 203 ms, first result 393 ms; first-run longest task 238 ms (warm 73 ms) | 3D shader/program setup is driver-specific, fix not bounded | not chosen |
| 3 | Flight engine | 61–224 ms per case; 206 ms in-app | already `opt-level=3` + LTO + `codegen-units=1` | not chosen |
| 4 | UI | 60 fps, 0 long tasks, stage switches 24–59 ms | no real-GPU hotspot found | not chosen |
| 5 | Build / test | 10.9 s / 232 s | developer-only; test isolation change is risky | not chosen |

### Chosen hotspot: the public landing entry ships and executes the workstation's 3D stack

Evidence:

1. `dist/index.html` (landing) preloads `three-*.js`, `react-*.js` and
   `vendor-*.js`:

   ```html
   <link rel="modulepreload" crossorigin href="./assets/three-mlv99RC0.js">
   <link rel="modulepreload" crossorigin href="./assets/react-BsCGDdll.js">
   <link rel="modulepreload" crossorigin href="./assets/vendor-O2rVkaM2.js">
   ```

2. The landing entry imports `vendor`; `vendor` imports `three` and `react`:

   ```js
   // dist/assets/landing-GH7vVJOA.js
   import "./modulepreload-polyfill-P2Xu9kJm.js"; import "./vendor-O2rVkaM2.js";
   // dist/assets/vendor-O2rVkaM2.js
   import { _ as o, g as s, h as c } from "./three-mlv99RC0.js";
   import { n as l } from "./react-BsCGDdll.js";
   ```

3. `vite build --manifest` confirms the entry graph:
   `index.html → [_modulepreload-polyfill, _vendor]`, `_vendor → [_three, _react]`.
   `src/landing/main.ts` imports only fonts and CSS; the page has no canvas and
   no React/three consumer.

4. Measured landing load, N=3
   (`node scripts/perf/measure-landing.mjs --out <e> --runs 3`,
   `ui/landing/summary.json`): **1,493.2 kB decoded / 434.0 kB transfer JS,
   6 scripts**, identical in all three runs; FCP 48–236 ms (median 104),
   load 81–139 ms (median 117). Precise coverage shows three at 65.4%,
   vendor 55.7%, react 50.6% "executed" bytes (module top-level definitions),
   none of it used by the page.

Root cause: `vite.config.ts` declares global `codeSplitting.groups`
(`three`, `react`, `vendor`). Rolldown's `entriesAware` defaults to `false`, so
one shared group chunk is created across both entries; its own documentation
warns that an entry then "loads `moduleY` unnecessarily". The landing entry is
linked to `vendor`, which pulls in `three` and `react`.

User-visible effect: every visit to the public site downloads 434 kB of JS
(1.49 MB decoded, ~915 kB of it three.js) and parses/executes it for a page
that only needs 1.4 kB of JS. On mobile, slow links, or low-end CPUs this is
pure delay before the page is interactive; on localhost it is hidden by the
fast network and CPU.

### Mechanism check (throwaway build, no tracked-file edit)

A temporary config added `entriesAware: true` to the three groups and built to
`<test-dist>`:

- Landing manifest imports only `_modulepreload-polyfill`; `dist/index.html`
  preloads only the polyfill.
- Landing measured with the same probe: **1.4 kB decoded / 2.0 kB transfer JS,
  2 scripts**, load 21–71 ms (FCP 64–220 ms, unchanged; image/CSS-bound).
  Retained at `ui/landing-after-entriesaware/`.
- App-entry chunks keep their contents and sizes:
  `three 937.12 kB`, `react 181.67 kB`, `vendor 407.52 kB`, `app 832.62 kB`;
  the app still imports three/react/vendor and the same wasm hash.

## Expected improvement and falsifier

Expected, measured on identical inputs and machine:

- Landing `/`: JS **1,493.2 kB → 1.4 kB decoded** (−99.9%),
  **434.0 kB → 2.0 kB transfer**, **6 → 2 scripts**; `load` 81–139 ms → 21–71 ms
  on localhost; FCP unchanged (CSS/images dominate).
- Workstation `/app/`: expected unchanged (same chunk contents/sizes, same wasm
  hash). This must be re-measured, not assumed.

Falsifier (reject the change if any hold):

- Production `dist/index.html` still preloads a `three`/`react`/`vendor` chunk,
  or the landing probe still decodes > 10 kB JS / fetches > 2 scripts.
- `/app/` no longer loads three, React or the 2,003,935-byte wasm, or its
  committed-run median regresses > 10% across N=3.
- `pnpm test --maxWorkers=2` no longer reports 168 files / 1,967 passing tests.
- Engine wasm SHA256 changes (build identity must stay
  `6dc1b10b…4d9e`).

If the landing bytes drop but the app regresses, the change is rejected as
regressive, not declared a win.

## Implementation plan (after approval)

1. `vite.config.ts`: add `entriesAware: true` to each
   `build.rolldownOptions.output.codeSplitting.groups` entry. No source,
   dependency, physics, threshold or schema change.
2. `pnpm build`; assert `dist/index.html` has no three/react/vendor preload and
   that `dist/app/index.html` still has them.
3. Run `scripts/perf/measure-landing.mjs` (N=3) and
   `scripts/perf/measure-ui.mjs --gpu` (N=3) against the new build; compare to
   `ui/landing/summary.json` and `ui/baseline-gpu/summary.json`.
4. Add a regression-capable budget check for the landing entry (static
   `dist/index.html` + manifest assertion: no three/react/vendor preload, landing
   JS < 10 kB). It fails if the graph regresses.
5. Re-run the full test suite and record exact commands. Then write
   `RESULT.md`/`EVIDENCE.json`; no self-acceptance.

## Deliberately not done

- No production code, config, dependency, physics, threshold, tolerance or
  schema edit before Gate 1 approval.
- No edits to the register, manifest, board or handoff.
- No commit of raw traces; they stay under
  `<evidence-root>/perf-optimize/` with `SHA256SUMS`.
- No push.
- WebKit/WebKitGTK (the Linux Tauri webview) was not measured: Playwright WebKit
  needs missing system libraries whose install requires sudo, which is outside
  this lane's authority. Recorded as an external blocker, not a result.
- The native Tauri binary was not rebuilt or launched in this gate; frontend and
  engine were measured separately.
- Windows blank-window startup diagnosis is a separate packaging lane
  (`docs/internal/windows-startup-diagnosis-2026-10-24.md`) and is not mixed in.
