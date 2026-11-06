# Stage composition and per-section aerodynamics: future Console design

**Status:** design proposal; no product behavior or release scope is changed.

**Date:** 2026-10-30. **Console source:** `continue-task` at `df1eefa53f77735e3428caca13d4936b790c3065`.

**Research source:** `rasaerodecomped-3stage` at `9a6a6225e7da0d746c97845255579bbc755e005b`; evidence inventory in section 8.

## 1. Recommendation and core problem

Keep one editable vehicle assembled from sections. Add **Stage composition**, a read-only tab in the existing Airframe dock, with **Booster2 / Booster1 / Sustainer** tabs in flight order. Each view states the entire retained stack, highlights its source sections, and summarizes the geometry and flight inputs the engine will use. Reuse that view context in Aero and identify the actual stage views in Flight results.

The crucial sentence, always visible for a multistage vehicle, is:

> A stage view includes every section still attached during that part of the flight. Edit each section once in Airframe.

“Booster2” often sounds like the bottom booster alone. In the engine it names the first flown configuration: the whole rocket. A geometry editor scoped to that label would invite users to redraw upper sections or omit them. There must be no stage geometry editor, stage-specific copy of a part, editable composition checklist, or manual override of the derived stack.

| Flown view | Retained sections, nose to tail | Active propulsion slot | What leaves at the next separation |
|---|---|---|---|
| Booster2, first flown | Sustainer + Booster1 + Booster2 | Booster2 | Booster2 |
| Booster1, next | Sustainer + Booster1 | Booster1 | Booster1 |
| Sustainer, last | Sustainer | Sustainer | No further powered-stage separation in this scope |

Here `S`, `B1`, and `B2` abbreviate section ownership, not separate editable vehicles.

Four distinctions must survive every screen:

1. **Owned section versus flown view.** Sustainer fins belong to S but fly in S, B1, and B2. B1 fins fly in B1 and B2. B2 fins fly only in B2.
2. **Entered geometry versus model geometry.** The engine's load-time junction rule can replace entered junction diameters. Preserve the entry and expose the effective model value and reason.
3. **Present hardware versus aero contribution.** An equal-diameter buried booster shoulder remains represented in the source and positioning explanation. It adds zero wetted area, zero reference length and zero station offset: the engine creates the shoulder Expansion and offsets the follower only when `Diameter > InsideDiameter` (`a6.cs:348-363`), so a buried follower starts at the Booster's authored `Location`, which the app's layout writes as the running station.
4. **Geometry versus flight mass properties.** Stage launch mass/CG, motors, nozzles, and delays are stage inputs. A cumulative aero chain does not establish those values, inertia, or separation dynamics.

This matters numerically: reusing B1 geometry for B2 under-counted first-stage drag and over-predicted the research fixture's apogee by 10.9%. The supplied corrected correlation is 0.010% apogee, 0.0001% maximum velocity, 0.035% time to apogee, and a 0.010 s handoff difference. These are bounded engine-comparison results for a synthetic three-stage case, not physical flight validation or shipped Console accuracy.

### Current implementation boundary

The task's stage-aware model is the target domain. The inspected Console branch does **not** yet expose that full domain: `RocketVehicle` has a flat `components` array with no stage ownership/include fields, `LaunchCase` resolves one motor, and `FlightRun` has no cumulative composition record. Do not present research-repo capabilities as current Console controls.

All additions below are proposed extensions to named existing surfaces. No ninth pipeline screen, separate stage editor, new booster component type, CDX1 importer, model-selection setting, or arbitrary visibility setting is proposed.

### Supported and refused layouts

“Supported composition,” “supported aero,” and “runnable flight” are separate assessments. This table defines the proposed adapter boundary, not a claim that any new layout works today.

| Layout or input | Proposed disposition |
|---|---|
| S alone; S+B1; S+B1+B2, contiguous stage dependency and unambiguous ownership | Derive the retained views; evaluate only with a provider that supports the complete selected layout |
| Nose, contiguous main body tubes, supported attached fins and supported tail transitions | Apply the provider's exact mapping; consecutive tubes may map to one model body while retaining all source IDs |
| Booster shoulder plus follower body/fins at recorded nose stations | Preserve the recorded nose stations; do not force sequential end-to-end placement. The research fixture's earlier Booster2 `Location` (125 in) was one shoulder short of the running station (126.75 in) and has been corrected; the engine accepted that overlap silently, so the adapter must not reproduce it |
| Equal inside/outside diameter on a booster shoulder | Supported buried-shoulder treatment; zero shoulder aero contribution, follower station retained |
| Equal-diameter generic transition | Do not infer “buried booster shoulder.” The inspected research adapter refuses the unclassifiable generic transition |
| Explicit supported conical expansion/reducer | Use junction normalization and the provider's transition rules; show the effective fore/aft diameters |
| Two touching tubes with differing raw diameters | Show the diameter the load-time rule actually uses. Raw diameter differences alone do not create a modeled step |
| Intended exposed abrupt step that normalization would erase; unsupported tail order or noncontiguous main-body run | Refuse the affected aero view; name source sections and the unsupported feature. Never silently turn it into a smooth vehicle |
| B2 enabled without B1; missing ownership/attachment; more than two boosters; parallel/strap-on staging | Refuse this staged configuration; keep source editing and saving available |
| Elliptical/freeform fins or another shape lacking a counterpart in the chosen provider | Preserve editable source, show provider-specific refusal. Existing legacy support for a shape does not establish support in another provider |
| Missing motor, invalid dimensions, mass/CG, or delay in an included stage | Show a repair issue at its source; flight cannot run. Valid geometry inspection may remain available |

The research booster helper is not a general solid-intersection or arbitrary-overlap solver. New overlap classes need their own mapping and evidence.

Do not add a “step intent” setting. Raw tube-diameter differences receive the junction notice; a physical taper must be expressed through an original transition component that the provider supports. An explicit abrupt step with no supported mapping is refused. Internal mass/parachute parts retain their section membership but are labeled **Carried; no external aero contribution** in the aero mapping, separate from buried-shoulder treatment.

## 2. User mental model and design principles

Use **section** for the physical ownership of an input, **stage view** for a retained aerodynamic stack, and **flight phase** for time intervals. Reserve “Airframe,” “Aero,” and “Flight” for Console destinations. The existing `StageId` means a pipeline destination and must not be reused as the type of a rocket stage.

Most users begin with “this is my booster body” and “this motor fires first.” Support those useful ideas with two labels:

- On the editable part: **Section: Booster1**.
- On the derived view: **Booster2 — full stack · Sustainer + Booster1 + Booster2**.

Do not relabel Booster2 as “Stage 1” everywhere: that loses the correspondence with source records. Add “first flown” as explanatory text. Do not use the legacy CSV marker `B` as a unique identity for two different boosters.

