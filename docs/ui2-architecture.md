# UI2 architecture and implementation plan

Status: proposed implementation architecture, grounded in the checked-out code at `38292cd`. Read and prepared 2026-09-12. This document is the deliverable of this pass; it does not claim that the planned UI, engine extensions, or acceptance checks have shipped.

UI2 makes one continuous workflow possible: configure a vehicle, assign its motor, choose launch conditions, run a prediction, inspect uncertainty, compare flight evidence, and create a revised configuration. Every screen uses the same committed inputs and identifies the revision behind its outputs.

## 1. Sources, authority, and scope

The requested research corpus was read in this order. Short source labels below link to the local documents; decision citations also name the relevant section or contract.

| Label | Source | Role in this plan |
|---|---|---|
| UX | [UX coherence audit](research/ux-coherence-report.md) | Failure scenarios to prevent; historical findings must be checked against current code. |
| FORUM | [Forum intelligence](research/forum-intel-report.md) | Directional demand: weather/drift, evidence comparison, explainable stability, interoperability. The 16-thread sample and snippet-tier Reddit evidence are not a population survey. |
| TOOLS | [Tool coverage](research/tool-coverage-report.md) | Comparator workflows and opportunities; its prices, availability, and claims of shipped functionality are dated research, not fresh verification. |
| FRONT | [Prior frontend plan](research/frontend-plan.md) | Reusable component and work-package designs. |
| Q | [Approved frontend contracts](research/master-contract-decisions.md) | Q1–Q12 constrain implementation; dispositions appear in §3. |
| STAGE | [Staging design package](research/staging-design-package.md) | Future topology, event, provenance, and uncertainty requirements; research, not an implemented solver contract. |
| UI | [UI/UX specification](astraea-ui-ux-design-spec.md) | Normative presentation, navigation, accessibility, persistence, and acceptance baseline. |
| PRODUCT | [Master product specification](astraea-master-product-spec.md) | Product workflow and technical requirements; not a current capability inventory. |
| C | [Capability decision queue](capability-decision-queue.md) | The top **DECISIONS** table records the user's choices and supersedes the older pending questions below it. |

Additional live project documents: [frontend integration policy](frontend-integration-policy.md), [physical contract](astraea-normative-physical-contract.md), [exception ledger](superset-exception-ledger.md), and [README](../README.md). The physical contract explicitly supersedes conflicting frame/convention statements. The integration policy keeps frontend delivery in its worktree until the user calls for integration. No main-branch merge is part of this plan.

Authority is applied by subject: recorded user capability decisions determine scope; Q determines accepted frontend contracts; UI governs presentation; the physical contract governs frames and physical conventions. Code inspection determines what exists today. Aspirational product prose and historical ledger counts cannot override these distinctions. This pass neither reopens C17–C21 nor repeats the parked forum crawl. [C: DECISIONS; FORUM §6; UI: Product-wide invariants]

## 2. Current implementation: what to keep and what still breaks

Evidence below is source inspection, not a new test run. Existing test files are regression assets; their presence alone does not establish current passing status.

| Area | Observed in this checkout | UI2 consequence |
|---|---|---|
| Shell | [App.tsx](../src/App.tsx) and [Header.tsx](../src/components/Header.tsx) expose four studios and a separate flight modal. The assembly tree remains visible in every studio. | Add the specified Aero destination; make left/right context studio-specific; bring single-run simulation into Trajectory. |
| Motor coherence | [rocketStore.ts](../src/store/rocketStore.ts) now shares `selectedMotorId`, custom imports, and normalized upserts. The three consumers read it. | Retain the repaired shared selection. UX §1's hardcoded C6 is historical, but consumers still silently fall back to C6 when an ID cannot resolve. |
| Mounts and recovery events | [PropertyInspector.tsx](../src/components/PropertyInspector.tsx) exposes `isMotorMount`; [FlightSimulationTab.tsx](../src/components/FlightSimulationTab.tsx) checks bore/retention and ambiguous mounts. [sixDofSimulator.ts](../src/sim/sixDofSimulator.ts) gates deployment descriptions on canopy existence. | Preserve these repairs. Move validation into a common preflight adapter so every run path agrees. Zero-mount aft placement remains a disclosed approximation, not verified installation. |
| Launch and weather | Flight modal and [TrajectoryStudio.tsx](../src/components/TrajectoryStudio.tsx) still own separate launch options. MC samples the chosen profile at the probe altitude into `windSpeedSurface`. | One launch case; separate visual probe from physical inputs. Current `SixDofOptions` accepts surface wind, not a layered profile. Full profile coupling is an engine-adapter dependency. |
| Forecast time | [weather.ts](../src/sim/weather.ts) has `resolveForecastWinds`, but it validates the requested time then calls `fetchSounding` without passing that time; parsing uses the first forecast hour. | Do not claim selected-hour forecasting. Preserve requested and actual valid times separately; implement timestamp selection before enabling that claim. |
| Freshness | Both run surfaces have input keys and stale badges. MC remounts on `vehicle.id`. Both keys identify the motor by ID rather than its complete content. | Retain stale-state behavior, replace incomplete keys with dependency snapshots. Editing a curve under the same ID must invalidate results. Studio navigation must not erase cases. |
| Evidence | [altimetry.ts](../src/evidence/altimetry.ts) provides parsing, resampling, and alignment; [calibration.ts](../src/evidence/calibration.ts) fits a scalar Cd. [EvidenceStudio.tsx](../src/components/EvidenceStudio.tsx) exposes numeric cards. No `lastSimRun` or shared run repository exists. | Build the run-to-log comparison path. Do not present calibration as applied, validated, or a measured truth. |
| MC | [monteCarlo.ts](../src/sim/monteCarlo.ts) uses a sequential PRNG, counts failures, and returns landing statistics. Trajectory runs it synchronously, capped at 200. No worker or chunk pair exists. | Worker orchestration and sampling-version compatibility need implementation; do not infer Q12 is already done. |
| New capabilities | Fin structure, stability explanation, STEP/STL, RKT export, motor search, curve editing, additional grains, equilibrium, variance, wind CSV, and containment modules exist. Most have no imports from current UI components. | Treat these as implementation reuse opportunities, not complete user workflows. See §9. |
| Blueprint PNG | [InteropExportPanel.tsx](../src/components/InteropExportPanel.tsx) already calls native rasterization of a light-theme SVG. | Reuse the shipped path; FRONT §4's missing-PNG description is historical. |
| Persistence/history | Store history is `RocketVehicle[]`; imports/motors and launch cases are outside it. No durable project storage is implemented here. | Introduce versioned project persistence and explicit transaction scopes before claiming autosave or complete restore. |

