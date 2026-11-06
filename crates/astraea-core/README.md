# astraea-core — Rust compute engines (Tauri-ready core crate)

The TypeScript frontend in `src/` is the untouched oracle. These modules are
verified against it by parity tests; on any mismatch, **fix Rust, never `src/`**.

IPC rule: coarse-grained calls only (`run_ensemble`, `simulate_flight`,
`solve_chamber`, `stability`/`aero_curves`, `aggregate_mass`) — never
per-step serialization. `simulate_flight` is the one bounded exception: it
returns ONE display telemetry series (at most `telemetry::MAX_TELEMETRY_POINTS`
= 5000 points, decimated in Rust, keeping the first, terminal and event-time
samples with strictly increasing times). Ensembles return coarse metrics only
and never carry telemetry.

## Layout

```text
crates/astraea-core/
  Cargo.toml          # std only, no dependencies (offline-safe)
  README.md           # this file
  src/
    lib.rs            # module registration
    monte_carlo.rs    # oracle: src/sim/monteCarlo.ts
    six_dof.rs        # oracle: src/sim/sixDofSimulator.ts + src/dynamics/*
    telemetry.rs      # display series: oracle SixDofTelemetryPoint + decimation
    gibbs.rs          # oracle: src/propulsion/gibbsEquilibrium.ts + nozzleChemistry.ts
    aero.rs           # oracle: src/aero/barrowman.ts + transonicAero.ts
    mass.rs           # oracle: src/core/mass.ts
```

Each module is self-contained (own minimal types; small duplication
intentional, no cross-module deps) with `#[cfg(test)]` parity tests whose
anchors were extracted from the TS oracle via `node`, never hand-invented.

## Parity summary (`cargo test -p astraea-core`: 134 passed, 0 failed)

| Engine | Tests | Oracle anchors | Tolerance | Result |
|---|---|---|---|---|
| monte_carlo (`run_ensemble`, chunks) | 15 | mulberry32(42) first-5 exact; sub-seeds; 20k Gaussian bands; anisotropic clouds (xx=8/3, θ=0/90°); radial CDF {5,15,15}; chunk-partition equivalence | bit-exact RNG/order; 1e-9 float | 15/15 green |
| six_dof (`simulate_flight`) | 16 | zero-wind Estes Alpha/C6 on frozen pre-2026-10-11 drag tables: apogee 328.8253523345511 m, flight 89.69833984375896 s, landing 3.9873074760726985 m/s (live-aero IPC oracle after the body-friction correction and fin edge drag: 320.5894538955301 m, 87.5610156250079 s; `src-tauri` `ipc_flight_matches_zero_wind_alpha_c6_oracle`); rail validation + elevation-domain errors exact | apogee ≤0.5% rel, drift ≤5 m abs (observed: apogee rel <1e-6, time/vel ±0.05) | 16/16 green |
| telemetry (display series + decimation) | 7 | ECMAScript `parseFloat(x.toFixed(n))` reference values from `node`; cap/endpoints/event-keeping/strict-time repair on synthetic series | exact rounding; ≤5000 points, strictly increasing | 7/7 green |
| gibbs (`solve_chamber`, `solve_equilibrium`) | 15 | APCP chamber Tc 3522.814668872915 K, γ 1.1817718046095134, MW 24.60469503516949; all 60 `scripts/cea-corpus.json` cases | 0.01 abs mole frac / 0.5% rel MW (observed max: 0.00346 abs, 0.00200 rel) | 15/15 green |
| aero (`stability`, `aero_curves`) | 22 | Barrowman Alpha vehicle: CP 0.4841833975589611 m, margin 5.5071383219085766 cal, CNa 14.81220086077251; base-drag peak 0.38 @ M=1.0 | 1e-9 rel Barrowman; 0.5% rel transonic | 22/22 green |
| mass (`aggregate_mass`) | 16 | rollup mass 0.15084933084864577 kg, CG 0.5204404792069448 m; solid-cone centroid 3L/4; all fail-closed errors | 1e-9 rel | 16/16 green |

Known simplifications (documented in module headers): six_dof takes
precomputed vehicle geometry/aero tables (no mass/Barrowman/transonic
re-implementation inside the kernel) and records display telemetry only when
`SixDofOptions::record_telemetry` is set (off by default, no wire field), so
ensembles pay nothing; gibbs above the 2327 K Al2O3 melt diverges from CEA
solid-phase reference by design (fusion + liquid model, see corpus note).
