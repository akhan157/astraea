# Astra — Round-12 Consolidated Engineering Audit

## 1. Executive disposition

**Updated Executive Quality Score: 4.2/10 for the consolidated product as submitted.**  
**Engineering-core build-readiness verdict: NO-GO.**

This is a source-review assessment of the supplied implementation and tests—not an independently executed build. I cannot certify the reported **57/57 tests** or repository provenance from the excerpts.

The reduction from the previously reported **5.8/10** is warranted by newly visible, release-blocking defects:

1. **Production propagation destroys the North coordinate and substitutes vertical velocity into it.**
2. **The adaptive quaternion error estimator rejects even an exactly stationary attitude indefinitely at the contracted tolerance.**
3. **Event localization is not connected to production event processing.**
4. **Production wind remains in the old display-axis arrangement.**
5. **Aerodynamics, mass properties, recovery dynamics, and failure semantics do not implement the normative contract.**
6. **The evidence emitter asserts gate closure without deriving it from passing, applicable verification results.**

The refactoring toward shared kernels and loads is useful architectural progress. It is not equivalent to physical correctness or end-to-end verification.

**The statement “all five engineering gates are closed” is contradicted by the supplied source.**

---

## 2. Gate closure adjudication

| Gate | Disposition | Exact reason |
|---|---|---|
| **1r — Production loads assembly + ENU** | **OPEN — critical failure** | Shared assembly exists, but production state transfer duplicates `z` into `y`, write-back never updates `y`, wind puts North into `z`, and telemetry repeats the same corruption. Loads also violate the contracted aerodynamic convention. |
| **2 — Adaptive DP5(4)** | **OPEN — critical failure** | Incorrect quaternion error metric causes nontermination for a trivial exact solution; no bounded rejection failure; stage validation incomplete; no dense output; not production default or production-wired. |
| **3 — Variable inertia** | **PARTIALLY IMPLEMENTED; OPEN** | Kernel algebra includes the correct term for the stated mathematical model. Production inertia lacks motor placement/parallel-axis contributions and instantaneous CG; `inertiaDotB` is not shown consistent with the actual mass history. VV-013 tests synthetic loads, not that production consistency. |
| **4 — Stage RHS reevaluation** | **SUBFEATURE VERIFIED BY INSPECTION; SYSTEM GATE OPEN** | RK4 calls the factory at the four correct stage times. However, it starts from corrupted production states; events do not split steps; post-step angular-rate clipping changes the integrated dynamics. Associated event-localization closure is false. |
| **5 — Reproducible evidence** | **OPEN** | Hard-coded coverage flags, unreliable shell exit handling, source-comment suite discovery, incorrect solver-default inference, no actual dependency resolution or source-tree cleanliness binding, and no per-requirement measured results. |

**No gate receives unconditional closure at consolidated-product level.** The shared stage-RHS mechanism and kernel variable-inertia algebra deserve explicit implementation credit, but not broader certification.

---

## 3. Critical findings

### P0-01 — Production ENU state is corrupted at every macro-step

In `sixDofSimulator.ts`:

```ts
r: { x: pos.x, y: pos.z, z: pos.z },
v: { x: vel.x, y: vel.z, z: vel.z },
```

This appears in both `macroState` and `kernelInState`.

Write-back then does:

```ts
pos.x = next.r.x; pos.z = next.r.y; pos.z = next.r.z;
vel.x = next.v.x; vel.z = next.v.y; vel.z = next.v.z;
```

Consequences:

- `pos.y` and `vel.y` remain at their initialized values.
- The computed North solution is discarded.
- Each next step invents North position and velocity equal to Up.
- Even a vertical, zero-wind flight is presented to the loads assembly as having a spurious horizontal air-relative velocity.
- North landing drift cannot propagate correctly.

The required transfer is simply:

```ts
r: { ...pos },
v: { ...vel },
```

and:

```ts
pos = { ...next.r };
vel = { ...next.v };
```

The defect also affects:

```ts
Math.sqrt(pos.x * pos.x + pos.z * pos.z + pos.z * pos.z)
Math.sqrt(vel.x * vel.x + vel.z * vel.z + vel.z * vel.z)
```

