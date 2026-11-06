# RMP19 — Built-up aerodynamic model port

## Purpose/status

Port the researched built-up aerodynamic method (per-component drag build-up,
transonic endpoint blend, supersonic fin strips, per-shape nose CP caps, junction
rule, cumulative booster composition) into Astraea as a selectable model behind a
beta flag. 1b is merged on `main` (`1246fda`): provider, engine commands, panels,
identity and pre-run refusal. Beta is **off by default**; promotion is an owner
gate.

## Dispatch — assignment prompt

Assignment prompt for the author lane: read this brief and
`execution-runs/RMP19-aero-model-port/REVIEW.md` first. Deliver one bounded
slice at a time on `aero-model/port`, rebased on the current `main`, with the
provider, tests and evidence for that slice only. Do not change the default,
the flight engine's coefficient source (before 1c), formats, stage composition
or the register. Report exact residuals and the commands that produced them;
the coordinator reviews and merges. Stop at the coordinator gate with
`REQUEST CHANGES` rather than widening scope.

## Prerequisites (closure versus early work)

- No vendor software, binary, sample rocket, motor database or engine-derived
  data ships. Formats are supported by our own readers/writers.
- The 6-DOF flight engine is untouched in 1b; its coefficient source changes only
  in 1c, behind the same selection and with held-out flights for promotion.
- Fixtures in the product repo are self-owned (TS-oracle parity); engine corpus
  data stays in the research repo as a hash manifest plus harness commands.

## Frozen decisions

- Adopt the method, not the software: semantic names in product code, provenance
  in documentation, no vendor field letters in user-facing strings.
- Identity is a closed registry `{modelId, modelVersion, terms.transonic}`. Absent
  selection = legacy path and keys unchanged. Unknown archived versions refuse
  replay; no substitution, no silent switch.
- 1b drives `stability` and `aero_curves` only. A flight or Monte-Carlo run with a
  selection refuses **pre-run** (before any engine call or case write), because
  the flight still consumes legacy coefficients.
- `terms.transonic` is `legacy` in every UI-reachable selection until the
  transonic override is promoted on held-out flights.
- Fin adapter: trapezoid planforms map exactly; freeform, elliptical and the
  undefined `airfoil` section refuse with the reason shown in the panel.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP19-C01 | TS-oracle ↔ Rust provider parity | 216-point fixture (3 self-owned designs, 2 methods × 12 Mach × 3 α), max relative residual ≤ 1e-15, measured value recorded | `calibrated_oracle_parity`, run evidence |
| RMP19-C02 | Panel semantics and units | Model id/version shown; component-breakdown limitation stated; drag split hidden when unavailable; CNα per radian and CP in axial metres asserted; refusal reason surfaced | component tests, browser evidence |
| RMP19-C03 | Identity and persistence | Selection persists on the envelope, pins into each case's inputs, survives save/reopen, and unknown versions refuse; legacy keys unchanged when absent | schema tests, browser evidence |
| RMP19-C04 | Pre-run refusal | Flight and Monte Carlo with a selection refuse before any case/archive/result or `simulate_flight` call; message names the model and how to proceed | store tests, browser evidence |
| RMP19-C05 | Legacy invariance | Absent selection ⇒ bridge omits the field/DTO additions; legacy panel and run results byte-identical | focused tests, browser legacy run |
| RMP19-C06 | Performance | Native ≤ 2 µs/evaluation and WASM curves ≤ 2× the legacy call; allocation-free hot path | `aero_model_bench`, `measure-aero-model-wasm` |
| RMP19-C07 | No vendor assets or data | No vendor binary/sample/motor data in the repo; parity fixture is self-owned; corpus is a hash manifest only | repository audit, manifest |
| RMP19-C08 | Engine corpus parity (native) | 36,936 rows / 40 designs reproduced by the product engine through the native harness, residuals recorded per tier | NOT RUN — needs the native lane |
| RMP19-C09 | User-facing provenance page | Published/derived/engine-observed terms with citations, fitted terms and limitations, reachable from the app | NOT RUN — repo README exists; product page pending |
| RMP19-C10 | Flight data path (1c) | `simulate_flight` consumes provider coefficients behind the same flag, with legacy transonic, no solver change | NOT RUN — planned slice |
| RMP19-C11 | Default-on promotion | Owner decision after C08 and held-out real flights; no default change before that | BLOCKED — owner + held-out flights |

## Negative/failure cases

- A selection must never be silently dropped, substituted or downgraded.
- A flight must never record `aero-buildup` while consuming legacy coefficients.
- Corpus/engine data must not enter shipped fixtures; hashes and commands only.
- No tuning to apogee or any measured outcome; no fixture retuning.

## Commands

```bash
# parity and adapter (product repo)
cargo test -j 2 --manifest-path crates/astraea-core/Cargo.toml --test calibrated_oracle_parity
cargo test -j 2 --manifest-path crates/astraea-core/Cargo.toml --test calibrated_app_adapter
# engine commands and provider
cargo test -j 2 --manifest-path crates/astraea-engine/Cargo.toml --lib
# TypeScript and browser
node node_modules/typescript/bin/tsc --noEmit
node node_modules/vitest/vitest.mjs run --maxWorkers=2
node scripts/aero-model-beta-browser.mjs        # production-CSP journey
node scripts/measure-aero-model-wasm.mjs         # WASM timings
```
