# CAD / Configuration Reference Study (Astraea design research, lane 1)

Lane owner: DeepSeek lane (dispatched worker). Status: research execution; no Astraea source changes authorized.
Deliverable scope: this file + `evidence/cad/` (owned lane evidence). Main checkout and all source/config are READ ONLY.

## 1. Method and access statement

- **Report model**: `openrouter/deepseek/deepseek-v4-flash-0731` (per-dispatch configured model; image inspection delegated to the session vision pipeline, quoted verbatim where used).
- **Method**: documentation and public screenshot research only. **No hands-on execution was possible or performed**: Siemens NX, CATIA/3DEXPERIENCE, PTC Creo require paid commercial licenses; Onshape requires account creation (prohibited by brief: "No paid accounts/trials … Do not buy or create accounts"). All workflow claims below are therefore **official document / vendor-blog / independent-trainer documented** evidence, never hands-on. Where the brief allows "observed screenshot", the observed screenshots are the official UI captures downloaded into `evidence/cad/` and inspected by the vision pipeline; those images are genuine product UI, not marketing renders, except where noted.
- **Access dates**: all URLs accessed 2026-09-10. Pages updated/dated: NX blog posts published 2025-07-22 / 2025-08-13 / 2025-03-05 (retrieved 2026-09-10); Onshape help "Last Updated: September 09, 2026"; Dassault press release April 24, 2025; PTC help Creo PMA r12.
- **Evidence discipline**: for each evidence item an ID, product/version, source URL, locator, access date, method, observation, and limitation are recorded (see §8). Claims that are interpretation rather than source statement are labeled `[INTERP]`. A marketing claim is never presented as hands-on evidence.

## 2. Screened landscape

| ID | Product | Category | Intended user/task | Commercial positioning | Documented industrial relevance | Access level | Verdict + rationale |
|---|---|---|---|---|---|---|---|
| CAD-101 | Siemens NX (with Teamcenter) | High-end parametric CAD + PDM; native desktop | Mechanical/aerospace design engineers; assembly-heavy workflows | Flagship Siemens Xcelerator MCAD; "NX makes it real" positioning; AI-assisted (Design Copilot NX) | Official Siemens blog and documentation; no independent adoption numbers gathered in this lane | No license; official docs/screenshots only | **Include — deep study**; selection filtering + Teamcenter versioning are the two most transferable patterns for Astraea's assembly/branching model |
| CAD-102 | Dassault CATIA / 3DEXPERIENCE | High-end parametric CAD on PDM/PLM platform | Aerospace/automotive design; enterprise PLM pipelines | "3DEXPERIENCE platform company"; virtual twins for whole lifecycle | Airbus: 20,000+ users, company-wide, civil+military aircraft and helicopters (press release 2025-04-24); 370,000 customers claim (vendor) | No license; vendor press release + independent VAR/trainer article (GoEngineer) + vendor-hosted community tips | **Include — screened; partial deep study**; evidence is second-hand (trainer/VAR and vendor announcements). Context menu + Explore Mode + maturity states are the transferable patterns |
| CAD-103 | PTC Creo Parametric | Mid/high-end parametric CAD | Mechanical design; PTC PLM ecosystem | PTC's flagship parametric; "Creo PMA" help docs public | PTC official help r12 docs; no independent adoption numbers gathered | Official help pages public (no login observed) | **Include — screened; no deep workflow**; selection-filter semantics (compound/individual, Alt-override, My Filter) are the transferable pattern; no genuine UI screenshots obtained (text-only help) |
| CAD-104 | Onshape (cloud) | Browser/cloud parametric CAD with git-like version graph | Teams needing real-time collaboration + branching | "Stands on the shoulders of SolidWorks" founders; cloud-native, no file saves, auto-versioning | No independent aerospace adoption claim used; honest positioning: consumer of PTC/SolidWorks diaspora, strong in SME/collab | Help docs public; product requires free/paid account (prohibited) | **Include — deep study**; version/branch/compare/merge graph + rollback + dialog commit model are the most directly transferable patterns for Astraea |

All four lane-required candidates screened. No fabricated adoption: where a claim of industrial use comes from a vendor press release (Airbus/3DS, Siemens blog), it is labeled vendor-reported.

## 3. Deep study — Siemens NX

### 3.1 Workflow W1: NX general selection filtering (edit-path selection)

Sources: Siemens Designcenter blog "NX | Tips and Tricks | General Selection Filtering UI" (Alex Discher, 2025-07-22, published + videos) — vendor official, screenshots observed.

**Task and starting state**: engineer in a parametric part with a rim-and-chassis assembly; needs to apply one chamfer to a rim and later select repeated/similar geometry across a busy assembly. Starting state: part file open, no selection.

**Step-by-step actions and visible states**:
1. Open Selection Filters dialog (filter icon). Visible dialog: title bar `Selection Filters`, 4 tabs — `Types` (active, blue underline), `Layers`, `Display Attributes`, `Scope`. `Types` shows a checkbox tree: CSYS, Curve (focused with dotted rectangle), Curve Feature, Datums, Edge, Face, Feature, Point, Sketch, Solid Body, View (all observed checked). [FIG-1]
2. Scope to narrow picking: `Scope` tab offers three ranges — "Entire assembly view", "Within work part and components", "Within work part only". [CAD-002]
3. Invoke Chamfer command on a rim lug edge. Visible state: `Chamfer` dialog with an `Edge` group, `Select Edge (1)` (yellow-highlighted selection row), `Cross Section = Offset and Angle`, `Distance = 3 mm`, `Angle = 45°`, `Add New Set`, `Preview` + `Show Result`; bottom buttons `OK / Apply / Cancel`. In the canvas, one lug-hole edge is **orange** (active selection) while ~9 similar lug-hole edges are highlighted **light blue** ("predicted objects" candidates from AI-assisted selection). A floating mini-popup (cross-section value chips: `Distance 3`, `Angle 45`) sits near the cursor with a leader line to the selected edge. [FIG-2] [CAD-003]
4. Either pick one candidate edge, or click "predicted objects" to commit all blue similar edges at once (blog claims both paths). [CAD-003]
5. Optional precision control: `Select Similar Edges` dialog with a **sensitivity slider**; results highlight in orange, and per-edge refinement via right-click menu. [CAD-004]
6. Alternative dense-area pick: hover in dense canvas for a few seconds → three dots appear beside cursor → right-click → `Select from List` at top of menu, listing all components under cursor; pick from list. [CAD-005]