For purely vertical motion, these yield **√2 times** the actual distance or speed. The corresponding kinetic energy is **twice** the correct value for that velocity.

Rail travel must be the signed projection:

\[
s=(\mathbf r-\mathbf r_{\rm rail,0})\cdot\hat{\mathbf u}_{\rm rail},
\]

not the Euclidean distance—and certainly not a norm with a duplicated component.

**Required closure evidence:** production-path vertical symmetry, North/South and East/West launch tests, cardinal-wind tests, and rotational symmetry about navigation Up. An East-only drift-sign test cannot expose the missing North channel.

---

### P0-02 — Wind is not ENU

`getWindVectorAt()` returns:

```ts
{
  x: speed * Math.sin(towards),
  y: 0,
  z: speed * Math.cos(towards),
}
```

That is **East, Up, North storage**, not ENU.

For the declared meteorological “coming from” convention, the horizontal ENU result is:

```ts
{
  x: speed * Math.sin(towards),
  y: speed * Math.cos(towards),
  z: 0,
}
```

As written, a North/South wind becomes a vertical wind.

VV-004 supplies `windOverride`, so it **bypasses precisely the function that is wrong**. Common-boost invariance does not establish axis correctness.

The rail vector and initial body-to-rail quaternion construction are otherwise consistent with ENU over the permitted elevation range.

---

### P0-03 — Adaptive integration can loop forever on an exact stationary solution

The error estimator computes:

```ts
const errQ = normQuatAngle({
  w: q5.w - q4.w,
  x: q5.x - q4.x,
  y: q5.y - q4.y,
  z: q5.z - q4.z
});
```

where:

```ts
return Math.acos(clamp(q.w));
```

But `q5` and `q4` are **derivative increments**, not normalized attitude estimates. Their difference is not a rotation quaternion.

#### Decisive counterexample

Take:

- unit initial attitude;
- zero angular velocity;
- zero applied moment;
- positive finite mass and inertia;
- finite integration interval.

Both quaternion increments are identically zero:

\[
\Delta q_5=\Delta q_4=0.
\]

The implementation evaluates:

\[
err_Q=\arccos(0)=\pi/2.
\]

At the contracted attitude tolerance of \(10^{-5}\) radians, every step is rejected. Shrinking the timestep cannot change this exact result.

The rejection branch reaches its `1e-6` floor and continues indefinitely because there is no rejection limit or minimum-step failure exit.

**This is a deterministic nontermination defect, not an accuracy concern.**

The estimator must compare the normalized candidate attitudes:

\[
Q_5=\operatorname{normalize}(Q_n+\Delta Q_5),\qquad
Q_4=\operatorname{normalize}(Q_n+\Delta Q_4),
\]

using:

\[
e_Q=2\arccos\!\left(\operatorname{clamp}(|Q_5\cdot Q_4|,0,1)\right),
\]

or a numerically stable equivalent based on the relative quaternion.

Additional adaptive defects:

- No finiteness/order validation of `t0` and `tEnd`.
- No positive-finite validation of all tolerances and `maxStep`.
- No validation of every stage-returned load.
- No final accepted-state finiteness validation.
- No maximum attempted-step count or representable-time-progress guard.
- Step control is based on `dt`, not consistently on the actual attempted `h`.
- No fourth-order continuous extension.
- No event interface.
- No production caller.
- No test of `integrateRigidAdaptive()` appears in the supplied V&V suite.

The Dormand–Prince tableau coefficients themselves are recognizable and correctly transcribed. **A correct tableau does not make this implementation a correct adaptive solver.**

Also, explicit DP5(4) is **not a general stiff solver**. Adaptivity does not remove its stability restriction.

---

### P0-04 — Production events remain timestep-quantized

The simulator imports and calls `detectEvents()`. It does **not** call either localization function.

Production events are recorded at the current macro-step time:

```ts
time: t
```

There is no:

- previous/current continuous-state bracket;
- dense-output evaluation;
- earliest-event selection inside an accepted step;
- advancement to the localized root;
- transition/reset at that state;
- reintegration of the remainder.

