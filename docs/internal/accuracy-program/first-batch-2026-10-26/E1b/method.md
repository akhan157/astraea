# E1b explicit local-state skin friction diagnostic

Schema `e1b-skin-friction-diagnostic/1.0.0`; model
`local-state-inherited-turbulent-friction/1.0.0`; source baseline `1e4779a`.
This opt-in diagnostic has **unqualified empirical accuracy**. No production
friction, drag, force, flight, plotting, migration, calibration, frontend or WASM
consumer changes. It supplies a modeled zero-incidence/streamwise friction
contribution, not finite-angle total drag, CA, a body force vector or a moment.

## Explicit request and shared environment evaluation

The complete reusable synthetic request is
[`friction-synthetic-request.json`](../../../../../crates/astraea-engine/tests/fixtures/friction-synthetic-request.json).
Top-level required fields are `schemaVersion`, `inputIdentity`, `modelId`,
`source`, `geometry`, `conditionIdentity`, and `environment`.

`source` contains nonempty `identity`, `description`, `geometryIdentity`, and
`conditionIdentity`. Its geometry and condition labels must match
`geometry.identity` and the top-level condition label exactly. The labels
are caller declarations, not content hashes or a source applicability check.
`geometry` contains a nonempty identity, positive finite `referenceAreaM2`, and
a nonempty array of surfaces. Each surface supplies a unique nonempty identity,
positive finite `lengthM`, `wettedAreaM2`, and `formFactor`, and nonnegative
finite `roughnessM`. Length and roughness must exactly match the same identity
in the environment request; the two surface identity sets must match exactly.
No surface is invented, dropped, repeated or automatically assigned a shape.
Wetted area, characteristic length, roughness and form factor are caller data,
not qualified geometry or evidence that the correlation applies to that shape.

`environment` is the full unchanged
[E1a request](../E1a/method.md), including profile/source/location/datum/units,
policies, issue/validity times, query velocity and surfaces. The shared engine
`environment_diagnostic::evaluate_typed` strictly parses and evaluates the
actual `EnvironmentProfile` once; both E1a's existing JSON route and this route
render that typed result. This route does not decode E1a result JSON, duplicate
its atmospheric closure, infer altitude from Mach, or use cached Mach-only drag.
The E1a wire response remains exactly equal to its retained pre-refactor fixture.

Unknown fields at every object level, missing required data, unsupported model,
profile policies and stale/out-of-coverage queries fail. The full parsed request
is returned as `input`, and the full rendered E1 evaluation is returned as
`environment`; parsed JSON preserves values, not duplicate-key history or text
formatting. Caller evidence classes never promote empirical qualification.

## Inherited equations and computational support

The source identity names `aero.rs::compute_compressible_skin_friction`,
`apply_van_driest_correction`, and `skin_friction_at_reynolds_per_meter` at
`1e4779a`. The new implementation writes those existing scalar equations into a
separate module with explicit local-state inputs. Source comments call them a
Schlichting turbulent plate law, sand-grain cutoff and Van Driest II correction;
these inherited attributions are **not independently qualified** here. Agreement
with legacy arithmetic is implementation evidence, not independent physical
validation or certification of the attribution.

For each surface, E1 supplies the actual local `rho`, `mu`, `a`, `V`, `Mach`, `q`,
`Re_per_m`, `Re_L=Re_per_m*L`, and `ks/L`. No legacy atmosphere reconstruction,
minimum velocity, minimum length or minimum roughness is used. The public core
API accepts `environment::Evaluation`, which is constructible: it validates
positive finite density, viscosity and sound speed, finite nonnegative flow and
surface results, exact consistency of Mach/q/Re with the consumed local inputs,
and geometry matching before using the zero-speed shortcut. The engine uses the
validated actual profile evaluation, rather than caller-supplied result fields.

For nonzero speed:

```
ks == 0: effectiveRe = Re_L                     # no roughness cap
ks >  0: cap = 51*(ks/L)^(-1.039)
         effectiveRe = min(Re_L, cap)
Cf0 = 0.455 / log10(effectiveRe)^2.58
mterm = 0.2*Mach^2
mparam = sqrt(mterm/(1 + 0.89*mterm))
fc = (asin(mparam)/mparam)^2 if mparam > 0.001, otherwise 1
Cf = Cf0/fc
Cd_friction_i = Cf_i*formFactor_i*Swet_i/Sref
modeledStaticResistance_i = q*Sref*Cd_friction_i
```