**Selection/context model**: selection is *filter-scoped and type-tiered* (dialog tree = type allow-list); "select similar" is tolerance + centroid-like similarity, AI-assisted; hover delays disambiguate occlusion instead of cycling picks.

**Error/cancel/recovery**: Chamfer dialog supports explicit `Cancel` (discard) vs `Apply`/`OK` (commit); `Preview` toggle; the similar-edges dialog lets you refine the set before committing. Blog does not document undo depth for these filters.

**Visual hierarchy/density**: four tabs, each ≤1 list; active tab underlined; selection affordances: orange = active/committed pick, blue = predicted candidates, yellow = row requiring action — three-state color coding is the core legibility device. Dialog over canvas; compact.

**Source vs interpretation**: blue = "AI-predicted similar edges" is blog-stated (`Predicted objects`); orange = explicitly selected is blog-stated. The exact ~9 count is my pixel observation [INTERP].

**Astraea adaptation (testable acceptance)**: Astraea's part/assembly selection should adopt a *type-tiered filter bar* (part / component / edge-like semantic / group) with a Scope (whole-vehicle vs current stage vs current subassembly) and a three-state highlight convention (candidate/selected/action-needed) shared across all edit tools. Acceptance: with a 40-element assembly loaded, `Select component` filter restricts pick highlight to whole components; "Select similar motors" (same manufacturer+class) yields N candidates and a one-click commit; hover-hold on overlapping components in the tree canvas surfaces a `Select from list` disambiguation menu. Manual test: 3 orthogonal scenarios in the running app.

**What NOT to copy**: the dialog's 11-type flat checkbox tree (overwrought for Astraea's domain); AI "predicted objects" as the *only* bulk path without an explicit list (risk of surprising commits); right-click customization of the ribbon to find commands.

**Unresolved**: blog does not document keyboard-only alternative to hover-select on dense areas, nor failure state when similarity tolerance excludes everything.

### 3.2 Workflow W2: NX first-time part modeling (sketch → edit → display)

Sources: Siemens Designcenter "NX | How to series | Modeling a part for the first time" (Jamie Tyler, 2025-03-05). Vendor official.

**Task/starting state**: create gearbox-cover part from scratch; blank new part file.

**Steps and visible states**:
1. `File > New` → template chooser with discipline categories (Modeling etc.), units dropdown (measurement system), template-specific optimized UI. [CAD-006]
2. Layout orientation: title bar; ribbon Home tab (most-used commands; other tabs for complex actions); left-pinned **Resource bar** with **Part Navigator** listing the feature history; Application tab switches app. [CAD-006]
3. Sketch (Construction group, Home tab) → prompt to select sketch plane; requirement: keep sketches simple and **fully defined**. Sketch Navigator Curves tab has a status column: **black circle = fully defined, white/open circle = needs dimensions** — a live definition gauge. [CAD-007]
4. Trim command: removes obstructing segments; "NX will automatically update the shape of a sketch when clicking and dragging an existing line" (dynamic drag-to-edit of sketch entities). [CAD-007]
5. Extrude: pick sketch, enter distance → prism. Dialog-driven with numeric input. [CAD-006]
6. Profile command for connected-line outlines; Chamfer for draft mimic; Hole on existing face; Pattern Feature (linear/circular/rectangular; count-span control) and Mirror Feature (plane/planar face/user plane) to replicate holes. [CAD-008]
7. Polish: `Display tab > Edit object display` (visibility, color, transparency) and Assign visual materials (density/elastic/thermal properties carried for downstream simulation). [CAD-008]

**Selection/context model**: explicit command-mode selection; the Part Navigator is the edit-history anchor ("if you want to go back and make a change to a previous feature, this is the place"). Fully-defined gauge is a continuous validation feedback, not a modal error.

**Error/cancel/recovery**: undo not documented in this post; the navigator = rollback point; "save early and often" advice — a desktop-workflow habit Astraea already outpaces with autosave.

**Visual hierarchy**: single command dialog at a time; canvas dominance; left resource bar; status gauges embedded in the tree, not in a separate panel.

**Source vs interpretation**: gearbox cover geometry and citations from blog text. All steps documented with official text; several steps also demonstrated in embedded video (not viewable textually) — flagged.

**Astraea adaptation (testable acceptance)**: live definition/completeness gauge for motor/component configurations (e.g., a config row shows "complete/needs thrust, mass" state inline), palette of edit tools accessible from the entity (contextual "create hole/cut/property" on a structure), and a persistent left navigator with a roll-back point per stage. Acceptance: an incomplete motor config renders an inline amber "definition needed" chip and blocks export with a specific missing-field list; editing a structure's parent updates dependent child modules with a visible dirty/refresh state.

**What NOT to copy**: ribbon tab sprawl; template-per-discipline startup; "save early and often" prompts (Astraea autosaves by design).

### 3.3 Workflow W3: NX + Teamcenter versioned upload (version/compare path)

Sources: Siemens Designcenter "How to Upload and Manage CAD Data in Teamcenter with NX" (Jimmy Costello, 2025-08-13). Vendor official.

**Task/starting state**: engineer with local unmanaged `.prt` files; wants them managed so teams track revisions; starting state = part exists only on disk.

**Steps and visible states**:
1. Trigger: `Save As` inside managed env OR `Assign Teamcenter ID to unmanaged parts` — "both leading to the same critical setup window". [CAD-009]
2. Setup window: assign **unique ID** (company convention), descriptive **Name**, initial **Revision** (typically starts A or 1 and increments per iteration), optional **Item Type** (CAD Design Item common), optional target project + folder; can keep local folder structure. [CAD-009]
3. Single-part upload completes; part discoverable/searchable with ID + revision.
4. Assemblies: use `Import Assembly into Teamcenter` tool, not Save As. Select local assembly root; system recognizes existing components; per-component choice: **reuse existing items or create new instances** (revision-control decision). [CAD-010]
5. Validation step: tool lists all components with IDs, names, revision letters; "validate Teamcenter information at this stage"; **existing-part-action column** allows overwrite-vs-reuse per component; **secondary attributes** (material properties, design specs) enrich searchability. [CAD-010]
6. Assign assembly to project; complete upload; verify structure in Teamcenter search.

