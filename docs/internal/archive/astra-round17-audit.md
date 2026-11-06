# Astraea Round-17 Adversarial Engineering Audit

## 1. Executive disposition

**Complete-product quality score: 6.4/10.**  
**Build-readiness: NO-GO for an engineering baseline freeze, authoritative safety output, or flight-readiness use.**

Round 17 establishes genuine improvements in dense-output boundary handling, kernel validation, motor depletion, terminal-state alignment, UI screening language, and evidence collection. However, several central change-summary claims are contradicted by the supplied implementation:

1. **Validity rollback does not work:** the purported bracket-base snapshot is taken **after** full-span validity has already been committed. The previous macro advance also commits the speculative span.
2. **Rail-stage validity is discarded:** both rail-constrained return branches omit `loadValidity`; the kernel interprets its absence as `VALID`.
3. **Geometry does not universally validate before overrides:** positive mass overrides bypass substantial structural validation.
4. **Event selection keys and service times differ:** selecting the minimum effective time does not guarantee that the event is served at that time or with satisfied prerequisites.
5. **Deferred apogee remains a mixed record:** chord-estimated time/altitude, a separately sampled position, and activation-time event data.
6. **Failed-run snapshots are summaries, not reproducible input records.**
7. **The evidence emitter is substantially improved but does not establish complete immutable-source execution or universal fail-closed conformance.**

**Evidence boundary:** This report audits the supplied source text and machine artifact. I did not execute the repository, independently hash its on-disk files, or reproduce browser behavior. The supplied prior report is **Round 14**, not Round 16; the stated Round-16 score and disposition are historical context, not independently supplied findings.

---

## 2. Gate disposition

| Gate | Status | Source-established evidence and remaining limitation |
|---|---|---|
| **1r — Production loads and frames** | **PARTIAL** | `simulate6DofFlight → integrateRigidAdaptive → loadsAtStage → computeFlightLoads` is a real production path. ENU, body-rate mapping, complete vector drag, and combined-CG moment signs are correct. Whole-cylinder inertia, whole-vehicle Mach slope scaling, empirical canopy validity, atmosphere-domain omissions, and dropped rail validity prevent closure. |
| **2 — Adaptive integrator** | **PARTIAL** | Standard DP5(4) coefficients, normalized-candidate geodesic error, pre-callback stage validation, bounded rejection, exact endpoint timestamps, and corrected Hermite parameterization are present. Reported 13 adaptive tests include nonlinear endpoint/interior convergence. They do not establish general fifth-order behavior of the projected method or production event-time accuracy; exact-retrieval discrimination is weak. The driver retains its own epsilon-skipping defect. |
| **3 — Mass depletion and variable inertia** | **PARTIAL** | Curve-integral depletion and the combined-CG inertia derivative are algebraically consistent for ordinary resolved curve segments. Reported motor suite: 8 cases; loads suite: 14. Validation loopholes, short-segment quadrature distortion, incomplete placement checks, and non-component-resolved inertia remain. |
| **4 — Event causality, restart, validity and terminal contracts** | **PARTIAL** | Carried pending roots, crossed-side bisection, independently considered abnormal contact, root-state transitions, and touchdown time/mass/telemetry alignment are implemented. Transactional validity is broken; selection/service semantics disagree; selected-event prerequisites are not universally checked; deferred peak records remain inconsistent. |
| **5 — Reproducible acceptance evidence** | **PARTIAL** | Artifact reports 168/168 passing cases across 16 files, build/test exit zero, clean HEAD, matching pre/post snapshots, and substantive emitter execution. Source confirms major collection repairs. Missing inventory guarantees, partial aggregate/range checks, non-atomic binding, and absent successful numerical residuals prevent full closure. |

**No gate is CLOSED at its complete stated acceptance scope.** Narrow repairs credited below should nevertheless be retained.

---

## 3. Numerical kernel and frame algebra

