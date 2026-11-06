# Astraea Round-15 Adversarial Engineering Audit

## 1. Executive disposition

**Complete-product quality score: 6.1/10**  
**Build-readiness: NO-GO for engineering baseline freeze, authoritative safety output, or flight-readiness claims.**

Round 15 contains genuine repairs. In particular:

- Adaptive integration no longer silently ignores tiny positive intervals.
- Adaptive stage states are validated before load callbacks.
- Fixed RK4 now validates `inertiaDotB`.
- Production commits detector bookkeeping on event-free brackets.
- Recovery loads require hardware as well as flags.
- Canopy drag no longer receives an airframe-CP static moment.
- Production gates safety booleans on final validity.
- The UI clears previous results after a throwing rerun.
- The evidence emitter substantially improves execution accounting and self-hash construction.

However, **the claimed closure is not established**. Source reveals release-critical defects in the new root-order selection, incomplete unilateral contact, and motor mass-law consistency. Terminal telemetry remains rounded rather than exactly root-coincident. The new dense-output test exercises a nonlinear *solution of a linear ODE*, not nonlinear coupled rigid-body convergence, and its event-time assertion is weaker than the specified requirement.

The newly supplied motor and mass implementations also expose physical defects that could not be audited in Round 14.

**Evidence boundary:** This report audits the supplied source text and machine artifact. I have not executed the repository, independently regenerated its hashes, or exercised the browser. Numerical calculations below are recomputed from supplied formulas and motor samples. Reported test passes are distinguished from independent reproduction and from engineering acceptance.

---

## 2. Engineering gates

| Gate | Status | Source-established disposition |
|---|---|---|
| **1r — Production loads / frames** | **PARTIAL** | Production calls `computeFlightLoads()` at adaptive stages. Quaternion, ENU, rate mapping, full drag direction, and static moment signs are consistent. Hardware-dependent recovery and canopy static-moment repairs are present. Mass fidelity, synchronized flow-dependent aero, model-domain completeness, and valid canopy envelopes remain unresolved. |
| **2 — Adaptive integrator** | **PARTIAL** | Standard DP tableau, full-candidate geodesic error, unconditional trial cap, direct time-progress check, adaptive pre-callback state validation, and fixed-kernel inertia-derivative validation are present. Endpoint timestamps are not consistently represented in stage times/dense records; projected-method order and production event accuracy remain incompletely demonstrated. |
| **3 — Variable inertia / depletion** | **PARTIAL** | Combined-CG differentiation is algebraically correct on the unsaturated interior mass-law branch. **The bundled curves do not integrate to their declared total impulses.** Depletion therefore saturates early or jumps at burnout, while `getMotorMassFlowAt()` does not differentiate those behaviors. |
| **4 — Event causality / restart / terminal state** | **OPEN** | Event-free bookkeeping and touchdown-duration alignment are repaired. **Root-order reselection is incompatible with the subsequent tie-application loop**, allowing selected events to be skipped. Chord-time ties still bypass independent root-state prerequisites. Base contact does not arrest inward velocity. |
| **5 — Reproducible acceptance evidence** | **PARTIAL** | Artifact counts reconcile; substantive emitter tests are registered and directly invoked; present legacy VV suites are required; self-hash construction matches its implemented verification basis. Complete immutable execution binding, exhaustive status/count rejection, stable mandatory inventory, imported-source closure, and measured numerical residuals remain incomplete. |

**No full engineering gate is CLOSED.** Individual repairs can be accepted without accepting the surrounding gate.

---

## 3. Kernel algebra, frames, and numerical behavior

### 3.1 Quaternion and rotational equations: correct

`quaternionDerivative()` implements

\[
\dot q_{NB}=\frac12q_{NB}\otimes[0,\omega_B].
\]

`quaternionToMatrix()` is consistent with a unit quaternion rotating body vectors into navigation coordinates; `rotateWorldToBody()` applies its transpose.

The explicit adapter mapping is correct:

\[
\omega_B=(q_{\rm pitch},p_{\rm roll},r_{\rm yaw}),
\qquad
I_B=(I_{\rm pitch},I_{\rm roll},I_{\rm yaw}).
\]

The first angular equation is

\[
\dot\omega_x
=\frac{M_x-\dot I_x\omega_x-(I_z-I_y)\omega_y\omega_z}{I_x},
\]

with cyclic counterparts. This agrees with

\[
I\dot\omega=M-\omega\times(I\omega)-\dot I\omega.
\]

