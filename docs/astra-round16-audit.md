# Astraea Round-16 Adversarial Engineering Audit

## 1. Executive disposition

**Complete-product quality score: 6.3/10**  
**Build-readiness: NO-GO for engineering baseline freeze, authoritative safety output, or flight-readiness claims.**

Round 16 contains genuine repairs. The adaptive kernel now handles positive residual intervals, checks representable progress, limits total trials, and validates stage states before load callbacks. The five bundled motor curves support internally consistent impulse-proportional depletion. Recovery hardware gating, canopy static-moment handling, nominal touchdown alignment, and stale-result safety-label suppression are materially improved.

However, **several central change-summary claims are contradicted by the supplied implementation**:

- Validity is **not transactional over committed segments**.
- Deferred apogee metrics still lose the physical root.
- Abnormal touchdown does **not** compete independently against other events.
- Geometry and simulation inputs do **not** comprehensively fail closed.
- Motor mounting resolves the first flagged tube, not an explicit hardware assignment with compatibility checks.
- Nonlinear coupled **dense-output/event** convergence is not demonstrated.
- Evidence completeness does not require the new motor, mass, and UI suites.
- Reporter-counter reconciliation remains incomplete.

The green artifact establishes a reported successful execution of the listed tests. It does not establish the missing engineering contracts.

### Evidence boundary

I audited the supplied source text, tests, specifications, and metadata. I did not execute the repository or independently recompute filesystem or artifact hashes.

The supplied prior report is **Round 14**, not Round 15. The asserted Round-15 score of 6.1 is user-provided context; its detailed findings cannot be independently reconciled here.

---

## 2. Engineering-gate disposition

| Gate | Status | Source-established conclusion |
|---|---|---|
| **1r — Production loads and frames** | **PARTIAL** | Production invokes `computeFlightLoads()` through adaptive stage callbacks. Quaternion rotations, ENU gravity, rate mapping, complete drag, and static-moment signs are correct. Recovery requires hardware and flags. Remaining deficiencies include incomplete validity inputs, empirical/unvalidated model domains, globally scaled normal slope, approximate inertias, and non-authoritative mounting. |
| **2 — Adaptive integrator** | **PARTIAL** | DP tableau and normalized-candidate attitude error are correct; exact-end landing, stage-state validation, `inertiaDotB` validation, and unconditional trial guard are implemented. Dense bracket selection can extrapolate across boundaries; exact endpoint state retrieval is not guaranteed. Coupled nonlinear endpoint convergence is tested, but nonlinear coupled dense/event order and independent-reference closure are absent. |
| **3 — Variable mass/inertia** | **PARTIAL** | Five bundled motor curves have consistent curve-integral depletion; production consumes thrust-proportional mass flow. Combined-CG inertia differentiation is algebraically correct for the implemented two-body approximation. Generic motor fallbacks break continuity; component-resolved inertia, physical shell fidelity, and hardware assignment remain open. |
| **4 — Event causality, restart, terminal contracts** | **OPEN** | Explicit selected-event service, root-state tie checks, event-free bookkeeping, transition caps, and nominal terminal alignment exist. Deferred-root handling, abnormal-impact competition, speculative validity contamination, and some already-satisfied deferred transitions remain release-blocking. |
| **5 — Reproducible acceptance evidence** | **PARTIAL** | Fixed 14-VV inventory, substantive self-tests, raw-byte hashing, pre/post HEAD/status/hash checks, and a consistent self-hash implementation are present. New acceptance suites are not all mandatory or hashed; aggregate reconciliation is partial; successful residuals and runtime solver configuration are not recorded. |

**No gate is CLOSED at its full advertised scope.**

---

## 3. Numerical algebra and frames

### 3.1 Quaternion and angular dynamics: correct

`quaternionDerivative()` implements

\[
\dot q_{NB}=\frac12 q_{NB}\otimes(0,\omega_B).
\]

