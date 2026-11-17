# Lane assignment: B1, step-3 benchmark probes (tests only)

Status: **dispatched 2026-11-16.**

| | |
|---|---|
| Base | `goal/collegiate-accuracy` at the dispatch commit, after step 2 (`38508b7`) |
| Author | codex `gpt-6.1-terra`, medium effort |
| Reviewer | the orchestrator verifies every number; a non-OpenAI review follows |

The author cannot self-accept.

## Why

Step 3 runs the frozen suite (STEP0-BENCHMARK-SPEC §4, Amendments 1–5) on the candidate and compares it with step 0. Most rows already have committed evidence: P1–P3 (K3 merged tree), P5/P6/P10 (step 2) and P8 (K4). Three things are still missing:

1. **P9, engine-only performance A/B** (spec §8 Q2). In one session, with at least 10 interleaved rounds, time `simulate_flight` on the 23 cohort entries:
   - **baseline:** arm-A options on the step-0 WASM;
   - **candidate:** the candidate default's options (`flightRunOptions` through the K3 adapter, as in `docs/internal/execution-runs/K3-improved-default/cohort-default.probe.ts`) on the candidate WASM.

   Both WASMs are byte-identical (`bc19590b`), so the A/B is about the **options**. The built-up default runs a baseline pass and then the built-up pass, so a slowdown is expected. Measure it honestly.

   **A/A:** arm A against arm A in the same session, to give the spread.

   **Pass rule (frozen):** candidate median per-case ≤ 1.10 × baseline median per-case, **and** same-session A/A spread < 10 %. If the A/A spread is ≥ 10 %, the result is "undecidable on this host" and is reported as such. **A slowdown above 1.10× is reported as FAIL. Never tune it.**

2. **Template identity at HEAD** (P4). Rerun the three-template probe (`docs/internal/execution-runs/accuracy-bundle-frontend/preset-compare.probe.ts`, as K3 ran it). Expected values: 304.0294885865904, 546.5369328003885 and 5013.508465461415 m.

3. **S4 report-only rows** (`docs/internal/execution-runs/S4-non-apogee-outputs/RESULT.md`, orchestrator disposition). Use the **frozen flight list**; do not add or drop flights.
   - **Time to apogee, n = 4:** Cosmic Cargo, G69N 30JUN2017 FIP 1, Top Shot E12, Adventurer J510W. Fly each with the candidate default through the app's development-case inputs (`src/validation/development/benchmark.ts`, `dofproCases.ts`). Report the measured time and its source and clock definition, the simulated ignition-to-peak time, the signed difference and the clock-offset caveat.
   - **Max Mach, n = 1:** Proteus 6, measured 2.94 from integrated accelerometers. Report the candidate's max Mach and label the row non-comparable unless the source's Mach definition is established.

## Rules

- Tests and probes only. Add files under `docs/internal/execution-runs/B1-step3-benchmark/` and nothing else.
- No app, engine, threshold or fixture change.
- Write raw output to `/home/ak/astraea-evidence/goal-collegiate-accuracy/step3/` and give the sha256 of each file.
- Inputs:
  - manifest `/home/ak/astraea-evidence/R40-published-cohort/cohort_manifest.json`, asserting sha256 `3bd28077…`;
  - WASM `/home/ak/astraea-evidence/goal-collegiate-accuracy/step0/wasm/build1.wasm`, asserting `bc19590b…`;
  - development data `/home/ak/flight-data/`.
- Never open `R6-public-cohort/`, any book library, or `docs/flight-validation/round2-results.md`. Do not use Emerald Streak or Vulcanite.
- If node_modules is missing, symlink it from `/home/ak/.paseo/worktrees/3s8t98rp/goal-collegiate-accuracy/node_modules`.
- Run `free -h` and `uptime` before each timing run, and record the load average. Use two workers at most. Run P9 when the load average is below 6; wait and retry otherwise, and say so.
- No push, network or downloads.

## Report

Write `RESULT.md` with these sections:
- commands, with exit codes;
- the P9 table (per-case medians, the overall median ratio, A/A spread, load average, verdict);
- template identity;
- the S4 rows;
- what was not done.

Commit if you can; otherwise leave the work uncommitted and list the files.

## Re-dispatch after the E1 merge (2026-11-16)

The engine changed in E1. The candidate WASM is now the goal-path build **`4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535`** (`src/engine/astraea_engine.wasm` at goal `7eb8440`). The baseline is still the step-0 `bc19590b` build.

- Start from the probes the earlier B1 run left **uncommitted** in `/home/ak/.t3/worktrees/astraeat3/t3-77d16aae-c9cc07cfef53048a/docs/internal/execution-runs/B1-step3-benchmark/` (`p9-perf.probe.ts`, `s4-rows.probe.ts`, `run-p9.sh`, `vitest.config.ts`). Review them; the author owns them now.
- **P9:** `B1_BASE_WASM` = step-0 `bc19590b`; `B1_CAND_WASM` = a copy of `4c1ec4ed` placed under `astraea-evidence/goal-collegiate-accuracy/step3-e1/` with its hash asserted. The A/B now differs in **options and engine**, so say that explicitly. The A/A spread uses the baseline WASM. The frozen rule is unchanged: ≤ 1.10× **and** A/A spread < 10 %, otherwise "undecidable on this host". A FAIL is reported, never tuned.
- **S4 rows:** run on the `4c1ec4ed` WASM, with the frozen list unchanged.
- **Timing hygiene:** run only when no other lane is running tests, with load below 6, and log every wait sample.
- Commit only `docs/internal/execution-runs/B1-step3-benchmark/` plus RESULT.md. Raw output goes to `astraea-evidence/goal-collegiate-accuracy/step3-e1/b1/`.
