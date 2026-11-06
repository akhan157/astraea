# P0: aerodynamic coefficient and moment contract 1.0.0

Date: 2026-10-25. Source baseline: `00e768b2d2dcfc9913b2a9428040a67fd42d3d58`.
Status: **accepted design contract for the proposed provider; not implemented or empirically qualified**. Owner adopted the independently reviewed technical text on 2026-10-26; this status-only annotation does not activate it in production. This freezes the proposed A1 contract and provisional method, rather than certifying legacy behavior. On acceptance, it supplements `docs/internal/astraea-normative-physical-contract.md` §§1,2,6,7; it does not amend the integrator, mass model or empirical qualification. No production physics, simulation or outcome was changed for this packet.

## 1. Frames, stations and state

All vectors are right-handed. Navigation N is ENU. Body B has +Y noseward, +X the existing transverse pitch axis, +Z completing X×Y=Z. Its kinematic origin remains instantaneous mass center G. A geometric station `x` is **meters aft of the nose**, not the B-x coordinate. A centerline point at station x has body position relative to G `(0,xG−x,0)`. Use distinct names `stationFromNose_m` and `position_B_m`.

The aerodynamic moment datum O is a fixed geometric point; default is the nose. Store its full body position relative to the nose, reference length L and area S. Reference values are positive finite SI quantities; coefficients never imply their values. A1 chooses `S=πD²/4`, `L=D`, where D is the declared maximum external body reference diameter, fixed for the vehicle. Changing reference values is an explicit renormalization, not a physical geometry change.

`R_NB` maps B vectors to N; `R_BN=R_NBᵀ`. At G:

```
v_air_N = v_vehicle_N − wind_N
v_air_B = R_BN v_air_N
V = ||v_air_B||
q_inf = ρ V²/2
alpha = atan2(v_air_B.z, v_air_B.y)
beta  = atan2(v_air_B.x, hypot(v_air_B.y, v_air_B.z))
incidence = atan2(hypot(v_air_B.x,v_air_B.z), v_air_B.y)
```

Angles/rates are radians and radians/second internally. `q_inf` never means pitch rate. Rate vector is `omega_B=(q_pitch,p_roll,r_yaw)`; named scalar aliases must retain this permutation. Use reduced rates `omegaHat_B=omega_B L/(2V)` when a provider declares that normalization. Any imported derivative with another length or factor must be converted explicitly.

At V=0, flow angles, wind basis and reduced rates are undefined: return null with a reason, not fabricated zero-valued observations. Static coefficient limits at zero incidence/Mach may be queried through a distinct coefficient-limit API; zero dynamic pressure yields zero dimensional static aero loads. At V=0 and zero rates the load adapter can return a supported zero-dimensional-aero-load result with unavailable flow coefficients; it must not prevent initialization merely because angles are undefined. A provider with rate-dependent dimensional loads at V=0 needs its own model; dividing by V is prohibited. Nonfinite state is an error. Tail-first or lateral-only flow is outside A1's support.

Input flow is evaluated at G. Imported data using another velocity reference point P must declare it. For ground-relative rigid-body velocity, `v_P=v_G+omega×(r_P−r_G)`. For air-relative velocity the same formula assumes spatially uniform wind; otherwise also subtract `wind(P)−wind(G)` after expressing all vectors in the same frame. Angles/rates must use the declared velocity station. Translating a moment reference alone does not perform this kinematic conversion. Uniform-flow, zero-rate static tests avoid the distinction. E1 supplies wind **toward** components in ENU; meteorological wind-from is converted once at input. For wind-from north, wind_N points south. The current UI already says “Wind from”; no 180-degree physical reversal is proposed.

## 2. Total forces and exact wind transformation

The canonical result is total aerodynamic force coefficient `CF_B=F_aero_B/(q_inf S)`. Convenience body scalars have explicit signs:

```
CA = −CF_B.y        // aft axial force positive
CN_pitch = −CF_B.z  // opposing positive alpha positive
CN_yaw   = −CF_B.x  // opposing positive beta positive
```

These are **total** body components. A separately computed wind drag must not be added again to a force already assembled from total CA/CN. Gravity and thrust are not aerodynamic coefficients.