The adaptive attitude estimator compares normalized **complete candidate attitudes**, not derivative increments. Its relative-quaternion vector has the opposite sign from one common convention, but the vector norm is unchanged. Thus

\[
2\operatorname{atan2}(\|\operatorname{vec}q_{\rm rel}\|,
|\operatorname{scalar}q_{\rm rel}|)
\]

is antipodally invariant and gives the appropriate rotational separation.

### 3.2 ENU mapping: correct in the audited engine

Source consistently uses:

- East: `x`
- North: `y`
- Up: `z`
- Gravity: negative `z`
- Rail direction:
  \[
  u_{\rm rail}=(\cos e\sin a,\cos e\cos a,\sin e).
  \]
- Landing drift:
  \[
  \sqrt{x^2+y^2}.
  \]

Initial attitude aligns body \(+Y_B\) with the rail direction.

Remaining qualifications:

- The obsolete East–Up–North simulator comment remains.
- Euler telemetry still lacks a declared, reconstruction-tested rotation sequence. Its yaw denominator is not consistent with the X-middle sequence suggested by the pitch extraction.
- No supplied 3D renderer establishes the required proper ENU-to-display rotation.
- `weathercockAngleDeg` remains incidence at rail departure, not measured weathercocking. The UI subtitle is corrected, but the heading and event description still call it weathercocking.

### 3.3 Adaptive repair credit—and endpoint limitations

The supplied DP coefficients match the standard seven-stage 5(4) pair.

The revised loop:

```ts
while (t < tEnd)
```

and unconditional top-of-loop trial cap close the prior zero-step tiny-interval and bypassed-total-guard defects. `nextTime <= t` now explicitly rejects nonprogressing trials.

Adaptive stages are validated before `loadsAt()`. Fixed RK4 validates `inertiaDotB`, but **its intermediate state callbacks still precede full stage-state validation**:

```ts
const L1 = loadsAt ? loadsAt(tHalf, s1) : loads;
validateStateAndLoads(s1, L1, dt);
```

Thus “every stage state validated before loadsAt” is true for adaptive integration, not universally true for both kernels.

The endpoint repair also distinguishes bookkeeping time from stage/dense time:

```ts
nextTime = h >= remaining ? tEnd : t + h
ti = t + A_DP[i] * h
dense.push({ t0: t, h, ... })
```

Consequently:

- `finalTime` lands exactly on `tEnd` when the remainder binds.
- Endpoint stage callbacks still use `t + h`.
- Dense output reconstructs its endpoint as `t0 + h`, not the authoritative `nextTime`.
- The source itself recognizes that these additions can differ by an ulp.

A robust endpoint contract should store an explicit accepted endpoint and use it consistently for endpoint callbacks, dense-span checks, and queries. The tiny-interval test does not discriminate this general floating-point endpoint mismatch.

The rejection “floor” is conservative, not the exact representability threshold. That is acceptable as a declared rejection policy, but its comment overstates what the formula proves.

### 3.4 Dense-output proof remains limited

For exact endpoint data, cubic Hermite interpolation has

\[
y(t)-H_3(t)
=\frac{y^{(4)}(\xi)}{24}(t-t_0)^2(t-t_1)^2,
\]

giving \(O(h^4)\) interior error.

This supports fourth-power interpolation accuracy. It does not, by itself, establish all order conditions of a DP continuous extension or the effective order of the stage-normalized quaternion method.

The new test uses

\[
r'=v,\qquad v'=-v.
\]

This is a **linear ODE with an exponential, non-affine solution**. It is a useful improvement over constant-velocity interpolation, but not a nonlinear coupled-dynamics benchmark.

Its event assertion is:

```ts
toBeCloseTo(Math.LN2, 4)
```

That permits approximately \(5\times10^{-5}\) seconds of absolute error, not the required \(10^{-5}\) seconds. Sixty bisections do not eliminate trajectory interpolation error.

For a simple event root,

\[
|\delta t|\approx \frac{|\delta g|}{|\dot g|}.
\]

Production’s \(10^{-5}\)-second bisection bracket controls refinement on an approximate trajectory. It does not establish total event-time accuracy, especially for shallow roots.

The “independent fixed-step references” also share the production angular equations and quaternion implementation. They are useful cross-method checks, not independent physics implementations.

---

## 4. Motor depletion and mass properties

### 4.1 Recomputed motor integrals contradict the authoritative denominator

Trapezoidal integration of the supplied piecewise-linear samples gives:

| Motor | Declared impulse, N·s | Integrated curve, N·s | Difference |
|---|---:|---:|---:|
| Estes C6 | 8.800 | **8.919** | +1.35% |
| AeroTech H128W | 180.000 | **173.425** | −3.65% |
| Cesaroni I205 | 382.000 | **345.350** | −9.59% |
| AeroTech K550W | 1550.000 | **1478.600** | −4.61% |
| Cesaroni M1820 | 5850.000 | **5697.000** | −2.62% |

`getMotorImpulseTotal()` chooses the declared value whenever it is positive and finite. Therefore the actual functions are not globally consistent derivatives of one mass law.

#### C6: premature saturation

The curve reaches 8.8 N·s before burnout. On the final segment,

\[
I(t)=8.919-\frac{35}{6}(1.86-t)^2,
\]

so depletion reaches zero at approximately

\[
t=1.7172\ {\rm s}.
\]

After that:

- `getMotorMassAt()` clamps propellant to zero.
- `getMotorMassFlowAt()` remains negative while thrust remains positive.
- `inertiaDotB` remains negative although the modeled motor mass and inertia have stopped changing.

#### Other motors: burnout mass discontinuity

For under-integrating curves, remaining propellant immediately before burnout is

\[
m_{\rm residual}
=m_{\rm prop}\left(1-\frac{I_{\rm curve}}{I_{\rm declared}}\right).
\]

Approximately:

- H128W: **3.58 g**
- I205: **19.00 g**
- K550W: **37.31 g**
- M1820: **74.54 g**

At `t >= burnTime`, `getMotorMassAt()` abruptly discards that mass. No corresponding impulse, angular-momentum treatment, or differentiable depletion law is implemented.

**This is a release blocker.** The current C6 test accepts the integral using `toBeCloseTo(..., 0)`, allowing roughly 0.5 N·s discrepancy. It explicitly misses the defect.

**Required:** reconcile thrust curves and authoritative impulse before simulation—either normalize the curves under an explicit policy or reject inconsistent motor records. Validate wet/dry/propellant identities and ensure mass flow differentiates the exact implemented mass function.

### 4.2 Combined-CG inertia derivative: locally correct

For fixed dry and motor centroids,

\[
x_c=\frac{m_dx_d+m_mx_m}{m_d+m_m},
\qquad
\dot x_c=\frac{\dot m_m m_d(x_m-x_d)}{(m_d+m_m)^2}.
\]

The implemented transverse inertia is

\[
I_\perp=I_{d,c}+m_d(x_d-x_c)^2
+I_{m,c}+m_m(x_m-x_c)^2.
\]

Using

\[
m_d(x_d-x_c)+m_m(x_m-x_c)=0,
\]

the moving-reference derivative terms cancel, yielding

\[
\dot I_\perp
=\dot m_m\left[
\frac{3r_m^2+L_m^2}{12}+(x_m-x_c)^2
\right].
\]

The expanded source expression is equivalent. Axial inertia satisfies

\[
\dot I_{\rm roll}=\frac12r_m^2\dot m_m.
\]

**The calculus is correct where `dmDt` actually differentiates `mMot`.** The saturation and burnout defects invalidate that condition elsewhere.

### 4.3 Newly visible mass-fidelity defects

`mass.ts` does not compute component inertias despite its header. `prepareVehicle()` uses whole-vehicle solid-cylinder approximations.

More fundamentally, a uniform solid conical nose has its centroid at

\[
x_{CG}=\frac34L
\]

from the tip. The implementation uses \(2L/3\), the familiar conical aerodynamic CP location. The branch handles a solid cone directly, so this is a demonstrable mass/CG error.

Other limitations include:

- Hollowing changes volume but leaves the previously assigned centroid unchanged.
- Motor position is inferred from vehicle length, not an assigned mount.
- Motor centroid migration is absent.
- Geometry validation is replaced in several places by clamps or fallback values.
- The negligible exhaust angular-momentum-flux assumption remains a restrictive model assumption.

These are not cured by a finite-difference test of the same approximate inertia model.

---

## 5. Aerodynamics, recovery, and validity

### 5.1 Correct force and moment directions

The drag vector is

\[
F_{D,B}=-D\frac{v_{\rm air,B}}{V}.
\]

For nonnegative \(D\),

\[
F_{D,B}\cdot v_{\rm air,B}=-DV,
\]

so drag opposes air-relative motion in all three channels.

Paired incidence definitions match the normative contract. Total incidence is an unsigned magnitude in \([0,180^\circ]\), despite its “signed” interface comment.

For drawing coordinates increasing aft,

