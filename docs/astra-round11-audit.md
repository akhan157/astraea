# Round 11 Engineering Audit

## Executive disposition

**Updated Executive Quality Score: 5.6/10, down from 5.8/10.**

**Gate A: PARTIALLY SATISFIED — NOT CLOSED.**

**Build-readiness verdict: suitable for continued development and restricted numerical experimentation; not ready for flight-readiness decisions or release as a verified 6-DOF flight predictor.**

The shared production kernel is a meaningful architectural improvement. However, the supplied full simulator exposes consequential integration defects that were not visible from kernel-only evidence:

- The simulator **does not use the stage-dependent load factory**.
- The computed **rail-constrained acceleration is not passed to the integrator**.
- Event detection remains **sampled threshold logic, not root-localized integration**.
- The simulator retains a **left-handed geographic labeling convention**.
- The implemented CP-to-CG moment signs appear **reversed under the specified drawing convention**.
- Several advertised acceptance tests still exercise **test-local physics rather than their corresponding production operations**.

The lower score reflects newly available evidence, not a dismissal of the kernel improvements.

**Evidence boundary:** this is a source audit of the supplied excerpts. I have not executed the tests or independently reproduced the reported 50/50 result.

---

## 1. Gate A: what is actually closed?

The requirement is not simply that a test imports some production code. It is that **the production operation responsible for the claimed behavior is the operation being verified**.

| Benchmark | Actual subject | Audit disposition |
|---|---|---|
| VV-001 | Production kernel, constant-force translation | Production-linked |
| VV-002 | Production kernel, torque-free rotation | Production-linked |
| VV-003 | Production kernel plus test-local force rotation | Partial coupling evidence |
| VV-004 | Production coefficient curves plus **test-local load assembly** | Production load path not verified |
| VV-005 | **Entirely test-local separation algebra** | Production separation not verified |
| VV-006 | **Test-local propagation/root calculations** | Production localization not verified |
| VV-007 | Full production simulator | Smoke test and limited sign check |
| VV-009 | Production kernel, direct inertia inputs | Kernel axes verified; boundary adapters not exercised |
| VV-010 | Production kernel with stage load callbacks | Useful coupled-kernel evidence |
| VV-011 | Production FSM | Limited threshold/one-shot evidence |

### Direct contradiction in the implementation summary

You state:

> “VV-001 through VV-003, VV-005 now all drive production integrateRigidStep().”

**The supplied VV-005 never calls `integrateRigidStep()` or a production separation operator.**

More importantly, integration is not the operation that needs verification for instantaneous separation: **the production separation/reset operator is**.

Likewise, extracting `detectEvents()` does not connect VV-006 to production event localization.

### Gate ruling

**The shared-kernel subrequirement is satisfied by the supplied source. The overall production-path analytical acceptance gate remains open.**

Do not mark the entire gate closed based on linkage of only one computational layer.

---

## 2. Kernel audit

### 2.1 Quaternion derivative: correct

For a scalar-first quaternion mapping body vectors into navigation coordinates,

\[
\dot q_{NB}=\frac12q_{NB}\otimes[0,\omega_B]
\]

the supplied component implementation is correct.

The rotation matrix is consistent with that convention, and `rotateWorldToBody()` correctly applies its transpose.

### 2.2 Constant-inertia Euler equations: correct

The kernel implements

\[
\dot{\omega}
=
I^{-1}\left(M-\omega\times I\omega\right)
\]

with the correct cyclic signs:

\[
\dot\omega_x=\frac{M_x-(I_z-I_y)\omega_y\omega_z}{I_x},
\]

and similarly for \(y,z\).

The explicit label adapters also correctly express your stated legacy interface:

\[
\omega_B=(q,p,r),\qquad
I_B=(I_{\text{pitch}},I_{\text{roll}},I_{\text{yaw}}).
\]

**The earlier roll-inertia division defect is corrected in this path.**

### 2.3 RK4: structurally sound, but not the contracted integrator