These corrections retain the useful fixes since the audit while preventing their remaining failure modes. [UX §§1–6; FRONT §0; UI §§3.5, 6.1–6.4]

## 3. Decision register and prior-contract disposition

| ID | Decision and rationale | Driving sources |
|---|---|---|
| D01 | Use the five specified studios inside one persistent shell. Replace the routine flight modal with an in-workstation trajectory workspace. | UI §§3.1–3.3, 4; PRODUCT §2; UX §§2, 5 |
| D02 | One project revision and one active launch case own all flight inputs. Motor browsing is distinct from assigning a motor to that case. | PRODUCT §3.1; UX §§1, 3a–b, 5a–c; UI §§3.4–3.5 |
| D03 | Immutable run records bind complete motor content, resolved options, model versions, and weather snapshots. Freshness is computed from dependencies, not vehicle ID or motor ID alone. | UI §§2.6, 3.5, 6.1; UX §4a; Q5 |
| D04 | Weather selection is explicit. Fetching a profile does not automatically replace manual conditions or mutate a historical run. | UI §4.4.3; FORUM T1; UX §§2a, 3c, 5b; C3/C5 |
| D05 | Make validity, outcome, freshness, and execution independent. Unknowns remain visible in the mission rail and link to the affected input/result. | UI §§1.4, 2.6, 5.7; physical contract §7 |
| D06 | Use the existing React/Zustand/Three.js stack, shared controls, and accessible SVG plots; no new chart, raster, or routing dependency is required for this plan. | Q10/Q11; FRONT §§2, 4, 6; UI §§2, 5.6 |
| D07 | Run expensive simulation through a job service outside the render thread, with snapshot isolation and real cancellation/progress semantics. | Q12; FRONT §5; UI §6.2; UX §4b |
| D08 | Evidence comparison selects an explicit run and immutable raw log. Calibration produces a reviewable candidate and later a new configuration revision. | Q4/Q5; UI §§4.5.4–4.5.7; FORUM T2; UX §§2b, 5d |
| D09 | Recovery v1 uses a 2D axial strip with declared packed dimensions. Full 3D packing is superseded by the user's narrower C9 decision. | C9; Q1–Q3; FRONT §1; UI §4.5.2 |
| D10 | Adopt the minimal motor editor and live-curve library together. Preserve reference records and label edited derivatives. | C4/C8; Q6–Q9; UI §4.3; TOOLS §8.4 |
| D11 | Prioritize completed cross-studio workflows over adding more standalone calculators. Approved headless capabilities get one clear owner and a downstream consumer. | PRODUCT §1.1; UX §§2, 5; FORUM T1–T4; C1–C16 |
| D12 | Staging remains design-only, general-purpose, and explicitly uncertain. It is not blocked on a sponsor merely to design it; no staging kernel work is scheduled. | C7 supersedes STAGE's sponsor-gated scheduling language; STAGE §§2, 6 |
| D13 | Import/export UI declares format direction, supported subset, provenance, and loss. Broad bidirectional interoperability is approved scope, not a statement that every adapter exists. | C15; UI §3.6; FORUM T4; TOOLS §6 |
| D14 | Onboarding is skippable and adjusts guidance density, never physical defaults or validity. Local drafts and an export path make work recoverable. | C13; FORUM T6; UI §§3.7, 6.4 |

