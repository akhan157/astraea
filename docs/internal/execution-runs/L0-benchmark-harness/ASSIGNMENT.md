# Lane assignment: L0 benchmark harness (tests-only)

## Pin

| | |
|---|---|
| Worktree | `~/.paseo/worktrees/3s8t98rp/l0-benchmark-harness` |
| Branch | `l0-benchmark-harness` |
| Base SHA | `29ac1b7557d81202f04eed8e2601880e851e79ca` (`goal/collegiate-accuracy`, step-0 spec frozen) |

Your **first reply** must be one line: `cwd confirmed <pwd> branch <branch> HEAD <sha>`.
Then send the Gate 1 note below and **stop until the orchestrator approves it**.

## Why this lane exists

The step-0 benchmark is frozen in
`docs/internal/execution-runs/goal-collegiate-accuracy/STEP0-BENCHMARK-SPEC.md`; read it first,
especially §2, §3, §4 and §5. Its pass thresholds marked ⟨L0⟩ must come from the app's
**built WASM**, not from the native Rust run. Four harness pieces are missing (spec §5):

- **G-1, WASM cohort runner.** Fly the 23 frozen cohort entries through the built WASM
  (`instantiateEngine` from `src/engine/core`, as in
  `docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.probe.ts`), for arms A
  and B. Report per-flight relative difference against the native `cohort.json`. Any difference
  above 1e-12 relative is reported, never hidden.
- **G-2, arm C.** Calibrated drag with blank inputs, exactly as defined in spec §2: nose
  `tipRadius` removed, no site temperature, no nozzle option. Run it on both native and WASM.
- **G-3, cohort uncertainty coverage.** Use the app's own ensemble path, with the app's own
  default sigmas and member count. Find these in the code and cite them; do not invent them.
  For each airframe, report whether the measured apogee lies inside the 5–95 % range, and the
  band width as a percentage of the nominal. Run it for arms A and B.
- **G-4, regime summarizer.** Use the spec §3 membership **by name**, with per-airframe medians
  and qu8k excluded from the primary line. It must reproduce spec §2 exactly from the native
  `cohort.json`.

## Inputs (outside Git; hash-checked by the existing harness)

The existing native harness is `crates/astraea-engine/tests/appbound_bundle_cohort.rs`.
Its environment variables are recorded in
`docs/internal/execution-runs/goal-collegiate-accuracy/GOAL-HANDOFF.md` (commands section).
Evidence root: `/home/ak/astraea-evidence/`.

| Input | Path |
|---|---|
| Frozen manifest | `R40-published-cohort/cohort_manifest.json` (sha256 `3bd28077…`) |
| Native baseline | `goal-collegiate-accuracy/step0/cohort-native/cohort.json` (sha256 `1fd734bd…0139`) |
| Baseline WASM | built by `CARGO_BUILD_JOBS=2 node scripts/build-engine.mjs`; must hash `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff` |
| Prereg files for `ASTRAEA_R44_REPO` | `goal-collegiate-accuracy/step0/r44-repo-root` |

Write raw outputs to `/home/ak/astraea-evidence/goal-collegiate-accuracy/L0/` only, never into
the repo and never over `step0/`.

## Scope

**In scope:**

- New test or probe files: for example a vitest config and probe under
  `docs/internal/execution-runs/L0-benchmark-harness/` or `scripts/benchmark/`, and a
  Rust-side arm-C test.
- Your lane records: `RESULT.md`, `EVIDENCE.json` in this directory.

**Out of scope:**

- Any change under `crates/*/src`, `src/` (app code) or the build scripts.
- Any change to existing tests' assertions, tolerances or fixtures.
- GOAL.md, STEP0-*, GOAL-HANDOFF.md, the acceptance register, manifest and board.

## Non-negotiables

- **Tests-only.** No physics, threshold, tolerance or default change.
- **No sealed or held-out data.** Use only the cohort and dev evidence named here. Do not open
  anything under `R6-public-cohort/`, the book library, or `docs/flight-validation/round2-results.md`.
- No push, no network, no downloads. Install with `pnpm install --offline --frozen-lockfile`.
- Run `free -h` before builds. Two jobs per build or test run (`-j 2`, `--test-threads=2`,
  `--maxWorkers=2`). Kill any server or browser you start.
- **You cannot self-accept.** The orchestrator and an independent reviewer decide.

## Gate 1 (send before material edits)

A short design note covering:

1. **Mechanism for each gap:** the files you will add, which engine entry points you will call
   (with file:line), and how arm C strips its inputs.
2. **Sources for G-3:** the ensemble sigmas and member count, with file:line.
3. **Invariants:** arms A and B on WASM versus native; G-4 reproducing spec §2 to 1e-9 pp.
4. **Expected numbers** where they are known: A and B in spec §2.
5. **Falsifier:** what result would show that the runner is not the app path.

## Required evidence and acceptance

- G-4 reproduces spec §2: every regime, both arms, MAE to 1e-9 pp, and identical counts.
- G-1 gives a per-flight WASM-versus-native table for A and B, with the maximum relative
  difference.
- G-2 gives arm C per airframe and per regime, on native and WASM.
- G-3 gives coverage (n inside / n) and width per airframe and per regime, for A and B.
- Each command you ran, with its exit code; sha256 of every output file; the WASM hash used.
- `git diff --stat 29ac1b7..HEAD` shows only new test, probe or record files.

## Report format

`RESULT.md` with sections: Summary, Gate 1 as approved, Files added, Commands run (with exit
codes), Tables (G-1 to G-4), Deviations, What was not done. Plus `EVIDENCE.json`. Commit on the
lane branch. Your last line: `branch l0-benchmark-harness head <sha>`.