The principles are:

- **One source of truth.** The parts list and its explicit ownership/attachment metadata define geometry. A view contains references and effective values, never an independently editable part list.
- **Show the consequence near the edit.** PartInspector names every view affected by the selected part. A change to S affects all three views; a change to B2 affects only B2 geometry.
- **Keep editing selection independent from inspection selection.** Switching a stage tab changes what is inspected, not the selected part, its ownership, a motor assignment, include flags, or any saved input.
- **Disclose in layers.** Always show the stack sentence, source state, support state, and key summaries. Expand “Sections used” and “Model adjustments” for source mappings, normalized junctions, stations, and omitted aero contributions.
- **Separate drafts, applied inputs, and recorded results.** A preview can update immediately without claiming the last flight used it. Preserve the current Apply/Discard and freshness patterns.
- **Explain missing values.** Use “N/A — engine has not reported this quantity” or a specific refusal. Zero is a valid contribution only when the engine explicitly reports zero.

At first open, select the lowest included stage: B2 for three stages, B1 for two, S for one. Remember the inspected stage in session state across Airframe/Aero navigation. After exclusion/removal, retain it if still available; otherwise select the next included upper view and announce the change. Do not create undo history for viewing tabs.

## 3. Information architecture and summaries

### Placement in the existing Console

| Existing file/component | Proposed responsibility |
|---|---|
| `src/console/stages/Airframe.tsx::AirframeStage` | Add Stage composition to `WithDock` beside Mass budget and History. Default to composition when opening a multistage design or following a composition repair link; preserve the existing single-stage default |
| `src/console/shell/PartsTree.tsx::PartsTree` | Keep one nose-to-tail parts list. Add compact owner badges and a secondary “In this view / Not in this view / Not included” annotation; keep all source parts discoverable |
| `src/console/shell/Inspector.tsx::PartInspector` | Keep geometry/material/part mass editing. Add a section context using `InspectorSection`: owner, “Flies in …,” selected-view membership, and “View stage composition” link |
| `src/console/stages/Aero.tsx::AeroStage` | Reuse the composition selector/summary in a Stage composition dock tab. Scope stage-aware Stability breakdown and Aerodynamic inputs to the inspected view; keep legacy-only quantities explicitly labeled |
| `src/console/stages/AeroControls.tsx::AeroControls` | Show coefficient previews for the selected derived stack, with provider, atmosphere, Mach/incidence and power/nozzle context |
| `src/console/stages/Flight.tsx::FlightStage, FlightInspector, LaunchInspector` | Extend the existing inspector with stage flight-input groups. Show the planned sequence before running and the recorded view identities in Results; leave launch rail/site/recovery groups in place |
| `src/console/stages/Motor.tsx::MotorStage, MotorInspector` | Use the existing motor catalog/fit/assignment workflow with an explicit target slot, e.g. “Use N1048 for Booster2.” Do not overload a composition-view click as motor assignment |
| `src/console/stages/FlightTimeline.tsx::FlightTimeline, FlightPose` | Label native stage intervals and handoffs; pose uses the run's retained geometry at scrub time once the runtime supplies it |
| `src/console/shell/RunReadiness.tsx::RunReadiness` | Aggregate composition/provider/input refusals with repair links; all run entry points share the same admission result |
| `src/console/stages/Verify.tsx::VerifyStage, useGates` | Show composition support and stage-qualified checks separately from real-flight validation. Do not substitute one live whole-vehicle margin for a recorded stage-specific flight gate |
| `src/console/stages/Build.tsx::BuildStage, BuildInspector`; `src/console/stages/SavedRuns.tsx` | Carry recorded stage names, inputs and composition provenance into existing traces and historical-run presentation |
| `src/console/stages/common.tsx::WithDock, StageHeader`; `src/console/Workstation.tsx` | Reuse dock, tabs, panel toggles and freshness conventions; adapt the existing regions for narrow widths |

**Decision:** Airframe dock is the primary home. The inspector remains a part editor, not an alternative composition panel. Aero repeats the read-only view for analysis. Flight consumes and identifies the resolved plan rather than letting users assemble a second one.

The permanent selector uses tabs in flight order:

```text
Booster2                  Booster1                  Sustainer
S + B1 + B2               S + B1                     S
first flown               after B2 separates        after B1 separates
```

With one stage, show “Sustainer · only flown view” rather than a one-item tab strip. Excluded but defined boosters remain visible as inspectable tabs marked **Not included in this flight**; they cannot appear in current flight results. Their geometry preview is explicitly labeled “Defined stack preview,” not a planned phase.

### Per-view summary contract

| Label | Meaning and source | Editing/availability |
|---|---|---|
| Sections flown | Ordered owner groups plus expandable source component names/IDs | Read-only source references; each name selects the original part |
| Reference diameter / area | Provider's effective maximum diameter and reference cross-sectional area for this complete stack | Native output; not a sum of stage cross sections |
| Reference length | Provider's counted aero length, including its inclusion/exclusion rules | Native output; not automatically the maximum aft station or drawing length |
| Wetted area | **Body wetted area used by the model**, with nose/body/transition scope stated; fin wetted area separate if the provider reports it | Do not label an incomplete subtotal “Total wetted area”; no mesh-based estimate |
| CP from nose | Provider, Mach, incidence and power condition shown with the number; distinct from a flight-time CP sample | Unavailable until evaluated; no generic “CP” reused across regimes |
| Mass at stage start / CG from nose | Full retained stack for that stage's entry, with source, mass basis and coordinate datum | Read-only here; link to Flight inspector. Not a sum of the three entered stage launch masses |
| Active motor / carried motors | One active slot; upper-stage motors may still be carried | Link to Motor for that slot; never infer the active slot from a highlighted fin |
| Nozzle exit diameter | Nozzle bound to this flown slot and power condition for the aero result | Edit the stage flight input; no sum or reuse of another slot's value |
| Ignition / separation delay | Named event/time origin, from the resolved flight plan | Edit only fields supported for that slot; B2 ignition is fixed at zero in the evidenced engine contract |
| Model status / result links | Composition support, provider support, preview/applied/run state, confidence and limits | “View in Aero”; “View in Flight” opens current result context, or Flight readiness if no result |

All metric values use the existing `ResultValue`/confidence conventions where applicable. Read-only metrics are text, not disabled number fields. `kit/units.ts` currently has no area kind: implementation must add consistent SI-area display conversion there before showing m²/in²; never format area as a bare unitless raw number.

Keep **Mass budget** labeled as component dry-mass rollup. Its current “motor at liftoff” and “liftoff mass” calculation assumes one motor; those lines must not be presented as multistage all-up mass until their semantics are updated. The composition panel may show the source stage-entry mass alongside that rollup, never silently replace one with the other.

### Model adjustments and the buried shoulder

