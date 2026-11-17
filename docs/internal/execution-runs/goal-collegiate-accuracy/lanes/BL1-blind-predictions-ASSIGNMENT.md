# Lane assignment: BL1, blind predictions, phase 1 (no outcomes)

Status: **dispatched 2026-11-16.** Owner stop (b), **phase 1 only**, approved 2026-11-16: "Phase 1 now, ask before open". Opening any flight log is a separate owner stop and is NOT part of this lane.

| | |
|---|---|
| Base | `goal/collegiate-accuracy` at the dispatch commit |
| Branch / worktree | `bl1-blind-predictions`, `~/.paseo/worktrees/3s8t98rp/bl1-blind-predictions` |
| Author | OMP `deepseek/deepseek-flash`, thinking max |
| Reviewer | claude-pool `claude-sonnet-5-5`, effort medium (a different family). The author cannot self-accept |
| Protocol | STEP0-BENCHMARK-SPEC §6, steps 1–3. Steps 4–7 happen only after the owner approves opening |

## Inputs (the ONLY outcome-free inputs you may use)

- Stripped design files staged by the orchestrator. `<simulations>` and `<flightdata>` blocks were removed in code, and every read is logged in `CUSTODY-READ-LOG.json`:
  - `astraea-evidence/goal-collegiate-accuracy/step4-blind/design/V001-Estes_Emerald_Streak.design.xml`
  - `astraea-evidence/goal-collegiate-accuracy/step4-blind/design/V002-DDVulcanite.design.xml`
- The flight list, motors and dates in STEP0-BENCHMARK-SPEC §6 "Sealed list":
  - Emerald Streak: 10 flights on 2017-03-09. C6-5 ×3, C6-7 ×3, D13-10W ×1, QC6-5 ×3.
  - DD Vulcanite: I140W-14 (2023-02-11, GPS-only) and J270W-14 (2023-07-08).
- Motor thrust curves from the app's own motor database. If a motor is missing, say so; do not download.

**Never open anything under `/home/ak/astraea-evidence/R6-public-cohort/`.** That includes the flight logs, the vehicle pages and the manifest. Do not open any book library or `docs/flight-validation/round2-results.md`. Do not search for or read any published result for these flights. If you see an outcome by accident, stop and report it.

## What to produce

1. **Qualification (§6.1).** Load each design through the app's own import path (`src/formats/orkParser.ts`, as a user would). For every input, record its value, its source (the design-file element, the spec, or an assumption) and its uncertainty.
   - **Inputs to cover:** geometry, mass, CG, motor, rail length and angle, launch altitude, site temperature, wind and nozzle exit.
   - **Unrecorded inputs** (weather, rail and site for these flights): use a stated assumption and widen the uncertainty for it.
   - **Drag model:** state which drag each design flies under the app default. Emerald Streak's freeform fins are expected to be refused, so it flies legacy drag; confirm this from the engine's own `axialDrag` line.
   - **Not qualified:** a set that cannot be qualified is reported as "not qualified".
2. **Exclusion rules (§6.2), written before any opening.** Logger loss, CATO, recovery failure, no usable altitude channel, and any other rule you justify. Make each one checkable from the log alone.
3. **Predictions (§6.3).**
   - **Nominal:** apogee AGL per flight from the candidate default on the final WASM. The WASM is `src/engine/astraea_engine.wasm`, sha256 `4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535`; assert it.
   - **5–95 % interval:** per flight, from the app's own Monte Carlo (`runMonteCarlo` in `src/console/data/adapter.ts`, or the engine `run_ensemble`), with the uncertainties from step 1. State the run count and seed.
   - **Extraction rule:** restate the frozen rule per set (§6.4). Pressure logs use the 5 s pre-liftoff median and a centred 5-sample running-median peak. The Vulcanite I140W uses GPS, with "vertical uncertainty unstated".
4. **Freeze.** Put the predictions in `docs/internal/execution-runs/BL1-blind-predictions/PREDICTIONS.json`, with the source SHA, the WASM hash, the design-file hashes and every assumption. Put the human summary in `PREDICTIONS.md`. Commit both.

## Rules

- No engine, app, threshold or fixture change. The probes go under `docs/internal/execution-runs/BL1-blind-predictions/` only.
- Do not tune anything. The predictions come from the released default exactly as a user would get it.
- Run `free -h` first. Use two workers. Run long commands detached with logs. No network, no push.
- Do not edit GOAL-HANDOFF.md or the release report.