Therefore:

- Rail constraints persist beyond physical release until the next tick.
- Deployment changes occur at tick boundaries.
- Burnout can be crossed within one RK step.
- Touchdown is detected after ground penetration, then altitude is overwritten with zero.
- Event velocities and energies are not evaluated at localized event states.

**The claimed \(10^{-5}\,\mathrm s\) production event accuracy is unsupported.**

#### The helper is linear interpolation, not a DP dense extension

For a smooth scalar crossing with nonzero slope, chord-root timing error scales approximately as:

\[
|\delta t|\lesssim
\frac{\max|g''|}{8\min|g'|}\,h^2.
\]

It does not have a universal \(10^{-5}\,\mathrm s\) guarantee. Slow crossings and strong curvature are particularly adverse.

VV-012 evaluates the production helper on **analytically generated samples**, not production flight-event data. VV-006 additionally refines against an analytical trajectory in test-local code. Those are helper/reference tests, not production localization acceptance.

---

### P0-05 — FSM semantics are weaker than claimed

`detectEvents()` has no previous scalar values or previous time. It cannot establish a genuine crossing.

Examples:

- Rail exit is a level test; “ascending implied” is not a direction filter.
- Apogee is `verticalVelocity <= 0` after rail exit and `t > 0.8`.
- Apogee does not require burnout despite the specified nominal sequencing.
- Touchdown has no descending-direction test.
- Hard-coded `0.8` and `1.0` second guards substitute for explicit arming/liftoff semantics.
- A trajectory that never leaves the rail can time out without a well-defined failed-launch terminal state.

A robust FSM needs explicit handling for no-liftoff, abort/failure, early descent, invalid data, simultaneous events, and terminal-state immutability.

---

## 4. Kernel algebra: what is correct and what is not established

### Correct by inspection

**Quaternion derivative**

The component equations implement:

\[
\dot q_{NB}=\tfrac12 q_{NB}\otimes[0,\omega_B]
\]

for scalar-first Hamilton quaternions and body-to-navigation attitude.

**Rotation matrix**

`quaternionToMatrix()` matches that convention for a unit quaternion. `rotateWorldToBody()` applies its transpose correctly.

**Body-rate labels**

```ts
{ x: o.q, y: o.p, z: o.r }
```

correctly maps pitch, roll, yaw labels into the stated body axes.

**Euler rotational dynamics**

The kernel implements:

\[
\dot\omega=I^{-1}
\left(M-\omega\times I\omega-\dot I\,\omega\right)
\]

with correct diagonal-inertia cross-product signs.

**RK4 stage timing and weighting**

The loads callbacks occur at:

\[
t,\quad t+h/2,\quad t+h/2,\quad t+h,
\]

and the final weighted sum uses \(1,2,2,1\).

### Qualifications

1. Intermediate quaternion normalization makes this a projected RK construction. The supplied constant-spin convergence test is useful, but does not establish general coupled-system order over changing angular rates, inertia, and aerodynamic moments.
2. `validateStateAndLoads()` does **not validate `inertiaDotB`**.
3. Intermediate states are passed into callbacks before their full state validation.
4. Finite `t0` and `dt` do not guarantee finite stage times when added.
5. Raw `quaternionToMatrix()` has no unit-attitude guard.
6. The legacy inertia adapter uses `x=roll` on its input side. That is acceptable only as an explicitly typed legacy representation, not as physical Cartesian tensor notation.

**Conclusion:** foundational quaternion and Euler algebra are substantially correct. The surrounding production implementation invalidates the stronger system-level claims.

---

## 5. Production physical-model deficiencies

### 5.1 Mass, CG, and inertia are not a consistent vehicle model

`prepareVehicle()` approximates the entire dry vehicle as a uniform cylinder. The motor inertia is then added about the motor’s own centroid without translation to the combined instantaneous CG.

Missing elements include:

- Motor mount axial location.
- Wet/instantaneous vehicle CG.
- Parallel-axis contributions.
- Geometry-resolved component inertias.
- Consistent derivatives of those mass properties.

The aerodynamic moment arm uses `baselineCg`, not the changing combined CG.

Furthermore:

```ts
dmDt = -propellantMass / burnTime
```

is consistent only with constant-rate depletion. The product contract specifies impulse-weighted depletion:

\[
\dot m_p(t)=-m_{p,0}\frac{F(t)}{I_{\rm total}}.
\]

The supplied `getMotorMassAt()` implementation is absent, so its actual behavior is not independently established here. Either its derivative disagrees with the production `dmDt`, or a constant-flow implementation disagrees with the specified motor model.

**Required test:** compare analytical `inertiaDotB` against a numerical derivative of the **same production inertia assembly** at interior burn times, with explicit one-sided handling at discontinuities.

The open-system angular-momentum assumption also needs a defensible derivation. Axisymmetric discharge alone does not guarantee negligible exhaust angular-momentum flux for a spinning vehicle.

---

### 5.2 Aerodynamic assembly violates the normative coefficient convention

The code uses:

```ts
alpha = atan2(latSpeed, max(0.1, abs(relBody.y)));
cna = 12.0;
```

and places the tabulated drag directly along the body longitudinal axis.

Problems:

- No contracted paired \(\alpha,\beta\).
- Reverse flow is folded into forward-flow incidence by `abs`.
- Normal-force slope is hard-coded rather than derived from vehicle/Mach data.
- Wind-axis drag is used as body-axis axial force without conversion.
- No validity classification is returned.
- Out-of-table Mach values silently use endpoint coefficients.

A Galilean-invariance test can pass an aerodynamically incorrect law. It checks dependence on relative velocity—not coefficient meaning, force direction, or validity.

---

### 5.3 Roll damping is dimensionally inconsistent

The implemented damping term is:

\[
\bar q\,S\,r^2\,4\,p.
\]

With a dimensionless coefficient, its units are:

\[
\mathrm{N\,m^2/s},
\]

not torque.

The contract instead uses a nondimensional rate such as \(pd/(2V)\) inside a moment coefficient. This discrepancy likely contributes to the claimed extremely short roll timescale.

The subsequent post-step limiter:

```ts
omega.p = sign(omega.p) * min(abs(omega.p), abs(pEq));
```

is not a verified quasi-steady reduction:

- It does not necessarily set the correct equilibrium sign.
- It acts after attitude has already integrated the potentially unstable rate.
- It alters angular momentum without a modeled impulse.
- It does not repair incorrect torque dimensions.

**Correct the physical damping law before selecting a stiffness treatment.**

---

### 5.4 Recovery behavior is not validated descent dynamics

Deployment swaps drag area/coefficient while retaining a body-axis force model. That does not establish parachute drag aligned with relative airflow or canopy/payload dynamics.

Other gaps:

- Body aerodynamic loads are effectively replaced rather than consistently combined.
- Inflation evolution is absent.
- Drogue deployment forcibly zeroes angular rates without an impulse model.
- Parachutes are selected by component order rather than explicit recovery roles.
- Missing/invalid coefficients can be replaced using truthiness defaults.

Landing safety outputs cannot be trusted until both the vector corruption and recovery model are corrected.

---

## 6. Why the evidence suite does not close the gates

### Production linkage is necessary, not sufficient

The supplied tests demonstrate several useful properties, but their scope is substantially narrower than the gate claims:

- **VV-004:** bypasses production wind generation.
- **VV-005:** constructs separation physics inside the test; it does not call a production separation implementation.
- **VV-006:** uses test-local propagation and analytical root refinement.
- **VV-007:** checks broad bounds and repeatability, not trajectory correctness or North-axis propagation.
- **VV-010:** checks a special smooth rotating-force problem, not the complete simulator with transitions.
- **VV-011:** checks selected FSM behavior, not full crossing semantics or production localization.
- **VV-012:** tests an interpolation helper on exact analytical samples.
- **VV-013:** uses synthetic inertia histories, freezes inertia within each step, and accepts 0.5% momentum-magnitude error; it does not verify production CG/inertia consistency or inertial angular-momentum-vector conservation.
- **Adaptive integration:** untested in the supplied suite.

### Evidence emitter is not fail-closed

Major defects:

1. `gateCoverage` entries are literals set to `true`.
2. `pnpm test ... | tail -10` generally exposes the final pipeline command’s status, not reliably the test runner’s failure status.
3. Failure parsing defaults to zero when the expected output pattern is absent.
4. Solver default is inferred from an unreliable regex, not the actual production configuration.
5. Suite IDs are collected from text, including comments.
6. `totalVvTests` is a suite-ID count, not an executed-test count.
7. Dependency values come from package declarations, not necessarily installed exact versions.
8. No dirty-tree/source-bundle hash binds the tested files to the commit.
9. No measured errors, tolerances, case inputs, or per-gate applicability records.
10. The emitter itself does not reliably fail when verification fails.

**A green metadata flag is currently a declaration, not evidence.**

---

## 7. Remaining full-product gaps before 8.5+/10

The engineering core is only part of the complete-product commitment. Unprovided implementations must be classified **UNVERIFIED**, not assumed absent or complete.

### A. Required before engineering-core approval

- Repair ENU state propagation, wind, telemetry, norms, and signed rail coordinate.
- Repair and directly test adaptive integration, including termination and invalid-input behavior.
- Implement production dense-output event localization with stop/reset/restart.
- Establish physically consistent mass, CG, inertia, and derivatives.
- Replace incorrect aerodynamic coefficient handling and dimensional damping.
- Remove undocumented state clipping and angular-rate resets.
- Validate recovery descent and localized touchdown outputs.
- Enforce strict validity and four-state acceptance semantics.
- Regenerate fail-closed evidence from the actual production entry points.

### B. Required before an 8.5+ consolidated-product score

- Requirement-to-code-to-test traceability across all five studios.
- Independent physical validation, not only numerical invariants.
- Published model-source/assumption/validity records.
- Production staging, rail tip-off, sensor, datum, ensemble, and recovery verification.
- Reproducible uncertainty sampling with failed-member accounting and justified containment interpretation.
- Import/export fidelity, schema migration, parser robustness, and engineering-data provenance.
- Performance measurements on declared hardware with declared scenarios.
- UI status propagation proving unsupported or failed physics cannot produce a green safety result.

### C. Specification reconciliation is still required

The normative document overrides several conflicts, but the locked master specification still contains actionable contradictions:

- Adaptive default versus actual RK4 default.
- Dense output versus linear interpolation.
- ENU versus remaining display-frame API comments.
- Above-pad `z` versus terrain-relative AGL.
- Competing aerodynamic validity envelopes.
- Proof-load versus ultimate-strength margins.
- `UNSUPPORTED` model validity versus the exclusive acceptance-status set.
- Nose-tip drawing distances described along the noseward body axis.
- Unsupported “certified,” “true \(C_D\),” and guaranteed sub-3% accuracy language.

Competition-rule claims require verification against the applicable authoritative rule editions. An internal normative contract cannot override an external competition requirement.

Recovery initiation and fault-handling requirements also need a separate hazard review: a fault response must not inadvertently disable otherwise available recovery. Simulation logic is not evidence of independent hardware safety.

---

## 8. Final build-readiness verdict

### **NO-GO — engineering core not ready for final acceptance or safety-dependent full UI build-out**

Permissible next work:

- Corrective core engineering.
- Independent V&V expansion.
- Non-safety-critical UI scaffolding and usability prototypes with explicit unverified-model labeling.

Not acceptable yet:

- A “verified 6-DOF” release claim.
- Green flight-readiness or competition-compliance stamps based on these outputs.
- Declaring the five engineering gates closed.
- Treating the current metadata artifact as certification evidence.

**Bottom line:** the shared-kernel architecture is a sound direction, and several low-level equations are correct. But the submitted production system loses an entire navigation axis, contains a nonterminating adaptive solver, and never invokes its event localizer. Those are decisive blockers. Repair them, then demonstrate closure through discriminative end-to-end tests—not broader labels on narrow passing benchmarks.