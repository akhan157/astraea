# Project Astraea — Master UI/UX Engineering & Design Specification

**Destination:** `docs/astraea-ui-ux-design-spec.md`  
**Document status:** Normative design and implementation baseline  
**Specification version:** 1.0  
**Primary product class:** Desktop-first aerospace engineering workstation  
**Primary audience:** Product engineering, frontend engineering, simulation engineering, visualization, accessibility, QA, and technical documentation teams

---

## Document Authority & Conformance

This specification defines the interaction architecture, visual language, accessibility requirements, data presentation rules, and acceptance criteria for Project Astraea.

The keywords **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative:

- **MUST / MUST NOT:** Required for conformance.
- **SHOULD / SHOULD NOT:** Expected unless a documented engineering constraint justifies an exception.
- **MAY:** Optional behavior that does not compromise required functionality.

Astraea is an analysis and design environment, not an independent certification authority. The interface MUST distinguish modeled results, measured evidence, assumptions, and user-entered values. A visually favorable result MUST NOT imply flightworthiness, regulatory approval, or operational authorization.

### Product-wide invariants

1. **No false certainty.** Missing, stale, extrapolated, and invalid results MUST never appear as passing results.
2. **No silent model substitution.** Changes to solver, aerodynamic method, weather source, material model, or calibration MUST be visible and recorded.
3. **No unit ambiguity.** Every engineering quantity MUST have a defined dimension, storage unit, display unit, precision policy, and valid range.
4. **No destructive ambiguity.** Project edits, imports, calibration, and replacement operations MUST have explicit scope and recoverability.
5. **No inaccessible essential operation.** Core tasks MUST be achievable without pointer-only gestures, color discrimination, or WebGL interaction.
6. **No fabricated responsiveness.** Loading, preview, pending computation, and committed results MUST be visually distinct.
7. **No modal dependency for ordinary engineering work.** Routine inspection and editing MUST remain within the workstation.

---

# 1. Executive Design Philosophy & Workstation Ergonomics

## 1.1 Mission

Astraea SHALL present aerospace design as a continuous evidence-driven workflow:

**Configure → inspect → simulate → evaluate uncertainty → compare evidence → revise.**

The workstation combines:

- The stable visual hierarchy and persistent situational awareness of mission-control consoles.
- The linked plots, telemetry inspection, and time synchronization patterns associated with Open MCT.
- The direct manipulation, viewport fluency, and contextual tooling associated with Blender.
- The dimensional discipline, assembly structure, and transactional editing expected of modern CAD systems.

These references establish ergonomic principles, not a requirement to reproduce another product’s interface.

## 1.2 Mission-control dark aesthetic

The default theme MUST use neutral dark zinc and slate surfaces. Large saturated backgrounds, decorative gradients, and high-luminance panels are prohibited in the normal analysis workspace.

The visual objective is prolonged readability rather than cinematic effect:

- Dark surfaces establish spatial hierarchy.
- Fine boundaries organize dense information.
- Brightness is reserved for selected objects, active tools, critical metrics, and actionable warnings.
- Background grids and reference geometry remain subordinate to engineering content.
- Motion conveys state change, not decoration.

The product SHOULD support a high-contrast theme and a print/export presentation with white backgrounds. Dark mode MUST NOT be assumed to be universally more accessible or less fatiguing.

### Lighting and fatigue controls

- Avoid pure white for large text regions on near-black backgrounds.
- Avoid pure black as the primary work surface.
- Provide user controls for viewport grid intensity, line thickness, and label scale.
- Respect `prefers-reduced-motion`.
- Do not flash safety states or continuously pulse status indicators.
- Allow plot legends, dense annotations, and noncritical overlays to be reduced without hiding required safety information.

## 1.3 Semantic telemetry color system

| Semantic role | Color family | Primary use |
|---|---|---|
| Airframe / CAD | Cyan | Selected geometry, dimensions, assembly references |
| Stability / satisfied gates | Emerald | Valid passing criteria, acceptable margins |
| Warning / caution | Amber | Transonic regimes, flutter proximity, limited confidence |
| Hazard / failed criteria | Rose | Predicted instability, violated limits, invalid hazardous configurations |
| Avionics / payload | Violet | Electronics, payload objects, associated traces |
| Neutral / unavailable | Zinc or slate | Unselected geometry, unknown states, disabled operations |

Color MUST be paired with text, shape, iconography, line style, or position.

A cyan selected object is not necessarily safe. An emerald gate is not a certification. A rose measured trace does not automatically indicate danger unless the legend explicitly assigns that meaning.

Semantic color and data-series identity MUST remain separate. When a plot requires multiple series, line patterns and labels MUST prevent confusion between series identity and safety state.

## 1.4 Information-density hierarchy

The interface SHALL organize information into four levels:

| Level | Content | Visibility |
|---|---|---|
| P0 — Safety and validity | Failed gates, unknown critical checks, stale results, model applicability | Persistent |
| P1 — Current task | Selected component, principal metrics, active tool, run state | Immediately visible |
| P2 — Detailed engineering | Material properties, solver settings, uncertainty assumptions | In-context expansion |
| P3 — Provenance and diagnostics | Equations, raw input records, residuals, solver logs | Nonmodal detail panels |

Critical metrics MUST remain in a stable peripheral location rather than moving as panels expand.

The workstation SHALL include a persistent **Mission Status Rail** showing, when applicable:

- Configuration validity.
- Result freshness.
- Stability assessment and applicability.
- Flutter assessment and applicability.
- Governing competition or mission gate.
- Weather age or offline state.
- Active run state.

If a metric cannot be calculated, the rail MUST show `Unknown`, `Not evaluated`, or `Out of domain`, not zero.

## 1.5 Ergonomic principles

### Spatial consistency

- Assembly navigation remains on the left.
- Direct manipulation and analytical visualization remain in the center.
- Editable properties and contextual explanations remain on the right.
- Run and safety status remain in fixed workstation regions.
- Switching studio modes MUST preserve project identity, selection where meaningful, and prior mode layout.

### Progressive disclosure

Advanced parameters MUST be available through expandable inspector groups, drawers, or dedicated tabs. Users MUST NOT be forced through repeated modal dialogs to inspect model assumptions.

### Precision without friction

Each slider MUST have a paired numeric field. Pointer manipulation supports exploration; numeric entry supports exact work.

### Interruption discipline

Warnings MUST not repeatedly interrupt parameter exploration. The interface SHALL aggregate related issues and identify the action required to resolve them.

Dialogs are reserved for destructive actions, irreversible external actions, permission requests, and similarly consequential decisions.

## 1.6 Supported workstation environments

| Environment | Required behavior |
|---|---|
| 1920 × 1080 and larger | Full three-pane workstation with expanded analysis tools |
| 1440 × 900 | Primary design target; full three-pane layout |
| 1280 × 800 | Supported compact desktop; collapsible sidebars and reduced header density |
| Narrow windows / high zoom | Reflowing inspector and analysis lists; one primary work region at a time |
| Touch devices | Inspection and parameter editing supported; precision CAD uses alternate controls |

