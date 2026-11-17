# A1 Gate 1 research — incomplete, not accepted

Base `a8ae71cd9709883db2b4e7b585b086778a7dc5c7`; E1 source inspected read-only at `2af6527`. Research only. The orchestrator and owner decide; this is not an acceptance. The pin and export/report inventories below require completion before Gate 1 can be called complete.

| Row | Current behavior and proposed short wording | Pins found; risk |
|---|---|---|
| Nozzle limit | `src/console/stages/AeroControls.tsx:148-163,196-199` accepts up to 1 m and warns above the flight limit. Propose: “Nozzle exit must not exceed the aft body diameter.” Block run before dispatch; equality allowed. | `src/console/stages/accuracyBundle.test.tsx:303-310`, `src/console/stages/nozzleBackPressureDefault.test.tsx:117`, `src/console/data/builtUpDrag.test.ts:110`. Risk: must match engine for every topology and preserve existing saved designs. |
| Claim | `src/console/evidenceClaims.ts:15-20`, `index.html:170` omit input conditions. Banner: “Beta · not flight approval · 5.6% average apogee error with declared inputs (development data)”. Full: “With site temperature and nozzle exit declared, apogee error averaged 5.6% across 20 published rockets; 18 of 20 were within 10%.” | `src/console/stageRendering.test.tsx:69,71`, `scripts/preview-journeys.mjs:116`. Risk: banner needs a rendered check; “declared inputs” alone is ambiguous, so full text must name them. |
| Typical error | `src/console/data/expectedError.ts:22` says “Typical error ±X %”. Propose “Average apogee error X % (development data; not a limit)”, retaining values. | `src/console/data/expectedError.test.ts:11`, `src/console/stages/expectedError.integration.test.tsx:27,45`. Risk: regime-specific in-sample average could still be read as a prediction interval. |
| Blind-test sentence | `index.html:170`, `src/console/evidenceClaims.ts:20` tie fallback to the legacy blind test. Propose: “Unsupported shapes use legacy drag. A separate legacy-model blind test on one small subsonic rocket ran 6–10% high.” | `src/console/stageRendering.test.tsx:71`, `scripts/preview-journeys.mjs:116`. Risk: no refused-shape blind evidence; see `docs/internal/execution-runs/goal-collegiate-accuracy/step4/PHYSICS-REVIEW-1.md`, finding 6. |
| Back pressure | `src/console/stages/AeroControls.tsx:174-178` omits assumptions. Add “Assumes a sea-level thrust curve and this motor’s exit diameter.” | `src/console/stages/nozzleBackPressureDefault.test.tsx:57`. Risk: neither assumption is verified; physics review finding 7. |
| Chip | `src/console/stages/Flight.tsx:43` says “Flight model: Legacy (supported)”. Options: “Flight model: Supported”; or remove. Recommend removal if redundant, since “supported” can imply validation. | `src/console/stages/flightLayout.test.tsx:118,122,130`. Risk: removal may hide useful model context. |
| Public text | `docs/accuracy.md:3-6`, `CHANGELOG.md:202-205`, `.github/workflows/release.yml:72` use legacy-only wording. Propose current conditional development claim and separate blind-test sentence in accuracy page and release draft; add a current changelog entry, preserving the historical entry. | No exact assertion found in the searches so far. Risk: final claims await blind evidence and owner approval (`RELEASE-READINESS-REPORT.md:65-69`). |

## Numerical sources and banner

`docs/internal/execution-runs/goal-collegiate-accuracy/STEP0-BENCHMARK-SPEC.md:237-253`, Amendment 3 arm B, records MAE 5.623962788961215% and 18 of 20 within ±10%; rounding yields 5.6%. `RELEASE-READINESS-REPORT.md:35` records frozen arm C 5.3534 / 16 and fully blank 5.8755 / 16. These are development results, not blind performance.

The current banner has 98 characters; the proposal has 94 (Python `len`, counting Unicode code points). This is only the requested character comparison, not proof of rendered fit: proportional glyph widths and adjacent controls matter. A production-CSP screenshot remains required.

## E1 nozzle rule

`crates/astraea-engine/src/models.rs:1372-1387` in E1 iterates components in reverse order and takes the first available `aft_diameter` for a transition, `outer_diameter` for a body tube unless it is a motor mount, or `base_diameter` for a nosecone; it skips other kinds. No diameter produces an error. It validates both vehicle and option diameters as finite and between zero and that value inclusive. Thus a trailing boattail uses its aft diameter, a fin after a tube is skipped and the tube is used, and a single tube uses its outer diameter. This is list order, not an independently computed geometric aftmost station. The app has design fields but equivalence for all serialized topologies is not established. Recommend exposing the engine's validation or resolved diameter before a run through an engine export, reusing the actual rule; coordinate with E1 rather than duplicate it in TypeScript. Existing engine error is post-dispatch unless exposed separately.

## E1 fallback and consumers — partial audit

`crates/astraea-engine/src/models.rs:1422-1435,1518-1533` wraps any `design_from_app_vehicle` error as `legacy drag used (refused: {reason})`; the other literal reason is `no eligible ascent ladder rows in either phase`. Error text is generated dynamically: `crates/astraea-core/src/calibrated/mod.rs:55-60` prefixes unsupported and design errors. Examples include elliptical and freeform fins (`crates/astraea-core/src/aero_model.rs:103-112`) and topology, input and fin errors (`crates/astraea-core/src/calibrated/from_vehicle.rs:102-155,237-292,378-393,435-436,468-469,492-531,579-634,655-660`). This is not yet the requested exhaustive reason-text inventory.

| Consumer | Result |
|---|---|
| Flight single and ensemble, `src/console/stages/Flight.tsx:197-210,259-261,315-317` | Shows verbatim engine text and an explicit warning when recognized. |
| Saved Runs, `src/console/stages/SavedRuns.tsx:182-194` | Shows saved engine text and warning when recognized, subject to recorded inputs. |
| Model Status single, `src/console/evidence/ModelStatusPanel.tsx:149-153` | Shows text and explicit warning when recognized. |
| Model Status ensemble-only, `src/console/evidence/ModelStatusPanel.tsx:157-159` | Shows verbatim refusal text, but no separate warning. |
| Archive, `src/application/runCases.ts:78-79,226-227` | Stores verbatim outcome only when archival conditions hold. |
| Build trace, `src/console/stages/Build.tsx:149` | Passes whole engine manifest; downstream export/report behavior still needs audit. |

Classifier `src/console/data/builtUpDrag.ts:41-45` requires the legacy prefix and `; legacy drag used (refused: `; E1's two manifest forms match that pattern. Fixtures/assertions found: `src/application/runCases.test.ts:352`, `src/console/data/expectedError.test.ts:26`, `src/console/data/consoleData.test.ts:266`, `src/console/data/builtUpDrag.test.ts:89,127`, `src/console/stages/accuracyBundle.test.tsx:117,121`, `src/console/stages/SavedRuns.test.tsx:516`, `scripts/accuracy-closeout.mjs:56`. This inventory still needs a full audit of indirect assertions and exports.
