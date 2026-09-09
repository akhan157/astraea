# Astra — Seventh-Round Engineering Audit

## Executive disposition

**Updated Executive Quality Score: 6.1/10, up from 5.8/10.**

The shared production kernel is a substantive architectural improvement. The supplied benchmarks now directly exercise production code for ballistic propagation, torque-free rotation, quaternion antipodal propagation, axis isolation, and rotating-force integration.

**However, Gate A is not fully closed.** The submitted source contradicts several closure claims:

- **VV-005 does not call the production kernel or a production separation function.** It tests test-local separation algebra.
- **VV-006 does not call a production event localizer.** It solves analytical functions in the test.
- **VV-004 still assembles aerodynamic force in the test**, rather than testing the production loads assembly.
- **VV-011 calls the production event FSM, but its assertions do not establish event localization accuracy or all claimed sequencing guarantees.**
- The production simulator and `events.ts` source were not supplied, so their actual wiring cannot be inspected.

**Build-readiness verdict: suitable for continued development and restricted numerical evaluation; not accepted as a verified flight-readiness analysis system.**

I have reviewed the supplied source, not executed the repository. The reported **50/50 tests and clean build are reported evidence, not independently reproduced results**.

---

## 1. What is genuinely improved

The following changes deserve credit:

1. **One authoritative propagation implementation.**  
   `integrateStep()` is a thin adapter over `integrateRigidStep()`. That is the correct architecture.

2. **Correct inertial angular-momentum vector comparison in VV-002.**  
   Comparing \(\|\mathbf L_N(t)-\mathbf L_N(0)\|\), rather than only magnitudes, detects attitude/rate inconsistency that magnitude checks miss.

3. **Stage-dependent load evaluation is present.**  
   The callback receives the intended RK stage times and constructed stage states.

4. **The diagonal-inertia Euler equations have the correct constant-inertia signs and axis associations.**

5. **Silent inertia flooring has been removed from the integration path.**

6. **A quaternion-dependent forcing convergence test exists.**  
   `bodyForceViaState()` actually consumes the propagated stage quaternion. This is considerably stronger than a prescribed time-dependent force alone.

These are meaningful improvements—not merely documentation changes. They do not, however, establish production-system acceptance.

---

## 2. Gate A: partially closed, not genuinely complete

| Verification subject | Production subject actually exercised? | Audit disposition |
|---|---|---|
| VV-001 ballistic propagation | Yes: production rigid-body kernel | Kernel linkage established |
| VV-002 torque-free rotation | Yes: production rigid-body kernel | Kernel linkage established |
| VV-003 antipodal invariance | Yes: kernel; force coupling assembled in test | Partial |
| VV-004 aerodynamic-load invariance | Production coefficient function, but test-local load assembly | Open |
| VV-005 staging conservation | **No production separation call; no kernel call** | Open |
| VV-006 event localization | **Test-local propagation/root calculations** | Open |
| VV-007 full simulator | Yes, but broad smoke/sign checks | Integration smoke coverage only |
| VV-009 inertia-axis discrimination | Yes: kernel axes | Does not certify simulator adapters |
| VV-010 rotating-force convergence | Yes: production kernel and stage callbacks | Useful numerical evidence, with limitations |
| VV-011 event FSM | Yes: production FSM import | Partial behavioral coverage; localization unproven |

### Decisive finding: VV-005 still verifies a reference implementation

`runCase()` constructs child velocities, angular impulses, and momentum sums inside the test. It never invokes production staging.

Its result establishes:

> The test’s equal-and-opposite common-contact impulse construction conserves momentum.

It does **not** establish:

> The production staging implementation conserves momentum.

Furthermore:

- No parent inertia is constructed or checked against the parallel-axis identity.
- Pre-separation momentum is calculated from already partitioned children, not independently from the parent state.
- “Case 2: off-axis contact” uses contact position `(0, 0.2, 0)`: that is still on the longitudinal body axis.
- The test uses the parent-CG location as its origin at the separation instant; an independently translated inertial origin is not exercised.
- Its linear-momentum scale is an arbitrary characteristic value, not the specified initial-momentum norm.

**Required closure:** extract or expose the production separation transition and make that function—not copied impulse algebra—the test subject.

### Decisive finding: VV-006 still verifies test-local roots

The descending-altitude test propagates with Euler-Cromer, then Newton-refines using the **exact analytical trajectory**:

\[
z(t)=v_0t-\tfrac12gt^2.
\]

That replaces the numerical trajectory error with an exact-function root calculation. It does not verify numerical dense output.

The rail test likewise evaluates the exact analytical altitude during root refinement.

**Required closure:** integrate with production code, localize through the production event path, and use the analytical root only as the external oracle.

---

## 3. Kernel algebra audit

### 3.1 Quaternion derivative: correct, under the stated convention

For a scalar-first Hamilton quaternion rotating body coordinates into navigation coordinates,

