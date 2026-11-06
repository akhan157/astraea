# A1c: explicit static SB1 JSON diagnostic

This adds one opt-in engine command, `evaluate_sb1_diagnostic`, connecting the
existing real `FrontendVehicle` DTO and A1b external-profile adapter to the
existing `aero_coefficients::evaluate_static`. It is a computational diagnostic,
not an empirical qualification, project migration, flight integration or new
production selection. Existing flight, stability and aero-curve commands retain
their prior paths. No frontend, WASM asset, legacy drag provider, calibration,
mass model, environment generator or dynamic rate provider is invoked.

Call `dispatch_json("evaluate_sb1_diagnostic", request_json)` with the complete
request object as arguments; there is no `request` wrapper. The reusable
[synthetic request](../../../../crates/astraea-engine/tests/fixtures/sb1-diagnostic-request.json)
is algebra and serialization evidence only. It is not measured/as-flown geometry
or an atmosphere, and must not be promoted to empirical evidence.

The request requires every field in that fixture:

- `schemaVersion` is `sb1-static-diagnostic/1.0.0`; `inputIdentity` is a nonempty
  caller identifier.
- `vehicle` has exactly the existing `FrontendVehicle` wire shape. Before the
  permissive existing DTO is constructed, the diagnostic checks the vehicle,
  every component and every supplied freeform point against the current DTO's
  allowed keys. Unknown keys are errors. All accepted source fields, including
  mass/material fields unused by SB1, survive in the retained input and component
  source records. The allowed-key list belongs to this diagnostic boundary and
  must be reviewed if the existing DTO is extended.
- `adapterOptions` requires source identity, all seven declarations (including
  declaration provenance), explicit ogive/transition interpretation, aft
  termination, internal component ID exclusions and all quadrature controls.
  `notApplicable` explicitly means no ogive/transition interpretation was
  supplied; an actual ogive/transition then fails adapter support checks.
  `tangentOgive` and `conical` select the existing interpretations. Aft termination
  must be `flatExposedBaseAtFinalStation`. No field has a default.
- `axial` requires nonnegative finite `ca0`, nonempty `providerId` and
  `inputIdentity`. CA0 is prescribed, constant with incidence for this evaluation.
  The caller must identify its provenance and power/nozzle condition. Nothing
  computes legacy zero-incidence drag, applies a correction or supplies a fallback.
- `state` requires the air-relative velocity at CG in body B, body angular rate,
  Mach, density, full CG body position relative to the nose, environment identity
  and power/nozzle condition. Mach and density are prescribed independently; this
  route does not establish thermodynamic consistency, Reynolds number or axial
  applicability. `datumPositionFromNoseBM` is the full geometric moment datum.
- `cpPolicy` requires the current core policy ID
  `cp-ratio-roundoff-cancellation/1.0.0`. Its denominator uncertainty is explicitly
  `{"kind":"notSupplied"}` or `{"kind":"interval","lower":...,"upper":...,
  "evidenceIdentity":"..."}`. An interval must enclose the computed total C.
  No numerical integration estimate is silently promoted to physical uncertainty.

All new structured diagnostic DTOs reject unknown fields. Required values,
including all vector coordinates, cannot be omitted/null. Nonfinite JSON numbers
are rejected by JSON decoding; nonfinite/overflowing calculated state is rejected
by the core. The retained `input` is the exact parsed JSON value, including
unmodeled-but-known DTO fields and explicit options; whitespace, numeric spelling
and duplicate-key history are not preserved by the common JSON parser. This
command does not certify original textual/physical source completeness. Physical
sharpness, smoothness/slenderness, fin thinness/spacing/cant and absence of other
external features remain caller assertions. The original A1b support-report
limitation about typed DTOs is retained verbatim; the additional raw-input policy
explains the stricter checks applied by this route before that typed boundary.

