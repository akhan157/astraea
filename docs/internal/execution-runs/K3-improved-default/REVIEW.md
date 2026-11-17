# K3 review record

The lane is `k3-improved-default`, `d635726..4eecc58`. It was merged into `goal/collegiate-accuracy` as `c2b31dd` (`--no-ff`) after the owner approved hard stop (c) on 2026-11-15.

## Author and routing

| | |
|---|---|
| Author | claude-pool `claude-sonnet-5-5`, effort high. This was the owner's decision on 2026-11-15, because Codex was usage-limited. It applies to K3 only |
| Reviewers | Orchestrator (claude-opus-5-5), then codex `gpt-6.1-sol` with reasoningEffort high, a different model family |
| Reviewers that failed (no verdict) | OpenCode Go `kimi-k3.1-pro` ("Insufficient balance"); Antigravity `gemini-3.8-flash` ("service disabled … Terms of Service") |
| Escalation rule | The lane failed review twice. It kept its author, because the owner's goal rule forbids Sol as an author and every earlier finding had been fixed correctly. The decision is recorded in GOAL-HANDOFF.md |

The author never accepted its own work.

## Rounds

| Round | Reviewed head | Verdict | Findings |
|---|---|---|---|
| Orchestrator | `e613f8a` | not accepted | B1: an applied legacy-fitted scale multiplied the built-up drag, because the run key ignored the drag source. B2: pre-switch results read as current. Minor: P3 was reported on the frozen arm-C definition; the nozzle option above 1 m |
| Orchestrator, quiet-host smoke | `edd5f88` | investigated | The Flight free region was 214.1 px against ≥ 220. **Not K3:** a "Restored unsaved work" bar timing race that is already in the smoke script. The base also fails it, 1 run in 7 |
| codex sol 1 | `edd5f88` | **REJECT** | Major: an inactive calibration still forced legacy drag. Major: the nozzle checkbox showed off while back-pressure flew. Minor: the adapter and Monte Carlo metadata came from the unresolved vehicle |
| codex sol 2 | `efc43e9` | **REJECT** | Major: the archive stored the resolved `'legacy'`, so "Load saved inputs" deactivated a provenance calibration. Minor: a self-comparison test; a reopen test that only parsed the file |
| codex sol 3 | `4eecc58` | **ACCEPT** | None new. The reviewer's own capture → restore → reopen probe preserved fit key 251f2461, run key d7607e84, the active calibration and the scale. A tampered archive is still rejected |

## Merged-tree checks (orchestrator, `c2b31dd`)

Evidence is stored outside Git, in `astraea-evidence/goal-collegiate-accuracy/K3-merged/`.

| Check | Result |
|---|---|
| WASM | `bc19590b…`, unchanged; no engine change |
| `tsc --noEmit` | 0 |
| Full vitest, `--maxWorkers=2` | 191/191 files, 2221/2221 tests. The first run picked up the orchestrator's scratch copy in `out/K3-review`; that copy was deleted and the suite rerun |
| Cohort probe and `candidate-compare.cjs` | 0. P1, P2 (T = 0) and P3 pass. `cand.json` is byte-identical to the lane's |
| Full browser smoke | **Not clean in the merged tree.** Both runs hit 30 s Playwright timeouts (a screenshot, then `page.goto`) at host load average 12–17 from other sessions. The first run passed 36 checks before failing, including the Flight free region at 239.6 px. A clean pass was recorded on the lane tree: the orchestrator's on `edd5f88` and the author's on `4eecc58`. **This is owed at step 2 on a quiet host** |
| Evidence | `K3-merged/SHA256SUMS` sha256 `48d04599d8ae41b8…` |

## Carried to the Release Readiness Report

- **Forward compatibility:** older builds refuse files that carry `flightDragSource: "legacy"` or `nozzleBackPressureThrust: false`.
- **Nozzle back-pressure thrust** is on by default for designs that declare a nozzle exit of 0 to 1 m.
- **Old projects** re-fly with the new drag model, and their stored results read as stale. Recorded runs are never rewritten.
- **Earlier archives:** archives from the unreleased commits 2–4 restore as explicit legacy.
- **Amendment 4 labelling:** P1 and P2 check that the default sends arm B's inputs. P3 is the independent blank-input check.
- **Smoke-script race:** fixed in a separate tests-only lane at step 2.
