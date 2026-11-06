# RMP08 equation verification worksheet — C02/C05/C06 limits

Computational/equation verification only; **not** empirical qualification,
production model change or global PASS. Author-independent coordinator review
accepted the bounded scope with recorded corrections (see `REVIEW.md`).

## Source identities actually inspected

The original public source was retrieved and inspected for this lane; this is
not a citation-only claim.

| Artifact | Identity |
| --- | --- |
| OpenRocket 13.05 technical documentation, <https://openrocket.sourceforge.net/techdoc.pdf> | SHA-256 `cc6fd3291ade76ee044ffd40ff285cf814c7496b97d1ff7b35222d8f2d23cf8c` — matches the retained-source hash recorded in `P0-independent-review.md` |
| Local extraction (`pdftotext -layout`/`-raw`) | SHA-256 `4d91420ea2a41498179397ad1ece235b7acf3cdf87384c04be4da2c1dff04a70` (tool-version dependent, not the retained extraction hash) |
| Rendered page check | Printed p29 (PDF p38) rasterized and read for (3.39)/(3.40), resolving text-extraction ambiguity |
| Accepted P0 contract, working tree | SHA-256 `4121764cdacc33a9491dda86f67e01d0032aff33a069f4349a9d3744e3b506b5` — differs from the reviewed pre-adoption hash because of the owner's adopted-status annotation; the technical text was read in this working tree |
| Base commit | `82c595df544dcdb883ca2fe81274bff7c4664a50` |
| `aero_coefficients.rs` (after coordinator comment correction) | `73da11e497e2d234012f5903579ef74b407db2d87feead55bda1b6e68b19403c` |
| `aero_profiles.rs` (read-only) | `56db9ad8b62a194f4c54cf396e800bd4d7acc0b873c0175f6b996ac8fbb71c53` |
| `flight_provider.rs` (post-edit) | `68a68dcc039c636c55301400fad3805eb63a1786f5437a40482395d550673809` |
| `sb1_geometry.rs` (post-edit) | `b1d792a61ed83219fa0a15ac3bdba003207c42a54e2875f15bd35bf4dbc7918b` |
| `supplied_aero.rs` (read-only) | `7ef68a3c121ec4d0cf961460c8122626fbbea35ef02848a8fe0611ba5debd0ce` |
| Independent checker | `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-equations-rates/independent_check.py`, SHA-256 `676cd0e3e43d64dc1bab7cbb28b5958bfe9041954064f897c881f67575ab3b1d` |

No runtime vendor/GPL engine source was read or copied. No protected outcome was
opened. The OpenRocket implementation itself was not consulted; only the public
technical document and its printed equations.

## Symbol and unit map

| Symbol | Definition | Units |
| --- | --- | --- |
| `x`, `x0`, `x1` | station metres **aft of the nose** (not body Y; centerline point is `(0,-x,0)`) | m |
| `A(x)` | body cross-sectional area | m² |
| `S`, `L`, `D` | declared reference area, length and maximum diameter; canonical `S=πD²/4`, `L=D`; diameter is metadata | m², m, m |
| `s` | exposed root-to-tip semispan of one fin | m |
| `r_t` | local body radius at the fin station | m |
| `cr`, `ct` | root and tip chord | m |
| `m` | tip **leading-edge** axial sweep from the root leading edge | m |
| `Afin` | one exposed fin's one-sided planform area, `(cr+ct)s/2` | m² |
| `Γc` | **midchord** sweep angle; `cosΓc=s/hypot(s,m+(ct-cr)/2)` | rad |
| `n` | fin count; this model accepts exactly 3 or 4 identical equally spaced fins | — |
| `b` | compressibility factor `sqrt(1-Mach²)` (not sideslip `β`) | — |
| `C`, `Ci` | normal-force slope sum, `ΣCi` | 1/rad |
| `J`, `Ji` | normal-moment slope sum about the nose, `ΣCi xi` | m/rad |
| `CA0` | prescribed zero-incidence axial coefficient, incidence-independent in SB1 | — |
| `α`, `β`, `q∞` | flow angles and dynamic pressure | rad, rad, Pa |
| `ω_B` | body rate `(q_pitch,p_roll,r_yaw)` about body X,Y,Z | rad/s |
| `ω̂_B` | reduced rate `ω_B Lref/(2V)` | — |

