# A1 Gate 1: the three missing lists (orchestrator, read-only)

The A1 author's Gate 1 (`a1-app-wording` @ `a2d6bae`) left three lists incomplete. Two retries failed on Codex usage limits, so the orchestrator compiled the lists by grep on 2026-11-16. This is read-only research; no source was edited. The wording proposals remain the author's, and the owner approves them.

App tree: `a1-app-wording` @ `a2d6bae` (same app source as the goal branch). Engine tree: E1 `t3/built-up-drag-robustness` @ `2af6527`.

## 1. Engine fallback reasons

`grep -rn "legacy drag used" crates/*/src`

| Where | Text | Contains `refused:` |
|---|---|---|
| `crates/astraea-engine/src/models.rs:1523` | `…; legacy drag used (refused: {reason})` (shape refusal) | yes |
| `crates/astraea-engine/src/models.rs:1533` | `…; legacy drag used (refused: no eligible ascent ladder rows in either phase)` (E1 round 3) | yes |

The app classifier is `src/console/data/builtUpDrag.ts:45`. It returns `refused` when the text starts with `legacy 25-station Mach drag tables` and contains `; legacy drag used (refused: `. Both engine texts match.

## 2. Consumers of the drag outcome

`grep -rn -E "builtUpDragStatus|builtUpDragWasRefused|axialDragText|axialDrag\b" src` (non-test files)

| Consumer | What it shows or does | Fallback labelled |
|---|---|---|
| `src/console/stages/Flight.tsx:204` (`AxialDragLine`), used for a single run at `:261` and for dispersion at `:317` | The engine's drag line | yes, with the `BUILT_UP_DRAG_REFUSED` warning |
| `src/console/evidence/ModelStatusPanel.tsx:150-153`, single run | The drag line | yes |
| `src/console/evidence/ModelStatusPanel.tsx:158-159`, **ensemble row** | Raw `axialDrag` text only | **no warning** (gap found by the author; the raw text still says "refused") |
| `src/console/stages/SavedRuns.tsx:188-190` | The saved summary's drag text | yes |
| `src/console/data/expectedError.ts:9-11` | The error band is withheld for refused or legacy drag | yes ("No error band for legacy drag.") |
| `src/console/data/adapter.ts:147` | Status for the flight result | classification only |
| `src/application/runCases.ts:78,226`, `src/formats/projectJson.ts:1298-1309` | Archive and validation of the saved text | stores it verbatim; no display |
| `src/sim/monteCarlo.ts:677` | Ensemble chunks must agree on the text | no display |

## 3. Assertion inventory (texts A1 would change)

Command: `grep -rnF "<substring>" src scripts index.html docs tests e2e .github CHANGELOG.md README.md`, with `docs/internal/` excluded. The regex pins in `scripts/` were checked separately.

| Text | Source | Pins |
|---|---|---|
| Banner `…averaged 5.6% on 20 published rockets (development data)` | `src/console/evidenceClaims.ts:16` | `src/console/stageRendering.test.tsx:69` (`apogee error averaged 5.6%`); `scripts/preview-journeys.mjs:130` (regex `^Beta…not flight approval…5\.6%…development data`) |
| Full claim / landing `Default model: … Not flight approval.` | `src/console/evidenceClaims.ts:20`, `index.html:170` | `scripts/preview-journeys.mjs:116` (regex `^Beta…6–10%…not flight approval`) |
| `Typical error ±X % (dev. data, 20 airframes)` | `src/console/data/expectedError.ts:22` | `src/console/data/expectedError.test.ts:11`; `src/console/stages/expectedError.integration.test.tsx:27,45` |
| `Flight model: Legacy (supported)` | `src/console/stages/Flight.tsx:43` | `src/console/stages/flightLayout.test.tsx:118,122,130` |
| Nozzle exit hint | `src/console/stages/AeroControls.tsx:148` | none on the hint text |
| Back-pressure label | `src/console/stages/AeroControls.tsx:174-186` | `src/console/stages/nozzleBackPressureDefault.test.tsx:57` (author's list) |
| `docs/accuracy.md:3-6` (legacy-only short answer) | public doc | none |
| `CHANGELOG.md:202-205` (legacy-scoped entry) | historical entry: **keep as written**; add a new entry | none |
| `.github/workflows/release.yml:72` `releaseBody` | release draft text | none |

**Gate 1 is complete** with these lists plus the author's `GATE1.md`. Wording now goes to the owner.
