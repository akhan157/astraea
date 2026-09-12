# Operations Data — Reference Study (Palantir Foundry, AVEVA PI Vision, Seeq, Grafana)

- Lane: `operations` (docs/design-research/operations-study.md + docs/design-research/evidence/operations/)
- Model executing this lane: `openrouter/deepseek/deepseek-v4-flash-0731` (DeepSeek V4 Flash)
- Access dates: all sources read 2026-09-10 (UTC); screenshots captured 2026-09-10.
- Method: no accounts, no trials, no external publication. Primary sources = official product documentation rendered in an Orca-managed browser tab (own tab only); genuine UI screenshots downloaded from vendor docs/KB or captured live from public demos (Grafana Play), annotated locally. Practitioner signal from public community/blog threads; forum access failures documented, not invented.
- Framing: these products are operational-analytics references for an aerospace workstation's data/results surfaces. **Nothing here claims these products validate aerospace physics or certify solvers**; they are UX and interaction references only.

## Products screened (4 candidates — brief item 3)

### OPS-P1 Palantir Foundry — Workshop + Quiver (one family) — **deep study**
- **Category:** enterprise ontology-backed app-building (Workshop) + point-and-click analytics canvas/graph builder (Quiver) over a governed data platform.
- **Intended user/task:** Workshop: "builders" configure operational apps for "consumers"; Quiver: analysts build multi-step analyses and interactive dashboards, embed in Workshop/Notepad.
- **Commercial positioning:** commercial, closed-source, sold via Foundry contracts; not self-serve. Industrial relevance: defense/logistics/manufacturing/energy deployments are marketable but I did not verify current adoption numbers (no fabrication of adoption claims).
- **Access level:** official docs fully public (palantir.com/docs); no live instance available without an account → interaction evidence is official screenshots/GIFs, not hands-on. Documented bounded failure for community signal: `forum.palantir.com` unreachable from this network (`Unable to connect`, HTTP 000) — see Practitioner section.
- **Include rationale:** best-documented "selection → downstream context" model (object set filter variables, cross filter, chart drill-down); explicit build-time vs end-user split; save/version/auto-save recovery semantics are unusually well documented.
- **Source URLs (primary):** `palantir.com/docs/foundry/workshop/widgets-object-view/`, `.../workshop/concepts-layouts/`, `.../workshop/concepts-variables/`, `.../workshop/object-set-filter-variables/`, `.../workshop/widgets-chart/`, `.../workshop/state-saving/`, `.../quiver/overview/`, `.../quiver/card-cross-filter/`, `.../quiver/analysis-save-share/`, `.../quiver/analysis-canvas/`, `.../quiver/analysis-graph/`, `.../quiver/objects-chart-drilldown/`, `.../quiver/objects-property-drilldown/`, `.../quiver/core-concepts/`, `.../quiver/cards-index-charts/`, `.../quiver/cards-index-time-series/` — all accessed 2026-09-10.

### OPS-P2 Seeq — **deep study** (strongest accessible industrial-analytics evidence)
- **Category:** time-series analytics workbench (Workbench), report/dashboard layer (Organizer), Python notebooks (Data Lab), monitoring app (Vantage).
- **Intended user/task:** process engineers analyzing historian data: capsule/condition-based analysis, batch comparison, SPC, publishing to operators.
- **Commercial positioning:** commercial SaaS/on-prem, closed-source; targets industrial process data (historians e.g. PI, OSIsoft lineage heritage via founders).
- **Access level:** knowledge base public and rich (`support.seeq.com/latest/cloud/*.md` — served as Markdown); no trial account used. Screenshots: official KB UI captures (real product screens). Community: seeq.org forum thread accessible via browser (403 to curl/read tool — documented).
- **Include rationale:** best public documentation of relative-time analysis (capsule time, compare view), display/investigation time-range dual model, and snapshot-style report publishing. Directly transferable interaction patterns for comparing repeated events (e.g., test runs).
- **Source URLs (primary):** `support.seeq.com/latest/cloud/using-seeq.md`, `.../seeq-workbench.md`, `.../trend-view.md`, `.../adjusting-time-ranges.md`, `.../compare-view.md`, `.../capsule-time.md`, `.../seeq-organizer.md`, `.../tools.md`, `.../data-views.md` — accessed 2026-09-10.

### OPS-P3 AVEVA PI Vision — **deep-lite: in-depth official-docs review, no hands-on**
- **Category:** web display builder (displays = symbol canvases) over PI System historian/AF assets.
- **Intended user/task:** engineers/operators building monitoring displays; consumers view/monitor; event-focused analysis workflows.
- **Commercial positioning:** commercial (AVEVA, ex-OSIsoft); the de-facto historian display layer in process industry. Industrial relevance corroborated by integrator practitioner blog (OPS-114).
- **Access level:** docs fully public but JS-rendered (Zoomin) — read via Orca browser; a live instance was **not** available (product requires a PI Server installation / trial signup). Screenshots: official user-guide UI captures (real product screens of PI Vision 2025 docs, e.g., a real "CSPI PI Big Tire Co" demo dataset).
- **Include rationale:** the cleanest industry example of (a) display = static layout + live data symbols, (b) synchronized in-context selection (trend cursors across all trends), (c) collections = one symbol → many assets, (d) save-conflict recovery dialog.
- **Source URLs (primary):** `docs.aveva.com/bundle/pi-vision/page/1010105.html` (display workspace), `1009779.html` (Trend), `1009759.html` (trend cursors), `1009825/1009789.html` (pan/zoom), `1010090.html` (collections), `1009777.html` (timebar), `1009767.html` (save displays), `1009709.html` (compare events), `1009799.html` (asset comparison table), `1010071.html` (select/edit/group symbols) — accessed 2026-09-10

