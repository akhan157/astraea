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
| 1 | JSON project read (versioned, schema migration) | tested engine / unwired UI | `readProject` (`src/formats/projectJson.ts`) + `projectJson.test.ts` (legacy bare-vehicle migration, fail-closed validation, future-version refusal). `App.tsx`/`Header.tsx` still do `JSON.parse` → `setVehicle` on the bare vehicle: unvalidated, no revision/binding/case content. Prerequisite: UI cutover to `readProject`. |
| 2 | JSON project write (versioned, schema migration) | tested engine / unwired UI | `writeProject` + `createProjectStore` stale-write guard, same suite. `Header.tsx` `handleExportJson` still writes `JSON.stringify(vehicle)` — bare vehicle, no version. Prerequisite: UI cutover to `writeProject` envelope. |
| 3 | ORK read (supported subset) | tested | `parseOrkFile` (`src/formats/orkParser.ts`), round-trip suite `orkParser.test.ts` (F2 mass fidelity), wired in `Header.tsx` import + `App.tsx` drop. Traverses stage/subcomponents; elliptical + von Kármán mapped. |
| 4 | ORK write (supported subset) | tested | `exportToOrk`, same suite, Header download path. Subset limit: emits exactly one `Sustainer Stage`; multi-stage/clustered input fidelity is unpinned and the UI shows no loss report (prerequisite: staged-file adapter test + loss disclosure). |
| 5 | RKT read (supported subset) | tested | `parseRktString` (`rktParser.ts`), `rktParser.test.ts`, wired in Header/App. Reads `Stage*Parts` keys; RockSim ShapeCode 1–4 mapped (von Kármán → ogive by construction). Elliptical-fin import mapping is unpinned (parser imports only the trapezoid type). |
| 6 | RKT write (supported subset) | tested | `exportRkt` (`rktExport.ts`) + round-trip suite (`rktExport.test.ts`), wired via `InteropExportPanel.tsx` row-6 trigger with `describeRktPreview` omission preview (fail-closed on elliptical sets). Subset: throws on `ellipticalfinset` and anything outside nosecone/bodytube/transition/trapezoidfinset/mass/parachute; fin/parachute/mass sets require a preceding tube. |
| 7 | CDX1 export | tested | `exportCdx1` (`rasaero.ts`), `rasaero.test.ts`, wired via `InteropExportPanel.tsx`. OML stations in inches, one station per component, fail-closed on non-finite dimensions. |
| 8 | CDX1 import | missing (tracked separately) | No `parseCdx`-like module. Prerequisite: OML station parser + component-fitting strategy (ill-posed: stations underdetermine part types); import lands as reference/display geometry, never as editable parts, until fitting is specified and tested. |
| 9 | ENG read | tested | `parseRaspEng` (`engParser.ts`), `engParser.test.ts`, wired in Header `.eng` import. Strict numeric tokens, curve checks, metrics recomputed. |
| 10 | ENG write | tested | `exportToEng`, round-trip suite over every certified motor (exact dialect `parseRaspEng` accepts), wired via `InteropExportPanel.tsx` row-6 trigger with `describeEngPreview` (derivative-labeling omissions stated). |
| 11 | RSE import | tested | `parseRseXml`, same suite, wired in Header `.rse` import. Field-spelling tolerant, data-tree harvest, `buildMotorSpec` finalizer shared with ENG. |
| 12 | RSE export | tested engine / unwired UI | `exportToRse` (`engParser.ts`), round-trip suite over every certified motor + derived-motor + fail-closed cases. Designation mapping documented: manufacturer-prefixed codes round-trip exactly, others re-import manufacturer-qualified. **No UI trigger** — ENG trigger covers `.eng` only; RSE trigger is the remaining row-6 gap. |
| 13 | Wind CSV data import | unwired | `parseWindProfileCsv` (`sim/windProfile.ts`), `windProfile.test.ts` (headers, units, direction normalization, fail-closed rows). **No UI consumer** in components/store; `TrajectoryStudio` keeps a manual table. Prerequisite: mapping/units import view, persistent snapshot, real loads consumption (S5). |
| 14 | Log CSV data import | tested parser / missing mapping | `parseAltimeterCsv` (`evidence/altimetry.ts`), `evidence.test.ts`, paste-wired in `EvidenceStudio.tsx`. Missing: dialect/unit mapping view, raw-bytes checksum preservation, processing-step log (S6). Generic CSV parsing is not native avionics support. |
| 15 | Aero CSV purpose-export | tested | `exportAeroMatrix`, `rasaero.test.ts` (header, order, finite guards), wired via `InteropExportPanel.tsx`. Declared approximation: subsonic Barrowman `CNa` at AoA 0, CP from the power-off curve. |
| 16 | KML purpose-export | tested trigger / empty-payload refuse | `exportKml` (`sim/waiverContainment.ts`), `waiverContainment.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeKmlPreview`. Refuses fail-closed while the S4 job service has not published the chosen run's telemetry payload (`lastSimRun` projects identity with empty series — never fabricated). Prerequisite: S4 telemetry payload channel. |
| 17 | STEP purpose-export | tested | `tessellateVehicle` + `exportStep` (`stepExport.ts`), `stepExport.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeStepPreview` (OML-only omissions stated). OML only: no hollow interiors, wall thickness, mounts, or fin cross-section shaping; mass/parachute skipped by design. |
| 18 | STL purpose-export | tested | `exportStlBinary` (`stlExport.ts`), `stlExport.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeStlPreview` (SI-metre caveat stated). Same OML scope as STEP. Full arbitrary CAD STEP *import* is not established by this export decision. |
| 19 | SVG purpose-export | tested | `exportBlueprintSvg` (`blueprint.ts`), `blueprint.test.ts`, wired via `InteropExportPanel.tsx`. Light/dark themes (Q11); fin-after-tube precondition fail-closed. |
| 20 | PNG purpose-export | tested | `renderBlueprintPng` (`blueprintPng.ts`), `blueprintPng.test.ts` + panel test (F1 callback-form `toBlob`), wired via panel using the light theme. Fail-closed on empty SVG / missing encoder. |