The product MUST NOT become unusable below the ideal desktop dimensions. Dense charts MAY scroll within their own regions, but forms and essential navigation MUST reflow.

---

# 2. Design Tokens & Design System Standards

## 2.1 Typography

### Font stacks

```css
:root {
  --font-ui: "Inter", "Avenir Next", "Segoe UI", sans-serif;
  --font-metric: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
}
```

A clean geometric or geometric-humanist sans-serif SHALL be used for:

- Navigation.
- Labels.
- Explanatory text.
- Buttons.
- Section titles.

**JetBrains Mono** SHALL be the primary typeface for:

- Numerical metrics.
- Physical units.
- Timestamps.
- Coordinate values.
- 3D vectors.
- Equations and code-like identifiers.
- Numeric table columns.
- Plot tick labels and numerical readouts.

Fonts SHOULD be self-hosted to support offline operation and avoid unnecessary third-party requests.

### Type scale

| Token | Size / line height | Use |
|---|---|---|
| `text-caption` | 12 / 16 px | Secondary metadata; never sole critical status |
| `text-label` | 13 / 18 px | Dense labels, table headings |
| `text-body` | 14 / 20 px | Default controls and body content |
| `text-section` | 16 / 24 px | Inspector section titles |
| `text-panel` | 18 / 26 px | Panel headings |
| `text-metric` | 24 / 30 px | Principal numeric values |
| `text-display` | 32 / 38 px | Focused result summaries |

Numerical displays MUST use tabular figures and SHOULD use slashed zeros where supported.

```css
.metric,
.quantity,
.timestamp,
.vector {
  font-family: var(--font-metric);
  font-variant-numeric: tabular-nums lining-nums;
}
```

## 2.2 Numerical and unit formatting

- Internal engineering values MUST use a documented canonical unit system.
- Display preferences MUST NOT change physical meaning or introduce repeated conversion drift.
- Fields MUST show units adjacent to the value, not only in a tooltip.
- Ambiguous abbreviations MUST be avoided.
- Angles MUST identify degrees or radians.
- Atmospheric pressure MUST distinguish absolute from gauge pressure.
- Temperature inputs MUST distinguish absolute temperature from temperature differences where relevant.
- Dates and times MUST identify the timezone.
- Geographic coordinates MUST identify the coordinate reference system.
- Vector displays MUST identify frame, axis order, and units.

Example:

```text
Velocity · local ENU [m/s]
[ +12.40, −3.10, +86.25 ]
```

Display precision MUST reflect engineering relevance and data quality. Formatting MUST NOT imply that a low-confidence prediction is accurate to many decimal places.

Underlying data MUST NOT be rounded merely to match a display.

## 2.3 Core color tokens

The following values establish the default palette. Every actual text/surface and control/surface pairing MUST be verified for contrast before release.

```css
:root {
  color-scheme: dark;

  --surface-0: #09090b;
  --surface-1: #18181b;
  --surface-2: #202024;
  --surface-3: #27272a;

  --border-subtle: #27272a; /* border-zinc-800 */
  --border-strong: #52525b;

  --text-primary: #f4f4f5;
  --text-secondary: #d4d4d8;
  --text-muted: #a1a1aa;

  --accent-airframe: #22d3ee;
  --status-safe: #34d399;
  --status-warning: #fbbf24;
  --status-hazard: #fb7185;
  --accent-avionics: #a78bfa;

  --focus-ring: #67e8f9;
}
```

`border-zinc-800` is a subtle separator token, not a sufficient boundary for every interactive control. Essential control boundaries MUST use stronger contrast when needed.

## 2.4 Spacing, density, and sizing