The expandable section lists: source part, entered value, effective value, adjustment, and affected views. Information remains copyable and keyboard accessible.

```text
Model adjustments · Booster2
Booster2 shoulder   Present in source · buried at equal diameter
  Wetted-area contribution: 0
  Reference-length contribution: 0
  Follower starts at 126.75 in from nose (125 + 1.75)
  [Select original transition]   [Select follower body]
```

Use an information treatment for the evidenced buried case, not a warning that demands correction. Generic source/effective diameter differences deserve a visible “Junction adjusted” notice. An intended physical discontinuity that cannot be represented is a refusal, not a dismissible warning.

The AeroPac fixture demonstrates why the drawing length cannot substitute for reference length:

| View | Reference diameter | Reference area, engine convention | Counted reference length |
|---|---:|---:|---:|
| S | 3.08 in | 7.450595 in² | 68.50 in |
| S+B1 | 4.05 in | 12.882482 in² | 132.25 in |
| S+B1+B2 | 4.05 in | 12.882482 in² | 194.25 in |

These are source-derived examples, not newly run aero results. The inspected adapter counts S's 68.5 in, then B1's 1.75+62 in, then B2's 62 in. B2's 1.75 in shoulder is excluded from that count, but the follower still spans stations 126.75–188.75 in. Therefore **194.25 in reference length differs from the 188.75 in aft station**. Preserve this distinction even if it seems surprising. The same datum governs fins: CDX1 `Fin.Location` runs forward from the Booster's running aft station, which includes the shoulder only when the shoulder is real. On AeroPac, B1's fin leading edge is `63 + 1.75 + 62 − 15.375 = 111.375 in`; the buried B2's is `126.75 + 62 − 15.375 = 173.375 in`. Deriving either from `location + length − Fin.Location` without the real-shoulder offset moved the fin 1.75 in forward and dropped the engine-matched CP from 83.42 to 82.52 in. The reference-area routine uses the engine's `3.14159` convention; the UI consumes its value instead of recomputing with another constant. Wetted area and CP require native output and must not be filled with illustrative numbers.

## 4. Wireframes

Wireframes specify hierarchy and content, not new screens. Brackets around actions mean buttons; angle-bracket values mean an engine value still to be supplied. Existing Beta/model disclosures remain visible.

### Desktop, 1280 × 800

Use the current approximate widths: 64 px pipeline rail, 250 px parts, 320 px inspector, two 5 px separators, leaving about 636 px for the center. Allow the dock to grow to about 330–360 px; long section tables scroll inside it. Do not overlay the composition table on the rocket canvas.

```text
+---------------------------------------------------------------------------------------+
| Astraea  [Parts]  Vehicle name       Undo Redo       [Run simulation]      [Inspector]  |
| Beta · current model/accuracy disclosure                                               |
+------+---------------------+-------------------------------------+--------------------+
| rail | Parts · one assembly| Airframe   Preview · staged edits   | Body tube          |
|      | Filter name / type  | [3D] [3D+2D] [2D]                   | Booster1 body      |
| Miss.|                     |                                     |                    |
| Airf.| Nose          [S]   |         full assembly drawing       | Section: Booster1  |
| Motor| S body        [S]   |         retained sections outlined  | Flies in: B2, B1   |
| Aero | S fins        [S]   |         B1 body selected            | In Booster2 view   |
| Flgt.| B1 shoulder   [B1]  |                                     | [View composition] |
| Rec. |>B1 body       [B1]  |         View: Booster2 full stack   |                    |
| Ver. |  In this view       |         S + B1 + B2                 | Tube               |
| Build| B1 fins       [B1]  |                                     | Length     [value] |
|      | B2 shoulder   [B2]  +-------------------------------------+ Outer dia. [value] |
|      |  Buried · no aero   | Stage composition | Mass | History  | Inner dia. [value] |
|      | B2 body       [B2]  | READ-ONLY · from preview sections   |                    |
|      | B2 fins       [B2]  | [Booster2*] [Booster1] [Sustainer]   | Material and mass  |
|      |                     |  S+B1+B2     S+B1         S          | [existing fields]  |
|      | All source rows stay| Booster2 = Sustainer + B1 + B2      |                    |
|      | in the tree         | First flown · separates B2 next     | 1 staged edit      |
|      |                     | Ref area <value>  Ref L <value>     | [Apply staged edits]|
|      |                     | Body wet <value>  CP <value/basis>  | [Discard edits]    |
|      |                     | Entry mass/CG <values/source>       |                    |
|      |                     | Motor B2 · nozzle · delays <values> |                    |
|      |                     | v Sections used  > Model adjustments|                    |
|      |                     | B1 body -> original section         |                    |
|      | [Add part] Template | [View in Aero] [View in Flight]      |                    |
+------+---------------------+-------------------------------------+--------------------+
| Preview · not run | Geometry status with stage/basis | Stored flight rN · stale          |
+---------------------------------------------------------------------------------------+
```

Owner badges remain the same when tabs change. In the B1 view, B2 rows say “Not in this view”; they do not disappear or become editable copies. Selecting B1 body from the composition list leaves the Booster2 tab selected and opens that same original body in PartInspector.

Viewport emphasis is a display-only outline/dimming of retained versus detached groups, not another visibility input. If the current renderer cannot faithfully represent recorded overlapping stations, keep the full assembly viewport, label it **Assembly drawing**, and rely on the section table/station readout. Do not claim that an inaccurate cut-down mesh is the aero model.

### Narrow, about 390 × 844

The current Workstation hides the left panel below 1100 px and the inspector below 820 px on first mount; that alone is not a narrow-layout solution. Reflow the same existing regions into a single column, with the existing StageRail buttons in a horizontally scrollable row above the content. Existing Parts/Inspector toggles expand their region in normal document flow; they must not add a 250/320 px side column or an overlay requiring another viewport.

```text
+--------------------------------------+
| Astraea  [Parts] [Inspector] [Run]    |
| Beta · model disclosure              |
| Existing pipeline navigation         |
+--------------------------------------+
| Airframe · Preview / Applied         |
| Parts [expanded by existing toggle]  |
| Nose            S   In B2 view       |
| > Booster1 body B1  In B2 view       |
| Booster2 body   B2  In B2 view       |
| [Add part]                           |
+--------------------------------------+
| Assembly drawing, compact height     |
| Editing: Booster1 body               |
+--------------------------------------+
| Stage composition | Mass | History   |
| Read-only · from preview sections    |
| [Booster2*] [Booster1] [Sustainer]    |
| S + B1 + B2                          |
| Full stack · first flown             |
| Reference area     <value + unit>    |
| Reference length   <value + unit>    |
| Body wetted area   <value + unit>    |
| CP                 <value + basis>   |
| Entry mass / CG    <value + source>  |
| Active motor      Booster2 / N1048   |
| > Sections used                      |
| > Model adjustments · 1              |
| [View in Aero] [View in Flight]       |
+--------------------------------------+
| Inspector [expanded]                 |
| Booster1 body · Section: Booster1    |
| Flies in Booster2 and Booster1       |
| Length [value]  ...                  |
| [Apply staged edits] [Discard edits] |
+--------------------------------------+
```