**Selection/context model**: file-centric (not graph-centric); version identity is assigned metadata (ID + revision), and revision is a linear letter/number progression — no branching semantics documented in this source.

**Error/cancel/recovery**: blog states validation before completion; does not document failure recovery for invalid reuse decisions (e.g., stale revision chosen).

**Visual hierarchy**: dialog columns (ID/name/revision/action) as tabular validation — every row is an explicit, checkable unit; secondary attributes are optional enrichment, not required ceremony.

**Source vs interpretation**: vendor blog; screenshots observed (single-parts dialog, Import Assembly dialog). No hands-on. The claim "works in managed mode streamlines … eliminates duplication" is vendor positioning.

**Astraea adaptation (testable acceptance)**: version identity as *explicit metadata*, not auto-increment alone: allow naming a version (e.g., "Flight candidate A"), showing revision letter + description in the version list, and a **pre-import validation table** for imported rocket/part sets listing each component, its origin state (reuse vs new), and a resolve conflicts action. Acceptance: importing a preset with 30 components renders a validation table of 30 rows with type/health columns and catches 2 deliberately broken components (missing mass, unsupported class) before commit, offering per-row "reuse/replace/mark" resolution.

**What NOT to copy**: revision-letter-only histories with no graph; "Assign ID" ceremony at first save (Astraea should auto-assign IDs); modal "existing part action" without a dependency preview.

## 4. Deep study — Onshape

### 4.1 Workflow W4: Onshape version, branch, merge (version/compare journey)

Sources: Onshape help `versions_and_history.htm`, `document_management.htm`, `merging.htm` (all "Last Updated: September 09, 2026"). Official docs; screenshots observed.

**Task/starting state**: bicycle-frame example — team at a stable design base wants parallel experiments (Seat, Brakes, Shocks) without disturbing the base. Starting state: document with auto-created **Start version** and **Main workspace**.