### 3.1 Quaternion and Euler equations: correct

`quaternionDerivative()` implements the stated body-to-navigation convention:

\[
\dot q_{NB}=\frac12q_{NB}\otimes[0,\omega_B].
\]

The matrix in `quaternionToMatrix()` is consistent with that convention, and `rotateWorldToBody()` correctly applies its transpose.

The rate adapters explicitly implement

\[
\omega_B=(q_{\rm pitch},p_{\rm roll},r_{\rm yaw}).
\]

The first angular equation is

\[
\dot\omega_x=
\frac{M_x-\dot I_x\omega_x-(I_z-I_y)\omega_y\omega_z}{I_x},
\]

with cyclic equivalents. This agrees with

\[
I\dot\omega=M-\omega\times(I\omega)-\dot I\omega.
\]

The attitude estimator compares **full normalized candidate attitudes**, not derivative increments:

\[
q_5=\operatorname{normalize}(q_n+\Delta q_5),\qquad
q_4=\operatorname{normalize}(q_n+\Delta q_4).
\]

Its relative-quaternion vector has a sign convention that does not change its norm. Consequently,

\[
2\operatorname{atan2}(\|\operatorname{vec}(q_{\rm rel})\|,
|\operatorname{scalar}(q_{\rm rel})|)
\]

is a valid antipodally invariant rotation error.

### 3.2 ENU and moment signs: correct

Production uses:

- `z` for altitude and vertical velocity;
- gravity along `-z`;
- horizontal wind in East `x`, North `y`;
- rail direction
  \[
  (\cos e\sin a,\cos e\cos a,\sin e);
  \]
- landing drift \(\sqrt{x^2+y^2}\).

The initial quaternion correctly aligns body \(+Y_B\) with the rail.

For drawing stations increasing aft, with \(d=x_{CP}-x_{CG}\),

\[
r_{CP}-r_{CG}=(0,-d,0),
\]

so

\[
M_x=-dF_z,\qquad M_z=dF_x,
\]

matching production.

**Remaining frame limitations:** Euler telemetry still lacks a verified reconstruction sequence and is appropriately labeled non-authoritative. Canonical quaternion telemetry is an improvement, but no supplied renderer establishes a proper ENU-to-display rotation. The wind implementation is meteorological “from” azimuth despite a contradictory comment saying “toward.”

### 3.3 Adaptive control and dense output: substantial repair, qualified accuracy

The DP tableau and embedded weights match the standard pair. Vector-group errors use Euclidean norms, not independent per-axis acceptance:

\[
\|\Delta r\|\le \mathrm{tol}_r,\quad
\|\Delta v\|\le \mathrm{tol}_v,\quad
\|\Delta\omega\|\le \mathrm{tol}_\omega.
\]

This is conservative relative to componentwise bounds, but “per-axis tolerances” is imprecise.

The kernel now:

- handles every positive residual interval;
- rejects non-advancing trial timestamps;
- checks the total trial limit at the loop head;
- validates stage states before callbacks;
- validates finite inertia derivatives;
- records explicit `t1`;
- returns cloned recorded states at exact boundaries;
- uses the same authoritative span for Hermite parameterization and derivative scaling.

For smooth scalar components, cubic Hermite interpolation has

\[
y-H_3=\frac{y^{(4)}(\xi)}{24}(t-t_0)^2(t-t_1)^2,
\]

supporting \(O(h^4)\) interior error with sufficiently accurate endpoint data. It is **not the standard Dormand–Prince continuous extension**.

Per-stage quaternion projection modifies the textbook numerical method. The convergence tests provide useful empirical evidence, but:

- the triaxial ladders use the **same adaptive implementation** as the tight reference;
- the interior ladder checks attitude only;
- tolerance-ratio convergence is not a measured fixed-step order study;
- earlier “independent reference” cases use the repository’s other kernel, sharing quaternion and angular-dynamics routines.

