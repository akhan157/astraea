# Astraea Round-14 Adversarial Engineering Audit

## 1. Executive disposition

**Complete-product quality score: 5.7/10.**  
**Build-readiness: NO-GO for engineering baseline freeze, authoritative safety output, or flight-readiness claims.**

Round 14 contains substantial, source-verifiable repairs:

- Production actually calls the adaptive integrator.
- The attitude-error estimator compares normalized candidate attitudes.
- Complete vector drag replaces the axial-only defect.
- Combined-CG parallel-axis algebra and its derivative are internally consistent.
- A dense-output/root-state restart mechanism exists.
- The dimensionally incorrect free-flight roll limiter is removed.
- Evidence collection now uses executed test-result records and requires the three repair-test files.

However, **the change summary overstates closure**. Production loses pending event state, does not consistently propagate model validity, retains ground-coordinate projection and a macro-step touchdown-time mismatch, and uses an evidence emitter whose self-hash does not follow its advertised definition. Several acceptance tests validate utilities or broad trajectory bounds rather than the release-critical production behavior.

**Evidence boundary:** I audited the supplied text and machine artifact. I did not execute the repository, recompute on-disk hashes, or independently reproduce the browser exercise. Imported motor, mass, atmosphere, and aerodynamic implementations were not supplied; their behavior cannot be established from comments in their callers.

---

## 2. Engineering-gate disposition

| Gate | Status | Source-established disposition |
|---|---|---|
| **1r — Authoritative production loads / frames** | **PARTIAL** | `loadsAtStage()` calls `computeFlightLoads()` at adaptive stages. ENU arithmetic, rate mapping, full drag, and paired incidence are present. But `loadValidity` is discarded by production; canopy activation is determined by flags rather than actual canopy availability; mass tensors and aerodynamic closures remain approximations. |
| **2 — Adaptive integrator** | **PARTIAL** | Correct DP coefficient table, normalized-candidate geodesic error, callback-load validation, rejection bounds, and Hermite interpolation exist. Production uses the specified tolerance values. Exact-end/progress handling remains defective; stage-state validation is incomplete; projected-method order and nonlinear dense-event accuracy are not demonstrated. |
| **3 — Variable inertia** | **PARTIAL** | Combined-CG and derivative algebra are repaired, including the stated ignition right derivative. The repair test exercises production transverse inertia. Actual mass-law consistency cannot be established without `getMotorMassAt()`; the stated linear law conflicts with the master impulse-proportional requirement. Component-resolved inertias remain absent from this assembly. |
| **4 — Stage RHS / event causality and restart** | **PARTIAL** | Stage loads and reconstructed-root restart are real improvements. Production drops pending apogee state on event-free brackets, ranks candidates using chord times, applies ties before independently validating root-state prerequisites, projects touchdown height to zero, and returns the macro-end time as flight duration. |
| **5 — Reproducible acceptance evidence** | **OPEN** | Supplied artifact reports successful execution and matching counts for this run. But the emitter does not require every legacy suite, counts test cases rather than executed expectations, omits execution of its substantive self-tests, misdefines the self-hash, and does not ensure source immutability across build/test/hash collection. |

**No gate is CLOSED at its full stated acceptance scope.** This does not negate the specific repairs credited above.

---

## 3. Numerical kernel and frames

### 3.1 Quaternion and angular-dynamics algebra: correct

`quaternionDerivative()` implements

\[
\dot q_{NB}=\frac12 q_{NB}\otimes[0,\omega_B].
\]

The rotation matrix and body/world transpose operations are consistent with body-to-navigation unit quaternions.

The explicit mappings are correct:

\[
\omega_B=(q_{\rm pitch},p_{\rm roll},r_{\rm yaw}),
\qquad
I_B=(I_{\rm pitch},I_{\rm roll},I_{\rm yaw}).
\]

For example, the kernel’s first angular equation is

\[
\dot\omega_x=
\frac{M_x-\dot I_x\omega_x-(I_z-I_y)\omega_y\omega_z}{I_x},
\]

which agrees with

\[
I\dot\omega=M-\omega\times(I\omega)-\dot I\omega.
\]

The repaired error calculation constructs

\[
q_5=\operatorname{normalize}(q_n+\Delta q_5),\qquad
q_4=\operatorname{normalize}(q_n+\Delta q_4).
\]

Its relative-quaternion vector expression is the negative of one conventional relative-quaternion vector, but its norm is unchanged. Therefore

