# RMP06a — local total zero-incidence axial composition

Status: **implemented and independently accepted for the bounded native direct
diagnostic** at source `15be61b`. Independent pre-implementation review required
three clarifications, now incorporated: nose as well as base reference conversion,
whole-body/all-fin friction coverage without pressure in form factors, and
LE-only sweep scaling with sweep length in metres. Implementation review found
one lost-positive fin-edge contribution issue, fixed and independently accepted;
final separate high-effort audit also ACCEPT. Parent RMP06 remains partial until
shared flight/query/curve integration and applicable support/identity checks are
evidenced.

## Source/component inventory (before implementation)

Inspected at accepted local base `3d9ca93`; equations are in
`crates/astraea-core/src/aero.rs` and the accepted `skin_friction.rs`. No new
external source or measurement is claimed.

| Legacy term | Equation/normalization and geometry | Dependencies and hidden policy | RMP06a decision |
| --- | --- | --- | --- |
| Body/fin friction | `Cf=0.455/log10(Re_eff)^2.58`, inherited compressibility factor; `CA_i=Cf_i*FF_i*Swet_i/Sref` | local rho/V/mu, length/roughness, Mach, wetted area, FF. Legacy builds a sea-level atmosphere and floors V>=1 (curve wrapper >=10), L>=.05, ks>=.1um, Re>=1000 | Reuse E1b direct local evaluator, no atmosphere reconstruction/floors. Surface data explicit, no automatic whole-body cylinder area or first-fin selection. `Re_eff<1000` refuses. Fully turbulent, adiabatic/recovery=.89 assumption, no wall/transition/humidity model; unqualified |
| Nose pressure (legacy named wave) | `compute_nosecone_wave_drag`: for M<.8 constant .005; at .8–1.1 shape/fineness smoothstep; above 1.1 inverse sqrt(M²−1), +.02, cap 1.2 | Mach/shape/length/D; internal D floor .01, supersonic denominator floor .1 | Call original function only for 0<=M<.8; label inherited **pressure offset**, not physical subsonic wave drag. Explicit shape/length/D; D>=.01 so hidden floor inactive. No transonic branch claimed |
| Fin wave/thickness | `crossSectionFactor*(t/c)^2*(A_fin/Sref)` with transonic rise/supersonic factor | Mach/area/root/thickness/cross-section; area floor 1e-4, root floor .01, denominator floor .1, cap .8 | Call original trapezoid function only M<.8, where contribution is exactly zero; record the inactive term rather than imply transonic support |
| Fin leading/trailing edge | `compute_fin_edge_drag`: square LE .85*(1+M²/4+M⁴/40); rounded LE `(1−M²)^(-.417)−1` in this envelope; LE alone multiplied by `span²/(span²+sweep_length_m²)`; both LE/TE scaled by `n*span*t/Sref`; TE `( .12+.13M² )` square, half rounded, zero airfoil/double-wedge | Mach/planform/thickness/cross-section/reference. Sref floor 1e-4; no local Re dependency in inherited pressure terms | Reuse function, exact explicit trapezoid geometry; restrict Sref>=1e-4 so floor inactive. First-fin shortcut removed; every declared fin set included once. No extra body interaction or sweep model invented |
| Body base | `compute_base_drag`: M<.8 => `(.12+.13M²)*(Dbase/Dref)^2*(powered?.38:1)` | Mach/base/reference diameter/power; Dref floor .01. All .12/.13/.38 and plume factor are project-authored, unvalidated fits | Call inherited function; Dref>=.01, cylindrical Dbase=Dref (no boattail). Coast supported; powered only with explicit inherited-plume-factor-.38 assumption. No nozzle area subtraction/sting model. Nozzle/thrust not counted as axial aero |
| Boattail surface pressure | McCoy similarity parameter, chart slopes 1.2/1.8/1.2 with onset M>.85, aft transition selection in wrapper | Mach/length/fore/aft/reference D; positive clamps; source applicability not qualified | Absent by mandatory declared nose+cylinder geometry with no aft transition. Not silently zeroed for arbitrary source |
| Protuberances | wrapper hardcodes 0 despite placeholder helper elsewhere | No actual geometry/source in current total | Explicit clean-configuration declaration: no protuberances, launch lugs, rail buttons, external attachments. Other configurations refused; no physical generality implied |
| Total curve floor | `max(friction+wave+base+protuberance,.15)`; CP/stability-dependent preparation | Empirical floor, legacy calibration/default and sea-level Mach cache | NOT reused. New total is the exact identified component sum; CP/normal slopes/calibration cannot influence it |