`quaternionToMatrix()` is the standard body-to-navigation rotation; `rotateWorldToBody()` applies its transpose.

The adapters explicitly implement

\[
\omega_B=(q_{\rm pitch},p_{\rm roll},r_{\rm yaw}),
\qquad
I_B=(I_{\rm pitch},I_{\rm roll},I_{\rm yaw}).
\]

The first angular equation is

\[
\dot\omega_x=
\frac{M_x-\dot I_x\omega_x-(I_z-I_y)\omega_y\omega_z}{I_x},
\]

with cyclic equivalents, matching

\[
I\dot\omega=M-\omega\times(I\omega)-\dot I\omega.
\]

The variable-inertia equation remains conditional on the stated exhaust-angular-momentum assumption. Algebraic conservation tests do not independently validate that open-system physical assumption.

### 3.2 Attitude error: correct

The embedded candidates are formed as complete attitudes:

\[
q_5=\operatorname{normalize}(q+\Delta q_5),\qquad
q_4=\operatorname{normalize}(q+\Delta q_4).
\]

The relative-quaternion vector has the opposite sign from one conventional formulation, but its norm is identical. Thus

\[
\Delta\theta=
2\operatorname{atan2}(\|\operatorname{vec}(q_{\rm rel})\|,
|\operatorname{scalar}(q_{\rm rel})|)
\]

is antipodally invariant and appropriate.

### 3.3 ENU and force signs: correct, with telemetry qualifications

Production uses:

\[
u_{\rm rail}=(\cos e\sin a,\cos e\cos a,\sin e),
\qquad g_N=(0,0,-g).
\]

Wind azimuth is interpreted as **from**, with the added \(\pi\) giving the direction toward which air moves. Horizontal channels are East `x`, North `y`.

For stations increasing aft from the nose,

\[
r_{CP}-r_{CG}=(0,-d,0),\quad d=x_{CP}-x_{CG},
\]

so

\[
M_x=-dF_z,\qquad M_z=dF_x,
\]

matching production.

Residual issues:

- The obsolete East–Up–North rail comment remains.
- `weathercockAngleDeg` is incidence, not vehicle turning; the UI label is corrected, but the API comment is not.
- The Euler formulas do not document a consistent rotation sequence. In particular, the yaw denominator differs from the denominator associated with the apparent pitch/roll extraction sequence.
- No supplied renderer demonstrates a proper ENU-to-display rotation.
- Telemetry `speed` is **airspeed**, while `velocity` is navigation-frame ground velocity. The interface describes `speed` simply as scalar magnitude, inviting an incorrect norm interpretation.

---

## 4. Adaptive integration and dense output

### 4.1 Verified repairs

The seven-stage tableau and fifth/fourth weights match Dormand–Prince.

Production supplies the specified absolute group tolerances:

\[
(10^{-3}\text{ m},10^{-2}\text{ m/s},
10^{-5}\text{ rad},10^{-3}\text{ rad/s}).
\]

Vector groups use Euclidean norms, not independent per-axis acceptance. This is conservative relative to per-component bounds but should be labeled accurately.

Source now establishes:

- `while (t < tEnd)` handles tiny positive intervals.
- Endpoint-bound trials use `nextTime = tEnd`.
- Endpoint stages evaluate at `nextTime`.
- `nextTime <= t` rejects stuck time progress.
- The 5,000-trial guard is checked unconditionally at loop entry.
- Stage states are validated before callbacks in both kernels.
- Both load validators check finite `inertiaDotB`.

The rejection floor is a conservative scale-based policy, not the exact local floating-point spacing. Failing at that floor does not mathematically prove that no smaller integrable step exists.

### 4.2 Dense-output boundary defect remains

`denseOutputAt()` selects a bracket using:

```ts
if (t <= dense[i].t1 + 1e-12)
```

Consequently a query just **after** a bracket endpoint can select the preceding bracket and extrapolate with \(u>1\).

