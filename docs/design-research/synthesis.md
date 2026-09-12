# Synthesis — commercial-grade design research for Astraea

Coordinator-owned integration of the four lane studies, the Muse review, and
the accepted rework. This is a research deliverable, not a design direction,
not a production-readiness claim, and not a user study.

## 1. What this package contains

| File | Content |
|---|---|
| `brief.md` | Binding scope, evidence format, ownership, review gates |
| `evaluation-method.md` | Evidence ladder, review criteria, severity, accessibility references and limits, prototype comparison protocol |
| `cad-study.md` + `evidence/cad/` (22 images) | NX, Onshape deep; CATIA partial; Creo screened; 6 workflows |
| `simulation-study.md` + `evidence/simulation/` (11 images) | STK, SDI deep; Mechanical invalidation deep-study; STAR-CCM+ screened; 4 workflows |
| `operations-study.md` + `evidence/operations/` (15 images) | Foundry-family, Seeq deep; PI Vision deep-lite; Grafana screened-light; 9 workflows |
| `astraea-audit.md` + `evidence/astraea/` (15 screenshots, 6 fixtures) | Live 8-task audit of main `d79dbe8` + labeled frontend-worktree deltas |
| `review.md` | Muse verdicts: all lanes revise-minor; 7 rework items, all applied and accepted |
| `orchestration.json` / `source-baseline.json` | Lifecycle provenance; 193 protected-file hashes confirming no source edits |

Screened 12 candidates; deep-studied 6 products (NX, Onshape, STK, SDI,
Foundry-family, Seeq) plus two bounded deep-studies (Mechanical invalidation,
PI Vision). No hands-on CAD/simulation licenses were available; Grafana Play
and the running Astraea app were exercised live. Every claim carries its
method label; see `review.md` §4 for the contained edge cases.

## 2. Strongest transferable patterns (consolidated)

Adopt — proven in primary sources, maps directly onto an Astraea task:

1. **Type-tiered selection filter + scope + three-state highlight** (NX
   CAD-001–005). A filter bar (entity type × vehicle/stage/subassembly scope)
   with candidate/selected/action-needed coloring shared across every edit
   tool — the precision interaction Astraea's assembly picking lacks.
2. **Workspace/version/branch/merge with per-section strategy + explicit
   revert** (Onshape CAD-012/014, Foundry save/versioning OPS W-3/W-4).
   Named immutable versions, parallel design lanes, Keep/Merge/Replace per
   stage, and a revert affordance that visibly expires. This is the model for
   "current design vs the snapshot that produced a result."
3. **Two-point compare with difference list + blend slider** (Onshape
   CAD-016, SDI §6, Seeq W-6). Add/remove/modify rows plus a visual blend
   between states; one-click "compare vs last saved."
4. **Edit buffer with explicit commit/cancel + rollback/suppression**
   (Onshape CAD-017/019). Pending-edit badges, check/X commit boundary,
   non-destructive stage suppression — replaces silent mutation.
5. **Scenario-as-context-root: time, units, environment set once, inherited,
   locally overridable** (STK SIM-EVID-001/002). A mission workspace instead
   of disconnected calculators.
6. **Inspect/Compare as sibling panes; run archive with current-run promotion;
   checkbox signal layering** (SDI SIM-EVID-006). The run-inspection layout.
7. **Four-stage compare contract: align → sync → interpolate → tolerance,
   with band + signed difference + pass/fail strip + out-of-tolerance
   navigation** (SDI SIM-EVID-004b/005/007). A comparison must explain how it
   was constructed; unaligned signals must say so, not render a wrong number.
8. **Auto-invalidation with visible reason + one-click re-run; old results
   kept only behind explicit action** (Mechanical SIM-EVID-013, corrected
   against STK's manual-F5 and Mechanical's silent-delete — both rejected as
   shipped). This is the single most portable lesson.
9. **Snapshot export vs live view duality, honestly labeled** (STK
   SIM-EVID-002/003, Seeq Organizer W-7). Exports freeze; live views
   re-evaluate on open with a freshness marker.
10. **Selection as first-class persistable state; cross-pane time cursor;
    relative-time overlays** (Foundry Quiver W-1/W-2, PI Vision W-8, Seeq
    W-5/W-6, Grafana URL variables W-9). Clicking a chart region materializes
    a named selection downstream views consume; cursors synchronize across
    plots; repeated runs align at t0.
11. **Dual time model (context window + focus window) with mini-map**
    (Seeq W-5). A session window plus per-view windows.
12. **Side-effect-free replay; report rows navigate back into simulation
    time; named camera+time views** (SDI, STK SIM-EVID-003).