The exact-retrieval test uses stationary translation and constant angular rates, checks only selected `r/v/w` components, and does **not** assert exact quaternion retrieval or clone independence. Its just-past-boundary position check cannot discriminate the old bracket error when position is constant.

### 3.4 Driver exact-progress defect remains

The driver still uses:

```ts
while (bT < t - 1e-12)
```

Yet simulator entry accepts any positive finite `timeStep`.

For a timestep below that epsilon, bracket resolution can be skipped and the state overwritten with the old checkpoint while time continues advancing. There is no overall macro-iteration cap.

**The kernel’s tiny-interval repair does not close the production driver’s tiny-interval contract.**

---

## 4. Mass, propulsion and placement

### 4.1 Motor impulse recomputation

Summing the supplied piecewise-linear curves by trapezoids gives:

| Motor | Curve impulse, N·s | Nameplate, N·s | Difference |
|---|---:|---:|---:|
| Estes C6 | **8.939** | 8.8 | +1.58% |
| AeroTech H128W | **173.425** | 180 | −3.65% |
| Cesaroni I205 | **345.350** | 382 | −9.59% |
| AeroTech K550W | **1478.400** | 1550 | −4.62% |
| Cesaroni M1820 | **5697.000** | 5850 | −2.62% |

Thus the reported 12% nameplate cross-check is consistent with the supplied records. It is a data-consistency tolerance, not independent motor certification.

For ordinary curve segments, production implements

\[
m_p(t)=m_{p0}\left(1-\frac{J(t)}{J(T_b)}\right),\qquad
\dot m=-m_{p0}\frac{F(t)}{J(T_b)}.
\]

This repairs the earlier denominator/depletion mismatch.

### 4.2 Generic motor validation is not fully fail-closed

`validateMotorSpec()` checks ordering, zero endpoints, positive geometry, and wet/dry identity. However:

- it tests integrated impulse only with `> 0`, so **positive infinity passes** this validation;
- `avgThrust` and `maxThrust` are not validated;
- public thrust/mass-flow helpers still have silent fallback behavior, including zero flow for NaN query time;
- endpoint time is accepted within a tolerance rather than exact equality;
- the integration denominator contains:
  ```ts
  Math.max(1e-12, b.time - a.time)
  ```
  whereas thrust interpolation uses the actual positive segment duration.

A valid ordered segment shorter than \(10^{-12}\) s therefore has different thrust and integral laws. The claimed derivative identity is not universal over records accepted by the validator.

### 4.3 Combined-CG derivative: algebra correct within the declared model

With fixed dry and motor centroids,

\[
x_c=\frac{m_dx_d+m_mx_m}{m_d+m_m},
\qquad
\dot x_c=\frac{\dot m_m m_d(x_m-x_d)}{(m_d+m_m)^2}.
\]

Production uses

\[
I_\perp=I_{d,c}+m_d(x_d-x_c)^2+
m_m\frac{3r_m^2+L_m^2}{12}+m_m(x_m-x_c)^2.
\]

Because

\[
m_d(x_d-x_c)+m_m(x_m-x_c)=0,
\]

the moving-reference terms cancel in the summed derivative:

\[
\dot I_\perp=
\dot m_m\left[\frac{3r_m^2+L_m^2}{12}+(x_m-x_c)^2\right].
\]

The expanded code is equivalent. Axial inertia differentiation is also correct:

\[
\dot I_{\rm roll}=\frac12r_m^2\dot m_m.
\]

This establishes **internal calculus consistency**, not component-resolved inertia fidelity. The dry vehicle is still represented as a uniform solid cylinder; motor centroid migration and exhaust angular-momentum transport remain unvalidated model assumptions.

### 4.4 Geometry-before-override claim is false

Positive `massOverride` branches return before structural validation in:

- `computeBodyTubeMass()`;
- `computeTransitionMass()`;
- both fin mass functions.