This is not merely hypothetical for the supported tiny-interval regime: multiple accepted steps shorter than \(10^{-12}\) seconds can cause queries well into later steps to select the first bracket.

Furthermore:

```ts
u = (t - d.t0) / d.h
```

does not use the authoritative timestamp span `d.t1 - d.t0`, and there is no exact-boundary return of `y0` or `y1`. The source explicitly permits `t1` to differ from `t0 + h`.

**Required:** exact bracket containment, explicit endpoint returns, and a consistent timestamp-to-interpolation-parameter contract.

### 4.3 Convergence evidence is narrower than claimed

For exact smooth endpoint data, cubic Hermite interpolation satisfies

\[
y(t)-H_3(t)=
\frac{y^{(4)}(\xi)}{24}(t-t_0)^2(t-t_1)^2,
\]

giving \(O(h^4)\) interior error. This is not automatically the standard DP continuous extension.

The supplied tests establish:

- Linear translation interpolation.
- Unit quaternion interpolation.
- Improved dense accuracy for \(v'=-v\).
- A dense root near \(t=\ln2\).
- A three-rung nonlinear triaxial-top **endpoint attitude** convergence test.

They do **not** establish nonlinear coupled dense-output or nonlinear coupled event-time convergence:

- \(v'=-v\) is a **linear ODE**, although its solution is exponential.
- The triaxial ladder does not query dense output or locate an event.
- Its reference is the same adaptive solver at tighter tolerance.
- The fixed-step references reuse the same production angular and quaternion algebra; they are cross-method checks, not independent physics implementations.

For a simple event root,

\[
|\delta t|\approx\frac{|\delta g|}{|\dot g|}.
\]

A \(10^{-5}\)-second bisection interval bounds refinement on the approximate trajectory, not total physical event-time error.

The long-duration inertial-angular-momentum-vector benchmark drives **fixed RK4**, not the default adaptive production method.

---

## 5. Motor depletion and mass properties

### 5.1 Recomputed motor integrals

Segmentwise trapezoidal integration of the supplied curves gives:

| Motor | Curve impulse, N·s | Nameplate, N·s | Relative difference |
|---|---:|---:|---:|
| Estes C6 | **8.919** | 8.8 | **+1.35%** |
| AeroTech H128W | **173.425** | 180 | **−3.65%** |
| Cesaroni I205 | **345.350** | 382 | **−9.59%** |
| AeroTech K550W | **1478.400** | 1550 | **−4.62%** |
| Cesaroni M1820 | **5697.000** | 5850 | **−2.62%** |

For these five positive, ordered, zero-ended curves:

\[
m_p(t)=m_{p0}\left(1-\frac{I(t)}{I_c}\right),
\qquad
\dot m=-\frac{m_{p0}}{I_c}F(t)
\]

are internally consistent. Their endpoint limits are wet at ignition and dry at burnout.

**Credit:** the all-motor suite genuinely exercises every bundled motor and checks segment-interior finite differences and integrated mass flow.

**Qualification:** “no saturation clamp” is false literally. `getMotorMassAt()` still contains `Math.min/Math.max` saturation. It is inactive in exact arithmetic for these valid bundled curves.

### 5.2 Generic motor handling is not fail closed

`getMotorImpulseTotal()` falls back to nameplate impulse whenever the curve integral is not finite and positive—not only for a short curve.

For an empty curve with positive nameplate impulse:

- Interior delivered impulse is zero.
- Interior mass remains fully wet.
- Mass flow is zero.
- At burnout, mass jumps to dry.

Thus the universal continuity claim is false for the exported `MotorSpec` API.

There is no comprehensive validation of ordered times, finite nonnegative thrust, endpoint consistency, wet/dry mass identity, or positive motor geometry.

The designation “certified” and claims of real RASP provenance are not substantiated by traceable certification records or original curve files.

### 5.3 Combined-CG inertia derivative: correct within the approximation

With fixed component centroids,

\[
x_c=\frac{m_dx_d+m_mx_m}{m_d+m_m},
\qquad
\dot x_c=
\frac{\dot m_m m_d(x_m-x_d)}{(m_d+m_m)^2}.
\]

For

\[
I_\perp=I_{d,c}+m_d(x_d-x_c)^2+
m_m k_m+m_m(x_m-x_c)^2,
\]

where \(k_m=(3r_m^2+L_m^2)/12\), the moving-reference terms cancel because

\[
m_d(x_d-x_c)+m_m(x_m-x_c)=0.
\]

Therefore

\[
\dot I_\perp=\dot m_m[k_m+(x_m-x_c)^2],
\qquad
\dot I_{\rm roll}=\frac12r_m^2\dot m_m.
\]

Production’s expanded expression is equivalent.

But the dry airframe remains a uniform-cylinder inertia estimate; motor inertia treats casing and remaining propellant as one uniform cylinder. No component-resolved tensor or burn-dependent motor centroid is established.

### 5.4 Geometry “fails closed”: contradicted

Specific bypasses in `mass.ts`:

- Positive mass overrides return **before geometry validation**.
- Negative or NaN tube inner diameter selects a default wall.
- Fin dimensions and fin counts are not validated.
- Internal masses and parachute masses are not comprehensively validated.
- Unknown material IDs silently become cardboard.
- `axialOffset || 0` can hide NaN.
- Invalid hollow-wall values can silently select solid geometry.
- Hollow volumes retain numerical floors.

The conical solid centroid is correctly repaired:

\[
\bar x=
\frac{\int_0^L x\,\pi(Rx/L)^2dx}
{\int_0^L \pi(Rx/L)^2dx}
=\frac34L.
\]

However, the hollow cavity uses independently reduced radius and length; it is not generally a geometrically similar cone or a constant-normal-thickness shell. The test only proves a forward shift, not the correctness of the modeled shell.

Other nose shapes retain unsubstantiated centroid fractions. Hollow transitions subtract cavity volume but keep the solid-frustum centroid.

### 5.5 Motor mounting is only partially implemented

`resolveMotorCentroid()` finds the **first** body tube with `isMotorMount`, then uses its aft station.

It does not establish:

- Explicit assignment-ID resolution.
- Multiple-mount ambiguity rejection.
- Motor diameter/length compatibility.
- Centering-ring compatibility.
- Rejection of an impossible placement.

The motor centroid is also silently clamped to zero.

Finally, the simulator applies a dry-mass floor of 0.01 kg while `prepareVehicle()` does not. For a positive dry mass below that floor, terminal telemetry mass and reported `landingMass` disagree.

---

## 6. Aerodynamics and active-model validity

### 6.1 Correct force-direction repairs

Complete drag is

\[
F_{D,B}=-D\frac{v_{\rm air,B}}{V},
\qquad
F_{D,B}\cdot v_{\rm air,B}=-DV.
\]

For \(D\ge0\), it opposes air-relative motion in every channel.

Paired incidence definitions match the normative contract. Recovery activation now requires both a deployment flag and hardware. Live-canopy drag no longer receives the airframe-CP moment arm.

These repairs are source-verifiable.

### 6.2 Remaining aerodynamic deficiencies

**Whole-slope supersonic suppression.** At Mach 4:

\[
C_{N\alpha}(4)=C_{N\alpha}(0)/\sqrt{15}
\approx0.2582\,C_{N\alpha}(0).
\]

This suppresses nose and body contributions along with fins. CP migration is an independently prescribed shift, not a recomputed force-weighted CP.

**Base drag is not globally \(C^1\).** At Mach 0.8, the subsonic derivative is

\[
0.26M=0.208,
\]

while the smoothstep branch starts with derivative zero. At Mach 1.2, smoothstep ends with zero derivative while the supersonic branch has derivative

\[
-0.456M^{-2.2}\ne0.
\]

**Wave-drag branches jump at Mach 1.1.** Fin wave drag changes from a multiplier of 0.4 at the transonic endpoint to approximately \(1/\sqrt{0.21}=2.182\) immediately above it, before clipping—a factor of about **5.46**.

**Production skin friction is sea-level tabulated.** Live atmospheric density scales dynamic pressure, but the prepared coefficient table does not recompute Reynolds number with current altitude.

**Canopy validity is asserted, not validated.** A constant-\(C_D\) canopy is nominal through Mach 4. Hardware presence does not substantiate that envelope. Inflation, attachment dynamics, and opening shock are absent.

**Tail-first “blunt-base drag” is mislabeled.** The implementation retains the normal airframe drag coefficient; it does not introduce a separately validated reverse-flow coefficient.

### 6.3 Full input finiteness is not implemented

The classifier checks state components and selected derived kinematics. It does not comprehensively validate configuration, prepared geometry, loads, pressure, density, or time.

Examples:

- `finCantRad = NaN` can yield `loadValidity = VALID` while roll moment is NaN.
- Infinite launch altitude produces zero density in the extrapolated isothermal atmosphere and finite sound speed; Mach can remain nominal.
- Infinite rail elevation is silently clamped to 90° before validation.

Kernel rejection catches some resulting nonfinite loads, but that is not a correct validity API.

No run manifest explicitly declares flat terrain, despite use of `z=0` for ground contact and `z=h_main` for deployment.

---

## 7. Event causality and committed-state handling

### 7.1 Real improvements

Production now:

- Commits detector state on event-free brackets.
- Explicitly serves the selected candidate.
- Refines prerequisite roots before selection.
- Rechecks simultaneous predicates at the committed root.
- Invalidates pending roots later than an applied transition.
- Caps transitions.
- Aligns nominal touchdown duration and final telemetry time.
- Projects base contact rather than clipping all negative rail acceleration.

These are meaningful repairs, but not sufficient closure.

### 7.2 Release blocker: validity still includes superseded future trajectories

`loadsAtStage()` mutates global validity flags.

Both the bottom-of-loop advance and the event-loop full-span advance record validity over the entire pre-transition macro interval. If an event occurs inside it, the portion after that root is superseded by post-transition dynamics.

Those flags are never rolled back.

`stepStateWithRestore()` restores only flags from an additional reconstruction. It does not remove flags already recorded from the discarded suffix. Rejected adaptive trials also mutate the flags.

**Consequences:**

- A speculative post-apogee free-flight excursion can contaminate a subsequently committed canopy trajectory.
- A speculative post-touchdown segment can contaminate the terminal result.
- Rejected trial states are counted as committed trajectory evidence.

This is conservative against unsafe PASS, but it is not the claimed transactional semantics and can make validity depend on numerical trial history.

### 7.3 Release blocker: deferred physical apogee is still lost

Consider a velocity zero-crossing before burnout:

1. An event-free bracket correctly stores the pending root.
2. At burnout, `detectEvents()` emits burnout and apogee activation and clears `det.state.pendingApogee*`.
3. `serve()` uses `evt.time > bT` to identify a “fresh” peak.
4. The deferred activation time is later than `bT`, so it records burnout altitude/time as the physical peak.

Even the alternate branch reads the cleared `det.state` fields, rather than the retained pre-transition pending data.

Additionally:

```ts
apogeePos = { x: root.r.x, y: root.r.y, z: peakAlt };
```

mixes activation horizontal coordinates with peak altitude.

**The advertised physical-apogee/recovery separation is not achieved.**

### 7.4 Release blocker: abnormal touchdown does not compete independently

`groundContact` is acted upon only inside:

```ts
if (det.events.length === 0)
```

If ground impact occurs before another candidate in the same bracket—such as burnout—the driver can serve the later candidate first. It can then restart from below ground, after which `bState.r.z > 0` no longer holds.

Ground contact must participate in the same earliest-root selection as all other transitions.

### 7.5 Deferred candidates can reach an incompatible refinement path

The candidate-time pass recognizes already-satisfied predicates:

```ts
if (crossedFor(evt.name)(bState)) return evt.time;
```

But selected non-burnout candidates later call `refineCrossing()` unconditionally unless their chord time is at or behind the base.

`refineCrossing()` throws when the predicate already holds at the base.

A main-at-touchdown fallback, with altitude already below the main threshold, can therefore be represented by the FSM yet fail when served by production.

### 7.6 Root order and exact-root claims remain qualified

`selectNextCandidate()` compares prerequisite-free events against the first candidate; it is not a general minimum over all physical event roots.

Bisection returns the midpoint, which need not satisfy the crossed-side predicate. Tie checks then use exact inequalities at that approximate state. Near ties can consequently change with refinement phase.

Ground altitude is explicitly projected to zero. Nominal terminal time/state consistency is substantially repaired, but the final state is a **projected root approximation**, not the unchanged dense state.

Endpoint-only candidate detection can still miss interior multiple crossings.

---

## 8. UI and safety semantics

### Verified

Source establishes:

- Safety text becomes `UNVERIFIED` unless validity is PASS and results are current.
- Input-key changes mark results stale.
- Throwing simulation reruns clear prior results.
- Rail-exit incidence is labeled honestly.
- The header limits claims to preview screening thresholds.

### Remaining deficiencies

1. **Failed-run records are not reproducible input snapshots.** They omit vehicle geometry, masses, material choices, and full motor data.
2. **Render-time failures bypass the run handler.** `computeAerodynamicCurves()` runs in `useMemo()` outside the `try/catch`.
3. **The UI safety test is weak.** Mutual exclusion of `UNVERIFIED` and SAFE does not prove SAFE requires PASS and CURRENT. An invalid result displaying SAFE alone would satisfy that assertion.
4. **No throwing-rerun test is supplied.**
5. **Outcome and validity remain partly conflated.** UNKNOWN without nominal touchdown is labeled “abnormal termination” even when the actual outcome is timeout.
6. **IN-DOMAIN can coexist with abnormal-impact UNKNOWN.** Its predicate excludes neither abnormal termination nor stale results.
7. `(SAFE)` and `(GATE PASS)` remain stronger wording than empirical screening supports. Prefer “screening threshold met.”
8. Nonterminal telemetry remains rounded, lacks canonical quaternion output, and can have duplicated rounded timestamps at small step sizes.

---

## 9. Evidence-integrity audit

### 9.1 Counts reconcile for this artifact

The listed files sum to:

\[
33+3+7+4+4+5+14+11+3+2+6+4+18+4+4+30
=\boxed{152}.
\]

There are **16 files**, all reported passed.

The VV suite contains **30 cases across 14 IDs**. The emitter file reports **32 substantive cases plus one cleanup case**. Counts are correctly labeled test cases, not individual expectations.

### 9.2 Provenance repairs credited

The emitter source implements:

- Fixed mandatory 14-VV inventory.
- All-collected-files-must-pass logic.
- Unknown-status rejection.
- Duplicate reported case-identity rejection.
- Raw-byte SHA-256 file hashing.
- Pre/post cited-file hash, git-status, and HEAD comparison.
- Direct substantive emitter-self-test execution.
- Correct decimal-digit capture index.
- Self-hashing consistent with its exported verifier.

I have not independently verified the supplied digest values.

### 9.3 Completeness remains incomplete

The mandatory/hash inventory omits:

- `motorDatabase.test.ts`
- `mass.test.ts`
- `FlightSimulationTab.test.tsx`
- `emit-benchmark-metadata.test.cjs` from the cited hash set

The first three can disappear from collection without a specific completeness failure. “Every collected file passed” is not “every required acceptance file executed.”

### 9.4 Counter reconciliation is partial

The emitter checks finite `numTotalTests`, finite `numFailedTests`, and a minimum suite-count sanity bound.

It does not reconcile:

- `numPassedTests`
- Pending/todo counters
- Passed/failed suite counters
- Missing or nonfinite required aggregate counters

A passed file with zero cases is not universally rejected. Source counts are checked only for the VV inventory and designated gate files.

The test titled “non-required file” actually modifies a gate-required acceptance file; it does not independently discriminate that advertised scenario.

### 9.5 Binding is useful, not complete execution attestation

Pre/post snapshots detect persistent changes to cited files. They do not prove that files were never temporarily changed and restored during execution.

Installed package manifests establish versions, not installed package-content integrity or lockfile conformance.

Source analysis occurs after the post-execution snapshot. Hashes identify bytes but do not prove the semantic assertions in those bytes are adequate.

Successful numerical residuals remain absent. That absence is honestly disclosed, but runtime durations and source tolerance literals are not substitutes.

### 9.6 Several gate tests prove narrower properties

- VV-005 tests local separation algebra, not a production staging engine.
- VV-006 includes analytical/test-local root refinement.
- VV-012 tests chord interpolation on chosen ballistic brackets, not the production restart driver.
- New event-policy tests exercise helper functions, not the integrated deferred-root and abnormal-impact failures.
- VV-015 uses broad landing bounds rather than independent descent-model validation.

---

## 10. Release blockers and requirements before 9.0

### Release blockers

1. Make validity transactional over accepted, committed segments; discard rejected trials and superseded suffixes.
2. Preserve physical apogee time and full state independently of activation bookkeeping.
3. Include abnormal ground contact in global root competition.
4. Resolve deferred/already-satisfied events without incompatible crossing refinement.
5. Fix dense-output bracket selection and exact endpoint retrieval.
6. Validate all simulation, geometry, motor, and active-model inputs before fallback/clamping.
7. Remove generic motor depletion discontinuities and dry-mass accounting divergence.
8. Implement explicit mount assignment and hardware compatibility checks.
9. Require and hash every release-critical acceptance suite.
10. Replace helper-only regressions with production-path adversarial tests.
11. Supply explicit model/datums manifests and withdraw unsupported certification language.

### Residual risk acceptable only in a restricted preview

- Empirical damping and simplified canopy dynamics.
- Uniform-cylinder inertia approximations.
- Repeated integration and unmeasured performance.
- Rounded nonterminal plotting data, if explicitly noncanonical.
- Incomplete Euler-angle and renderer verification.
- Limited accessibility and failure-state coverage.

These are not non-blocking for unrestricted engineering certification.

### Additional closure required for a 9.0 complete-product score

Beyond the blockers:

- Component-resolved mass, CG, and inertia validation.
- Independently sourced motor and aerodynamic reference data.
- Continuous, documented aerodynamic closures and domain enforcement.
- Adaptive conservation and nonlinear coupled dense/event convergence with recorded residuals.
- Near-tie, phase, shallow-root, pre-burnout-apogee, rail-return, and abnormal-impact sweeps.
- Canonical full-state telemetry and reproducible run manifests.
- Measured production performance.
- Traceability for staging, rail tip-off, recovery inflation/shock, ensembles, sensors, interoperability, and competition rules—or explicit exclusion of unsupported capabilities.

## Final verdict

**Round 16 improves the numerical kernel and nominal presentation, but it does not close the production causal or validity contracts.**

The decisive failures are visible in source despite 152 reported passing tests: **superseded-path validity accumulation, deferred-apogee misidentification, abnormal-impact ordering, incomplete input rejection, and incomplete acceptance-evidence inventory**.

**6.3/10 — NO-GO for authoritative engineering or flight-safety release.**