# Local friction and shared-driver integration review

Accepted for the bounded scope after independent coordinator review. Base
`1e4779a`. E1b author `e36a1a6` integrated as `c7b1c0c`; A1d design `a62018d`
as `79152bc`, mechanical refactor `775d30c` as `1863773`. Integration adds the
actual skin-friction JSON command and changes its example from the author's
direct wrapper to actual engine `dispatch_json`. No candidate flight provider,
project migration or default switch is implemented by this packet.

## E1b: actual local state to an identified friction component

The [method](../first-batch-2026-10-26/E1b/method.md) uses the same strict E1
parser and typed profile evaluation as the existing environment command. The
parser/render split preserves the old E1 JSON response exactly; a frozen parsed
response at `1e4779a` is now a portable regression fixture. The friction route
neither reparses a rendered result nor constructs another altitude atmosphere.

Each declared surface has explicit identity, length, dimensional roughness,
wetted area and form factor. Its length and roughness must exactly match the E1
surface set. Source/geometry/condition labels must match but remain caller
assertions, not verified hashes, measured geometry or qualified applicability.
Local density, viscosity, Mach and surface Re feed the named inherited turbulent
plate/roughness-cap/compressibility equations. No sea-level Mach-only cache is
used. Explicitly smooth surfaces have no synthetic minimum roughness. Effective
Re below1000 is rejected instead of floored; this is inherited numerical policy,
not an empirical turbulence boundary. Finite arithmetic and the inherited asin
domain are enforced without inventing a validated Mach/temperature range.

The result is Cf, each surface's `Cf*formFactor*Swet/Sref`, summed friction Cd,
and a modeled zero-incidence/streamwise scalar resistance `q*Sref*Cd_friction`.
It is not total Cd/CA or a finite-incidence body force. Pressure, base, wave,
protuberance, orientation, moments, transition, humidity/composition and rate
models remain outside this result. Zero airspeed returns null coefficients with
a reason and zero modeled static resistance, not a claim of zero dynamic loads.
The core also validates consumed constructible E1 fields/consistency, so invalid
local state cannot pass through the zero-speed branch.

Independent review checked local Re/surface matching, units, normalization,
roughness smooth limit/cap, inherited correction/branch and domain, status/null
semantics, scalar contribution labeling and old E1 output preservation. Existing
production friction/drag functions are unchanged. The new law is explicitly
inherited and empirically unqualified; matching legacy arithmetic is not an
independent physical validation of its source label or accuracy.

## A1d-1: one mechanical evaluator path, legacy physics retained

The [source-specific design](A1d-provider-integration-design-2026-10-26.md)
records two preparation guards that must be avoided by a future independent-
moment provider: legacy stability and legacy drag-table generation both depend
on CP. Computing legacy loads and overwriting them afterward is insufficient.
A separate candidate diagnostic must also represent absent CP without filling
legacy required numeric fields with fabricated values.

This increment introduces only private `DriverLoads`, `LoadContext`, `LoadPhase`
and a shared driver. `From<FlightLoads>` transfers already computed values with
no arithmetic. The original public `simulate_flight` passes the unchanged legacy
load function, preserving validation/defaults,300-second horizon, rail projection,
integration/event order, result/validity and telemetry semantics. All five load
sites use the same evaluator, including adaptive endpoint stages, rail-exit read,
macro read, touchdown telemetry read, and the stage closure shared by burnout
root reconstruction and event refinement. Dense-output interpolation does not
acquire a new RHS call. Current flags and state/time are passed at each query.
Errors propagate without fallback, retrying with another model or partial success.

The coordinator independently compared these four functions byte for byte against
`1e4779a`: `compute_flight_loads`, `diagnose_flight_loads`,
`normal_slope_at_mach`, `integrate_rigid_adaptive`; all are unchanged. A full
source diff review found only evaluator/context routing and focused tests around
the driver. No physical equation, mass/inertia assembly, accepted tolerance,
event localization, default horizon or public simulation DTO was changed.

The five new core tests verify arithmetic-free conversion; callback coverage of
all purposes/current flags and whole-result identity; errors at each of nine
purposes with no subsequent call; rejected adaptive trial/retry visibility and
error propagation; and abnormal-touchdown refinement flags/error propagation.
These synthetic tests exercise the same integrator/driver without measured flight
outcomes. They are not numerical convergence or empirical accuracy studies.

## Integrated verification and exact preservation evidence

- **154 core tests** pass:142 retained from the prior integration, seven new
  friction tests and five new shared-driver tests.
- **61 engine tests** pass:55 retained, the old E1 full-response regression and
  five new friction tests. All example targets compile; ordinary native builds
  for the friction command and legacy snapshot probe pass.
- **10 independent native friction cases** pass through actual JSON dispatch.
  The checker independently calculates the inherited scalar law/contributions,
  checks dimensional resistance under changed reference area, zero-speed nulls,
  low-Re rejection, surface/source/field/time errors, and same-Mach/speed pressure
  changes affecting local Re/Cf. [Result](E1b-A1d1-native-friction-check-2026-10-26.json).
- A newly justified before/after regression uses one longstanding synthetic
  telemetry-parity vehicle/motor/options, excluding its expected point arrays.
  One standalone call was captured before integration at `1e4779a`, and one after.
  Complete serialized command output is **byte-identical,1,969,393bytes**, SHA256
  `f37d195fc903e3599603706a9e3f6b95b152d7a79b4639a31f50fa4f64972249`.
  [Exact preservation record](E1b-A1d1-legacy-preservation-2026-10-26.json).

The before probe executable, input, response, source identities and build log
were retained before source integration. The after response/executable hashes,
full friction response, logs and source/evidence hashes are retained under
`/workspace/astraea-plan/evidence/friction-provider-integration-20261026`.
Author evidence remains in `local-friction-20261026` and
`provider-integration-20261026`. The standalone before/after pair is separate
from the suites' synthetic fixture calls and from the already completed N1
experiment. No new observed/holdout flight was inspected or scored.

Two bounded Sol/high agents authored independent files; coordinator review and
integration required no scientific model change or additional model escalation.
The friction author had no failed attempt; driver-focused tests were strengthened
before its final retained suites. Rustfmt is known unavailable; no installation
or repeated toolchain investigation was performed. New JSON/Python syntax,
local method links and diff whitespace checks pass. No broad frontend/browser,
updater, packaging or completed source/N1 study was repeated.

Reproduce the new command check after sourcing `/workspace/astraea-plan/env.sh`:

```sh
CARGO_BUILD_JOBS=1 cargo build --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --example friction_diagnostic
python3 scripts/diagnostics/check-local-friction-boundary.py crates/astraea-engine/target/debug/examples/friction_diagnostic crates/astraea-engine/tests/fixtures/friction-synthetic-request.json
```

Next A1d-2 must provide an explicitly identified native candidate static/rate/
recovery composition and bounded experimental result without legacy CP guards.
Rail constraints or negligible forces must not waive SB1 domain limits. Unsupported
speculative stages must stop with a reason. A truncated trajectory cannot reuse
landing fields as if completed. Native mechanical preparation, common plot/load
queries, explicit model migration and stale calibration remain unfinished.
E1b still needs integration with a reviewed complete axial provider; it supplies
only friction. Source-specific table import/qualification, higher-regime/rate
physics, independent as-flown/team/platform evidence remain open. Bundled WASM
was not rebuilt. Nothing was pushed, published, deployed or sent externally.