Define the right-handed wind basis expressed in B, using `sa=sin(alpha)` etc.:

```
eXw = (cb, −sb*ca, −sb*sa)
eYw = (sb,  cb*ca,  cb*sa) = v_air_B/V
eZw = ( 0,     −sa,      ca)
R_BW = [eXw eYw eZw]       // columns; determinant +1
CF_W = (CY_wind, −CD_wind, −CL_wind)
CF_B = R_BW CF_W
```

Consequently the explicit body-to-wind output required by the existing normative contract is:

```
CY_wind = cb*CF_B.x − sb*ca*CF_B.y − sb*sa*CF_B.z
CD_wind = −sb*CF_B.x − cb*ca*CF_B.y − cb*sa*CF_B.z
CL_wind = sa*CF_B.y − ca*CF_B.z
```

Wind side force CY has a signed +Xw direction; it is not the same quantity as body `CN_yaw`. For beta=0: `CD=CA cosα+CN_pitch sinα` and `CL=CN_pitch cosα−CA sinα`. The identity `F·v_air=−q_inf S V CD_wind` must hold for the full aerodynamic force. A `CD0` is explicitly the zero-incidence limit; it cannot be mislabeled as total finite-incidence CD.

## 3. Independent moments, rates and optional CP

Providers return `CM_static_O_B=M_static_O_B/(q_inf S L)` independently of CF, and separately return any rate-dependent force/moment increments. Static includes rate-independent cant effects when supported; A1 excludes cant. Rate increments are defined by subtracting the provider's zero-rate evaluation at the **same** translational flow/geometry/power state. They need not be linear and need not be a pure damping couple. If a provider uses a derivative matrix, store its row/column ordering, rate normalization and velocity reference point; do not silently assume all rate terms dissipate energy or that cross coupling is absent.

For each physical force contribution, translate to G exactly:

```
M_G = M_O + (r_O−r_G) × F
CM_G = CM_O + ((r_O−r_G)/L) × CF
```

Translate static and rate components consistently, then add them. Pure couples are invariant under translation. For nose O and centerline G, `r_O−r_G=(0,xG,0)`. For axisymmetric small-angle normal sums `C=ΣCi`, `J=ΣCi xi`:

```
CF_B = (−C*beta, −CA0, −C*alpha)
CM_static_nose_B = (J*alpha/L, 0, −J*beta/L)
M_G.x/(q_inf S) = (J−xG*C)*alpha
M_G.z/(q_inf S) = −(J−xG*C)*beta
```

J has units m/rad; C has units 1/rad. Neither signed component/group cancellation nor negative total C permits deletion of J. The candidate can propagate finite force/moment when CP is undefined; this is a deliberate change from the legacy CP-times-force guard, requiring A1 failure-path review. A negative slope is not automatically a numerical error. Instability is a physical classification, not an undefined arithmetic operation.

CP is diagnostic and optional, never a prerequisite to calculating moments. Distinguish:

- **Derivative CP:** for a symmetric zero-incidence state about centerline datum station xO, `xCP_pitch=xO+L*(∂CMx/∂alpha)/(∂CN_pitch/∂alpha)`, `xCP_yaw=xO−L*(∂CMz/∂beta)/(∂CN_yaw/∂beta)`.
- **Finite-force equivalent station:** the corresponding ratio of static moment to normal force at a stated finite alpha/beta; label it an equivalent station if residual free couples or mixed incidence prevent a single force application point.

A single scalar CP requires compatible pitch/yaw centers and the stated centerline/no-independent-couple interpretation. In arbitrary 3D loading there need not be one. Damping, thrust and gravity are excluded. A zero denominator or nonfinite ratio returns null/reason while retaining moments and derivatives. For every finite nonzero denominator A1 returns only a diagnostic ratio plus C, J, sums of absolute contributions and `kappa_C=sum(abs(Ci))/abs(C)`; this is not an assurance that its digits are reliable. If a supplied numerical/physical denominator uncertainty interval contains zero, return the station as unresolved rather than a bounded qualified CP. With no uncertainty evidence, its accuracy remains unqualified. A1 must not reuse the legacy `C>=1e-4` force-evaluation guard or introduce an undocumented “well-conditioned” cutoff. Any later display-suppression cutoff is a separately versioned numerical policy; no empirical tolerance is set here.

