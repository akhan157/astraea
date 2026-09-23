# astraea-core — Rust compute engines (Tauri-ready core crate)

The TypeScript frontend in `src/` is the untouched oracle. These modules are
verified against it by parity tests; on any mismatch, **fix Rust, never `src/`**.

IPC rule: coarse-grained calls only (`run_ensemble`, `simulate_flight`,
`solve_chamber`, `stability`/`aero_curves`, `aggregate_mass`) — never
per-step serialization.

## Layout

```text
crates/astraea-core/
  Cargo.toml          # std only, no dependencies (offline-safe)
  README.md           # this file
  src/
    lib.rs            # module registration
    monte_carlo.rs    # oracle: src/sim/monteCarlo.ts
    six_dof.rs        # oracle: src/sim/sixDofSimulator.ts + src/dynamics/*
    gibbs.rs          # oracle: src/propulsion/gibbsEquilibrium.ts + nozzleChemistry.ts
    aero.rs           # oracle: src/aero/barrowman.ts + transonicAero.ts
    mass.rs           # oracle: src/core/mass.ts
```

Each module is self-contained (own minimal types; small duplication
intentional, no cross-module deps) with `#[cfg(test)]` parity tests whose
anchors were extracted from the TS oracle via `node`, never hand-invented.

## Parity summary (`cargo test -p astraea-core`: 72 passed, 0 failed)

| Engine | Tests | Oracle anchors | Tolerance | Result |
|---|---|---|---|---|
| monte_carlo (`run_ensemble`, chunks) | 15 | mulberry32(42) first-5 exact; sub-seeds; 20k Gaussian bands; anisotropic clouds (xx=8/3, θ=0/90°); radial CDF {5,15,15}; chunk-partition equivalence | bit-exact RNG/order; 1e-9 float | 15/15 green |
| six_dof (`simulate_flight`) | 8 | zero-wind Estes Alpha/C6: apogee 388.72144947515324 m, flight 105.28801757814196 s, landing 3.987307476131326 m/s; rail validation + elevation-domain errors exact | apogee ≤0.5% rel, drift ≤5 m abs (observed: apogee rel <1e-6, time/vel ±0.05) | 8/8 green |
| gibbs (`solve_chamber`, `solve_equilibrium`) | 15 | APCP chamber Tc 3522.814668872915 K, γ 1.1817718046095134, MW 24.60469503516949; all 60 `scripts/cea-corpus.json` cases | 0.01 abs mole frac / 0.5% rel MW (observed max: 0.00346 abs, 0.00200 rel) | 15/15 green |
| aero (`stability`, `aero_curves`) | 18 | Barrowman Alpha vehicle: CP 0.4841833975589611 m, margin 5.5071383219085766 cal, CNa 14.81220086077251; base-drag peak 0.38 @ M=1.0 | 1e-9 rel Barrowman; 0.5% rel transonic | 18/18 green |
| mass (`aggregate_mass`) | 16 | rollup mass 0.15084933084864577 kg, CG 0.5204404792069448 m; solid-cone centroid 3L/4; all fail-closed errors | 1e-9 rel | 16/16 green |

Known simplifications (documented in module headers): six_dof takes
precomputed vehicle geometry/aero tables (no mass/Barrowman/transonic
re-implementation inside the kernel) and omits per-step telemetry (coarse
API only); gibbs above the 2327 K Al2O3 melt diverges from CEA solid-phase
reference by design (fusion + liquid model, see corpus note).