The dock becomes normal-height content at narrow widths; do not trap a long form in a 120 px scroll area. Use the same three named tabs, with the stack equation below the selected tab if subtitles do not fit. Preserve full accessible names, 44 px touch targets, and no horizontal page scrolling. The dock's destination-tab row may scroll horizontally with a visible affordance; selected content stays readable at 320 CSS px and 200% text zoom.

### Warnings, empty and unsupported states

```text
+-- Stage composition · read-only --------------------------------+
| Booster2 · Not included in this flight                          |
| Defined stack preview: Sustainer + Booster1 + Booster2           |
| This stack will not be used by the current flight.               |
| [Review include flags in Flight]                                |
+----------------------------------------------------------------+
| Junction adjusted · Booster1 follower body                      |
| Entered diameter <x>; model diameter <y>, inherited at junction. |
| [Select source body]   > Model adjustments                       |
+----------------------------------------------------------------+
| Stage aero unavailable · Booster2                               |
| Booster2 is included but Booster1 is not.                       |
| Complete the stage sequence in Flight.                          |
| [Review include flags]     Run simulation [unavailable]          |
+----------------------------------------------------------------+
| Stage aero unavailable · Booster1 and Booster2                  |
| Freeform fins on Booster1 have no mapping in this aero provider.|
| Source geometry is preserved. [Select Booster1 fins]            |
+----------------------------------------------------------------+
| No stage composition yet                                       |
| Add a nose and body, then assign the source sections.           |
| [Open Parts]  (uses the existing Add part menu)                  |
+----------------------------------------------------------------+
| Composition details unavailable for this stored run             |
| This record predates stage-composition provenance.              |
| [View saved inputs] if captured; otherwise no reconstruction.   |
+----------------------------------------------------------------+
```

For a valid single-stage file the empty state is never “Add boosters.” Show S's composition. With a missing engine, show source membership if it is explicit, but all unevaluated model metrics read N/A and all engine-dependent actions explain the unavailable backend.

## 5. Interaction flows and state matrix

### Editing and structural flows

1. **Inspect while editing one section.** Select B1 body in PartsTree. PartInspector says “Flies in Booster2 and Booster1.” Open Stage composition; default/retain B2. Edit Length through the existing staged airframe workflow. Recompute preview B1/B2 geometry; S geometry stays unchanged. The panel reads “Preview — staged edits; not used by the last run.” Apply updates the applied design; Discard restores it. Either action leaves tab selection independent. A flight remains blocked while the airframe draft is pending, as today.
2. **Add a booster using source sections.** Extend the existing Add part/PartInspector workflow, not a stage-view “Duplicate geometry” action. A body/transition/fin remains its existing component type; its source section/attachment identifies B1 or B2. Default new parts to the explicitly selected source owner, visibly labeled, never to the inspected flown view. An empty booster grouping/incomplete shoulder-body mapping is inspectable but not runnable. Do not auto-copy B1 into B2 or borrow its motor/mass/CG.
3. **Remove a booster.** Removing individual source parts remains undoable; an incomplete booster creates a repair issue. Remove B2's source group to obtain S+B1. Removing B1 while B2 is still present leaves an explicit invalid chain; no automatic relabeling of B2 as B1. Keep B2 editable so it can be removed or correctly reattached. Do not add a hidden cascade delete.
4. **Change include flags.** In FlightInspector, “Include Booster2 in this flight” removes/adds its planned phase without deleting source geometry or stage input values. Turning B1 off while B2 remains on is an inline refusal state until corrected; do not silently toggle B2. Excluded geometry stays visible with “Not included.” On re-enable, restore that slot's own saved values and revalidate them.
5. **Reorder a source part.** Use existing Move up/down buttons. Preserve owner identity. Reordering within a valid group rebuilds affected views; moving across a stage boundary does not silently reassign ownership. An unrepresentable order receives a precise inline issue and blocks the affected model/run. Existing structural restrictions under type filters still apply. Never reorder the flight sequence by dragging composition tabs.
6. **Follow a result link.** “View in Aero” retains inspected stage and selects the relevant existing dock content. “View in Flight” navigates to the same stage's recorded interval if the run actually contains it; otherwise opens readiness with “No current flight for this stage view.” A link never applies pending edits or starts a simulation.

Section ownership/attachment editing is a required source-schema extension to PartInspector, not a per-view include checklist. Existing files with no ownership metadata resolve as S only; ambiguous imported/partial staged data must be repaired explicitly.

### Flight-input flows

FlightInspector owns the effective per-slot launch mass, CG, aero nozzle diameter and applicable delays; MotorStage owns motor selection/curve editing. The composition panel links to these controls but cannot change them.

Use **Mass at Booster2 stage start — full retained stack**, not “Booster2 mass,” and **CG from common nose datum**. The synthetic fixture enters 61 lb for B2 and also 61 lb for B1, then 22.79 lb for S. The engine consumes these records independently; it does not sum them to 144.79 lb. Flag any physical consistency issue supported by the mass contract, but never repair evidence by silently changing a value. A full 6-DOF staged rollout also needs supported retained mass/inertia and state transfer; matching aero does not supply these.

Name delay semantics explicitly: **Sustainer ignition delay — after sustainer stage entry**, **Booster1 ignition delay — after B2 handoff**, and **Booster1/Booster2 separation delay — after that slot's motor ends**, per the resolved engine policy. A sole first flown slot starts with its resolved initial ignition condition. Where source include rules force its effective delay to zero, show source versus effective delay and preserve the entered value. There is no editable B2 ignition-delay field under the evidenced contract.

Motor mount assessment must be scoped to the motor's physical owner/seat, not the whole cumulative stack: the current `assessMounts` would call two valid stage mounts ambiguous. Do not enable staged flight until per-slot mount binding and retained upper motors are resolved.

The aero nozzle entry is not automatically the computed exit diameter in `ChamberNozzlePanel`. That panel is a sizing tool today. This proposal adds no implicit “apply chamber result” binding.