The translational and angular-rate stage construction and final RK4 weights are correct.

The quaternion method is **an additive, stage-normalized RK4-style method**, not unmodified classical RK4 on all quaternion components. Its accuracy must be established for that particular projected construction.

VV-010 is useful evidence for the spherical constant-spin case. It is not sufficient to establish general fourth-order attitude accuracy for asymmetric, moment-driven motion.

Required additional convergence evidence:

- Nonconstant angular velocity.
- Nonspherical inertia.
- State-dependent moments.
- Quaternion geodesic error, independently assessed.
- Separate dimensioned position and velocity error metrics.

**The fixed-step implementation still does not meet the normative adaptive Dormand–Prince 5(4), independent tolerance, and dense-output requirements.** The normative document also needs correction: its prescribed quaternion weighted sum is explicitly an RK4 formula despite specifying DP5(4).

### 2.4 Variable-inertia physics: missing

`LoadsAt` can change inertia between stages, but the angular RHS does not include

\[
-I^{-1}\dot I\,\omega
\]

or an explicitly defined equivalent effective-moment treatment.

Thus:

> Re-evaluating inertia at stages does not, by itself, implement the specified variable-inertia angular-momentum equation.

Either implement the agreed control-volume model or explicitly restrict this kernel to constant-inertia rotational dynamics. Exhaust angular-momentum assumptions need their own physical justification.

### 2.5 Validation: substantially improved, not system-wide

The entry, callback-load, intermediate-state, and output checks are useful improvements.

Residual issues:

- Finite `t0` and `dt` do not guarantee finite `t0 + dt`, or that floating-point time advances.
- Callback stage states are validated **after** callbacks receive them.
- `angularAcceleration()` is exported but does not itself throw for invalid inertia, contrary to the broad wording of its comment.
- Strict kernel checks do not eliminate upstream state fabrication or unsafe result semantics.

These are secondary to the simulator defects below.

---

## 3. Production simulator: blocking findings

### P0-1 — Rail constraints are computed but discarded

The simulator constructs a constrained `accelWorld`:

```ts
accelWorld = {
  x: forwardAccel * railVector.x,
  y: forwardAccel * railVector.y,
  z: forwardAccel * railVector.z,
};
```

But the integrator receives:

```ts
forceN: {
  x: totalForceWorld.x,
  y: totalForceWorld.y,
  z: totalForceWorld.z
}
```

**The rail-constrained acceleration affects reported acceleration, not integrated translation.**

Consequences:

- The rocket can accelerate laterally while supposedly constrained to the rail.
- The integrated trajectory and reported acceleration disagree.
- Resetting `omega` to zero before a step does not constrain rotation during that step: the kernel still receives nonzero aerodynamic moments.
- Resetting attitude on the next tick hides, rather than resolves, constraint violations.

Additionally,

\[
\sqrt{x^2+y^2+z^2}
\]

is radial distance from the origin, not signed travel along the rail.

Use

\[
s=(r-r_{\text{rail origin}})\cdot\hat u_{\text{rail}}
\]

with explicit constrained dynamics and consistent position/velocity constraints. Implement the required dual-button/single-button phases, or declare tip-off unsupported.

**Acceptance:** crosswind rail tests must show zero forbidden transverse displacement and velocity throughout the constrained phase.

---

### P0-2 — Production does not use `loadsAt`

The actual production call supplies only:

```ts
integrateRigidStep(state, loads, dt)
```

Therefore thrust, atmosphere, aerodynamic forces, moments, mass, and inertia are frozen over each macro-step.

The implementation remains a partitioned frozen-load scheme; it is **not a fourth-order integrator of the full flight RHS**.

VV-010 verifies a capability that the production simulator does not activate.

**Required correction:** extract a pure production flight RHS and invoke it at every stage, using stage position, velocity, attitude, angular rate, time, mass properties, and discrete flight mode.

Also distinguish two failure modes in the tests:

- Loads frozen for the entire trajectory: generally \(O(1)\) error.
- Loads recomputed once per macro-step, as production does: generally first-order coupling error.

