# Astraea Round-13 Consolidated Engineering Audit

## 1. Executive disposition

**Updated complete-product quality score: 4.6/10.**  
**Engineering-core build-readiness verdict: NO-GO for baseline freeze and full UI build-out.**

The submission shows real progress: production now calls the shared stage-load kernel, the executable navigation-channel assignments are ENU-consistent, and the event detector receives distinct previous/current samples. These repairs deserve credit.

However, **the statement “all five engineering gates are closed” is contradicted by the supplied implementation.** The adaptive integrator has an invalid attitude-error estimator and remaining nontermination paths; the production inertia derivative contains an explicit factor-of-two error; aerodynamic forces omit transverse drag; events change dynamics after—not at—the localized crossing; and the simulator still modifies roll rate outside the integrator using a dimensionally incorrect limiter.

**Audit evidence boundary:** This is a static audit of the supplied source and tests. I have not executed the repository or independently verified the reported build and test results. A passing test report would not resolve the defects identified below because several are outside the assertions being exercised.

The score increase from round 12 is deliberately modest: **architectural linkage improved, but physical correctness and acceptance-evidence integrity remain insufficient.**

---

## 2. Engineering-gate disposition

| Gate | Disposition | Exact reason |
|---|---|---|
| **1r — Authoritative production loads and ENU** | **OPEN; architecture substantially repaired** | Shared assembly exists and executable ENU channel assignments are consistent. But the authoritative loads remain physically defective: missing transverse drag, hardcoded normal-force slope, no instantaneous combined CG, incorrect inertia derivative, and incomplete domain enforcement. External type comments still specify the retired frame. |
| **2 — Adaptive Dormand–Prince 5(4)** | **OPEN — P0** | Quaternion error is computed between derivative increments rather than normalized candidate attitudes. Stage loads are not validated. Rejection can stall indefinitely. Dense output is absent. Production does not select the adaptive solver. |
| **3 — Variable inertia** | **OPEN — P0** | Kernel algebra includes the correct term, but production supplies an incorrect transverse derivative and inertia about the wrong reference point. VV-013 does not exercise the production mass-property assembly. |
| **4 — Stage RHS and event integration** | **PARTIAL, not closed** | Re-evaluation at all four RK4 stages is implemented. However, event times are postprocessed without root-state propagation/restart; step-crossing discontinuities remain; a post-step roll limiter invalidates integration of the advertised equations. |
| **5 — Reproducible acceptance evidence** | **OPEN** | Gate flags depend on global test success and source-text suite presence, not required executed assertion results. Measured errors are not emitted. Git failure can masquerade as a clean tree. Installed-dependency reporting is incomplete/mislabeled. |

**Narrow closure credit:** The specific repair “production calls `integrateRigidStep()` with stage-dependent loads” is present. That is not equivalent to closure of the coupled flight-dynamics gate.

---

## 3. Kernel and production-path findings

### 3.1 Quaternion and inertia-axis algebra: correct fundamentals, incomplete verification

The following expressions are correct for the declared conventions:

- `quaternionDerivative()` implements
  \[
  \dot q_{NB}=\tfrac12 q_{NB}\otimes[0,\omega_B].
  \]
- `quaternionToMatrix()` and the transpose world-to-body transformation are mutually consistent for unit quaternions.
- Explicit rate mapping:
  \[
  \omega_B=(q_{\mathrm{pitch}},p_{\mathrm{roll}},r_{\mathrm{yaw}}).
  \]
- The gyroscopic signs in `angularAcceleration()` correctly implement
  \[
  I\dot\omega=M-\omega\times(I\omega)-\dot I\,\omega.
  \]
- Kernel inertia ordering `{pitch, roll, yaw}` matches the declared body axes.

The RK4 final combination is additive, rather than an invalid multiplicative blend of quaternion derivatives.

**Qualification:** Normalizing intermediate RK stage states modifies the textbook RK method. Its claimed order, especially for the adaptive embedded pair, requires convergence evidence for the actual projected implementation—not merely recognition of its coefficient table. VV-010 is useful evidence for one fixed-step coupled case, but does not establish general adaptive order.

### 3.2 ENU: executable channel repair is credible

The supplied implementation now consistently uses:

- `r.z` for vertical position;
- gravity in `forceN.z`;
- wind `{x: East, y: North, z: 0}`;
- the correct ENU rail vector;
- signed rail displacement \(r\cdot\hat u_{\rm rail}\);
- lateral landing distance \(\sqrt{x^2+y^2}\).