| Action/state | Editable source | Read-only consequence | Admission and recorded-result behavior |
|---|---|---|---|
| Select stage tab | Nothing changes | Retained list, outline and stage metrics change | No run, input-key change, staleness, or undo entry |
| Edit S/B1/B2 geometry | Original part fields only | Rebuild respectively S+B1+B2 / B1+B2 / B2 views | Draft blocks run; applying changes invalidates dependent results |
| Edit a part's weighed mass/CG | Original part/source mass inputs | Geometry membership/reference metrics unchanged; recompute applicable mass rollup | Flight identity changes if effective mass properties depend on that entry; show binding rather than guessing |
| Change stage launch mass/CG | FlightInspector for named slot | Geometry unchanged; entry state/margin basis changes | Re-run required; never spread this mass over geometry behind the user's back |
| Change motor or curve under same ID | MotorStage with explicit target slot | Geometry membership unchanged; carried mass/active propulsion context re-resolved | Content-based freshness changes; downstream trajectory is stale |
| Change nozzle | Named slot in FlightInspector | Geometry membership/reference area/length unchanged; powered/base-drag result may change | Aero/flight dependencies invalidate; no reuse of B1 nozzle for B2 |
| Change delay | Applicable named field in FlightInspector | Planned phase timing changes, geometry does not | Flight stale; B2 ignition remains fixed/non-editable |
| Exclude B2 / exclude both boosters | Flight include flags | Planned list becomes B1→S / S; source retained | No automatic deletion or mass rescaling; current whole-flight result stale |
| Include B2 without B1 | Flags remain repairable | Invalid chain clearly shown, no valid B2 metrics | Disable staged run everywhere; do not fall back to B1 |
| Buried equal-diameter shoulder | Original shoulder length/station remains editable | Zero shoulder area/length; follower station preserved | Informational adjustment; runnable if all other contracts support it |
| Supported stepped transition | Original transition dimensions | Show effective running diameters, per-view metrics | Allowed within provider support; otherwise explicit refusal |
| Unsupported fin/layout/order | Source parts and repair controls | Membership may be known; model quantities N/A in affected views | Whole flight refused if any required view is unsupported; unaffected S can still be inspected |
| Engine unavailable / evaluation pending | Source edits remain possible | Membership-only or “Calculating…”; no last-answer masquerading as current | No engine-dependent run; stale async responses cannot replace newer input results |
| Stored run differs from current design | Current source stays editable | Flight shows immutable recorded stack/input basis | Current preview and recorded values labeled separately; no mixed-context delta |
| Calibration present after composition/provider change | Retain calibration artifact as history | Show inactive reason via existing calibration applicability surface | Do not apply a legacy whole-airframe scale to new stage views without an explicit supported policy |

“Disable run” applies to TopBar, keyboard shortcut, palette, automatic startup, nominal flight, live preview, ensemble, and evidence comparison dispatch, not only the visible Flight button. Editing/saving the source design remains possible.

Only issues affecting included views and their required inputs block the current flight. A missing motor or incomplete geometry in an excluded booster remains visible on its defined-stack preview and is revalidated on inclusion; it does not prevent an otherwise supported S-only flight.

## 6. Data model and frontend architecture

### Source and derived contracts

The following are proposed contract names, not existing exports. Extend the source schema minimally: original parts retain IDs; stage ownership, booster attachment/shoulder relationship and recorded axial stations belong to the vehicle. Flight inclusion and propulsion/mass/timing bindings belong to the flight case. There are no persisted stage-specific copies of `RocketVehicle.components`.

If upstream records distinguish design-level `UseBooster*` and case-level `IncludeBooster*`, preserve both meanings. The effective plan uses only defined/enabled/included stages. Do not collapse them on load or create two synonymous UI switches: the source definition is explained in Airframe, and flight inclusion is edited in Flight. A contradiction becomes a repair issue with both sources shown.

| Proposed type | Required content |
|---|---|
| `FlownStageId` | `sustainer` / `booster1` / `booster2`, distinct from Console `StageId` |
| Source section metadata | Owner on each source component; explicit parent/attachment; station and units/datum when not sequential; one authoritative mapping |
| Stage flight input | Owner slot, inclusion, full motor-content binding, full retained entry-mass/CG basis, nozzle binding, applicable ignition/separation delays and their policy |
| `StageComposition` | Schema/policy version, source identity, input state, all defined views, ordered included flight sequence, issues |
| `StageView` | Stage ID, ordered retained owners and source IDs, source-to-model mapping including merged parts, normalized model chain identity, effective reference quantities, model adjustments, aero support and flight-input status |
| Source-to-model entry | Source ID(s), model element ID(s), owner, station, effective dimensions, contribution status/reason; buried shoulder may have no aero element but still has position provenance |
| Quantity availability | Available engine value with units/basis, or unavailable with reason; no invented numeric sentinel for missing area/CP |
| `CompositionIssue` | Stable code, severity, affected views/source IDs, plain message, repair destination/field; unsupported feature distinct from invalid input and transport failure |
| Recorded stage usage | Ordered stage IDs, retained source IDs, normalized chain/flight-input identities, entry/exit events and clocks, provider/normalization policy versions, engine identity |

Separate cache identities for geometry, aero evaluation context, and flight inputs. Geometry identity includes effective chain/stations; aero evaluation also includes provider, finish/flow inputs where supported, nozzle/power state, Mach/incidence/atmosphere. The complete run key covers all source geometry/ownership, inclusion, every resolved motor's content, stage mass/CG/nozzles/delays, environment, calibration applicability and composition policy. A source edit that normalizes to the same model may keep the geometry cache, but its source provenance and complete case identity must still be updated.

### Derivation ownership and consumers

```text
useProjectStore source vehicle + case stage inputs
                |
       preview merge OR applied snapshot (explicit)
                |
src/application/stageComposition.ts                 PROPOSED application API
  validates source relationships; requests canonical engine composition;
  returns source-linked StageComposition + issues, never editor state
                |
src/tauri/bridge.ts -> existing worker/engine invocation boundary
                |
crates/astraea-engine: one authoritative normalization/composition adapter
  load-time junctions -> cumulative chains -> metrics + mapping + identity
                |
      +---------+------------------+------------------+
      |                            |                  |
Airframe/Aero selectors      caseResolver/preflight   recorded flight
read-only presentation      + immutable run inputs   + stage usage/events
                                                     |
                                              Flight/Verify/Build
```

`stageComposition.ts` is the proposed application-layer builder/facade. It belongs beside `caseResolver.ts`, not inside Airframe, PartInspector, or a React hook. Its engine-independent selectors may derive explicit source membership; they must not claim normalized dimensions, area or CP before the engine returns them. The engine adapter implements model normalization once and is shared by preview, aero evaluation and flight preparation.

Proposed selectors: `selectStageView(composition, stageId)`, `selectPartStageMembership(composition, componentId)`, and `selectCompositionIssues(composition, scope)`. They select from canonical output; they do not rebuild physics.

Presentation props should carry `composition`, `selectedFlownStageId`, `selectedPartId`, `inputState`, `onInspectStage`, `onSelectSourcePart`, and `onOpenDestination`. Geometry setters are absent from the composition renderer. Extend the existing session store with the inspected stage/dock destination only; project inputs remain in `useProjectStore`.

Integration boundaries:

- `src/core/types.ts` owns source vehicle/component metadata; `src/formats/projectJson.ts` owns explicit versioned persistence and migration.
- `src/console/hooks.ts` uses the preview vehicle for Airframe/Aero composition. `PartsTree` currently reads applied geometry while PartInspector/viewport use the draft merge; a composition preview must show the same preview IDs/values in all three. Resolve that existing seam for this feature.
- `src/application/caseResolver.ts` extends resolution/admission and immutable snapshots to the complete staged case. `src/application/runInputs.ts` captures the exact dispatched stage plan and original inputs; `runCases.ts` archives it.
- `src/console/data/contract.ts` gains the presentation/recorded-usage contract; `adapter.ts` projects native values and factual confidence without another aero calculation.
- `useStability`, `AeroControls` and `StabilityStrip` cannot continue reading a single unscoped vehicle for a stage-scoped number. In the new path, supply the stage view and show its label/basis. Keep any legacy geometry-only preview explicitly separate until replaced.
- `FlightTimeline` consumes native interval/event identities. At a handoff the new geometry becomes active at the engine's recorded boundary; coasting retains its current stack until separation. Do not infer separation from thrust reaching zero or from the selected inspection tab.
- `FlightPose` currently renders the committed full vehicle. A staged pose must use the run's frozen retained mapping and stations. Historical single-stage poses retain their current behavior; detached booster trajectories are outside this design.

### Keeping Rust and TypeScript identical

Prefer **one runtime normalization authority in Rust**, returned over the current coarse-grained worker bridge. TypeScript formats and selects the returned DTO; there is no runtime TS aero/normalization fallback. Share a versioned wire contract and frozen fixture outputs with the research TS oracle.

Implementation verification must compare stage sequence, ordered source mapping, normalized dimensions/stations, omitted shoulders, reference quantities and canonical chain identities for the same source fixture. Cover S, S+B1, S+B1+B2, buried/non-buried shoulders, junction normalization, nonzero nozzle/delays, exclusions and refusals. Use the engine's actual numeric conventions and SI boundary; rounding is presentation only. Do not approve “same UI value” as parity.

At dispatch the engine rebuilds/resolves from the captured source or verifies the canonical prepared-plan identity. It returns the exact views it used. Mismatched policy/version/identity is an explicit refusal, never an invitation for Flight to substitute a locally reconstructed chain. Native and production WASM use the same adapter and fixtures; an oracle test alone is insufficient.

Cancel or ignore superseded evaluations by content identity and project epoch, following existing project/job guards. Do not keep hidden extra Airframe/Aero viewports mounted; Workstation deliberately unmounts inactive destinations to release GL contexts.

### Refusal and provenance

Aggregate issues in RunReadiness, repeat the relevant issue at its source field and stage tab, and preserve full details in recorded failures. Use typed issue categories such as missing stage dependency, unsupported layout, unrepresentable discontinuity, invalid stage input, provider unsupported, and composition identity mismatch. Do not expose implementation stack traces as product instructions.

Results record composition schema/policy version, provider/engine identity, complete case identity, per-view effective geometry identity, source IDs/adjustments, stage-input identities, and actual boundary events. Use existing `engineIdentity`/`inputKey`/manifest conventions. A new composition-policy version invalidates the relevant cached/current result even when the user did not edit geometry; historical records stay immutable.

## 7. Microcopy, accessibility and responsive behavior

| Situation | Recommended copy |
|---|---|
| Panel title | **Stage composition** · Read-only |
| Full-stack heading | **Booster2 — full stack** / Sustainer + Booster1 + Booster2 |
| Shared section | “Booster1 body flies in Booster2 and Booster1. Edit this section once.” |
| S selected while editing B2 | “This section is not part of the Sustainer view. Your selection is unchanged.” |
| Buried shoulder | “This shoulder sits inside the adjoining stage. It keeps the follower's position and adds no exposed aero area or reference length.” |
| Junction normalization | “The aero model uses <value> at this junction, inherited from the preceding section. Entered value: <value>.” |
| Stage entry mass | “Full retained stack at the start of this stage, including carried motors. This is not the booster section's mass alone.” |
| Preview draft | “Preview from staged edits. Apply or discard before running.” |
| Applied geometry, old flight | “Composition is current. Flight rN used earlier inputs.” |
| Missing stage mass | “Booster2 stage-start mass is missing. Enter it in Flight to run this stack.” |
| Unsupported provider | “This aero provider cannot represent <feature> in <section>. Stage aero is unavailable.” |
| Missing historical provenance | “Stage composition was not recorded for this run.” |
| Correlation evidence | “Compared with the reference engine for this fixture. Not a comparison with a measured flight.” |

Accessibility requirements:

- Use a labeled tablist/tab/tabpanel pattern for flown-stage tabs, following the Radix tabs already used by `WithDock`. Left/Right and Home/End move between tabs; activation is predictable and never triggers a simulation. Distinguish dock navigation from flown-stage inspection in accessible names.
- Keep PartsTree's current roving focus, arrows, Home/End and real move/remove buttons. Badges are text annotations, not nested tab stops. Announce owner plus membership through the row's accessible description, not color alone.
- Selecting a source link focuses the original row/inspector heading. If a name/type filter hides it, reveal that target with a visible explanation and an accessible focus destination; do not silently select an invisible row.
- Use definition lists for summary metrics and semantic tables with headers/captions for source mappings. Explanations must be available on focus/expansion, not only hover tooltips.
- Source-selection actions in a table must be real focusable buttons/links inside cells; the existing `DataTable` row-click callback alone does not provide keyboard activation.
- Announce a completed preview update once via a polite status, e.g. “Booster1 and Booster2 previews updated.” Do not announce each keystroke, each telemetry sample, or every area cell.
- Reserve alerts for a new actionable refusal; include a focusable repair link next to a disabled Run button. Native disabled controls cannot be the only place the reason is discoverable.
- Maintain separate owner badge, current selection and action-needed cues with text/icons and sufficient contrast. Support reduced motion; geometry dimming/outline must not be required to understand membership.
- Preserve keyboard dock resizing and give separators accessible min/max/current values. Narrow layout uses one vertical reading order; focus must not jump when preview updates.
- Escape in a number field keeps its current local meaning. Tabs and read-only disclosure must not introduce an Escape handler that discards staged geometry.

## 8. Validation and evidence surfaces

Use the existing Aero dock for per-view comparison detail, Verify's existing validation area for evidence review, and the existing Build `ModelStatusPanel` for model limits/provenance. Keep engine correlation visually and verbally separate from Verify's real-flight log comparison. Do not assign `calibrated` confidence merely because a research function is named “calibrated.”

Each comparison row needs: fixture identity, view name and retained stack, provider/policy/engine versions, reference and port values, signed/absolute difference, observable, Mach/alpha/altitude, power/nozzle state, reference area/length and source data identity. Use **Not compared** for missing coverage rather than a green overall status.