\[
2\operatorname{atan2}(\|\operatorname{vec}(q_{\rm rel})\|,
|\operatorname{scalar}(q_{\rm rel})|)
\]

is the correct antipodally invariant geodesic separation.

**The Round-13 derivative-increment attitude-error defect is repaired.**

### 3.2 ENU arithmetic: substantially correct

Source confirms:

- Position altitude and vertical velocity use `z`.
- Gravity acts along `-z`.
- Wind horizontal components are East `x`, North `y`.
- Rail direction is
  \[
  (\cos e\sin a,\cos e\cos a,\sin e).
  \]
- Initial attitude aligns body \(+Y_B\) with that direction.
- Landing drift is \(\sqrt{x^2+y^2}\).
- UI landing coordinates display `x` East and `y` North.

Residual frame issues:

- A simulator comment still specifies the obsolete East–Up–North frame.
- `weathercockAngleDeg` is **air-relative incidence at rail departure**, not a measured turn of the vehicle into the wind. With locked rail attitude, these are different observables.
- The Euler-angle formulas lack a declared, verified rotation sequence and contain denominators that are not a mutually consistent standard sequence. They should not be accepted as certified attitude telemetry without reconstruction tests.
- No supplied renderer establishes a proper ENU-to-display rotation with determinant \(+1\).

These do not overturn the correct kernel ENU implementation.

---

## 4. Adaptive solver and dense output

### 4.1 Established repairs

The DP tableau matches the standard seven-stage 5(4) pair. Every stage invokes `loadsAt`, and adaptive load validation checks finite force, moment, inertia, inertia derivative, positive mass, and positive inertias.

Production supplies:

\[
(\mathrm{tol}_r,\mathrm{tol}_v,\mathrm{tol}_q,\mathrm{tol}_\omega)
=(10^{-3},10^{-2},10^{-5},10^{-3}).
\]

Errors in the three-vector groups use Euclidean norms. This is stricter than checking each component independently against the same bound; it is not an under-tolerance loophole.

The new tests exercise nonzero spin, time-dependent torque, attitude-coupled translation, invalid callback loads, and persistent rejection. These are materially more discriminating than stationary-attitude VV-014.

### 4.2 Remaining exact-end and progress defects

The loop condition is:

```ts
while (t < tEnd - 1e-12)
```

Consequently a valid call over, for example, \([0,5\times10^{-13}]\) returns **zero steps and `finalTime = 0`**, rather than reaching the requested endpoint or rejecting the request.

Production’s `stepState()` ignores `finalTime`, so callers can assign a later time to an unchanged state.

The computed representability `floor` is not checked before a trial or accepted time update. An accepted trial for which `t + h === t` is not immediately rejected. The total-trial cap eventually bounds ordinary such loops, but this is not the claimed direct progress guarantee.

Additionally, the nonfinite-error `continue` bypasses the total-trial check. Its rejection-streak/floor checks still bound persistent failures, but the advertised universal total-trial limit is not implemented on every path.

**Required:** validate `tNext > t` before accepting, handle every positive residual interval explicitly, verify returned endpoint time, and count every trial in one unconditional location.

### 4.3 Stage-state validation remains incomplete

Stage attitudes are projected, but complete stage states are not validated before calling `loadsAt`. Nonfinite position, velocity, or rate can therefore reach consumers before later error/output checks reject the propagation.

The fixed RK4 validator also still omits `inertiaDotB` finiteness.

This is a strict-boundary defect, although the adaptive load and accepted-state checks are substantially improved.

### 4.4 Dense output exists; the acceptance claim needs qualification

For a smooth scalar component, cubic Hermite interpolation gives

\[
y(t)-H_3(t)=
\frac{y^{(4)}(\xi)}{4!}(t-t_0)^2(t-t_1)^2,
\]

hence an \(O(h^4)\) interior interpolation error with exact endpoint data.

That supports the code’s **fourth-power interpolation-accuracy** description. It is not automatically the standard DP continuous extension with all associated RK order conditions. Normalizing intermediate quaternion stages also modifies textbook DP; its effective order needs evidence for this projected implementation.

The dense-output acceptance test establishes:

- Linear translation reproduction.
- Endpoint consistency.
- Unit quaternion interpolation.

It does **not** establish nonlinear interior convergence order or event timing accuracy.

For a simple root,

\[
|\delta t|\approx
\frac{|\delta g|}{|\dot g|}.
\]

A bisection interval below \(10^{-5}\) seconds controls root refinement **on the approximate trajectory**, not total physical event-time error. Shallow roots and interpolation error remain unaccounted for.

---

