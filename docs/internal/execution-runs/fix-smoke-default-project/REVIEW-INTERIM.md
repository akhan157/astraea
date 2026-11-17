# Interim orchestrator review — fix-smoke-default-project (2026-11-15)

Reviewer: orchestrator (Claude family). Author: codex `gpt-6.1-terra` (medium). Not accepted, not merged.

## Lane state
- The author hit the Codex usage limit (resets 2026-11-18 17:42) after committing `1905432` (layout wait) and `f7ddabc` (reset helper).
- The author did **not** deliver the requested diagnosis, the falsifier run, or an updated RESULT.md.
- Owner standing rule: wait for the reset; do not switch model.

## Diff read (a57a7c8..f7ddabc, scripts only)
- `6bf3478`: the 534 ± 2 m baseline assertion in `accuracyBundleJourneys`. Correct.
- `f7ddabc`: `resetAccuracyProject`. Removes `astraea.working-session.v1` and `astraea.project.v1` from localStorage and from the IndexedDB `astraea` / `projects` store in one transaction, then reloads and asserts no "Restored unsaved work" status. Preferences are kept. Matches the Gate 1 amendments.
- `1905432`: after dismissing the restore notice, waits for the canvas height and the safe region to change, then asserts the notice is absent. It does **not** cover a notice that appears only after the check; that needs the diagnosis that is still owed.

## Full `pnpm test:browser` runs by the reviewer on f7ddabc
Logs: `~/astraea-walkthroughs-2026-11-12/main-checks-2026-11-13/logs/smoke-default-project-review-f7ddabc{,-run2,-run3}.log`

| Run | 1280 region | Accuracy default baseline | Outcome |
|---|---|---|---|
| 1 | 239.6 px pass | not reached | exit 1: "Target page, context or browser has been closed" at `preview-journeys.mjs:781`. All headless browsers on the host, including another project's, vanished at once [INFERENCE: external kill] |
| 2 | 239.6 px pass | **533 m, pass**, plus all accuracy journeys | exit 1: share-flight `page.goto` 30 s load timeout (`preview-journeys.mjs:1240`), host load ~10 |
| 3 | 239.6 px pass | not reached | exit 1: `preview-depth.mjs:46` freeform import, vehicle name still "Spaceport America…" after 5 s |

Reading: the lane's own checks pass (run 2). The three failures are different each time and all in journeys this lane does not touch. They look like timing failures under host load [INFERENCE]. Not proven, because `6560dd7` passed once and base has not been rerun under the same load.

## Still required before acceptance
1. Falsifier: full run at `1905432` (assertion plus layout wait, no reset) showing the assertion fails at about 372 m.
2. Diagnosis of the 214.1 px case (late notice vs resize lag).
3. One clean full run (exit 0) and one `ASTRAEA_ONLY_JOURNEYS=accuracy` run.
4. Author RESULT.md update.
5. If the untouched journeys keep failing, a separate lane on suite timing under load. That is not this lane.
