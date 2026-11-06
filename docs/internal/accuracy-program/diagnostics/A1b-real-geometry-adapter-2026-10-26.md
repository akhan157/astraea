# A1b actual frontend geometry adapter — 2026-10-26

Status: opt-in native library only, empirically unqualified, independent root
review required. Base `8815bcb`. No command dispatch, load assembly, saved schema,
provider default, existing geometry/mass/aero implementation or flight study is
changed. Runtime edits are two new modules and their public module declarations, plus the
root-authorized narrow SB1 area-validation roundoff policy described below.

`astraea_engine::sb1_geometry::adapt_frontend_vehicle` consumes the actual
`models::FrontendVehicle`. Its explicit `AdapterOptions` produce the existing
SB1 `CandidateGeometry`, canonical `References` (D=max external body diameter,
S=pi D²/4, L=D), and a support report. The report retains every component's
source index, ID and complete cloned typed DTO, exact profile definition or
fin dimensions/host, analytic/quadrature diagnostics, caller source identity,
all options and declaration provenance. Identity is caller supplied, **not** a
computed canonical hash/cache key. No legacy CNa, CP, stability(), mass-derived
shape constants or unverified legacy geometry formulas are called.

## Support and station semantics

The source station semantics were inspected in `aero.rs`'s existing flat-chain
walk: nose/tubes/transitions advance stations; fins and explicitly declared
internal mass/parachute components do not. A fin offset is relative to the
start of the most recent **preceding** body tube, including when several tubes
exist. A fin requires a real cylinder host and its complete root chord must fit
that cylinder. Local radius comes from that retained source cylinder, rather
than a previously seen transition or the reference diameter. SB1 also checks
both tip endpoints against the final body's extent.

Supported profiles are one initial conical or explicitly interpreted tangent-
ogive nose, cylinders, and explicitly interpreted conical transitions, followed
by a declared flat exposed aft base. There is exactly one three/four trapezoidal
fin set. All required source shape/dimensions/sweep/offset values are explicit;
there are no ARCAS constants, rake choices, generic-ogive substitutions, closing
caps or geometry defaults. Diameter continuity is exact; a gap or mismatch
fails. Unsupported component kinds, nose/fin shapes, unknown cross-sections,
conflicting role dimensions, nonzero body offsets, multiple fins and motor-mount
`true` fail with source index/ID and reason. `isMotorMount=true` never becomes
part of a silently reinterpreted exterior chain.

Mass components/parachutes may be excluded only by explicitly listing each ID
in `internal_non_geometry_ids`, with the declaration provenance retained.
Unknown/missing/duplicate exclusion IDs fail. These exclusions retain their DTO
and non-geometry role; no positions or source dimensions are rewritten.

The physical sharp tip, circular symmetry, smooth/piecewise-smooth slender body,
identical equal-spaced thin uncanted fins, complete external-source geometry and
absence of unmodeled external attachments/interferences remain caller
assertions. No empirical slenderness/thinness cutoff is invented. Known fin
cross-sections/thickness are retained, but the thin-fin idealization does not
predict their effects. The DTO cannot itself verify those assertions. Its
existing serde decoding can discard unknown raw JSON fields before this API;
this adapter therefore makes **no raw-JSON completeness/fail-closed claim**.

## Independent integration

`astraea_core::aero_profiles` defines cone/cylinder/frustum profiles and exact
closed-form area integrals, independent of legacy shape routines:

- Linear-radius interval: integral A dx = pi h (r0²+r0*r1+r1²)/3.
- Constant-radius interval: integral A dx = pi r² h directly.
- Tangent ogive: rho=(L²+R²)/(2R), r(x)=sqrt(rho²-(L-x)²)+R-rho.

The ogive implementation uses an algebraically rationalized dimensionless
circle expression to preserve the sharp tip and finite arithmetic. L>R is
required for the sharp tangent-ogive geometry. It integrates the actual squared
radius, with composite Simpson refinements and Richardson |I(2n)-I(n)|/15 error
estimate. Absolute/relative tolerances and a bounded power-of-two panel budget
are caller supplied. Acceptance requires estimated error plus a separately
reported 64-epsilon scale indicator to fit the requested tolerance. Failure
returns no geometry and retains the full nonconvergence report. Reports identify
method, panels, total evaluations, integral, error estimate, roundoff indicator,
budget and convergence. These estimates are convergence diagnostics, not
rigorous integration bounds or physical uncertainty.

