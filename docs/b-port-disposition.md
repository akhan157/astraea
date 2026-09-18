# B port disposition — shell-alt trust-defect pass

Scope: the B-blocking trust defects the two enterprise critiques found in the
rival precision shell (this worktree, branch `akhan157/shell-alt`):

- `docs/enterprise-critique.md` — Design B §(1)/(2) gap, prioritized must-fix
  #5 (compare-checkpoint recency) and #6 (rival error paths + run-chip label
  scoping + App.tsx `alert`).
- `docs/enterprise-critique-astra.md` — P0 #4 (baseline identity: B compares
  `history[0]`; header shows current `vehicle.version`) and #8 (selection
  suppresses the repair state in `pickStateFor`; run chip claims).

Synthesis grounding: `frontend/docs/design-research/synthesis.md` §2 pattern
list (1–13). Pattern dispositions below are per pattern number and carry the
ADOPT / ADAPT / REJECT decision the merge gate requires for UI work.
Baseline record: `docs/rival-s2-direction.md` pattern table.

## Compare-checkpoint recency, disclosure, run scope, repair visibility
## (worker task_d2cac3d567cd — trust-defect pass)

| Pattern (synthesis §2) | Disposition | Change and evidence |
|---|---|---|
| 2. Workspace/version with explicit revert | **ADAPT** (fixes the wrong-basis defect the direction record shipped) | The compare basis is now the NEWEST pre-edit snapshot — `history[history.length - 1]` — in both `CompareDock.tsx:50-52` and `WorkstationShell.tsx:326-330`. Edits append the pre-edit vehicle to history, so the tail is what "last saved" means; `history[0]` is the oldest retained revision and the `slice(-30)` cap silently shifts it (Astra P0 #4, enterprise #5). The dock header now names the checkpoint's own version (`CompareDock.tsx:104-107`), never the current `vehicle.version`. Regression pin: `src/components/workstation/compareDock.test.tsx` "commits twice and diffs against the LATEST pre-edit snapshot" — two commits touching different components must yield 1 row against the tail (2 against the old `history[0]`), and the header must read the checkpoint version. Full versioning stays deferred to S3 (unchanged). |
| 3. Two-point compare: difference list + blend slider | **ADOPT** (unchanged shape) + overlay no-fabrication pin | The blend overlay exists ONLY when a checkpoint exists: `WorkstationShell.tsx` passes `overlayVehicle={compare.active ? checkpoint : null}` / `overlayOpacity={compare.active && checkpoint ? blend/100 : 0}` and now exposes the contract as `data-overlay-vehicle` / `data-overlay-opacity` on the viewport (`WorkstationShell.tsx:365-373`). Mirror of A's no-fabrication test: `compareDock.test.tsx` "never fabricates a blend overlay when no checkpoint exists" asserts dock rows 0, the honest "No prior revision exists yet" copy, and overlay vehicle=false / opacity=0 with the dock open and blend set. |
| 1. Type-tiered selection filter + scope + three-state highlight | **ADAPT** (orthogonal facts coexist; empty state is labeled) | `pickStateFor` (SelectionFilter.tsx:25-39) now returns `action-needed` BEFORE `selected`, so selecting an ambiguous/solid mount cannot suppress the repair badge or the legend count (Astra #8). `ComponentTree.tsx:91-100,224-249` adds a labeled `data-filter-hides-repair` status when the active filter hides any action-needed mount/motor a repair link points at, and a `data-tree-filter-empty` label when a filter matches nothing — absence is never silent. Pins: precisionSurface.test.tsx "keeps the repair badge and count when a mount is selected" and "shows a labeled empty state when a filter hides the mount a repair targets". |
| 10. Selection as first-class persistable state | **ADAPT** (run-from-selection claim removed; selection stays context-only) | The precision run chip is decoupled from the Selection group: whole-design scoping lives in the visible label "Run current design" and the `data-run-design` contract (`PrecisionContextBar.tsx:35-48`), the `data-run-selection` handle is gone, and the title says "whole current design". The run consumes the current design + case; selection is never implied as a simulation scope. Pin: precisionSurface.test.tsx "visibly scopes the precision run chip as whole-design, not title-only". |
| 4. Edit buffer with explicit commit/cancel + rollback | **ADAPT** (same boundary; error path joins the disclosure posture) | The only modal-style `alert` in either shell — the drop-import failure at `App.tsx:55` — is routed through the onReport disclosure path: inline `role="alert"` `data-drop-import-error` banner with title, message, and Dismiss (`App.tsx:62-67,79-100`). Never `window.alert`, never a dialog. Pin: `src/App.test.tsx` asserts the banner renders, `window.alert` is never called, and no dialog exists. |

Rejected for this pass (cite if re-opened): renaming the checkpoints' "last
saved" copy to a durable-save term — the critiques' factual defect is that
the code compared the wrong revision, which is fixed; a durable named-save
contract belongs to S3 versioning (pattern 2), not this shell pass. The A-side
`ImportDisclosure` component is not ported: the rival failure surface is
App-local by scope, and the no-modal contract is identical.

Files touched (this pass): `src/components/workstation/CompareDock.tsx`,
`src/components/workstation/WorkstationShell.tsx`, `src/components/workstation/
PrecisionContextBar.tsx`, `src/components/workstation/SelectionFilter.tsx`,
`src/components/ComponentTree.tsx`, `src/App.tsx`, tests
`src/components/workstation/compareDock.test.tsx` (new),
`src/components/workstation/precisionSurface.test.tsx`, `src/App.test.tsx`
(new).

Verification: scoped vitest green on every touched test file; full suite not
required by this pass. Commit message references this disposition file.