The nose function validates length and diameter first, but returns before hollow-wall validation.

Concrete source-level counterexamples include:

- a tube with `innerDiameter === outerDiameter` and positive override;
- a zero-fin-count fin set with positive override;
- a hollow nose with impossible wall thickness and positive override.

Further gaps:

- negative/NaN mass overrides are generally ignored rather than rejected;
- infinite positive overrides can survive the total-mass `> 0` check;
- most CG overrides are not checked for finiteness;
- final total mass, moment, CG and length are not comprehensively finite-validated;
- duplicate component identities and unknown component types are not explicitly rejected.

The cone’s **solid centroid \(3L/4\)** is repaired. The subtractive shell centroid is algebraically correct for the chosen cavity, but that cavity is not generally geometrically similar to the exterior or a uniform-normal-thickness shell. Other nose shapes still use approximate mass centroids, including the ogive’s CP-like `0.466L`.

### 4.5 Mount validation remains incomplete

Unique flagged mounts, supplied-motor diameter checks, and a 50%-overlap policy are implemented. However:

```ts
const bore = mount.innerDiameter > 0
  ? mount.innerDiameter
  : mount.outerDiameter;
```

A **zero-bore solid tube becomes an outer-diameter bore** for fit checking.

The no-mount fallback bypasses bore/retention checks, and requiring only

\[
x_{\rm motor,centroid}\ge0
\]

does not establish that the motor’s forward end lies inside the vehicle. The 50% overlap rule is a declared heuristic, not retention-strength verification.

---

## 5. Aerodynamics and physical validity

### 5.1 Force direction repairs are real

The drag vector is

\[
F_{D,B}=-D\frac{v_{\rm air,B}}{V},
\qquad
F_D\cdot v_{\rm air}=-DV.
\]

Thus positive drag removes air-relative kinetic energy in all channels.

Signed paired incidence is correct. Hardware-less deployment flags no longer suppress airframe loads. Live canopy drag no longer receives the airframe CP static moment.

### 5.2 Remaining model errors and domain overclaims

**Whole-vehicle normal slope scaling remains wrong relative to the described mechanism.**

At Mach 4,

\[
C_{N\alpha}(4)=C_{N\alpha}(0)/\sqrt{15}
\approx0.2582\,C_{N\alpha}(0).
\]

This attenuates nose/body contributions as well as fins. CP is shifted independently by an empirical formula, rather than reconstructed from consistently modified force contributions.

**Wave-drag branches are discontinuous at Mach 1.1.**

For \(K=\text{shapeFactor}/\text{fineness}^2\), before cap engagement:

\[
C_{D,n}(1.1)=0.005+0.9K,
\]

but immediately above:

\[
C_{D,n}(1.1^+)=0.02+\frac{0.8K}{\sqrt{0.21}}
\approx0.02+1.7457K.
\]

The fin branch similarly jumps from \(0.4A\) to approximately \(2.1822A\). Tabulation smears these jumps; it does not validate them.

**Base drag is not globally \(C^1\).**

At Mach 0.8, the subsonic derivative is \(0.208\), while the smoothstep-side derivative is zero. At Mach 1.2, the smoothstep derivative is zero while the supersonic derivative is nonzero.

**Atmosphere and Reynolds consistency are incomplete.**

Production precomputes drag coefficients using sea-level friction conditions. The atmosphere function clamps negative altitude to sea level and extends its 11–20 km isothermal branch indefinitely. Neither behavior is reflected in active-model validity.

**Canopy validity is asserted, not validated.**

A constant-\(C_D\) canopy model inherits nominal Mach validity through 4 without supplied physical validation. Suppressing canopy CP torque is appropriate, but it does not establish suspension, inflation, opening shock, or canopy/body rotational dynamics.

These models support a restricted screening preview, not a validated Mach-0–4 engineering prediction envelope.

---

