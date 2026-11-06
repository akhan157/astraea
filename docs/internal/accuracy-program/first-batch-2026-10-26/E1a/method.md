# E1a explicit tabulated environment diagnostic

Schema: `e1a-environment-diagnostic/1.0.0`. Source baseline: `f387132`.
This is an opt-in implementation foundation with **unqualified empirical
accuracy**. It does not activate an environment provider in production flight,
drag, friction, calibration, or uncertainty workflows.

## Supplied source and immutable profile

`astraea_core::environment::EnvironmentProfile::new` takes owned metadata and
knots. Its fields are private; read access is by immutable reference. All
metadata and knots are copied into owned values at the JSON boundary, so later
mutation of the caller's JSON cannot alter an evaluated profile.

The request must declare a nonempty caller source identity and description,
evidence class (`synthetic`, `observed`, `forecast`, or `reference`), location
identity, latitude and longitude, horizontal datum identity, vertical datum
identity, issue time, and inclusive validity interval. Latitude and longitude
must be finite and within conventional degree bounds. Issue time is provenance;
it neither establishes applicability nor constrains validity by inference.
Times are explicit integer UTC Unix seconds. Evaluation time must lie within
the declared interval. The table is constant in time within that interval;
there is no temporal interpolation. There is one declared location and no
spatial interpolation or geographic applicability assessment.

The only supported altitude is **geometric altitude above mean sea level in
meters**, including negative values when explicitly tabulated. The query must
declare `geometricMsl`. The caller supplies the vertical datum identity; the
module performs no geoid, geopotential, ellipsoid, station-height, or AGL
conversion. The caller is responsible for expressing query altitude in that
same declared reference. The location metadata does not perform a navigation
frame rotation or datum conversion.

All units are explicitly declared: `m`, `Pa`, `K`, `m/s`, and `UTC Unix seconds`.
Surface lengths and roughnesses are explicitly in meters by their field names.
The supported interpolation and extrapolation policies must be declared, as
must `closureId: dry-ideal-air-sutherland/1.0.0`. No defaults are inserted.

Source identity is a caller label, **not a content hash**. The complete parsed
request, including every source declaration, units, policy, time, knot, query,
and surface specification, is returned as `input`. Source quality, measurement
error, forecast skill, launch applicability, and source licensing are not
invented from those declarations. A declared `observed` or `forecast` class
never changes the diagnostic's unqualified status.

## Validation and interpolation

At least two altitude knots are required. Single-knot profiles are rejected.
Altitude knots must be finite, strictly increasing, and unique; every adjacent
span must remain finite and positive in floating point. Pressure and absolute
temperature must be positive finite values, and every ENU wind component,
including vertical wind, must be finite. No monotonicity or hydrostatic
consistency is inferred for the independently supplied pressure and temperature.

For bracket endpoints 0 and 1 and `f=(h-h0)/(h1-h0)`:

```
ln(P) = (1-f)*ln(P0) + f*ln(P1)
T     = (1-f)*T0     + f*T1
wind  = (1-f)*wind0  + f*wind1   [separately for east, north, up]
```

Exact endpoints return the supplied values directly. Altitude coverage and
time validity endpoints are inclusive. Out-of-coverage queries fail; there is
no clamping, fallback profile, implicit surface-wind shear, or extrapolation.
Unknown fields are rejected at every JSON object level; missing required
fields, unsupported unit/datum/policy/closure values, and nonfinite or invalid
numerical state also fail the diagnostic.

## Named assumed dry-air closure

The new module uses these existing source identities at baseline `f387132`:

| Quantity | Value/equation | Existing source |
| --- | --- | --- |
| Dry-air R | 287.05287 J/(kg K) | `six_dof.rs::atmosphere_at` |
| Constant gamma | 1.4 | `six_dof.rs::atmosphere_at` |
| Density | `rho=P/(R*T)` | Same named ideal-air closure |
| Sound speed | `a=sqrt(gamma*R*T)` | Same named ideal-air closure |
| Dynamic viscosity | `mu=1.458e-6*T^1.5/(T+110.4)` Pa s | `aero.rs::compute_compressible_skin_friction` |

The output records the exact baseline source identities and constants.
Sutherland's coefficient has SI dimensions Pa s K^(-1/2), and its temperature
constant is 110.4 K. This copies the existing viscosity equation and constants,
not the friction function's density constant, altitude atmosphere, velocity,
length, roughness, or Reynolds floors. It calls no existing friction routine.

