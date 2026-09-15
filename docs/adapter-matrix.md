# C15 adapter matrix (UI2 pre-implementation specification)

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
| 1 | JSON project read (versioned, schema migration) | missing | No schema version or migration exists anywhere in `src` (no `schemaVersion`/migrat match). `App.tsx`/`Header.tsx` do `JSON.parse` → `setVehicle` on a bare vehicle: unvalidated, untested, no revision/binding/case content. |
| 2 | JSON project write (versioned, schema migration) | missing | `Header.tsx` `handleExportJson` writes `JSON.stringify(vehicle)` — bare vehicle, no version, no test. Prerequisite: project schema (revisions, motor records/provenance, bindings, cases, snapshots, evidence refs) + migration chain + stale-write guard (S3). |
| 3 | ORK read (supported subset) | tested | `parseOrkFile` (`src/formats/orkParser.ts`), round-trip suite `orkParser.test.ts` (F2 mass fidelity), wired in `Header.tsx` import + `App.tsx` drop. Traverses stage/subcomponents; elliptical + von Kármán mapped. |
| 4 | ORK write (supported subset) | tested | `exportToOrk`, same suite, Header download path. Subset limit: emits exactly one `Sustainer Stage`; multi-stage/clustered input fidelity is unpinned and the UI shows no loss report (prerequisite: staged-file adapter test + loss disclosure). |
| 5 | RKT read (supported subset) | tested | `parseRktString` (`rktParser.ts`), `rktParser.test.ts`, wired in Header/App. Reads `Stage*Parts` keys; RockSim ShapeCode 1–4 mapped (von Kármán → ogive by construction). Elliptical-fin import mapping is unpinned (parser imports only the trapezoid type). |
| 6 | RKT write (supported subset) | unwired | `exportRkt` (`rktExport.ts`) + round-trip suite (`rktExport.test.ts`: preset parity, mount/`assignedMotorId` survival, fail-closed `UnsupportedRktComponentError`). **No UI download path** — Header offers `.ork`/JSON only. Subset: throws on `ellipticalfinset` and anything outside nosecone/bodytube/transition/trapezoidfinset/mass/parachute; fin/parachute/mass sets require a preceding tube. Prerequisite: download trigger + omission preview. |
| 7 | CDX1 export | tested | `exportCdx1` (`rasaero.ts`), `rasaero.test.ts`, wired via `InteropExportPanel.tsx`. OML stations in inches, one station per component, fail-closed on non-finite dimensions. |
| 8 | CDX1 import | missing (tracked separately) | No `parseCdx`-like module. Prerequisite: OML station parser + component-fitting strategy (ill-posed: stations underdetermine part types); import lands as reference/display geometry, never as editable parts, until fitting is specified and tested. |
| 9 | ENG read | tested | `parseRaspEng` (`engParser.ts`), `engParser.test.ts`, wired in Header `.eng` import. Strict numeric tokens, curve checks, metrics recomputed. |
| 10 | ENG write | unwired | `exportToEng`, round-trip suite over every certified motor (exact dialect `parseRaspEng` accepts). **No UI trigger.** Prerequisite: motor-library export action with derivative labeling (Q8). |
| 11 | RSE import | tested | `parseRseXml`, same suite, wired in Header `.rse` import. Field-spelling tolerant, data-tree harvest, `buildMotorSpec` finalizer shared with ENG. |
| 12 | RSE export | tested | `exportToRse` (`engParser.ts`), round-trip suite over every certified motor + derived-motor + fail-closed cases (main `2cca0b8`). Designation mapping documented: manufacturer-prefixed codes round-trip exactly, others re-import manufacturer-qualified. No UI trigger yet (row 6 export pass). |
| 13 | Wind CSV data import | unwired | `parseWindProfileCsv` (`sim/windProfile.ts`), `windProfile.test.ts` (headers, units, direction normalization, fail-closed rows). **No UI consumer** in components/store; `TrajectoryStudio` keeps a manual table. Prerequisite: mapping/units import view, persistent snapshot, real loads consumption (S5). |
| 14 | Log CSV data import | tested parser / missing mapping | `parseAltimeterCsv` (`evidence/altimetry.ts`), `evidence.test.ts`, paste-wired in `EvidenceStudio.tsx`. Missing: dialect/unit mapping view, raw-bytes checksum preservation, processing-step log (S6). Generic CSV parsing is not native avionics support. |
| 15 | Aero CSV purpose-export | tested | `exportAeroMatrix`, `rasaero.test.ts` (header, order, finite guards), wired via `InteropExportPanel.tsx`. Declared approximation: subsonic Barrowman `CNa` at AoA 0, CP from the power-off curve. |
| 16 | KML purpose-export | unwired | `exportKml` (`sim/waiverContainment.ts`), `waiverContainment.test.ts` (KML 2.2, placemarks, LineString, fail-closed). **No UI consumer.** Prerequisite: ensemble/trajectory download path binding member set + altitude mode. |
| 17 | STEP purpose-export | unwired | `tessellateVehicle` + `exportStep` (`stepExport.ts`), `stepExport.test.ts` (AP203 balance, SI-metre context, determinism, fail-closed). **No UI consumer.** OML only: no hollow interiors, wall thickness, mounts, or fin cross-section shaping; mass/parachute skipped by design. Prerequisite: airframe export UI with supported-solid preview + omissions statement. |
| 18 | STL purpose-export | unwired | `exportStlBinary` (`stlExport.ts`), `stlExport.test.ts` (header/count/record layout, normals, volume agreement, fail-closed). SI metres by documented convention. **No UI consumer.** Same prerequisite as STEP. Full arbitrary CAD STEP *import* is not established by this export decision. |
| 19 | SVG purpose-export | tested | `exportBlueprintSvg` (`blueprint.ts`), `blueprint.test.ts`, wired via `InteropExportPanel.tsx`. Light/dark themes (Q11); fin-after-tube precondition fail-closed. |
| 20 | PNG purpose-export | tested | `renderBlueprintPng` (`blueprintPng.ts`), `blueprintPng.test.ts` + panel test (F1 callback-form `toBlob`), wired via panel using the light theme. Fail-closed on empty SVG / missing encoder. |

## UI wiring map (checked consumers)

- Header import: `.ork` (parse), `.rkt` (parse), `.json` (ad-hoc vehicle), `.eng`/`.rse` (parse). Header export: `.ork`, bare JSON. No `.rkt`/`.eng`/`.rse`/CSV/KML/STEP/STL triggers.
- `InteropExportPanel`: `.cdx1`, aero-matrix `.csv`, blueprint `.svg`/`.png`. Nothing else.
- `EvidenceStudio`: log-CSV paste only. `TrajectoryStudio`: manual wind table only.
- Live motor search/download (`thrustcurveApi.ts`): tested module, no component/store consumer.

## Missing-cell list (prerequisite order)

1. Versioned JSON project read/write + migrations (S3) — unlocks durable reload.
2. CDX1 import strategy (reference-only until fitting specified).
3. RSE export writer + round-trip suite.
4. Wind-CSV import view + snapshot + loads consumption (S5).
5. Log mapping/unit review + raw preservation (S6).
6. RKT/ENG/KML/STEP/STL download triggers with omission previews (S7 export pass).
7. ORK/RKT staged-file adapter tests + UI loss disclosure.
8. Live motor-cache flow (browser/cache/error/provenance) for `thrustcurveApi`.