Integration uses the represented floating-point station width `x1-x0`.
Specializing cylinders avoids unnecessary three-term multiplication/division
roundoff, which initially caused the old strict SB1 maximum-average-area check
to reject the decimal fixture. No D inflation, integral clamping or profile
substitution is used. Independent root review then reproduced a remaining cylinder case D=.07,
x0=.1, L=.31 whose average area rounds one ULP above the maximum. The root
explicitly authorized the narrow existing-core extension
`body-area-upper-bound-roundoff/1.0.0`: finite nonnegative endpoint/average areas
may exceed the finite positive reference maximum by at most 64*f64::EPSILON
relative. This is numerical upper-bound validation only. It adds no absolute
area allowance, geometry matching tolerance, D padding, integral clamping or
force/moment changes. NaN/infinite averages and significant excesses fail.
Real source radius gaps still fail exactly. Boundary/next-ULP and 1e-8 relative
excess tests cover the policy. Analytic reports identify exact formula
use with a separate roundoff indicator, not a quadrature accuracy certificate.

## Bounded verification

Commands source `/workspace/astraea-plan/env.sh`, then set `CARGO_BUILD_JOBS=1`,
use `--offline` and a 2 GiB virtual memory limit. No toolchain/dependency install,
network access, simulation, holdout read, fit, push, publication or activation.
Rustfmt is absent in the installed toolchain; no component was installed.

Focused core profile tests: **3 pass**. They verify analytic cone/cylinder and
expanding/contracting frustum integrals, actual circular ogive convergence
against an independent analytic circle antiderivative, tighter-tolerance
refinement, explicit nonconvergence and nonfinite/overflow failure.

Focused actual DTO adapter tests: **6 pass**. They verify a deserialized existing
FrontendVehicle → retained source profiles → CandidateGeometry → evaluate_static
chain with prescribed synthetic CA0, exact cone C/J and zero cylinder C/J,
multiple-tube fin station/host semantics, ogive interpretation/convergence/
nonconvergence, contraction sign and local radius, per-component provenance,
explicit internal exclusions, and unsupported/missing/nonfinite declarations.
The root's realistic decimal cylinder repro is accepted without D padding;
a one-ULP real source radius mismatch remains rejected. Core area-validation
fixtures additionally cover the exact numerical-policy boundary, next ULP,
1e-8 relative excess, nonfinite values and absence of an absolute-area allowance.
Fixtures are analytic/synthetic, not measured qualification or as-flown claims.
`git diff --check` passes. Root independent review is the integration gate.

## Root review numerical follow-up

Root review identified that naive positive accumulation through as many as
1,048,576 Simpson panels can incur roundoff growth inconsistent with the fixed
64-epsilon diagnostic. Weighted Simpson terms now use **Neumaier compensated
summation**, including the final correction. The indicator remains explicitly
nonrigorous: it does not certify radius evaluation, quadrature truncation,
physical geometry or empirical uncertainty. Requested tolerances below that
indicator still fail closed within the explicit budget.

The independent ogive checks now compare measured absolute integration error
against the **actual requested tolerance**, rather than a looser shared `near`
assertion. References were evaluated with preinstalled mpmath 1.3.0 at 80 decimal
digits using the circle antiderivative given in the test. Dimensions are the
exact binary values supplied to Rust: L=2/R=1 and
L=`0x1.999999999999ap-3`/R=`0x1.eb851eb851eb8p-6` (the realistic .2/.03 case).
The references, rounded once to f64 for comparison, are:

- 3.5812292173357824379077309837269299088426662306508009985846553 m³.
- .0003035244945186137991210792566183266448428345196127950191829 m³.

Root independently computed the decimal-exact .2/.03 reference as
.0003035244945186138050935047287249463668112908494846909525333 m³ and cross-
checked its antiderivative against high-precision direct circle quadrature.
Its approximately 6e-21 m³ difference from the exact-binary fixture reference
is far below the requested test tolerance; no reference was fitted to SB1.

| L, R (m) | Tolerance case | Measured absolute error (m³) | Richardson estimate (m³) | Requested tolerance (m³) | Panels |
| --- | --- | --- | --- | --- | --- |
| 2, 1 | standard | 3.76232e-12 | 3.76241e-12 | 3.68123e-11 | 1024 |
| 2, 1 | tight | 2.35367e-13 | 2.35130e-13 | 3.58124e-13 | 2048 |
| .2, .03 | standard | 3.21644e-13 | 3.21631e-13 | 1.00304e-12 | 128 |
| .2, .03 | tight | 4.93312e-18 | 4.90782e-18 | 3.13524e-17 | 2048 |

All four measured errors meet their requested tolerance. Estimates and measured
errors are recorded separately; their small differences demonstrate why the
Richardson estimate is not labeled an exact bound. For both geometries,
insufficient-panel tight-tolerance cases and below-roundoff-tolerance cases
return nonconvergence. Three profile tests and six adapter tests pass after
this change, using the same offline, one-job, 2 GiB limits. Follow-up output is
retained separately at `/tmp/A1b-geometry-review/profile-compensated-20261026.log`
and `/tmp/A1b-geometry-review/adapter-compensated-20261026.log`; prior results
are preserved in the earlier commit and session evidence.