Coefficient conventions: `CF_B=F/(q∞S)`, `CM_B=M_O/(q∞SL)`, total body signs
`CA=-CF.y`, `CN_pitch=-CF.z`, `CN_yaw=-CF.x`. `C` is per radian in the code's
first-order continuation; the source's finite-angle `sinα` factor is deliberately
not implemented (P0 §4, first-order approximation).

## C02 — source mapping and independent checks

### Body normal force and moment, source (3.18), (3.24), (3.25)

Source, for one interval and zero-angle derivative:

```
CN      = 2 sinα (A(l)-A(0))/Aref
Cm      = 2 sinα (l A(l) - ∫A dx)/(Aref d)
```

Candidate: `C_body=2(A1-A0)/S`; `J_body=2(x1A1-x0A0-∫A dx)/S`;
`CM_nose=J α/L`. With `S←Aref`, `L←d`, `sinα≈α`, these are the same
zero-angle slopes. The `x0 A0` term is the lower-station contribution; it is
present in the code and is required when an interval does not begin at the nose.

Independent derivation of `J` from `m(x)=xN(x)`:

```
J = 2/S ∫_{x0}^{x1} x A'(x) dx
  = 2/S [x A(x)]_{x0}^{x1} - 2/S ∫ A dx
  = 2 (x1A1 - x0A0 - ∫A dx)/S
```

Checks:

- Cone `A=4x²/9` on `[0,3]`, `S=1`: `C=8`, `J=16`; direct polynomial
  antiderivative `2∫x(8x/9)dx=16`. **PASS**.
- The same cone split at `x=1`: front `(C,J)=(8/9,16/27)`, rear
  `(64/9,416/27)`; sums equal the whole interval `(8,16)` exactly. This would fail if the
  aft interval dropped `x0A0`. **PASS** (code test
  `body_interval_partition_preserves_signed_normal_sums`).
- Smooth closed bulge `A=0.5+0.5sin²(π(x-1)/2)` on `[1,3]`: volume `1.5`,
  equal endpoint areas `C=0`, `J=-1`; Simpson integration of `2∫x A' dx` agrees.
  191-check independent script **PASS**.

`J` is an independent moment quantity. A cancelling `C` does not delete it, and
the implementation has no positivity or `C>=1e-4` filter. The `C=0` case returns
`CpUnavailable::ZeroDenominator` while retaining force/moment.

### Fin station, slope and interference, source (3.30)–(3.34), (3.40), (3.53), (3.55)–(3.56)

Transcription map:

| Source | Candidate |
| --- | --- |
| (3.30)–(3.32) MAC integrals for trapezoids | `x_fin = xLE + m(cr+2ct)/(3(cr+ct)) + (cr+ct-cr ct/(cr+ct))/6` |
| (3.34) station | `(cr+ct-cr ct/(cr+ct))/6 = (cr²+cr ct+ct²)/(6(cr+ct))` (exact identity) |
| (3.40) one-fin slope | `C_one=(2πs²/S)/(1+sqrt(1+(b s²/(Afin cosΓc))²))` |
| (3.53) equal spacing | `Σsin²(2πk/n+θ)=n/2` for `n≥3`; candidate multiplies `n/2` |
| (3.55)–(3.56) fin/body | `K_fb=1+r_t/(s+r_t)`; induced body force omitted as in source |
| (3.54) many-fin factor | `1` for the accepted one set of 3/4 fins |

