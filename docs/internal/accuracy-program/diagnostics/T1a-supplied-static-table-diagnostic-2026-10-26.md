# T1a supplied total static wrench diagnostic

The opt-in native JSON command `evaluate_supplied_aero_diagnostic` evaluates a
caller-declared complete total-force and independent-moment table under P0
1.0.0. It does not select an aerodynamic provider for flight, plots, saved
projects or calibration. Existing commands, core mathematics, production WASM,
frontend and defaults are unchanged.

This is an implementation diagnostic, not source qualification. Every successful
result reports `empiricalStatus: unqualified-source-not-reviewed`. Source,
geometry, conditions, environment and input identities are caller assertions;
they are neither verified hashes nor reviewed provenance. Agreement with an
imported table does not validate native aerodynamics. Rectangular software grid
coverage is distinct from empirical support: interpolating between isolated
transonic points does not establish continuous transonic qualification.

## Request and supported schema

The reusable synthetic request is
[`supplied-aero-diagnostic-request.json`](../../../../crates/astraea-engine/tests/fixtures/supplied-aero-diagnostic-request.json).
It is algebra evidence, not measurements. The request has exactly four top-level
fields: `schemaVersion`, `inputIdentity`, `table` and `query`. Its version is
`supplied-aero-static-diagnostic/1.0.0`. All DTO objects, including every vector,
reference, source, condition and node, reject unknown fields. Required fields
cannot be missing or null. Parsed JSON is retained verbatim as a value; original
text formatting and duplicate-key history are not retained by JSON dispatch.

`table` requires:

- `source: {identity, description}`, `geometryIdentity`, `conditionsIdentity`;
- `conventionId: canonical-body-total-P0/1.0.0`, `velocityReference: CG`;
- `references: {areaM2, lengthM, diameterM}`, all positive finite SI values;
- full `datumPositionFromNoseBM: {x,y,z}`;
- `fixedConditions: {betaRad, omegaBRadps:{x,y,z}, rollRad,
  reynoldsPerMeter, powerNozzleCondition}`;
- `interpolationPolicy: piecewise-bilinear`,
  `domainPolicy: reject-outside-grid`;
- `machAxis`, `alphaRadAxis`, and complete `nodes[Mach index][alpha index]`,
  each node exactly `{cfB:{x,y,z}, cmB:{x,y,z}}`.

The first bounded schema requires at least two strictly increasing, unique,
finite nodes on each axis. Mach is nonnegative. Alpha is in `-pi < alpha <= pi`,
in radians, to preserve its canonical `atan2` representation. There is no SB1
Mach, forward-flow or 5-degree incidence cap: only this coordinate definition
and the supplied grid bound evaluation. Three-dimensional force and moment
components are allowed at every node, including roll and yaw couples at beta0.

Beta and all three rates must explicitly equal zero. Roll is any fixed finite
angle. Reynolds per meter must be positive finite. Power/nozzle condition is an
explicit nonempty string. All table coefficients, datums and CG components are
finite. The full table is validated, including unused nodes; a missing force,
moment, component, row or corner is a rejection, never a zero-fill or partial
success. Drag-only exports and CP-derived moments are unsupported.

`query` requires `sourceIdentity`, `geometryIdentity`, `conditionsIdentity`,
`environmentIdentity`, the full repeated `fixedConditions`, `mach`, `alphaRad`,
`densityKgM3`, `speedMps`, `targetReferences`, full
`targetDatumPositionFromNoseBM`, and full `cgPositionFromNoseBM`. Source,
geometry and conditions identities must exactly equal the table. Fixed roll,
Re/m and power/nozzle condition must exactly match, without fuzzy comparison,
periodic roll normalization or interpolation. Beta/rates remain explicitly zero.
Density and speed must be positive finite. Zero speed is rejected with the
undefined-flow-angle reason; there is no zero-speed coefficient-limit route in
this schema. Mach, density, speed and Re/m are caller assertions; no atmosphere,
viscosity or mutual physical consistency is inferred.

## Algebra and trace

Body B is right handed: +Y noseward, +X the pitch axis, X cross Y = Z. Full
positions are body meters relative to the nose; a centerline station x meters
aft is `(0,-x,0)`. Velocity is constructed at CG as
`(0, V*cos(alpha), V*sin(alpha))`, so `alpha=atan2(v.z,v.y)` and beta=0. Body
rates use P0 ordering `(q_pitch,p_roll,r_yaw)` and are all zero here.

