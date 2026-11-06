# A1d shared provider, load and plot integration design

Date: 2026-10-26. Reviewed source: `1e4779a`. This is an implementation design,
not empirical qualification or production model selection. P0 sections 1–8,
[A1c review](A1c-integration-review-2026-10-26.md) and
[E1a/T1a review](E1a-T1a-integration-review-2026-10-26.md) remain authoritative.

## Decision and bounded first patch

Choose one shared native flight driver and an explicit load evaluator. Preserve
`simulate_flight` as the exact legacy wrapper, and preserve `compute_flight_loads`
and `diagnose_flight_loads` unchanged. A1d-1 implements only this mechanical seam:
private driver, context labels, an arithmetic-free conversion to `DriverLoads`,
and callback coverage/error tests. No candidate assembler, new public simulation
API, horizon option, project fields, provider default or frontend change belongs
to A1d-1. It is groundwork, not completed candidate trajectory integration.

The coordinator approved this limited patch after the compact proposal. Commit
this document first; commit the refactor separately. Own only this document and
`crates/astraea-core/src/six_dof.rs` (focused tests in its existing test module).
Use one offline Cargo job and isolated target/evidence under
`/workspace/astraea-plan/evidence/provider-integration-20261026`. No new observed
outcomes, source research, N1 rerun, network, publication or deployment is needed.

## Actual source seams

At the reviewed base, `six_dof.rs` has five simulation load-call sites:

| Site | Meaning and required routing |
| --- | --- |
| 1864 | Endpoint probe closure; every adaptive Dormand–Prince stage, accepted and rejected trials, receives the evaluator before existing rail projection. |
| 2069 | Rail-exit event read, using the root state with rail-bound false. |
| 2224 | Committed macro-state read; metrics and existing display telemetry use this evaluation. |
| 2355 | Localized touchdown telemetry read; this remains conditional on recording and retains its existing exclusion from validity folding. |
| 2463 | `stage_loads_closure`, used for burnout-root integration and `refine_crossing` path integration, including abnormal touchdown and event candidates. |

`refine_crossing` integrates one path and bisects dense output. Dense-output
interpolation itself must not invoke a new RHS. Existing event flags are snapped
for each integration segment and passed unchanged; event restarts use current
flags. The driver must not cache a previous macro load for an intermediate stage.

`compute_flight_loads` calls `normal_slope_at_mach` before recovery/force assembly.
Its signed-sum/CP guard can reject a state with a valid independent static couple.
Therefore a candidate must never compute legacy loads first and overwrite them.
`FlightLoadsDiagnostic.cp` is a required f64; it cannot represent a missing candidate
CP. The legacy diagnostic must remain a separate type.

`models::prepare_flight_vehicle` calls legacy stability before preparing its
mechanical carrier. Its private `drag_table` calls `compute_aerodynamic_curves`,
which also calls `compute_rocket_stability` (`aero.rs:2067`). Merely bypassing the
load guard is insufficient to remove CP dependence from candidate preparation.
`commands::simulate_flight`, `flight_summary` and ensembles currently use legacy
preparation; A1d-1 leaves all of them unchanged.

## A1d-1 exact interface and behavior

Introduce private `LoadPhase` labels for endpoint probes, burnout roots, event
refinement (including the event name), rail exit, macro sampling and touchdown
sampling. `LoadContext` contains phase, stage time, drogue/main deployment and
rail-bound flags, plus the already validated environment/cant/drag configuration
needed by the legacy evaluator. The state remains a separate borrowed argument.

`DriverLoads` contains only `Loads`, airspeed, Mach, dynamic pressure, total
incidence, envelope incidence, drag and thrust: the fields the current driver
actually reads. It contains no CP, provider identity or legacy diagnostic.
`From<FlightLoads>` moves these values without arithmetic or reinterpretation.

The private shared driver accepts
`&dyn Fn(LoadContext, &RigidState) -> Result<DriverLoads, String>` along with the
existing vehicle, motor and options. The public legacy wrapper supplies a closure
that calls the unchanged `compute_flight_loads` with context fields and converts
its result. The shared driver retains all current validation, defaults, 300-second
horizon, loop order, return type, validity strings and telemetry behavior.
The evaluator is the only route at all five sites and is threaded through
`stage_loads_closure` and `refine_crossing`. It may be called on speculative paths.
Every evaluator error propagates through `?`; no fallback or partial success is
introduced. Context labels describe call purpose, not committed evidence.

