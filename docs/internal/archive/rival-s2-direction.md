# RIVAL S2 — precision/canvas-led workstation shell: direction record

Prototype of the OTHER design direction from the ui2 lane's S2 shell, built to
the identical S2 acceptance on the S1 selectors already on `origin/main`.
Synthesis: `frontend/docs/design-research/synthesis.md` §§2, 4, and
`evaluation-method.md` ("Two later design directions").

## Which direction S2 took, and which this worktree builds

The ui2 lane's S2 shell (`src/components/workstation/` in that checkout) is
**run/comparison-led**: its new persistent chrome is a mission status rail
(validity/freshness/stability/gate/weather/flutter/job), the run record
counts and readiness panes lead, and its differentiating work is the inline
ensemble + qualified run repository under S1 content keys.

This worktree builds the **precision/canvas-led** pole: the assembly pick
surface (tree + canvas) and the edit lifecycle lead, the run exists but is
subordinate, and the persistent chrome is the pick/edit context bar. Same
vehicle, task, data, viewport, error condition; same S1 contracts; same four
acceptance criteria as S2 (five studios keyboard-reachable, routine sim
without a modal, invalid/stale never unqualified-pass, WebGL loss retains
editing).

## Synthesis patterns adopted / adapted / rejected (vs S2)

| Pattern (synthesis §2) | Disposition here | Why it differs from S2 |
|---|---|---|
| 1. Type-tiered selection filter + scope + three-state highlight (NX) | **Adopted** as the pick surface: `SelectionFilter` (type × scope) + `ComponentTree` rows tagged candidate/selected/action-needed (`data-state`), driven by S1 `assessMounts` for mount repairs | S2's shell has no filter surface; picking stays plain |
| 3. Two-point compare: difference list + blend slider | **Adopted**, docked against the canvas (`CompareDock` + RocketCanvas overlay of the saved revision at blend opacity) | S2 postpones comparison to the run side; here the design-vs-saved compare is a first-class edit-time tool |
| 4. Edit buffer with explicit commit/cancel + rollback | **Adopted** as the Airframe edit boundary: `editBufferStore` stages inspector edits; Apply commits ONE undoable history step (`rocketStore.applyVehicleDraft`); Escape/Discard is non-destructive; non-finite numbers are rejected, never clamped | S2 keeps direct `updateComponent` mutation |
| 5. Scenario-as-context-root (time/units/env set once) | **Adapted** lightly: units + scenario + selection are the persistent footer/context strip (full scenario store arrives with S5/S6) | Same contract as S2's footer; not the differentiator |
| 6./7. Inspect/Compare sibling panes; four-stage compare contract | **Deferred** to S6 (evidence overlay) in both directions; the Aero studio's inspect panel reappears here (`AeroPanel`) | Required by the aero acceptance surface, identical in both shells |
| 8. Auto-invalidation with visible reason + one-click re-run; old results kept | **Adopted** for the run surface (`runStore` append-only + `runDisplay.qualifyResult`), so stale/invalid never unqualified-pass | Same S1 contract S2 uses — the acceptance bar, not the differentiator |
| 10. Selection as first-class persistable state | **Adopted**: selection survives studio switches and drives the run-from-selection chip in the precision bar | S2 keeps selection but does not make it an action root |
| 2. Version/workspace with explicit revert | **Adapted** minimally: compare targets the history head ("last saved"); full versioning is S3 | Out of S2's scope too |

Rejected for this shell: silent result deletion and manual-refresh staleness
(synthesis §2 reject list) — the run surface here keeps S2's qualification
contract; a second rail implementation was rejected as palette-variation
(evaluation-method §"Two later design directions" demands workspace-strategy
difference, not another status readout).

## Files

```
src/application/runDisplay.ts, runDisplay.test.ts        qualification contract
src/store/runStore.ts                                     append-only run registry
src/store/workspaceStore.ts, workspaceStore.test.ts      studios, filter, compare diff
src/store/editBufferStore.ts, editBuffer.test.ts         edit-commit boundary
src/components/ui/StatusBadge.tsx                        shared qualified badge
src/components/workstation/StudioNavigation.tsx          1–5 + Ctrl+Enter map
src/components/workstation/SelectionFilter.tsx           type/scope filter + states
src/components/workstation/EditBufferStrip.tsx           pending N + Apply/Discard
src/components/workstation/CompareDock.tsx               diff list + blend slider
src/components/workstation/PrecisionContextBar.tsx       row chrome assembly
src/components/workstation/ScopedAssemblyTree (in ComponentTree)  three-state rows
src/components/workstation/AeroPanel.tsx                 stability inspect surface
src/components/workstation/WorkstationShell.tsx          five-studio shell
src/components/workstation/shell.test.tsx                identical-S2 acceptance
src/components/workstation/precisionSurface.test.tsx     RIVAL direction surface
```

Modified: `rocketStore.ts` (`applyVehicleDraft`), `PropertyInspector.tsx`
(draft overlay + stage routing), `TrajectoryStudio.tsx` (S1-gated inline
run), `Header.tsx`/`App.tsx` (modal entry removed), `ComponentTree.tsx`
(filter + three-state), `RocketCanvas.tsx` (compare overlay),
`scripts/emit-benchmark-metadata.{cjs,test.cjs}` (suite inventory 48 → 53).

## Acceptance parity

1. Five studios reachable by digits 1–5 outside editable contexts.
2. Routine simulation inline: Ctrl/Cmd+Enter and every `data-run-inline`
   entry drive the S1-preflight-gated ensemble in Trajectory; no dialog role
   exists anywhere.
3. Invalid/stale never unqualified-pass: `qualifyResult` requires valid +
   current + gate-pass; runs record append-only under the S1 snapshot key.
4. WebGL loss swaps only the viewport for an editing-preserving fallback.

Tests: 53 suites / 689 cases green (48 + 5 new), `pnpm build` clean. This
worktree never merges to main.