Each of the six coefficients is interpolated independently by convex bilinear
corner weights in Mach and alpha. No coefficient difference is formed, avoiding
overflow in a large opposite-sign coefficient difference. At an exact node the
corresponding bracket collapses to that node, with lower weight1 and upper
weight0; the four reported corner records may therefore repeat an index with
zero weight. Interior brackets report actual lower/upper indices and values,
weights and all four corner products. Nodes and all grid bounds are inclusive.
Outside either axis the command rejects, with no extrapolation, clamping,
blending, native evaluation or fallback.

The table is a total static aerodynamic wrench: `CF=F/(q_inf*S)` and
`CM=M_O/(q_inf*S*L)`. Independent moments remain valid with exactly zero force.
The existing core `CoefficientWrench::translated` performs full 3D moment
translation `M_to=M_from+(r_from-r_to) cross F`, then `rereferenced` converts
source S/L to explicit target S/L. The target wrench is translated to the
explicit CG. Reference diameter is metadata; no circular-area inference occurs.
The existing core `WindBasis` gives exact wind side/drag/lift from total CF;
wind drag is not added to the total force again. Dimensional static loads use
only `q_inf=0.5*density*speed^2`, supplied reference values and that wrench.

Nonfinite arithmetic is rejected. The wrapper also rejects nonpositive or
nonfinite force, length and moment reference-conversion factors, and dimensional
pressure/force/moment scale factors, to avoid silent scaling overflow or
underflow. These are computational guards, not physical acceptance tolerances.
Extreme but finite inputs can therefore be computationally unsupported.

The result retains parsed input, source/target coefficient wrenches, target and
CG dimensional static wrenches, velocity, dynamic pressure, exact wind basis
and coefficients, and the bracket/corner trace. Rate coefficients, rate loads,
total dynamic loads, derivatives and CP are always null with reasons. Zero-rate
table evaluation does not establish dynamic-model support. No free couple is
converted to a CP, and absent moments are never derived from a CP or Cd.

## Scope, checks and reproduction

This route consumes an explicitly canonicalized complete source table. It does
not consume arbitrary vendor CSV unchanged. RASAero or another export may not
contain independent full 3D moments; such an export is not sufficient for this
full-static-load route. Vendor sign/reference mapping, sparse drag-only imports,
additional Reynolds/roll/beta/power axes, rates, measured-source review and
continuous-domain qualification remain later packets. No protected flight
holdouts or new trajectories are used.

Focused JSON-boundary tests cover all corners, edges, exact internal nodes,
bilinear interior values and weights, pure couples with zero CF, explicit full
3D datum/CG translation, independent source and target reference/datum rewrites,
wind power identity/no double drag, missing/null/partial loads, drag-only input,
unknown keys, identity/condition mismatches, source convention and reference
failures, malformed grids, out-of-grid queries, zero speed, invalid numerics,
extreme scaling and evaluation above SB1 Mach/incidence limits. Floating-point
tolerances check algebraic identities only; none is an empirical accuracy claim.

Reproduce with the isolated target directory (at most one Cargo build job):

```sh
source /workspace/astraea-plan/env.sh
CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=/workspace/astraea-plan/evidence/supplied-aero-20261026/target cargo test --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --test supplied_aero_diagnostic
CARGO_BUILD_JOBS=1 CARGO_TARGET_DIR=/workspace/astraea-plan/evidence/supplied-aero-20261026/target cargo run --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --example supplied_aero_diagnostic -- crates/astraea-engine/tests/fixtures/supplied-aero-diagnostic-request.json
```

The executable calls actual `dispatch_json`, prints its normal `{ok:...}` or
`{error:...}` envelope and exits nonzero on rejection. Logs and hashes are
retained externally under
`/workspace/astraea-plan/evidence/supplied-aero-20261026`. The initial focused
run exposed two test expectation mistakes (integer/float JSON structural equality
and an expected force omitting S=2); numerical/vector assertions and the expected
force/CG moment were corrected. No provider equations were changed for that
rework. This packet does not rebuild or claim current bundled-WASM exposure.

The final native engine `cargo test --all-targets` run passes **50 tests**,
including **11 T1a tests**, and compiles all three examples. The native example
run succeeds and retains its synthetic response. Final logs are
`engine-all-targets-final.log`, `native-example.log`, and
`synthetic-response.json` in that evidence directory. `git diff --check` passes.
Rustfmt is unavailable in the installed toolchain; no component installation or
network access was attempted. No core suite, frontend or WASM rebuild is needed
for this engine-only diagnostic addition; integration review remains independent.
