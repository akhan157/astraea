# Lane assignment: W1, accuracy-claim wording after K3

Status: **drafted 2026-11-15.** It is dispatched when Codex is available.

## Pin

| | |
|---|---|
| Base | `goal/collegiate-accuracy` at the dispatch commit (after the K4 merge `3bde5ae`) |
| Author | codex `gpt-6.1-terra`, medium effort |
| Reviewer | a non-OpenAI family. No self-acceptance |

## Why

K3 made built-up drag the default flight model, but two customer-facing texts still describe the legacy model only:
- `src/console/evidenceClaims.ts:15-22`: `BETA_BANNER_SHORT` and `BETA_ACCURACY_CLAIM`, shared by the banner and `ModelStatusPanel`;
- `index.html:169-172`: the landing page's `data-beta-notice` paragraph.

**Owner decision, 2026-11-15:** use development wording now, and settle the final wording in the Release Readiness Report after the blind shot.

## Text (orchestrator-approved; restates committed records only)

- **Short banner:** `Beta · not flight approval · apogee error averaged 5.6% on 20 published rockets (development data)`
- **Full claim and landing paragraph:** `Default model: apogee error averaged 5.6% across 20 published rockets, 18 of 20 within 10% (development data: the model was chosen on these flights; blind test pending). Shapes it cannot model use the legacy model, tested blind on one small subsonic rocket: predictions ran 6–10% high. Not flight approval.`

The figures come from STEP0-BENCHMARK-SPEC Amendment 3, arm B, all 20 airframes: MAE 5.623962788961215 %, 18/20 within ±10 %. The blind-test sentence is the existing documented fact.

Keep the landing paragraph's existing "How accurate is it?" link and the paragraph after it unchanged. `docs/accuracy.md` is **out of scope**; it is public wording settled at step 5.

## Scope and rules

- Change only those strings, the header comment in `evidenceClaims.ts` so that it matches, and any tests or fixtures that pin the old strings. Update those to the new strings exactly; do not loosen any matcher.
- The banner must stay one line at 1280 px. Check it with a built-app screenshot under the production CSP.
- Out of scope: other UI, the engine, physics, thresholds and `docs/accuracy.md`.
- No sealed data, no network, no push. Run `free -h` first and use two jobs per run.

## Acceptance

- tsc, the focused tests, the full vitest (`--maxWorkers=2`) and `vite build` all pass.
- Screenshots: the banner at 1280×800 (collapsed and expanded), the landing section, and the model status panel.
- `git diff` touches only the files above.
- RESULT.md goes in `docs/internal/execution-runs/W1-accuracy-claim-wording/`.
