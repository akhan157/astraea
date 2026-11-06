# RMP12d — ensemble seed/chunk/cancellation determinism on shipped WASM (RMP12-C05)

Base 4866831. Author omp (anthropic/claude-opus-5-5); serial MiMo no-tools review.
Goal increment 3. Software determinism tests only — NOT a rerun of RMP12a/b/c
numerical studies, no new numerical budget, no default change, no Rust/WASM
rebuild. Lease: new src/engine/ensembleDeterminism.test.ts, this directory,
TASKS, RMP12 package notes. Read-only: adapter.ts, sim/monteCarlo.ts, bridge.ts.

Existing: TS-oracle partition invariance (sim/monteCarlo.test.ts), WASM chunk ≈
oracle within 1e-9 (engine.test.ts), store-level cancel discards partial cloud
and ensemble-restart late chunks (RMP15d). Missing: bit-level determinism of the
shipped WASM itself and of the app's ensemble host under reordered completion,
plus host-level cancellation on real bytes.