13. **Data-maturity/health dashboard with explicit states** (CATIA B.I.
    CAD-020, adapted). Per-component state (in-work/frozen/released) plus
    conflict flags — mapped onto Astraea's existing health concepts.

Adapt — good idea, wrong shape for Astraea:

- Restart-point replayability markers → simulation checkpoint markers with a
  legend (SIM-EVID-013).
- Multi-phase setup snapshots in one project file → design spike only, no UI
  evidence to copy (STAR-CCM+ SIM-EVID-014/016).
- Save-conflict dialog and non-destructive restore semantics (PI Vision,
  Grafana, Quiver) → Astraea's own versioning/approval workflow.
- In-context embedded guidance (Seeq Simulation-Guide analog) → docs inside
  the working surface pointing at live entities.

Reject — explicitly not for Astraea:

- Silent result deletion; manual-refresh staleness; AI auto-commit of
  predicted selections; ribbon sprawl; template-per-discipline startup;
  paused-regeneration batch modes; workspace-protection merge ceremonies;
  drawings-only merge limits; tag-database as primary find; Save-As/Assign-ID
  ceremony; card-graph builder UI as an end-user surface; platform-gated
  sharing as the only sharing story; approximate aggregations without stated
  error bounds.

## 3. Current-product priorities (from the live audit)

Observed on main `d79dbe8`, all reproducible with evidence IDs:

1. **F1 Major: PNG blueprint export fails at runtime** (`toBlob` argument
   error; valid inline error, no file). A shipped export path is broken —
   fix or remove before any claim about export completeness.
2. **F2 Minor: export→import round-trip drifts** (length 3120→3000 mm,
   booster mass, stability on re-import). Undermines the version/compare
   story pattern 2/3 depend on.
3. **F3 Minor: studio-local configuration resets on studio switch**
   (wind tables, run counts, grain inputs). Store-level state survives.
   Design implication: in-progress analysis configuration needs a persistence
   story — directly relevant to patterns 8/9.
4. **F4 Info: sim-vs-measured overlay absent everywhere.** The highest-value
   missing surface; patterns 6/7/10 are its specification.
5. **F5 Info: ambiguous trajectory annotation** ("Apogee: 387m … 105s"
   conflates apogee time with flight duration). Small instance of the
   labeling discipline §2 exists to enforce.
6. **F6 Info: compact 1280×800 holds up** (no overflow; header truncates).
   200% zoom could not be verified with available tooling — open item, not a
   pass.

Working strengths to preserve: shared motor-selection slot with
fit-screening that never offers an unrunnable configuration; freshness keyed
on full input JSON; fail-closed import errors with state preserved; modal
focus trap/restore. The frontend worktree already adds the mission rail and
worker Monte Carlo absent on main.

## 4. Decision criteria for the two design directions

When two directions are prototyped (precision/canvas-led vs
run/comparison-led, same vehicle/task/data/viewport/error condition), judge
in this order: (a) task completion without coaching, including the stale and
failure states; (b) whether the engineer can state which result they trust
and why; (c) state-model clarity (editable vs computed vs historical vs
stale); (d) density/legibility under realistic names; (e) keyboard and zoom
operability; (f) visual restraint last. Descriptive timing only; no
single readiness score. No representative users have participated yet —
expert inspection constrains the design space; it does not validate it.

## 5. Open questions and evidence gaps

- Hands-on evaluation of NX/Onshape/STK/SDI cadence and feel (no licenses).
- CATIA evidence remains second-hand (login wall); STK pinned to 12.7.1;
  SDI pages track R2024b-era UI.
- 200% zoom behavior of Astraea unverified (tool gap).
- F1 root cause is an observed failure plus plausible diagnosis, not a
  certified root cause; F2 drift mechanism uninvestigated (research scope).
- Representative-user tasks not run; audience (expert/student/hobbyist)
  undecided.
- Any shared type/store/contract change implied by patterns 2–4 (version
  graph, stage suppression, `lastSimRun` growth) needs master sign-off; this
  package approves no API or scope.

## 6. Process record

Controller session with supervised Orca Run `run_764b82b7104c`. Bulk lanes
ran DeepSeek V4 Flash in explicitly launched OMP terminals; judgment lane
ran Muse Spark 1.3 Contributor (CLI id
`openrouter/meta/muse-spark-1.3-contributor` — the `:high` suffix in config
is a thinking level, not part of the id; first reviewer launch failed on
that, corrected). Two lane terminals exited after settling, so two rework
dispatches initially failed `terminal_not_writable` (proved
`operator_close`); both were re-dispatched to fresh same-model terminals and
accepted. All `worker_done` outcomes were verified against evidence before
acceptance; git status shows only `docs/design-research/`. Audit lane left
dev servers running for verification (main checkout); re-capture image
independently inspected and accepted.
