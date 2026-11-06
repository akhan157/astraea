# Calibrated aerodynamic method (RASAero-method port)

Per-component drag build-up, transonic endpoint blend, supersonic fin strips,
per-shape nose CP caps, the engine's load-time junction rule, and cumulative
booster-stack composition.

**Provenance.** Implemented from the written method notes in the research repo
(`docs/re/engine/*`, with `file:line` citations into the research decompile,
which never enters this repo). No vendor code, binary, sample design, motor
data or engine-derived fixture ships here. The TypeScript module
(`src/aero/calibrated/`) is the independent oracle; this crate is the runtime.

**Layout.** Self-contained except `crate::v8_math::js_hypot`. The research
repo's `calibrated_staged.rs` (its staged flight solver) is deliberately **not**
ported: Astraea keeps its own 6-DOF engine.

## API

- `evaluate(&Design, &EvalOptions) -> Result<Point, CalibratedError>`
- `EvalOptions { mach, alpha_deg, method: Barrowman|Rogers, nozzle_exit_in, altitude_ft, site }`
- `Point { cd, cd_power_off, cd_power_on, cl, cn, cn_potential, cn_viscous,
  cn_alpha04, cp_in, cp04_in, ca_power_off, ca_power_on, reynolds, components }`
- Errors are typed: `Unsupported` (geometry/regime) or `Design` (missing or
  malformed input). There is no fallback value.

Units follow the method: inches for geometry and nose-referenced stations
(`In` suffixes), feet for altitude, degrees for alpha, forces in the engine's
wind axes. The app adapter (`crate::aero_model::design_from_app_vehicle`)
accepts SI metres and converts once at this boundary.

## App adapter — fin conversion

| App component | Result |
| --- | --- |
| `Nosecone` (conical, ogive, parabolic, von Karman, elliptical) | mapped |
| `BodyTube` | mapped (inner diameter is not aero geometry); rail guide / launch lug / launch shoe inputs from `Vehicle::design_inputs` |
| `Transition` | mapped; an equal-diameter transition is refused by the method |
| `TrapezoidFin`, cross-section `square` / `rounded` / `double_wedge` | mapped 1:1 |
| `TrapezoidFin`, cross-section `airfoil` | mapped — derives the method's Subsonic NACA section; an explicit `airfoilSection` name (from `Vehicle::design_inputs`) wins |
| `EllipticalFin` | **refused** — the method models trapezoidal fins only |
| `FreeformFin` | **refused** — convert to root chord, tip chord, span, sweep first |
| `MassComp`, `Parachute` | ignored (no external aero contribution) |
| `Unknown` | refused |

One fin set per body part; a second set refuses. Leading edge uses the app's
`axialOffset` from the parent body front, and the engine station is the parent
body's aft station minus that leading edge.

**Worked example** (fixture design 0): 0.2 m nose, 0.6 m body (front 7.8740 in,
aft 31.4961 in), fin `axialOffset` 0.45 m → leading edge 25.5906 in →
`Fin.Location = 31.4961 − 25.5906 = 5.9055 in`; root 4.7244 in, tip 1.9685 in,
span 3.9370 in, sweep 3.1496 in, thickness 0.2362 in.

## Adapter assumptions

- App `Ogive` maps to **tangent ogive**. The app has no secant-ogive or
  LV-Haack selection, so neither is inferred.
- `aero::Vehicle` is an **ordered axial chain**. The adapter stacks components
  in list order; the app's `axialOffset` is placement (a fin's position on its
  parent), not a free geometry coordinate.
- `design_from_app_vehicle` applies the method's defaults only where
  `aero::Vehicle::design_inputs` is absent: **smooth / zero-roughness** surface
  finish, no turbulent-flow forcing and no nozzle-exit diameter. The status API
  surfaces each absent input as an explicit assumption, not a silent default
  (e.g. surface finish is shown as "assumed smooth" and the nozzle assumption is
  named wherever power-on drag matters). A recorded input is used as supplied
  and is not reported as an assumption. Rail guide / launch lug / launch shoe
  and fin section / leading/trailing bevel / leading-edge radius inputs are
  carried the same way, per component id, in SI units.

## Tests

- `cargo test -j 2 --manifest-path crates/astraea-core/Cargo.toml --test calibrated_oracle_parity`
  — 216 points (3 synthetic designs × 2 methods × 12 Mach × 3 alpha) against the
  TS oracle. Observed worst residual **2.2e-16** (1 ulp); assertion 1e-15.
- `cargo test -j 2 --manifest-path crates/astraea-core/Cargo.toml --test calibrated_app_adapter`
  — adapter equivalence plus the refusal matrix above.
- Fixture: `crates/astraea-core/tests/fixtures/aero-oracle-parity.json`,
  regenerated in the research repo with `npm run fixtures:parity`
  (`scripts/export-oracle-parity-fixture.mjs`). Self-owned synthetic designs only.

## Engine evidence (external)

`crates/astraea-core/tests/fixtures/engine-corpus-manifest.json` lists the 40
engine corpus designs, 36,936 rows and the SHA-256 of each `points.csv`; the
data stays in the research repo. The native harness (`reverse/native/Probe.cs`,
modes `aero`, `stageaero`, `stageaero-sweep`, `save`, `flighttraj`; `CpDump`
for component dumps) regenerates it in the Windows lab.
