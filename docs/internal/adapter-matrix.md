# C15 adapter matrix (historical UI2 specification with current format status)

> **Point-in-time integration inventory.** The table below originated on 2026-09-14 and received later row amendments. It is not a fresh end-to-end desktop acceptance report. The former closed-format `.CDX1` import/export rows were removed in the 2026-10-17 homemade-only cutover. See [current project status](project-status.md) for priority and verification boundaries.

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

## Current Console / website cutover (release/v1)

Browser and desktop now use the same Rust WebAssembly engine and worker pool;
format parsing/export remains shared frontend code. `src/console/shell/ProjectChrome.tsx`
and `src/state/projectIo.ts` own current Save/Open, not the historical Header/App
consumers listed below. Durable project slots use IndexedDB with a localStorage
fallback, automatic legacy reads/migration and atomic stale-write checks.
Chrome/Edge file-picker saves fall back to downloads where unsupported; opening
files remains explicit and validated. No OS double-click association or cloud
project storage is claimed. Existing format-subset limits still apply.

## Matrix (historical consumers)

| # | Direction / format | Status | Grounding |
|---|---|---|---|
| 1 | JSON project read (versioned, schema migration) | tested engine / **wired (2026-09-26)** | `readProject` (`src/formats/projectJson.ts`) + `projectJson.test.ts` (legacy bare-vehicle migration, fail-closed validation, future-version refusal). `Header.tsx` `.json` import and `App.tsx` drop import now call `readProject` and re-register non-certified motor records; a rejected document fails closed (Header `alert`, App inline disclosure). Header **Open** also reads the durable browser slot. Pins: `App.test.tsx` envelope drop + unknown-version refusal, `Header.test.tsx`. |
| 2 | JSON project write (versioned, schema migration) | tested engine / **wired (2026-09-26)** | `writeProject` + `createProjectStore` stale-write guard, same suite. `Header.tsx` `handleExportJson` builds an envelope via `createProjectEnvelope` (vehicle + session custom-motor records + derived bindings) and serializes with `writeProject`; Header **Save** commits the same envelope through `projectStorage.ts` (`createDurableProject`) to a revisioned IndexedDB slot (localStorage where IndexedDB is missing), refusing a stale base and never overwriting corrupt bytes. Pins: `projectStorage.test.ts`, `Header.test.tsx`. |
| 3 | ORK read (supported subset) | tested | `parseOrkFile` (`src/formats/orkParser.ts`), round-trip suite `orkParser.test.ts` (F2 mass fidelity), wired in `Header.tsx` import + `App.tsx` drop. Traverses stage/subcomponents; elliptical + von Kármán mapped. |
| 4 | ORK write (supported subset) | tested | `exportToOrk`, same suite, Header download path. Subset limit: emits exactly one `Sustainer Stage`; multi-stage/clustered input fidelity is unpinned and the UI shows no loss report (prerequisite: staged-file adapter test + loss disclosure). |
| 5 | RKT read (supported subset) | tested | `parseRktString` (`rktParser.ts`), `rktParser.test.ts`, wired in Header/App. Reads `Stage*Parts` keys; RockSim ShapeCode 1–4 mapped (von Kármán → ogive by construction). Elliptical-fin import mapping is unpinned (parser imports only the trapezoid type). |
| 6 | RKT write (supported subset) | tested | `exportRkt` (`rktExport.ts`) + round-trip suite (`rktExport.test.ts`), wired via `InteropExportPanel.tsx` row-6 trigger with `describeRktPreview` omission preview (fail-closed on elliptical sets). Subset: throws on `ellipticalfinset` and anything outside nosecone/bodytube/transition/trapezoidfinset/mass/parachute; fin/parachute/mass sets require a preceding tube. |
| 9 | ENG read | tested | `parseRaspEng` (`engParser.ts`), `engParser.test.ts`, wired in Header `.eng` import. Strict numeric tokens, curve checks, metrics recomputed. |
| 10 | ENG write | tested | `exportToEng`, round-trip suite over every certified motor (exact dialect `parseRaspEng` accepts), wired via `InteropExportPanel.tsx` row-6 trigger with `describeEngPreview` (derivative-labeling omissions stated). |
| 11 | RSE import | tested | `parseRseXml`, same suite, wired in Header `.rse` import. Field-spelling tolerant, data-tree harvest, `buildMotorSpec` finalizer shared with ENG. |
| 12 | RSE export | tested engine / **wired (2026-09-26)** | `exportToRse` (`engParser.ts`), round-trip suite over every certified motor + derived-motor + fail-closed cases. Designation mapping documented and now surfaced per record by `describeRsePreview`: manufacturer-prefixed codes round-trip exactly, others re-import manufacturer-qualified. Row-6 trigger `.rse` ships in `InteropExportPanel` with the omission preview. |
| 13 | Wind CSV data import | tested parser / **wired (2026-09-26)** | `parseWindProfileCsv` + `toManualWindTable` (`sim/windProfile.ts`), `windProfile.test.ts` (headers, units, direction normalization, fail-closed rows). `TrajectoryStudio` now has an **Import CSV** control that replaces the manual table only after the whole file parses and converts; a rejected file leaves the hand-entered rows untouched and reports why (pinned in `TrajectoryStudio.test.tsx`). Still open: a persistent wind snapshot in the project envelope and the background Monte Carlo host (E1). |
| 14 | Log CSV data import | tested parser / **wired with provenance (2026-09-26)** | `parseAltimeterCsv` (`evidence/altimetry.ts`), `evidence.test.ts`, paste + **Import file** in `EvidenceStudio.tsx`. `evidence/logProvenance.ts` records what was received: source file name (pasted text stays unnamed, never fabricated), SHA-256 of the exact text via `crypto.subtle` (`unavailable` when absent, never a placeholder), parsed rows, a dialect hint (`altos-csv` only on an explicit AltOS marker or AltOS-typical sensor columns beside a recognized time+altitude header, else `generic-csv`), the parser's stated time/altitude unit assumptions, and skipped lines. **Units (2026-10-18):** feet and millisecond headers are converted, and the Evidence studio's time/altitude unit selectors override the header; provenance states whether each unit came from the header, a user override, or the default assumption. Still missing: a dialect override (the dialect is a display hint and changes no parsing) and a processing-step log (S6). Generic CSV parsing is not native avionics support. |
| 16 | KML purpose-export | tested trigger / empty-payload refuse | `exportKml` (`sim/waiverContainment.ts`), `waiverContainment.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeKmlPreview`. Refuses fail-closed while the S4 job service has not published the chosen run's telemetry payload (`lastSimRun` projects identity with empty series — never fabricated). Prerequisite: S4 telemetry payload channel. |
| 17 | STEP purpose-export | tested | `tessellateVehicle` + `exportStep` (`stepExport.ts`), `stepExport.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeStepPreview` (OML-only omissions stated). OML only: no hollow interiors, wall thickness, mounts, or fin cross-section shaping; mass/parachute skipped by design. |
| 18 | STL purpose-export | tested | `exportStlBinary` (`stlExport.ts`), `stlExport.test.ts`, wired via `InteropExportPanel.tsx` row-6 trigger with `describeStlPreview` (SI-metre caveat stated). Same OML scope as STEP. Full arbitrary CAD STEP *import* is not established by this export decision. |
| 19 | SVG purpose-export | tested | `exportBlueprintSvg` (`blueprint.ts`), `blueprint.test.ts`, wired via `InteropExportPanel.tsx`. Light/dark themes (Q11); fin-after-tube precondition fail-closed. |
| 20 | PNG purpose-export | tested | `renderBlueprintPng` (`blueprintPng.ts`), `blueprintPng.test.ts` + panel test (F1 callback-form `toBlob`), wired via panel using the light theme. Fail-closed on empty SVG / missing encoder. |
| 21 | FinSim `.FIN` read | **removed (2026-10-17)** | The former row described a vendor-derived `parseFinString` (`finParser.ts`, `finParser.test.ts`) reading nine shipped FinSim sample files. No such module, suite or fixture exists in this tree (grepped 2026-10-17), and the vendor research notes, sample corpus and vendored package descriptor were removed with the homemade-only publication cleanup. No `.FIN` import is claimed, exposed or documented. |