## 6. Critical finding: transactional validity is not implemented correctly

### 6.1 Snapshot occurs after contamination

The event loop does:

```ts
eState = stepState(bState, bT, t - bT);
...
const segU = sawUnsupportedLoad;
const segE = sawExtrapolatedLoad;
```

But `stepState()` immediately folds the **whole span** into those flags.

Therefore restoring `segU/segE` restores a state that already includes the superseded suffix. Re-recording the prefix cannot remove it.

Moreover, the bottom-of-loop advance also uses `stepState()` and commits the upcoming span before its events are resolved.

**Result:** unsupported/extrapolated validity from pre-transition dynamics after a deployment or other transition can remain permanently attached to the run.

### 6.2 Rail callback discards its validity report

Both constrained branches return force, moment, inertia and mass—but not `loadValidity`.

The kernel’s `stageValidityOf()` defaults missing values to `VALID`. Consequently the change-summary assertion that rail stages preserve Mach and other validity checks is false.

Point evaluations do not restore stage-level coverage:

- rail-exit evaluation uses the old `eventState`, so it remains rail-scoped during the side effect;
- terminal evaluation passes `flightCfg` without rail scoping, including abnormal rail-return contact.

### 6.3 Reintegrating a prefix is not the same committed trace

`recordCommittedSpan()` reintegrates a shortened interval, discards its state, and records its validity. The actual transition state comes from dense output on the longer path.

These can have different accepted steps, stage states and classifications. A proper transactional design must bind state and validity to the **same committed numerical trajectory**, with an explicit policy for partial accepted brackets.

**Severity: release blocker.** The defect can create both false excursions and missed rail excursions. Current nominal/severe-crosswind tests do not discriminate rollback or rail-report preservation.

---

## 7. Event causality and metrics

### 7.1 Improvements established

Source confirms:

- pending detector state survives event-free brackets;
- carried pending values are consulted before fresh detector clearing;
- bisection returns the crossed side;
- abnormal ground contact can compete with ordinary candidates;
- roots are reused for candidate selection/service in the general path;
- terminal duration, mass and canonical telemetry are aligned to touchdown time;
- ground projection is now explicitly acknowledged.

### 7.2 Selection is not a consistent effective-time scheduler

For fresh dependents, selection uses:

```ts
Math.max(roots[i].time, evt.time)
```

but service uses:

```ts
const tau = roots[serveIdx].time;
```

**The selected effective time is not necessarily the served time.**

Furthermore, prerequisite checks exist for additional tied events but not universally for the selected event passed to `serve()`. Chord-based readiness is still being relied upon to guarantee causality that refinement can change.

Already-satisfied predicates also do not universally serve at base:

```ts
return {
  time: evt.time <= bT ? bT : evt.time,
  state: bState
};
```

This can associate the base state with a later timestamp. Infinite selection keys are a waiting convention, not an explicit exclusion; if all keys are infinite, index zero still wins.

Finally, `selectNextCandidate()` implements **\(10^{-9}\)-second approximate priority ties**, not the “exact ties” described in its comment.

These are source-established scheduler inconsistencies. The supplied green production examples do not prove a realized failure for every path, but they do not close these invariants.

### 7.3 Deferred apogee is not a canonical physical peak

For an event-free pre-burnout crossing, the pending root remains:

- linearly localized from endpoint vertical velocities;
- assigned altitude by endpoint altitude interpolation.

That altitude generally underestimates a concave-down peak.

At activation:

- `maxAltitude` is unconditionally replaced by the pending altitude;
- `apogeeTime` becomes the pending chord time;
- `apogeePosition` remains a separate macro-sampled argmax;
- the event combines activation time/velocity with physical-peak altitude.

Thus time, altitude and position need not represent one state. The change prevents moving position to the activation point, but **does not repair the complete peak record**.

