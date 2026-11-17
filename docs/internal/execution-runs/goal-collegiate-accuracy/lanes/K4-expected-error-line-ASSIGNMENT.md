# Lane assignment: K4, expected-error line on results

Status: **dispatched 2026-11-15** (Gate 1 first), after the K3 merge `c2b31dd`.

## Pin (filled at dispatch)

| | |
|---|---|
| Base | `goal/collegiate-accuracy` @ the dispatch commit (after K3 merge `c2b31dd`, records `81b8fa9`) |
| Checkout | isolated worktree from that commit |
| Author | codex `gpt-6.1-terra`, medium effort. Never Sol, never xhigh |
| Reviewer | a non-OpenAI family. No self-acceptance |

The author's first reply is `cwd confirmed <pwd> branch <branch> HEAD <sha>`. The author then sends Gate 1 and stops.

## Why

- **Owner K4 (approved 2026-11-14, GOAL.md Revision 3):** show the expected error on results as **one compact line on the apogee result**. The wording is settled at review. Standing preference: minimal UI change; fold or remove, never relabel or restyle what exists.
- **Spec Amendment 2:** the product shows no apogee range today. **P8 is evaluated on whatever range K4 ships**, against the 80 % rule and the 20 % cap. It is report-only and never tuned.

## Facts for Gate 1 (orchestrator scouting)

- The apogee result is shown in `src/console/stages/Flight.tsx`. Saved runs are in `SavedRuns.tsx`. Output labels are in `src/application/savedFlightOutputs.ts`.
- The run's `maxMach` is available (`src/application/runCases.ts:88`, `src/console/data/adapter.ts:442`).
- **Regime membership in the spec is by name, frozen (§3), never recomputed.** The app needs a rule that puts a user's run in a regime, which the spec does not provide. Gate 1 must propose it: say what quantity (for example `maxMach`), what cut points, and from what source. It must also show how the 20 cohort airframes fall under that rule compared with the frozen names. Every mismatch is listed, never hidden.
- **Candidate error values (default model, arm B, Amendment 3):**

| Regime | MAE | Within ±10 % | Bias |
|---|---|---|---|
| Subsonic | 5.5414 % | 7 of 8 | +2.85 % |
| Transonic | 5.4024 % | 7 of 7 | −0.66 % |
| Supersonic | 6.0662 % | 4 of 5 | −2.76 % |

  The blank-input row (arm C) is worse, especially supersonic (6.94 %, all errors low).
- Those numbers are **development data**: the same 20 airframes the model was chosen on. The line must not present them as a blind or validated accuracy.

## Gate 1 must answer

1. **What the line says.** Give the exact text for each regime, plus three cases:
   - refused shapes (the run flew legacy drag);
   - an explicit `'legacy'` choice;
   - runs outside the cohort envelope (for example space shots, or qu8k-like vehicles).

   Present it as a short option set for owner review.
2. **The regime rule** (see the facts above).
3. **What range it implies.** Is the line a ± band (for example ±MAE, or a percentile of the cohort errors)? Give its coverage and width on the cohort with the L0 A2 definitions (P8). State plainly that this is in-sample.
4. **Whether it changes with inputs.** For example, when temperature, nozzle and tip are blank, arm C. If it varies, give the measured numbers that back each case.
5. **Files to change, with file:line.** Name every consumer that shows apogee: Flight, SavedRuns, run comparison, exports. For each, say whether the line goes there, and why.
6. **Identity:** no engine change, and the three templates' numeric outputs stay unchanged. Only display text is added.
7. **Falsifier.**

## Non-negotiables

- No physics, threshold, tolerance or fixture change. No numbers invented. Every displayed value traces to a committed benchmark record.
- No sealed or held-out data. Do not open `/home/ak/astraea-evidence/R6-public-cohort/`, the book library or `docs/flight-validation/round2-results.md`.
- No push, network or downloads. Install only with `pnpm install --offline --frozen-lockfile`.
- Run `free -h` first. Use two jobs per run. Kill any server or browser you start.
- Do not edit GOAL.md, the STEP0 files, GOAL-HANDOFF.md, the register, the manifest or the board.

## Acceptance

- `tsc`, the unit tests, `vite build` and the browser smoke all pass.
- **Built-app screenshots** under the production CSP: every changed screen, light and dark, and phone width if the screen supports it.
- The P8 table: coverage and width per regime, labelled in-sample.
- The three templates' apogee values are unchanged from the post-K3 record.
- The owner approves the final wording at review.

## Report format

The report is `RESULT.md` and `EVIDENCE.json` in `docs/internal/execution-runs/K4-expected-error-line/`. `RESULT.md` has these sections: Summary, Gate 1 as approved, Files changed, Commands run (with exit codes), Tables, Screenshots, Deviations, What was not done. The author's last line is `branch <branch> head <sha>`.