Initial attitude construction correctly aligns body \(+Y_B\) with the rail.

But the following still describe East–Up–North:

- `Vector3D`;
- telemetry position and altitude comments;
- the loads-module header;
- `windOverride`;
- simulator identity-mapping comments.

These are not current numerical swaps, but they are **public-interface hazards**. The renderer conversion was not supplied, so its handedness cannot be verified here. Require an explicit matrix \(R_D\) with:

\[
R_D^TR_D=I,\qquad \det R_D=+1,
\]

and basis-vector, cross-product, attitude, telemetry-export, and landing-map tests.

---

### 3.3 P0 — Adaptive attitude-error estimator is mathematically wrong

The code evaluates:

```ts
relQuatAngle(q5, q4)
```

where `q5` and `q4` are **accumulated increments**, not attitude quaternions.

The required comparison is:

\[
q^{(5)}=\operatorname{normalize}(q_n+\Delta q^{(5)}),\qquad
q^{(4)}=\operatorname{normalize}(q_n+\Delta q^{(4)}),
\]

followed by their geodesic separation.

Derivative increments are not orientations. Comparing their directions loses information about increment magnitude. For example, two different collinear tangent increments can produce zero increment-angle error while yielding different final orientations.

**Required repair:** Construct both full candidate attitudes, normalize them, and compute their relative rotation angle. Test nonzero spin, changing-axis torque, antipodal initial attitudes, and tight-tolerance attitude-coupled translation.

VV-014 exercises stationary attitude only. It therefore does not discriminate this defect.

### 3.4 P0 — Adaptive rejection is not bounded

The rejection branch contains:

```ts
if (dtNew < 1e-12) throw ...
dt = Math.max(1e-6, dtNew);
```

A persistently rejected trial at `dt = 1e-6` with shrink factor `0.2` produces `dtNew = 2e-7`. That does not trigger the throw, and the clamp restores `1e-6`.

**The same failed step can repeat forever.**

Other missing adaptive protections include:

- finite, ordered `t0`/`tEnd`;
- positive finite tolerances and `maxStep`;
- validation of every callback-returned load;
- finite error estimates;
- accepted-state validation;
- rejection/iteration limits;
- a representable-progress check;
- step control based on the **actual trial size `h`**, not an unclipped `dt`.

A NaN error ratio can also poison the rejection loop without triggering the numerical-floor comparison.

Furthermore:

- no dense-output implementation exists;
- `simulate6DofFlight()` never calls this solver;
- explicit DP5(4) is **not a general stiff solver**.

The normative adaptive-default contract is therefore unmet both mathematically and operationally.

---

### 3.5 P0 — Production inertia derivative contains a direct calculus error

The production code states:

```ts
2 * dmDt * dMot * dMot
```

for the derivative of the parallel-axis term with constant offset.

But:

\[
\frac{d}{dt}(m d^2)=\dot m d^2
\quad\text{when }d\text{ is constant},
\]

not \(2\dot m d^2\).

For a moving offset:

\[
\frac{d}{dt}(m d^2)=\dot m d^2+2md\dot d.
\]

This is an unambiguous defect.

The reference-point problem is separate. The implementation uses `baselineCg`, while the contract places the body origin at instantaneous combined CG. For dry mass \(m_d\) and motor mass \(m_m\):

\[
x_c(t)=\frac{m_dx_d+m_m(t)x_m(t)}{m_d+m_m(t)}.
\]

Both component inertias must be translated to this combined CG. The aerodynamic moment arm must use it too. Adding motor inertia about the dry baseline CG does not accomplish that.

The constant-flow claim also conflicts with the specification’s impulse-proportional depletion law. The supplied `getMotorMassAt()` implementation is absent, so consistency cannot be confirmed. **Production \(\dot I\) must differentiate the same mass law used to compute production \(I\).**

**Required discriminator:** Finite-difference `computeFlightLoads(...).inertiaB` across burn time and compare against its returned `inertiaDotB`, away from discontinuities.

VV-013 supplies synthetic inertias directly to the kernel; it cannot detect any of these production errors.

Finally, the no-angular-momentum-flux assumption needs a control-volume derivation. Axisymmetric discharge alone does not establish negligible rotational momentum transport by exhaust.

---

### 3.6 P0 — Aerodynamic drag is not transformed as a complete vector