The pre-burnout test checks only that peak time precedes burnout, activation equals burnout, altitude is below 200 m, and the run passes. It does not compare against a refined peak or assert peak-record consistency.

### 7.4 Root refinement is not total event accuracy

With state/interpolation error \(\delta g\),

\[
|\delta t|\approx\frac{|\delta g|}{|\dot g|}.
\]

A bisection width of \(10^{-5}\) s controls uncertainty on the approximate path, not total physical event-time error. Shallow roots amplify trajectory error.

Candidate detection remains macro-endpoint based and can miss multiple internal crossings. The four new production cases are **four fixtures**, not parameter sweeps over phase, root separation, timestep, and threshold neighborhoods.

---

## 8. UI, output semantics and unsupported scope

### Established improvements

- Screening thresholds are explicitly distinguished from competition gates.
- Stale results withdraw screening-met presentation.
- Simulation exceptions clear previous results.
- Aero preview exceptions are caught.
- Canonical quaternions and a model/scope manifest are returned.
- The legacy simulator is explicitly labeled non-authoritative in source.
- Unsupported or extrapolated nominal-flight results close safety booleans.

### Remaining gaps

**Failed-run snapshots are not reproducible.** `describeRunInputs()` records identity, component count, rounded dry mass, selected motor scalars and visible options. It omits full vehicle geometry, thrust curve, resolved defaults, and source/version identity. The full `simulationInputKey` is not retained in the failure record.

The “rerun throws” UI test throws on the **first run**; it never establishes successful-run-then-failed-rerun clearing.

The domain badge does not explicitly require `validity === 'PASS'`; it relies on related fields being coherent. Its fallback “OFF-DOMAIN” also conflates stale or incomplete results with physical model-domain violation.

Timeout outputs still populate landing position, velocity and “Touchdown Energy” with end-of-run values even without touchdown. The status banner helps, but those metrics should be unavailable or explicitly labeled nonterminal.

The manifest’s unsupported-scope exclusions are valuable, but the UI does not display that manifest. Comments and returned strings alone are not complete operator-facing scope control.

---

## 9. Evidence integrity audit

### 9.1 Counts reconcile

The supplied per-file totals sum to:

\[
37+7+4+4+4+6+3+2+8+14+13+19+4+9+30+4
=\boxed{168}.
\]

There are **16 files**, all reported passed.

The emitter’s Vitest entry comprises **36 substantive registered cases plus one cleanup case**. Its direct Node runner executes the 36 substantive cases and performs cleanup separately. The artifact does not justify treating cleanup as a substantive fail-closed test.

All five supplied installed motor records satisfy the shown ordinary depletion tests. The 14 VV suite IDs reconcile with 30 reported VV cases.

### 9.2 Repairs that deserve credit

Source confirms:

- fixed mandatory VV inventory;
- required motor/mass/UI acceptance files;
- all **collected** files must pass;
- empty executed files rejected;
- unknown result statuses rejected;
- duplicate case identities rejected within the reported path/name scheme;
- pre/post cited-file byte hashes, status and HEAD checks;
- substantive emitter self-tests;
- correctly implemented self-hash basis;
- direct installed-version measurement;
- successful-case residual absence explicitly disclosed.

The supplied dependency versions satisfy their displayed caret ranges.

### 9.3 Limits and remaining loopholes

1. **Collected-file completeness is not repository-test completeness.**  
   Non-gated suites can disappear from collection without a fixed full-suite inventory. Several reported legacy test files are not individually hashed.

2. **Empty source files are not universally rejected.**  
   Required production files are checked for a non-null hash, not nonzero byte length. Empty executed test files are a different condition.

3. **Aggregate validation is partial.**  
   Only three test counters are mandatory finite values. Missing/nonfinite suite totals and contradictory pending/todo aggregates are not universally rejected. Durations are not finite-validated.

4. **Range checking is not full semver.**  
   Exotic ranges return `null` and do not fail certification. Prerelease suffixes are discarded by numeric parsing, potentially accepting versions excluded by real semver rules.