Independent station check: compute `c̄=(1/Afin)∫c²dy` and
`xMAC,LE=(1/Afin)∫xLE c dy` for a trapezoid with
`c(y)=cr+(ct-cr)y/s`, `xLE(y)=m y/s`, then form `xMAC,LE+0.25c̄`; it equals
(3.34) and the code expression for rectangular, swept/tapered and inverse-tapered
cases. **PASS**.

Midchord versus leading-edge sweep. At semispan `y`, the chord midpoint axial
position is `xLE(y)+c(y)/2`. Between root and tip this increases by
`m+(ct-cr)/2`, so `cosΓc=s/hypot(s,m+(ct-cr)/2)`. A leading-edge definition
would use only `m`. The code test constructs equal-area rectangular
(`cr=ct=1`) and tapered (`cr=1.4`, `ct=0.6`) fins with **zero leading-edge
sweep**. The slope difference checks the midchord offset; their distinct MAC
geometry also changes the station. **PASS** (`fin_length_is_metadata_and_sweep_is_midchord_based`).

Independent derivation of (3.40) from (3.37)–(3.39). The rendered p29 equation
(3.39) is `FD = A / ((1/2π) CNα0 cosΓc) = Aβ/cosΓc` (the extracted text is
ambiguous; the rasterized page was inspected). With `CNα0=2π/β`, `A=2s²/Afin`:

```
(CNα)1 = CN0 FD (Afin/Aref) cosΓ / [2 + sqrt(FD²+4)]
       = (2πA Afin/Aref) / [2 + sqrt(A²β²+cos²Γ·4)/cosΓ]
       = (2π s²/Aref)/(1 + sqrt(1+(βs²/(Afin cosΓ))²))
```

Decimal 50-digit evaluation of (3.37)/(3.39) against (3.40) passes for
`(β,s,Afin,cosΓ,Sref)` including `β=1`, `β=0.8`, and a small-fin swept case.
**PASS**. The P0 algebra fixture gives `C_one=8/(1+√2)`, `K_fb=4/3`,
`C_finset=(8/3)C_one`, `x_fin=xLE+0.25` for `cr=ct=s=1`, `m=0`, `n=4`,
`r_t=0.5`, `D=1`; **PASS** in the independent checker and code fixture.

Source p27 states that the quarter-MAC station begins moving aft above
approximately Mach 0.5 and gives an interpolation to Mach 2. The accepted SB1
candidate deliberately keeps fixed quarter-MAC over its entire `0≤Mach<0.8`
support. This is a disclosed simplification and source-model discrepancy, not a
complete transcription of the source CP method, and not transonic evidence.

### Exact wind transform

Candidate `R_BW=[eXw eYw eZw]` with columns
`(cb,-sb ca,-sb sa)`, `(sb,cb ca,cb sa)`, `(0,-sa,ca)`.
Independent checks at signed angles: pairwise orthonormality, `det=+1`,
`eY` equals the unit air-relative velocity, projection/reconstruction round trip,
and `CD=-CF·eY=-CF·v̂_air`. The full force enters the power identity
`F·v_air=-q∞ S V CD`; no separate wind drag may be added after total `CF`.
At `β=0`: `CD=CA cosα+CN_pitch sinα`,
`CL=CN_pitch cosα-CA sinα`. The code keeps `CA0` as a zero-incidence axial input;
`CD` at finite incidence is a transform result, not `CD0`. **PASS** in the
existing transform fixture, the new evaluator fixture, and the independent
checker.

### Reference scaling, cancellation and pure couples

- `CF` scales as `1/k` and `CM` as `1/(k h)` when `S→kS`, `L→hL`;
  dimensional force/moment and derived station are unchanged. Existing
  `reference_scaling_preserves_loads_and_cp_with_full_datum` **PASS**.
- `M_to=M_from+(r_from-r_to)×F`; translating a pure couple changes nothing.
  Existing wrench and off-axis datum tests **PASS**.