### OPS-P4 Grafana — **screened (open source), not deep**
- **Category:** observability dashboard platform: dashboards + panels + alerting over many data sources.
- **Intended user/task:** SREs/ops engineers: query, visualize, alert, explore metrics/logs/traces.
- **Commercial positioning:** Grafana OSS (AGPL, open source) + Grafana Enterprise/Cloud (commercial). Honest classification: open-source ecosystem with commercial edition; unlike the other three it is not an industrial/ontology product.
- **Access level:** public docs (`grafana.com/docs/grafana/latest/`) + live public demo **Grafana Play** observed hands-on in browser (OPS-108).
- **Include rationale:** screened for contrast: dashboard variables (URL-synced `var-<name>`), time-range picker/pan-zoom semantics, dashboard version history — a lightweight counterpart to compare selection patterns.
- **Source URLs (primary):** `grafana.com/docs/grafana/latest/`, `.../visualizations/dashboards/build-dashboards/manage-version-history/`, `.../visualizations/panels-visualizations/visualizations/time-series/`, `.../visualizations/dashboards/variables/`, `play.grafana.org/d/000000016/` — accessed 2026-09-10.

**Deprioritized within lane:** none of the 4 candidates was dropped — all are covered above. (The lane list in the brief is exactly these 4; no additional candidates needed for the 12-total screen budget.)

---

## Build-time configurator vs end-user workflow (cross-cutting)

This distinction recurs in every product and is the single most important lens for Astraea:

| Product | Build/config time | End-user (view/run) time |
|---|---|---|
| Palantir Workshop | Builder edit mode: Layout panel, Variables panel, widget config, Events; **selection wiring** created here (chart "Selection as filter" → object set filter variable → downstream widgets) | Consumer view mode: only widgets, header, state saving, routing; no config chrome (per docs: layout elements editable only in edit mode) |
| Palantir Quiver | Analyst builds card graph/canvas; chart drill-down + cross filter subscribed plots configured here | Dashboard consumers interact: click chart segments → filtered object sets; parameters exposed at runtime; no card editing |
| AVEVA PI Vision | Design mode: symbols placed, trend options, collection criteria; **trend cursors unavailable in Design mode** (docs: "You can view trend cursors only when you exit Design mode") | Monitor mode: cursors, pan/zoom, timebar, asset switching, event comparisons |
| Seeq | Workbench edit: tools (formula/value search/conditions), worksheet layout, lanes/axes | View-only links, Organizer consumers, Vantage monitor; date/asset selection in View-Only requires read perms per workbook (Organizer FAQ) |
| Grafana | Dashboard editor: panels, queries, variables, links | Dashboard view: variable dropdowns, time picker, panel zoom/pan; no panel edits |

---

## Deep workflows (8 total; ≥3 across 2 deep products — requirement met)

Each workflow: task & starting state; steps & visible states; selection/context model; error/cancel/recovery; visual hierarchy/density notes; source vs interpretation; Astraea adaptation + testable acceptance criterion; what NOT to copy; unresolved questions.

### W-1 (Foundry/Quiver) Chart drill-down to Selection Object Set
- Source: `quiver/objects-chart-drilldown/` (§Filter with chart selections) + GIF `howto-object-set-chart-selection.gif`.
- **Task:** from a bar chart of objects grouped by category, isolate the objects behind one bar, then combine categories.
- **Steps/visible states:** (1) hover chart → card footer offers **Drill down**; (2) select a category (click; **Cmd/Ctrl+click** for multi; **click-drag** to lasso a range of small categories); (3) choose Drill down → creates a **Selection Object Set**, a new object set card defined by the selection; (4) multi-select `building` after `garage` → filter updates to `building OR garage`; (5) downstream cards (e.g. counts) recompute. Docs show selection of `garage` producing object set of 218,785 objects "matching the size of the bar".
- **Selection/context model:** chart selection itself is stateful; drill-down materializes it into a first-class typed object set which later cards consume. Selection → explicit materialization (Deliberate step), not an implicit global filter.
- **Error/cancel/recovery:** clearing = click empty area/deselect (implied); no documented error path; deletion dialogs exist at card level (canvas mode: "Delete and remove from downstream cards" vs "Remove from canvas" — the former warns downstream cards may enter errored states). Auto-save `state` URL variable recovers unsaved work (core-concepts).
- **Visual hierarchy/density:** footer action surface on every chart (`Drill down`, `Select all objects for drill down` on OPS-102 heat grid); counts echoed on cards (1,583 Tea Batches on filter/bar/heat cards — cross-card consistency visible in evidence).
- **Source vs interpretation:** steps are official-documented; the 218,785 figure appears in the doc image caption — I did not reproduce it from memory; the counts in OPS-102 are read from the vendor screenshot itself.
- **Astraea adaptation + acceptance criterion:** a plot of simulation/telemetry results by phase (or by motor variant) should support click/ctrl-click/lasso selection that materializes as an explicit "selection collection" the same session can feed into comparisons or exports. Acceptance: select two non-adjacent bars → a named selection list updates with both; downstream comparison panel recomputes; deselect → clears.
- **What NOT to copy:** the card-graph where every transform is a separate free-floating card (overkill for a workstation); Quiver's separate "canvas vs graph" modes as a first-class user-facing toggle.
- **Unresolved:** whether multi-selection is union only (OR) or supports AND/negation in Quiver; not documented.

