# Native candidate interface contract and numerical invariants

These are target semantics for RMP01, not declarations that the interfaces already
exist. Rust spelling/module boundaries may be chosen during reviewed implementation;
changing frames, source identity, support/null or result semantics is a decision.
Normative source: [P0](../accuracy-program/first-batch-2026-10-26/P0-contract.md),
[A1d design](../accuracy-program/diagnostics/A1d-provider-integration-design-2026-10-26.md).

## Current code map

- `crates/astraea-core/src/aero_coefficients.rs`: accepted static SB1 equation,
  Vec3/References/Datum, wrench translation/re-reference/dimensionalization,
  normal C/J and derivative CP conditioning. Reuse; do not duplicate the law.
- `crates/astraea-core/src/aero_profiles.rs`: analytic/profile quadrature and
  numerical reports. Source geometry joins are exact, not a fit tolerance.
- `crates/astraea-engine/src/sb1_geometry.rs`: existing FrontendVehicle to supported
  profile/fin geometry, declarations and support/source records. No defaults.
- `crates/astraea-core/src/six_dof.rs`: private DriverLoads/LoadContext/LoadPhase,
  `simulate_flight_with_evaluator`, stage closure and event/root routing. Old
  `compute_flight_loads`, `diagnose_flight_loads`, `normal_slope_at_mach`, adaptive
  integrator are preserved at5ea3141. Legacy public wrapper stays reproducible.
- `crates/astraea-engine/src/models.rs`: read only in initial native packet;
  old `prepare_flight_vehicle` and its drag-table producer have CP dependencies.
- Engine diagnostic modules `sb1_diagnostic.rs`, `environment_diagnostic.rs`,
  `friction_diagnostic.rs`, `supplied_aero.rs` are existing interfaces with distinct
  statuses. They are not candidate trajectory providers by being present.

## Prepared object: proposed required content

Immutable owned numeric geometry/reference/datum; source adapter/profile/support
records and equation IDs; explicit axial source; explicit rate policy; mechanical
carrier/source identity and D/length crosschecks; environment policy; candidate
numerical/support policies. Keep caller IDs separate from eventual computed content
hashes; do not call a string identity a geometry hash. New output caches/migration
are RMP07, not implied by a native prototype.

Initial axial choice: explicit prescribed nonnegative finite CA0 + provider/input
identity/power condition. No empty-table default, invented source export, implicit
legacy drag calculation or friction-only whole-airframe CA. If powered/coast values
are later accepted, both their support and transition semantics require review.

Mechanical context: explicit positive finite dry/all-up geometry/mass/CG/inertia/
motor source as needed by actual legacy primitive equations. Validate physical
bounds, motor placement and diameter/length consistency with adapter geometry.
Legacy slope/CP/drag-array fields must be irrelevant to candidate calculations.
Do not derive measured inertia, arbitrary damping or ballast from an apogee fit.

## Query and sample contract

Inputs: stage time; body/nav rigid state and explicit frames; power/recovery/rail
flags; mechanical state/CG/inertia; air-relative velocity at CG; Mach/rho and declared
environment provenance. For the initial native composition, retaining identified
legacy atmosphere/wind is permissible; do not label E1 profiles consumed unless
actually wired. State/configuration must be finite before entering legacy assertions.

Output must distinguish:

- computational supported / unsupported_domain / invalid_input;
- empirical qualification unqualified; composite dynamics UNKNOWN;
- static datum/CG coefficient+dimensional wrench versus modeled rate couple;
- airframe versus canopy applicability;
- flow/CP/reduced-rate null with reason versus physical/numerical zero;
- C/J, absolute contribution sums and conditioning policy even if CP is absent;
- modeled static wind-drag scalar versus total body aerodynamic force;
- caller source IDs, retained effective inputs, source equation/component identities.

No gravity/thrust/recovery term is counted twice as airframe aero. At zero speed
static load initialization can be supported while angle/coefficient observations
remain absent. Rate support never follows just from omega being zero.

## Equations/signs that must survive integration