All Q decisions are retained except the explicit presentation-scope narrowing below:

| Contract | Disposition |
|---|---|
| Q1 | Derive recovery bays; do not introduce a `recoverybay` component type. Ambiguous tube/chute membership requires user resolution. |
| Q2/Q3 | Retain optional user-entered packed dimensions and mass-item bounding dimensions. Missing dimensions remain unknown; suggested values require an assumption label. These extensions are not present in current core types. |
| Q4 | Retain 0.1 s display re-grid and a disclosed rendering cap. Event markers retain canonical event times; display resampling cannot change terminal metrics. |
| Q5 | Retain a minimal `lastSimRun` compatibility projection. Extend storage behind it into a run repository so comparisons and provenance are not limited to one transient run. The projection is derived, never another writable authority. |
| Q6 | Retain the thrust-edit consistency law: recompute curve-derived impulse, duration, average, and peak; keep entered propellant/total/dry mass fixed. Reject inconsistent physical metadata rather than silently changing it. |
| Q7 | Retain panel-local curve undo and discard confirmation on leaving unsaved edits. Motor authoring is visibly outside engineering global undo in v1; do not silently implement a second global motor history. |
| Q8/Q9 | Reuse normalized upsert/import collision behavior and existing `exportToEng`. Imported reference replacement and creating a derivative are separate commands. |
| Q10/Q11 | Retain native SVG-to-canvas PNG and SVG charts. Use the existing light blueprint export. Add shared semantic/series tokens and text/line-style distinctions. |
| Q12 | Retain same-module chunk API, accumulation, per-run sub-seeds, equivalence tests, and Vite module worker. The present sequential PRNG requires a versioned migration; see §6. |

C9 supersedes FRONT's isometric/3D recovery rendering and the broader UI §4.5.2 visualization scope for v1; it does not relax dimensional honesty or numeric access. D01 supersedes FRONT §6's decision to leave modal migration out of that earlier batch. These are explicit changes of scope, not silent contract drift.

## 4. Workstation and user journeys

### 4.1 Persistent shell

At 1440 × 900, use a 56 px header, a wrapping mission rail of at least 36 px, 320 px left/right panes, and a flexible center. Left pane resizes approximately 240–480 px; right 280–520 px. A footer exposes units/frame, selection/time, jobs, and diagnostics. At 1280 × 800 collapse a side pane before making the center unusable. At high zoom/narrow width use one primary region with labeled navigation to the other regions. [UI §§1.6, 2.4, 3.1–3.3]

```text
Project · revision · save state | Five studios | File | Undo/redo | Run
Validity | freshness | stability | flutter | active gate | weather | job
Context list          | Main work area                  | Inspector
Units / frame         | Selection / linked time         | Jobs / issues
```

Project identity, run status, and critical issues persist across mode changes. Selection uses stable IDs; layouts and expansion state are workspace preferences. The mission rail does not average independent failures into a single favorable score. Its items navigate to the relevant studio, object, and issue. [D01/D05; UI §§1.4–1.5, 3.4]

| Studio | Left | Center | Right | Principal next action |
|---|---|---|---|---|
| Airframe CAD | Assembly and component library | Existing 3D viewport, dimensioned/section views | Geometry, material, mounting, mass and provenance | Assign motor or inspect aero |
| Aerodynamics & Flutter | Cases, component contributions, selected fin set | Drag and CP/Mach plots, flutter/structure results | Conditions, model applicability, material source | Inspect why a margin changed or run trajectory |
| Propulsion & Motors | Library, imported/live curves, “Make your own” | Thrust and estimated depletion; advanced grain/chemistry tools in sub-tabs | Source, installation, point editor and assumptions | Assign to the active case |
| Trajectory & Weather | Launch cases, weather snapshots, runs and ensembles | Setup, trajectory plots, ground track/dispersion and timeline | Launch inputs, selected weather, uncertainty, rule definition | Validate/run, compare, or open evidence |
| Flight Evidence & Logs | Recovery assemblies, logs, comparison records | Recovery strip, plots/residuals, calibration review | Packed dimensions, log mapping, alignment and fit settings | Compare with a run or review a calibration candidate |

The evidence workspace's full title remains **Recovery Packaging & Flight Evidence Ledger**. Aero advisories move to Aero with links from relevant geometry and trajectory results; geometry-derived calculators bind to selected components. Scratch calculations are explicitly labeled and require a deliberate apply action where supported. [UI §§3.2, 4; UX §§2c, 5; FRONT §6]

### 4.2 Complete journeys