### W-2 (Foundry/Quiver) Cross filter configuration
- Source: `quiver/card-cross-filter/` (GIF `howto-chart-selection-cross-filtering.gif` + 3 config PNGs).
- **Task:** make two charts filter each other and a downstream object set (horizontal exploration).
- **Steps/visible states:** (1) object set card → next actions → **Filter > Cross filter** → creates cross-filter card (output type: object set); (2) create categorical charts (pie/bar/line/categorical scatter) taking the cross filter card as input; (3) open cross-filter editor → add charts to **Subscribed plots**; (4) runtime: selecting "Steeping Vat nine/three/seven" in pie filters object set **and** cross-filters the bar to those 3 categories. Build = config-time; interaction = consumer-time.
- **Selection/context model:** subscriptions define an implicit multi-chart selection group; each chart's selection constrains the shared object set which re-drives every subscribed chart → mutual filtering, no explicit wiring per chart.
- **Error/cancel/recovery:** none documented (limitation noted: cross filter does not support Transform table inputs — "Transform table transform: Unsupported"); deletion follows canvas card-deletion dialogs.
- **Visual hierarchy:** charts remain visually separate; cross-filter is invisible at runtime (no chrome) — users see only effects.
- **Source vs interpretation:** all from official docs + vendor GIFs; the mutual-filtering behavior quoted as documented, not observed live.
- **Astraea adaptation + acceptance:** "linked plots" mode: brushing a results plot (e.g., thrust vs time) filters a linked table/plot of matched runs, and vice versa, without building a query pipeline. Acceptance: brush on plot A → plot B and table update; brush on B → A updates; single clear affordance resets both.
- **What NOT to copy:** the "subscribe plots to a filter card" build ceremony — in a workstation, linked selection should be default/opt-out for sibling plots of the same dataset.
- **Unresolved:** cross-filter handling of time range (does selection imply time window? not documented for cross filter; Quiver time series search uses its own SEARCH TIME RANGE config — separate concept).

### W-3 (Foundry/Quiver) Save, share, and version recovery
- Source: `quiver/analysis-save-share/`, `quiver/core-concepts/` (§Saving and versioning).
- **Task:** persist analysis, revert to history, share.
- **Steps/visible states:** Save (top-right) → analysis saved to Project filesystem; **Analysis history** menu → list of versions → revert; unsaved changes on a reverted version → prompt "clear or save the changes as a new version"; Share button → side panel: **link sharing** (link grants selectable access level) + **Roles** (per-user levels); permissions inherit from the Project (viewers see, editors edit). Auto-save: between Saves Quiver stores working state under URL `state=<id>` (e.g. `state=j05na7mun3`); refresh restores exact state; sharing a URL with `state` opens working state, not latest saved version.
- **Selection/context model:** save is explicit manual + implicit auto-save with a URL-keyed recovery token; concurrent editors "work independently… however saving changes will overwrite each other's saved changes" (explicitly documented — no merge/conflict dialog).
- **Error/cancel/recovery:** auto-save is the recovery story; revert keeps history as versions; concurrent-overwrite is a documented hazard, not handled.
- **Visual hierarchy:** persistent top bar: undo/redo, history clock icon, Save (blue), Share — visible in OPS-101/OPS-102 toolbars.
- **Source vs interpretation:** direct documentation; `state=` URL mechanics quoted from core-concepts.
- **Astraea adaptation + acceptance:** session autosave to a recoverable token + explicit "Save view/session" and version list with revert; when a second editor saves over another's work, surface a warning/diff rather than silent loss. Acceptance: make changes without saving, reload → state restored; save twice → history shows 2 versions and revert works.
- **What NOT to copy:** overwrite-without-conflict behavior; Project-permission-derived access model as the only sharing story.
- **Unresolved:** retention limit of Quiver version history (not stated in read docs; Grafana states its own 20-version default explicitly — see W-8).

### W-4 (Foundry/Workshop) Chart selection → object set filter → linked widgets + state saving
- Source: `workshop/widgets-chart/` (§Layer config, Selection as filter; `workshop/object-set-filter-variables/`; `workshop/state-saving/`).
- **Task:** builder wires an interactive chart so its selection filters other widgets, then lets consumers save/share that state.
- **Steps/visible states:** (1) Chart XY layer: enable **Selection as filter** (object-set-backed charts only) → emits an **Object set filter variable**; (2) connect that filter variable to other object set variables / widget inputs (filter list, tables, object views); (3) builder toggles **Enable State Saving** in Settings → per-variable: give external ID → state-saving enabled; configure **default saved state** so revisits auto-apply; (4) consumer: filters/selects → header state-saving menu → Save state (name, folder shortcut); share as link; reopen link → exact filter/selection restored (state saved = variable values + optional current page). Docs example: NY flight alerts — filter list saving high/medium-priority unresolved alerts from NYC; object table highlight saved and mirrored in right-side Object View.
- **Selection/context model:** the *filter state* is a typed variable (property/value pairs) distinct from the object set itself; it can be applied to different object sets and (with "Update used variables on filter value changes") values can be extracted into primitive variables for reuse — including re-targeting to a *different property* (docs: Email Date filter → Call Date filter via shared variables).
- **Error/cancel/recovery:** state store keyed by external ID — "modifying a variable's external ID after state saving has been configured may cause previously configured states to reload unsuccessfully" (documented degradation). Removing a filter's source property clears extracted variables and drops the dependent filter rather than matching nothing (documented fallback). Limitations: no extraction for deep/nested range filters (pivot/某些 chart selections), XY chart numerical axes don't support extraction; platform-access users only; header must be visible.
- **Visual hierarchy:** state-saving menu lives in module header; default state auto-applies — a "landing view" pattern.
- **Source vs interpretation:** all documented; the NY-flights example and screenshots are vendor-doc.
- **Astraea adaptation + acceptance:** a "results view" whose filter/selection state can be saved (named) and reloaded via link, with selections expressible as filter state separate from underlying dataset. Acceptance: set filters, save state, navigate away, reload via link → same filter chips + selected row; saved-state link opened by another session restores view.
- **What NOT to copy:** external-ID keying fragility (state silently breaks on rename); platform-access gating.
- **Unresolved:** cross-widget selection latency/consistency under large object sets (not documented); auto-apply of default state vs user's last state precedence (docs say default applies "when users revisit the module without a specific saved state in the URL" — mechanical, not preference-aware).