## UI wiring map (checked consumers)

- Header import: `.ork`, `.rkt`, `.astraea.json` / `.astraea` / `.json` (versioned envelope via `readProject`, legacy bare vehicle migrated), `.eng`/`.rse`. Header export: `.ork`, versioned `.astraea.json` envelope via `writeProject`. App drop import: `.rkt`, `.json` envelope, `.ork`.
- `InteropExportPanel`: blueprint `.svg`/`.png`, plus row-6 triggers `.rkt`/`.eng`/`.rse`/`.kml`/`.step`/`.stl` with omission previews. All planned row-6 triggers now exist; the KML trigger still refuses until a chosen run has a published telemetry payload.
- `EvidenceStudio`: log-CSV + GPX paste (GPX via `parseGpxTrack` → `gpsToEnu` → `gpsAltitudeSeries`); RecoveryCard derived-bay 2D strip. `TrajectoryStudio`: manual wind table only (no CSV consumer). `SimFlightOverlay`: back-cast via `backcastTouchdown` engine; no dedicated GPS report surface.
- Live motor search/download (`thrustcurveApi.ts`): **wired 2026-09-26** — PropulsionStudio has a ThrustCurve search panel (injected `fetchImpl`, results list, per-result Import that downloads the simfile, parses `.eng`/`.rse`, and registers the motor in the store). Inline status only; no modal. Pins: `PropulsionStudio.test.tsx`.
- Project envelope (`projectJson.ts`): **wired 2026-09-26** — Header import/export, App drop import, and the Header Save/Open durable slot (`projectStorage.ts`). Since 2026-10-18, save/export populates cases (completed flight and Monte Carlo runs), snapshots (manual/forecast wind profiles, ensemble dispersion statistics) and evidenceRefs (indexed from the ledger); cases from an opened file are carried forward.
- Curve editor (`curveEditing.ts`): tested engine, no component consumer. Onboarding (`questionnaire/guidance/explainers/tour`): tested content, shell wiring deferred to S7.