1. **First run:** skip or answer the experience questionnaire, open a reference template or import a model, review dimensions and mount, assign a resolved motor, review launch/weather assumptions, validate, run, inspect results. An optional resumable tour highlights these actual controls; no fabricated passing example is substituted for the active model. [C13; FORUM T6; UI §3.7]
2. **Imported motor to flight:** import `.eng`/`.rse` or download a selected live curve, review source/derivative status, assign to the chosen mount, inspect fit issues, then run the active launch case. Every studio displays the same assignment. An unresolved motor produces a corrective action, never C6 fallback. [UX §1; C4/C8; UI §4.3]
3. **Forecast to dispersion:** choose site and time, fetch, inspect actual forecast validity time and altitude conventions, explicitly select and lock the snapshot, run nominal and seeded ensemble, inspect failures and containment, export the selected result. Refresh creates a new snapshot; applying it marks affected current comparisons stale. [FORUM T1; C3/C5; UI §4.4]
4. **Log to revised prediction:** select a historical run, import a log with mapping/unit review, inspect raw versus processed series, choose reversible alignment, review residuals, fit an eligible coast interval, then reject or apply a supported candidate as a new revision. Rerun and compare baseline/candidate. Until the calibrated model is consumed by the engine, the candidate remains analysis-only with no “applied” label. [FORUM T2; Q4/Q5; UI §4.5]
5. **Geometry to manufacturing:** choose objects and export purpose, inspect supported geometry and omissions, export STEP/STL or blueprint, retain project revision and unit metadata. Re-import tests establish only the adapter's supported subset. [FORUM T4; C2/C15; UI §§3.6, 4.1.7]

## 5. State ownership and data contracts

### 5.1 Stores and records

Keep Zustand, split by responsibility behind shared selectors/actions rather than creating studio-local engineering authorities. Proposed records below are architecture shapes, not existing API declarations. [D02/D03; UI §§3.5, 6.1, 8.2]

| Owner | Contents | Persistence/history |
|---|---|---|
| Project document | Versioned vehicle revisions, motor records/provenance, launch cases, weather snapshots, evidence references, calibration candidates | Durable local project; named checkpoints and explicit export |
| Active launch case | Vehicle revision, motor/mount binding, recovery selection, launch options, weather reference, uncertainty settings, gate profile | Saved engineering inputs; case edits undoable |
| Run repository | Immutable input snapshot, resolved model versions, outputs, validity, timestamps and diagnostics; ensemble member outcomes | Durable results; never rewritten by input changes |
| Job service | Request identity, lifecycle, progress, cancel state and worker handle | Ephemeral execution; durable terminal record/diagnostics |
| Workspace preferences | Studio, pane layout, selected IDs, plot cursor, units, guidance settings | Separate from engineering model and undo |
| Editor draft | Uncommitted numeric text, slider preview, curve point draft | Commit/cancel scope; crash recovery must not silently apply drafts |

A launch binding contains the selected motor record revision/content identity and mount component ID. Preserve `BodyTubeComponent.assignedMotorId` as an interoperability field, but reconcile it at import/commit with the active binding; conflicting tube references open an import issue. During migration, `selectedMotorId` is a compatibility view over the active binding. Never maintain two independently writable assignments. Multiple mounts are editable geometry; clustered simulation stays unsupported until a staged/clustered model exists. [PRODUCT §3.1; UX §3b; C7/C15]

`lastSimRun` exposes `{telemetry, events, runKey}` from an explicitly chosen completed run for Q5 compatibility. Evidence comparisons store a run ID, not “whatever was run most recently.” A failed attempt does not erase a successful historical run; it creates a failed job record, and the current attempt area shows its failure. [Q5; UI §§3.7, 6.1–6.2]

### 5.2 Snapshots and invalidation

A run key uses deterministic canonical serialization of **resolved simulation inputs**: vehicle geometry/masses/material values, full motor curve and metadata, mounting, recovery, launch options, consumed weather data and adapter version, solver/model settings and versions, applicable calibration, and ensemble seed/distribution/sampling version. Reject nonfinite or unsupported data before creating the key. Project names, units used only for display, selection, and viewport changes do not change physical freshness. Keep revision IDs for provenance separately. [D03; UI §§2.2, 3.5, 6.1]

| Change | Invalidate |
|---|---|
| Geometry, material or mass | Dependent mass/aero/structure analyses, trajectories, ensembles and fit applicability |
| Motor curve/mass, including replacement under the same ID | Depletion/loading, trajectories, ensembles and comparisons relying on the old motor |
| Mount, launch orientation or recovery configuration | Affected trajectories, ensembles and derived gates |
| Apply another weather snapshot | Runs/comparisons for the edited case; preserved historical runs remain labeled with their original snapshot |
| Refresh without applying weather | No physical run invalidation; update availability/age information |
| Change rule threshold only | Gate evaluation, not the underlying trajectory |
| Change log mapping/alignment | That derived evidence/comparison/fit; never raw log or baseline run |
| Change display unit, layout or probe cursor | No simulation invalidation |