\[
r_{CP}-r_{CG}=(0,-d,0),
\]

and therefore

\[
M_x=-dF_z,\qquad M_z=dF_x,
\]

matching the source.

Recovery now genuinely requires an available canopy and a deployment flag. Setting `dStatic = 0` removes the erroneous canopy-to-airframe-CP static torque. This does not establish a suspension-line or canopy-attitude model; it is a defensible simplification only if declared.

### 5.2 Aerodynamic fidelity remains materially below the stated contract

- **Whole-vehicle normal slope is suppressed at high Mach.** At Mach 4 the multiplier is \(1/\sqrt{15}\approx0.258\), including nose/body contributions. This does not implement fin-specific effectiveness loss.
- **CP migration is prescribed independently**, not recomputed from Mach-dependent component normal-force weights.
- **Flight drag tables are precomputed at sea level and default roughness.** The live atmosphere changes dynamic pressure and Mach, but does not supply synchronized Reynolds number, viscosity, altitude, or vehicle finish to the friction model.
- Only the first trapezoidal fin set contributes to the wave-drag calculation; elliptical fin wave drag is absent.
- The fin wave-drag implementation does not use sweep despite its description.
- The nose and fin wave-drag branches generally jump across Mach 1.1.
- Base drag is continuous but not globally \(C^1\) at the stated transition boundaries: the smoothstep branch has zero endpoint derivative, unlike the adjoining formulas.

The supplied source establishes empirical approximations, not the advertised validation provenance.

### 5.3 Validity propagation: improved but not transactionally correct

The final safety outputs now require `validity === 'PASS'`. This closes the prior direct unsupported-result safety-boolean defect.

However:

1. **Validity accumulates from rejected and speculative paths.**  
   `loadsAtStage()` mutates global flags during initial macro integration, repeated reconstruction, rejected trials, and root searches. Evaluations after a future deployment or touchdown—under the old model—can permanently contaminate final validity.

2. **All rail-phase validity is ignored, not just incidence.**  
   The guard excludes every `loadValidity` classification while rail-bound. Yet along-rail aerodynamic forces still use the same model. Contact reactions do not validate unsupported Mach, density, geometry, or drag inputs.

3. **Canopy Mach validity is asserted rather than established.**  
   Constant canopy \(C_D\) is treated as nominal through Mach 4 without a supplied canopy-domain validation.

4. **Nonfinite coverage is incomplete.**  
   The classifier checks Mach, airspeed, and incidence, not every state/load input. Nonfinite angular rate can produce nonfinite moments while returning `VALID`; the kernel may subsequently reject them, but the load API itself has not classified the condition correctly.

5. **Unsupported calculations continue.**  
   They can return `UNKNOWN` on touchdown, rather than enforcing the master contract’s strict unsupported halt. If continuation is an intended preview mode, it needs an explicit mode and manifest.

6. **Timeout takes precedence over model uncertainty.**  
   An unsupported run that does not terminate returns `FAIL`, not the summary’s unconditional `UNKNOWN`.

---

## 6. Event causality and rail contact

### 6.1 Critical new defect: selected event may never be applied

Root competition can replace `cand` with an event that is not `det.events[0]`. The application loop still starts at the beginning:

```ts
for (const evt of det.events) {
  if (Math.abs(evt.time - cand.time) > 1e-12) break;
  ...
}
```

If selection changes, the first event has a different chord time. The loop immediately breaks. **No selected transition is applied.**

For example:

- Chord estimates rank rail exit before burnout.
- Refinement places actual rail exit after burnout.
- `cand` becomes burnout.
- The loop encounters the original rail candidate and breaks.
- The bracket base advances to burnout without setting `hasBurnedOut`.
- Subsequent burnout detection requires `prevS.t < burnTime`, now false.

The repair can therefore permanently lose the burnout transition and its dependent recovery sequence.

The supplied production tests do not construct this root-order inversion.

### 6.2 Chord ties still apply transitions without independent root guards

Even when the selected event remains first, ties are grouped by **chord timestamps**. A rail/burnout chord tie is not proof of a physical tie.

Likewise, an apogee chord estimate can precede burnout even when the refined velocity root follows burnout. The detector ties apogee to burnout; production can then apply `APOGEE_DROGUE` at burnout without checking that root-state vertical velocity is nonpositive.

Reevaluating only the main altitude guard is insufficient.

**Required:** refine independent roots, select by resolved times, apply the selected event explicitly, then reevaluate every dependent transition against the committed root state. Do not use old chord equality as physical simultaneity.

