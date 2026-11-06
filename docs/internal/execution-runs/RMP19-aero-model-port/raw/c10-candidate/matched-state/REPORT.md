# Matched-state attribution: aero vs solver (RMP19-C10)

Date: 2026-11-01. Owner decision: 1c flight path held; diagnostic only.
No model change, no tuning, no gate change, no merge. Lane: `915392c` + diagnostic tests.

## Commands

```
cd /tmp/astraea-port
ASTRAEA_ENGINE_FLIGHTS=/home/ak/.paseo/worktrees/3s8t98rp/evidence-aero-model-c10 \
ASTRAEA_FLIGHT_STATE_OUT=/home/ak/.paseo/worktrees/3s8t98rp/evidence-aero-model-c10/matched-state/aero.json \
cargo test -j 2 --manifest-path crates/astraea-engine/Cargo.toml --test flight_state_aero -- --nocapture

ASTRAEA_ENGINE_FLIGHTS=/home/ak/.paseo/worktrees/3s8t98rp/evidence-aero-model-c10 \
ASTRAEA_FLIGHT_SOLVER_OUT=/home/ak/.paseo/worktrees/3s8t98rp/evidence-aero-model-c10/matched-state/solver-replay.json \
cargo test -j 2 --manifest-path crates/astraea-engine/Cargo.toml --test flight_solver_replay -- --nocapture
```

Data: `evidence-aero-model-c10/manifest.json` (dump paths/hashes) and the corpus dumps.
Evidence: `matched-state/aero.json`, `matched-state/solver-replay.json`.
Generator: research `scripts/export-engine-flight-manifest.mjs` (commit `b04c2a0`) now carries
`nozzleIn`, `temperatureF`, `pressureInHg`.

## 1. Dump format and fields

Doc: `docs/re/engine/flight-trajectory-format.md`. Each dump has 24 columns:
Time, Stage, StageTime, Mach, AOA, **CD, CL**, Thrust, Weight, Drag, Lift, **CG, CP, Stability**,
Accel-R/V/H, Vel-R/V/H, Pitch, Path, Altitude, Distance.

All nine single-stage dumps carry the same 24 columns; Stage is `S` throughout.
The two staged entries (`aeropac104kstageone-two-2`, `aeropac-3stage`) are **not applicable**
to the single-stage product solver and are never counted as passes.

## 2. Matched-state aero (engine Mach/alpha/altitude/site/nozzle)

Axial rows with |AOA| <= 0.5 degrees. Mean absolute CD residual vs the engine's logged CD:

| flight | base method | base legacy | base hybrid | **corrected-input method** | corrected hybrid |
|---|---:|---:|---:|---:|---:|
| blister | 19.35% | 11.63% | 19.30% | **0.001%** | 0.09% |
| dontdebatethisn5800 | 8.32% | 15.63% | 11.60% | **0.057%** | 4.37% |
| kinsel | 26.47% | 20.70% | 25.52% | **0.003%** | 2.13% |
| proteus6 | 23.69% | 16.39% | 23.11% | **0.448%** | 3.67% |
| qu8k | 40.77% | 29.07% | 41.27% | **0.456%** | 6.86% |
| rabia-shortfincan | 20.07% | 15.87% | 19.87% | **0.002%** | 1.20% |
| rabia | 22.55% | 15.62% | 20.85% | **0.003%** | 1.54% |
| raven | 28.81% | 24.91% | 28.67% | **0.001%** | 3.83% |
| torrent | 16.69% | 9.17% | 16.88% | **0.003%** | 3.18% |

CP matched at 0.0-2.3% mean (best 0.0%; dontdebatethis 2.26%, proteus 1.95%, qu8k 1.49%).

"Corrected" = same calibrated method, same app geometry, but with the design inputs the
engine used and the app drops: surface finish, turbulent-flow flag, fin airfoil section,
LE/TE bevels, LE radius, rail-guide height/diameter, launch-shoe area. No coefficient or
formula was changed.

## 3. End-to-end vs aero vs solver