\[
\dot q_{NB}=\tfrac12q_{NB}\otimes[0,\boldsymbol\omega_B],
\]

the supplied component equations are correct.

`quaternionToMatrix()` is consistent with that convention **for a unit quaternion**.

### 3.2 Quaternion input validation: incomplete

`validateStateAndLoads()` checks quaternion components for finiteness but does not check quaternion norm.

Consequently, an arbitrary finite non-unit quaternion is accepted at entry:

- `loadsAt(startTime, s)` receives the non-unit quaternion.
- `quaternionToMatrix(s.q)` then need not produce an orthogonal rotation.
- The first quaternion derivative uses the unnormalized input.
- Later normalization does not undo the incorrect first-stage force evaluation.

A zero quaternion will eventually throw during stage normalization, but it is passed to the initial callback first.

**Required correction: establish the attitude invariant before any RHS callback.** Either:

- reject quaternions outside a documented unit-norm tolerance; or
- normalize a validated, nondegenerate input once and consistently use that normalized state throughout the step.

Normalization near the unit sphere is numerical constraint enforcement, not fabrication of an attitude.

### 3.3 RK stages: structurally correct, but the method is not classical RK4 verbatim

The position, velocity, and angular-rate stage construction and final \(1,2,2,1\) weighting are correct.

However, quaternion normalization is applied at intermediate stages. That makes this a **projected RK construction**, not simply classical RK4 on the unmodified 13-component ODE.

I am not declaring the method incorrect. I am rejecting an unsupported generalization:

> One constant-spin case does not establish fourth-order convergence for general coupled attitude, torque, and aerodynamic dynamics.

Add smooth manufactured solutions with:

- changing angular-rate direction;
- nonzero attitude-dependent torque;
- asymmetric inertia;
- force depending jointly on attitude, velocity, position, and time.

Measure position, velocity, attitude angle, and angular-rate errors separately.

### 3.4 Constant-inertia Euler equations: correct

The code implements

\[
I_x\dot\omega_x=M_x-(I_z-I_y)\omega_y\omega_z
\]

and the correct cyclic permutations.

With \(x=\text{pitch}\), \(y=\text{roll}\), \(z=\text{yaw}\), this is correct.

### 3.5 Variable-inertia dynamics: missing contract term

The callback permits changing `inertiaB`, but the angular equation omits

\[
-\mathbf I^{-1}\dot{\mathbf I}\boldsymbol\omega.
\]

Re-evaluating inertia at every stage does **not** supply its derivative or angular-momentum flux.

Under the specification’s stated zero-flux assumption, single-axis torque-free motion should satisfy

\[
I(t)\omega(t)=\text{constant}.
\]

The supplied kernel instead gives \(\dot\omega=0\) for pure-axis rotation, even as inertia changes.

**This is an implemented-model gap, not a timestep problem.**

Either implement the specified variable-mass angular-momentum balance, including clearly defined flux assumptions, or explicitly restrict the kernel to constant-inertia rotational dynamics.

### 3.6 Strict validation claims are too broad

Additional issues:

- `angularAcceleration()` is exported but does not itself throw on invalid inertia. Its safety depends on the caller’s precondition.
- Finite `t0` and `dt` do not guarantee finite `t0 + dt`.
- Stage callbacks are invoked before the constructed stage state is validated.
- A callback can mutate the supplied state object; no purity enforcement is present.

These do not invalidate normal valid-state calculations. They do invalidate the blanket assertion that all out-of-domain cases are rejected at every boundary.

---

## 4. Frame and simulator mapping audit

### Finding: correctness cannot be confirmed from this submission

Your descriptions conflict:

1. The normative contract specifies canonical ENU state.
2. The update says the simulator now passes display-frame vectors and quaternion unchanged.
3. The supplied kernel still labels its state and forces ENU.
4. The update describes exported display adapters that are absent from the supplied kernel.

A Cartesian kernel can legitimately operate in a right-handed display frame. **Frame-agnostic mathematics does not make frame semantics interchangeable.**

For the stated display transform,

\[
C_{DN}=
\begin{bmatrix}
-1&0&0\\
0&0&1\\
0&1&0
\end{bmatrix},
\qquad \det C_{DN}=+1,
\]

consistent conversion requires

\[
r_D=C_{DN}r_N,\quad
v_D=C_{DN}v_N,\quad
F_D=C_{DN}F_N,
\]

and

\[
R_{DB}=C_{DN}R_{NB}.
\]

If the body frame is unchanged, this is a **left composition** of attitude, not a vector-only transformation.

Identity passage is internally valid only if all participating world quantities—including quaternion, gravity, wind, rail geometry, and event vertical direction—already share that same frame. ENU telemetry must still be converted explicitly.

### VV-007 does not resolve the ambiguity

The test asserts positive `landingPosition.x` for East.

That is correct if `landingPosition` is ENU. Under the specified display mapping, East instead has negative display \(x\).

Without a declared output frame and inspected simulator wiring, the sign assertion cannot certify the mapping.