Keep the original arithmetic, rail projection, adaptive coefficients/tolerances,
event root selection, result labeling and telemetry rounding in their original
order. No helper extracts or duplicates the legacy physical assembly in A1d-1.

## Follow-on A1d-2: concrete native candidate path, separately authorized

Add a prepared SB1 composition and a separately named native experimental wrapper
around the shared driver, a load-query function, and a coefficient-curve sampler.
All three consume the same prepared object and call the existing core
`aero_coefficients::evaluate_static`; no second coefficient law is permitted.
Owned files would be new core `flight_provider.rs`, core `lib.rs` registration,
reviewed `six_dof.rs` integration, native-only engine preparation/example/tests,
and a method update. Shared file changes have one owner and sequential review.
No command registration, WASM rebuild or GUI selection is required for that useful
increment. A native example must actually run a bounded synthetic trajectory and
emit plot-ready coefficient/load samples, rather than add another unused trait.

The prepared object owns canonical geometry, references, moment datum, axial source,
rate-composition policy and immutable provenance. Initially use real adapter output
from `sb1_geometry::adapt_frontend_vehicle`, an explicitly supplied mechanical
carrier, and an explicitly identified prescribed CA0 or complete powered/coast
axial array. Validate the carrier's length/diameter against the adapted geometry;
its legacy slope fields must never enter candidate evaluation. This avoids both
legacy CP guard chains without a broad preparation refactor. A native synthetic
case can use a declared cone/cylinder/uncanted-fin DTO and actual adapter output;
it must not be described as source geometry or empirical qualification.

The P0 `legacy-zero-incidence-drag25` adapter is a separate explicit axial-source
choice. It records powered/coast tables, grid, producer version, inputs and fixed
environment assumptions, validates complete finite nonnegative values and never
uses `aero_at_mach`'s empty-table default. A later axial-only producer extraction
can remove stability dependence under its own review. Do not silently select
prescribed CA0 while labeling it as that legacy producer.

Candidate static assembly translates the returned independent datum moment to
instantaneous CG using P0's full cross product and dimensionalizes once. The force
is already total body force: no additional wind drag or legacy lateral force is
added. Gravity, thrust, motor/CG/inertia and rail reactions remain identified
mechanical components outside the airframe provider. Prefer a reviewed extraction
of common mechanical/flow calculations over duplicating the complete legacy RHS;
preserve legacy operation order and demonstrate exact parity after extraction.

Explicitly select `legacy-dimensional-rate-couple/1.0.0` for diagnostic dynamic
trajectories. In existing body order `(pitch, roll, yaw)` it supplies zero rate
force and moments
`(-0.75*rho*V*S*Lvehicle^2*omega.x, -rho*V*S*rbody^2*omega.y,
-0.75*rho*V*S*Lvehicle^2*omega.z)`.
Retain the existing expression evaluation order when extracting these equations.
These are dimensional pure couples; the length is vehicle length for pitch/yaw
and body radius for roll, not the SB1 coefficient reference length D. The provider
ID must record this distinction. The existing cant torque is separately
`q*S*rbody*sin(cant)*4`; SB1 requires cant exactly zero and excludes this model.
Missing SB1 rates remain missing in static diagnostics. The explicit composition
supplies its own modeled rate loads; it never relabels SB1 as a dynamic model.
Whole-composition dynamic qualification is always UNKNOWN and empirical
qualification remains unqualified, even for a numerically complete trajectory.

## Candidate boundaries, results and diagnostic values

- Require finite state/configuration/physical context before invoking kernel
  assertions. Invalid input and unsupported model domain are distinct errors.
- For airframe V=0 and zero rates, dimensional static/rate loads are zero; flow
  angles, wind coefficients and reduced rates are absent with reasons. Reject
  V=0 with nonzero rates unless a separately identified model supports it.
- For V>0 enforce forward flow, `0 <= Mach < 0.8` and incidence at most 5 degrees
  at every stage and read, including rail-bound and negligible-force states.
  Rail constraints do not expand SB1 support. Tail-first/lateral-only flow fails.
- A live canopy explicitly deactivates the airframe static branch and uses the
  separately named unchanged canopy-drag law plus the selected legacy rate couple
  (legacy retains damping under a canopy). Candidate airframe coefficients are
  not applicable, not zero. Canopy/environment computational coverage remains
  separately checked; recovery is not a fallback for unsupported free flight.
- A domain error on a rejected adaptive trial or event probe aborts the run too.
  Do not silently retry with legacy, drop loads or return a completed flight.
  Error records include model identity, phase, time, flags, relevant state and
  reason; a speculative failure is labeled as such rather than a localized root.