Completed worker output may be archived under its captured snapshot. It becomes the active current result only if its project, case, job identity, and input key still match the intended destination. A cancelled/replaced request cannot publish a final result. [UI §§3.5, 6.2, 7.5]

### 5.3 Persistence and edit recovery

Use browser IndexedDB through a small repository adapter for structured project/run records and raw log blobs; keep it local and label it as such. Autosave reports saving/saved/failed only after transaction completion. Use schema-versioned migrations, preserve the pre-migration record, reject unknown future schemas, and provide explicit project export. Detect stale writes by project revision within the write transaction; another tab cannot silently overwrite it. Storage/quota failure preserves the in-memory project and exposes an export action. [D14; UI §§3.6, 6.4–6.5]

Geometry sliders preview continuously and commit once per gesture; numeric fields retain invalid text until corrected or cancelled. Escape cancels an edit. Imports, preset replacement and calibration create named checkpoints. Motor point drafts retain Q7's local undo and visible unsaved state; switching studio/project or closing an unsaved editor uses the agreed discard guard. Browser-close recovery is best-effort and cannot be described as a guaranteed save. [Q7; UI §§3.3–3.5]

## 6. Execution, weather, and statistical presentation

One `simulationService` accepts immutable cases for nominal runs and ensembles. React components select records and issue commands; they do not assemble separate defaults or call the solver during rendering. One preflight adapter checks all required inputs and reuses existing physical validation. Missing selected motors, ambiguous mounts, invalid numbers and unsupported topology identify the repair destination before starting work. Existing aft-end fallback may be offered only as an explicit approximation with installation validity unknown. [D02/D07; UX §§3a–b, 5a; UI §6.2]

Jobs follow `idle → validating → queued → running → completed | failed | cancelled`; invalid preflight returns issues. Vite module workers run both expensive nominal and ensemble operations. Worker messages carry `jobId`, `runKey`, protocol version and monotonic progress sequence. Navigation remains usable. A Cancel command immediately acknowledges the request, then reports actual worker termination separately; preserved completed members are labeled partial. No estimated percentage without a real denominator. If workers are unavailable, show the limitation and offer retry/export; a bounded yielding fallback is allowed only when its responsiveness is demonstrated. [Q12; FRONT §5; UI §§6.2–6.3]

**Q12 compatibility:** the existing `runMonteCarlo` uses one sequential stream, so introducing independent per-run seeds changes historical seed outputs. Keep a named `legacy-sequential-v1` replay path for captured legacy records, and define `per-run-v2` for the new full/chunk runner. Derive per-run seeds deterministically from `(masterSeed, sampleIndex)`; store sample index and outcome. Both new full and chunked APIs use the same sampling primitive. Equivalence means identical indexed inputs/outcomes for a given sampling version, independent of chunk size/order; it does not mean silently pretending v2 reproduces legacy draws. Aggregate in sample-index order for stable floating-point statistics. [Q12; PRODUCT §7; UI §6.1]

Preserve requested, attempted, completed, valid-touchdown, failed, unsupported and incomplete member counts with reconciled totals. The current engine wrapper accepts finite landing coordinates without checking every result's `terminated`/`validity` status; UI2's runner must retain those statuses before classifying a member as a successful landing. Do not calculate an all-ensemble passing gate from only the surviving cloud. Partial or insufficient ensembles report unknown where complete evidence is required. [Physical contract §7; UI §4.4.6; current `monteCarlo.ts`/`SixDofSimulationResult`]

Weather snapshots carry source kind, provider/model, coordinates, requested time, actual forecast valid time, retrieval time, altitude datum/conversion, interpolation/extrapolation policy, units and checksum. Manual/CSV/forecast selection is explicit. Offline reads expose cached age. No synthesized atmospheric fields may be labeled measured. UI2 first supports the existing **surface wind with modeled shear** option honestly; selecting full layered-wind simulation remains unavailable until the loads path consumes that snapshot at the vehicle altitude. The probe stays display-only, including in the interim surface mode. [D04; UI §4.4.3; UX §3c; current `SixDofOptions`]

Covariance and empirical views use the same member set and local ENU meters. Label 1σ as 39.3%, 2σ as 86.5%, and the 95% radius as approximately 2.448 under the bivariate-normal assumption. A measured fraction of samples inside a boundary is distinct from an ellipse boundary check or a probabilistic compliance claim. Current `containmentCheck` evaluates landing points; `waiverCylinderCheck` accepts one optional apogee. Neither proves entire trajectories, every ensemble apogee, or a 95% ellipse lie within a 3D boundary. Those evaluations need their own input/evaluation contracts before being offered. [UI §4.4.6–4.4.7; C3; PRODUCT §7.2; current `waiverContainment.ts`]

## 7. Evidence, calibration, and staging boundaries

