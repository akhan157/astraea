# Master contract decisions — frontend work packages (Round-19.5)

Status: approved by master session 2026-09-10. Binds the frontend worktree.

| # | Decision |
| :-- | :-- |
| Q1 | Recovery bay: **derive** from bodytubes + chute axialOffset ranges in v1. No new `recoverybay` component type. Duplicate-chute-in-tube ambiguity is surfaced in the UI, never silently guessed. |
| Q2 | Packed-chute geometry: **user-entered packed dims** (optional fields on `ParachuteComponent`, documented defaults). No physics-free folded-size heuristic. |
| Q3 | Avionics sled geometry: **extend `MassComponent`** with optional width/height/length bounding dims. No new component type. |
| Q4 | Telemetry display contract: display consumers **always re-grid telemetry to dt=0.1 s** (reuse `resample`) plus a downsample cap; sim engine untouched; telemetry stays presentation-grade and labeled "modeled". |
| Q5 | Store: **add `lastSimRun`** — minimal `{ telemetry, events, runKey }` written by FlightSim on commit, consumed by Evidence overlay and the mission rail. |
| Q6 | Thrust-edit consistency law (blessed): after any edit, recompute `totalImpulse` = ΣF·Δt (trapezoid), `avgThrust` = J/burnTime, `maxThrust` = max F, `burnTime` = last t. **propellantMass/totalMass/dryMass stay user-fixed.** Downstream depletion and MC impulse consistency follow the existing impulse-fraction law. |
| Q7 | Custom-motor undo: **panel-local undo stack + discard-confirmation** on navigate-away with unsaved edits. No global Ctrl+Z for motor edits in v1 (parallel history lane deferred). |
| Q8 | Store: add `upsertCustomMotor(motor)` (replace-or-insert by normalized id); `importCustomMotor` becomes a thin wrapper. |
| Q9 | Formats: add `exportToEng(motor)` in `engParser.ts` with round-trip test `import(export(m)) ≈ m`. |
| Q10 | PNG rasterization: **zero-dep native canvas** (blob-SVG → `<img>` → `<canvas>` → toBlob). No new dependency. |
| Q11 | Charting policy: **hand-rolled SVG primitives**; no chart lib. Series-color tokens: cyan = airframe/CAD accent, violet = avionics + flight-log series, emerald = satisfied gates/safety; series identity never reproduced by safety-state color. |
| Q12 | MC: **same-module chunk pair** (`runMonteCarloChunk` + accumulation) with chunk ≡ full determinism test; per-run sub-seeds derived from master seed; Vite module worker (`new URL(..., import.meta.url)`). |

Emitters/tests: every new `*.test.*` file must be registered in
`FIXED_TEST_FILE_INVENTORY` (+ hashed list) in the same commit.

Sequencing: Wave A = PNG export, sim-vs-actual overlay (bundles Q11 tokens +
`lastSimRun`), worker MC (bundles mission rail) — parallel lanes. Wave B =
thrust-curve editor (Q6–Q9), recovery packing visualizer (Q1–Q3) — after
Wave A lands. Cohesion: shared `studio.tsx` primitives extracted during
Wave A before new surfaces ship.