# K4 review record

Lane `k4-expected-error-line` (`442a953..a61e18c`) was merged into `goal/collegiate-accuracy` as `3bde5ae` (`--no-ff`) on 2026-11-15.

## Routing

| | |
|---|---|
| Author | codex `gpt-6.1-terra`, medium effort, isolated checkout. The child could not write the git index, so the orchestrator made the commits `58583e3`, `2621cb3` and `a61e18c` from the author's work. The author's last run was cut off by the Codex usage limit, after it reported that tsc, the build and 13 focused tests passed |
| Reviewer | claude-pool `claude-sonnet-5-5`, effort high, a different family |

The author did not self-accept.

## Gate 1

- **First note:** incomplete, because there was no per-flight data. The orchestrator amended the brief to allow a tests-only probe; its output is `K4/cand.json`, sha256 `be7d0ef2…`.
- **Second note:** approved with amendments, and spec Amendment 5 was written (`929df85`).
- **Orchestrator correction during the lane:** the nozzle-exit requirement was dropped. It had excluded 7 airframes that are included in the band values themselves.

## Review: claude-sonnet-5-5 on `2621cb3`, ACCEPT WITH FINDINGS

The reviewer independently re-derived the band values and coverage. It also regenerated the module and got output byte-identical to the committed one.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Major | Band shown when the run carries a drag-calibration scale | Fixed in `a61e18c`: the line is withheld ("No error band: drag calibration applied.") and a test covers it |
| 2 | Minor (owner) | MAE band covers 11/20 (in-sample), below the 80 % rule | **Owner chose "Typical error" on 2026-11-15.** P8 is reported in the Release Readiness Report |
| 3 | Minor | `C.dim` contrast 3.14:1 | Fixed: `C.muted` (about 5.9:1) on the new line only |
| 4, 5 | Minor | Line near wrapping; non-specific withheld message | Fixed: shorter text and specific one-line messages. Screenshots `fix-byrum.png` and `fix-no-temperature.png` |
| 6 | Minor | Test gaps; generator overwrote the option | Fixed: exact ceilings, 0.7999 and 1.4999, unknown manifest, values read from the module, generator takes the option as an argument |
| 7 | Observation | Site temperature is not part of the envelope | Recorded |

**Orchestrator check of `a61e18c`:** the diff was read, tsc passed (0), the focused tests passed (13/13), and both screenshots were viewed on the built app under the production CSP. A full vitest run on `58583e3`/`2621cb3` passed 193/193 files and 2230/2230 tests. The fix commit was not sent back to the reviewer: the findings were narrow, and the orchestrator verified each one against the diff and tests.

## Carried forward

- **P8 (in-sample, Amendment 5):** the typical band covers 4/8, 4/7 and 3/5 by regime, 11/20 in all. Widths are 11.0 %, 10.8 % and 12.2 %.
- **Templates:** all three show "No error band: site temperature not set."
- **Light theme:** not applicable, because the app is dark-only. Phone width shows the app's desktop-size notice.
- **Stale banner and landing text after K3:** the owner chose development wording on 2026-11-15. A separate lane handles it.

## Merged-tree checks (orchestrator, `3bde5ae`)

`tsc` passed (0). The full vitest run (`--maxWorkers=2`) passed: 193/193 files, 2234/2234 tests. Evidence is in `astraea-evidence/goal-collegiate-accuracy/K4-merged/`. The browser smoke is owed at step 2.