Reuse parser/resampling/alignment functions through a source-preserving import adapter. Unknown CSV dialects open a mapping view with units, time interpretation, missing/duplicate samples and preview; generic CSV support does not prove native support for every avionics product. Preserve raw bytes/checksum and all derived processing steps. The comparison identifies the selected run revision and log, displays modeled/measured/residual series with a shared keyboard-operable cursor and table, and names the alignment offset/method. [FORUM T2; Q4/Q5; UI §§4.5.4–4.5.7]

Display re-gridding uses Q4's 0.1 s cadence; downsampling has a visible cap and retains important extrema/discontinuities. Do not interpolate across long missing-data gaps as if measurements existed. Canonical events and terminal metrics remain separate from presentation telemetry. Fit calculations use eligible source-derived data at a declared processing resolution, never chart-decimated points. [Q4; UI §§4.5.5, 6.3]

The current calibration interface treats `mass × accelMs2` as drag force. It must not be fed an arbitrary derivative of barometric altitude without a defined treatment of gravity, frame, sensor-specific force, wind and attitude. STAGE §6.2 also contains an inverse-expression sign ambiguity relative to its stated coast equation. Record this as a model-contract review item; do not copy that formula into UI code. Fit eligibility, acceleration semantics and an engine-consumed calibration parameter must be settled and tested before enabling Apply-and-rerun. No `<3%` accuracy promise follows from an optimizer returning a number. [Current `calibration.ts`; STAGE §6.2–6.4; UI §4.5.6]

Recovery v1 renders a dimensioned strip and a numerical list for a selected derived bay. Display which dimensions are entered, assumed or missing; overlapping/ambiguous assignments offer an edit path. Fit/clearance and density advisories remain separate from deployment reliability. Existing numeric method availability does not by itself satisfy UI §4.5.3's review/applicability requirement for deployment sizing. [D09; C9; Q1–Q3; UI §§4.5.2–4.5.3]

For future staging, reserve stable body/stage identifiers in selection, event and provenance adapters without changing today's vehicle/solver schema merely for a mockup. Design future configuration as per-stage geometry, motor installations, recovery, event triggers, separation delay and ignition delay; show booster/sustainer events in separate labeled lanes on a common clock. Label hardware facts requiring input separately from editable assumption defaults. Trace every default and calibrated channel. Default timing/friction/impulse values in the research are proposals, not automatically approved run inputs. [C7; STAGE §§2.2–2.8, 6.1]

Future results expose each affected body's validity, unknown interference terms and excluded recontact physics. One calibrated flight may constrain a lumped coast-drag channel; it does not establish ignition variance or validate separation dynamics. Current imports with staged/clustered topology must disclose loss and keep staged flight unavailable. C7 removes a sponsor prerequisite for design; empirical validation remains required for any future accuracy claim. [D12; STAGE §§6.2–6.5; UI: no false certainty]

## 8. Shared UI implementation boundaries

Proposed files; create them only in the relevant implementation slice. Existing domain modules remain the computation source of truth. [Q11; FRONT §6; UI §8.2]

```text
src/components/ui/             QuantityField, StatusBadge, SplitPane,
                               PlotFrame, DataTable, InlineIssue, Provenance
src/components/workstation/    WorkstationShell, MissionStatusRail,
                               StudioNavigation, IssueDrawer, JobTray
src/components/studios/        airframe/, aero/, propulsion/, trajectory/, evidence/
src/store/                     projectStore, workspaceStore, runStore
src/application/               caseResolver, preflight, simulationService,
                               runIdentity, capabilityRegistry
src/persistence/               projectRepository, schemaMigrations
src/evidence/                  overlay + reviewed evidence adapters
src/sim/                       existing engines + Q12 chunk API and worker entry
src/index.css                  semantic tokens, typography, focus and density
```

`QuantityField` owns draft parsing, finite/range validation, SI conversion, display precision, adjacent units, keyboard stepping, Escape and commit semantics. Never clamp invalid text into a hidden accepted value. `StatusBadge` requires a label and secondary encoding; `PlotFrame` requires axes/units, legend, keyboard readout, table/export and empty/stale/error states. Charts reuse primitives, not private per-studio polyline implementations. [UI §§2.2, 2.6–2.7, 5.6]

Use the normative neutral surfaces and typography rather than continuing unrelated local field/card styles. Semantic safety colors are not series identities: modeled cyan solid and measured violet dashed have explicit legends; neutral/hazard badges express status independently. Palette pairings require actual contrast checks. Navigation uses stable vector icons plus labels. Avoid pure decorative motion. [Q11; FRONT §6.1–6.2; UI §§1.2–1.3, 2]

Keyboard map follows UI §5.3: 1–5 switch studios outside editable contexts; Alt+1–4 select viewport views in viewport context; explicit Run uses Ctrl/Cmd+Enter. Existing 1–3 render-mode shortcuts must be relocated to labeled controls/remappable commands. Contenteditable fields, repeated keydown and native browser conflicts are included in shortcut handling. Escape cancels the nearest edit/popover, never a running job. Splitters, tree operations, plot cursors and motor point editing have keyboard alternatives. [UI §5; current `App.tsx`]