The zero-incidence pitch/yaw restoring measure for the symmetric baseline is `K=J−xG C`; K>0 has the restoring sign under these axes, K<0 the destabilizing sign, K=0 neutral at first order. A margin/frequency must not be called stable merely because a CP number exists. Dynamic-frequency qualification additionally needs inertia and rate evidence outside P0.

## 4. Frozen provisional A1 method: SB1, not empirical acceptance

**Selection.** A1 implements `static-body-total-SB1/1.0.0`: an independently written small-angle, component normal-force/moment method and explicit zero-incidence axial-provider adapter. It does not reuse the existing component formulas under a new label. Its literature basis is the inspected [OpenRocket 13.05 technical document](https://openrocket.sourceforge.net/techdoc.pdf), §§3.1–3.2: body integration (3.18),(3.24),(3.25); fin MAC (3.30)–(3.34), finite-fin slope (3.40), equal-spacing sum (3.53), and fin/body factor (3.55),(3.56). This is a published engineering approximation. The [Barrowman primary thesis](https://ntrs.nasa.gov/api/citations/20010047838/downloads/20010047838.pdf) synopsis supports its slender axisymmetric small-angle provenance and explicitly excludes transonic analysis; a complete independent audit of every original thesis equation is not claimed.

**Geometry and symbols.** A1 initially accepts a sharp-nosed slender axisymmetric body, circular cross sections, smooth nose/transition profiles and **one** set of three or four identical equally spaced, thin, uncanted trapezoidal fins. `s` is exposed root-to-tip semispan outside the body; `r_t` the local body radius; `d=2r_t`; `D` the reference maximum diameter (may differ from d). `A_fin=(cr+ct)s/2` is one exposed fin's one-sided planform area. `m` is axial tip-leading-edge sweep from root leading edge; `cosGamma=s/sqrt(s²+(m+(ct−cr)/2)²)` uses the **midchord** line. These definitions are not interchangeable with tip-to-tip span, body radius, fin count or reference area.

The independent implementation target is:

```
Body interval [x0,x1], A(x)=cross-sectional area:
  C_body = 2*(A(x1)−A(x0))/S
  J_body = 2*(x1*A(x1)−x0*A(x0)−integral[A(x) dx,x0..x1])/S

Fin set, b=sqrt(1−Mach²) (not sideslip beta):
  C_one = (2*pi*s²/S) / (1+sqrt(1+(b*s²/(A_fin*cosGamma))²))
  K_fb  = 1+r_t/(s+r_t)
  C_finset = K_fb*(n/2)*C_one
  x_fin = xLE + m*(cr+2ct)/(3*(cr+ct))
                   +(cr+ct−cr*ct/(cr+ct))/6
  J_finset = C_finset*x_fin
  C = sum(C_body)+C_finset; J=sum(J_body)+J_finset
```

Body integrals avoid undefined component CP for equal endpoint areas; preserve a finite J when C cancels. Use the actual profile, not a shape-name CP constant. Integration/quadrature error needs its own A1 convergence evidence. Fin pressure station uses a fixed quarter-MAC approximation. The source technical document printed p27 describes aft motion beginning around Mach0.5; deliberately retaining quarter-MAC over Mach0.5–0.8 is an SB1 simplification and discrepancy to measure, not a complete transcription of that source CP method. SB1 uses the stated fin-in-body factor, omits the separately induced body force and does not add the existing unverified `0.45*cr` station. It also excludes viscous crossflow, roll-dependence corrections and interacting multiple fin sets. Their absence is model discrepancy, not proof of insignificance for every rocket.

**Potential legacy normalization difference to review, not an isolated correction order.** At `aero.rs:1043–1076` the current single-fin expression uses `2π(s/D)²`, then applies separate fin/body contributions; SB1 uses the explicit `2πs²/S` single-fin expression above and only its declared factor. With S=πD²/4 these prefactors differ algebraically. Before describing this as a legacy bug, the independent reviewer must check the original per-fin definition, body/reference diameters, fin count and interference formulation as a complete model. P0 specifies the new convention; it does not establish which legacy flight error this difference explains.

**Computational experiment support.** Freeze A1 to `0<=Mach<0.8`, forward flow and `incidence<=5 degrees` for the initial **candidate evaluation**. The Mach split follows the method document's regime convention; the 5-degree cap is a deliberately limited project experimental policy, not a literature-derived validated linearity threshold. It may require narrowing after matched data. It does not narrow the eventual collegiate mission objective. Derivatives mean alpha=beta=0; linear continuation `CN_pitch=C alpha`, `CN_yaw=C beta` is a first-order approximation, not the sine law or finite-alpha qualification. Unsupported geometry/Mach/incidence returns a reason and no SB1 coefficients; no automatic blend/fallback to the legacy law. Existing four-flight comparisons must disclose any resulting early stop or noncomparable interval rather than silently finish with another provider.

**Axial choice frozen for A1.** Use `CA=CA0=CD0` independent of incidence in this limited candidate as a leading-order approximation. The adapter's default `CA0` comes from the existing zero-incidence powered/coast drag provider under the explicit ID `legacy-zero-incidence-drag25`; source input, Mach grid and existing environmental assumptions are recorded. This retains its known limitations rather than pretending the complete model is source-qualified. E1 changes local Re through a new identified axial-provider version. T1 can supply qualified CA0 independently. Total finite-angle wind drag is calculated by §2, not retained equal to CD0. A2 compares finite-angle axial extensions and higher-Mach laws against independent CN/CA/Cm; it cannot select a CP-only correction by apogee fit.

SB1 is a **static** model, qualified for no rate-dependent prediction. A1 may compose it with the existing named legacy rate-couple provider for diagnostic whole trajectories only, but must expose the composite identity and UNKNOWN dynamic qualification. Zero-rate component experiments are authoritative for checking SB1 implementation. No new damping, cant or variable-mass claim is authorized here.

## 5. Provider result and status contract

```
Spec: schemaVersion, providerId/version, geometryHash, sourceEquationIds,
  S_m2,L_m,D_m,datumPositionFromNose_B_m,velocityReference,
  axes/signs/angle/rate definitions, modelSupport, empiricalEvidenceIds,
  interpolationPolicy, assumptionIds, axialProviderId, rateProviderId
Input: relativeVelocityAtCG_B_mps, omega_B_radps, Mach,rho,T,mu,
  cgPositionFromNose_B_m, power/nozzleCondition, environmentIdentity
Output: CF_static_B,CM_static_O_B,CF_rate_B,CM_rate_O_B,
  windCoefficients, dimensionalForce_B,dimensionalMoment_G_B,
  derivativesAtSpecifiedState, component C/J or force/moment breakdown,
  optionalCPDefinitions/conditioning, computationalStatus,
  empiricalQualificationByQuantity, assumptionIds,inputIdentity
```

Do not require full-state derivatives from a sparse supplied provider that lacks them; null is distinct from zero. Computational status distinguishes supported evaluation, unsupported model domain and invalid/nonfinite input. Empirical qualification is separate and initially unqualified for SB1. Missing coefficients must not become zero or a PASS. Gravity/thrust/recovery assembly remains outside this airframe provider. Reference conversion preserves dimensional F and M; imported coordinates with different handedness or moment conventions need a documented full basis/sign transform, not relabeled fields.

## 6. Migration and calibration

Legacy `flight-signed-normal-plus-wind-drag-v1` remains reproducible, including its signed-sum guard, Mach treatment and global airframe calibration semantics. Existing projects without an explicit aerodynamic provider map to that legacy identity; reading/saving must not activate SB1. Preserve original inputs/results and expose explicit migration producing a new run/model identity and a coefficient/output difference report. Compatibility serialization must not rewrite historical predictions.

A prior coast calibration multiplier is bound to its old engine/model, geometry, estimator/selector, observation support and conditions. It must not transfer automatically to SB1 or a new E1/T1 provider. On migration retain it as historical and mark inactive/stale for the new provider. A new explicit refit/apply can create a new artifact after eligibility review; improved apogee is not its acceptance test. A coast-qualified correction applies only to its declared regime; global legacy application stays explicitly legacy. Coefficient edits, geometry, environment assumptions or input identities invalidate affected fit/prediction caches; no silent recalibration.

## 7. Concrete fixtures required of A1/T1, with no empirical tolerance implied

1. **Basis/energy:** alpha=beta=0 gives identity wind basis. At beta=0, alpha=30 degrees, CA=2 and CN_pitch=3 give `CD=sqrt(3)+1.5`, `CL=3sqrt(3)/2−1`; this is a transform fixture outside SB1's model domain. At arbitrary signed alpha/beta verify `RᵀR=I`, det=+1, round trip and full-vector power identity.
2. **Moment translation:** with S=L=q_inf=1, nose moment `(6,0,−4)`, F=`(−2,−1,−3)` and xG=1, `M_G=(3,0,−2)`. Translating again to another datum and back must recover the original wrench. Adding a pure couple changes moment, not force.
3. **Signed cancellation:** C1=2 at x1=1 and C2=−2 at x2=3 yield C=0, J=−4. At alpha=0.01, beta=0, q_inf S=1, normal force is zero and pitch moment is −0.04 Nm at every centerline CG; CP is null. CA can remain finite.
4. **Body integrals:** cone from A=0 to A_b over l has C=2A_b/S, J=4A_b*l/(3S), derivative CP=2l/3. Cylinder has C=J=0 over its interval. A closed smooth area bulge with equal endpoint area can have C=0 and nonzero J. Expansion/contraction signs must not be filtered.
5. **Fin symbol normalization:** rectangular fin cr=ct=s=1, m=0, n=4, r_t=0.5, D=1 gives S=π/4; at Mach0, `C_one=8/(1+sqrt(2))`, K_fb=4/3, C_finset=(8/3)C_one, x_fin=xLE+0.25. This artificial geometry is an algebra fixture, not an SB1-supported slender rocket. Rotate an equally spaced 3/4-fin set and verify its linear sum; source area normalization must survive re-referencing S.
6. **Derivative independence:** changing CA0 alone leaves body CN derivatives and specified static moment derivatives unchanged; total wind coefficients change through the exact transform. Changing CG alone leaves datum force/moment unchanged and changes CG moment by translation. All ±pitch/±yaw signs must be tested.
7. **Reference scaling:** changing S to kS and L to hL rescales CF by 1/k and CM by 1/(kh), preserving dimensional force/moment and derived station. Rate derivatives must also account for their new reduced-rate normalization; do not apply only moment scaling.
8. **Statuses/migration:** V0, nonfinite state, domain boundaries, unsupported geometry, canceled CP, missing table moment, stale calibration and legacy save/reopen must retain explicit meanings. No unsupported coefficient may enter a valid load step. Identity/conditioning fixtures use justified floating-point tolerances; physical acceptance requires later measured evidence.

## 8. Ownership and independent approval

P0 owns this contract and its schema/sign decisions. A1 owns a new core coefficient module, its analytic fixtures and the single load/plot adapter; its reviewed integration commit is the only initial editor of shared `six_dof.rs`, `aero.rs` dispatch and engine `models.rs` preparation boundaries. Do not separately reimplement the new physics in TS: if a TS compatibility consumer is necessary, it consumes the normalized DTO or is explicitly an implementation check, never a second authoritative physical model.

E1 owns environment profile normalization/evaluation and friction environmental inputs in separate modules. It supplies rho/T/mu/Mach and immutable profile identity; it does not edit force axes or moment assembly. T1 owns import parsing, table interpolation/coverage and reference conversion in separate modules against P0. It does not derive missing CN/Cm/damping from CD, change provider defaults or edit loads. A1 integrates E1/T1 interfaces sequentially at pinned heads; shared DTO edits have one named owner per commit. Geometry/rates/source-domain expansions belong to later A2/M1 packets, not opportunistic schema changes.

Independent reviewer must check the full 3D matrix and signs, rate/velocity station definitions, source equation transcription and symbol map, moment/CP distinction, stated candidate support policy and migration behavior. Source equation implementation must be independently written from public mathematics; do not copy GPL engine code or restore closed/vendor components. Author/source document licensing and empirical evidence status remain separate. Acceptance of P0 authorizes its bounded implementation specification, **not physical accuracy, new outcomes, flight authorization or a production switch**.