## Missing-cell list (prerequisite order)

1. ~~Versioned JSON project read/write UI cutover (S3)~~ — SHIPPED 2026-09-26 for the file import/export paths **and** the revisioned durable slot (Header Save/Open over `projectStorage.ts`, IndexedDB-backed since 2026-10-19 with a localStorage fallback). Remaining scope: the envelope carries vehicle + motor records + bindings, and, since 2026-10-18, cases/snapshots/evidenceRefs too.
2. ~~Native XML CDX1 geometry import and omission-preview export~~ — removed in the 2026-10-17 homemade-only cutover; Astraea no longer ships a closed-format import/export path.
3. ~~RSE export trigger~~ — SHIPPED 2026-09-26 (`.rse` trigger + `describeRsePreview` omission preview; pinned by preview and panel tests).
4. Wind-CSV import view — SHIPPED 2026-09-26 (TrajectoryStudio Import CSV replaces the manual table, fail-closed). Background Monte Carlo host — SHIPPED 2026-09-26 (chunked `run_ensemble_chunk` ranges with progress and cancel, cap raised to 1000 runs; see E1). Persistent wind snapshot shipped 2026-10-18 (weather snapshots in the project envelope). Still open: loads consumption (S5).
5. Log dialect/unit mapping editor (S6) — the provenance block (checksum, rows, dialect hint, unit assumptions, skipped lines) shipped 2026-09-26; unit detection and overrides shipped 2026-10-18. A dialect override is still open.
6. ~~RKT/ENG/RSE/KML/STEP/STL download triggers with omission previews (S7 export pass)~~ — ALL SHIPPED (RSE added 2026-09-26); KML refuses until the S4 payload channel publishes.
7. ORK/RKT staged-file adapter tests + UI loss disclosure.
8. Live motor-cache flow (browser/cache/error/provenance) for `thrustcurveApi`.