## 5. Mass properties and physical loads

### 5.1 Combined-CG derivative: algebra repaired

With fixed component centroids,

\[
x_c=\frac{m_dx_d+m_mx_m}{m_d+m_m},\qquad
\dot x_c=\frac{\dot m_m m_d(x_m-x_d)}{(m_d+m_m)^2}.
\]

The code correctly uses

\[
I_\perp=I_{d,c}+m_dd_d^2+I_{m,c}+m_md_m^2.
\]

Since

\[
m_dd_d+m_md_m=0,
\]

the moving-reference terms cancel in the summed derivative:

\[
\dot I_\perp
=\dot m_m\left[
\frac{3r_m^2+L_m^2}{12}+d_m^2
\right].
\]

The expanded implementation is equivalent. Axial inertia correctly receives no parallel-axis correction for purely axial offsets:

\[
\dot I_{\rm roll}=\frac12r_m^2\dot m_m.
\]

The finite-difference repair test genuinely checks production transverse-inertia differentiation.

### 5.2 What this does not establish

- `getMotorMassAt()` was not supplied. The caller’s assertion that it is linear is not independent proof.
- The master specification requires
  \[
  \dot m_{\rm prop}=-m_{\rm prop,total}F(t)/I_{\rm total},
  \]
  whereas the assembly supplies constant \(-m_{\rm prop}/t_{\rm burn}\).
- Dry inertias are whole-vehicle uniform-cylinder estimates, not component-resolved tensors about the rolled-up CG.
- Motor location is inferred from total length, not the assigned motor mount.
- Motor centroid migration is not modeled.
- The negligible exhaust angular-momentum-flux assumption remains a model restriction, not a demonstrated physical identity.

Thus the calculus defect is fixed, but propulsion-contract compliance and general mass-property fidelity are not closed.

### 5.3 Force direction and moment signs: repaired

The drag contribution is now

\[
F_{D,B}=-D\,v_{\rm air,B}/V.
\]

Therefore

\[
F_{D,B}\cdot v_{\rm air,B}=-DV,
\]

for nonnegative \(D\): drag removes air-relative kinetic energy and includes every component.

Signed \(\alpha,\beta\) match the normative definitions. Total incidence is an unfolded **nonnegative magnitude** in \([0,180^\circ]\), not a signed quantity despite one interface comment.

For drawing coordinates increasing aft,

\[
r_{CP}-r_{CG}=(0,-(x_{CP}-x_{CG}),0),
\]

so

\[
M_x=-dF_z,\qquad M_z=dF_x
\]

matches the implemented static-moment signs.

### 5.4 Remaining aerodynamic/recovery deficiencies

1. **Mach scaling suppresses the entire normal slope.**  
   At Mach 4 the multiplier is \(1/\sqrt{15}\approx0.258\). This scales nose/body contribution as well as fins, contrary to the described mechanism of degrading fin effectiveness while retaining nose contribution.

2. **Canopy validity is based on flags, not an active model.**  
   `recovery` becomes true even if no parachute component exists. In that case the code retains airframe drag area/coefficient while suppressing normal force and exempting body incidence from validity checks.

3. **Canopy loads act through the airframe CP.**  
   The parachute drag enters `aeroBody`, then receives the same `cp - combinedCg` moment arm as airframe aerodynamics. No suspension attachment or canopy load application point supports this torque.

4. **Canopy validity is not separately substantiated.**  
   A constant canopy \(C_D\) is effectively treated as nominal through Mach 4. The supplied evidence does not validate that envelope.

5. **Finite/nonnegative aerodynamic inputs are not comprehensively classified.**  
   Comparisons with NaN fall through the ternary classification toward `VALID`; kernel rejection of nonfinite forces is not a substitute for a correct validity API.

---

## 6. Event causality and production restart

### 6.1 Critical: pending apogee state is lost

The FSM correctly retains a pre-gate velocity root in `det.state`.

Production then does:

```ts
if (det.events.length === 0) break;
```

without committing that state.

A pre-burnout crossing occurring in an otherwise event-free macro bracket is therefore discarded. At burnout, if velocity is already negative at both endpoints, there is no new crossing to recover.

The standalone FSM test passes because it explicitly feeds `rA.state` into the next call. **Production does not.**

A related problem occurs when `det.state` contains cleared pending fields because a later candidate apogee was discovered: applying only an earlier event copies that final detector state prematurely.

**Release blocker:** detector bookkeeping must be committed through the resolved time, not discarded or copied from a speculative future transition.

### 6.2 Candidate ordering is not root ordering