Each feature supplies empty/loading/current/stale/invalid/offline/failed states as applicable. Unknown data displays an explanation and corrective link, never zero. WebGL context loss preserves the tree, forms, metrics, and blueprint workflow. Reduced motion, forced colors, 200% zoom, 400% reflow and screen-reader task completion are release checks. [UI §§3.7, 5, 7.4–7.5]

## 9. Approved capability placement and dependency register

“Module exists” below means inspected in this checkout, not independently validated or fully wired. Capability registry entries should distinguish usable, integration-pending, design-only and excluded; unavailable operations explain the missing prerequisite. [D11/D13; C: DECISIONS]

| Capability | UI owner | Reuse and remaining integration |
|---|---|---|
| C1 Fin structural loads | Aero, selected fin set | `aero/finStructure.ts`; bind geometry/material and condition provenance, display missing-property failures. |
| C2 STEP/STL | Airframe export | `formats/stepExport.ts`, `stlExport.ts`; supported-solid preview, tessellation/units and omissions. |
| C3 Forecast/containment/KML | Trajectory | `sim/weather.ts`, `waiverContainment.ts`; fix selected-hour handling and complete weather-to-loads path; distinguish cloud vs ellipse/path containment. |
| C4/C8 Live motors/minimal editor | Propulsion | `thrustcurveApi.ts`, `curveEditing.ts`, `formats/engParser.ts`, store upsert; add browser/cache/error/provenance flow and derivative save/assignment. |
| C5 Wind CSV | Trajectory weather | `sim/windProfile.ts`; mapping/units, persistent snapshots, explicit selection and real downstream consumption. |
| C6 Stability explanation | Aero and linked CAD inspector | `aero/stabilityBreakdown.ts`; component contribution comparison, nose-tip datum and caliber definition. |
| C7 Staging | Future stage/sequence context | Design-only; §7 records the integration seams and unresolved fidelity. |
| C9 Recovery strip | Evidence → Recovery Packaging | `recovery/packing.ts`; Q1–Q3 dimensions and unambiguous bay membership, 2D rendering only. |
| C10 Additional grains | Propulsion advanced tools | `grainRegression.ts` includes end-burner, rod/tube, moon and C-slot functions, matching the [grain survey](grain-geometry-survey.md) §3 build set. Expose these with their model assumptions; retain the survey's deferral of finocyl, multi-perforated, D/X, tapered and custom/DXF shapes. |
| C11 Per-component aero loads | No active build | Parked; stability contributions do not equal an AoA/Mach component-load analysis. |
| C12 GPS/back-cast | Evidence | No GPS-specific adapter found in the inspected source inventory; implement datum/time mapping and comparison before a back-cast workflow. PDF is conditional on demonstrated value, not mandatory polish. |
| C13 Questionnaire/tour | First-run shell and Help | New UI; skippable/resumable, retain essential manual paths. |
| C14 Motor variance | Trajectory uncertainty | `sim/motorVariance.ts`; explicit typical range vs estimate, saved override and provenance; never silently change an existing case when defaults change. |
| C15 Bidirectional interop | Shared File workflow | ORK read/write, RKT read/write, ENG read/write and RSE read functions exist; CDX1 currently export-only. Track each direction/format version independently. Unsupported directions remain visible limitations, not inferred support. |
| C16 Equilibrium | Propulsion advanced chemistry | `propulsion/gibbsEquilibrium.ts`; expose actual species/thermodynamic limits and validation evidence. CEA parity requires review of the relevant reference corpus, not the file name. |
| C17–C21 | Excluded/closed | No AltOS binary decoder, dedicated mobile app, full CFD, image curve tracer or formal certification work. CSV import and responsive web use remain available alternatives where implemented. |
| E1 / Q12 | Trajectory jobs | Background MC, progress/cancel, versioned seed migration and member accounting. |
| Q4/Q5 overlay | Evidence comparison | Existing altimetry utilities plus shared run store, chart primitives and reversible processing. |

C15's expanded scope must be translated into an adapter matrix before implementation claims: JSON project read/write with schema migration; ORK and RKT supported-subset read/write; CDX1 export plus a separately tracked import; ENG read/write; RSE import plus separately tracked export; wind/log CSV as distinct data imports; aero CSV, KML, STEP/STL and SVG/PNG as purpose-specific exports. Full arbitrary CAD STEP import is not established by C2's export decision. [C2/C15; UI §3.6]

## 10. Implementation sequence and acceptance

Deliver sequentially in this worktree. Reuse existing domain code and preserve unrelated research files. Before each implementation slice, reread changed contracts/source and check for coordinator follow-ups. No new worker dispatch, other-model delegation or implicit integration is part of this plan. [Frontend integration policy; workspace instructions]