The inherited small-parameter threshold `0.001` is retained explicitly; it is
not a transition or flow-regime boundary. `effectiveRe < 1000` fails instead of
applying either inherited Reynolds floor. This minimum is a **computational
support policy replacing the old numerical floor**, not an empirical onset of
turbulence or a validated Reynolds range. No upper empirical Reynolds or Mach
range is invented. Arithmetic must remain finite and positive where a nonzero
value is required; overflow/underflow fails, including an unrepresentable
roughness cutoff. The inherited correction requires `mparam<=1` for `asin`;
queries outside that numerical domain fail instead of clamping or returning NaN.
These computational conditions do not establish compressibility validity.

Smooth `ks=0` is explicit and does not become 0.1 micrometers. No roughness cap
is evaluated for smooth surfaces. For nonzero roughness the uncapped cutoff and
selected effective Reynolds are exposed. At zero speed Cf, Cd, effective Reynolds
and compression intermediate values are null with an explicit reason; modeled
static friction resistance is zero. There is no logarithm-of-zero evaluation and
no rate-dependent load claim. Invalid geometry or consumed local state still
fails at zero speed.

The output retains per-surface length, roughness, wetted area, form factor, Re,
roughness ratio, cap, effective Re, incompressible Cf, compression factor, Cf,
Cd contribution and scalar resistance, plus summed friction Cd and resistance.
Sref only normalizes Cd; it does not choose a characteristic length. Positive
form factors multiply the supplied surface Cf contribution. No pressure, base,
wave or protuberance drag, total Cd/CA, flow-angle transform, moment or force
vector is inferred from friction alone.

## Assumptions and evidence limits

The inherited law assumes a fully turbulent plate-style contribution. It models
no laminar flow or transition, roughness morphology, pressure gradient,
separation, sweep/orientation, surface interaction or boundary-layer history.
Its compression formula retains the inherited adiabatic-wall/recovery `0.89`
assumption; there is no explicit wall-temperature or heat-transfer solution.
E1a's dry ideal-air/constant-gamma/Sutherland assumptions and lack of empirical
temperature qualification remain. A caller's finite positive state is a
computational input, not proof that these omitted effects are negligible.

The fixture uses arbitrary synthetic surfaces and a nonhydrostatic supplied
profile, not weather, a rocket geometry or measured drag. Tests check legacy
agreement only at identical local conditions where legacy floors are inactive,
plus deliberate differences below its velocity/length floors, explicit smooth
and active roughness cap behavior, each surface's own Re, Sref invariance of
modeled resistance, same Mach at different pressures changing Cf and Cd, zero
speed, low-Re rejection, strict identities/fields and nonfinite/extreme state.
They demonstrate the intended arithmetic and interface behavior only.

The author example includes the new modules directly because engine command
registration belongs to the coordinator. Its successful native result is wrapper
evidence, not actual `dispatch_json` route verification. Integration must register
`evaluate_skin_friction_diagnostic` and switch the example to actual dispatch
before claiming route coverage. Existing E1a actual dispatch remains checked.
Author checks pass 149 core tests, 56 existing-engine tests (including the new
E1 golden response), 11 direct-example boundary tests (six E1 and five friction),
and eight independent Python arithmetic/boundary checks. Native examples build.
The direct harness emits one unused-function warning for E1
`evaluate`, which the harness only calls in tests; route integration removes the
direct module inclusion. Rustfmt was already known unavailable; no install was
attempted. These checks are implementation evidence, not empirical acceptance.

Author logs/results and source hashes are retained at
`/workspace/astraea-plan/evidence/local-friction-20261026/`.
No new flight outcome or holdout was read. Physical source/geometry qualification,
empirical accuracy, production adapter activation and flight acceptance remain
outside this bounded packet.


## Integrated command verification

Integration registered `evaluate_skin_friction_diagnostic` and changed the native
example to call actual engine `dispatch_json`. The [independent integration review](../../diagnostics/E1b-A1d1-integration-review-2026-10-26.md)
records 154core/61engine tests and10 independent executable friction cases,
plus exact legacy before/after serialized preservation for the accompanying
mechanical shared-driver refactor. Author direct-wrapper evidence remains
separate. Full route response and source/binary/log hashes are retained under
`/workspace/astraea-plan/evidence/friction-provider-integration-20261026`.
No production friction consumer or empirical qualification is activated.