The existing “frozen loads diverge” test exercises the former, not the actual production defect.

---

### P0-3 — Geographic handedness remains wrong

The simulator labels its axes:

\[
(x,y,z)=(\text{East},\text{Up},\text{North}).
\]

That geographic triad is left-handed:

\[
\text{East}\times\text{Up}=-\text{North}.
\]

Quaternion algebra assumes right-handed Cartesian coordinates.

Using identity mapping makes the internal vector/quaternion operations mutually consistent as abstract numerical coordinates. **It does not make their geographic interpretation consistent with ENU.**

Your normative display mapping is instead

\[
v_D=C_{DN}v_N,\qquad
C_{DN}=
\begin{bmatrix}
-1&0&0\\
0&0&1\\
0&1&0
\end{bmatrix},
\quad \det C_{DN}=+1.
\]

If attitude is stored in display coordinates, it must satisfy

\[
R_{DB}=C_{DN}R_{NB}.
\]

Transforming vectors without attitude was wrong; removing all transforms while retaining left-handed geographic labels is not a complete repair.

**Recommended architecture:** keep physics in ENU and apply the proper rotation only at rendering boundaries.

VV-007's positive-East drift assertion does not verify handedness, attitude transformation, or cross-product signs.

---

### P0-4 — Restoring moment signs are reversed under the drawing convention

The code uses:

```ts
x:  staticMarginMeters * aeroForceBody.z
z: -staticMarginMeters * aeroForceBody.x
```

For axial station coordinates increasing aft from the nose and body \(+Y_B\) pointing toward the nose,

\[
d=x_{cp}-x_{cg}>0
\]

places the CP at

\[
r_{CP}-r_{CG}=(0,-d,0)_B.
\]

Therefore,

\[
M_B=(r_{CP}-r_{CG})\times F_B
=(-dF_z,\;0,\;dF_x).
\]

**The supplied implementation uses the opposite signs.**

The master document itself contains contradictory language about nose-origin drawing stations increasing along noseward \(+Y_B\). Resolve that explicitly, then implement moments using the actual lever-arm vector and a cross product.

**Acceptance:** a statically stable rocket with a small pitch or yaw disturbance must initially accelerate toward alignment with the air-relative velocity, not away from it.

---

### P0-5 — Production events are not localized crossings

`detectEvents()` has no previous continuous state, bracket, interpolant, or root solver.

Its rail condition is:

```ts
inp.altitudeAlongRail >= inp.railLength
```

No ascending-direction test exists.

Its apogee condition is:

```ts
inp.verticalVelocity <= 0 && inp.t > 0.8
```

This is not a demonstrated downward zero-crossing. The arbitrary time threshold can suppress a legitimate early apogee; burnout is not required.

At the default \(0.01\,s\) timestep, event timing is quantized to samples, with errors potentially approaching one timestep—not the required \(10^{-5}\,s\).

Further, loads are assembled **before** deployment flags change. The first step following a deployment event therefore uses the old parachute loads.

**Required architecture:**

1. Detect candidate event brackets.
2. Localize the earliest event using the production continuous solution.
3. Advance to the event state.
4. Apply the discrete transition/reset.
5. Recompute loads and integrate the remaining interval.

VV-006's Newton refinement evaluates the exact analytical trajectory directly. That is not verification of a production dense-output solution.

---

### P0-6 — Invalid or incomplete runs can report landing safety

At the 300-second timeout, the function returns ordinary landing outputs without requiring touchdown.

It can report:

```ts
isLandingSafe: landingKineticEnergy <= 20.0
```

for a state that is still airborne or never launched.

Additionally, impact energy uses:

```ts
0.5 * vehicleDryMass * landingSpeed ** 2
```

rather than the actual retained landing mass, including motor hardware where applicable.

**Required correction:** explicit termination status, touchdown-required landing metrics, actual impact mass, and `{PASS, FAIL, UNKNOWN, NOT_APPLICABLE}` assessments. Timeout is not successful flight completion.

