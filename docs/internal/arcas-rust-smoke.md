# ARCAS Rust aero smoke-test

`crates/astraea-core/examples/arcas_aero.rs` is a CLI that runs the same
`stability` and `aero_curves` entry-points the Tauri desktop shell calls.
It accepts an externally-supplied vehicle JSON so a researcher can change
geometry without recompiling.

## What this is and is not

**What it is:** a cross-check that the Rust production code returns
self-consistent numbers for the ARCAS geometry, and that the Rust and
TypeScript implementations agree when given the same vehicle description.
That is a **parity** property: it shows the Rust port reproduces the TS model
on this geometry. It is a regression guard against a port that silently
drifts from the model it mirrors.

**What it is not:** an empirical accuracy claim, and not a correctness proof.
The TypeScript engine is a shared model, not a ground truth — agreement between
two implementations of the same model is symmetric and can be wrong in the same
direction. Where Rust and TS disagree beyond the documented parity band
(0.5% relative; see below) that is a real, actionable port defect, but a small
divergence is not automatically a bug: unit-conversion conventions, ordering,
and interpolation details can legitimately produce sub-tolerance differences.
How well either model matches the NASA TN D-4013/D-4014 wind-tunnel data is a
separate question documented in `docs/internal/validation-arcas.md`; this example does
not re-derive those results, it only exercises the API.

## Build and run

```sh
# From the repository root (or any worktree):
cargo build --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero

# Run with a file argument:
cargo run --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero -- path/to/vehicle.json

# Run via stdin:
cargo run --manifest-path crates/astraea-core/Cargo.toml --example arcas_aero < path/to/vehicle.json
```

The binary exits 0 on success and writes one JSON object to stdout.
It exits 1 and prints a diagnostic to stderr on geometry or parse error.

## Input JSON schema

The top-level object requires a `"components"` array and optionally accepts
`"reynoldsPerMeter"` to supply a tunnel Reynolds number per unit length for
skin-friction evaluation. When omitted, the curve uses the default sea-level
atmosphere. Each component uses the same camelCase field names as the TypeScript
`RocketVehicle` interface in `src/core/types.ts`.
```
{
  "components": [
    {
      "id":         string            // unique within this vehicle
      "name":       string
      "materialId": string            // see KNOWN_MATERIALS in aero.rs
      "type":       component_type    // see below

      // per-type fields (see below)
    },
    ...
  ],
  "reynoldsPerMeter": number          // optional; skin-friction condition only
}
```

### Component types and required fields

| type | required fields | optional fields |
|---|---|---|
| `nosecone` | `length`, `baseDiameter` | `shape` (default `"ogive"`), `wallThickness` (default 0.002 m), `isHollow` (default false), `massOverride`, `cgOverride` |
| `bodytube` | `length`, `outerDiameter` | `innerDiameter`, `massOverride`, `cgOverride` |
| `transition` | `length`, `foreDiameter`, `aftDiameter` | `wallThickness` (default 0.002 m), `isHollow` (default false), `massOverride`, `cgOverride` |
| `trapezoidfinset` | `finCount`, `rootChord`, `span`, `thickness` | `tipChord` (default 0), `sweepLength` (default 0), `crossSection` (default `"rounded"`), `axialOffset`, `massOverride`, `cgOverride` |
| `ellipticalfinset` | `finCount`, `rootChord`, `span`, `thickness` | `axialOffset`, `massOverride`, `cgOverride` |
| `masscomponent` | `mass` | `length`, `axialOffset` |
| `parachute` | `mass`, `diameter`, `cd` | `axialOffset` |

**shape values:** `conical`, `ogive`, `parabolic`, `vonkarman`, `elliptical`

**crossSection values:** `rounded` (default), `doublewedge`, `airfoil`, `square`

**materialId values** (from `KNOWN_MATERIALS` in `aero.rs`):
`cardboard`, `fiberglass`, `carbonfiber`, `balsa`, `plywood`, `aluminum`,
`pla_3dprint`, `abs_3dprint`, `petg_3dprint`

All lengths and diameters are in **meters**. `axialOffset` for fin sets and
mass components is measured from the start of the last body-tube segment,
matching the TypeScript convention.

## Output JSON schema

```
{
  "stability": {
    "total_length_m":          number,
    "max_diameter_m":          number,
    "reference_diameter_m":    number,
    "total_mass_kg":           number,
    "cg_m":                    number,   // CG from nose tip
    "cp_m":                    number,   // subsonic CP from nose tip
    "total_cna":               number,   // Σ CNaᵢ per radian
    "static_margin_calibers":  number,   // (CP − CG) / ref_diam
    "is_stable":               bool,     // margin ≥ 1.0 cal
    "is_over_stable":          bool,     // margin > 3.0 cal
    "contributions": [
      {
        "id":           string,
        "name":         string,
        "kind":         string,
        "mass_kg":      number,
        "cg_m":         number,
        "cp_m":         number | null,   // null for non-lifting parts
        "cna":          number | null,
        "axial_start_m": number,
        "axial_end_m":   number,
      }, ...
    ]
  },
  "powered_off": { ...drag_curves... },
  "powered_on":  { ...drag_curves... }
}
```