Source identities preserve inherited equation provenance, not primary-source or
physical qualification. Existing aero/legacy functions are read-only.

## Bounded input/output contract

- Prepared immutable geometry: nonempty source/geometry/condition identities,
  explicit Sref and Dref, declared nose shape/length/base equal Dref, positive
  body length, explicit body friction surface and one friction surface per fin
  set, trapezoid planforms/cross-sections/thickness/sweep/count and matching
  identity. Sweep is leading-edge axial sweep length in metres, not an angle.
  The single body friction surface covers nose plus cylinder; each fin surface's
  wetted area covers all fins in its set and both exposed faces (count already
  included). Form factors include no separately summed nose/edge/base pressure
  contribution. These coverage/convention declarations are mandatory; no inferred
  or missing area. Every surface is included exactly once. E1 surface identity sets,
  lengths and roughness match exactly. Wetted area/form factor remain supplied
  assumptions (not measured/inferred from the shape). No total-Cd fitting.
- Supported configuration declaration: clean nose+cylinder+trapezoid fins,
  unobstructed base; no transitions/boattail/protuberances/sting. Enforce this as
  an explicit single-supported enum, not a default inferred from absent fields.
- Explicit `coast` or `powered` query; powered refused unless the prepared
  policy is `inherited-plume-factor-0.38`; `coast-only` never accepts powered
  inputs. No missing/burnout inference, interpolation or averaging of power.
- Consume actual typed E1 sample (P/T/rho/mu/a/wind), ground-minus-toward-wind,
  q/M/Re and exact per-surface results, with no new atmosphere. E1 still owns
  geometric-MSL/integer-UTC-time/units/profile coverage. Source stays already
  toward ENU. No AGL/stage-clock conversion or forecast application claimed.
- Return per-surface friction plus nose pressure, fin wave/LE/TE and body base;
  sum as `CA0` on Sref. Return modeled zero-incidence axial force
  `F_body=(0,-q*Sref*CA0,0)`. P0 +Y forward. No normal force, moment, wind drag,
  gravity, thrust or recovery is added. Re-referencing Sref rescales CA but not
  force, including the base term (legacy base function is on pi*Dref²/4, so
  convert it to the explicit Sref exactly once). The nose pressure offset is also
  on body frontal area, so `CA_nose=.005*(pi*Dref²/4)/Sref`; fin wave/edge
  routines already normalize to Sref. Only leading-edge pressure uses the sweep
  cosine squared; trailing-edge pressure does not.
- At V=0: all component/total coefficients null with a reason, static loads zero;
  validate local state and geometry and power before that shortcut. At V>0:
  `Re_eff<1000`, M>=.8, invalid/overflow/underflow, missing component/surface/
  identity/unsupported geometry refuse. No fixed speed floor or force waiver.
  A positive finite sweep quotient is required before calling the inherited
  source. At positive Mach, expected-positive LE (square/rounded/airfoil) and TE
  (square/rounded) must be positive representable; cancellation/underflow refuses.
  Double-wedge LE/TE, airfoil TE and subsonic wave zeros remain structural zeros.
- Direct evaluation only; no cache/interpolation of axial coefficients. E1
  profile interpolation remains the pre-existing identified log-P/linear-T/wind
  policy. Raw parsed inputs retained, identifiers caller declarations, empirical
  status unqualified. Native helper only; no app dispatch/default/project/WASM.

