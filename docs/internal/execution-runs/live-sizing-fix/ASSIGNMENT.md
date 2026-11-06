# Lane: live-sizing-fix

## Pin

- Worktree: `.paseo/worktrees/3s8t98rp/live-sizing-fix` (relative to the owner's home)
- Branch: `live-sizing-fix`
- Base: `4a914ea159cbef349e4ac36367a1e107cf6b7e99` (tip of `frontend/design`)
- Author model: OMP `deepseek/deepseek-flash` (catalog label "DeepSeek-V4.1-Flash"), effort `max`.
- Owner authorization: "Do" (2026-11-02), after the coordinator's review of `2968dd6`.

## Why this lane exists

Commit `2968dd6` ("ui: live size sliders in the part inspector") added range
sliders to every dimension in the part inspector. Coordinator review (read-only,
2026-11-02) found it breaks the product even though
`vitest run src/console/shell src/console/stages src/console/viewport` passes
129/129. The fix keeps live sizing; it does not remove it.

Findings, with citations at the base SHA:

1. **README shows a physically impossible rocket.** `docs/screenshots/live-sizing.webp`
   shows `nsl-bt2` shortened 1.45 m → 0.50 m while `nsl-fins.axialOffset` stays
   1.10 m from the tube front (`src/state/presets.ts:100-123`), so the fins and the
   main chute (0.85 m) sit past the tube's aft end. The margin/CG/CP shown are
   computed on that shape. Nothing keeps a child's axial extent inside its parent.
2. **3D view blanks during a drag** [INFERENCE from code, not yet observed].
   `useLayout` (`src/console/viewport/Vehicle3D.tsx:28`) returns `null` until the
   native stability result for the *new* vehicle key arrives; `VehicleModel` then
   renders nothing and `Viewport` (`Viewport.tsx:43-44`) frames on a fallback
   length of 1. The slider produces a new key on every step.
3. **Uncoalesced native calls and unbounded cache.** `useStabilityOf` requests per
   vehicle change with no coalescing (`src/console/hooks.ts:60-90`); `useLayout`
   omits the aero model, so it keys `legacy` while `useStability` keys the selected
   model → two native calls per step. `stabilityCache` (`hooks.ts:33`) never evicts.
4. **Mass sliders unusable.** `SliderField` defaults `step` to 1 display unit; mass
   rows (`Inspector.tsx` SPECS, `kind: 'mass'`, 0–100 kg / 0–20 kg) step in 1 kg, so a
   0.18 kg chute snaps to 0 or 1 kg on touch.
5. **Length sliders too coarse.** Shared SI ranges (e.g. tube length 0.02–6 m) on a
   92 px slider ≈ 65 mm per pixel.
6. **Invalid geometry reachable.** Inner diameter range 0–1 m is not capped by outer
   diameter; axial offsets are not capped by the parent tube length.
7. **Aero table shows stale rows as live.** `AeroControls.tsx` dropped
   `setPreview(null)`; old rows stay under the "Live" label until the new answer.
8. **README overstates.** Says "every dimension also has a slider"; optional fields
   (rail guide, lug, nozzle) do not.

Reference for the slider UX: the original Phase 1 inspector at commit `d94c7bc`
(`src/components/PropertyInspector.tsx`, `SliderInput`, parachute/mass controls):
label + value on top, full-width slider below, per-part ranges, masses in grams
with 1–5 g steps. Copy that *interaction design*, in the current theme
(`src/console/kit/theme.ts`, `C.*` tokens) and the current units system
(`src/console/kit/units.ts`, metric/imperial).

## In scope

- `src/console/kit/Fields.tsx` (`SliderField`), `src/console/shell/Inspector.tsx`
  (slider layout, per-field ranges/steps, cross-field caps), `src/console/hooks.ts`
  (stability request coalescing during drag, cache bound),
  `src/console/viewport/Vehicle3D.tsx` + `Viewport.tsx` (keep the last good layout
  while the next one loads; pass the selected aero model to the layout request),
  `src/console/stages/AeroControls.tsx` (mark rows as updating while stale instead
  of presenting them as current), tests next to those files.
- `README.md` live-sizing paragraph and `docs/screenshots/live-sizing.webp`
  (recapture from the fixed build with a *valid* geometry, e.g. dragging fin span
  or outer diameter on the NASA Student Launch example).
- `CHANGELOG.md` entry under the existing unreleased/top section.

## Out of scope (do not touch)

- Anything under `crates/`, `src-tauri/`, engine/WASM sources, aero/physics models,
  gates, thresholds, tolerances, presets' physical values, schema, file format.
- Drawing the 3D model from a TS-side layout. The 3D layout must still come from
  the native stability result. (A drag-time TS preview is an owner decision; if you
  measure visible lag, report it, do not implement it.)
- **Re-anchoring fins to the tube's aft end** when the tube shrinks. That changes
  design semantics and is an owner decision. For this lane: cap/clamp the slider
  and field ranges so a child's axial extent cannot exceed its parent, and show a
  plain warning in the inspector when an existing design already violates it.
  Do not silently rewrite existing offsets.
- `TASKS.md`, acceptance register, manifest, handoff, other worktrees, other lanes.

## Non-negotiables

- Author cannot self-accept. Do not edit the acceptance register, manifest, task
  board or handoff. `REVIEW.md` stays "pending coordinator review".
- No relaxed assertions, no special-casing fixtures, no deleting existing tests.
- Typed entry, unit scrub, arrow-key nudge and revert keep working unchanged.
- Committed vs staged semantics unchanged: sliders stage, runs use committed inputs.
- Host is under memory pressure: one heavy job at a time, `free -h` before builds or
  browser runs (stop below 2 GiB available), `vitest --maxWorkers=2`, kill every
  dev/preview server and browser as soon as a check finishes. No subagents.
- No push, no merge to main, no release, no publish.

## Gate 1 (before material edits)

Send a short design note and wait for approval:
- mechanism for "keep last layout" (where the last good layout lives, when it is
  replaced, how CG/CP markers stay consistent with the drawn shape),
- coalescing scheme for stability requests (interval, trailing call guaranteed,
  cache bound and eviction rule),
- per-field slider range/step table (metric and imperial),
- cross-field caps (inner < outer; child axial extent ≤ parent length),
- falsifier: the test or probe that would fail if the 3D view still blanks during a
  drag.

## Required evidence

Raw logs outside the repo under `.paseo/worktrees/3s8t98rp/evidence-live-sizing-fix/`.
- Focused tests: `npx vitest run --maxWorkers=2 src/console` (exact command + tail).
- `npx tsc --noEmit` clean.
- New regression tests that fail at base `4a914ea` and pass after (record both runs):
  layout persists while a new stability key loads; mass slider step is sub-kg;
  inner-diameter slider cannot exceed outer; fin offset slider cannot exceed parent.
- Real built surface: `pnpm build` then a Playwright run against `vite preview`
  with the production CSP (pattern: `scripts/browser-smoke.mjs`), Chromium, real
  pointer drag on a dimension slider. Record: frames sampled during the drag show
  the rocket present (no empty canvas), the time from release to final layout (ms),
  and screenshots before / mid-drag / after.
- New `docs/screenshots/live-sizing.webp` from that build with valid geometry.

## Acceptance (coordinator decides)

All 8 findings either fixed with a regression-capable test or explicitly reported
as not fixed with the reason. Built-surface drag evidence present. README image
shows a valid rocket.

## Report format

`docs/internal/execution-runs/live-sizing-fix/RESULT.md` + `EVIDENCE.json`; reply
with: commit SHA(s), files changed (production vs tests vs docs), exact commands
run and their results, measured drag latency, what was deliberately not done, open
questions for the owner. Commit locally with
`git -c user.name='OMP lane author' -c user.email='omp@localhost' commit`.
