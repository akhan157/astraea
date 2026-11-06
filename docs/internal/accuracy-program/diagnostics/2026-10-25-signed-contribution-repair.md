# Signed-contribution repair — 2026-10-25

This bounded repair preserves signed normal-force slopes and nose-datum first
moments in body/fin preparation and the existing flight Mach weighting. It keeps
zero/negative group slopes and their couples without dividing by group slopes.
The native and TypeScript loads reject undefined total CP before using the arm:
finite total C >= 1e-4 /rad and C > 64 epsilon sumAbs are required, with finite
first moment and derived CP. Equality at the absolute floor is accepted; this
reuses the old numerical floor, not its separate stability branch boundary.
Errors propagate to the flight command. Mach law, drag projection, and curve
model remain unchanged. This is method conformance, not empirical validation.

The independent review at `/workspace/astraea-plan/evidence/2026-10-25/` accepted
the algebra and requested two corrections. Both are complete: runtime manifests
now distinguish evaluable out-of-domain UNKNOWN continuation from undefined-CP
hard errors; native parity includes x/y/z force, removing actual thrust and
gravity for the controlled identity-attitude fixtures. Nonfinite-kinematics
handling is unchanged. The legacy top-level `unsupportedHandling` enum still
names classified-domain continuation; its detailed runManifest gives the error
policy, and no result is returned on an undefined-CP error.

Evidence is preserved in
`/workspace/astraea-plan/evidence/signed-contributions-20261025/`.
Before WASM: `e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985`.
Measured after WASM: `74e0a00f14c7b825509420630b1cc7d2a27701471772b8fb32a733190ee586a0`.
Final after WASM (manifest correction):
`d9b16c083635b4b41b832760a57a8ff396b9370117b8ee728928600081fabd0e`.
`final-source-artifact-manifest.json` binds final source and preserved artifacts.
The four flight replays were not repeated after the wording-only correction;
the measured after artifact remains distinct from the final contract artifact.

At M0.3/+5 degree pitch the controlled contracting tail changes CNalpha from
21.31599981169365 to 20.10711092280476 /rad, CP from 2.390571723078401 to
2.4466614450239343 m, body force z from -137.55957791160102 to
-129.9529542578075 N, and static pitch moment from 77.6033635915327 to
80.60116016238398 Nm. Nominal NASA coefficients/loads and both vehicle curves
are unchanged. The 72 native/TS local states cover M0/.3/.8/1.4/2/4 and signed
pitch/yaw incidence. Final CP/CNalpha/moment differences are zero; maximum
three-axis force difference is 1.1368683772161603e-13 N. M0 inspects coefficients
at zero load; these are local states, not claimed reachable flight conditions.

Frozen exposed development inputs are identical before/after. Cosmic Cargo,
Mini DX3 and Top Shot contain no negative slopes and inspected metrics are
identical. Adventurer retains its negative tail contribution: apogee changes
+0.0079215253 m, apogee time -0.0001953125 s, burnout altitude +0.0005630472 m,
burnout speed -0.0000148351 m/s; burnout time and rail-exit speed are unchanged.
All four terminate at touchdown; Cosmic stays PASS and others UNKNOWN. No
rail-exit time comparison is claimed from the coarse DTO. No holdout was read,
no threshold was tuned to apogee, and these deltas are not accuracy acceptance.

Existing completed checks: core six_dof 18 tests; engine 25 tests across unit
and parity paths; Vitest 57 across four focused files; TypeScript and WASM
checks passed. Final focused checks (one build worker, env.sh sourced):

- `cargo test --manifest-path crates/astraea-engine/Cargo.toml --offline undefined_normal_station_reaches_native_flight_command_as_error`: 1 passed, includes detailed manifest assertions.
- `cargo build --manifest-path crates/astraea-engine/Cargo.toml --offline --example flight_loads_diagnostic`: passed.
- `cargo build --release --locked --offline --target wasm32-unknown-unknown --manifest-path crates/astraea-engine/Cargo.toml`: passed.
- `node scripts/diagnostics/signed-contributions.mjs native-check /workspace/astraea-plan/evidence/signed-contributions-20261025 crates/astraea-engine/target/debug/examples/flight_loads_diagnostic`: passed, 72 states. Vite emitted a nonfatal denied HMR websocket-listen warning; diagnostic assertions and output completed with exit 0.

The competing curve/flight Mach laws and normal-versus-drag coefficient
semantics remain unqualified. This repair does not establish collegiate accuracy
or dynamic-stability qualification. No independent implementation-review fix
remains pending; integration checks remain the coordinator's responsibility.
