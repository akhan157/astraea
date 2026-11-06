# Lane: beta-aero-layout

## Pin

- Branch: created by T3 `delegate_task` (worktree isolation) from `frontend/design` at
  the commit that adds this file. Rename it to `beta-aero-layout`.
- Author: OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max`.

## Why

Found by the `screenshots-refresh` author and recorded in
`docs/internal/execution-runs/screenshots-refresh/REVIEW.md`. On Aero → Aerodynamic
inputs, ticking "Use built-up aero model (beta)" makes the 3D rocket disappear: the
viewport's `data-layout-length` falls from 2.97 m to 1. The built-up provider's
stability result carries no per-component contributions, and the 3D layout is built
from those contributions (`src/console/viewport/Vehicle3D.tsx:41-56`, `useLayoutSnapshot`
→ `useStabilityOf(vehicle, aeroModel)`). The `live-sizing-fix` lane made the layout
request pass the selected aero model.

## Expected outcome

With the beta model on, the 3D view still shows the full rocket with correct
geometry. CG/CP markers show whatever the selected model honestly provides: if the
beta provider does not publish a CP, show none or show the state honestly — never
silently substitute the legacy CP as if it came from the beta model. No physics,
provider, gate or engine change.

## Gate 1 (stop for approval)

Diagnose first and report:
- what the beta provider returns (cite code: TS adapter and, if relevant, the engine
  DTO) and why the contributions are empty,
- where the layout gets its part stations (geometry-only, or does it depend on the
  aero contributions?),
- the fix options with a recommendation. One candidate: geometry layout from a
  model-independent source (for example the legacy geometry rollup, which is geometry,
  not aerodynamics), while CG/CP markers follow the selected model's own result.
  State any provenance risk,
- the falsifier: a test that fails at base (beta on → layout length 1 or no parts)
  and passes after, plus a browser assertion.

## Non-negotiables

- **No image reading.** Your model cannot read images, and reading one crashes the
  session. Verify with DOM attributes and numbers only.
- No engine/physics/provider/gate/threshold/schema changes. Do not edit `crates/`.
  If the only correct fix needs engine work, stop and report.
- No relaxed assertions. Add assertions only to `scripts/preview-journeys.mjs`.
- The author cannot self-accept. Run `free -h` before heavy steps. Use
  `vitest --maxWorkers=2`. No subagents. No push, merge, release or publish.
  Leave the `vite preview` on port 4173 alone (it is the coordinator's).

## Report

`docs/internal/execution-runs/beta-aero-layout/RESULT.md` + `EVIDENCE.json`. Commit with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
