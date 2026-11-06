# Actual geometry adapter: integration review

Baseline `8815bcb`; implementation commits `ea6b8c2` and `26a0519`.
The coordinator reviewed the implementation independently of its author and
accepts this **opt-in library/diagnostic foundation**, with the scope below.
No new production provider, command, project migration or flight default is
activated by this acceptance.

The adapter consumes the existing `FrontendVehicle` rather than another vehicle
schema. It retains each source DTO and the explicit declarations, profile,
integration and role record. It follows the actual flat-list station convention:
diametral components advance the chain; fins use the last preceding cylinder's
start. Unknown topology, unsupported shapes/fin sets, disconnected radii and
undeclared nongeometry exclusions fail. Body mass/parachutes may be omitted only
through explicit internal-ID declarations. Ambiguous motor-mount topology fails.

Independent review checked the tangent-circle profile formula, conical/cylindrical/
frustum integrals, signed body moment definition, source-to-station mapping,
reference diameter, fin host constraints, nonconvergence and unsupported-input
paths. The existing typed DTO can have already discarded unknown JSON fields;
this API therefore cannot certify raw source completeness or physical geometry.
Declared sharp-tip, tangent-ogive and thin/slender assumptions stay assertions,
not empirical qualification.

Two review-driven changes were required:

1. Decimal cylinder geometry can give an average area one ULP above the same
   maximum area after multiplication/division. A realistic diameter0.07m,
   start0.1m, length0.31m regression now passes. The separately named
   `body-area-upper-bound-roundoff/1.0.0` allows only relative64eps numerical
   noise in that computed area check; it neither pads diameters nor relaxes
   actual profile joins. Significant excess, nonfinite averages and a one-ULP
   source radius discontinuity still fail.
2. Simpson accumulation now uses Neumaier compensation rather than a naive sum
   over up to a million panels. The reported Richardson estimate and roundoff
   indicator remain estimates, not rigorous error intervals. Independent
   80-digit references test actual absolute error against the requested tolerance
   for length/radius2/1 and0.2/0.03, at ordinary and tight settings. Budget and
   below-roundoff requests fail. The [method note](A1b-real-geometry-adapter-2026-10-26.md)
   records actual versus estimated errors separately.

The optional `scripts/diagnostics/ogive-volume-reference.py` reproduces the
references from both a circle-profile antiderivative and independent high-precision
quadrature, using exact binary64 inputs. Its [retained result](A1b-ogive-volume-reference-2026-10-26.json)
is geometric verification, not an aerodynamic observation.

Integrated offline checks pass: **134 core tests and31 engine tests**. These
include new profile/adapter/roundoff fixtures and the existing legacy parity
fixtures. The flight loads, old aero methods, engine preparation/dispatch and
serialized project schema are unchanged. New native library calls can construct
and evaluate a candidate, but there is no frontend/runtime selection or SB1 WASM
command. The production WASM asset is unchanged.

Before physical comparison, use the [reference eligibility decision](A1b-reference-eligibility-2026-10-26.md).
ARCAS cannot silently become an exact geometry case by selecting tangent ogive
and omitting its lip/anchors. Next work is normalized provider diagnostics and
identity/migration plumbing, E1/T1 environment/supplied-data contracts, and
qualified geometry/coefficient comparisons. Runtime activation, dynamic evidence,
independent flight accuracy and primary collegiate use remain open gates.
