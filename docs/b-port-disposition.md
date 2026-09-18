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

## Export row-6 trigger pass — omission previews before any bytes
## (commit c14ee44, ported from frontend 26b71b7)

| Pattern (synthesis §2) | Disposition | Change and evidence |
|---|---|---|
| 9. Snapshot export vs live view duality, honestly labeled | **ADOPT** | Every row-6 trigger (RKT/ENG/KML/STEP/STL) opens an omission preview before emitting bytes: `OmissionPreview { refused[], omissions[], canExport }` in `src/formats/exportPreview.ts`, staged in `InteropExportPanel.tsx` (`openPreview`/`staged`). `refused` blocks the download fail-closed (the exporter's own validation mirrored — RKT subset scan, ENG `validateMotorSpec` gate, STEP/STL tessellation attempt); `omissions` are lossy-but-exportable notes the user confirms. KML exports are frozen snapshots of the explicitly chosen committed run (pattern 9: frozen at click time; live views re-evaluate with their own freshness marker). |
| 8. Auto-invalidation with visible reason + one-click re-run; old results kept | **ADAPT** | The KML describers read the S2 run surface (`runStore.lastSimRun()`): identity + runKey with an EMPTY telemetry payload until the S4 job service publishes. A run without published telemetry is refused with the visible reason in the preview — no fabricated points, no bytes. Old results are retained; the preview states exactly why the chosen run cannot export yet. |

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

## Row-6 export triggers — omission previews before any bytes
## (lane task_b223aebef607, ported from frontend commit 26b71b7)

Scope: the RKT/ENG/KML/STEP/STL omission-preview triggers and the
`src/formats/exportPreview.ts` describers behind them, ported from
`feat(s7): row-6 export triggers with omission previews` (frontend 26b71b7).
Patterns cited per the file preamble (synthesis §2 list 1–13).

| Pattern (synthesis §2) | Disposition | Why it differs from the source (frontend 26b71b7) |
|---|---|---|
| 9. Snapshot export vs live view duality, honestly labeled (STK SIM-EVID-002/003, Seeq W-7) | **ADOPT** | Every row-6 trigger opens an omission preview computed at click time and frozen there; the KML preview names the exact run snapshot (runKey) and states that exports freeze at click time, while live views re-evaluate with their own freshness marker. Source labeled the run only implicitly; this port surfaces the pattern-9 duality in the preview text so the artifact's provenance is stated before any download. |
| 8. Auto-invalidation with visible reason + one-click re-run; old results kept behind explicit action (Mechanical SIM-EVID-013) | **ADAPT** | The S2 run store (`runStore` append-only registry + `qualifyResult`) already keeps old runs with a visible staleness marker; the KML trigger serializes only the EXPLICITLY chosen committed run under the S1 snapshot key, and a stale chosen run exports only under a frozen-snapshot label — never re-evaluated. Source read a `lastSimRun` field on rocketStore with no staleness concept; shell-alt's chosen-run + freshness model is the S2 contract this worktree ships. |
| 2. Workspace/version with explicit revert — "current design vs the snapshot that produced a result" | **ADAPT** | Provenance frame for KML: the preview names `runKey` and keeps the run store's freshness, so the export always traces to the snapshot that produced it. Out of scope in the source commit; the S2 run identity makes it free to state here. |
| (reject list) Approximate aggregations without stated error bounds | **Adopted as a refusal rule** | The KML trigger refuses a committed run whose single-trajectory telemetry payload has not been published (the S4 job service owns payloads; `runStore.lastSimRun()` never fabricates points) instead of emitting a file it cannot back with real data. Source could read telemetry directly; shell-alt's payload channel is empty until S4, so the honest behavior is fail-closed with a named reason. |
| (reject list) Silent result deletion / manual-refresh staleness | **Rejected as shipped** | No run is rewritten or deleted by any trigger; staleness is visible (freshness marker + preview label), never silently refreshed. Same guard as the source's fail-closed refusals, extended to the run surface. |

Rejected from the source: the KML "run ended without touchdown" omission
note — the shell S2 `RunRecord` carries lifecycle/validity/gate but no
touchdown datum, so the note would be unbacked; it returns with the S4
payload contract. Also rejected: any claim of PNG-export completeness or
lossless round-trip — the PNG trigger is unchanged from the pre-port panel
(existing rasterizer, module-mocked in tests), and every row-6 preview
enumerates the subset the exporter carries or refuses the download.

Files (this lane): `src/formats/exportPreview.ts`,
`src/formats/exportPreview.test.ts` (new), `src/components/
InteropExportPanel.tsx`, `src/components/InteropExportPanel.test.tsx`
(row-6 trigger support), this file. Not touched: `scripts/
emit-benchmark-metadata.*`, EvidenceStudio, CompareDock, WorkstationShell,
App.tsx, `evidence/`, `recovery/`, `src/store/runStore.ts`,
`src/store/rocketStore.ts`.

Verification: scoped vitest green on every touched test file (28 cases
across `exportPreview.test.ts` and `InteropExportPanel.test.tsx`);
`tsc --noEmit` clean for all ported files; full suite not required by this
lane. KML positive-path behavior (published payload → omission preview →
download) is exercised at the pure-function layer against the
`KmlRunSnapshot` shape and unblocks unchanged when the S4 job service
publishes payloads. Commit `c14ee44` references this disposition file.