- Signed cancellation `C1=2@x=1`, `C2=-2@x=3` gives `C=0`, `J=-4`, zero normal
  force and pitch moment `-0.04 N·m` at every centerline CG; CP is null. Existing
  fixture **PASS**.
- New evaluator fixture: linear area ramp plus closed bulge yields negative body `J`, a
  negative derivative CP station, a negative pitch moment for positive `α`, and
  the opposite-signed yaw moment for positive `β`; changing `CA0` changes only
  the axial body force, not the normal moment. This proves the signed
  contribution path survives end-to-end without a CP/positivity guard. **PASS**.

## C05 — rate semantics

Definitions carried in code/tests:

- Body rate order is `ω_B=(q_pitch,p_roll,r_yaw)` about body `(x,y,z)`.
- Flow is evaluated from the air-relative velocity **at the CG**
  (`relative_velocity_at_cg_b_mps`, `mech.rel_body`). No other velocity point is
  silently assumed; a provider using point `P` must declare it and apply
  `v_P=v_G+ω×(r_P-r_G)` (plus any wind difference).
- Reduced rates are `ω̂_B=ω_B Lref/(2V)`. New test uses `V=4`, `Lref=2` and
  nonzero signed rates on all three axes, asserting the exact `[0.125,-0.0625,
  0.25]` result; CG translation and zero airspeed do not fabricate a value.
- The rate increment is the provider's separately added moment after subtracting
  its zero-rate static evaluation at the same flow/geometry/power state. SB1
  returns `rate_coefficients_at_datum=None` even for nonzero rates (missing, not
  zero). New composition assertion verifies
  `aero_moment = static_CG_moment + rate_couple`.
- The selected inherited `legacy-dimensional-rate-couple/1.0.0` is a dimensional
  pure couple using vehicle length and body radius:

```
M_rate.x = -0.5 ρ V S Lveh² 1.5 q
M_rate.y = -0.25 ρ V S rbody² 4.0 p
M_rate.z = -0.5 ρ V S Lveh² 1.5 r
F_rate   = 0
```

  It is not the SB1 reference length `D` and not a source-normalized derivative
  matrix; its formula establishes no real damping. Zero airspeed with nonzero
  rate is refused; zero airspeed with zero rate is a supported static-initialization
  status with null flow/coefficient/reduced-rate observations and zero static
  dimensional loads. The supplied static diagnostic additionally requires
  `β=0` and all rates exactly zero, and returns null rate/derivative/CP fields.
- Reference renormalization of a **source-normalized derivative matrix** was
  derived but cannot be exercised in code because no such matrix exists:
  `CM'=CM/(k h)` and `ω̂'=h ω̂` imply
  `∂CM'/∂ω̂' = (1/(k h²)) ∂CM/∂ω̂`. Numeric Decimal check **PASS**. This is an
  explicit open representational gap, not evidence that the inherited couple is
  source-normalized.

## C06 — geometry refusal

The actual `FrontendVehicle` adapter was exercised with typed DTOs. New test
`rejected_adapters_leave_the_input_vehicle_identical_and_localize_the_component`
rejects, and asserts `serde_json` serialization is identical before/after plus
the failing component identity:

| Rejection | Localized component |
| --- | --- |
| multiple fin sets | `second-fins` |
| fin count 2 (only 3/4 supported) | `fins` |
| unknown nose profile `parabolic` | `nose` |
| unknown fin cross-section `diamond` | `fins` |
| fin root not wholly on host / attachment gap | `fins` |
| body axial offset/gap | `tube1` |
| unsupported component kind `attachment` | `tube1` |
| unknown transition shape `ogive` | `taper` |
| non-converged tight ogive quadrature (panels=8) | `nose`, `profile_error=NonConverged` |