Positive finite temperature and finite positive derived density, sound speed,
and viscosity are **computational** conditions. They are not a claimed empirical
temperature range or a demonstrated physical validity domain. This packet does
not supply a new source qualification for constant gamma, dry-air behavior, or
Sutherland viscosity. Humidity and gas-composition effects are not modeled.
Pressure and temperature are independent table inputs: this closure does not
make their profile hydrostatically consistent.

## Wind, flow, and surface inputs

Vectors use navigation ENU: east, north, up. Profile wind is already a velocity
**toward** each component. The import-only helper
`meteorological_from_to_toward_enu` accepts nonnegative horizontal speed,
meteorological-from azimuth clockwise from north, and an explicitly toward-up
vertical component. It computes `east=-speed*sin(from)` and
`north=-speed*cos(from)`. Thus from north (0 degrees) points south, and from east
(90 degrees) points west. Already-toward profiles are never reversed. The
diagnostic itself accepts only toward-ENU knots.

```
v_air_ENU = v_ground_ENU - wind_toward_ENU
V        = norm(v_air_ENU)
Mach     = V/a
q        = rho*V^2/2
Re_per_m = rho*V/mu
Re_i     = Re_per_m*surface_length_i
ks/L_i   = supplied_roughness_i/surface_length_i
```

Each surface has a nonempty unique identity, a positive finite length in
meters, and explicitly supplied nonnegative finite roughness in meters. Zero
roughness is allowed. An empty surface list is allowed for environment-only
queries. No length, roughness, velocity, or Reynolds floor is applied. Zero
airspeed returns Mach, q, Re-per-meter, and surface Re all exactly zero.
Nonzero-flow underflow and any nonfinite derived quantity fail rather than
being serialized as null or silently erased. Nonzero roughness whose ratio
underflows also fails. Invalid surface input fails the complete diagnostic.

There are no flow angles, reduced rates, body-axis transforms, forces, moments,
Cf correlations, transition models, roughness cutoffs, Cd tables, or drag
changes here. A later friction provider can consume the explicit environmental
and surface inputs after its own equation and applicability review. A Mach-only
cached drag value is never queried by E1a.

## Implementation evidence and limits

The reusable request is
`crates/astraea-engine/tests/fixtures/environment-synthetic-request.json`.
Its arbitrary nonhydrostatic table verifies log-pressure interpolation,
linear temperature and three-component wind interpolation, ground-minus-wind,
surface scaling, and complete metadata retention. At 500 m it gives P=50000 Pa,
T=250 K, wind=(4,2,-1) m/s and air-relative velocity=(30,40,0) m/s, V=50 m/s.
These are implementation expectations, not environmental observations.

Core tests cover interpolation, endpoints, no extrapolation, zero speed,
invalid input, overflow/underflow, surface length/roughness, and wind-from
cardinals. An analytic isothermal pressure fixture checks supplied-table
interpolation and closure only; it does not validate atmosphere generation.
Wrapper tests cover strict nested fields, required metadata, full-input
preservation, source-class separation from qualification, and identical speed
and isothermal Mach at two supplied pressures producing different Reynolds
numbers. The fourfold pressure ratio gives a fourfold Reynolds ratio.

The native example's initial author check includes the wrapper directly because
engine registration belongs to the integration owner. That check is evidence
for the wrapper only. Integration must register
`evaluate_environment_diagnostic`, make the example use the actual engine
dispatch, and retain a diagnostic result from that route before claiming route
verification. Author evidence is retained outside the repository under
`/workspace/astraea-plan/evidence/environment-20261026/`, with source hashes and
command logs; integration evidence must identify its own source state.

No new weather or flight data, protected holdouts, trajectory comparisons,
physical accuracy acceptance, or launch/landing probability claim is part of
this packet. Existing atmosphere, friction, loads, model dispatch, commands,
frontend, and WASM production consumers are unchanged by the E1a author work.


## Integrated route verification

The integration owner registered the actual engine command and changed the native
example to use `dispatch_json`. The [independent integration review](../../diagnostics/E1a-T1a-integration-review-2026-10-26.md)
records 142 core and55 engine tests plus15 native boundary/interoperability cases.
The earlier author direct-wrapper result remains separate evidence. Full actual
route output, binaries/source hashes and logs are retained in
`/workspace/astraea-plan/evidence/environment-tables-integration-20261026`.
Production flight/friction consumers remain unchanged; no empirical status is
promoted by these checks.
