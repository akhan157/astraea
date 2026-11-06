# RMP12b frozen design contract — candidate-only numerical controls

Planning base `803b76b5d16922bd862beea2eabdf771e04e23ef`. This contract authorizes
only its reviewed bounded engineering/experiment, not a new default or numerical/
physical qualification. The original RMP12a nine attempts and failed provisional
rail reserve remain historical evidence. **No new native experiment has run.**

## Question and controls

Saved-output diagnosis already found speed bias accumulating near thrust corners
(.192/.209/.231s). At20ms rail service the trajectory height bias (~.001487m) is
larger than root overshoot (~.00011365m). Root width is not true event-time error.
Do not merely tighten bisection or repeatedly rerun the original study.

Test a2x2 intervention on the same2.0s,20ms vertical E1 synthetic request:
inherited vs hundredth absolute state tolerances, and no knot split vs mandatory
adaptive trial endpoints at motor thrust knots. One additional inherited/default
case checks explicit-control equivalence. Report all five successful-prefix cases,
even if none improves. These interventions can reveal effects/interactions, not
prove a sole cause or adaptive/global/full6D convergence.

- Base tolerances r1e-3m, v1e-2m/s, q1e-5, w1e-3rad/s.
- Hundredth literals r1e-5m, v1e-4m/s, q1e-7, w1e-5rad/s. These are experimental
  settings, not derived mission budgets or recommended production defaults.
- Keep DP5(4), norm/error estimator, interpolation, initial step<=5ms, max adaptive
  step<=50ms, macro20ms, root bisection width1e-5s, contact/event FSM and5,000-trial/
  500-rejection limits unchanged. No physical/model/source/threshold changes.
- On split=true, clip each adaptive trial before any stage to the next strictly
  future motor thrust knot or burnout, within its current requested interval.
  Accepted endpoint must land exactly on the represented boundary, with positive
  progress. No trial straddles it. Preserve adaptive growth history within each
  integration call (existing macro/event restarts remain); do not reset dt to
  its initial value at knots, restart macro clocks, resample thrust or reset state. No planned
  evaluation after the horizon. Endpoint, burnout/restart and event-refinement
  integration must use the same selected controls; root width stays unchanged.
- Cut list derives from validated actual core motor times, not caller labels.
  Report the effective literal tolerances, limits and exact knot list/policy
**in the experiment result/ledger, outside the compared candidate report**; the
A-vs-old / A-vs-B exclusion lists below then stay exactly as frozen. Cut list is
sorted unique exact f64 values; a knot coinciding with burnout clips to one exact
double; only strictly future boundaries clip.

## API/identity and default preservation

Extend the strict native candidate DTO with optional `diagnosticNumerics`:
`{schemaId: candidate-native-diagnostic-controls/1.0.0,
absoluteTolerancePolicy: inherited|hundredth, splitAtThrustKnots: boolean}`.
Fields are required within that object; unknown keys/schema/policies/null refuse.
Absent keeps the exact current path; omit it from normalized serialization when
absent so old native identities/preimages stay unchanged. Do not extend public
SixDofOptions, legacy dispatch, frontend, project or archive schemas.

One shared mechanical/integrator implementation, no copied replacement physics.
Native-only candidate entry accepts these controls; all ordinary/legacy callers
keep inherited defaults. Internal shared seams may be parameterized, but existing
public signatures/defaults and baseline outputs must be preserved. Strict mapping
from the two enum choices to actual numeric constants, no generic tolerance API
or guessed settings. Existing support checks on every speculative stage remain.

Effective diagnostics must bind into the native SHA identity and lossless replay,
using `candidate-native-diagnostic-numerics/1.0.0` for explicit controls plus actual
applied values/knot policy; never label a changed run as inherited numerics.
Profile outer-envelope identity must not overwrite the selected policy. Caller
labels are not authority for applied settings. The absent case retains the old inherited
policy and hashes; no explicit case does. **B (explicit-inherited) replaces `numericalPolicyId` with
`candidate-native-diagnostic-numerics/1.0.0` and records applied values/knot
policy;** keeping the inherited ID while appending values is forbidden. B
verification asserts both: its identity differs from A's **and** its recorded
applied values equal the inherited literals exactly (r1e-3, v1e-2, q1e-5, w1e-3). Runtime identity remains separately Unknown until executable seal;
input/model digest never becomes executable/numerical/physical qualification.
Default preservation uses recursive bit-aware numeric comparison (binary64 bits,
including signed zero; integers exact), not Python numeric equality/tolerances.
Compare A to retained old report excluding only additive contentIdentity and
activePolicies. Compare A/B: strip contentIdentity, activePolicies and
`diagnosticNumerics`, then compare `effectiveInputs` recursively with **only the
diagnosticNumerics leaf removed** (everything else bit-exact) — never strip
`effectiveInputs` wholesale. Independently, each case's request bytes/hash must
differ from A's by **exactly its enumerated delta set** — B–E: the diagnosticNumerics
object only; F: diagnosticNumerics + the case's horizonS override + the declared
validity mutation; G: diagnosticNumerics + the declared last-knot-altitude
mutation. The sets are frozen in EXPERIMENT `caseDeltaSets`; any undocumented
delta is a retained failed attempt. The enumerated delta set, request bytes hash
and observed disposition are recorded per attempt in the ledger. For C–G the
`effectiveInputs` echo may likewise differ from A by exactly those enumerated
delta entries (minus the diagnosticNumerics leaf); everything else stays bit-exact. All remaining fields
must agree.

## Frozen inputs, process allocation and no retries