- Candidate diagnostics use a new result type with optional CP, derivatives,
  coefficients, rates and their absence reasons. Preserve C/J and pure couples
  when C=0. CP diagnostic availability never gates the independent wrench.
- Existing display `drag` means legacy drag magnitude; candidate telemetry must
  identify its drag scalar as `-Fstatic dot vhat` (and distinguish canopy drag).
  Undefined zero-speed angle/coefficients cannot be encoded as fabricated zero
  measurements. A separate experimental sample type can carry these options
  without rewriting the legacy telemetry DTO. Record committed macro/root samples
  separately from stage diagnostics; do not plot rejected trials as a trajectory.

A short explicit native horizon is needed to inspect an actual SB1 ascent without
forcing it through unsupported near-apogee flow. This is A1d-2 work: parameterize
the internal horizon only after defining exact stop semantics. Return a separate
experimental result with termination `touchdown` or `time_limit`, computational
completion and unqualified/UNKNOWN science status; landing values are absent
without touchdown. Never reuse current final-result PASS labeling for a candidate
or call a time-limited final state a landing. A failed domain evaluation returns
an error, not an implicitly valid partial flight. Any retained prefix requires an
explicit aborted-prefix result with no complete-flight claims.

## Identity, migration and remaining gates

A1d-1 changes no identities or serialized projects. Absent provider selection stays
legacy in every existing command/project/calibration path. Historical predictions
must remain reproducible and old save/reopen must not activate a provider.

The eventual candidate identity includes schema/provider/equation/adapter versions,
canonical numeric geometry content, reference/datum, axial inputs, rate policy,
mechanical model, environment and numerical policy. Caller provenance strings are
retained declarations, not cryptographic content hashes. Cache/fit identity must
change with any effective coefficient, geometry, environment or policy change.
The native increment can retain explicit immutable content and separate caller IDs
without claiming production cache support; production identity hashing/migration
is a later gate before GUI exposure.

Existing `runInputs.ts` applies `project.dragCalibration?.scale` directly. The
native candidate path must not consume that path: require `dragCdScale` omitted or
exactly 1, retain any historical fit as inactive/stale, and report why. A later
explicit project migration creates a new run/model identity and difference report;
calibration cannot transfer automatically. Fit refitting/eligibility and new
source qualification remain outside this packet.

E1a remains diagnostic: its local state does not yet replace legacy atmosphere or
friction assumptions. T1a remains a fixed-condition complete static table; no rate,
beta/roll/Re/power expansion is inferred. Their future providers must meet the same
stage/error/identity contract. Source-data qualification, empirical dynamic support,
geometry eligibility, platform acceptance and independent unseen outcomes remain
open. No software-integration pass closes them.

## Verification and patch sequence

1. Commit this design independently.
2. Implement only A1d-1 in `six_dof.rs`. Assert arithmetic-free conversion preserves
   every driver field, including complete Loads. Run a spy evaluator delegating to
   exact legacy assembly on the longstanding synthetic Estes Alpha/C6 fixture;
   require endpoint, burnout-root, refinement, rail-exit, macro and touchdown-read
   coverage with coherent flags/time. Compare complete result/debug representation
   against the public wrapper, including exact telemetry and events.
3. Inject a distinctive error at each call purpose and verify exact propagation,
   no later evaluator calls and no fallback. Exercise event-specific root labels,
   including direct abnormal-touchdown refinement where the nominal fixture does
   not naturally take that branch. Tests observe real driver/evaluator paths.
4. Run core and engine retained parity tests offline with one Cargo job; no new
   flight outcome fixtures. Independently inspect the legacy assembly source
   against the base and ensure public command/DTO/frontend files are unchanged.
5. Only after separate authorization implement A1d-2. Add a synthetic zero-force
   independent pure couple with null CP, prove CG invariance and candidate bypass
   of invalid legacy slope fields; verify real SB1 adapter trajectory/plot/load
   equivalence, signed rates, zero-V policy, domain hard stops, conditional telemetry
   and inactive calibration. Review equations, references and error paths before
   any source-model or production activation.

Alternatives considered: adding optional provider fields to Vehicle would mix
preparation and runtime policy; computing legacy loads then overwriting fails the
CP guard requirement; a new standalone simulator duplicates event/integrator logic;
JSON/GUI migration now expands the identity/calibration surface unnecessarily.
The shared evaluator is the narrowest useful first seam, followed by one explicit
native provider composition with real trajectory and plot consumption.
