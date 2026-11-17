# Lane assignment: BX1, blind outcome extraction (stop b, phase 2)

Status: **dispatched 2026-11-16.** Owner stop (b) phase 2 approved 2026-11-16: "Open both sets". The predictions were frozen at `cbdef58` and merged at `c9f9ea7` before this lane existed.

| | |
|---|---|
| Base | `goal/collegiate-accuracy` @ the dispatch commit |
| Branch / worktree | `bx1-blind-extraction`, `~/.paseo/worktrees/3s8t98rp/bx1-blind-extraction` |
| Author | OMP `deepseek/deepseek-flash`, thinking max. This is a **different agent from the predictor** (spec §6.5) |
| Reviewer | claude-pool `claude-sonnet-5-5`, effort low |

## Scope

- Open **only** the 12 flight logs of V001 Estes Emerald Streak and V002 LOC DD Vulcanite. They are listed by sha256 prefix in STEP0-BENCHMARK-SPEC §6 "Sealed list" and live under `astraea-evidence/R6-public-cohort/S01-dofpro/V001/` and `/V002/`. Open each one **once**. Before opening a file, confirm its full sha256 against the custody manifest `R6-public-cohort/blind-manifest.json`, matching on the spec's prefix.
- Do **not** open anything else under `R6-public-cohort/`. That includes other vehicles, vehicle pages, prose and archives.
- Apply only the frozen rules in `astraea-evidence/goal-collegiate-accuracy/step4-blind/FROZEN-RULES-FOR-EXTRACTOR.json`. These are the exclusion rules E1–E9 and the extraction rules: pressure logs use the 5 s pre-liftoff median and a centred 5-sample running-median peak; GPS-only data (V002 I140W) uses the maximum above the pad median, with "vertical uncertainty unstated".
- **Do not read the predictions** (`PREDICTIONS.json`, `PREDICTIONS.md`, or any BL1 output). The extraction must be blind to them.
- Do not change a rule after opening. If a rule cannot be applied as written, report that flight as "not extractable" with the reason.

## Output

`docs/internal/execution-runs/BX1-blind-extraction/OUTCOMES.json` and `OUTCOMES.md`. For each flight, record:
- the file sha256;
- the format and channels;
- the liftoff time;
- the pad median;
- the extracted apogee AGL in metres;
- the exclusion rules checked, with the result of each;
- any rule it could not apply.

Also write `CUSTODY-READ-LOG.json` (every file opened, with UTC time and sha256), and commit the extraction code. Raw copies stay outside the repo, under `astraea-evidence/goal-collegiate-accuracy/step4-blind/outcomes/`.

## Rules

- No engine, app or threshold change.
- No network.
- Run `free -h` first, and use two workers.
- The author cannot self-accept.
- Do not edit GOAL-HANDOFF.md or the release report.