Production chooses the earliest event using linear chord estimates, then refines only that selected event.

A nonlinear rail root and exact burnout boundary can reverse their order relative to chord estimates. Refining the selected candidate does not prove it remains earliest.

Similarly, main-at-apogee ties are decided using chord-interpolated altitude. A shallow apogee near the main threshold can have endpoints below the threshold while its actual peak is above it. Production can then deploy main prematurely with the apogee tie.

**Required:** refine competing candidates and reevaluate dependent guards at the selected root state before applying transitions.

### 6.3 Touchdown time/state consistency is still defective

After root refinement, production executes:

```ts
eState = { ...root, r: { x: root.r.x, y: root.r.y, z: 0 } };
```

This is a ground-coordinate projection. It is much smaller than the former full-step overshoot clip, but the claim that no ground clip remains is false.

More importantly, it does not set `t = τ` before breaking. Consequently:

- Touchdown event time is localized.
- `flightDuration` remains the macro-bracket endpoint.
- Landing mass is evaluated at that later time.
- No final root-state telemetry point is appended.

The current test never asserts equality between touchdown time and `flightDuration`.

### 6.4 Other event limitations

- Endpoint-only candidate detection can miss multiple crossings inside a macro bracket.
- Burnout changes the load law directly through time, including endpoint stages; a clean one-sided discontinuity convention is not established.
- Physical apogee and deferred recovery activation are conflated. If a root becomes actionable later, assigning that later altitude to `maxAltitude` is incorrect.
- Touchdown requires apogee sequencing, so abnormal impact before nominal prerequisites lacks an independent terminal path.
- Rail force remains `Math.max(0, fdot)`: negative along-rail acceleration is suppressed even for a vehicle already moving upward. A launch-stop constraint must distinguish contact at the base from deceleration during sliding.

The normal flight restart architecture deserves credit, but abnormal-flight causality remains release-blocking.

---

## 7. Validity and UI safety semantics

**Production does not consume `loadValidity`.**

It instead derives final validity from sampled macro maxima:

```ts
maxMach <= 4 && maxAlphaDeg <= 30
```

This:

- Treats 15–30° extrapolation as nominal.
- Misses intermediate accepted-trajectory excursions.
- Ignores unsupported active-model conditions.
- Does not enforce strict unsupported-model termination.

The safety booleans remain numerical threshold checks independent of model validity:

```ts
isRailExitSafe: railExitVel >= 15
isLandingSafe: terminated && landingKineticEnergy <= 20
```

The UI displays these as **SAFE** and **GATE PASS**, including on unsupported or stale results.

The top-level `PASS · criterion satisfied` is also misleading: simulator `PASS` means touchdown plus sampled envelope and finite landing values, not satisfaction of rail or impact limits. Conversely, timeout is labeled `FAIL · limit exceeded`, although it may indicate nontermination rather than a physical limit exceedance.

### UI credit and limits

Source supports:

- Input-key freshness tracking.
- CURRENT/STALE badges.
- Correct ENU landing coordinate selection.
- Escape handling.
- Basic Tab wrap and focus restoration.

The operator’s browser observation is corroborating human evidence, **not machine execution evidence**. It does not establish complete focus containment, exception handling, or safety-status correctness.

Simulation runs synchronously without a shown error boundary or busy state. A failed rerun can leave the previous result visible without a dedicated failure record.

---

## 8. Acceptance-evidence integrity

### 8.1 What the supplied artifact establishes

The listed file counts sum to **94 test cases across 14 files**, matching its summary.

The three repair files report:

- Adaptive: **6**
- Loads: **10**
- Events: **14**

The legacy VV records total **30 test cases** across 14 listed suite IDs. Source/execution counts shown for those suites agree.

The artifact reports clean commit `52cce263714624faf9c45f5e520ba1aa8ef86ad4`, build exit 0, test exit 0, and measured direct dependency versions. These are useful reported execution facts, subject to the collection defects below.

### 8.2 “Assertions” are test-case counts

The emitter’s source counter matches `it()`/`test()` declarations, not executed `expect()` calls. VV-001 reports one “assertion” despite containing two expectations.

Equal declaration/result counts do not prove that conditional or loop-contained numerical assertions executed.

Successful observed residuals are not emitted; tolerance literals are correctly labeled source-declared, but they are not measurements.

### 8.3 All legacy suites are not mandatory

`notExecuted` is calculated but never independently added to `missing`.

