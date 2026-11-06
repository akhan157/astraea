# RMP19 — built-up aero model, slice 1b (panels + refusal)

Source: `aero-model/port` @ `d76c300`, merged to `main` as `1246fda` (2026-10-31).
Authored by the research session; reviewed and merged by the coordinator
(`REVIEW.md`).

## What shipped

- **Provider** in `crates/astraea-core/src/calibrated/` (13 files) plus the app
  adapter `crates/astraea-core/src/aero_model.rs`: per-component drag build-up,
  transonic endpoint blend, supersonic fin strips, nose CP caps, junction rule,
  cumulative booster composition.
- **Engine commands** `stability`/`aero_curves` accept an optional selection;
  absent ⇒ the legacy call and unchanged bytes. `aero_model_status` reports
  `panels`/`flight` separately, with reasons and assumptions.
- **Bridge**: optional selection on the read commands; `simulateFlight` refuses
  before invoking the engine when a selection is present.
- **Console**: beta checkbox (default off), model label and breakdown limitation,
  selection-aware Aero subtitle/paragraph/confidence text, and pre-run refusal
  for flight and Monte Carlo.
- **Identity**: project schema 1.13.0 persists the selection and pins it per case;
  unknown versions refuse replay.

## Verification (product repo)

- `calibrated_oracle_parity`: 216 points, worst residual **2.2162861179974333e-16**
  (1 ulp), assertion 1e-15.
- `calibrated_app_adapter`: 6/6 (adapter equivalence + refusal matrix + status).
- Engine lib: **58/58**.
- `tsc --noEmit` clean; full suite 137 files / 1755 tests (author run; coordinator
  re-ran the wording/panel tests 6/6).
- Production-CSP browser journey on a fresh build of `d76c300`: toggle, panel,
  refusal, persistence, legacy run — screenshots in `raw/`.
- Performance: 1.14 µs/evaluation native (allocation-free); WASM
  `aero_curves` 278.7 µs/call = 6.8 µs/evaluation, stability 35.2 µs/call;
  provider curves 1.55× the legacy call, inside the 2× budget.

## Limits and what is open

- Beta is off by default and **panels-only**. Flight and Monte Carlo refuse until
  the 1c data path exists.
- The default NASA Student Launch template uses the undefined `airfoil` fin
  section and refuses by design; the beta needs a supported section.
- The 36,936-row engine corpus has **not** been re-run against the product engine
  in this repo (hash manifest and harness commands exist) — RMP19-C08.
- No user-facing provenance page yet (C09); the panel carries the model label and
  the limitation.
- Default-on promotion is blocked on C08, held-out flights and the owner decision.

## Commands

```bash
cargo test -j 2 --manifest-path crates/astraea-core/Cargo.toml --test calibrated_oracle_parity
cargo test -j 2 --manifest-path crates/astraea-core/Cargo.toml --test calibrated_app_adapter
cargo test -j 2 --manifest-path crates/astraea-engine/Cargo.toml --lib
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node scripts/aero-model-beta-browser.mjs
```