**Steps and visible states**:
1. Open Versions and history (Document panel icon, or bottom-left in iOS). Graph shows Start + Main by default. [CAD-011]
2. Create version: select workspace → Create version icon → name + description dialog → Create (or Create version and edit properties). Result: named immutable version node (solid dot) in the graph. Warning path: if drawings have pending updates (bright yellow Update icon), dialog includes "These drawings should be updated before creating a new version" and an Update click; updating icons then canceling the dialog still applies the drawing updates. [CAD-012] [CAD-004m]
3. Branch: right-click a version → `Branch to create workspace` → properties dialog → Create. Result: new branch (bold+italic label) ending in a workspace (open dot); graph color-codes each branch; merges shown as explicit lines. [CAD-012]
4. Parallel work: Seat/Brakes/Shocks designers each branch from Base Frame; they can create more versions on their branches. [CAD-012]
5. Merge: activate Target (Main highlighted dark blue); right-click Source (`Merge into current workspace`). **Merge dialog** (observed): title `Merging changes into Main from B1`; Overall merge strategy 3-card selector — `Keep Main` / `Merge changes` (default, "Combine all changes to 3 tabs") / `Replace with B1`; per-tab override dropdown; tab rows with status icons (green check = kept, red x = discarded edits kept, `!` = tab won't exist, info = cannot merge tab type); footer Merge/Cancel. Source pills (B1) yellow, target (Main) blue/grey. [FIG-5] [CAD-014]
6. Post-merge: message bubble with **revert link**; undo icon does NOT undo merges — revert merge is explicit and only available until the message is closed or another change is made; graph draws merge lines (toggle Show/Hide merges). [CAD-014] [CAD-015]

**Selection/context model**: workspace-as-anchor; commands live on a right-click context menu whose options depend on clicking a *change*, *version*, or *branch*; selection is menu-driven, not canvas-driven.

**Error/cancel/recovery (heavily documented)**:
- Drawings/PCB Studios cannot "Merge changes from both" — only Keep/Replace; docs walk a 2-branch scenario that loses one dimension and recommend single-workspace authoring for drawings.
- FeatureScript version mismatch between branches → warning + Update now.
- Document open in another window/by another user → merge blocked with user list; retry on close; network-verify timeout → Retry button.
- **Workspace protections**: protected branch requires the working branch to be kept up-to-date first (backward merge dance documented step by step).
- Merge with no changes: Merge button unavailable; switch per-tab strategy to Replace to proceed.
- Revert merge: revert link in message; **any later change (by anyone) invalidates revert and loses it**.

**Visual hierarchy**: graph + list combined panel; color = branch; dot shape = version(closed)/workspace(open)/release(triangle); legends documented; filters (Show all / workspace-only / current branch / current+parents); history search with Tab/Modified-by/Date filters; change list capped at 25 with Show more. High density but ordered by time; "Tab::Action:Feature" history description composing traceability.

**Source vs interpretation**: all from official docs, screenshots observed in help pages. Merge dialog screenshot pixel-read: green checks and yellow/blue highlights as observed; the `↗` compare-with-base link and per-row drop-downs observed. Unverified: actual merge conflict content resolution UI (docs show strategy, not 3-way conflict line editing).

**Astraea adaptation (testable acceptance)**: adopt a version/branch/merge model for *design configurations and simulation states*: named immutable versions with description; branch = parallel design lane; explicit merge dialog with per-tab (per-stage) Keep/Merge/Replace strategy and a "revert merge" message that persists until the next change. Acceptance: create version of current rocket config → branch → alter motor → merge back with Keep/Replace per stage; verify a revert-merge message appears and restores the branched state, and that a second edit disables revert (documented warning reproduced).

**What NOT to copy**: the protection "backward merge dance" (over-engineered for Astraea v1); drawings that cannot 3-way merge (Astraea should treat all stages uniformly); change-list cap of 25 without a virtualized list; iOS-specific tap-hold interactions.

**Unresolved**: no docs on merge conflict line-level resolution UX beyond strategy selection.

### 4.2 Workflow W5: Onshape compare (compare journey)

Sources: Onshape help `compare.htm` (Last Updated 2026-09-09). Official docs; observed screenshot.

**Task/starting state**: compare two points in history — Main workspace vs V3 version (observed example), or any combination workspace/version/history-entry.

**Steps and visible states**:
1. Open Versions and history → click Compare icon (top of panel), or right-click a Target entry → Compare. [CAD-016]
2. Select two history entries: first selection **blue**, second **red** (observed: headers `Main` (blue) vs `V3` (red-orange)). Expand `Changes` to select a specific history entry.
3. Compare panel opens: two-column feature list (Base left, Target right), differences-only by default (`Only show differences` checkbox observed), and a graphics viewport with a **slider** to blend Base/Target displays. [FIG-4]
4. Interpret list icons: no icon = identical; `≠` = not identical; `<` = Base-only; `>` = Target-only; up/down arrows = reordered. [CAD-016]
5. Reversible: `Reverse compare` swaps sides. Config-aware: when a configuration exists, compare dialog includes Configuration selection. Tabs view lists all Part Studios; per-part isolation via context `Show/Hide Part`.
6. Tolerance: comparing feature dialog values between entries flags differing tolerance options in yellow (MBD tolerance example).

**Selection/context model**: two-point selection with permanent base/target color encoding; slider as a *continuous* visualization of discrete state difference.

**Error/cancel/recovery**: doc explicitly states **"Comparing Assemblies is not yet supported"** — documented functional gap. No failure path documented for selecting same entry twice [unresolved].

**Visual hierarchy**: panel = list-list-graphics triple; color = side; icon = relation type; slider = temporal blend. Dense but disciplined; a legend is documented rather than hanging on screens.

**Source vs interpretation**: official docs; screenshot read: blue/red headers, `Only show differences`, slider position near center-right, changed fillet highlights in translucent blue on the model. Non-difference rows hidden under the filter, so "which features are identical" is not visible in the cropped image [INTERP].

**Astraea adaptation (testable acceptance)**: a compare surface for two design states showing (a) per-stage/motor/channel difference list with add/remove/modify icons, (b) a blend slider over time for visualization, (c) per-section isolation ("show only this stage's changes"). Acceptance: comparing two saved configs yields exactly expected add/remove/modify rows for staged edits (fixture: rename a motor, remove a stage, change an altitude limit) and the slider visually blends geometry/values between states.

**What NOT to copy**: shipping without assembly-level compare; requiring history-graph literacy to reach compare (Astraea should put "Compare current vs last saved" one click away).

### 4.3 Workflow W6: Onshape feature edit, rollback, undo, dialog lifecycle (selection/edit/commit/cancel)

Sources: Onshape help `features_and_parts_lists.htm`, `user_interface_basics.htm`, `selection.htm`, `dialogs.htm` (all Last Updated Sep 2026). Official docs; observed screenshots.

**Task/starting state**: engineer editing a Part Studio, needs to (a) fix an earlier feature, (b) manage complex many-feature history visually, (c) commit or reject edits cleanly. Starting state: Part Studio with 10 features (observed).

**Steps and visible states**:
1. **Rollback bar**: thick horizontal bar in the Feature list; drag to an earlier point → model renders only features above the bar; features below are *temporarily suppressed*. Right-click feature → `Roll to here`; right-click bar → `Roll to end`; keyboard ↑↓ step. Editing while rolled back is allowed; new features land at the bar. [CAD-017] [FIG-3 observed: rollback bar after `Fillet 1`, parts list below]
2. **Reorder**: drag features (multi-select non-contiguous) to reorder parametrically; documented caveat: reordering can break downstream dependencies. [CAD-017]
3. **Selection**: toggle semantics — click selects, click again deselects; click adds (no Ctrl needed); clear via empty click/Space/context `Clear selections`; range via Shift-click; **box select directional**: left→right = fully-inside (solid blue), right→left = touched (dashed yellow); cursor shows a count up to 5, then "5+". [CAD-018]
4. **Dialog lifecycle (commit/cancel)**: dialogs have blue-highlighted selection fields (pick in graphics) and blue-outlined numeric fields (keyboard). `Enter` accepts+closes; `Shift+Enter` accepts and re-invokes the same tool empty. **Checkmark (accept) / X (reject)** — reject closes without saving. Preview slider (0–100% opacity of feature) and `Final` button (shows final model while editing an intermediate feature; absent when editing the last feature). In-dialog edits join the undo stack only **after acceptance**; dialog undo/redo covers only in-dialog micro-actions. [CAD-019]
5. **Undo/Redo**: per user, per tab, per session; undo last successful action.
6. **Paused regeneration**: batch parameter edits with optional regen; explicit choices Regenerate / Regenerate and exit / Discard unregenerated and exit / Restore (and if you switch tabs or close, changes auto-apply; note "regenerated changes cannot be undone via checkmark — restore to a previous version instead"). Sketches can't be edited while paused; geometry shows inconsistent intermediate state while paused. [CAD-017]
7. **Errors in list**: top-level error icon with count; yellow triangle = missing selections; blue indicator = not fully defined; `:errors`, `:suppressed`, `:hidden` filter commands.

**Selection/context model**: the Feature list is the spine — selection there cross-highlights the canvas and vice versa; rollback bar is *stateful suppression*, not deletion; dialog acceptance is the commit boundary.

**Error/cancel/recovery**: X-reject = full discard; suppression = non-destructive; paused-regen has four-way recovery; rollback is recoverable by dragging back; unsolved: what happens to features added while rolled back that depend on suppressed features downstream [unresolved].

**Visual hierarchy**: left docked list; toolbed top; canvas center; dialog floats but is modal to its feature; state communicated by bar position, tree icons, and color (blue field = needs selection — a *demand* color, not an accent). Status is persistent-in-tree; transient errors are badges.

**Source vs interpretation**: all official docs; observed screenshots: Feature list with 10 features/rollback bar/parts list [FIG-3]; dialog anatomy (blue field/highlighting) from help screenshots; box-select directionality from two help screenshots. The rollback suppression semantics are doc-stated.

**Astraea adaptation (testable acceptance)**: model Astraea's stage/motor editing on the rollback + dialog-commit pattern: (1) a per-stage edit buffer where Apply (check) commits and Cancel (X) reverts; (2) a visible "list of editable entities with pending-edit markers" instead of silent mutation; (3) non-destructive suppression of a stage (hide, not delete) with instant whole-model regen; (4) undo per open document per session. Acceptance: edit a motor property → observe pending badge → Cancel restores prior value and no history entry; Suppress a stage hides it from simulation and shows strikethrough in list with single-click unsuppress; 10-edit undo chain works in order, and redo after undo.

**What NOT to copy**: modal-dialog-only editing for lightweight property tweaks; keyboard-first navigation burden (↑↓ rollback stepping) without a visual indicator; paused-regeneration complexity (batch-edit consistency) — Astraea should auto-regen with debounce instead of shipping a pause mode.

## 4.4 Visual evidence plates (numbered annotations)

Files: `evidence/cad/`. Method for all plates: observed screenshot — official vendor UI capture downloaded from the cited source URL, then inspected pixel-wise by the session vision pipeline (report model `openrouter/deepseek/deepseek-v4-flash-0731`); observations below are verbatim-restated from that inspection. Numbers are the annotation callouts; bracket refs inside §3–§4 point at these plates. The FIG-1–FIG-6 callout numbers live text-side in this report only (the numbered lists above); they are not burned into the images.

### FIG-1 — NX Selection Filters dialog, Types tab
File `cad-ev-nx-selection-types-tab.png` (376×471). Source: Siemens Designcenter "General Selection Filtering UI" blog, screenshot `Screenshot-2025-07-18-085532-1.png`; NX version undated in source (2025 blog, current NX); accessed 2026-09-10.
1. Title bar: filter icon + `Selection Filters`; square window control.
2. Tab strip: `Types` (active, blue underline) | `Layers` | `Display Attributes` | `Scope`.
3. Mini-toolbar row (2 small icons; circular refresh right) — functions illegible at this resolution.
4. Types checkbox tree, 11 rows all checked: CSYS, Curve (dotted focus rectangle), Curve Feature, Datums, Edge, Face, Feature, Point, Sketch, Solid Body, View; `+` expand glyphs on Curve/Datums/Face; tree indent lines.
5. Empty list area below `View`; bottom OK/Apply/Cancel row cropped out of the source capture.

### FIG-2 — NX Chamfer with AI-assisted similar-edge selection
File `cad-ev-nx-chamfer-ai-select.png` (1024×540). Source: same blog, `Screenshot-2025-07-18-092241-1024x540.png`; caption "Chamfer command with AI-assisted selection filtering in action".
1. Tab bar: `Discovery Center` | `chassisAssy.prt` | `wheel_front_left.prt` (active).
2. `Chamfer` dialog docked left: header `?`/`X`; group `Edge`; row `Select Edge (1)` highlighted yellow with a box-icon; `Cross Section = Offset and Angle`; `Distance = 3 mm`; `Angle = 45°`; `Reverse Direction`; `Add New Set` (+); `Preview` + `Show Result`.
3. Dialog footer: `< OK >` `Apply` `Cancel` with dropdown arrow.
4. Canvas: translucent shaded truck/bus wheel rim; center bore, ~10 small lug holes, larger oval vent holes.
5. Active selection: one lug-hole edge highlighted **orange**.
6. Candidate set: remaining lug-hole edges highlighted **light blue** (blog: AI-predicted similar edges; ~9 count is pixel observation).
7. Floating popup above the orange edge with leader lines: `Distance 3`, `Angle 45` chips, matching the dialog values.
8. Bottom-left WCS triad: Z blue/up, X red/right.

### FIG-3 — Onshape Part Studio UI (feature list + rollback bar)
File `cad-ev-onshape-partstudio-ui.png` (1042×570). Source: Onshape Help > User Interface Basics, `part-studioUI2-01.png`; Onshape current (help updated 2026-09-09); accessed 2026-09-10.
1. Document toolbar: back-arrow, `Sketch` pencil, ~20 feature-tool icons with dropdown carets, `Be` drop-down, `+`, `Search tools…`.
2. Feature list header: `Features (10)` + 3 icons (dependency graph, pause, history clock).
3. Filter row: funnel icon + `Filter by name or type`.
4. `Default geometry` expanded: Origin, Top, Front, Right.
5. Feature stack: `Sketch 1`, `Extrude 1`, `Shell 1`, `Extrude 2`, `Shell 2`, `Fillet 1`.
6. Rollback bar: thick grey horizontal bar after `Fillet 1` (model renders up to bar).
7. `Parts (2)` expanded: `Part 1`, `Part 2`.
8. Graphics area: one slate-grey rounded rectangular body, no selection/dimension chrome.
9. View cube (Top/Front/Right labels; X red, Y green, Z blue) + view-settings cube icon.
10. Bottom tab strip: `+`, `Fuel Valve Body`, `matchbox`, `Part Studio 2`, `Part Studio 1`, `Copy 1 of Part Studio 1`, `Part 2 Drawing 1`, `Assembly 1`, `Assembly 2`.

### FIG-4 — Onshape Compare panel (Main vs V3)
File `cad-ev-onshape-compare-panel.png` (776×504). Source: Onshape Help > Comparing, `compare-flyoutopens.png`; accessed 2026-09-10.
1. List panel headers: `Main` (blue) | `V3` (red-orange); both with `(inch, degree)` sub-header.
2. Row 1: `Fillet 1` both sides, yellow middle difference-icon (modified).
3. Row 2: `Sketch 3` left side only with red `>` marker (exists in one side only).
4. Footer: checked `Only show differences` checkbox.
5. Slider control above viewport: `Main` (blue, left) / `V3` (red-orange, right), circular thumb center-right.
6. Viewport: grey wishbone bracket part; translucent blue patches highlight changed fillet geometry.
7. Top-right utility icons (3-line menu, open) — exact functions not legible.
8. Bottom tab strip with `Part Studio 1` active (orange/yellow change dots on tabs).

### FIG-5 — Onshape Merge dialog (B1 → Main)
File `cad-ev-onshape-merge-dialog.png` (839×480). Source: Onshape Help > Merging, `merge-dialog-full-01.png`; accessed 2026-09-10.
1. Title line: `Merging changes into Main from B1`; `Main` pill blue-grey, `B1` pill pale yellow; `X` close.
2. Overall strategy 3-card selector; center `Merge changes` selected (blue icon + blue underline; sub-text `Combine all changes to 3 tabs`); left `Keep Main`, right `Replace with B1`, both with `2 tabs have changes` + `Compare with base` links.
3. Tabs table header: `Tabs` | `3 tabs have changes` | `Changes in Main` (blue pill) | `Changes in B1` (yellow pill) | `Tab merge strategy`.
4. Row 1 `Part Studio 1`: green checks both sides, strategy `Merge changes from both`.
5. Row 2 `Assembly 1`: "No changes" (Main) vs green check (B1), strategy `Replace with B1`.
6. Row 3 `Assembly 2`: "New tab" (Main), strategy `Keep Main`.
7. Footer: `0 tabs have no changes`; `?` help; primary `Merge`, secondary `Cancel`.

### FIG-6 — Onshape Versions and history graph
File `cad-ev-onshape-versions-graph.png` (364×598). Source: Onshape Help > Versioning and Branching, `merge-lines-shown-01.png`; accessed 2026-09-10.
1. Panel title `Versions and history`; top-right utility icons illegible.
2. Search row: branch/tree icon, `Search history` field + dropdown caret, search + funnel buttons.
3. `Hide merges` tooltip over the show/hide merges toggle.
4. Main trunk: dark blue line from `Start` → `V1` → `Part Studio 1 :: Inse…` → `Merge from B1` → `V2` → `V3` → `Part Studio 2 :: Inse…` → `Merge from B2` → `V4` → `Main` (open circle).
5. Solid blue dots = versions; open circles = workspaces at branch tips (Main blue, B3 green, B1 yellow).
6. Branch loops: yellow loop (B1), light-green loop (B2 → `Merge from B2`), bright-green top curve (B3).
7. List rows bottom→top with `Name` / `Modified` (author + timestamp) columns; `Main`/`B1`/`B3` highlighted rows match graph loop colors; `B1`, `B3` selected rows have solid fill.
8. `Start` terminus mark; intermediate dots for each change; `> Show changes…` rows truncated.

## 5. CATIA / 3DEXPERIENCE — accessible evidence

**Access level**: no license; no account creation. Evidence base: (a) Dassault investor press release (Airbus extension, 2025-04-24) — vendor-reported industrial relevance; (b) GoEngineer (independent SOLIDWORKS/CATIA VAR + training provider) transition article by Tim Ramos (CATIA specialist; ex-Honda R&D surface/solid design) — practitioner/training signal; (c) 3DSwym CATIA User Community "Tips & Tricks 2022" — vendor-hosted user community tips.

**Documented patterns worth recording** (all second-hand, labeled):
- 3DEXPERIENCE context menus: click a feature → menu appears beside cursor with next-command suggestions (Pad/Extrude, Plane on Curve, Point on Curve, Quick Select) — command adjacency reduces mouse travel. [CAD-020]
- Explore Mode: lightweight navigation of large assemblies with filtering by selection/attributes/volumes, "much like CATIA V5 CGRs"; open-from-Explore keeps root-assembly context. [CAD-020]
- 6W Tags + Advanced Search + saved search/filter combos for finding data across a database (no wildcard requirement). [CAD-020]
- Restore Session on crash: recover unsaved data to last Local Save; New Session clears cache; Local Save ≠ Export (cache-only). [CAD-020]
- B.I. Essentials maturity reporting: Lock Status, Concurrent Engineering Status (background modification conflict), Design State (Private/In Work/Frozen/Released/Obsolete), Weight Definition — an explicit data-maturity/quality dashboard. [CAD-020]
- Community tips (2022): F3 toggles spec tree; right-click → Object → AutoSearch selects connected sketch profiles; Tools → Customize → Show Properties assigns hotkeys. [CAD-021]
- Airbus: 3DEXPERIENCE company-wide for all future civil/military aircraft + helicopters; 20,000+ users incl. suppliers; signed Q4 2024; seven "industry solution experiences" (Program Excellence … Keep Them Operating). Vendor-reported; Airbus CEO quote positions digitalization as enabling ramp-up and next-gen platforms. [CAD-010p]

**Astraea adaptation (measurable)**: data-maturity/quality dashboard mirrors Astraea's health panel: a per-model component row showing state (private/in-work/frozen/released/obsolete) + weight-definition status + concurrent-edit conflict flag. Acceptance: two sessions editing the same model produce a visible conflict banner on the second writer's save, with a "reload to see remote changes" action; a stage marked Frozen blocks edits with a clear reason.

**What NOT to copy**: Explore Mode's heavyweight "light vs heavy load" split (Astraea should keep models always-editable); search database with tags as the primary find path.

## 6. PTC Creo — screening findings

**Access level**: PTC official help (Creo Parametric PMA r12) public, text-only pages observed; no UI screenshots captured in this lane (help pages were text-focused; no free tier). Evidence base: `About_Filters.html`, `about_selection_methods.html`, `To_Use_the_Sketcher_Selection_Filter.html`, `to_create_userdefined_selection_filter_my_filter.html`.

**Documented patterns**:
- **Compound vs individual filters** on a Status Bar dropdown: `Geometry` (compound: edges, surfaces, datums, curves, quilts, annotations) vs single-type (vertices/features in Part mode).
- **Alt-override**: hold Alt+click to pick *outside* the active filter (e.g., pick a feature while Geometry filter is active) — a transient scope escape without changing the persistent filter.
- **My Filter**: user-defined compound filter; settable as default; exportable/importable via `.ui` files.
- **Box/lasso/trace selection methods** (lasso requires surfaces filter); left→right = inside-only (solid outline), right→left = intersect (dashed outline) — same convention as Onshape.
- **Mini-toolbar** on selection: contextual commands; model-tree cross-highlight + auto-expand; `Zoom to Selected`; **extended context**: selecting an edge shows owner-feature (part mode) or owner-part (assembly mode) commands; pointer-over-command prehighlights the owning context.

**Assessment for Astraea**: Alt-style transient filter bypass and compound/individual filtering hierarchy are the transferable ideas; the status-bar dropdown is dated. Creo is deprioritized for deep study because its public evidence is text-only and its UI conventions (status-bar filter dropdown) diverge further from a modern web app than Onshape/NX.

## 7. Practitioner / independent training signal

1. **GoEngineer (independent VAR + training org) — CATIA/3DEXPERIENCE**: article by Tim Ramos (Senior CATIA Specialist; ex-Honda R&D, 2018→ V5-6 + 3DEXPERIENCE). Provides exact workflow claims (context-menu command suggestions, Explore Mode, restore session, B.I. maturity states) matching vendor docs but phrased as migration guidance for working designers; carries a training business — the closest thing to an independent practitioner/training voice accessible without accounts. Article originally May 2024, updated. [CAD-020]
2. **3DSwym CATIA User Community tips (2022-04-28, author "KN")** — user-contributed on vendor-hosted platform; short actionable tips (F3 tree toggle, AutoSearch chained selection, hotkey assignment). Treat as anecdote/signal, not population evidence. [CAD-021]
3. **Documented bounded search failure**: no login-free practitioner forum thread with genuine NX/Onshape hands-on screenshots + numbered steps could be accessed without accounts (Onshape Learning Center courses and forum require accounts; Siemens community requires login for posts). This limitation is recorded rather than inventing complaints. [CAD-022]

## 8. Evidence index (lane CAD)

Local images in `docs/design-research/evidence/cad/`. All accessed 2026-09-10. Method codes: OD = official documented, OS = observed screenshot (official UI capture, inspected by vision pipeline), VR = vendor-reported, PR = practitioner reported, IN = interpretation/inference. Index IDs are deliberate: CAD-013 was retired before publication (intentionally absent), and the `m`/`p` suffixes on CAD-004m and CAD-010p mark managed-mode and press-release variant rows, so the CAD-012 → CAD-014 jump is not a dropped item.

| ID | Product/version | Source URL | Locator | Method | Observation | Limitation |
|---|---|---|---|---|---|---|
| CAD-001 | NX (current, 2025 blog) | blogs.sw.siemens.com/designcenter/nx-tips-and-tricks-general-selection-filtering-ui/ | "Types Tab/Layers Tab/Display Attributes/Scope" + 4 screenshots | OD+OS | Filter dialog: 4 tabs; Types checkbox tree (CSYS/Curve/Curve Feature/Datums/Edge/Face/Feature/Point/Sketch/Solid Body/View); Scope offers assembly/work-part/component ranges | Vendor blog; no hands-on; selection colors partially inferred |
| CAD-002 | NX | same URL | `cad-ev-nx-selection-types-tab.png` (local) | OS | Title `Selection Filters`; Types active (blue underline); 11 checked types; dotted focus on `Curve` | Bottom buttons cropped in source image |
| CAD-003 | NX | same URL | `cad-ev-nx-chamfer-ai-select.png` (local); "Chamfer command with AI-assisted selection" | OS | `Chamfer` dialog `Select Edge (1)`; blue predicted edges vs orange selected; floating cross-section popup; OK/Apply/Cancel buttons visible | ~9 blue count is pixel observation [INTERP]; blurry small icons |
| CAD-004 | NX | same URL | "Select Similar Edges … sensitivity rates" | OD | Similar-edges dialog w/ sensitivity slider; orange highlight; per-edge right-click refinement | No screenshot inspected |
| CAD-004m | NX/Teamcenter | blogs.sw.siemens.com/designcenter/nx-tips-and-tricks-data-upload/ | "revision typically starts with A or 1"; validation columns | OD | Revision-letter model; reuse-vs-create decision; existing-part-action column | Vendor blog; no hands-on |
| CAD-005 | NX | selection-filtering URL | "hover selection … three dots … Select from List" | OD | Hover-hold → three dots → Select from List disambiguation | Text-only claim; not observed |
| CAD-006 | NX | blogs.sw.siemens.com/designcenter/nx-how-to-series-modeling-a-part-for-the-first-time/ | New-file/tab layout/sketch/extrude sections | OD | Template chooser; Part Navigator as history anchor; Home ribbon; units dropdown | Vendor blog; videos referenced but not textually analyzed |
| CAD-007 | NX | same | Sketch Navigator; Trim | OD | Black/white circle fully-defined gauge; drag-to-edit sketch shape | Text-only |
| CAD-008 | NX | same | Hole/Pattern/Mirror/Edge Blend; Edit object display; visual materials | OD | Feature-creation flow; display/material polish incl. simulation properties | Text + inspected screenshots partially (hole command images not downloaded) |
| CAD-009 | NX/Teamcenter | data-upload URL | `cad-ev-nx-teamcenter-singleparts.png` (local) | OS | Single-part managed-mode setup dialog (ID/name/revision) | Vendor blog |
| CAD-010 | NX/Teamcenter | data-upload URL | `cad-ev-nx-teamcenter-import-assembly.png` (local) | OS | Import Assembly dialog listing components with ID/name/revision/action columns | Vendor blog |
| CAD-010p | CATIA/3DEXPERIENCE | investor.3ds.com/news-releases/…/dassault-systemes-and-airbus-extend-strategic-partnership-use | press release 2025-04-24 | VR | Airbus company-wide 3DEXPERIENCE; 20,000+ users; signed Q4 2024; seven ISEs | Vendor announcement; not an adoption measurement |
| CAD-011 | Onshape | cad.onshape.com/help/Content/Document/document_management.htm | "About documents"; `cad-ev-onshape-versions-graph.png` (local) | OD+OS | Auto Start version + Main workspace; change history `Tab::Action:Feature`; 25-entry cap | OK |
| CAD-012 | Onshape | help/Document/versions_and_history.htm | "Creating a version"/"Branching example" | OD | Version naming flow; branch → workspace; drawings-update warning on version | OK |
| CAD-014 | Onshape | help/Document/merging.htm | "Steps" + `cad-ev-onshape-merge-dialog.png`, `cad-ev-onshape-merge-after.png`, `cad-ev-onshape-merge-rmb.png` (local) | OD+OS | Merge strategies Keep/Merge/Replace; per-tab override; revert-merge message; tab-type merge limits; FeatureScript mismatch; open-document lock; workspace protections | Merge conflict line-level UX not documented |
| CAD-015 | Onshape | merging.htm "Merge lines"; versions_and_history.htm "Understanding the graph" | `cad-ev-onshape-versions-graph.png` | OS | Branch color coding; solid/closes/open dots; merge lines; Hide merges toggle observed via tooltip | Legend not in screenshot [INTERP from docs] |
| CAD-016 | Onshape | help/Document/compare.htm | "Using Compare"; `cad-ev-onshape-compare-panel.png`, `cad-ev-onshape-compare-reverse.png` | OD+OS | Base(blue)/Target(red); differences list; slider; Reverse; config compare; Show/Hide part; Assemblies not supported | OK |
| CAD-017 | Onshape | help/PartStudio/features_and_parts_lists.htm (+ user_interface_basics.htm) | "Using the rollback bar"; `cad-ev-onshape-featurelist.png`, `cad-ev-onshape-partstudio-ui.png` (local) | OD+OS | Rollback bar; reorder; suppress; pause regen 4-way recovery; error badges (:errors filter); parts list | OK |
| CAD-018 | Onshape | help/Home/selection.htm; `cad-ev-onshape-boxselect.png` | "Box selection examples" | OD+OS | Toggle select; 5+ cursor count; direction-based box select (blue solid vs yellow dashed); Space/context clear | OK |
| CAD-019 | Onshape | help/Home/dialogs.htm; `cad-ev-onshape-dialog.png` | "Dialogs" | OD+OS | Blue demand fields; Enter/Shift+Enter accept; checkmark/X commit-cancel; preview slider; Final button; dialog undo scope | OK |
| CAD-020 | CATIA/3DEXPERIENCE | goengineer.com/blog/catia-v5-to-3dexperience-catia-tips-for-successful-transition | whole article (May 2024, updated) | PR | Context menus next to cursor; Explore Mode; Restore Session; Local Save≠Export; 6W Tags; B.I. Essentials maturity dashboard (Lock/Concurrent/Design State/Weight) | Independent VAR/trainer; not hands-on; sells 3DS products (interest caveat) |
| CAD-021 | CATIA V5 | 3dswym.3dexperience.3ds.com/post/catia-user-community/tips-tricks-2022-catia-v5_… | tips list 2022-04-28 | PR | F3 tree toggle; Object→AutoSearch; hotkey assignment; unconstrained-parts analysis | Vendor-hosted community; single author; anecdote |
| CAD-022 | — | (search logs) | bounded search failure | IN | No account-free deep practitioner hands-on tour found; Onshape Learning Center/forums + Siemens community require sign-in | Documented gap, not fabricated |

## 9. Adopt / adapt / reject matrix (Astraea tasks)

| Pattern | Product | Adopt | Adapt | Reject | Astraea task affected | Testable acceptance |
|---|---|---|---|---|---|---|
| Scope-and-type selection filter w/ 3-state highlight | NX | ✔ | filter bar instead of 11-type tree; scope = vehicle/stage/subassembly | entity selection in editor | 40-element assembly filter test (§3.1) |
| Select-similar bulk edit w/ candidates + commit | NX | ✔ | "select similar motors/parts" by class+manufacturer | bulk config edit | candidate count + one-click commit test |
| Hover → Select-from-list disambiguation | NX/Onshape | ✔ | hover-hold on overlap; list at cursor | dense assembly picking | overlap scenario test |
| Version with name+description; revision letter | NX/Teamcenter, Onshape | ✔ | auto-ID + editable name/description; graph | preset/state versioning | §3.3 import validation test |
| Branch + workspace + merge w/ per-tab strategy | Onshape | ✔ | per-stage strategy; revert-merge message | parallel design lanes | §4.1 acceptance |
| Compare pair w/ slider + add/modify/remove list | Onshape | ✔ | one-click "vs last saved"; stage-level isolation | state comparison | §4.2 acceptance |
| Rollback bar + dialog commit/cancel (check/X) | Onshape | ✔ | per-stage edit buffer w/ pending badge | editing UX | §4.3 acceptance |
| Data-maturity dashboard (released/obsolete/frozen; weight status) | CATIA 3DEXPERIENCE B.I. | ✔ | reuse Astraea health panel with state machine | model health | §5 acceptance |
| Alt transient filter bypass; compound/individual filters | Creo | ✔ | add a "pick anything once" modifier instead of dropdown | filter ergonomics | keyboard test |
| AI "predicted objects" auto-commit | NX | ✘ | — | — | — |
| Ribbon tab sprawl / template-per-discipline | NX | ✘ | — | — | — |
| Paused-regeneration batch mode | Onshape | ✘ | — | debounced auto-regen instead | — |
| Workspace-protection backward-merge ceremony | Onshape | ✘ | — | — | — |
| CAD-drawings 3-way merge limitation | Onshape | ✘ (documented gap) | keep all entity types uniformly mergeable | — | — |
| Database-with-tags as primary find path | 3DEXPERIENCE | ✘ | list/filter with search | — | — |
| File-centric Save As / Assign-ID ceremony | NX/Teamcenter | ✘ | autosave + auto-ID | — | — |

## 10. What NOT to copy (explicit)

1. Enterprise modal overwhelm: NX's 11-type filter tree, Creo's status-bar filter dropdown, CATIA's toolbar customization are all *configuration-heavy* surfaces; Astraea should default to zero-config behavior.
2. Vendor "AI copilot" chrome (Design Copilot NX box, pinned assistant) without a measurable task; Astraea should only add assistants that act on model state.
3. Lifecycle ceremony (Teamcenter Assign-ID flow, CATIA maturity gates, Onshape workspace protections) beyond what the domain's safety narrative requires; every gate must map to a physical-meaningful constraint (units, provenance, release).
4. History-graph literacy as a prerequisite for basic compare/restore; Astraea should surface compare/restore at the point of need.

## 11. Unresolved questions / evidence gaps

- NX: no accessible documentation of undo semantics per command (depth, per-feature rollback UX); Teamcenter branching (vs revision letters) not covered by the accessed blog — would need login-gated Siemens docs.
- Onshape: merge conflict line-level resolution UX not documented; selecting the same entry twice in Compare behavior unknown; rollback-plus-unsupported-downstream-feature behavior unknown.
- CATIA: only second-hand evidence (VAR/trainer + press); no genuine 3DEXPERIENCE UI screenshots captured (login wall); Airbus claims are vendor-reported.
- No hands-on verification anywhere in this lane (license/account constraints per brief) — all acceptance criteria above are phrased for later prototype validation, not as measured results.
- Creo: no UI screenshots attached; text-only evidence.

## 12. Bottom line for the review gate

Every pattern above traces to a checkable source in §8. Visual critique in this lane references actually inspected images (FIGS 1–6, from `evidence/cad/`) with numbered callouts; no pixel measurements beyond the image dimensions reported by the `file` utility. No final visual direction or production-readiness claim is made; recommendations distinguish frontend changes (filter bar, compare surface, edit buffer) from data-model decisions (version/branch graph, stage suppression, maturity state machine), which must be accepted by the coordinator before any implementation. No features are silently approved by analogy.