[EXPERIMENT.json](EXPERIMENT.json) defines exactly **seven** profile-example
process attempts: default absent, explicit inherited, knot-only, hundredth-only,
both, fractional-expiry refusal and altitude-domain refusal. One separately
counted legacy example call verifies byte preservation: **eight process attempts
total**. No extra CLI smoke/replay/probe calls. Save pre-spawn durable reservation,
input bytes/hash, exact binary/source/plan seal, stdout/stderr/exit/timeout and
expected/observed disposition for every attempt; timeout30s killed/waited, never
retried. New output directory only; resumed/reused output refuses. Missing or
failed attempts remain reported and stop any acceptance claim.

Ordinary manufactured/unit and existing affected Rust regression computations are
separate inventoried verification, not extra experimental CLI cases. Their exact
commands/counts/failures must be reported. They must not conceal tuning sweeps. Implementation review must verify the new
checker's RK4/thrust/impulse/density equation blocks are textually and
semantically identical to `check-candidate-numerics.py` ("reuse" is otherwise
only a claim). Any later split-with-dt-reset fifth case needs a **new** reviewed
plan; it is not added to this frozen8-attempt budget.

BASE-INPUT is a byte copy of the existing permitted RMP12a h2-dt020 input (not new
as-flown data). LEGACY-INPUT is the already accepted RMP01 wind0 synthetic request.
Original stdout and legacy expected checksum are hashed in EXPERIMENT. No old
N1/20-call study, empirical scoring, protected outputs or source acquisition.

Before any experiment call: accepted contract, implementation/diff review,
manufactured/reference/identity/default-preservation tests, and a separate sealed
RUN-SEAL.json binding final source/file hashes, compiled executables/toolchain,
checker/plan/input hashes and review approval. No mutable null binary placeholder
counts as a freeze. Builds/tests may occur before sealing; experiment may not.
Keep code/contract hashes and both old/new failures, no outcome-based plan edits.

## Independent reference and metrics

Reuse the independent continuous vertical-drag RK4 equations from RMP12a (no DP5
transcription), exact piecewise-linear thrust impulse/depletion, rising-contact
liftoff, E1 log-pressure/isothermal density and same declared mass/area constants.
No new carrier/mass/geometry/source qualification. The candidate's negligible-aero
substitution remains a model/reference mismatch, not a proved propagated bound.

Use fixed200us and100us reference grids, split at liftoff, motor knots and each
requested comparison time as before. Improve reference rail extraction only:
within the first positive-velocity height crossing, bisect time and reintegrate
RK4 from the fixed left grid state to each trial time, until bracket<=1e-8s (max80
iterations). Keep endpoint/bracket/state evidence. This brackets a numerical
reference root, NOT the exact ODE root or a rigorous global bound. Verify with a
closed-form manufactured crossing that exercises the same bisection-from-left-
state routine used for the rail root (not a parallel simplified path), and check
coarse/fine state/root differences against the original reference reserves. If reference controls fail, comparisons
remain unresolved; do not add a finer grid or change reserves without new review.

Compare every committed sample, final state and rail/burnout event state/time;
report max absolute position/velocity and rail-time errors, transverse/rate/
quaternion symmetry and reference coarse/fine differences. Report the known
model-mismatch floor (pointwise 9.80665e-6 m/s^2, negligible-aero substitution
vs continuous-drag reference) beside every residual error, so a plateau is not
misread as disproof while a fixed mismatch floor exists. Mechanism evidence is
mandatory per case with **zero extra process attempts**: count and time locations
of adaptive trials straddling thrust knots (A/B/D; B mirrors A's counts verbatim)
and clipped trials (C/E), plus
the dt/step sequence over [.18,.25]s. Without it a null result is uninterpretable.
Mechanism evidence is emitted in the experiment result/ledger or a per-attempt
sidecar, **outside the compared candidate report** (same rule as the effective-
controls report). Refusal cases F/G record N/A with the refusal reason instead. Include native times
around .20/.22/.24s without selecting only favorable points. Also report pairwise
changes across the full2x2 table. Same macro step under varying adaptive controls
is not observed convergence order. No continuous-peak, full6D, canopy or adaptive-
tolerance qualification follows. Exact2.0s final time and honest prefix status
remain; no invented apogee/landing. Negative cases must preserve an actual
unsupported stage time/phase and speculative=true; no clamps or fallback. A
refusal whose reason/phase differs from the frozen `expected` is a **failed
attempt** (retained, blocks acceptance) — do not reinterpret it as success. G
uses the retained RMP12a `lastProfileKnotAltitude=100` mutation shape (equivalent
explicit path `environmentSelection.profile.knots[-1].altitudeM=100`; F's
`validUntil=launchTime+2` equals `environmentSelection.profile.validity.
untilUtcUnixS=launchTimeUtcUnixS+2`), which produced a stage-coverage refusal there; if implementation validation would
refuse it earlier at schema/ordering level, stop and review rather than reshape
the mutation.

Use the original provisional .01m/.02m/s/100us reserves and all unchanged
symmetry/reference reserves. They are software diagnostics, not owner decision
allocations. Default/inherited failure must not disappear from reporting; a
passing optional setting cannot close the original default failure or parent
RMP12-C02. Report experiment integrity separately from each configuration's
reserve result; never discard baseline failures in an aggregate green PASS.

## Review, resources and successor

Read-only independent contract review before implementation/experiment; separate
implementation/results review for changed shared numerical code and conclusions.
Two compiler/test jobs maximum, one heavy task, serial reviewers, memory checks.
No production WASM build/offering; wasm32 compile-only check for interface safety.
No defaults, physical equations, budgets or scientific qualification changed here;
any recommendation/default change needs separately justified review and broader
applicable evidence. No push/merge/release/deploy/outreach/spending/holdout access
or automation restart. Existing18-packet roadmap and team-ready Version1 goal
remain active. Missing mission budgets block qualification, not this investigation.