## Known integration boundary

This direct total source cannot launch a trajectory from rest without hitting its
nonzero low-Re refusal. A zero-speed point is supported but an arbitrarily small
positive speed is not. No negligibility approximation will be silently used to
extend the E1b source. RMP06b needs a reviewed startup source/composition, or a
complete supplied axial source with declared all-stage coverage, before native
trajectory integration can be accepted. RMP06-C07 is not satisfied by calling
this standalone diagnostic a flight provider.

## Implemented interfaces and fresh evidence

- `astraea_core::axial::PreparedAxial::prepare(Geometry, Source, PowerPolicy)`:
  owns validated numeric geometry/source/policy; immutable getters and
  `surface_inputs()` support exact E1 matching.
- `PreparedAxial::evaluate(&environment::Evaluation, PowerState)` consumes the
  typed local E1 state, returns component CA0/force, per-surface friction
  intermediates, explicit source/geometry/condition identities, total CA0 and
  negative-Y force (or a source/model reason). No Mach-only lookup/cache.
- Native-only `astraea_engine::axial_diagnostic::evaluate(&Value)`: strict schema
  `rmp06-local-total-axial-diagnostic/1.0.0`, E1 parser/evaluator reused once;
  complete parsed request and rendered typed E1 output retained. Not in dispatch
  and excluded from engine WASM compilation. Core module has no new dependency.
- Portable synthetic fixture and `axial_diagnostic` executable; independent
  checker `scripts/diagnostics/check-total-axial-boundary.py`. Fixture result:
  CA0=0.24950090926721638; force=(0,-4.345905150978223,0) N. Seven components,
  including an explicitly inactive subsonic fin-wave term. These are arbitrary
  declared geometry/environment conditions, NOT measured drag or flight data.
- Fresh final source tests: **177 core**, **70 engine all-targets**, **22 native
  independent Python arithmetic/boundary checks**. Explicit positivity checks
  distinguish tiny lost contributions from structural zeros rather than letting
  an absolute tolerance accept an erased term.
- Retained RMP01 native report still hashes `a8b08ccb…`, and legacy full response
  still hashes `f37d195f…`; no changed result/default on either synthetic case.
- Separate read-only review (same installed model, independent sessions, serial):
  contract clarifications; one implementation defect; focused ACCEPT after fix;
  final high-effort full audit ACCEPT. Verbatim dispositions, per-check status,
  source/runtime hashes and commands: [run result](../../execution-runs/RMP06-local-axial/RESULT.md)
  and [evidence](../../execution-runs/RMP06-local-axial/EVIDENCE.json).
- Rustfmt component is unavailable; no format success or installation claimed.
  Diff whitespace check passes; no new manifests/locks, frontend or generated
  artifacts changed. No holdout, publication, push or new external source used.

Reproduce from repository root with the installed Rust toolchain on PATH and a
serial external Cargo target directory:

```sh
CARGO_BUILD_JOBS=2 cargo test --offline --manifest-path crates/astraea-core/Cargo.toml -- --test-threads=2
CARGO_BUILD_JOBS=2 cargo test --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --all-targets -- --test-threads=2
CARGO_BUILD_JOBS=2 cargo build --offline --locked --manifest-path crates/astraea-engine/Cargo.toml --example axial_diagnostic
python3 scripts/diagnostics/check-total-axial-boundary.py "$CARGO_TARGET_DIR/debug/examples/axial_diagnostic" crates/astraea-engine/tests/fixtures/axial-synthetic-request.json
```

First RMP06b step can wire the actual typed E1 profile through the existing
prepared candidate using its already-explicit prescribed axial source, so shared
flow/state/time semantics are checked without pretending that the local inherited
source supports startup. Integration of `PreparedAxial` then needs a separate,
prospectively reviewed source/support decision, not a speed/Re floor or automatic
blend. Profile identity/migration/app exposure remain RMP07 work.
