# C15 adapter matrix (UI2 pre-implementation specification)

> **Point-in-time integration inventory.** The table below originated on 2026-09-14 and received later row amendments. It distinguishes tested modules from UI consumers, but is not a fresh end-to-end desktop acceptance report. See [current project status](project-status.md) for priority and verification boundaries; recheck each row in the current UI before closing it.

Binding spec for the plan's §9 paragraph-2 requirement: one row per
direction/format before any implementation claim. Status is grounded in
`src/formats`, `src/sim`, `src/evidence`, and UI consumers inspected
2026-09-14 at `36f740b` (+ uncommitted S2 shell draft, unrelated).

> Provenance: sourced from the ui2 lane (`9a459e9`); main owns this copy
> from here forward — lane agents propose matrix edits to the coordinator
> instead of forking it. Row 12 updated main-side (RSE export shipped).

Legend: **tested** = module exists, vitest suite pins behavior, UI path
exists where claimed. **unwired** = module exists and is tested but no UI
surface triggers it (or the UI path is untested/ad-hoc). **missing** = no
module, with the prerequisite that unlocks it.

## Matrix

| # | Direction / format | Status | Grounding |
|---|---|---|---|
| 1 | JSON project read (versioned, schema migration) | tested engine / **wired (2026-09-26)** | `readProject` (`src/formats/projectJson.ts`) + `projectJson.test.ts` (legacy bare-vehicle migration, fail-closed validation, future-version refusal). `Header.tsx` `.json` import and `App.tsx` drop import now call `readProject` and re-register non-certified motor records; a rejected document fails closed (Header `alert`, App inline disclosure). Header **Open** also reads the durable browser slot. Pins: `App.test.tsx` envelope drop + unknown-version refusal, `Header.test.tsx`. |
| 2 | JSON project write (versioned, schema migration) | tested engine / **wired (2026-09-26)** | `writeProject` + `createProjectStore` stale-write guard, same suite. `Header.tsx` `handleExportJson` builds an envelope via `createProjectEnvelope` (vehicle + session custom-motor records + derived bindings) and serializes with `writeProject`; Header **Save** commits the same envelope through `projectStorage.ts` (`createDurableProject`) to a revisioned localStorage slot, refusing a stale base and never overwriting corrupt bytes. Pins: `projectStorage.test.ts`, `Header.test.tsx`. |
| 3 | ORK read (supported subset) | tested | `parseOrkFile` (`src/formats/orkParser.ts`), round-trip suite `orkParser.test.ts` (F2 mass fidelity), wired in `Header.tsx` import + `App.tsx` drop. Traverses stage/subcomponents; elliptical + von Kármán mapped. |
| 4 | ORK write (supported subset) | tested | `exportToOrk`, same suite, Header download path. Subset limit: emits exactly one `Sustainer Stage`; multi-stage/clustered input fidelity is unpinned and the UI shows no loss report (prerequisite: staged-file adapter test + loss disclosure). |
| 5 | RKT read (supported subset) | tested | `parseRktString` (`rktParser.ts`), `rktParser.test.ts`, wired in Header/App. Reads `Stage*Parts` keys; RockSim ShapeCode 1–4 mapped (von Kármán → ogive by construction). Elliptical-fin import mapping is unpinned (parser imports only the trapezoid type). |
| 6 | RKT write (supported subset) | tested | `exportRkt` (`rktExport.ts`) + round-trip suite (`rktExport.test.ts`), wired via `InteropExportPanel.tsx` row-6 trigger with `describeRktPreview` omission preview (fail-closed on elliptical sets). Subset: throws on `ellipticalfinset` and anything outside nosecone/bodytube/transition/trapezoidfinset/mass/parachute; fin/parachute/mass sets require a preceding tube. |
| 7 | CDX1 export | tested | `exportCdx1` (`rasaero.ts`), `rasaero.test.ts`, wired via `InteropExportPanel.tsx`. OML stations in inches, one station per component, fail-closed on non-finite dimensions. |
| 8 | CDX1 import | missing (tracked separately) | No `parseCdx`-like module. Prerequisite: OML station parser + component-fitting strategy (ill-posed: stations underdetermine part types); import lands as reference/display geometry, never as editable parts, until fitting is specified and tested. |
| 9 | ENG read | tested | `parseRaspEng` (`engParser.ts`), `engParser.test.ts`, wired in Header `.eng` import. Strict numeric tokens, curve checks, metrics recomputed. |
| 10 | ENG write | tested | `exportToEng`, round-trip suite over every certified motor (exact dialect `parseRaspEng` accepts), wired via `InteropExportPanel.tsx` row-6 trigger with `describeEngPreview` (derivative-labeling omissions stated). |
| 11 | RSE import | tested | `parseRseXml`, same suite, wired in Header `.rse` import. Field-spelling tolerant, data-tree harvest, `buildMotorSpec` finalizer shared with ENG. |
| 12 | RSE export | tested engine / **wired (2026-09-26)** | `exportToRse` (`engParser.ts`), round-trip suite over every certified motor + derived-motor + fail-closed cases. Designation mapping documented and now surfaced per record by `describeRsePreview`: manufacturer-prefixed codes round-trip exactly, others re-import manufacturer-qualified. Row-6 trigger `.rse` ships in `InteropExportPanel` with the omission preview. |
| 13 | Wind CSV data import | tested parser / **wired (2026-09-26)** | `parseWindProfileCsv` + `toManualWindTable` (`sim/windProfile.ts`), `windProfile.test.ts` (headers, units, direction normalization, fail-closed rows). `TrajectoryStudio` now has an **Import CSV** control that replaces the manual table only after the whole file parses and converts; a rejected file leaves the hand-entered rows untouched and reports why (pinned in `TrajectoryStudio.test.tsx`). Still open: a persistent wind snapshot in the project envelope and the background Monte Carlo host (E1). |
| 14 | Log CSV data import | tested parser / missing mapping | `parseAltimeterCsv` (`evidence/altimetry.ts`), `evidence.test.ts`, paste-wired in `EvidenceStudio.tsx`. Missing: dialect/unit mapping view, raw-bytes checksum preservation, processing-step log (S6). Generic CSV parsing is not native avionics support. |
| 15 | Aero CSV purpose-export | tested | `exportAeroMatrix`, `rasaero.test.ts` (header, order, finite guards), wired via `InteropExportPanel.tsx`. Declared approximation: subsonic Barrowman `CNa` at AoA 0, CP from the power-off curve. |
| 16 | KML purpose-export | tested trigger / empty-payload refuse | `exportKml` (`sim/waiverContainment.ts`), `waiverContainment.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeKmlPreview`. Refuses fail-closed while the S4 job service has not published the chosen run's telemetry payload (`lastSimRun` projects identity with empty series — never fabricated). Prerequisite: S4 telemetry payload channel. |
| 17 | STEP purpose-export | tested | `tessellateVehicle` + `exportStep` (`stepExport.ts`), `stepExport.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeStepPreview` (OML-only omissions stated). OML only: no hollow interiors, wall thickness, mounts, or fin cross-section shaping; mass/parachute skipped by design. |
| 18 | STL purpose-export | tested | `exportStlBinary` (`stlExport.ts`), `stlExport.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeStlPreview` (SI-metre caveat stated). Same OML scope as STEP. Full arbitrary CAD STEP *import* is not established by this export decision. |
| 19 | SVG purpose-export | tested | `exportBlueprintSvg` (`blueprint.ts`), `blueprint.test.ts`, wired via `InteropExportPanel.tsx`. Light/dark themes (Q11); fin-after-tube precondition fail-closed. |
| 20 | PNG purpose-export | tested | `renderBlueprintPng` (`blueprintPng.ts`), `blueprintPng.test.ts` + panel test (F1 callback-form `toBlob`), wired via panel using the light theme. Fail-closed on empty SVG / missing encoder. |

