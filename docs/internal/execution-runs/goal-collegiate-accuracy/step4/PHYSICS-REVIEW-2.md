# Step 4 physics re-review, round 2: ACCEPT WITH FINDINGS

| | |
|---|---|
| Reviewer | OMP `deepseek/deepseek-flash` (V4.1 Flash), thinking max. A different family from the physics authors: K3 was Claude Sonnet, E1 was OpenAI Codex |
| Reviewed | `goal/collegiate-accuracy` @ `bd1fcb4`, WASM `4c1ec4ed` |
| Full record | `astraea-evidence/goal-collegiate-accuracy/step4-physics-review-2.md`, sha256 `3c73aa89…` |

## Round-1 findings

- **Fixed: 1, 2, 3, 4, 5, 6, 7, 9, 10, 14, 15.** Both blocking reproductions were re-run on `4c1ec4ed`:
  - Oversized nozzle: refused, the instance is not poisoned, and the recovery flight runs.
  - Wind: 92 runs, 0 errors; 6 of them use the cross-phase fill.
- **Accepted as recorded limits: 1 (residual), 11, 12.**
  - Finding 1 residual: an exit equal to the aft diameter still inflates apogee by 4–21 %.
  - Finding 11: UNKNOWN validity on 17 of 20.
  - Finding 12: space shots run about 12 % low.
- **Still open, documentation only: 8, 13.**
  - Finding 8: the 25-station transonic resolution.
  - Finding 13: site temperature is a design input on a standard-day basis.

## Independent checks

- The reviewer reproduced P1–P3: 5.6240 % / 18, the blank row 5.8755 / 16, and 5.9153 / 16 with temperature and nozzle exit blank.
- Cohort rows are byte-identical (sha `d7f17c6f…`). The templates are exactly the stop-(c) values.
- No threshold was relaxed and nothing was tuned.

## New findings

| # | Severity | Finding | Disposition |
|---|---|---|---|
| N1 | Minor (wording) | The error line says "20 rockets", but the value shown is the per-regime MAE from 8, 7 or 5 airframes | Owner wording decision |
| N2 | Minor (engine) | The nozzle bound skips a rearmost tube flagged `isMotorMount` (`models.rs:1387-1390`), so an oversized exit passes and the error message names the wrong bound | Owner decision: fix before the blind test or record |
| N3 | Minor (recording) | The cross-phase fill uses coasting altitudes up to about 33 kft, which shifts `cf`. FMJ1 apogee changes by −0.3 % | Record in report §4 |
| N4 | Info | The rescale omits `3.14159/π`, an error of 0.3 ppm | Record |
| N5 | Info | The negative base component is not confined to exits near the aft diameter (qu8k) | Correct the wording in report §4 |
| N6 | Minor (wording) | 7 of the 20 airframes declare no nozzle exit, so "with … nozzle exit set" does not describe them | Owner wording decision |