| flight | e2e apogee (hybrid) | aero CD base | aero CD corrected | engine-CD replay apogee | replay maxV | replay TTA |
|---|---:|---:|---:|---:|---:|---:|
| kinsel | **29.29%** | 26.47% | 0.003% | 3.10% | 2.20% | 1.45% |
| raven | **17.35%** | 28.81% | 0.001% | 0.10% | 0.11% | 0.02% |
| dontdebatethisn5800 | **14.51%** | 8.32% | 0.057% | 1.88% | 1.04% | 1.11% |
| qu8k | 5.58% | 40.77% | 0.456% | 55.44%* | 10.59%* | 38.29%* |
| blister | 6.73% | 19.35% | 0.001% | 3.26% | 0.53% | 2.24% |
| proteus6 | 7.84% | 23.69% | 0.448% | 7.86% | 3.12% | 4.80% |
| rabia | 6.84% | 22.55% | 0.003% | 0.95% | 0.53% | 0.43% |
| rabia-shortfincan | 3.52% | 20.07% | 0.002% | 3.12% | 0.91% | 1.71% |
| torrent | 0.82% | 16.69% | 0.003% | 1.20% | 0.54% | 0.56% |

\* qu8k replay is not a valid solver bound: the core table is Mach-only, and the engine's
flight CD at a fixed Mach varies ~1.5x with altitude (M1.5: 0.507-0.758 over 3.5k-88k ft),
so the averaged table cannot represent the real drag. For 8/9, the replay is 0.1-7.9%.

## 4. Burn histories (mass/CG/thrust)

Compared at every ascent row with Weight>0, CG>0 and Mach>0.05:

| flight | thrust mean | weight mean | CG mean | weight max |
|---|---:|---:|---:|---:|
| all nine | **0.000%** | **0.000%** | **0.000%** | **0.000%** |

Mass, CG and thrust histories are already exact at the recorded rows. No residual remains there.

## 5. Defect (specific)

The aero gap is an **input-plumbing defect**, not a coefficient/model defect:

- `FrontendVehicle` carries only `components`; `surfaceFinish` and `forceTurbulentFlow` are
  dropped before `design_from_app_vehicle` (which sets `surface_finish: None`,
  `force_turbulent_flow: None`).
- `FrontendComponent` has no `airfoilSection`, `leadingEdgeBevel`, `trailingEdgeBevel`,
  `leadingEdgeRadius`, `railGuideDiameter`, `railGuideHeight`, `launchShoeArea`.
- `astraea_core::aero::Component::BodyTube` and `TrapezoidFin` have no fields for them, and
  `aero_model::component_input` hard-codes `None`/derives the airfoil from `crossSection`.

Consequence: the provider evaluates a smooth, non-turbulent, non-hexagonal, lug-free design
while the engine flew the real one. Kinsel's engine CD at M2.0 has fin-interference ~0.494;
the app design evaluates ~0.071, giving the 20-50% CD gap.

## 6. Fix proposal (for review; not implemented)

Carry the fields end-to-end as optional data, no formula changes:

1. `FrontendVehicle`: `surfaceFinish: Option<String>`, `forceTurbulentFlow: Option<bool>`.
2. `FrontendComponent`: `airfoilSection`, `leadingEdgeBevel`, `trailingEdgeBevel`,
   `leadingEdgeRadius`, `railGuideDiameter`, `railGuideHeight`, `launchShoeArea`.
3. `astraea_core::aero::Component::BodyTube`: optional rail guide/lug/shoe fields.
4. `Component::TrapezoidFin`: optional `airfoil_section`, `fx1`, `fx3`, `le_radius`.
5. `models::to_aero_vehicle`: map them (metres in, adapter converts to inches as today).
6. `component_input`: pass the fields into `ComponentInput` instead of `None`/derived.
7. `design_from_app_vehicle`: pass `surface_finish` and `force_turbulent_flow`.
8. Regression: unit parity against `corpus/kinsel.../points.csv` at M0.4/0.9/1.2/2.0 with the
   corrected inputs; then re-run the same matched-state test and the **same** 0.5% gate.

Expected effect: aero residual collapses (table above); the end-to-end gate will still be
limited by the 6-DOF-vs-engine solver difference (replay 0.1-7.9% on 8/9), so it is not
expected to pass 0.5% without a separately authorized solver/acceptance decision.

## 7. Decision state

- 1c flight path remains held; C10 remains not run; beta panels-only.
- No model change, no tuning, no gate change, no merge. `main` untouched.
- Staged dumps not applicable, not passes.