5. **Source analysis and hashes are separate reads.**  
   Pre-analysis strings are captured before pre-hashing; solver analysis occurs after the post checks. The emitter does not derive all analysis from one immutable byte snapshot.

6. **Matching endpoints do not prove continuous immutability.**  
   Temporary modifications restored before the post snapshot can escape detection. No isolated checkout or content-addressed execution environment is established.

7. **Installed versions are not installed-content integrity.**  
   Dependency contents and transitive resolution are not verified against lockfile integrity.

8. **Numerical residuals remain unavailable.**  
   `observedValues: []` means no successful errors, convergence ratios or physical margins were emitted. Declared bounds and test titles are not measurements.

9. **Some green benchmarks have narrower scope than their titles.**  
   VV-005 is test-local separation algebra, not production staging. VV-006 contains analytical/test-local localization. VV-012 tests chord localization, not the driver’s dense restart. VV-002 exercises fixed RK4, not the production adaptive flight integration.

**Conclusion:** `passed: true` is credible as a report that the emitter’s implemented checks passed. It is not engineering certification and does not override source-demonstrated defects.

---

## 10. Release blockers and requirements before 9.0

### Release blockers

1. **Repair validity transactions:** snapshot before any speculative fold; preserve rail reports; bind committed state and validity to the same path.
2. **Unify event selection and service:** one effective timestamp, consistent state, explicit selected-event prerequisite checks, and safe handling of deferred/infinite candidates.
3. **Store a canonical refined peak record:** physical peak state/time separate from recovery activation.
4. **Validate all geometry before overrides:** finite overrides, totals, CG, dimensions, identities and component types.
5. **Close motor/mount loopholes:** finite impulse, consistent short-segment integration, true bore checks, complete placement validation.
6. **Bound production execution:** eliminate epsilon-skipped valid spans, cap macro work, and resolve the 300-second horizon without unprocessed overshoot.
7. **Correct or explicitly downgrade physical models:** aerodynamic discontinuities, inconsistent Mach force/CP treatment, atmosphere/Reynolds domain, and canopy validity.
8. **Complete evidence and UI contracts:** immutable replayable inputs, discriminating rerun/rollback tests, and evidence completeness beyond currently collected files.

### Non-blocking only for a restricted research preview

- Non-authoritative Euler presentation and rounded display telemetry.
- Uniform-cylinder inertia and empirical damping, **if prominently disclosed and excluded from authoritative predictions**.
- Flat terrain, locked-rail attitude, instantaneous canopy activation and absent staging, **if explicitly unavailable to users rather than implied implemented**.
- Duplicate propagation cost and limited modal-focus robustness.

### Additional requirements for a 9.0 complete-product score

Beyond those blockers:

- independent numerical references with emitted residuals and measured order;
- production phase/near-tie/threshold sweeps and mutation-discriminating acceptance tests;
- component-resolved mass/inertia or experimentally justified restricted equivalents;
- externally grounded aerodynamic, motor and recovery validation;
- requirement-to-code-to-test traceability;
- measured simulation, UI and ensemble performance;
- verified uncertainty/failure accounting where ensembles are claimed;
- verified terrain, staging, tip-off, inflation/shock, interoperability, sensors and competition-rule capabilities—or a formally reduced product specification;
- operator-visible model limitations and nonterminal metric semantics;
- content-bound execution and replayable successful and failed run records.

## Final verdict

**Round 17 improves the kernel and evidence machinery, but does not close the production engineering contract.**

The decisive finding is not a missing comment or an absent test name: **the validity transaction described by the change summary is contradicted by the order of operations in production.** Geometry validation and event-service semantics have similarly substantive gaps.

**6.4/10 — NO-GO for baseline freeze or authoritative flight-safety use.** Continue as an explicitly restricted research preview while closing the source-established blockers above.