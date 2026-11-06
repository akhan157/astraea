# D3 four-case development replay — 2026-10-24

All four declared development cases completed through the existing production-WASM benchmark. This is a conditional development comparison, not independent validation or an accuracy pass. No calibration or input tuning was performed.

- Command: `node scripts/run-development-benchmark.mjs --data-root /workspace/astraea-data --out-dir /workspace/astraea-plan/evidence/development-replay`
- Scientific source `1745adb`; docs-only worktree HEAD `ffb8092`; baseline engine SHA-256 `e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985`.
- Exit 0; elapsed 2.278 s; largest child RSS 1,186,004 KiB (not aggregate RSS). Vite printed an unused HMR socket EPERM warning; the benchmark completed every case.
- All eight external raw/model/motor inputs independently SHA-verified against declared digests. Raw files and full residual reports remain outside git.

| Case | Observed / modeled apogee, m | Signed error, m | Time error, s | Full-overlap RMSE, m | Residuals |
|---|---:|---:|---:|---:|---:|
| cosmic-cargo-2986 | 291.740000 / 371.704216 | +79.964216 | +0.530941 | 144.809359 | 9591 |
| mini-dx3-g69n-2017-06-30 | 854.549472 / 1173.936844 | +319.387372 | +1.360527 | 292.424898 | 656 |
| top-shot-e12-2017-12-14 | 309.045864 / 301.626753 | -7.419111 | -0.689395 | 91.021897 | 347 |
| adventurer-j510w-2021-04-17 | 3197.291040 / 3040.356221 | -156.934819 | -1.351396 | 992.437099 | 1028 |

All recorded observed/modeled apogees, signed errors and timing differences match the old ledger to its published 0.001 precision. The original complete residual artifacts are absent, so per-observation residual equality is not claimed. Cosmic phase summaries also match the published rounding: powered 15.166 m / 736 points; coast 67.309 m / 2,149; descent 168.861 m / 6,706.

Only Cosmic has source-qualified burnout (1.887 s) for the powered/coast split. Mini DX3, Top Shot and Adventurer remain explicitly blocked for that split; accelerometer-integrated Raven velocity is a sensor diagnostic, not independent burnout evidence. Timing retains declared clocks, with unknown ignition/recorder offset. Full-overlap RMSE includes descent/recovery behavior.

Cosmic geometry/flown mass/weather remain uncertain. Mini DX3 per-flight mass/CG and conditions remain conditional. Top Shot and Adventurer retain source-informed positive point-load/aggregate reconstructions, ISA pressure-altitude atmosphere, unknown weather/rail/clock, and default recovery assumptions. Adventurer nominal Mach 1.0635 traverses transonic flight; this reproduction does not establish accuracy there. Parser qualification `ready` means declared channels/references are usable for this diagnostic, not that model inputs are fully measured.

No reserved Emerald Streak/Vulcanite/other holdout outcomes were selected or inspected. No fitted drag, mass or uncertainty changes were made. CPU lease released; no processes remain.

The adjacent `D3-development-replay-manifest.json` preserves the source and full
report SHA-256 digests. Raw logs, motor/model files and full residual reports
remain outside git in the external evidence directory. No replay was repeated
for this documentation amendment.
