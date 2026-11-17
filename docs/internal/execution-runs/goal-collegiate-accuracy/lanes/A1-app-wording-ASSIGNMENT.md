# Lane assignment: A1, app inputs and accuracy wording after the physics review

Status: **Gate 1 dispatched 2026-11-16.** This is research only: no source edits until the orchestrator approves, and the owner approves any wording.

| | |
|---|---|
| Base | `goal/collegiate-accuracy` @ `6950cdc` |
| Branch | `a1-app-wording` |
| Author | codex `gpt-6.1-terra`, medium effort |
| Reviewer | a different family from the author. The author cannot self-accept |
| Runs alongside | E1 (engine, `crates/`). A1 must not edit `crates/` or the WASM. Only one lane edits each file |

## Why

Step-4 physics review round 1 ([`step4/PHYSICS-REVIEW-1.md`](../step4/PHYSICS-REVIEW-1.md)) gave A1 the app-side input bound for finding 1, plus findings 4–7 and 14. The release report (§6) adds the stale public texts.

| # | Finding | What A1 does |
|---|---|---|
| 1 (app side) | The UI accepts a nozzle exit from 0 to 1 m. E1 now refuses an exit wider than the aft body in the engine | Show that limit at the input, with a clear message, before the run. Use the same rule as the engine (exit ≤ aft body diameter, equality allowed), read from the design, not a new constant |
| 4 | 5.6 % / 18 of 20 holds only when site temperature and nozzle exit are declared. Blank inputs give 5.9 % / 16 (frozen arm C 5.3534 / 16; fully blank 5.8755 / 16; see RELEASE-READINESS-REPORT §2 P3) | Draft claim text that states the condition |
| 5 | "Typical error ±X %" reads as a bound. It is an in-sample average: 11 of 20 inside | Draft wording that says it is an average, not a limit |
| 6 | The landing sentence ties refused shapes to the Mini DX3 blind test, but Mini DX3 is a supported shape. No refused shape has blind evidence | Draft a corrected sentence |
| 7 | Nozzle back-pressure thrust is on by default and assumes a sea-level thrust curve and the motor's own exit area | Draft a short hint at the nozzle input |
| 14 | The "Flight model: Legacy (supported)" chip (`Flight.tsx:43`) after K3 | Propose options |
| — | The legacy-fallback reason. E1 round 3 makes every engine fallback text start with `refused:` | Confirm that the app labels each fallback, citing the consumer's file:line |
| — | `docs/accuracy.md`, `CHANGELOG.md:205`, `.github/workflows/release.yml:72` still use legacy-only wording | Draft replacements. Final public numbers wait for the blind shot, so mark them as development wording |

## Gate 1 deliverable (no edits)

For each row:
- the current text or behaviour, with file:line;
- the proposed text, or 2–3 options with a recommendation;
- every test, fixture or smoke assertion that pins the current text (grep);
- the risk.

Every number must come from a committed record (cite it). Do not invent figures. Keep texts short; the owner cuts over-documentation. Keep the banner one line at 1280 px.

## Rules

- No sealed data. Never open `/home/ak/astraea-evidence/R6-public-cohort/`, any book library, or `docs/flight-validation/round2-results.md`. Do not use Emerald Streak or Vulcanite.
- No engine, physics, threshold or tolerance change. No change to the K4 band values.
- Minimal UI change: fold or reword; never restyle.
- No push or network. Run `free -h` first and use two jobs.
- Do not edit GOAL-HANDOFF.md, the register or the release report.

## Acceptance (implementation turn, after approval)

- tsc 0, the focused tests, full vitest `--maxWorkers=2`, and `vite build`.
- Tests pinned to the exact new strings; no loosened matchers.
- Built-app screenshots under the production CSP: banner at 1280×800, the landing section, the Flight screen with the error line, the nozzle input with an oversized exit.

## Owner decisions, 2026-11-16 (implementation turn)

Gate 1 is complete: the author's `GATE1.md` (`a2d6bae`) plus the orchestrator's [`A1-app-wording/GATE1-LISTS.md`](../../A1-app-wording/GATE1-LISTS.md). The owner chose the recommended option on every row. The texts are exact; do not reword them.

| Row | Exact text or change |
|---|---|
| Banner (`evidenceClaims.ts:16`) | `Beta · not flight approval · apogee error averaged 5.6–5.9% on 20 published rockets (development data)` |
| Full claim and landing (`evidenceClaims.ts:20`, `index.html:170`) | `Default model: apogee error averaged 5.6% across 20 published rockets (18 of 20 within 10%) with site temperature and nozzle exit set, 5.9% (16 of 20) with them blank. Development data: the model was chosen on these flights; blind test pending. Shapes it cannot model use legacy drag, which has no blind test on those shapes. Not flight approval.` |
| Error line (`expectedError.ts:22`) | `Average apogee error ±X % (dev. data, 20 rockets; not a limit)`. The values and the withheld messages are unchanged |
| Chip (`Flight.tsx:43`) | Remove it. Leave the rest of the row as it is |
| Nozzle hint (`AeroControls.tsx:148`) | Append `Must not exceed the aft body diameter. Assumes a sea-level thrust curve.` The run shows the engine's own error. Do **not** copy the rule into TypeScript |
| Ensemble Model Status row (`ModelStatusPanel.tsx:158-159`) | Show the `BUILT_UP_DRAG_REFUSED` warning when `builtUpDragWasRefused` holds, as the single-run row at `:150` does |
| `docs/accuracy.md:3-6` | Replace the short answer with the full claim above, then keep the existing legacy blind-test section, marked as the legacy model's result |
| `.github/workflows/release.yml:72` | The `releaseBody` gets the full claim, followed by `See docs/accuracy.md and CHANGELOG.md.` |
| `CHANGELOG.md` | Add a new entry under the unreleased section and keep the historical entry at `:202-205` unchanged |

Pins to update to the exact new strings, with no loosened matchers:
- `stageRendering.test.tsx:69,71`
- `scripts/preview-journeys.mjs:116,130` (the landing regex no longer requires `6–10%`; require `5\.6%` and `not flight approval` instead)
- `expectedError.test.ts:11` and `expectedError.integration.test.tsx:27,45`
- `flightLayout.test.tsx:118,122,130` (assert that the chip is absent)
- a new test for the ensemble refused warning

5.6 % / 18 of 20 is arm B (STEP0-BENCHMARK-SPEC Amendment 3); 5.9 % / 16 of 20 is the fully blank row (RELEASE-READINESS-REPORT §2 P3, 5.8755 %). Screenshots as in Acceptance, plus a check that the banner fits on one line at 1280 px. If it does not fit, stop and report; do not shorten the text.

## Owner decisions, 2026-11-16 (second set, after the A1 review)

- **Chooser label** (`Flight.tsx:43`): `Change flight model…`. The accessible name is the same.
- **README** (`README.md:30-34`): the blockquote becomes `**0.10 beta.**`, followed by the full claim, followed by `See the [accuracy record](docs/accuracy.md) for tested cases and known limits before using any number operationally.`
