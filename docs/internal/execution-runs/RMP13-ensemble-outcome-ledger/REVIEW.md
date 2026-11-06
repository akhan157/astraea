# Ensemble outcome ledger — independent coordinator review

Reviewer: coordinating OpenAI GPT session, independent of the DeepSeek author
family. Scope: bounded RMP13-C05/C06 software ledger and consumer repair; no
empirical coverage, probability or release qualification. **ACCEPT** for this
bounded software increment after one focused rework and independent
production-CSP browser proof.

## Contract review

Approved design: strict eligible-only footprint (`supported-nominal-terminal`
only), five always-emitted counts, every finite endpoint retained, no fabricated
statistics at zero eligible, `classified-v1` persisted policy with optional
fields (schema stays 1.11.0, absence means the exact legacy meaning), a
separate classified whole entry point with the legacy `run_ensemble` contract
untouched, native validity/termination vocabulary carried unchanged, and the
old research accuracy pin left untouched.

Review of `4d7e377` found one contract-mandated defect: `classify_observation`
omitted `off_nominal_excursion`, so a `PASS` + enveloped + touchdown-nominal
run with an excursion could enter the qualified footprint. The author fixed
this in `37c334c` with the condition in both the Rust and TS classifiers plus
regression tests (excursion ⇒ unsupported; valid timeout ⇒ time limit).

## Integrated verification

- Merged `rmp13-ensemble-outcome-ledger` as `acfb002` (base `a68c03e`, branch
  head `37c334c`; author source `4d7e377`).
- Rebuilt the shipped engine in the merged tree with
  `PATH=$HOME/.cargo/bin CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs`;
  integrated WASM identity `9adeaf2cad80fd657e45ad9fa3725025341f62df7b9d660a75a5c446df394675`.
  The author's `08394e52…` predates the excursion rework and is superseded; the
  previous production `b32e7b7c…` is preserved in evidence, never reused.
- `tsc --noEmit` clean; focused merged-tree suite 132/132 across 11 files
  (sim, engine, ensemble determinism, console data, calibration binding,
  project jobs, store, SavedRuns, runCases, livePreview, applicability).
- Production-CSP Chromium at 1440×1000 with the two-worker cap:
  - wind 15 m/s, 2 runs, zero sigmas, seed 123: "No supported footprint", all
    five counts shown, no rings; archive
    `runsRequested 2 / runsEligible 0 / runsUnsupportedNominal 2 /
    statisticsAvailable false`, null sigmas/radii, no snapshot.
  - wind 3 m/s same settings: 2 supported, rings drawn; archive eligible 2,
    `statisticsAvailable true`, dispersion snapshot recorded.
  - Saved file re-imported: Saved Runs shows both outcome ledgers with the new
    engine SHA; legacy historical flights keep their recorded `b32e7b7c…`
    identity and are not rewritten.
  - Old-SHA-bound calibration artifact opened against the rebuilt engine:
    retained and displayed "INPUT-COMPATIBLE · ENGINE VERIFICATION REQUIRED";
    Run refused with the different-engine reason and no additional
    `simulate_flight` call; fit SHA not rewritten.
  - No browser runtime errors. Preview server and browser stopped immediately.
- External evidence: `evidence-rmp13-ensemble-outcome-ledger/coordinator-browser.json`
  and `coordinator-ledger-browser.astraea.json`.

## Disclosure

Observed tool waits in the browser session timed out while the real save had
already completed; disposition was confirmed from the app status and the
captured file bytes. A first panel inspection preceded value edits. No
`waitForFunction` success is claimed.

## Remaining scope

RMP13-C05's probability/coverage assessment is untouched: every footprint here
is scenario-only with no empirical coverage, and the supplied probes are
declared synthetic conditions (the 100 m canopy and rail-95° scenarios are
explicitly artificial). RMP13-C01/C02/C04/C07, physical qualification and
release gates remain open. This record accepts the ledger repair, not a
product or accuracy promise.