Body B is right handed, +Y noseward. Centerline station x metres aft of nose has
position `(0,-x,0)` from the nose. Navigation N is ENU. Rotation R_NB maps B->N.
Air-relative velocity at CG is ground velocity minus toward-ENU wind, rotated to B.
`alpha=atan2(v.z,v.y)`, `beta=atan2(v.x,hypot(v.y,v.z))`.
At beta0 construct velocity `(0,V*cos(alpha),V*sin(alpha))`, never an X-forward vector.

`CF_B=(−C*beta,−CA0,−C*alpha)` and
`CM_nose_B=(J*alpha/Lref,0,−J*beta/Lref)` for accepted static SB1 continuation.
Use the core evaluator rather than copying these equations into another RHS.
Translate any independent source moment by
`M_to=M_from+(r_from−r_to) cross F`.
With centerline CG xG: pitch `qS*(J−xG*C)*alpha`, yaw
`−qS*(J−xG*C)*beta`. A pure couple survives C0 and all translations.

Wind coefficients come from total CF once. At beta0,
`CD=CA*cos(alpha)+CN_pitch*sin(alpha)` and
`CL=CN_pitch*cos(alpha)−CA*sin(alpha)`.
No separate wind drag is added after a total-body force has been returned.
Re-referencing area by k and length by h scales CF by1/k and CM by1/(k*h),
preserving dimensional force/moment; diameter is explicit metadata.

## Explicit inherited rate composition

Select `legacy-dimensional-rate-couple/1.0.0` explicitly for native diagnostic
dynamics. Body omega order `(q_pitch,p_roll,r_yaw)` is `(x,y,z)`.
Retain source expression order on extraction:

```
pitchDamp = 0.5*rho*V*S*Lvehicle*Lvehicle*1.5*omega.x
yawDamp   = 0.5*rho*V*S*Lvehicle*Lvehicle*1.5*omega.z
rollDamp  = 0.25*rho*V*S*rbody*rbody*4.0*omega.y
M_rate_B  = (-pitchDamp,-rollDamp,-yawDamp)
F_rate_B  = zero by this explicitly selected model
```

It is a dimensional pure-couple model using vehicle length/body radius, not
SB1 coefficient length D. Its numerical formula does not establish real damping.
SB1 excludes cant; require exactly zero rather than carry unreviewed cant torque.
Require inherited drag scale omitted or exactly1; retain prior fits inactive/stale.
V0/nonzero omega is refused until a separately identified zero-speed rate model
exists. Do not infer support from multiplying a guessed formula by zero speed.

## Stage/support/recovery policy

For nonzero-speed airframe queries enforce forward flow,0<=M<0.8 and incidence<=5deg
at every stage, rejected trial, root reconstruction and display/query read. These
are candidate computation limits, not an empirical envelope. No rail/negligible-
force waiver; no fallback to legacy or blending across the unsupported boundary.

A live declared canopy disables static airframe evaluation. Use separately named
canopy drag plus selected rate model, validate their own environment/domain,
and return airframe coefficients N/A with reason. A canopy branch cannot excuse
an earlier unsupported ascent query. Preserve actual drogue/main event ordering.

Versioned numerical policies used by the first native increment (accepted during
RMP01 independent review; no physical or empirical claim is changed):

- `candidate-aero-negligibility/1.0.0` — in load composition, when the maximum
  possible static aerodynamic force at the evaluated state, conservatively
  `q_inf S (|C| + CA0)` with `|sin(alpha)| <= 1` (or the declared canopy
  `q_inf S_cd Cd`), is at most `1e-6` of the instantaneous weight, dimensional
  aero loads are set to zero and flow/coefficient observations are absent with
  that reason. The substitution error is bounded by the same relative force
  bound. Every state above the bound is fully support-checked, so this is not a
  rail/negligible-force waiver and cannot admit a meaningful reverse/off-axis
  flow. Exactly-zero airspeed keeps its distinct zero-speed status. Curve points
  carry an explicit caller direction and report this bound per point while
  retaining static coefficients.
- `near-unit-quaternion/1.0.0` — query, curve and trajectory composition accept
  only finite attitudes with `| |q| - 1 | <= 1e-6` and normalize them once
  before any rigid-body transform; other attitudes are refused. This mirrors the
  shared integrator's entry requirement.