## UI wiring map (checked consumers)

- Header import: `.ork` (parse), `.rkt` (parse), `.json` (versioned envelope via `readProject`, legacy bare vehicle migrated), `.eng`/`.rse` (parse). Header export: `.ork`, versioned `.astraea.json` envelope via `writeProject`. App drop import: `.rkt`, `.json` envelope, `.ork`.
- `InteropExportPanel`: `.cdx1`, aero-matrix `.csv`, blueprint `.svg`/`.png`, plus row-6 triggers `.rkt`/`.eng`/`.rse`/`.kml`/`.step`/`.stl` with omission previews. All planned row-6 triggers now exist; the KML trigger still refuses until a chosen run has a published telemetry payload.
- `EvidenceStudio`: log-CSV + GPX paste (GPX via `parseGpxTrack` → `gpsToEnu` → `gpsAltitudeSeries`); RecoveryCard derived-bay 2D strip. `TrajectoryStudio`: manual wind table only (no CSV consumer). `SimFlightOverlay`: back-cast via `backcastTouchdown` engine; no dedicated GPS report surface.
- Live motor search/download (`thrustcurveApi.ts`): tested module, no component/store consumer.
- Project envelope (`projectJson.ts`): tested engine, no component/store consumer.
- Curve editor (`curveEditing.ts`): tested engine, no component consumer. Onboarding (`questionnaire/guidance/explainers/tour`): tested content, shell wiring deferred to S7.

## Missing-cell list (prerequisite order)

1. ~~Versioned JSON project read/write UI cutover (S3)~~ — SHIPPED 2026-09-26 for the file import/export paths **and** the revisioned durable slot (Header Save/Open over `projectStorage.ts`, localStorage-backed). Remaining scope: the envelope carries vehicle + motor records + bindings, while cases/snapshots/evidenceRefs are accepted by the API but not yet populated by the UI.
2. CDX1 import strategy (reference-only until fitting specified).
3. ~~RSE export trigger~~ — SHIPPED 2026-09-26 (`.rse` trigger + `describeRsePreview` omission preview; pinned by preview and panel tests).
4. Wind-CSV import view — SHIPPED 2026-09-26 (TrajectoryStudio Import CSV replaces the manual table, fail-closed). Background Monte Carlo host — SHIPPED 2026-09-26 (chunked `run_ensemble_chunk` ranges with progress and cancel, cap raised to 1000 runs; see E1). Still open: persistent wind snapshot / loads consumption (S5).
5. Log mapping/unit review + raw preservation (S6).
6. ~~RKT/ENG/RSE/KML/STEP/STL download triggers with omission previews (S7 export pass)~~ — ALL SHIPPED (RSE added 2026-09-26); KML refuses until the S4 payload channel publishes.
7. ORK/RKT staged-file adapter tests + UI loss disclosure.
8. Live motor-cache flow (browser/cache/error/provenance) for `thrustcurveApi`.