### W-5 (Seeq) Trend time-range navigation: Display vs Investigation range
- Source: `adjusting-time-ranges.md`.
- **Task:** inspect a signal week, zoom to one day, page backwards, stream live.
- **Steps/visible states:** (1) trend shows **Display range** (top) and **Investigation range** (mini-map below); (2) zoom/pan: roll wheel over the time axis labels (cursor becomes horizontal double-arrow) or click-drag on axis to pan; (3) direct date entry: click start/end/duration labels → type partial values (`9:00am` keeps day; `11/15` keeps time) or shorthand tokens: `-1d`, `+1wk`, `*` (now), `*-30d` (last 30 days), `$-12h` (start = end−12h); (4) paging: full-step/back and half-step buttons move by 1×/0.5× current duration; step-to-now button keeps duration; (5) **auto update mode**: streaming trend, configurable cadence, live computation of calculated signals; (6) investigation range shows capsule bars beyond viewport; arrow icons copy range at the other (display↔investigation).
- **Selection/context model:** zoom/pan changes *view*, never data; dual ranges separate "context window" from "focused window"; capsule bars in mini-map make off-screen events visible.
- **Error/cancel/recovery:** unsupported time text → invalid entry handling implied by docs? Not explicit; date entry is forgiving by design (partial entries allowed).
- **Visual hierarchy:** the dual-range with mini-map at the bottom is the density pattern; x-axis cursor affordance communicates zoomability.
- **Source vs interpretation:** KB prose + KB screenshots (`2019-03-14_14-30-52.jpg` = Display Range UI, captured as OPS-111); behaviors as documented.
- **Astraea adaptation + acceptance:** time-axis pan/zoom with (a) direct duration-relative entry (`* -30m`), (b) mini-map context strip showing where the focused window sits in a larger run, (c) paging by current duration. Acceptance: wheel-zoom keeps anchor point; entering `*-1h` resets to last hour; paging moves exactly one window width; mini-map thumb tracks pan.
- **What NOT to copy:** Seeq's separate "Investigation Range" concept name sprawl; `$` token oddity.
- **Unresolved:** none material.

### W-6 (Seeq) Compare view / Capsule time: batch overlay analysis
- Source: `compare-view.md`, `capsule-time.md`; screenshots OPS-106/OPS-107; practitioner thread OPS-113.
- **Task:** compare the same signal across repeated batches (or similarity-search results) by overlaying per-batch traces aligned to a common origin.
- **Steps/visible states:** (1) ensure Details pane has ≥1 condition with properties + signals; (2) click **Compare** icon (or **Capsule** for capsule time) top-left of display pane; (3) **Separate By** dropdown picks property (auto-filled from condition); **First Column** picks reference value; capsules grouped per property value → phase headers (`Phase 1..5`) across chart; x-axis becomes relative time from capsule start (labels `0.0 … 6h`); (4) capsule/compare panel checkboxes highlight/dim capsules; **color** options (rainbow per property, gradient, gradient by condition); (5) "Show data outside conditions" draws pre/post capsule data with signal transparency on the aligned axis (negative relative time); (6) **Add Statistics** in capsule panel; **Group** button assigns signals to conditions (R54+: auto-group by parent asset); Capsules pane column filters ("visual filtering only" — does not affect downstream calculations); capsule-view capsule count was limited (~30) pre-R22.0.48 ("capsule view is limited to maintain display performance" — practitioner-reported error, OPS-113).
- **Selection/context model:** capsule = the selection unit; alignment = view transform; per-column filters are view-only — explicit and documented (important: no silent data mutation).
- **Error/cancel/recovery:** unbounded capsules (start/end outside display range) excluded from capsule time with warning icons in the Capsules Panel; 30-capsule limit (now lifted) surfaced as a popup.
- **Visual hierarchy:** lanes per signal with per-lane Y axes + shared relative X; overlaid traces with per-batch colors; density heavy — that's the tool's point; docs warn of overplotting by providing dimming.
- **Source vs interpretation:** mechanisms from KB; screenshots OPS-106/107 are actual product UI (React-era Seeq), read directly.
- **Astraea adaptation + acceptance:** "overlay runs" mode: select N runs of the same test stand profile → signals normalized to run-start time (t=0) overlaid, per-run color coding, hover shows run identity + value, checkbox dimming. Acceptance: align two runs of different duration; relative-time axis; dimming hides unselected runs from trend only; statistics column (e.g., max) per run visible.
- **What NOT to copy:** separate "Capsule Time" vs "Compare View" as two different modes (confusing — practitioner thread shows users conflating them); 30-item silent cap.
- **Unresolved:** how Seeq picks the trace colors across 11+ overlays (rainbow cycling) — acceptable but unlisted.