- The retained ISA-1976 atmosphere support is enforced at the instantaneous
  altitude (`0..20 km ASL`), not only at the declared launch altitude.
- Candidate motor preparation refuses finite-magnitude/physical mass violations
  and a nonfinite or nonpositive integrated thrust impulse before the shared
  mechanical primitive can reach a legacy panic. This does not change the legacy
  validator.

Error record: component/model ID, phase, time, flags, relevant state/domain values
and reason. Distinguish speculative evaluation from localized committed event.
Do not present a trial's failure time as the exact physical crossing of a boundary.

## Bounded trajectory result (separate from legacy DTO)

Required fields/semantics:

- termination `time_limit` or `touchdown`; aborted evaluation is an error unless
  an explicitly designed aborted-prefix result is introduced/reviewed;
- final committed time/state, requested horizon, model/composition identities;
- computational completion of the requested integration, separate empirical
  unqualified/dynamic UNKNOWN status (never legacy final PASS);
- committed trajectory/event samples with optional undefined quantities;
- observed-prefix peak altitude/speed/q and their sampling definitions;
- landing fields absent unless touchdown actually occurred;
- apogee only labeled observed if a qualified apogee event occurred; a rising
  prefix's highest sample is not the predicted final apogee.

Off-grid horizon is an explicit acceptance case: state/time must agree and reach
the requested stop, without advancing/evaluating a planned stage past it. Bound
floating-point endpoint handling by a named numerical policy if needed. Preserve
the exact default300s legacy path and final labeling. Keep raw committed/root
capture distinct from old rounded telemetry and rejected-stage diagnostics.

## Accepted RMP06b native profile bridge (explicit selection only)

`PreparedCandidate::with_profile_environment(CandidateProfileEnvironment)` owns
an immutable E1 profile plus explicit launch integer UTC, geometric-MSL altitude
and vertical datum. Source ID must match actual profile metadata. Nonzero retained
wind declarations conflict and refuse; no combined/sheared/fallback wind model.
Composition `candidate-static-rate-profile-composition/1.0.0`, environment
`explicit-E1-profile-candidate-environment/1.0.0` differ from legacy/RMP01 mode.

- Position z remains AGL. Query geometric-MSL = launch geometric-MSL + z,
  finite-checked; exact vertical-datum identity match required. Covered negative
  MSL is allowed, without a legacy atmosphere altitude clamp.
- `integer-epoch-plus-fractional-elapsed-validity/1.0.0`: finite elapsed
  `0<=t<2^53`, checked i64 addition of floor(t) to launch UTC and a separately
  retained fraction. Full inclusive validity is checked before floor-epoch E1
  sampling; at validUntil, a positive fraction refuses. Epoch is never converted
  to f64. Profile is constant in time inside declared validity, not a forecast
  interpolation or whole-flight validity inference.
- Every profile stage/read consumes actual E1 rho/a/wind/q/M/Re with P/T/mu
  provenance. Private shared mechanics does not reconstruct retained atmosphere
  or shear for profile mode. Coverage checked before load shortcuts; structured
  stage errors propagate. Profile-only burnout Mach uses evaluator-derived
  air-relative flow, and landing assembly also reads the selected profile.
- Trajectory/query effective observations match exactly. Curves reconstruct a
  ground velocity at requested Mach/direction and reevaluate E1; their actual
  reconstructed Mach is support-checked. Dimensional equality tests allow f64
  roundoff only (2e-12 Rust /3e-12 independent Python, not a flight-accuracy budget).
- Native strict wrapper retains complete effective input and per-sample/curve E1
  observation; no dispatch/default/project/WASM/product selection is activated.
  Existing RMP01 and legacy output preserved byte-for-byte on retained fixtures.
- Axial source in this bridge remains prescribed CA0. The direct RMP06a local
  inherited source is still unintegrated because of nonzero low-Re startup
  support. No automatic blend, Re floor, physical qualification or content-hash
  identity is implied. RMP06 parent and RMP07 product work remain partial/open.