Base spacing SHALL follow a 4 px scale:

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`.

| Element | Default |
|---|---|
| Header | 56 px high |
| Mission Status Rail | 36 px minimum high; may wrap |
| Panel heading | 40 px minimum high |
| Standard input | 36 px high |
| Compact input | 28 px high |
| Standard tree row | 32 px high |
| Compact tree row | 28 px high |
| Sidebar width | 320 px (`w-80`) |
| Panel padding | 12–16 px |
| Form group gap | 16–24 px |

Pointer targets MUST satisfy WCAG 2.2 target-size requirements or applicable exceptions. Touch mode SHOULD provide 44 × 44 px targets.

Density settings MUST not reduce focus visibility, truncate essential values, or remove text alternatives.

## 2.5 Surfaces and elevation

| Surface | Role |
|---|---|
| `surface-0` | Workspace foundation and viewport backdrop |
| `surface-1` | Persistent sidebars, header, status rail |
| `surface-2` | Cards, inspector groups, docked analysis panels |
| `surface-3` | Menus, popovers, transient controls |

Elevation SHALL be conveyed through boundaries, restrained shadows, and modest luminance differences.

Glassmorphism MAY be used for small viewport toolbars and floating legends:

- The backing surface MUST remain sufficiently opaque.
- Blur MUST NOT be required for legibility.
- A solid fallback MUST exist.
- Large inspector panels and dense telemetry tables MUST NOT use translucent backdrops over moving geometry.

### Layering order

1. Base workspace.
2. Viewport annotations.
3. Docked and floating tools.
4. Menus and popovers.
5. Toast notifications.
6. Confirmation dialogs and their backdrops.

Z-index values SHALL be centrally tokenized.

## 2.6 Semantic status badges

| State | Label example | Required encoding |
|---|---|---|
| Pass | `PASS · criterion satisfied` | Emerald + check icon |
| Warning | `CAUTION · limited margin` | Amber + triangle |
| Fail | `FAIL · limit exceeded` | Rose + failure icon |
| Unknown | `UNKNOWN · missing input` | Neutral + question icon |
| Out of domain | `UNSUPPORTED · model limit` | Amber + domain indicator |
| Running | `RUNNING · solver active` | Neutral/cyan + progress |
| Stale | `STALE · configuration changed` | Neutral/amber + history icon |
| Not applicable | `N/A · criterion excluded` | Neutral + explicit explanation |

**Validity, freshness, and outcome are independent dimensions.**

A result object SHOULD carry them separately:

```ts
type ResultPresentationState = {
  outcome: "pass" | "caution" | "fail" | "unknown" | "not-applicable";
  validity: "valid" | "invalid" | "out-of-domain";
  freshness: "current" | "stale";
  execution: "idle" | "queued" | "running" | "completed" | "cancelled" | "failed";
};
```

Stale or invalid results MUST NOT retain an unqualified green presentation.

## 2.7 Standard components

The design system MUST include:

- Unit-aware numeric field.
- Numeric field with slider.
- Vector and matrix editors.
- Searchable selection list.
- Material selector with provenance.
- Status badge and gate summary.
- Assembly tree.
- Resizable split pane.
- Plot frame with accessible data table.
- Time cursor and playback transport.
- Model-applicability notice.
- Provenance panel.
- Inline validation block.
- Nonmodal issue drawer.
- Import mapping table.
- Empty, loading, offline, and failure states.

Each component specification MUST define keyboard behavior, focus behavior, accessible name, loading behavior, validation behavior, and disabled-state explanation.

---

# 3. Workstation Layout & Information Architecture

## 3.1 Global shell

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Project / Preset │ Studio Switcher │ File I/O │ Undo / Redo │ Save / Run     │
├──────────────────────────────────────────────────────────────────────────────┤
│ Mission Status Rail: validity · freshness · stability · flutter · gates     │
├─────────────────┬──────────────────────────────────────┬─────────────────────┤
│ LEFT CONTEXT    │ CENTER WORKSPACE                     │ RIGHT INSPECTOR     │
│                 │                                      │                     │
│ Assembly /      │ 3D WebGL viewport, plots, maps,       │ Parameters,         │
│ libraries /     │ evidence overlays, linked timelines  │ model assumptions,  │
│ datasets        │                                      │ selected results    │
├─────────────────┴──────────────────────────────────────┴─────────────────────┤
│ Units / frame │ Selection │ Coordinates / time │ Jobs │ Diagnostics         │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 3.2 Top Header Bar

The header MUST expose the following studio destinations:

1. **📐 Airframe CAD**
2. **🌪️ Aerodynamics & Flutter**
3. **🔥 Propulsion & Motors**
4. **🚀 Trajectory & Weather**
5. **📊 Flight Evidence & Logs**

For production UI, stable vector icons SHOULD replace platform-dependent emoji. The labels above define the destination names.

Mode 5’s full workspace title SHALL be **Recovery Packaging & Flight Evidence Ledger**. “Flight Evidence & Logs” is its compact navigation label; recovery tooling belongs within this mode.

### Required header controls

- Project name and unsaved-state indicator.
- Studio mode switcher.
- Preset selector.
- File menu with import/export support for `.ork`, `.rkt`, `.cdx1`, and `.json`.
- Undo and redo.
- History access.
- Save status.
- Primary simulation action and job access.

At constrained widths, less frequently used controls MAY move into a labeled overflow menu. Project identity, current mode, critical status, and run state MUST remain discoverable.

### Preset semantics

The preset selector MUST identify whether an item is:

- A read-only reference.
- A project template.
- A user-saved configuration.
- A configuration variant.

Applying a preset to an edited project MUST offer a preview or explicit replacement scope. No preset application may silently discard changes.

## 3.3 Three-pane flexible grid

### Left contextual sidebar

- Default width: 320 px.
- Resizable range: approximately 240–480 px.
- Collapsible.
- Contains mode-specific navigation and source objects.
- Search and filtering remain anchored at the top.

### Center workspace

- Flexible width: `flex-1`.
- Supports 3D, plots, maps, tables, and split analysis views.
- Maintains a meaningful minimum interactive area.
- Permits maximize, restore, and saved view layouts.

### Right property inspector

- Default width: 320 px.
- Resizable range: approximately 280–520 px.
- Shows the current selection or active analysis context.
- Uses grouped sections with persistent expansion state.
- Separates editable inputs from calculated outputs.

Splitters MUST be keyboard operable and expose their size and orientation to assistive technology.

When insufficient width remains, the system MUST collapse or reflow panels rather than compress the center into an unusable strip.

## 3.4 Selection and contextual inspection

Selection SHALL be coordinated across tree, viewport, plots, and inspector through stable entity identifiers.

- Selecting an assembly item highlights its geometry.
- Selecting geometry reveals its tree location.
- Selecting a plot series identifies its source object and run.
- Multi-selection shows shared editable fields and clearly marks mixed values.
- Hidden or suppressed objects remain identifiable in the tree.
- Selection changes MUST NOT discard uncommitted field edits without an explicit commit or cancellation policy.

Hover is transient. Selection is persistent. Active editing is a separate state.

## 3.5 Transactional editing and history

- Continuous slider movement constitutes one undoable transaction.
- Numeric entry commits on explicit confirmation or valid blur.
- Invalid text remains available for correction and MUST NOT become an accepted engineering value.
- `Escape` cancels an active uncommitted edit.
- Undo/redo labels SHOULD identify the operation, such as `Undo fin thickness change`.
- Imported files and calibration applications create named history checkpoints.
- Viewport navigation SHOULD use separate view history rather than flooding engineering undo history.

Expensive analysis MUST run against immutable configuration snapshots. Late results from obsolete requests MUST NOT overwrite current results.

## 3.6 File I/O and interoperability

The interface SHALL provide capability-specific import/export behavior for `.ork`, `.rkt`, `.cdx1`, and versioned Astraea `.json`.

Support MUST be declared per format, version, and direction. Displaying a file extension MUST NOT imply complete round-trip fidelity.

Every import SHALL provide:

1. File identification and version detection.
2. Parsing progress.
3. Unit and coordinate convention checks.
4. Supported-field mapping.
5. Unsupported-field and approximation report.
6. Preview before applying changes.
7. Source filename and provenance retention.

Exports MUST show:

- Target format and version.
- Objects and fields included.
- Known data loss.
- Unit conventions.
- Whether the export is editable geometry, analysis data, or presentation output.

Untrusted imports MUST be size-limited, parsed defensively, and rendered without executable markup.

## 3.7 Empty and failure states

An empty project MUST provide clear starting actions:

- Create airframe.
- Open project.
- Import supported file.
- Load reference example.

A failed operation MUST preserve the project and offer actionable recovery. WebGL failure MUST provide a reduced-capability assembly and numerical inspection workflow.

---

# 4. Detailed UI/UX Specifications for the Five Studio Modes

## 4.1 Mode 1 — Airframe CAD Studio

### 4.1.1 Purpose and composition

The studio supports axial assembly construction, dimensional editing, mass-property inspection, and blueprint generation.

| Region | Contents |
|---|---|
| Left | Axial assembly tree, component library, visibility controls |
| Center | 3D WebGL canvas, view toolbar, dimensions, reference axes |
| Right | Geometry, material, mass, placement, and attachment properties |

### 4.1.2 WebGL viewport

The viewport MUST provide OrbitControls-equivalent orbit, pan, and zoom behavior.

Required controls:

- Perspective and orthographic projection.
- Side, Front, Top, and Perspective presets.
- Fit assembly and fit selection.
- Reset view.
- Grid and axes toggle.
- Section or clipping view.
- Opaque, translucent, wireframe, and selected-object isolation modes.

Coordinate conventions MUST be documented and visible. Body-axis and world-axis displays MUST not be visually interchangeable.

Camera presets MUST identify their viewing direction relative to the body frame rather than relying on ambiguous names alone.

### 4.1.3 Raycasting and selection

- Pointer selection MUST use raycasting or an equivalent geometry-aware method.
- Selection tolerance MUST account for thin parts and high-DPI displays.
- Occluded or overlapping objects MUST be reachable through a selection-cycle control or object list.
- Selected geometry MUST use an outline or equivalent non-color-only treatment.
- Massless reference objects, hidden objects, and suppressed components MUST remain distinguishable.
- A transform gizmo MUST state axis, frame, and units.

The assembly tree provides the required non-WebGL selection alternative.

### 4.1.4 Axial assembly tree

The tree SHALL show:

- Component name and type.
- Axial ordering.
- Parent-child attachment.
- Visibility and suppression.
- Validation issues.
- Optional mass and axial location columns.

Drag/drop MUST provide:

- A precise insertion marker.
- Valid and invalid target feedback.
- Explicit reparenting versus reordering behavior.
- Prevention of cycles and incompatible attachments.
- A single undoable transaction.

Keyboard alternatives SHALL include move up/down, move to parent, and move to an explicitly selected destination.

Geometric location MUST not change solely because display ordering changes unless the assembly model explicitly couples these concepts.

### 4.1.5 Live inspector

Required groups include:

- Identity.
- Dimensions.
- Placement.
- Material.
- Mass properties.
- Appearance.
- Attachments.
- Validation and provenance.

Numeric fields MUST support direct entry, increment/decrement, and units. Sliders MUST expose valid ranges and their scale.

During manipulation:

1. Lightweight geometry preview updates immediately.
2. Derived values indicate `Preview` or `Updating`.
3. Expensive dependent analyses are scheduled or deferred.
4. Committing the edit invalidates affected historical results.
5. New results replace prior results only when their configuration identifiers match.

The interface MUST distinguish physically impossible values from valid but out-of-model configurations.

### 4.1.6 Mass-property visualization

Show CG, CP references when available, and relevant axes with distinct marker shapes.

Every marker MUST identify:

- Quantity.
- Reference datum.
- Flight or loading state.
- Source model.
- Freshness.

Static unloaded CG MUST NOT be presented as burnout CG.

### 4.1.7 SVG blueprint exporter

The exporter MUST generate true vector SVG, not a screenshot embedded inside SVG.

Options SHALL include:

- Orthographic views.
- Dimension lines and tolerances.
- Centerlines.
- Component labels.
- Units.
- Scale or explicit “not to scale.”
- Project revision.
- Datum and axis convention.
- Optional bill of materials.

Exported line weights and text MUST be suitable for light-background printing. Fonts SHOULD use portable fallbacks; optional text-to-path conversion MUST disclose the loss of text accessibility and editability.

### Acceptance criteria

- Tree and viewport selection remain synchronized.
- Slider cancellation restores the prior committed configuration.
- Reordering is fully undoable.
- Blueprint dimensions derive from model values, not rendered pixel distances.
- Loss of WebGL does not prevent dimensional editing.

---

## 4.2 Mode 2 — Aerodynamics & Aeroelasticity Studio

### 4.2.1 Purpose and composition

This studio presents aerodynamic coefficients, stability migration, and aeroelastic screening within explicit model domains.

| Region | Contents |
|---|---|
| Left | Analysis cases, component contributions, material definitions |
| Center | Linked aerodynamic plots and margin visualizations |
| Right | Atmosphere, Mach sweep, model selection, assumptions |

### 4.2.2 High-Mach drag breakdown

The plot workspace SHALL support:

- Total drag coefficient versus Mach.
- Component contribution curves.
- Available skin-friction, pressure, base, interference, and wave-drag terms.
- Reference area and coefficient convention.
- Reynolds-number context.
- Selected-Mach cursor.
- Comparison across configurations.

Only contributions actually produced by the active model may appear. Unmodeled terms MUST be labeled as excluded rather than shown as zero.

Stacked contribution displays MUST be used only when the terms are additive under the active model. Alternative models MUST not be stacked together.

Interaction requirements:

- Hover and keyboard cursor readouts.
- Zoom and pan.
- Reset extents.
- Toggle series.
- Export data and image.
- Accessible tabular equivalent.

Transonic shading MUST identify the actual model transition or validity interval. It MUST not imply a universally fixed warning boundary.

### 4.2.3 Van Driest II curve

The UI SHALL expose the implemented Van Driest II transformation or correlation with its precise modeled quantity.

The panel MUST identify:

- Implementation reference and revision.
- Boundary-layer assumptions.
- Thermal boundary conditions.
- Relevant Mach and Reynolds ranges.
- Input quantities.
- Whether the displayed line is a transformed quantity, correction, or derived skin-friction estimate.

The interface MUST NOT label a generic compressibility curve “Van Driest II” without an implemented and verified definition.

Outside the supported domain, the plot MUST use a visibly differentiated extrapolation segment or stop rendering and explain why.

### 4.2.4 CP versus Mach migration

The plot SHALL show:

- CP axial position versus Mach.
- Current CG and relevant loading-state CG range.
- Static margin where calculable.
- Datum and normalization convention.
- Uncertainty or model disagreement when available.

For conventional cases, static margin may be expressed in reference diameters, but the sign convention and denominator MUST be explicit.

Where the aerodynamic normal-force derivative is insufficient for a meaningful CP, the interface MUST report undefined or ill-conditioned behavior rather than a misleading finite location.

A favorable static margin MUST NOT be presented as proof of dynamic stability.

### 4.2.5 NACA TN 4197 flutter assessment

The flutter panel SHALL provide a compact gauge plus a detailed numerical view.

Required contents:

- Predicted flutter boundary or criterion from the implemented method.
- Evaluated flight condition.
- Margin definition.
- Governing geometry.
- Material properties and units.
- Applicability limits.
- Source citation and implementation version.

The gauge MUST identify whether margin is expressed as a ratio, difference, or percentage.

A **custom shear modulus override** MUST provide:

- Numeric value and units.
- Source or rationale.
- Temperature basis.
- Material direction where relevant.
- Override badge.
- Reset-to-library action.

For anisotropic laminates or unsupported geometries, the UI MUST explain limitations rather than treating an isotropic scalar estimate as authoritative.

The panel SHALL label the result as an engineering screening estimate unless a separately validated higher-fidelity method is selected.

### 4.2.6 Boattail separation angle gauge

The gauge SHALL show:

- Geometric half-angle or included angle, explicitly identified.
- Active separation criterion.
- Mach and flow assumptions.
- Supported geometry range.
- Predicted category and confidence.

A single universal separation-angle limit MUST NOT be implied. Thresholds MUST originate from the selected model and its operating assumptions.

### Acceptance criteria

- Every curve exposes units, model provenance, and reference conventions.
- Unsupported conditions never receive an unqualified pass.
- Changing shear modulus invalidates dependent flutter assessments.
- CP and CG overlays use the same datum.
- Extrapolated values remain distinguishable in exported output.

---

## 4.3 Mode 3 — Propulsion & Motor Studio

### 4.3.1 Purpose and composition

The studio supports traceable motor selection, thrust-curve inspection, user-authored analytical curves, and time-dependent mass properties.

| Region | Contents |
|---|---|
| Left | Motor library and search filters |
| Center | Thrust plot, impulse summary, mass and CG playback |
| Right | Motor metadata, installation, curve properties |

### 4.3.2 Certified motor library browser

Search and filtering SHALL include:

- Manufacturer.
- Designation.
- Impulse class.
- Diameter.
- Length.
- Total impulse.
- Burn duration.
- Loaded mass.
- Source and certification organization.
- Certification status and effective date when known.

Certification MUST be attributed to a source. Missing, obsolete, disputed, and unverified records MUST have explicit states.

The library MUST distinguish:

- Certified reference record.
- Manufacturer-supplied record.
- Imported record.
- User-authored curve.
- Modified derivative of a reference record.

Modifying a certified reference curve MUST create a derivative. It MUST NOT preserve a certification badge as though the modified curve were certified.

### 4.3.3 Interactive SVG thrust editor

The center workspace SHALL provide an SVG-based `F(t)` plot with:

- Control points.
- Numeric point table.
- Add, delete, and move operations.
- Keyboard point editing.
- Zoom and pan.
- Original-curve overlay.
- Integrated total impulse.
- Peak thrust, average thrust, and burn-time definitions.

Constraints MUST include finite values, ordered timestamps, and physically appropriate force bounds for the selected model. Duplicate times and discontinuities MUST be handled explicitly.

Interpolation choice MUST be visible. Smooth interpolation MUST not introduce hidden negative thrust or overshoot.

Any resampling or smoothing operation MUST preserve the original dataset and report changes to integrated impulse.

### 4.3.4 Propellant depletion and CG playback

Playback SHALL synchronize:

- Thrust.
- Estimated remaining propellant mass.
- Vehicle mass.
- Motor CG.
- Vehicle CG.
- Selected time.

The model MUST disclose how propellant depletion is estimated. Inferring depletion from thrust or cumulative impulse requires explicit assumptions and MUST NOT be presented as measured mass flow.

Astraea SHALL visualize expected CG forward shift where the configured system produces it. It MUST also support aftward or nonmonotonic migration; forward motion is not a universal invariant.

Controls:

- Play/pause.
- Step.
- Scrub.
- Playback speed.
- Ignition and burnout markers.
- Reset to initial condition.

### Acceptance criteria

- Editing a library curve produces a clearly identified derivative.
- Displayed impulse matches the integration method used by the simulation.
- CG direction follows the mass model, not an animation assumption.
- Time readouts remain synchronized across all plots and the vehicle view.

---

## 4.4 Mode 4 — 6-DOF Trajectory & Weather Studio

### 4.4.1 Purpose and composition

This studio combines launch configuration, atmospheric inputs, trajectory analysis, uncertainty propagation, and mission-rule evaluation.

| Region | Contents |
|---|---|
| Left | Cases, weather snapshots, simulation runs, ensembles |
| Center | Launch scene, map, trajectory plots, dispersion workspace |
| Right | Initial conditions, solver settings, uncertainty, gate definitions |

### 4.4.2 Launch rail orientation gizmo

The 3D scene MUST expose rail azimuth, elevation or tilt, length, and reference frame.

- Azimuth MUST identify true, magnetic, or grid north.
- Elevation versus tilt-from-vertical MUST be unambiguous.
- Magnetic conversion MUST identify its model and date when used.
- Numeric alternatives MUST exist for every gizmo operation.
- Undo MUST restore the complete orientation change.

The scene SHOULD display ground plane, north reference, wind direction convention, and geographic origin.

### 4.4.3 Open-Meteo weather integration

The weather workspace SHALL integrate the Open-Meteo REST API through a versioned adapter.

The map MUST distinguish:

- Selected location.
- Requested forecast time.
- Data retrieval time.
- Forecast model or product where available.
- Available altitude or pressure levels.
- Cached and offline states.

“Live” means recently retrieved from an external service; it MUST NOT imply an on-site measured sounding.

A vertical profile assembled from forecast levels MUST be labeled **forecast atmospheric profile** or equivalent. The UI MUST NOT claim a measured radiosonde sounding unless that is the actual data source.

Required handling:

- Loading, retry, timeout, rate limit, and unavailable states.
- Stale-data indicator.
- Explicit refresh.
- Snapshot locking for reproducible simulations.
- Service attribution and applicable usage terms.
- No fabricated upper-air profile from surface data without a disclosed model.

Wind MUST state whether direction is meteorological “from” or vector “toward.” Interpolation, altitude reference, and extrapolation MUST be visible.

### 4.4.4 6-DOF simulation controls

The interface MUST identify:

- Translational and rotational states.
- Attitude representation.
- Body and world frame conventions.
- Integrator and tolerance settings.
- Event detection.
- Atmospheric model.
- Aerodynamic model.
- Initial conditions.
- Solver version.

A reduced-order solver MUST NOT be labeled 6-DOF solely because its output is rendered in 3D.

Run actions SHALL include validation, execution, cancellation, duplication, and comparison. Cancellation MUST preserve available diagnostics and identify partial output as incomplete.

### 4.4.5 Numerical trajectory graphs

Available plots SHOULD include, where supported:

- Altitude AGL and MSL.
- Speed and Mach.
- Acceleration with stated definition.
- Dynamic pressure.
- Attitude.
- Angular rates.
- Angle of attack.
- Ground track.
- Stability metrics.
- Recovery descent rate.
- Event timeline.

All synchronized plots MUST share a cursor and time-selection model. Event markers SHALL include relevant launch, rail-exit, burnout, apogee, deployment, and ground-contact events.

Derived event times MUST disclose interpolation or detection methodology where it affects interpretation.

### 4.4.6 Dual-mode Monte Carlo landing dispersion

The dispersion workspace SHALL provide two explicit result modes:

1. **Parametric covariance view**  
   Landing points, mean, covariance axes, and statistical ellipses.

2. **Empirical containment view**  
   Landing points and sample-based containment representation suitable for checking non-Gaussian or multimodal behavior.

These modes represent the same ensemble through different statistical summaries; switching views MUST NOT rerun or silently change the sample set.

The UI SHALL show:

- Requested and completed sample counts.
- Successful landings.
- Failed or incomplete runs.
- Random seed.
- Input distributions.
- Correlations.
- Configuration snapshot.
- Weather snapshot.
- Landing-coordinate projection.

Failed runs MUST NOT disappear from the denominator without an explicit reporting rule.

#### Ellipse definitions

The covariance view MUST include:

- **1σ ellipse:** Mahalanobis radius 1.
- **2σ ellipse:** Mahalanobis radius 2.
- **95% probability ellipse:** radius approximately 2.448 under a bivariate normal assumption.

For a bivariate normal distribution:

- The 1σ ellipse contains approximately **39.3%**, not 68.3%.
- The 2σ ellipse contains approximately **86.5%**, not 95.4%.
- The 95% ellipse uses the relevant two-dimensional chi-square quantile.

Legends and help text MUST state this distinction.

The UI MUST distinguish a distribution or prediction region for individual landings from a confidence region for the estimated mean.

For empirical containment:

- The algorithm and coverage target MUST be documented.
- A nonelliptical contour MAY be preferable.
- An empirically adjusted ellipse MUST disclose its construction.
- Finite-sample uncertainty MUST be acknowledged.
- Multimodality MUST not be hidden by presenting only one smooth ellipse.

Geographic samples MUST be transformed into an appropriate local metric frame before covariance calculations. Latitude and longitude degrees MUST not be treated as interchangeable Euclidean distances.

### 4.4.7 Competition and mission gates

Gate configuration SHALL include:

- Rule-set name and version.
- Applicable event or metric.
- Threshold and units.
- Inclusive or exclusive comparison.
- Deterministic or probabilistic evaluation.
- Required input validity.
- Governing result or worst-case sample.

Gate states SHALL be `Pass`, `Fail`, `Unknown`, or `Not applicable`, with separate validity and freshness indicators.

A failed gate MUST link directly to the responsible metric and underlying evidence. Rules defined by the user MUST be labeled as user-defined.

### Acceptance criteria

- Every run is reproducible from preserved inputs and versions.
- Weather refresh cannot silently modify a completed run.
- Ellipse labels use correct two-dimensional coverage semantics.
- Failed ensemble members are explicitly reported.
- A missing required gate input yields `Unknown`, never `Pass`.

---

## 4.5 Mode 5 — Recovery Packaging & Flight Evidence Ledger

### 4.5.1 Purpose and composition

This mode joins recovery-system packaging analysis with traceable post-flight evidence.

Sub-workspaces:

- **Recovery Packaging**
- **Deployment Assessment**
- **Flight Logs**
- **Simulation Comparison**
- **Cd Calibration**

| Region | Contents |
|---|---|
| Left | Recovery assemblies, imported logs, evidence records |
| Center | Packing visualization, synchronized plots, calibration diagnostics |
| Right | Selected component, import mapping, event alignment, fit parameters |

### 4.5.2 Dual-compartment packing visualizer

The 3D visualizer SHALL represent two independently defined recovery compartments, including:

- Internal usable envelope.
- Bulkheads and couplers.
- Parachutes and deployment bags.
- Harnesses.
- Avionics or payload intrusions.
- Protected exclusion zones.
- Deployment path.

Required controls:

- Exploded view.
- Section view.
- Transparency.
- Component isolation.
- Clearance inspection.
- Compartment switching.

Packed soft goods MUST use a disclosed representation: measured packed envelope, user-entered bounding volume, or approximate geometric model.

An estimated volume fit MUST NOT imply verified deployment reliability. Compressibility, folding, friction, snagging, and dynamic extraction remain separate considerations.

Warnings SHALL identify overlaps, insufficient declared clearance, and blocked modeled paths without overstating simulation fidelity.

### 4.5.3 Ejection sizing assessment

The black-powder ejection sizing calculator SHALL be presented as a **bounded engineering estimate requiring qualified review and controlled validation**, not an operational firing procedure.

The UI MUST separate:

- User-supplied or approved deployment model.
- Compartment geometry.
- Pressure assumptions.
- Retention and shear-pin characterization.
- Temperature assumptions.
- Structural limits.
- Estimated uncertainty.
- Validation evidence.

This UI specification does not define a charge formula, default charge quantity, ignition circuit, or test procedure.

Numerical sizing output MUST remain unavailable until the responsible engineering team has approved and verified the underlying method and its applicability.

#### Shear-pin temperature derating

The interface MUST:

- Identify pin material and geometry.
- Distinguish measured strength from handbook or assumed values.
- Show reference temperature.
- Show the approved temperature-dependent relationship and its domain.
- Identify installation and load-sharing assumptions.
- Avoid a universal derating percentage.
- Mark extrapolation and missing data explicitly.

Outputs MUST distinguish estimated separation requirements from allowable compartment loads. A predicted separation result MUST NOT be labeled safe if structural, leakage, thermal, or validation inputs are unresolved.

Any retained energy-related result MUST include model version and review status.

### 4.5.4 AltOS / FlightSketch CSV ingestion

Users SHALL be able to drag and drop files or activate a standard file picker.

The import workflow MUST provide:

1. Format and dialect detection.
2. Header preview.
3. Column mapping.
4. Unit mapping.
5. Timestamp interpretation.
6. Sample-rate inspection.
7. Missing-data and duplicate-time report.
8. Sensor metadata.
9. Import summary.

Adapters MUST handle supported AltOS and FlightSketch variants explicitly. Unknown variants MUST fall back to a manual mapping workflow rather than silently guessing.

The original file MUST be retained as immutable evidence, with a checksum and import timestamp. Parsed and transformed data MUST be stored as derived records.

CSV export MUST protect against spreadsheet formula injection without silently corrupting the raw evidence record.

### 4.5.5 Simulated versus actual overlay

The analysis workspace SHALL provide synchronized multi-plots with:

- Measured series.
- Simulated series.
- Residuals.
- Event markers.
- Shared cursor.
- Shared interval selection.
- Source-specific legends.
- Data-quality flags.

Alignment methods MAY include:

- Absolute timestamps.
- User-selected launch event.
- Explicit time offset.
- Correlation-assisted alignment with review.

Automatic alignment MUST show the applied offset and confidence or ambiguity. It MUST not silently warp time.

Resampling and filtering MUST be disclosed. Raw and processed measurements MUST remain separately accessible.

Measured barometric altitude MUST not be assumed equivalent to geometric altitude without documenting the atmospheric conversion and reference datum.

### 4.5.6 Automated inverse Cd calibration

The calibration tool SHALL fit explicitly selected aerodynamic parameters against selected flight evidence.

Required workflow:

1. Select baseline simulation and evidence.
2. Select fitting interval.
3. Select fit parameters.
4. Define bounds, priors, and weights.
5. Review fixed assumptions and excluded data.
6. Execute optimization.
7. Review residuals, uncertainty, and diagnostics.
8. Compare baseline and candidate.
9. Apply as a new configuration revision or reject.

The interface MUST expose:

- Objective function.
- Optimizer and version.
- Convergence state.
- Bound-active parameters.
- Parameter sensitivity.
- Correlations or identifiability warnings where available.
- Uncertainty method.
- Validation interval or held-out flight, when available.

Cd estimation is potentially confounded by wind, thrust, mass, attitude, sensor bias, and timing. The UI MUST not imply that every trajectory mismatch is caused by drag.

A successful optimization is not necessarily a physically credible calibration. Poor identifiability, structured residuals, and unsupported extrapolation MUST remain visible.

Applying calibration MUST NOT overwrite the original model or measured data.

### 4.5.7 Evidence ledger

Every evidence record SHALL identify:

- Source.
- Capture or acquisition time.
- Import time.
- File checksum where applicable.
- Units and coordinate conventions.
- Processing steps.
- Responsible author or actor, when available.
- Linked project revision.
- Linked run or calibration.
- Review status.

The product MUST distinguish ordinary revision history from tamper-evident or signed records. It MUST NOT claim cryptographic audit integrity unless implemented.

### Acceptance criteria

- Recovery fit estimates remain distinct from deployment validation.
- Unsupported sizing methods do not produce actionable numerical output.
- Raw logs remain recoverable and unchanged.
- Alignment and filtering are reversible derived operations.
- Calibration creates a new revision with traceable provenance.

---

# 5. Keyboard Navigation, Power-User Shortcuts & Accessibility

## 5.1 Accessibility baseline

Astraea MUST target **WCAG 2.2 Level AA** for the application interface.

Required provisions include:

- Semantic landmarks.
- Logical heading structure.
- Visible keyboard focus.
- Appropriate labels and descriptions.
- Non-color status encoding.
- Accessible error identification.
- Alternatives to dragging.
- Reflow and zoom support.
- Accessible data alternatives for visualizations.
- Reduced-motion support.

Essential text MUST meet applicable contrast requirements. Plot traces and interactive graphics MUST maintain meaningful non-text contrast against adjacent content.

## 5.2 Shortcut scope and conflict rules

Single-key shortcuts MUST be disabled while focus is in:

- Text fields.
- Numeric fields.
- Editable tables.
- Search controls.
- Code or expression editors.
- Other components with conflicting native keyboard behavior.

Users MUST be able to disable or remap single-character shortcuts. Keyboard layouts and assistive-technology conflicts MUST be considered.

A shortcut help panel SHALL show the active keymap and current context.

## 5.3 Default shortcuts

| Action | Default | Scope / behavior |
|---|---|---|
| Airframe CAD | `1` | Global when not editing |
| Aerodynamics & Flutter | `2` | Global when not editing |
| Propulsion & Motors | `3` | Global when not editing |
| Trajectory & Weather | `4` | Global when not editing |
| Flight Evidence & Logs | `5` | Global when not editing |
| Side view | `Alt+1` | Viewport context |
| Front view | `Alt+2` | Viewport context |
| Top view | `Alt+3` | Viewport context |
| Perspective view | `Alt+4` | Viewport context |
| Fit selection | `F` | Viewport context |
| Fit assembly | `Shift+F` | Viewport context |
| Start simulation | `Space` | Simulation workspace, no focused conflicting control |
| Activate Run / confirm edit | `Enter` | Focus-dependent |
| Run active analysis | `Ctrl/Cmd+Enter` | Explicit analysis command |
| Undo | `Ctrl/Cmd+Z` | Engineering edit history |
| Redo | `Ctrl/Cmd+Shift+Z` | Engineering edit history |
| Save | `Ctrl/Cmd+S` | Project |
| Open | `Ctrl/Cmd+O` | Project |
| Command palette | `Ctrl/Cmd+K` | Global |
| Cancel current edit / dismiss | `Escape` | Nearest active interaction |
| Shortcut help | `?` | When not editing |

Browser and operating-system reserved combinations MUST be tested. Conflicting shortcuts require remappable alternatives.

`Space` MUST NOT alternately mean “launch simulation” and “play evidence” without clear context. In a focused playback transport, it controls playback; in a simulation workspace, it starts the configured analysis.

Repeated keydown events MUST NOT enqueue duplicate runs.

`Escape` MUST NOT silently terminate a long-running simulation. Job cancellation uses an explicit cancel command.

## 5.4 Focus management

- Mode switching moves focus to the new workspace heading or preserves a meaningful corresponding control.
- Opening an inspector group does not unexpectedly move focus.
- Closing a popover returns focus to its trigger.
- Deleting a selected tree item moves focus to a logical adjacent item.
- Notifications do not steal focus.
- Modal dialogs trap focus only while open and restore it on close.
- Canvas focus MUST have a visible boundary and a clear escape path.

Skip links SHALL provide direct access to navigation, assembly/source list, main workspace, inspector, and issues.

## 5.5 Assembly tree accessibility

The tree MUST implement recognized tree-navigation behavior:

- Up/down: adjacent visible item.
- Right: expand or enter child.
- Left: collapse or move to parent.
- Home/end: first/last visible item.
- Enter: select or activate the documented action.
- Context menu: keyboard-accessible object actions.

Virtualization MUST preserve valid accessibility metadata, stable focus, and meaningful item position announcements.

## 5.6 Plot and 3D accessibility

Every plot MUST provide:

- Accessible title.
- Description of axes and units.
- Series list.
- Current cursor readout.
- Data table or export.
- Keyboard zoom/reset controls.
- Textual summaries of important extrema and threshold crossings.

Every essential 3D task MUST have a non-canvas alternative through forms, tree operations, or tables.

Screen readers MUST not receive announcements for every animation frame. Live values SHALL be summarized at a controlled cadence or read on demand.

## 5.7 Non-blocking notifications and safety warnings

### Toast policy

Toasts are appropriate for:

- Save completion.
- Export completion.
- Background-run completion.
- Recoverable network problems.
- Undoable noncritical actions.

Toasts MUST:

- Avoid obscuring the Mission Status Rail.
- Include an actionable label where appropriate.
- Pause dismissal while hovered or focused.
- Be available in notification history.
- Use polite announcements for ordinary status.
- Avoid duplicate-message storms.

Critical information MUST NOT exist only in an auto-dismissed toast.

### Warning escalation

| Severity | Presentation |
|---|---|
| Informational | Inline hint or toast |
| Caution | Persistent badge and linked issue |
| Invalid analysis | Disabled affected run action with explanation |
| Failed criterion | Persistent Mission Status Rail item and evidence link |
| Consequential destructive action | Confirmation dialog |

Engineering warnings SHALL state:

1. What was detected.
2. Which object or result is affected.
3. Why it matters.
4. What assumptions apply.
5. Which corrective or investigative action is available.

Warnings MUST not shame users or substitute vague language such as “Something went wrong” for a known diagnostic.

---

# 6. Cross-Cutting Data, Performance & Reliability Requirements

## 6.1 Reproducible analysis records

Each completed run MUST preserve:

- Project revision identifier.
- Configuration snapshot.
- Solver and model versions.
- Material-library references or embedded values.
- Motor record and derivative status.
- Weather snapshot.
- Units and frame conventions.
- Random seed where applicable.
- Start and completion timestamps.
- Validation and warning records.

Results SHALL link back to this record from plots, gates, exports, and evidence comparisons.

## 6.2 Computation architecture

Heavy computation SHOULD run outside the main UI thread using workers or an equivalent service architecture.

The frontend MUST:

- Cancel superseded preview work when supported.
- Discard obsolete responses.
- Keep navigation responsive.
- Report meaningful phases.
- Show determinate progress only when a credible denominator exists.
- Preserve partial diagnostics on failure.

Simulation state SHALL follow an explicit lifecycle:

```text
Idle → Validating → Queued → Running
                           ↘ Completed
                           ↘ Cancelled
                           ↘ Failed