Each drag-curves block:

```
{
  "subsonic_cd":        number,   // Cd at M = 0
  "supersonic_cd_mach2": number,  // Cd at M ≈ 2
  "max_transonic_cd":   number,
  "mach_at_max_cd":     number,
  "drag_curves": [
    {
      "mach":                    number,   // 0 to 4, 41 points
      "total_cd":                number,
      "friction_cd":             number,
      "wave_cd":                 number,
      "base_cd":                 number,
      "protuberance_cd":         number,   // always 0 (no protuberance model)
      "cp_m":                    number,   // CP shifts forward above M = 1
      "static_margin_calibers":  number,
    }, ...  // 41 entries, M = 0, 0.1, 0.2, ..., 4.0
  ]
}
```

## Current ARCAS inputs

`src/validation/arcas/arcas-vehicle.ts` is the single geometry definition.
The runner serializes those vehicles at execution time. No frozen fixture JSON
is maintained here; corrected source inputs therefore reach both runtimes.
See `docs/internal/archive/harness-evidence-audit.md` for geometry approximations and provenance.


## Comparing Rust output to TypeScript

The runnable parity driver is
`scripts/arcas-runtime-smoke.mjs`. It exports the **current** ARCAS
vehicles straight from `src/validation/arcas/arcas-vehicle.ts` (no geometry
constants are copied), supplies the TN D-4013 tunnel Reynolds condition from
`src/validation/arcas/arcas-test-conditions.ts`, asks the Rust binary to evaluate
them, computes the TS oracle live with the same inputs, and compares:

- Barrowman stability — CP, CNa, CG, mass, length, reference diameter, static
  margin, and each component's mass / CG / axial span / CP / CNa;
- the full 41-Mach curves, coasting (`powered_off`) and powered (`powered_on`)
  — total CD, CP, static margin, and the friction/wave/base/protuberance CD
  breakdown at every Mach point.

Run the explicit smoke command below. It builds the Rust example first and uses
a dedicated Vitest configuration; ordinary `npm test` does not require a Rust
binary. `ARCAS_RUST_BINARY` optionally selects a prebuilt executable.

```sh
npm run test:arcas-runtime
# Or use a prebuilt binary:
ARCAS_RUST_BINARY=crates/astraea-core/target/debug/examples/arcas_aero \
  npx vitest run --config scripts/arcas-runtime.vitest.config.mjs
```

On Windows the binary carries an `.exe` suffix; the extensionless name works too
(Windows appends `.exe`). `ARCAS_RUST_BINARY` is checked for
existence, so a wrong or missing path fails immediately with a clear message
instead of a bare spawn error. If no binary is found at all, the test **fails**
(it does not skip), so a gate that runs it must build the example first.

The bound is the pre-existing **generic-port parity band: 0.5% relative**
(the same band recorded in `docs/internal/validation-arcas.md`). When the reference
value is near zero, a relative error is meaningless, so the runner reports the
absolute deviation instead and bounds it with a small absolute band. The
runner fails on deviations beyond the band; it does not use hardcoded output
snapshots.

Reading a result:

- **Within the band** — the Rust port reproduces the TS model on this geometry.
  This is parity, not empirical validation: both sides implement the same
  model, so they can be jointly wrong. Accuracy against the NASA wind-tunnel
  data is covered separately in `docs/internal/validation-arcas.md`.
- **Outside the band** — a real, actionable divergence worth investigating:
  1. Check the input JSON against the TS vehicle constants exactly (unit
     conversions in `arcas-vehicle.ts` are `IN = 0.0254`).
  2. Check the `finOffsetInTube` convention: offset is measured from the
     **start** of the body tube, not the nose tip.
  3. If the input is identical and the gap persists, treat it as a port defect
     to reconcile — the TS engine is the reference implementation the Rust port
     must mirror, but a corrected Rust port is also a legitimate outcome.

A sub-tolerance difference (especially at exact zeros or spline anchors) is
not by itself evidence of a bug.

## What was not checked by this runner

- The runner does not compare against NASA TN D-4013/D-4014 wind-tunnel
  data; see `docs/internal/validation-arcas.md` for that comparison. Parity between two
  implementations of the same model is not empirical validation.
- The `protuberance_cd` field is always 0.0 — no protuberance geometry
  model exists yet.
- The `powered_on` result assumes a burning motor throughout the full
  Mach sweep; it does not model a staged burn or throttle profile.
- CP values above M = 1 apply a fixed subsonic-to-supersonic shift
  formula; they are not validated against TN D-4014 CP measurements.
