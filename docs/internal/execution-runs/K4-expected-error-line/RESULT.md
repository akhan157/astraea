# K4 expected-error line — in progress

## Summary

Adds a Flight inspector apogee line using the recorded run. No engine changes. Not self-accepted; independent review and the remaining acceptance checks are required.

## Gate 1 as approved

Mach cut points 0.8 and 1.5; maximum cohort Mach 3.1104469596868753 and apogee 22759.99263319612 m. Withhold for legacy/refusal, missing temperature, and above either ceiling. Nozzle exit and tip radius are not required. All 20 airframes qualify on every recorded flight. The seven previously excluded have recorded site temperatures: byrum, cancerdescending, gibb, iondrive, raven and thunder-lightning 37.77777777777777 °C; ezi65 21.111111111111086 °C. The proposed wording says 20 airframes, rather than 20 flights: the frozen groups include two flights each for rabia and full-metal-jacket, so 20 flights would be inaccurate. Wording awaits owner review.

## Files changed

Flight inspector, `expectedError.ts`, generated `cohortError.generated.ts`, focused tests, and this lane's generator and probe. The generator reads the hash-pinned manifest and WASM probe output; change the generated module's option to review maximum rather than MAE.

Saved runs, comparison and stored outputs are unchanged. Export paths left unchanged: project save/open and project JSON; Build exports RKT, ORK, STEP, STL, SVG, ENG, RSE, PNG and KML with optional trace ZIP; flight-sharing card and evidence source downloads. They use recorded data or design outputs, and the approved change is Flight-only. This inventory has not received independent review.

## Commands run

- `free -h`: 9.2 GiB available before probe.
- `pnpm install --offline --frozen-lockfile`: failed, unable to open database. Existing local dependencies used via temporary symlink.
- K4 probe, Vitest `--maxWorkers=2`: exit 0, 1 test. Manifest and WASM hashes asserted. All apogees exactly equal K3 merged output.
- `tsc --noEmit -p .`: first failed on test cast; after correction exit 0.
- Focused Vitest after final source edits: exit 0, 2 files and 9 tests; includes committed-run/live-design UI integration.
- `vite build`: initially failed without WASM; after copying pinned WASM, exit 0; final build exit 0.
- Full Vitest: initial run interrupted after missing-WASM failures; second run interrupted after failures in ShareFlightCard and Monte Carlo bounds. It started before the final layout edit; no full-suite pass claimed.
- `node scripts/browser-smoke.mjs`: earlier-build run interrupted after initial 547 m assertion and several journeys; accuracy-only run interrupted after its 547 m and site-temperature checks. Neither is a completed final-build smoke.

## Tables

Amendment 5: per-airframe median signed error; inside if absolute median <= displayed X; width = 2X. All results are in-sample. Maximum X is rounded upward to a tenth so displayed bands retain maximum coverage. Maximum covers 100% by construction.

| Option | Regime | X | Coverage | Width |
|---|---|---:|---:|---:|
| MAE | Subsonic | 5.5% | 4/8 | 11.0% |
| MAE | Transonic | 5.4% | 4/7 | 10.8% |
| MAE | Supersonic | 6.1% | 3/5 | 12.2% |
| MAE | All | varies | 11/20 | varies |
| Maximum | Subsonic | 11.3% | 8/8 | 22.6% |
| Maximum | Transonic | 8.6% | 7/7 | 17.2% |
| Maximum | Supersonic | 12.3% | 5/5 | 24.6% |
| Maximum | All | varies | 20/20 | varies |

MAE misses 80% in every regime, within 20% width. Maximum meets coverage in every regime but exceeds the 20% width cap in subsonic and supersonic.

| Frozen regime | Airframes | Mach-rule mismatches |
|---|---:|---:|
| Subsonic | 8 | 0 |
| Transonic | 7 | 0 |
| Supersonic | 5 | 0 |

## Screenshots

Built app under production CSP, 1280×800, dark. Private cohort-derived project files stay outside the repository. The screenshots show the actual app simulation and its recorded Mach; their launch inputs are workspace defaults, so they are visual checks, not cohort re-scores.

| Case | Mach shown | Screenshot | SHA-256 |
|---|---:|---|---|
| No band, missing temperature | 0.29 | `K4/screenshots/revised-no-band-dark.png` | `417fe089edb9f69a8087cd919e69d44850abeca94fad59b436a228b5eb1b3159` |
| Subsonic, byrum | 0.72 | `K4/screenshots/revised-byrum-dark.png` | `fa4931b6f86b12d13eede5138cd3ebce4ed261b6d8dd511925236868b415b165` |
| Transonic, raven | 1.08 | `K4/screenshots/revised-raven-dark.png` | `47ef1f8fdb42c24a515ac5253107348e3f09f312492ff71f070b1cd131e3e4a3` |
| Supersonic, proteus6 | 2.79 | `K4/screenshots/revised-proteus6-dark.png` | `4a0518decf9054fef6753384a1a891fcad4aad413282532cd2397aabcdba379f` |

No light-theme capture: the workstation has fixed dark tokens in `src/console/kit/theme.ts` and no light-theme control found. Phone is not applicable: the app shows its desktop-size warning, as captured in `K4/screenshots/final-no-band-phone.png`. The band text is quite dim in the captures and should be assessed by the independent reviewer.

## Deviations

The requested wording says 20 flights; cohort has 20 airframes and 22 flights. Changed label to 20 airframes rather than making a false claim. No reviewer acceptance claimed.

## What was not done

Template probe exit 0: 304.0294885865904, 546.5369328003885 and 5013.508465461415 m; output SHA-256 `23a20cffb623b25424e28e58d965dafc8153ec84b9f21e0aa86955614b56a162`. Independent review remains; light-theme screenshots cannot be made with the current dark-only workstation. The orchestrator owns the full suite and final browser smoke; neither was rerun in this revision. No push, engine rebuild or release.

## Revision after orchestrator review

The nozzle-exit requirement was removed. `tsc --noEmit -p .`, focused Vitest (2 files, 9 tests), and `vite build` exited 0. The private-project generator first failed on an invalid provenance label; after correction it passed. `cohort-screenshots.mjs` exited 0 and closed Chromium and the preview server. Full suite and browser smoke deliberately not run in this revision, at the orchestrator’s instruction.