| Evidence scope | What can be shown now in this design | What remains unestablished |
|---|---|---|
| B2 static point | Test pins Cd `1.3783354842847663` and Reynolds `1,149,429` with Barrowman at Mach 0.01, alpha 0°, altitude 0 ft, nozzle argument 0 | Not the launched flight's pad conditions; not all Mach/incidence combinations |
| B1 and S static comparison | Separate rows with fixture/context identity when supported artifacts exist | The supplied three-stage test does not establish complete per-view curves for both |
| Three-stage trajectory | Source dump peak altitude `284,620.6 ft` at `163.9974 s`; max velocity `4,496.59779268606 ft/s`; sampled S entry `32.29055 s` | Not an independent physical flight; rounded test constants differ from raw dump precision |
| Corrected port residuals | Task-provided 0.010% apogee, 0.0001% max velocity, 0.035% TTA, 0.010 s handoff difference, clearly attributed | Not recomputed by this design task; not a new test result or all-stage qualification |
| `aero-plots.csv` | Mach/alpha/CD/CP/Re curve source; 7,499 data records, alpha 0/2/4°, Mach 0.01–25.0 across the file | No stage, fixture or atmosphere metadata columns; do not assign it to B2/B1/S based on its filename |

The flight dump uses `B` for **both** boosters. Inspection found stage-clock reset/next-row markers at `16.15027 s` for the second booster interval and `32.29055 s` for S. New results must carry unique stage IDs and actual transition metadata; these CSV sample times alone must not be relabeled as exact separation roots.

The local file described in the task as 30,785 rows contains **30,785 CSV records including its header: 30,784 data records**. Count conventions belong in evidence detail, not the primary editing UI.

Research test tolerances are also not measured residuals: the inspected test requires <0.05% apogee, <0.01% velocity, <0.1% TTA and <0.02 s final handoff difference. Keep those assertions distinct from the supplied tighter observed numbers. No test was rerun for this document.

### Source inventory and review basis

Local-only sources; paths below use checkout-relative names or home-relative evidence roots so they do not depend on a particular workstation username.

| Source | Design implication |
|---|---|
| `src/console/stages/{Airframe,Aero,Flight,FlightTimeline,Build,Verify}.tsx` | Existing dock, input/result split, timeline, gates and trace destinations |
| `src/console/{Workstation,hooks,store,design}.ts(x)`; `shell/{PartsTree,Inspector,RunReadiness,Shell}.tsx`; `kit/{Fields,Value,Status,Table,units}.ts(x)` | Existing selection, drafts, panel widths/toggles, accessible tree, status, confidence and units |
| `src/application/{caseResolver,runInputs,runCases,flightModel,calibrationApplicability}.ts`; `src/core/types.ts`; `src/console/data/{contract,adapter}.ts`; `src/tauri/bridge.ts` | Single-motor/source-schema gaps, snapshot identity, provider distinction, Rust runtime authority |
| [Aero provenance](aero-provenance.md), [output dictionary](output-dictionary.md), [workflow audit](workflow-audit-2026-10-24.md), [preview readiness](preview-readiness.md), [engineering changelog](engineering-changelog.md) | No parity-to-accuracy promotion; historical result/input limits; output-specific bases; separate candidate and legacy paths |
| [Normative physical contract](astraea-normative-physical-contract.md), [roadmap](roadmap-to-collegiate-1.0-2026-10-26.md) | Explicit datums, mass/inertia identity, unsupported states, and evidence-backed release scope |
| Research `src/aero/calibrated/fromVehicle.ts` | Junction normalization, merged body runs, mapping limits, cumulative booster append and buried-shoulder omission |
| Research `src/aero/calibrated/{normalForceSubsonic,dragSubsonic,design}.ts` | Reference area/length definitions and body-wetted versus fin contributions |
| Research `src/validation/flights/calibrated-three-stage-engine.test.ts` and `extract/native-runs/three-stage/aeropac-3stage.CDX1` | Cumulative test construction; synthetic source stage geometry and independent flight-input slots |
| Research `docs/re/engine/flight-descent-staging.md` and `src/validation/flights/calibratedFlights.ts` | Full retained entry weight/CG, stage ordering, motor bindings, include/delay semantics; old symmetric B1-reuse helper is not evidence of correct real B2 geometry |
| `~/rasaero-official/native-acceptance/{3stage-flight,aero-plots}.csv` | Read-only record/header/range/transition inspection described above |

Research checkout root is `~/rasaerodecomped-3stage`. Source/evidence SHA-256 identities inspected on the date above:

| Artifact | SHA-256 |
|---|---|
| `fromVehicle.ts` | `8286aee474625966678118abedf618c708b359abd994c98cce238a120f9f3cf9` |
| `calibrated-three-stage-engine.test.ts` | `d6bed1759d233ed2cf1daa2107c426f94800f6dad69a3af01ae3e6fb7ad5a05d` |
| `aeropac-3stage.CDX1` | `9db89232139929c5513a210902e49240d517c1f31ecd9e138b3acd50cc21fe10` |
| `3stage-flight.csv` | `2a08e4110a1f8f835c9dfad496fae469f1d890d7c9297fd53251cb4576292136` |
| `aero-plots.csv` | `2524ae15edf0fa8978cf3e1b9f7041c570da10360b180da40a00aa734ba890b6` |

Do not surface those private filesystem locations in normal product flows or redistribute raw research material in an export. A public-facing evidence summary requires its own source/rights review; this task publishes nothing.

## 9. Phased rollout, migration and non-goals

| Phase | Deliverable within existing surfaces | Gate before progressing |
|---|---|---|
| 1 — Read-only preview | Source ownership/attachment contract, membership badges and Stage composition dock. Single-stage files show S. Explicit staged inputs can show retained lists and supported native metrics | No output is labeled “used by flight” unless recorded. If stage-aware runtime is absent, included multistage inputs refuse flight instead of using one whole-vehicle legacy pass |
| 2 — Stage-aware Aero/Flight | One canonical builder/provider path supplies per-view aero, per-slot mass/motor/nozzle/timing, native stage events and immutable stage-usage records | Native/WASM/oracle fixture parity; complete staged mass/inertia and state-transfer contract; all secondary run/admission consumers covered; provider/physical qualification remains separately stated |
| 3 — Reports and validation | Stage-aware Build trace, SavedRuns context, stage-qualified Verify evidence/comparisons, reproducible captured staged inputs | Reopen/replay preserves exact plan and identities; no historical provenance backfill; clear distinction between engine correlation and measured-flight validation |