## UI wiring map (checked consumers)

- Header import: `.ork` (parse), `.rkt` (parse), `.json` (legacy bare vehicle — `readProject` cutover pending), `.eng`/`.rse` (parse). Header export: `.ork`, bare JSON (`writeProject` envelope cutover pending).
- `InteropExportPanel`: `.cdx1`, aero-matrix `.csv`, blueprint `.svg`/`.png`, plus row-6 triggers `.rkt`/`.eng`/`.kml`/`.step`/`.stl` with omission previews. Remaining row-6 gap: `.rse` trigger (writer + suite ship, no trigger).
- `EvidenceStudio`: log-CSV + GPX paste (GPX via `parseGpxTrack` → `gpsToEnu` → `gpsAltitudeSeries`); RecoveryCard derived-bay 2D strip. `TrajectoryStudio`: manual wind table only (no CSV consumer). `SimFlightOverlay`: back-cast via `backcastTouchdown` engine; no dedicated GPS report surface.
- Live motor search/download (`thrustcurveApi.ts`): tested module, no component/store consumer.
- Project envelope (`projectJson.ts`): tested engine, no component/store consumer.
- Curve editor (`curveEditing.ts`): tested engine, no component consumer. Onboarding (`questionnaire/guidance/explainers/tour`): tested content, shell wiring deferred to S7.

## Missing-cell list (prerequisite order)

1. Versioned JSON project read/write UI cutover (S3) — engine + migration chain + stale-write guard ship tested; Header/App still use the legacy bare shape.
2. CDX1 import strategy (reference-only until fitting specified).
3. RSE export trigger (writer + round-trip suite ship; ENG-style trigger + preview pending).
4. Wind-CSV import view + snapshot + loads consumption (S5); MC worker host with progress/cancel (E1 same work package).
5. Log mapping/unit review + raw preservation (S6).
6. ~~RKT/ENG/KML/STEP/STL download triggers with omission previews (S7 export pass)~~ — SHIPPED except the RSE trigger (item 3); KML refuses until the S4 payload channel publishes.
7. ORK/RKT staged-file adapter tests + UI loss disclosure.
8. Live motor-cache flow (browser/cache/error/provenance) for `thrustcurveApi`.