```

Validation failure returns actionable issues without presenting a completed result.

## 6.3 Performance budgets

The following are release targets, measured on a declared reference workstation and representative project fixtures:

| Interaction | Target |
|---|---|
| Input acknowledgment | p95 within 100 ms |
| Typical viewport manipulation | Target 60 fps; degrade visual detail before interaction integrity |
| Selection-to-inspector update | p95 within 100 ms for local data |
| Lightweight slider preview | p95 within 100 ms |
| Visible long-operation feedback | Within 100 ms of initiation |
| Cancellation acknowledgment | Within 250 ms; actual termination reported separately |
| Mode change with cached state | p95 within 200 ms |

Solver completion time is workload-dependent and MUST NOT be represented by a universal UI promise.

Large datasets SHALL use appropriate downsampling or level-of-detail rendering while preserving full-resolution source data. Decimation MUST retain important extrema and discontinuities where the display depends on them.

## 6.4 Persistence and recovery

- Autosave status MUST be visible.
- Autosave MUST not imply remote backup.
- Recoverable drafts MUST be offered after interruption.
- Layout preferences MUST be separate from engineering model content.
- Read-only or permission failures MUST have explicit states.
- Multi-tab or concurrent-edit conflicts MUST be detected or explicitly unsupported.
- No last-writer-wins overwrite may occur silently.

## 6.5 Privacy and security

Projects and logs may reveal launch locations, dates, and operational details.

The interface MUST:

- Explain when coordinates are sent to weather services.
- Avoid uploading flight evidence without an explicit product workflow and disclosure.
- Avoid including sensitive project data in analytics by default.
- Sanitize imported text and generated markup.
- Enforce file and dataset resource limits.
- Clearly distinguish local storage, synchronized storage, and exported files.

---

# 7. Verification, Acceptance & Release Gates

## 7.1 Design-system verification

Before release:

- All token pairings used in essential UI pass contrast testing.
- Focus states are visible across every surface level.
- Density modes preserve operability.
- Numeric controls behave consistently.
- Status components preserve text and icon encoding without color.
- Reduced-motion and forced-colors behavior are tested.

## 7.2 Scientific presentation verification

Simulation and domain engineers MUST review:

- Quantity names and dimensions.
- Reference areas and datums.
- Coordinate frames.
- Sign conventions.
- Statistical interval definitions.
- Model-applicability labels.
- Calibration diagnostics.
- Weather-source descriptions.
- Gate evaluation logic.

A correct calculation with a misleading label is a release-blocking defect.

## 7.3 Required end-to-end scenarios

1. Create an airframe, edit dimensions, undo, and export an SVG blueprint.
2. Import each supported format version and inspect unsupported-field reporting.
3. Change a material property and verify dependent results become stale.
4. Compare aerodynamic models without silently merging incompatible outputs.
5. Modify a certified motor curve and verify derivative status.
6. Run a trajectory using a locked weather snapshot.
7. Refresh weather and verify historical runs remain unchanged.
8. Execute a seeded ensemble and inspect failures and ellipse coverage labels.
9. Import a flight log with missing samples and ambiguous units.
10. Align measured and simulated data without modifying raw evidence.
11. Run a calibration, reject it, then apply a later candidate as a new revision.
12. Complete essential editing and analysis navigation using only a keyboard.
13. Recover a project after interruption.
14. Continue numerical work after WebGL context loss.
15. Verify that unknown, stale, and out-of-domain results cannot appear as unqualified passes.

## 7.4 Accessibility verification matrix

Testing MUST include:

- Keyboard-only operation.
- Screen-reader operation on supported browser/platform combinations.
- 200% zoom.
- 400% zoom or equivalent reflow evaluation where applicable.
- Reduced motion.
- High contrast or forced colors.
- Color-vision deficiency checks.
- Pointer target sizing.
- Drag alternatives.
- Accessible errors and status announcements.

Automated accessibility tools are necessary but insufficient. Manual task-based testing is required.

## 7.5 Release-blocking defects

The following MUST block release:

- Silent unit conversion errors.
- Incorrect frame or datum labeling.
- Stale results presented as current.
- Missing inputs presented as passing gates.
- Modified motor data presented as certified reference data.
- Forecast data presented as measured weather.
- Incorrect Monte Carlo containment labels.
- Calibration overwriting raw evidence.
- Unsupported engineering methods producing authoritative-looking safety output.
- Essential pointer-only functionality without an accessible alternative.
- Destructive actions without adequate recovery or confirmation.
- Late asynchronous results overwriting a newer configuration.

---

# 8. Implementation Deliverables & Definition of Done

## 8.1 Required design deliverables

The implementation program SHALL maintain:

- Token source of truth.
- Component inventory and interaction specifications.
- Five studio-mode layouts.
- Compact and reflow layouts.
- Keyboard map.
- Empty/loading/error/offline state library.
- Safety-state presentation matrix.
- Plot and 3D annotation standards.
- Import/export capability matrix.
- Scientific terminology glossary.
- Accessibility test results.
- Performance benchmark fixtures.

## 8.2 Required engineering deliverables

- Shared quantity and unit infrastructure.
- Stable entity-selection model.
- Transactional undo/redo.
- Immutable run snapshots.
- Dependency-based result invalidation.
- Versioned import/export adapters.
- Weather adapter and snapshot cache.
- Background-job lifecycle.
- Provenance and evidence records.
- Accessible visualization alternatives.
- Automated regression coverage for critical invariants.

## 8.3 Definition of done

A feature is complete only when:

1. Its normal, empty, loading, stale, invalid, offline, and failure states are specified.
2. Its units, frames, assumptions, and provenance are visible where needed.
3. Its keyboard and assistive-technology paths are implemented.
4. Its edits are recoverable according to the transaction model.
5. Its computations cannot silently contaminate newer project state.
6. Its exports preserve meaning and disclose limitations.
7. Its performance is measured against representative fixtures.
8. Its domain presentation has engineering review.
9. Its acceptance tests pass.
10. Its documentation explains limitations without relying on hidden tooltips or legal disclaimers to correct misleading UI.

---

## Final Design Mandate

Project Astraea SHALL behave like a disciplined engineering workstation: visually restrained, numerically precise, spatially stable, accessible, and explicit about uncertainty.

The interface must make it easy to answer:

- **What configuration am I examining?**
- **What changed?**
- **Which model produced this result?**
- **Are these values current and applicable?**
- **What evidence supports the conclusion?**
- **What remains unknown?**
- **What action is available next?**

Astraea succeeds when expert users can work quickly without losing traceability, and less-experienced users cannot mistake polished visualization for validated engineering truth.