Phase 1 may begin as membership-only for staged inputs until the canonical normalizer is available. Do not ship a temporary UI calculator for area/CP and later treat its numbers as engine results. Rollout must use the existing flight-model boundary: keep legacy/candidate behavior and existing explicit selection intact; do not add a speculative model toggle or silently swap the default engine.

Migration requirements:

- Existing untagged `components` map to S for presentation without numerical changes to the legacy source or retroactive changes to old run keys. Treat absent ownership as the S-only view default; opening that view must not write new source fields or change the legacy canonical serialization. Explicit staging uses the new versioned contract. Do not infer boosters from part names, mass entries, motor-mount count or array length.
- Introduce a versioned source/case/record contract only when staged inputs are implemented. Preserve original IDs, values, ownership, stations, disabled definitions and excluded-slot inputs on save/open/undo/redo.
- Keep old results and archives readable. Missing composition usage is **Not recorded**; never reconstruct a historical stage stack from today's edited vehicle.
- If an old archive captured complete inputs, a user may inspect those saved inputs through the existing SavedRuns flow; deriving a new preview must be marked as a new derivation, not the original run's provenance.
- Unknown stage/policy schemas fail closed without discarding or replacing the open document. Future staged keys are versioned; no silent reinterpretation of historical single-stage keys.
- Existing ORK/RKT and CAD export limits remain. Project save can preserve the staged source, but an exporter must disclose or refuse staging/ownership/station information it cannot preserve. Do not flatten multistage geometry into a reassuring “successful” interchange round trip.
- Preserve calibration artifacts as history and re-evaluate applicability against the complete plan/provider. No inherited per-stage drag overrides are created.

Non-goals: aerodynamic equation changes or tuning; per-stage geometry overrides/copies; arbitrary stage counts, strap-ons, clustered motors or parallel staging; a generic CAD exposure/intersection solver; detached-booster recovery/trajectories; deriving trustworthy inertia from launch mass/CG alone; a new CDX1 import/export feature; motor-sizing-to-flight auto-binding; new empirical accuracy claims or changes to qualification thresholds. This document does not reopen the roadmap or authorize implementation.

## 10. Acceptance criteria and open decisions

These are design/implementation review criteria, not claims that product acceptance has run.

| ID | Observable acceptance criterion |
|---|---|
| UX-1 | In the 1280×800 design, a user editing B1 body can see “Section: Booster1,” “Flies in B2/B1,” and “Booster2 = S+B1+B2” simultaneously without opening another screen |
| UX-2 | Switching B2/B1/S never creates geometry, changes source ownership/include flags, marks the project dirty, starts a run, or adds an undo entry |
| UX-3 | S appears in three views through the same source IDs; an S edit updates all relevant previews once; B2 geometry edits leave S/B1 geometry unchanged |
| UX-4 | A buried B2 shoulder is still discoverable, explicitly reports zero shoulder area/reference-length contribution, and retains follower station 126.75 in in the fixture |
| UX-5 | Reference length is not replaced by max aft station: the fixture can display 194.25 in counted length and 188.75 in aft station with a plain explanation |
| UX-6 | Source/effective junction values are inspectable; an unsupported physical step or generic flat transition is never silently presented as the buried-shoulder case |
| UX-7 | Entry mass/CG labels describe the full retained stack and datum; 61/61/22.79 lb are never summed as section masses; motor/nozzle/delay edits target a named slot |
| UX-8 | Invalid B2-without-B1, unsupported fin/layout, missing inputs and engine failure have inline reasons and repair links; every run path shares the refusal, with no B1 fallback |
| UX-9 | Draft preview, applied composition and recorded flight are clearly labeled; stage/result links never mix their values, auto-apply edits or reconstruct missing historical provenance |
| UX-10 | Narrow layout supports the same tasks and keyboard/screen-reader access at 320 CSS px/200% text zoom, without three simultaneous side columns, clipped essential labels or color-only membership |
| ARCH-1 | Application/engine composition is shared by Airframe, Aero and Flight; no renderer constructs a separate normalized chain or owns geometry setters |
| ARCH-2 | Rust, production WASM and TS-oracle fixtures agree on IDs/order/stations/adjustments/metrics/refusals; runtime reports the prepared views actually used |
| ARCH-3 | Effective geometry, motor content, inclusion, stage mass/CG/nozzle/delays and policy/version changes invalidate the appropriate result identities; tab/unit changes do not |
| EVID-1 | Per-stage comparison lists missing coverage, reference area/length and evaluation context; tighter task-reported residuals, test thresholds and empirical validation are not conflated |
| HIST-1 | Existing single-stage files/results remain readable with old identities; new staged save/open/undo/export retains source and recorded-plan provenance or explicitly refuses unsupported interchange |

Recommended usability review: ask a rocketry user to identify what B2 flies, edit a sustainer fin once, inspect its effect in B1/B2, explain a buried shoulder, exclude B2, and find the motor/mass used by the last recorded B1 interval. Record misunderstandings and task completion; do not substitute a screenshot review for those tasks.

Open decisions, with recommended defaults:

| Question | Recommendation / dependency |
|---|---|
| What exact source schema carries stage ownership and shoulder/attachment stations in Astraea? | Add explicit metadata to existing component/vehicle types, preserve IDs and nose datum; settle this before phase 1. Do not infer from type/order/name alone |
| How do upstream design-level enable flags relate to case include flags? | Preserve both if supplied; expose only the case include edit in Flight, explain source availability in Airframe, refuse contradictions |
| Which provider is eligible for staged Aero/Flight? | Resolve through the existing explicit model boundary; require its complete layout and mass/dynamic contract. The research helper is evidence, not a shipped provider selection |
| What does the native API expose for wetted area and per-stage CP? | Report body-wetted subtotal and fin scope explicitly, with evaluation conditions; use N/A until available. Do not derive from viewport geometry |
| When is a normalization difference a warning versus a refusal? | Expected engine junction adjustment is visible information; a declared exposed feature that cannot survive mapping is a refusal. Freeze exact provider rules with fixture cases |
| What constitutes a physically consistent sequence of entry masses/inertias? | Keep independent full-stack inputs with explicit basis; define supported mass conservation/depletion and inertia checks before enabling phase 2. Do not invent a tolerance in the UI |
| What exact clock starts each delay, and what changes when a slot becomes first flown? | Use the versioned engine plan's effective timing; show source/effective differences. No guessed or newly invented B2 ignition parameter |
| Can the existing viewport lay out all native absolute stations and overlaps? | Use assembly drawing plus station table until it can. Accurate stage-filtered flight pose is a separate phase-2 gate |
| Is the three-stage case adequate evidence for broader staged support? | No. Keep synthetic engine correlation bounded and require additional geometries, nozzle/power conditions and independent flight evidence for expanded claims |

Document completion is limited to this proposal. Source inspection, read-only CSV inspection and source-derived reference examples informed it; no product code, simulation run, build, behavioral change, commit, push or network access is part of this task.