The output retains adapter options, source/component roles, body profiles,
integrated intervals, integration method/error/roundoff/convergence reports,
fin host and symbol map, component C/J contributions and support limits. It also
returns the source equation IDs, prescribed axial source IDs, caller geometry
identity, reference area/length/diameter and full datum/CG. These identities are
caller provenance, not cryptographic hashes or qualified cache identities.

Body B is right handed: +Y noseward, +X the pitch axis, X cross Y = Z. A station x
meters aft of the nose has position `(0,-x,0)` relative to the nose. Rates are
`omega_B=(q_pitch,p_roll,r_yaw)` in rad/s. Angles are radians, velocity m/s,
density kg/m3, pressure Pa, references m2/m and dimensional loads N/N*m. The
output includes exact definitions and wind-basis columns. Static force and
moment coefficients are returned about the requested datum and CG, and static
dimensional force/moment about CG use the core's full cross-product translation.
Wind coefficients use the exact body-to-wind transform, so total wind CD at
finite incidence is distinct from prescribed CA0. No extra wind drag is added.

The candidate domain remains `0 <= Mach < 0.8`, forward flow at nonzero speed,
incidence at most 5 degrees, and the declared A1b geometry class. Geometry/domain
errors return an error with a reason and no SB1 coefficients or fallback.
Nonconverged integration errors retain the failed numerical report in the error
detail. Successful computational status does not imply physical accuracy.

At zero speed, flow angles, wind basis, reduced rates, wind coefficients and
flow-state static coefficients are null with an explicit zero-speed reason.
Dimensional **static** loads are zero. Zero-incidence normal derivatives and
their derivative CP diagnostic remain available at the supplied Mach; these are
distinct from undefined flow-state coefficients. At nonzero speed, reduced rates
are only a kinematic diagnostic, normalized with L/(2V). Rates are accepted and
retained but never modeled, including nonzero rates at zero speed. Rate loads,
rate coefficients and total dynamic loads are always null with a static-only
reason. Gravity, thrust and recovery loads are outside this result.

CP means the symmetric zero-incidence derivative ratio J/C as a centerline
station aft of the nose, independent of the requested moment datum. It does not
mean a finite-force application point or dynamic stability. The result retains
C, J, absolute contribution sums, kappa_C and the core policy ID/bound. Exact
zero denominator, an uncertainty interval containing zero, roundoff cancellation
at the existing versioned 64-epsilon relative policy, and nonfinite ratio each
have a distinct null reason. CP suppression never suppresses force/moment or
derivatives. With no physical uncertainty evidence, even a finite ratio remains
unqualified. No alternative CP threshold is introduced here.

Focused native `dispatch_json` tests cover signed pitch/yaw and the vector power
identity, full 3D datum/CG moment translation, CA0 independence of normal
derivatives/CP, zero-speed null versus zero, nonzero-rate unknowns, domain and
invalid-state errors, every adapter option being required, nested unknown keys,
retained source/options roundtrip and explicit CP interval/policy behavior.
Existing engine tests additionally exercise legacy command behavior. These are
implementation checks, not accuracy tolerances against measurements.

At base `d612ce5`, the native engine's offline suite passes **39 tests** (31
existing and 8 new command-boundary tests). The retained log is
`/workspace/astraea-plan/evidence/sb1-diagnostics-20261026/engine-tests.log`.
The initial build caught ambiguous floating-point types in two synthetic test
sign assertions; explicit f64 literals fixed the compile issue before the passing
suite. `git diff --check` passes. `rustfmt` is unavailable in the installed
toolchain; no component installation or network action was attempted. No separate
core rerun, frontend check or WASM rebuild was needed for these engine-only
changes; the coordinator owns independent integrated command review.

The [A1b reference eligibility decision](A1b-reference-eligibility-2026-10-26.md)
still applies. In particular this diagnostic cannot turn the retained ARCAS
lip/anchors/ordinate geometry into a matched case through declarations. Dynamic
evidence, independent measured CN/CA/Cm comparison, environment/axial qualification,
identity/migration policy and production activation remain separate gates.