**PASS**. Existing tests already cover freeform points, motor-mount ambiguity,
duplicate IDs, conflicting profile fields, missing explicit dimensions and
declaration refusal; no feature support was invented. The typed serialization
test does not claim raw-JSON completeness: unknown raw fields may already have
been discarded before this DTO boundary (disclosed adapter limit).

## C07 — dispositions, exclusions and budgets

| Check | Disposition | Bounded scope | Open requirement |
| --- | --- | --- | --- |
| C02 source map | **PASS (computational/algebra)** | P0 static SB1 equations, analytic fixtures, exact transforms, reference scaling, cancellation | empirical validation; finite-angle sine law; body-lift/roll/viscous-crossflow; transonic CP movement; real-profile quadrature error; source licensing audit |
| C02 quarter-MAC | **DISCLOSED SIMPLIFICATION** | fixed quarter-MAC across `0≤Mach<0.8` | source-justified Mach-dependent CP law and matched data before any >0.5 claim |
| C05 rate definitions | **PASS (computational/semantic)** | ordering, CG velocity, reduced-rate normalization, additive static+couple, V0 null/refusal, supplied zero-rate gate | no source-normalized derivative matrix exists; inherited couple is unqualified and dimensional-only |
| C06 refusal | **PASS (computational)** | actual typed adapter, serialization non-mutation, component localization, retained non-convergence report | raw-source validation, physical geometry assertions, real profile integration evidence |
| C07 development limits | **RETAINED** | no fitting, holdout access, calibration transfer or apogee correction performed | development comparisons and numerical budgets remain RMP12/RMP13 work |
| Empirical qualification | **UNQUALIFIED** | no measured data used | requires matched measurements and independent scientific review |
| Dynamic qualification | **UNKNOWN** | static plus inherited couple only | damping/rate evidence absent |
| Global RMP08 | **NO PASS CLAIMED** | C02/C05/C06 bounded verification only | coordinator review/integration; C03/C04/C08 not claimed here |

Numeric constants used by tests/policies (relative `2e-12` f64 roundoff,
quadrature `1e-14/1e-10`, `64·EPSILON` CP/area policies, `1e-6` aero-negligibility)
are numerical conditioning/roundoff rules, not accuracy budgets or empirical
tolerances. No failure was weakened or deleted. No red-first result was observed
because the new tests were written against already-implemented signed behavior;
existing failures were not present in this lane.

## Commands and observed results

All native, offline, two jobs, isolated target
`/home/ak/.paseo/worktrees/3s8t98rp/target-rmp08`:

- `cargo test ... --lib aero_coefficients::tests`: **17 passed** (184 filtered).
- `cargo test ... --lib flight_provider::tests::signed_rate_couple`: **1 passed**.
- `cargo test ... --lib` (core): **201 passed**.
- `cargo test ... --lib sb1_geometry::tests`: **7 passed** (35 filtered).
- `cargo test ... --lib` (engine): **42 passed**.
- Throwaway native example (`adapt_frontend_vehicle` + `evaluate_static` + JSON
  rejection): `SMOKE PASS`, observed `CD=0.302598773`, `CL=0.146265548`,
  `omegaHat=(0.00005,-0.0001,0.00015)`, `rejected_component=Some("second-fins")`,
  `input_unchanged=true`. Scaffold deleted before commit.
- Independent checker: `INDEPENDENT CHECKS PASS: 191`.

Raw logs: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp08-equations-rates/`.

## Limits that remain

The static body equations are an engineering approximation; the source itself
warns that body lift and roll effects can matter. The 5° incidence and
`Mach<0.8` limits are project computational policy, not measured validity.
Quarter-MAC above approximately Mach 0.5 is deliberately omitted. The inherited
rate couple is not a source-normalized derivative model and its numerical
formula does not establish damping. Geometry declarations remain caller
assertions; area-integral representation cannot prove interior smoothness,
slenderness, local radius agreement or real quadrature convergence. No measured
aerodynamics, flight outcome, default activation or release claim follows.