### W-7 (Seeq) Organizer publishing: snapshot semantics and recovery
- Source: `seeq-organizer.md` (+ FAQ).
- **Task:** share a recurring report/dashboard that updates on schedule without editor involvement.
- **Steps/visible states:** (1) build Workbench analyses → create **Organizer Topic** (Documents = text editor w/ page breaks for PDF; Dashboards = tile grid); (2) insert content: **snapshot** of the worksheet at insert time — later worksheet edits do NOT propagate (explicit, "so that your reports and dashboards do not change without direct intention"); update deliberately via Modify/Update-from-worksheet; (3) multiple date ranges configurable per topic (fixed-date reports or live auto-updating docs; auto-update requires a **Schedule**); (4) publish PDF with live links back to **View-Only** mode; (5) View-Only date/asset selection requires read permission on each linked workbook (FAQ: users get errors otherwise).
- **Selection/context model:** inserted content = intentional snapshot; staleness is the feature; recovery: "Open Link" → view-able historical Details Pane state to reconstruct; community convention: drop a Journal link in the workbook so content can be recovered after workbook edits.
- **Error/cancel/recovery:** the errors FAQ (colleague can't change dates → permission diagnosis) is the documented failure mode; Table column-insert quirk (pre-R54 tables need a cell-width edit before adding columns) documented as a known bug with acknowledged inconvenience.
- **Visual hierarchy:** Organizer = static layout shell; inserts are live links to Seeq views.
- **Source vs interpretation:** KB text; the Organizer home screenshot is in KB attachments (not re-downloaded — cited).
- **Astraea adaptation + acceptance:** "published report snapshot" semantics for exporting analysis views: exporting a view freezes the displayed selection/time-window unless user opts into a live-linked variant. Acceptance: publish with window A; change session window to B; published artifact still shows A until explicitly refreshed.
- **What NOT to copy:** permission-fragile View-Only editing; snapshot/live duality hidden under "Modify content" submenu.
- **Unresolved:** none material beyond above.

### W-8 (PI Vision, secondary product) Display workspace: symbols, collections, synchronized cursors, timebar, save conflicts
- Source: `1010105.html` (workspace), `1009779.html` (Trend), `1009759.html` (cursors), `1010090.html` (collections), `1009777.html` (timebar), `1009767.html` (save), `1010071.html` (group/edit), `1009709.html` (event compare).
- **Task:** build a monitoring display and use it at runtime.
- **Steps/visible states:** Design: (1) Assets pane search → drag data item onto canvas → symbol created (trend default; value, gauges, tables, bar chart, XY plot selectable from Symbol gallery); (2) collections: convert symbol → collection auto-finds same AF attribute across similar assets (ten pumps example) — updates as asset params change; (3) multi-select symbols (drag-lasso, Ctrl+click, Ctrl+A) → right-click **Format Symbols** (shared props; blank value = mixed across selection), **Group Symbols**.
  Runtime: (4) monitor mode (exit Design mode): **trend cursors** — click any trend to drop a cursor showing all traces' values at that timestamp; cursors are **synchronized across every trend on the display** and share one timestamp when dragged; drag off the edge to delete; (5) timebar (bottom): start/end/duration (default 8 h), paging arrows, duration button, **Now** button; end=`*` → dynamic update; accepts PI time expressions and Windows time, error message on unsupported format; (6) event comparisons: right-click event → Compare Similar Events By Name/Type → up to 11 events overlaid by relative time; select event → trace highlighted + start/end shown; cursors show values per event or per attribute; in-progress events get legend markers; hide via right-click; (7) Save: Ctrl+S / Save As (folders, permissions inherit option); **save conflict**: if another user saved first → cannot save until Reload (abandon changes) or Save As (new display).
- **Selection/context model:** cursor sync = shared-time selection across views (the strongest "one selection drives many panes" primitive in the lane); collections = selection generalized to asset set with criteria; asset context switching via display-level asset dropdown (SP1 etc., visible in OPS-104).
- **Error/cancel/recovery:** conflict dialog (Reload vs Save As) is the canonical recovery; unsupported time text → error message; unbounded capsule warnings (PI Vision events analog).
- **Visual hierarchy:** symbols on free canvas; left panes (Assets/Attributes) hidden at runtime; dark trend plot + gauges; density controlled by author (clutter warning in practitioner blog: "don't throw all your data onto trends").
- **Source vs interpretation:** doc text + UI screenshots (OPS-104, OPS-105 read directly; CSPI demo dataset labels from the screenshot itself).
- **Astraea adaptation + acceptance:** cross-pane time cursor: placing a cursor on any telemetry plot shows values for every open plot at that timestamp, synchronized while dragging. Acceptance: open 2 plots, drop cursor on one → both show cursor + values; drag → both follow; remove by dragging past edge.
- **What NOT to copy:** PI Vision's "every display must be saved to a folder with permissions" bureaucracy; Design/Monitor mode split without keyboard shortcuts for common ops (PI Vision does document keyboard shortcuts elsewhere — separate page not read in depth).
- **Unresolved:** cursor count limits (not documented); collections' update cadence (auto, unspecified latency); event-compare 11-event cap rationale.

### W-9 (Grafana, screened) Dashboard variables, time picker, and version restore (light)
- Source: `.../variables/` (URL-synced `var-`), `.../visualizations/panels-visualizations/visualizations/time-series/` (pan/zoom panel range: drag-zoom, dbl-click zoom-out doubling range, x-axis drag pan), `.../build-dashboards/manage-version-history/`, OPS-108.
- **Task:** make a dashboard reusable across contexts and recover an old layout.
- **Steps/visible states:** variables as dropdowns at top; query/custom/text/interval types; template queries interpolate `$var`; URL sync `var-Server=CCC&from=now-6h&to=now` (skipUrlSync to opt out); panel drag-zoom, double-click zoom-out (range doubles each time), x-axis drag pans; versions: Save creates a version (default 20 kept), Versions tab → select two → Compare versions (text diff + JSON diff) → restore (restore creates a NEW version, preserving history).
- **Selection/context:** variable = dashboard-wide state, URL-addressable — selection as URL contract (matches Quiver's `state=` token and Workshop routing/URL params pattern).
- **Astraea adaptation + acceptance:** make key view parameters (run id, metric, time window) part of the URL so views are shareable and repeatable; restoring a saved layout must not destroy newer ones (append-new-version semantics). Acceptance: open view with var in URL → UI state matches; restore older view → history still contains pre-restore version.
- **What NOT to copy:** 20-version cap without notice (documented default; configurable); template-syntax `$var` collisions.
- **Unresolved:** none material.

---

## Visual evidence (≥2 inspectable, genuinely observed examples per lane — 8 provided)

All images are stored locally in `docs/design-research/evidence/operations/`; none are fabricated diagrams — all are actual product UI (vendor-doc screenshots or live-captured browser views). Local research use only; no republication assumed.

### Figure 1 — Quiver analysis in canvas mode (annotated)
`ops-quiver-overview-annotated.png` (3364×1750; source: `palantir.com/docs/resources/foundry/quiver/quiver-overview.png`, © Palantir; annotated locally)
Numbered callouts (verified by inspection):
1. **Global toolbar** — breadcrumb `Quiver > Overview Analysis`, undo/redo, history, **Save**, **Share**; second row: ADD DATA/Objects/Time Series, ADD CARD/Search cards; Canvas|Graph toggle.
2. **Analysis Contents panel** — card list keyed by global identifiers (`5G Filtered Tea Batches`, `SAZ…`, `SAK Time series search`), `Parameters` section, `Not in canvas`.
3. **Object-set filter card** (`5G`) — `Keep / objects that match / all filters`, `Where Caffeine is (numerical) between greater than SH Caffeine lower bound / less than SI Caffeine upper bound`: filter values bound to **parameter variables**, not literals.
4. **Categorical bar plot** (`SJ Bar plot of Tea Batches by Start Time`) — segments `plant_0..plant_4`, footer `1,583 Tea Batches / Select all objects for drill down`.
5. **Time Series Chart** (`SV`) — Bollinger envelope (SAI), rolling aggregate (SAF), time series search (SAK) in legend, `Undo zoom` affordance; `Add plot`.
6. **Heat grid** (`SAY Heat grid of Tea Batches by pH`) — Caffeine vs pH bins, color scale legend, `Select all objects for drill down` footer.
7. **Time series search config** (SAK) — `SEARCH TYPE: Threshold Bounded`, bounded series = Bollinger bands, `Use variable input` toggles, `SEARCH TIME RANGE: Defined range / Full series`, dependency list (`SW → SAI → SAK → SV`).
Cross-card consistency (counts, identifiers, parameters) is directly visible — the selection/filter state is *a typed, named thing*, which is the core product lesson.

### Figure 2 — PI Vision display workspace (annotated)
`ops-pivision-workspace-annotated.png` (795×334; source: `docs-be.aveva.com/bundle/pi-vision/page/1009608.png` from user-guide page `1010105.html`); **color legend:** red numbered circles 1–11 are the vendor's own tutorial callouts baked into the source image, while blue numbered circles 1–8 are my local annotations added for this report.
1. **Display header row** — `Distribution Department • Asset SP1` (asset context dropdown), chart view icons.
2. **Assets pane** — search box scoped to `CSPI PI Big Tire Co`, asset tree `Home > … > Houston`.
3. **Assets toolbar** (search/grid icons).
4. **Attributes pane** — `Site Stress Average Score` selected; attribute rows = data items to drag onto canvas.
5. **Trend chart** — two-pen trend (blue/orange) over 8 h window `6/23/2020 12:57:02 AM → 8:57:02 AM`, legend w/ live values (`205.11`, `267.8 °F`).
6. **Vertical gauge** — `CDT158 / 205.96 DEG C`, scale 50–250.
7. **Timebar** — start, `8h` duration, paging arrows, `Now`, end; `*` end = dynamic.
Layout lesson: left = data browser (panes), center = visualization, right = value-at-a-glance; one timebar drives every symbol.

### Figure 3 — Seeq Workbench Compare view (annotated)
`ops-seeq-compare-annotated.png` (1176×789; source: Seeq Knowledge Base attachment `Compare view button with good compare view screen.png`, from `compare-view.md`):
1. **Toolbar** — Compare active; `Separate By: Phase`, `First Column: Phase 1`; Color/Lanes/Axes/Labels/Group/Dimming.
2. **Trend lanes** — `°C Reactor Temperature` (top), `g/L Solution Concentration` (bottom), each with own Y axis.
3. **Phase headers + Batch legend** — columns `Phase 1..5`; 6 overlaid batches (`Batch R1-04…R1-09`).
4. **Range/timeline zone** — 7-day window `27/6/2022 → 4/7/2022`, paging icons.
5. **Details pane** — Name/Assets rows (2 signals + `Phases` condition).
6. **Capsules pane** — `Start / Phase / Batch ID / Operation` rows, `Page: 1 Show: 100`.
7. **Investigation overview track** — capsule ticks across a month+ with selection brush.
Lesson: capsule-relative time (x labels `0.0, 00:30, 1h…`) + first-column reference = one-click batch comparison; per-lane Y axes on shared X.

### Figure 4 — Seeq Capsule View after similarity search
`ops-seeq-capsule-view.png` (1900×1468; source: KB attachment `Entering Capsule View.png`, from `capsule-time.md`): 3 signal lanes overlaid across ~8 capsules from `Compressor Profile Search`, ranked `Similarity 100% … 98.08%` in the Capsules pane; relative-time X axis (0–18 h), Alignment/Dimming toolbar, Details pane lanes 1–3; capsule checkboxes dim/emphasize. Demonstrates the "selection ranks results and view overlays them at common origin" pattern.

### Figure 5 — Grafana Play (live, observed in this run)
`ops-grafana-play-timeseries.png` (1639×921; captured 2026-09-10 from `play.grafana.org/d/000000016/` — a public live demo, observed hands-on in Orca browser): dashboards example page; header shows `<<`, `Last 1 hour` time picker, refresh, share/`Edit`; collapsed left nav (Dashboards/Explore/Drilldown/Alerts…); `Simple graph` panel with gradient-filled series `A-series`/`B-series`, right-side legend, `Interpolation modes` collapsed row below. (Screened-product visual reference: variable/time-range chrome is header-first, panel-zoom in-view.)

### Figure 6 — Quiver empty-canvas onboarding (annotated source image)
`ops-pal-howto-analysis-canvas-annotated.png` (2838×1828; Palantir docs resource `howto-analysis-canvas-annotated.png`): empty analysis state — `Visualize, Analyze, & Transform Data` + `+ Add data to analysis` CTA and quick-action strip (Filter/Visualize/Calculate/Join/Transform/Convert). The vendor's red `Canvas` overlay marks the canvas region. Notes the two-row toolbar and left rail pattern.

### Figure 7 — PI Vision trend cursors (product UI)
`ops-pivision-trend-1009503.png` (489×327; docs resource `1009503.png` from `1009759.html`): two vertical cursors at `7:04:51 AM` and `9:28:13 AM` with per-trace value readouts (`31.65/33`, `36.877/41`), stepped cumulative lines `Good Tires`/`Net Tires Produced`, legend top-right with current values. Vendor callouts 1–4 label legend/cursor mechanics.

### Figure 8 — Workshop Object View widget (embedded context)
`ops-pal-object_view_example.png` (1722×1522; Palantir docs resource `object_view_example.png` from `widgets-object-view/`): configured Object View widget rendering a single `Airport` object — the "detail pane fed by selection" end of the Workshop pattern (object table → object view on selection is the canonical Workshop master-detail).

Annotated-opacity note: Figures 1–3 use my own numbered overlays; positions were re-verified after generation (see evidence register for method). Figures 4–8 keep vendor annotations or none.

---

## Practitioner signal (independent) or documented bounded search failure

Signal is anecdote-level, not population evidence; treated as directional.

1. **Seeq community thread — "Comparing signals from different time periods"** (`seeq.org/topic/772`, July–Aug 2020; read via browser 2026-09-10 — curl/read-tool returned HTTP 403, browser succeeded). Findings: (a) a new user did not know Capsule View existed and had to be taught it ("I am very new to Seeq") — discoverability signal for relative-time workflows; (b) Seeq team staff member confirms a second user's popup "capsule view is limited to maintain display performance" was the old ~30-capsule cap, "lifted in Version 22.0.48"; (c) the OP returned 4 weeks later asking how to subtract one capsule's value from another's ("difference from the same signal from different Capsules… daily, weekly, or monthly") — the delta-between-capsules need recurred, and docs answer it via Signal from Condition/Capsule statistics only after chat guidance.
2. **ITI Group (systems integrator) blog — "Dashboard Design Best Practices with AVEVA PI Vision"** (iti **group.com**, Nov 2024, author Eddie Bryce, Senior Systems Engineer; read 2026-09-10). Independent practitioner guidance: audience split (hydrocarbon-accounting vs production-performance teams need different density); "the danger is that we just 'build a dashboard'… throwing data at the canvas and seeing what sticks"; avoid "traffic light blindness"; collections/context-switching prevent display bloat; test with real users early. Corroborates the authoring-paradigm emphasis of the official docs.
3. **Reddit r/dataengineering — "Has anyone ever used Palantir Foundry?"** (thread `ygp90r`, ~4 y old, read via browser 2026-09-10). Anecdotes: "impressive, but it seems pretty heavy… doubt it's worth the price if only used by a DE team"; analysts favor Contour ("quick analysis and data QC"); "its ok… most of it can be done independently… if you have deep pockets palantir takes care of the infrastructure and has a nice gui"; adjacent team "only ever heard bad things… actively trying to get off it. High learning curve, complex, and expensive"; counterpoint on schema evolution/time-travel being built-in. Directional: ecosystem lock-in + learning curve are the recurring complaints; slick GUI is the recurring compliment.
4. **Grafana docs themselves** (`…/variables/`): official note that constant variables default to `skipUrlSync=true` "to avoid exposing sensitive values in shared links" — a security-minded selection-state pattern worth citing in the report (not practitioner, but design evidence).

Documented bounded failures (not invented complaints):
- `forum.palantir.com` — unreachable from this network (`Unable to connect`, curl exit 6); Palantir community search could not be used.
- `seeq.org` — HTTP 403 to curl and to the read tool with default UA; content was reachable only through the Orca browser (may be bot-gating); note the possible UA gate.
- Medium-hosted Foundry article (`blog.dataengineerthings.org/…foundry…`) — served the Medium shell; article body paywalled/absent to the read tool; dropped, used the Reddit thread instead.

---

## Cross-product synthesis for the reference atlas

1. **Selection as first-class state, not a transient** — Quiver materializes chart selections into named object sets / filter variables; Workshop makes filter state a typed variable that can be saved, extracted, and re-targeted; Seeq's capsule pane selection drives view transforms; PI Vision's trend cursors are a *shared-time* selection across panes; Grafana syncs variables+range into the URL. Astraea: selection (runs, phases, motor variants, time windows) should be an addressable, persistable object, not ephemeral UI state.
2. **Two-level time model** (context + focus) — Seeq Display/Investigation dual range; PI Vision timebar + per-symbol overrides; Quiver `SEARCH TIME RANGE` per card + defined/full; Grafana dashboard range overridden by panel zoom. Astraea: keep a session time window and per-view windows.
3. **Relative-time alignment for comparison** — Seeq capsule time/compare view, PI Vision event comparison (11 events, relative x). Astraea: overlay repeated test runs aligned at t0/t-events.
4. **Save/recovery is a product feature** — Quiver auto-save `state=` token + version history; Workshop saved states with default state + link sharing; PI Vision conflict dialog (Reload vs Save As); Grafana version history with non-destructive restore; Seeq Organizer snapshot semantics. Astraea: autosave + named views + conflict handling + non-destructive restore.
5. **Build vs consume separation** — everywhere an explicit mode/role split exists; consumer surfaces are chrome-light. Astraea: distinguish "analysis mode" from "review/export mode".
6. **Error/empty-state honesty** — Workshop documents empty-state configuration (Object View widget), lazy variable load + loading indicator; Seeq documents capsule caps/bounded warnings; PI Vision error messages on bad time strings; Grafana migration of legacy panels. Astraea: name the empty/stale/provenance states rather than rendering blank panes.
7. **Units & precision** — PI Vision legend shows value + unit inline (`267.8 °F`, `205.96 DEG C`); Seeq lanes labeled with units; Quiver docs explicitly list aggregation accuracy limits (unique count approximate/exact toggle; percentile always approximate ≤0.1% relative error; stddev/variance approximate under accumulator error) — a provenance caveat pattern to copy into engine-facing docs, not into the UI.

## Evidence register (OPS)

| ID | Product/version | Source (URL) | Locator | Date | Method | Observation | Limitation |
|---|---|---|---|---|---|---|---|
| OPS-101 | Quiver (docs current) | palantir.com/docs/foundry/quiver/analysis-canvas/ | image `howto-analysis-canvas-annotated.png` | 2026-09-10 | official docs screenshot | Empty analysis onboarding; toolbars; Canvas overlay | No live interaction |
| OPS-102 | Quiver | `.../quiver/overview/` | image `quiver-overview.png` + annotation pass | 2026-09-10 | official docs screenshot + vision-inspected annotation | Multi-card canvas: filters bound to parameters, drill-down footers, TS search config | Low-res text at edges |
| OPS-103 | Quiver | `.../workshop/widgets-object-view/` | image `object_view_example.png` | 2026-09-10 | official docs screenshot | Object View embedded detail pane | Marketing-ish sample |
| OPS-104 | PI Vision 2025 docs | docs.aveva.com/bundle/pi-vision/page/1010105.html | image `1009608.png` | 2026-09-10 | official user-guide screenshot + annotation | Workspace panes, trend, gauge, timebar; CSPI demo data | 795×334 pixel-bound |
| OPS-105 | PI Vision 2025 | `.../1009759.html` | image `1009503.png` | 2026-09-10 | official user-guide screenshot | Trend cursors w/ values at two timestamps | Tooltip text partly illegible |
| OPS-106 | Seeq (latest/cloud) | support.seeq.com compare-view.md | attachment `Compare view button…png` | 2026-09-10 | official KB screenshot + annotation | Compare view, Separate By, phase headers, capsules pane | Small toolbar icons |
| OPS-107 | Seeq | capsule-time.md | attachment `Entering Capsule View.png` | 2026-09-10 | official KB screenshot | Capsule alignment of similarity search results | Overplotting reduces precision |
| OPS-108 | Grafana (play) | play.grafana.org/d/000000016/ | live screenshot | 2026-09-10 | hands-on observed (browser) | Time picker, panels, legend, series visibility chrome | One viewport only |
| OPS-109 | Quiver (docs current) | `.../quiver/objects-chart-drilldown/` | page text + GIFs | 2026-09-10 | official documented | Drill-down → Selection Object Set; ctrl/click-drag multi-select | GIF frames not extracted |
| OPS-110 | Workshop | `.../workshop/object-set-filter-variables/`, `state-saving/`, `widgets-chart/` | page text + screenshots referenced | 2026-09-10 | official documented | Selection-as-filter variable; extraction; saved states | No live instance |
| OPS-111 | Seeq | support.seeq.com/latest/cloud/adjusting-time-ranges.md | image `2019-03-14_14-30-52.jpg` (Display Range UI), archived locally as `evidence/operations/ops-seeq-display-range-2019-03-14_14-30-52.jpg` (attribution: Seeq Knowledge Base, "Adjusting Time Ranges," © Seeq; local research use only) | 2026-09-10 | official KB text + screenshot | Display/Investigation ranges, tokens, paging, streaming | 2019-era static capture; shows UI only, live interaction not observable |
| OPS-112 | Palantir Foundry | palantir.com/docs (multiple, see OPS-P1) | page texts | 2026-09-10 | official documented | Type model, save/share/versioning, cross filter | Doc-only |
| OPS-113 | Seeq community | seeq.org/topic/772-comparing-signals-from-different-time-periods/ | full thread (5+ posts) | 2026-09-10 | practitioner reported (browser) | Capsule View discoverability; 30-capsule cap popup; recurring delta-between-capsules question | Thread from 2020; anecdote only |
| OPS-114 | PI Vision (integrator view) | itigroup.com/news-blogs/unlocking-insights-dashboard-design-best-practices-with-aveva-pi-vision/ | article body | 2026-09-10 | practitioner reported | Audience/density guidance; clutter warning; collections | Vendor-aligned integrator blog |
| OPS-115 | Foundry (practitioner) | reddit.com/r/dataengineering/comments/ygp90r/ | thread (7+ comments) | 2026-09-10 | practitioner reported (browser) | Heavy/expensive/learning-curve complaints; GUI praise | 4-y-old; deleted OP (text from comments) |
| OPS-116 | Palantir community forum | forum.palantir.com/ | N/A | 2026-09-10 | bounded search failure | Unreachable from this network | — |
| OPS-117 | Seeq.org via curl/read | seeq.org/topic/772 | HTTP 403 | 2026-09-10 | bounded search failure | Bot/UA gating; browser worked | — |

## Evidence/access gaps

- No live Foundry (Quiver/Workshop), PI Vision, or Seeq instance: all interaction claims derive from official docs, vendor screenshots/GIFs, and community threads — no hands-on confirmation of cursor-sync latency, cross-filter behavior on large sets, or state-saving round-trips. Palantir forum unreachable (OPS-116).
- PI Vision doc pages are Zoomin-JS shells to HTTP clients; rendered reads happened in the embedded browser. Several doc bodies (e.g., trend-options details `1009717`, pan/zoom `1009825/1009789`, PI time expressions `1010108`) were identified in the TOC but not fully read (scope).
- Quiver's `analysis-data-model` page and event-set/transform-table card family identified but not read in depth.
- Grafana: screened, not deep — no alerting/annotations/JSON-model dive.
- No performance/accessibility claims can be made from screenshots (per brief); none attempted.

## References (all accessed 2026-09-10)

Palantir: widgets-object-view, concepts-layouts, concepts-variables, object-set-filter-variables, widgets-chart, state-saving, state-saving→object-set-filter-variables, state-saving→supported variables, quiver overview, core-concepts, card-cross-filter, analysis-save-share, analysis-canvas, analysis-graph, objects-chart-drilldown, objects-property-drilldown, cards-index-charts, cards-index-time-series.
AVEVA: pi-vision display workspace (1010105), Trend (1009779), trend cursors (1009759), collections (1010090), timebar (1009777), save displays (1009767), select/edit/group (1010071), compare events (1009709), asset comparison table (1009799), PI Vision welcome (1025963).
Seeq: using-seeq, seeq-workbench, trend-view, adjusting-time-ranges, compare-view, capsule-time, seeq-organizer, tools, data-views; community thread 772.
Grafana: faq root, build-dashboards, manage-version-history, time-series visualization, variables; Grafana Play dashboards example.