For wind-axis drag magnitude \(D\), the body force must include:

\[
F_{D,B}=-D\frac{v_{\rm air,B}}{\|v_{\rm air,B}\|}.
\]

The implementation applies only:

```ts
aeroBody.y = -dragAxial * relBody.y / airspeed;
```

It omits the corresponding drag contributions in body \(x\) and \(z\). Those channels instead receive a separate normal-force model.

**A body-normal force is not a substitute for transverse wind-axis drag.**

An especially discriminating case is purely transverse flow:

\[
v_{\rm air,B}=(V,0,0),\quad V>0.
\]

Then:

- axial drag contribution is zero;
- `Math.sign(relBody.y)` is zero;
- normal force is zero.

**The assembled aerodynamic force is zero despite nonzero airspeed and dynamic pressure.** A deployed parachute inherits this defect.

Additional gaps:

- signed paired \(\alpha=\operatorname{atan2}(v_z,v_y)\) is not calculated;
- `alphaDeg` reports a folded total incidence;
- `abs(relBody.y)` folds tail-first flow into small incidence;
- `cna = 12` bypasses vehicle/Mach-dependent normal-force slope;
- Mach endpoint clamping is not accompanied by load-level validity classification;
- finite pitch/yaw damping remains at zero airspeed through `Math.max(1, airspeed)`.

Galilean invariance tests cannot validate these laws: a physically wrong function of \(v-w\) can still be Galilean invariant.

---

### 3.7 P0 — Post-step roll limiter corrupts the solved dynamics

The code still modifies `omega.p` after kernel integration.

From the implemented moment law, the roll damping coefficient multiplying rate is:

\[
c_p=\frac{\bar q S r^2 C_{lp}}{2V}.
\]

But the limiter estimates its timescale using:

\[
\bar q S r^2 C_{lp},
\]

omitting \(2V\). Its purported equilibrium `sin(cant)/r` also lacks velocity dimensions. Ignoring inertia variation and cross-axis coupling, the implemented moment model instead gives:

\[
p_{\rm eq}=\frac{2V\sin\delta}{r}.
\]

The limiter neither integrates this equilibrium nor preserves the advertised equations. At zero cant it can abruptly force nonzero roll to zero, while retaining an attitude already advanced with the pre-clamp dynamics.

**Remove it.** If a reduced fast-mode model is justified, derive it, expose its applicability, and integrate it consistently with attitude and conservation accounting.

---

## 4. Event FSM and root localization

### Correct repairs

- Previous/current samples are now distinct.
- One-shot flags exist.
- Direction and bracket checks exist.
- Returned times may lie between macro-step samples.

### P0 — Localized timestamps are not localized dynamics

The production sequence is:

1. Integrate a full macro-step under old mode flags.
2. Detect a crossing at the next loop iteration.
3. Assign a retrospective interpolated timestamp.
4. Change flags at the current macro-state.

The simulator does not reconstruct the root state, stop there, apply the transition, and integrate the remaining interval.

Consequences include:

- rail constraint persists beyond actual rail exit;
- recovery loading begins late;
- event altitude and velocity do not belong to the reported event time;
- touchdown clamps altitude to zero but retains overshot velocity and lateral position;
- `flightDuration` can differ from localized touchdown time.

**Backdating an event record is not event-resolved integration.**

### Linear interpolation does not guarantee \(10^{-5}\) s accuracy

`localizeCrossing()` is a linear chord interpolation. It is not the contracted fourth-order dense output.

For a smooth event function, chord timing error scales approximately as:

\[
|\delta t|\sim \frac{|f''|h^2}{8|f'|}
\]

near a midpoint crossing. Error can grow near shallow crossings. The selected VV-012 cases cannot establish a universal timing bound.

VV-006 is weaker as production evidence: its refinements use test-local analytical functions rather than the production event mechanism.

### Remaining FSM edge cases

- Main deployment never occurs if apogee is already below the deployment threshold and no descending threshold crossing follows.
- A vertical-velocity crossing before burnout may be lost permanently; abnormal trajectories need explicit handling rather than nominal-sequence suppression.
- Events discovered within the same bracket are appended in code order rather than resolved chronologically.
- Event utilities do not validate finite values or increasing sample time.

---

## 5. Evidence and complete-product gaps

### Gate 5 is not fail-closed at the required granularity

The emitter’s claims exceed its behavior:

1. **Suite existence is parsed from source, not proven execution.** A skipped or excluded required suite can still exist in source.
2. **Global test success is assigned to individual gates.** No required-test-to-gate result mapping is enforced.
3. **Observed numerical errors are absent.** Tests assert values but do not emit the claimed tolerance/measurement records.
4. **Per-file result parsing is suspect.** Standard Vitest JSON uses assertion-result arrays; `f.assertions?.passed` does not establish executed per-suite totals.
5. **Git failure defaults to apparently clean status.** Unknown commit identity must make certification fail.
6. **A pnpm YAML lockfile is read as JSON.**
7. **Lockfile resolution is not measurement of installed dependencies.**
8. **The reported 12-suite inventory is stale:** the supplied file also includes VV-014 and VV-015.

Also, VV-005 performs staging algebra inside the test rather than calling a production separation implementation. It does not establish production staging readiness.

### Full-product scope remains largely unverified

The supplied evidence does not establish readiness of:

- component-resolved mass tensors and staging;
- two-button rail tip-off and rail friction;
- parachute inflation and opening-shock prediction;
- terrain/geoid integration and run-manifest flat-terrain declaration;
- uncertainty sampling, failed-member accounting, and containment validation;
- sensor decoders and sensor-physics models;
- competition-rule provenance;
- schema migration and interoperability fidelity;
- UI/worker performance and numerical reproducibility.

The normative document resolves some precedence conflicts, but retaining contradictory executable-facing contracts is unsafe. Examples include:

- adaptive default versus fixed-step production;
- instantaneous-CG origin versus baseline-CG loading;
- AGL labeling versus a flat local vertical coordinate;
- ultimate-strength margin policy versus proof-load formulas;
- general screening thresholds versus competition-specific requirements.

**Safety outputs also remain inconsistent:** `isLandingSafe` and `isRailExitSafe` can be true on an `UNKNOWN` out-of-envelope run. Numerical threshold checks must not be presented as supported safety determinations without validity gating.

Separately, the specified recovery-control design needs hazard review: a fixed burnout-plus-three-second backup trigger can precede physical apogee, and a blanket in-flight fault lock could disable remaining recovery capability. A software build gate is not a substitute for that review.

---

## 6. Required closure package before 8.5+/10

An 8.5+ score requires demonstrated correctness, not additional feature breadth.

### A. Correct the numerical core

- Repair the adaptive attitude estimator.
- Validate every stage and all solver controls.
- Guarantee bounded rejection and representable progress.
- Implement dense output and root-state restart.
- Wire the selected default solver into production.
- Remove the post-step roll limiter.

### B. Correct the physical assembly

- Use instantaneous combined CG and consistent mass-property tensors.
- Derive \(\dot I\) from the actual mass/inertia law.
- Apply complete air-relative drag vectors.
- Separate body-normal and wind-axis coefficient conventions explicitly.
- Define reverse-flow, low-speed, recovery, and model-domain behavior.
- Implement declared terrain handling and validity propagation.

### C. Add discriminating production-path tests

At minimum:

- adaptive nonzero-spin and changing-axis convergence;
- invalid-stage-load and rejection-floor termination;
- full production inertia finite-difference checks;
- transverse-flow drag and parachute drift;
- signed incidence and tail-first domain rejection;
- event phase sweeps across timestep boundaries;
- localized state/time consistency and transition restart;
- low-apogee and abnormal-flight event cases;
- full-flight refinement with no hidden state clipping.

### D. Bind acceptance to reproducible measurements

Emit immutable-source identification, actual runtime configuration, executed required-test IDs, measured errors, tolerances, skips, failures, and artifact hashes. Any missing required evidence must prevent a green gate.

For full-product readiness, additionally provide a requirement-to-implementation-to-test matrix, with unsupported capabilities explicitly disabled rather than implied by specification text.

---

## 7. Final build-readiness verdict

**NO-GO for engineering-core freeze, full UI build-out against a supposedly certified model, or flight-readiness claims.**

Continue targeted core repair and test work. Isolated UI prototyping is reasonable if it uses explicitly provisional interfaces and does not present the current safety outputs as authoritative.

**Round-13 conclusion:** The shared-kernel architecture and ENU repair are meaningful improvements. Nevertheless, all five gates remain open at their stated acceptance scope. The remaining defects are not cosmetic—they directly affect attitude error control, angular dynamics, aerodynamic forces, recovery drift, event-state accuracy, and the credibility of the acceptance artifact.