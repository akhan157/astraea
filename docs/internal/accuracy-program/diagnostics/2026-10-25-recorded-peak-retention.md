# Recorded pressure peak retention — PK1, 2026-10-25

Native display decimation now keeps the first recorded sample attaining the
largest finite nonnegative dynamic pressure. It shares the existing 5,000-point
budget with endpoints and event-nearest samples. Invalid pressure entries remain
unchanged and do not define the peak; no qualifying pressure means no peak
guarantee. Solver equations, recording cadence and rounding are unchanged.

A successful series keeps every forced sample and strictly increasing timestamps.
An insufficient cap or conflicting forced timestamps returns an explicit error.
This narrows support: endpoint/event/peak conflicts that previously could silently
discard required samples now fail. Ordinary stride collisions still drop the
lower-priority sample. An event and peak at the same index share one obligation.

This supersedes only the decimation-loss finding in the historical
[collegiate output audit](collegiate-output-contract-audit.md). “Sampled Max-Q”
remains necessary: no continuous-time peak magnitude/time error bound or flight
accuracy claim follows from retaining a known recorded display sample.

## Native evidence

Baseline: `c00b1d5`. Existing inputs only; no holdouts or solver changes.

| Input | Baseline sampled peak | Retained sampled peak |
|---|---:|---:|
| Synthetic 30,001-point series, 1,234 Pa spike at 0.04 s, cap 5,000 | 0 Pa | 1,234 Pa at 0.04 s |
| Existing Alpha/C6 fixture, wind 0 m/s | 5,515 Pa at 1.85 s | 5,515 Pa at 1.85 s |
| Existing Alpha/C6 fixture, wind 3 m/s | 5,573 Pa at 1.85 s | 5,573 Pa at 1.85 s |

The synthetic spike and forced-time conflict regressions fail under the baseline
decimator and pass with the repair. All 14 focused telemetry tests and both engine
telemetry parity tests pass. Tests cover equal maxima, small caps, event overlap,
invalid pressures and collisions with stride/event/endpoint samples.

Alpha coarse metrics are exactly unchanged before/after. Wind 0 apogee is
337.1860421128124 m at 7.867890624999877 s; duration 87.50030273438284 s; max Mach
0.30088495976853985. Wind 3 apogee is 327.9602192973141 m at
7.765390624999879 s; duration 85.34635742188176 s; max Mach 0.30244014264550506.
Both landing masses are 0.05803508529158387 kg. Existing parity assertions also
verify recording-on/off equality and complete flight-summary equality apart from
telemetry. These controlled checks establish implementation behavior only.

Commands use `env.sh`, `CARGO_BUILD_JOBS=1`, offline Cargo, engine `--locked`, and
single-threaded final test execution. Logs are retained outside Git under
`/workspace/astraea-plan/evidence/peak-retention-20261025/`.

## Integrated verification

Integrated as `ad8448b`. Full core: 118 tests passed; engine unit/parity: 25
passed; actual WASM/adapter: 11 passed. Release WASM and production Vite bundle
built successfully. WASM SHA-256: `c1a1a177d56b73e4f5862d29098743e0bc31f51499d1c7534776b34ba2e8c4fe`.
The full frontend/browser/native desktop suites were not repeated for this
narrow change; earlier results retain their original source/artifact boundaries.
Exact commands, exits and timings: external `integrated-manifest.json` beside
the logs above. Nothing was pushed or released.