### 6.3 Pending-root repair is real but incomplete

The event-free branch now commits `det.state`, closing the exact Round-14 bookkeeping omission.

`applyFsmTransition()` also preserves an existing earlier pending root. But:

- A pending root created during a speculative future part of the bracket can be copied before that time is committed.
- Pending altitude remains chord-derived.
- Applying deferred apogee still assigns the later activation altitude/time to the physical apogee metrics.
- A later return to ascent does not establish a new physical maximum policy.

Physical apogee and permission to activate recovery must be separate observables.

### 6.4 Touchdown alignment: partial closure

The code now sets `t = touchdownTau`; normal-path touchdown event time, `flightDuration`, and landing-mass evaluation time align.

But the exact summary claim is false:

- Final position is explicitly projected to `z = 0`.
- Final telemetry time is rounded to milliseconds.
- Position, velocity, mass, and other telemetry quantities are rounded.
- The regression test explicitly permits a \(5\times10^{-4}\)-second timestamp difference.

Retain full-precision canonical terminal telemetry and round only in presentation. Ground projection can be declared as a contact-state operation, but must not be described as an unchanged dense root.

### 6.5 Unilateral contact is not implemented by zero force alone

Signed along-rail force now correctly permits deceleration during upward sliding.

However, on returning to the base with inward velocity, the branch returns zero force:

\[
\dot v=0,\qquad \dot r=v<0.
\]

The vehicle continues penetrating the base at constant inward velocity. Cancelling acceleration does not cancel velocity.

A unilateral stop requires a contact event and an impact/velocity-reset policy, or a consistent constrained formulation satisfying nonpenetration. Both stage and display code share this defect.

Other unresolved event risks:

- Endpoint-only detection can miss multiple crossings within a macro bracket.
- Touchdown remains gated on apogee, preventing an independent abnormal-impact terminal path.
- The outer loop can exit at the simulation time limit before resolving the final bracket.
- The event-resolution loop lacks an explicit transition/progress cap.
- Rail friction and two-button tip-off remain absent.

---

## 7. Evidence integrity

### 7.1 Counts reconcile

The artifact lists **131 test cases across 14 files**:

\[
28+7+4+4+2+14+10+3+2+14+4+5+30+4=131.
\]

The legacy VV records total **30 cases across 14 IDs**. Reported source/execution counts agree.

The emitter source contains **27 substantive registered fixture cases**, plus a Vitest cleanup case, explaining its 28-case file result. Direct Node execution runs the substantive registry; the certified command invokes it.

These are meaningful improvements—not marker tests.

### 7.2 Self-hash construction is repaired

The emitter now hashes compact `JSON.stringify(evidence)` while `hashes` contains only `files`, then appends `artifactSelf` and `basis`.

Its verifier reconstructs that same object form. This closes the Round-14 placeholder/basis mismatch.

I have not independently recomputed the supplied digest. A portable verifier should also specify compact serialization and property-order preservation explicitly; “artifact JSON” alone is not a canonical serialization standard.

### 7.3 Source binding is improved, not immutable execution proof

Pre/post cited-file hashes and git status detect persistent changes to those files. They do not prove that execution consumed one immutable snapshot:

- Temporary mutation and restoration can evade endpoint comparisons.
- HEAD is not rechecked after execution.
- The emitter self-test source is not in the hashed inventory.
- Imported `core/types.ts`, material definitions, and `rocketStore.ts` are not individually bound.
- Dependency manifests are measured, not dependency package contents or lockfile resolution integrity.
- File hashes use UTF-8-decoded strings, despite advertising hashes of raw on-disk bytes. These normally agree for valid UTF-8 source but are not the same general operation.

An isolated checkout/container with pinned dependencies is the stronger certification boundary.

### 7.4 Remaining fail-closed gaps

- **Mandatory legacy inventory is source-relative.** Deleting a non-gate legacy suite from source and execution can pass. A fixed requirements inventory is needed to prevent silent retirement.
- **Not every legacy test file is mandatory.** The independent completeness rule applies to VV describes, not all historical mass/aero/parser suites.
- A non-required file with `status: 'failed'` and zero failed test cases is not independently rejected.
- Aggregate reconciliation checks only finite total/passed/failed test counters. Missing, malformed, skipped/pending/todo, and suite-counter inconsistencies are not comprehensively rejected.
- Case-count equality does not establish stable case identity or execution of every expectation.
- Regex parsing misses some legitimate `toBeCloseTo()` first arguments containing commas; fixing the capture index does not make it a complete syntax parser.
- `bindingIntact` drives both binding fields from message-text matching. An unreadable post-status can fail certification while those fields still report true.
- Successful residuals remain absent. Failure-message numerics are not semantically identified residual measurements.