---

## 4. Additional physics gaps

### Aerodynamics

The production code still:

- Folds reverse axial flow through `Math.abs(axialVelocity)`.
- Does not implement the certified paired \(\alpha,\beta\) definitions.
- Applies wind-axis \(C_D\) as body-axis axial drag without the required transformation.
- Hardcodes \(C_{N\alpha}=12\).
- Silently clamps lookup values outside the tabulated Mach range.
- Applies parachute drag primarily along the rocket's body axis rather than opposite canopy air-relative motion.

These shortcomings are not corrected by improving the integrator.

### Mass properties

- `currentCg = massRollup.cg` is constant despite the “CG shift” comment.
- Motor transverse inertia is added without the required displacement-to-combined-CG parallel-axis treatment.
- Dry inertia is a crude aggregate geometric approximation.
- Instantaneously zeroing angular velocity at drogue deployment is an undocumented angular-momentum reset, not a resolved recovery-body model.

### Datum and input semantics

- Terrain-relative AGL is not implemented.
- Flat terrain is assumed without the required run manifest.
- Dry mass is silently floored.
- Rail elevation is silently clipped.
- Recovery defaults substitute values without a consistent validity policy.

The statement “no silent physical-state fabrication remains anywhere” is not supported by the simulator source.

---

## 5. Test weaknesses requiring correction

1. **VV-003:** forced-versus-zero-force proves force liveness, not attitude-driven coupling. An attitude-independent nonzero force can pass both that guard and antipodal equality. Add a different physical attitude with a known different force direction.

2. **VV-005:** verifies locally constructed impulse identities, not production separation. It also does not test parent mass/inertia reconstruction. Its second “off-axis” case is actually on-axis in body coordinates.

3. **VV-009:** bypasses the production rate/inertia adapters. Add asymmetric boundary-level cases.

4. **VV-011:** the main-deployment negative case is both ascending **and far above deployment altitude**. Removing the direction filter would still pass. Test ascending below the threshold with the relevant prior state.

5. **VV-011:** collects burnout and apogee indices but does not assert their ordering.

6. **VV-002:** excellent small-step conservation evidence, but \(10^{-4}\,s\) does not establish performance at the production default \(10^{-2}\,s\).

7. **VV-010:** `max(positionError, velocityError)` mixes units. Report independent normalized errors and observed orders, with both lower and upper consistency bounds.

---

## 6. Conditions for an 8.5+/10 assessment

I would require the following demonstrable closures:

| Priority | Required evidence |
|---|---|
| 1 | Rail constraints actually govern production translation and rotation |
| 2 | A single production stage RHS used by simulator and load acceptance tests |
| 3 | Canonical ENU physics with verified attitude-aware rendering transforms |
| 4 | Correct CP/CG moment signs and stable small-disturbance response tests |
| 5 | Production event localization, step splitting, and mode restart |
| 6 | Normative adaptive integrator, or an approved explicitly bounded contract revision |
| 7 | Correct dynamic mass, CG, inertia, and declared variable-mass angular physics |
| 8 | Production aerodynamic and recovery load assembly with validity propagation |
| 9 | Production separation operator tested against independent conservation oracles |
| 10 | Termination-aware safety reporting and no fabricated successful outcomes |
| 11 | End-to-end convergence and external trajectory validation with uncertainty |

Run artifacts should identify the commit, scenario, model validity, timestep/tolerances, termination reason, and numerical error metrics.

## Final verdict

**Credit earned:** shared production kernel, correct constant-inertia Euler algebra, consistent quaternion derivative/matrix conventions, stronger strict validation, and useful kernel convergence tests.

**Acceptance withheld:** full production-path verification, compliant frames, constrained launch dynamics, event localization, variable-mass rotational dynamics, and flight-readiness reporting.

**The decisive next step is not another isolated kernel benchmark. It is to make the production constrained RHS, load assembly, event localization, and discrete reset operators the subjects of independent analytical acceptance tests.**