| Slice | Concrete result | Dependencies | Observable acceptance |
|---|---|---|---|
| S1 Shared case/run foundation | Case resolver, motor binding, common preflight, immutable snapshots, result identity, minimal `lastSimRun` view | D02/D03; current store/parser contracts | A same-ID motor edit marks affected results stale; nominal/MC use identical zero-perturbation resolved inputs; unresolved/multiple mounts have one consistent repair path. |
| S2 Workstation shell | Five destinations, mission rail, contextual panes, reusable fields/status/plot frame and preserved selection | S1 selectors | All five studios reachable by keyboard; routine simulation reachable without a modal; invalid/stale results never display an unqualified pass; WebGL loss retains editing. |
| S3 Durable project and import flow | IndexedDB repository, schema checks, checkpoints, import preview/loss report and exports | S1; format capability matrix | Reload restores motor/case/weather/records; injected storage failure exposes recovery; concurrent stale write is rejected; cancelled import leaves project unchanged. |
| S4 Nominal/ensemble execution | Worker job service, Q12 API/versioning, run timeline, failure accounting and cancel | S1/S2; sampling contract | v2 full/chunk results agree across chunk partitions; legacy seeded reference replays; cancelled/late jobs cannot overwrite a new case; partial members remain explicitly partial. |
| S5 Weather and landing workflow | Locked weather snapshots, selected-hour forecast, profile coupling, wind CSV and correctly named containment | S3/S4; weather/loads adapter extension | Moving only the probe leaves the run unchanged; changing an upper layer affects modeled loads when layered mode is enabled; refresh cannot rewrite historical runs; member/ceiling inputs govern the stated containment check. |
| S6 Evidence loop | Log import/mapping, overlay/residuals, reversible alignment and candidate review | S3/S4; acceleration semantics and calibration consumer for Apply | Raw log checksum stays unchanged; chosen run persists; alignment is reversible; rejecting fit makes no model edit; applying a supported fit creates a revision whose next run actually consumes it. |
| S7 Approved studio completion | Aero explanations/structure, motor live library/editor, 2D recovery, manufacturing exports, appropriate advanced propulsion and onboarding | Relevant S1–S6 data contracts; C scope | Each exposed capability completes its stated journey, has all applicable states, and cites its input/source; no browse-only “integration” claim. |

S7 is a set of individually reviewable features, not permission to defer necessary S1–S6 wiring behind a cosmetic shell. C7 remains a design deliverable outside this implementation sequence. Cross-studio acceptance journeys in §4.2 are the release unit. [UX §§2, 5; UI §§7.3, 8.3]

### Verification plan

For implementation changes, extend meaningful behavioral suites for store invalidation, job identity/cancellation, weather consumption, import recovery and evidence preservation. Reuse current regression tests for shared motors, mount checks, chute event truthfulness and finite-data guards. Register every new test file and required hash entry in `scripts/emit-benchmark-metadata.cjs` with its implementation; keep case counts/inventories consistent. [Q: Emitters/tests; FRONT §0; existing emitter]

Use `npm run build` and relevant `npm test -- <test paths>` during slices. At the complete release candidate, run the full suite and `node scripts/emit-benchmark-metadata.cjs` on the intended immutable clean source snapshot. The emitter explicitly fails a dirty tree; do not clean away user changes or claim certification from documentation or selected tests. Its build/test metadata is separate from manual browser/assistive-technology and scientific-presentation review. [UI §§7–8; emitter header]

Browser verification covers the 1440 × 900 and 1280 × 800 layouts plus zoom/reflow, keyboard-only journeys, screen-reader semantics, context loss, offline/cache, import errors, storage failure and actual worker assets in a production build. Measure UI §6.3 targets on declared hardware/fixtures: p95 input/selection/preview acknowledgment within 100 ms, cached mode changes within 200 ms, cancel acknowledgment within 250 ms, and responsive viewport interaction. These are release targets, not measurements from this pass.

### Contract work to resolve during implementation

- Weather: actual selected-hour extraction, altitude conversion and layered `windAt` consumption must agree before enabling full-profile simulation. [D04; UI §4.4.3]
- Calibration: acceleration/sensor semantics, fit applicability and consumed model parameter must be defined before Apply. [§7; UI §4.5.6]
- MC: name sampling versions and preserve legacy seeded behavior; specify classification of timeout/unsupported members. [Q12; UI §4.4.6]
- Project format: define launch/mount binding migration, raw evidence packaging and motor-reference reconciliation. [PRODUCT §3.1; C15; UI §3.6]
- Gates: bind source/version/units and required member evidence to each evaluation. Product prose contains differing generic and competition thresholds; do not label copied values as current official rules without authoritative verification. [UI §4.4.7; PRODUCT §§4, 12]
- Capability completion: retain C10's surveyed four-shape expansion and verify C16's reference corpus before exposing stronger model claims. [C10/C16; grain survey §3; UI: no false certainty]

These are concrete implementation dependencies, not unanswered product-choice questions. The plan can proceed through S1–S4 while resolving them without inventing physics, reopening closed scope, or duplicating the prior research.