### 7.5 Test passes are not full defect discrimination

The strongest remaining evidence gaps are:

- No production root-order inversion regression.
- No production false-tie prerequisite regression.
- No return-to-base impact/contact regression.
- No all-motor depletion continuity and saturation test.
- No exact full-precision terminal telemetry assertion.
- No nonlinear coupled adaptive/dense order ladder.
- No automated browser safety/failure-state suite.

VV-005 still validates test-local separation algebra rather than a production staging engine. Several event benchmarks exercise analytical or chord utilities rather than the production restart driver.

---

## 8. UI and alternative simulator

The rail and touchdown text labels now read **UNVERIFIED** when validity is not PASS or results are stale. Throwing reruns clear prior results and display an alert. Credit both repairs.

Remaining presentation issues:

- Top-level `PASS · criterion satisfied` still conflates model/result validity with safety-limit compliance.
- `FAIL · limit exceeded` can describe a timeout.
- The green `VALID · M∈[0,4], α≤30°` badge can coexist with `UNKNOWN` from stage excursions or 15–30° extrapolation.
- “Competition Safety Gates” remains unsupported by the displayed generic 15 m/s and 20 J thresholds.
- Error handling records a message, not a reproducible failed-run record with inputs and provenance.
- Simulation remains synchronous, with no demonstrated responsiveness or browser regression evidence.

The supplied legacy `simulateFlight()` also remains an exported alternative with Euler–Cromer propagation, late event detection, dry-vehicle-only impact mass, and

```ts
isLandingSafe = energy <= 20 || velocity <= 6
```

without validity or actual-touchdown gating. The audited UI uses `simulate6DofFlight()`, so this is **not evidence of that UI taking the legacy path**. It is nevertheless an unresolved public computational surface that should be retired, restricted, or explicitly excluded from authoritative use.

---

## 9. Release blockers and requirements before 9.0

### Release blockers

1. Repair selected-event application after refined root reselection.
2. Replace chord-time tie application with committed-root prerequisite evaluation.
3. Reconcile every motor’s thrust integral, depletion, mass flow, and burnout continuity.
4. Implement genuine base-contact nonpenetration and independent abnormal-impact termination.
5. Separate physical apogee metrics from deferred recovery activation.
6. Make terminal state/time/telemetry semantics internally consistent and full precision.
7. Make validity transactional over committed trajectory segments and scope rail exclusions narrowly.
8. Correct demonstrable mass/CG errors and prevent invalid geometry from silently becoming nominal.
9. Restrict safety/competition claims to demonstrated models and thresholds.
10. Close evidence completeness and immutable-run provenance gaps.

### Non-blocking only for a clearly restricted engineering preview

- Display rounding outside canonical records.
- Conservative solver rejection floors.
- Redundant macro and root-path integration.
- Euler-angle presentation, if explicitly nonauthoritative.
- Empirical damping and zero canopy static moment, if prominently declared approximations.
- Basic modal-focus limitations.

### Remaining work before a 9.0 complete-product score

Beyond the blockers:

- Independent analytical and numerical convergence evidence with measured residuals.
- Component-resolved mass/inertia and mount-resolved propulsion geometry.
- Validated airframe and recovery domains, including inflation and opening loads.
- Synchronized atmosphere/Reynolds/roughness aerodynamic evaluation.
- Terrain-relative AGL or an explicit flat-terrain run manifest.
- Production staging, recontact, sliding tip-off, resonance, and recovery-load traceability—or explicit unsupported-scope disabling.
- Reproducible ensembles, failed-member accounting, uncertainty calibration, and containment verification.
- Evidence for the specified sensors, interoperability, flight-log calibration, and competition engines.
- Automated browser coverage and measured solver/UI/ensemble performance.
- Stable requirement-to-code-to-test identities and independently reproducible artifact verification.

## Final verdict

**Round 15 is a substantive repair round, but not a closure round.**

Its most important advances are stricter adaptive boundaries, improved recovery selection, safety-output gating, terminal-duration repair, and materially better evidence collection.

Its decisive remaining failures are **event reselection/application causality, globally inconsistent motor depletion, incomplete base contact, and overstatement of numerical and validity evidence**.

**6.1/10 — NO-GO for engineering baseline freeze or authoritative flight-safety use.**