Only IDs in `GATE_REQUIREMENTS` are required. Omission of legacy VV-001, 002, 003, 005, 006, 009, or 011 can therefore escape this completeness gate if the rest of the report remains green.

**This run reports them executed; the claimed fail-closed guarantee is nevertheless false.**

### 8.4 Substantive emitter tests are not executed by the reported test entry

Under Vitest, the emitter test file registers only:

```ts
expect(true).toBe(true)
```

Its substantive fixture suite runs only through direct Node execution. Neither the emitter nor the supplied artifact establishes that invocation.

The reported one passing test is therefore a **container marker**, not evidence that fail-closed behavior was tested.

### 8.5 Self-hash definition is wrong

Advertised basis:

> Artifact JSON with `hashes.artifactSelf` removed.

Actual calculation hashes an intermediate object containing:

```js
hashes: { files: fileHashes, artifactSelf: '<self>' }
```

and omits the final `hashes.basis` field.

A verifier following the published basis will not reproduce the calculation. The test merely checks that the hash looks like 64 hexadecimal characters.

### 8.6 Clean-commit binding is incomplete

Git status is sampled before build and tests; file hashes are collected afterward. No post-execution status or hash comparison prevents intervening changes.

Additional weaknesses:

- The emitter itself is not in the required hash inventory.
- Imported physics dependencies and UI are not individually hashed.
- Lockfile presence is informational, not mandatory.
- Installed versions do not establish lockfile or package-content integrity.
- Solver configuration is inferred by text matching, not runtime tracing.
- `DIGITS_RE` has one capture group, but extraction reads `m[2]`, explaining the artifact’s `decimalDigitsDeclared: [null]`.
- Unknown test statuses and aggregate/result-count consistency are not universally rejected.

Default subprocess wrappers do correctly derive success from actual exit codes. That repair deserves credit; it does not close the broader provenance chain.

---

## 9. Release blockers versus residual risk

### Release blockers

1. Commit pending FSM state correctly across event-free and partially resolved brackets.
2. Select events by refined root order and reevaluate tied prerequisites at root state.
3. Align final time, mass, telemetry, and state with touchdown.
4. Propagate active-model validity into result and safety outputs; prevent unsupported/stale safety PASS presentation.
5. Fix absent-canopy activation and unsupported canopy moment/domain assumptions.
6. Enforce exact-end and representable-progress solver semantics.
7. Resolve the motor depletion contract and supply its authoritative implementation.
8. Repair evidence completeness, self-hashing, immutable-source binding, and executed emitter self-tests.
9. Replace physically incorrect rail acceleration clipping with a declared constraint model.

### Non-blocking only for an explicitly restricted, provisional engineering preview

- Stale comments and telemetry terminology.
- Display Euler-angle reconstruction gaps.
- Conservative vector-norm tolerance interpretation.
- Redundant integration of macro brackets and root paths.
- Limited keyboard-focus robustness.
- Lack of performance measurements.
- Empirical damping and aerodynamic approximations **if prominently bounded and excluded from certification claims**.

These become blockers when advertised as validated full-product capabilities.

---

## 10. Requirements before a 9.0 score

A 9.0 complete-product score requires more than repairing the listed code defects:

- Production-path regression tests for every event/validity failure above, including phase and near-tie sweeps.
- Measured adaptive and dense-output convergence against independent analytical or independently implemented references.
- Component-resolved mass/inertia and documented propulsion/control-volume assumptions.
- Validated airframe and canopy model domains with explicit unsupported handling.
- Terrain-relative AGL or an explicit flat-terrain run manifest.
- Reproducible measured residuals, stable test identities, complete mandatory-suite inventory, and independently verifiable artifact hashing.
- Requirement-to-implementation-to-test traceability for staging, rail tip-off, inflation/shock, ensembles, sensors, interoperability, and competition rules—or explicit disabling of unsupported scope.
- Verified uncertainty/failure accounting and containment mathematics.
- Automated browser and failure-state coverage plus measured numerical/UI/worker performance.
- Removal of certification language that exceeds demonstrated empirical model validity.

## Final verdict

**Round 14 is a genuine repair round, not gate closure.**

The strongest improvements are the corrected attitude estimator, vector drag, combined-CG differentiation, production adaptive linkage, and reconstructed-state restart architecture. The decisive remaining defects are **production event bookkeeping, validity-to-safety propagation, terminal time/state consistency, recovery-model selection, and evidence provenance**.

**5.7/10 — NO-GO for baseline freeze or authoritative flight-safety use.** Continue focused core repair and provisional UI work; do not treat the green metadata artifact as engineering certification.