### Body-label adapters: conditionally correct

The rate mapping

```ts
{x: o.q, y: o.p, z: o.r}
```

is correct for the stated labels.

The inertia mapping is correct **only if** simulator `I.x` really denotes axial roll inertia and `I.y` pitch inertia. That producer is not supplied.

VV-009 bypasses these adapters entirely. It certifies kernel axis isolation, not production-boundary wiring.

---

## 5. Acceptance-test weaknesses requiring correction

### 5.1 VV-003’s liveness guard proves force activity, not attitude coupling

A constant nonzero navigation-frame force would:

- produce identical trajectories for \(q\) and \(-q\); and
- differ from the zero-force baseline.

Therefore, both assertions could pass with attitude coupling removed.

Add two genuinely different orientations and analytically distinct expected acceleration vectors. Also correct the swapped baseline moment components; the comment says the moments are identical, but they are not.

### 5.2 VV-010’s negative control targets the wrong production regression

The frozen run holds force fixed for the entire trajectory. The realistic regression is:

> Recompute loads at each step’s initial state, but freeze them within that step.

That method generally converges at reduced order rather than retaining an \(O(1)\) error.

Test all three variants:

1. globally frozen force;
2. per-step refreshed, stage-frozen force;
3. stage-refreshed force.

Also use a coarser convergence ladder. With \(\Omega h=0.004\), the finer fourth-order errors may approach roundoff. Require a credible order band, not just ratios greater than eight, and avoid combining meter and meter-per-second errors through an unscaled maximum.

### 5.3 VV-011 assertions do not establish their advertised behavior

- Rail-exit count is checked, but the firing sample/time is not.
- Burnout is checked for existence and uniqueness, not timestamp.
- Apogee and rail-exit indices are collected, but their ordering is not asserted.
- The “no ascending main deployment” test stays near **9,000 m**, far above the 250 m threshold. A broken altitude-only trigger also passes.

Test ascending flight **below the deployment threshold**, negative vertical velocity before rail release, threshold overshoot, repeated boundary values, touchdown, and multiple candidate events within one integration step.

**A sampled event FSM is not a dense-output event localizer.** Production acceptance also requires propagation to the earliest root, transition application, and restart over the remaining interval.

---

## 6. Remaining requirements before 8.5+/10

The minimum closure package is:

1. **Production-path traceability**
   - Supply the actual simulator and event implementation.
   - Test production loads assembly, separation transition, localization, and adapters.
   - Eliminate remaining test-local substitutes for those functions.

2. **Integrator contract compliance**
   - Implement adaptive Dormand–Prince 5(4), tolerances, dense output, and transition restart; or formally approve a narrower fixed-step development baseline.
   - The normative document itself must be corrected: it requires Dormand–Prince while mandating the classical RK4 final quaternion weights. Both cannot define the same accepted-step formula.

3. **Frame closure**
   - One explicit internal frame and typed/documented boundary conversions.
   - Non-identity-attitude tests covering East, North, Up, gravity, body thrust, and wind.

4. **Mass-property closure**
   - Variable-inertia model consistent with the adopted momentum balance.
   - Production parent-to-child mass, CG, inertia, and impulse verification.
   - Full-tensor support or explicit rejection of partitions producing unsupported products of inertia.

5. **Production-configuration numerical evidence**
   - Error and convergence results at actual operational timesteps/tolerances.
   - The \(10^{-4}\) s conservation test alone does not establish performance at the specification’s \(10^{-2}\) s cadence.
   - Machine-readable results tied to commit, configuration, tolerances, and test identity.

6. **Validity and application-level evidence**
   - Terrain-AGL event handling or explicit flat-terrain manifest.
   - Unsupported-model propagation to non-PASS outcomes.
   - Sourced flight-data validation with uncertainty, not only broad trajectory bounds.
   - Separate software verification from hardware, competition, and flight-safety certification claims.

---

## 7. Final verdict

| Item | Disposition |
|---|---|
| Shared production integration kernel | **Accepted architectural improvement** |
| Constant-inertia quaternion/Euler algebra | **Correct under stated unit-quaternion conventions** |
| General fourth-order coupled accuracy | **Partially evidenced** |
| Simulator ENU/display/attitude wiring | **Not verified** |
| Variable-inertia contract | **Not implemented in supplied kernel** |
| Production staging acceptance | **Open** |
| Production event localization acceptance | **Open** |
| Gate A, complete production-path analytical acceptance | **Not closed** |
| Development build | **Proceed with restrictions** |
| Flight-readiness analysis release | **Hold** |

**Bottom line:** you have made the production integrator a genuine subject of analytical testing. That closes an important architectural defect. You have not yet made the full production physics path the subject of the claimed acceptance matrix.

The next decisive step is not another increase in passing-test count. It is to replace the remaining test-local loads, separation, and event calculations with calls to their authoritative production implementations—and demonstrate that deliberate defects in those implementations cause the acceptance tests to fail.