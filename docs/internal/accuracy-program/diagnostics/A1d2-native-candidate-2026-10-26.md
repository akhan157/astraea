# A1d-2: native candidate trajectory, load query and curves

Date: 2026-10-26. Packet RMP01. Dispatch base
`c80e7d356fe0a777bd793c56815388960ea597c7`; run record
[`RMP01-20261026`](../../execution-runs/RMP01-20261026/RUN.md). Status:
**implemented, locally evidenced and independently reviewed (ACCEPT after two
focused rework rounds; disposition and findings are in the run record)**. This is a bounded native diagnostic, not an
empirical qualification, an as-flown model, a default or a released product
model. No dispatch command, project field, GUI option, WASM asset or migration
was added.

## What exists

One immutable `PreparedCandidate` consumes:

- the accepted SB1 geometry from `sb1_geometry::adapt_frontend_vehicle` (real
  engine DTO, no geometry defaults), its explicit `References` (S, L, D) and a
  full moment datum,
- an explicit prescribed `CA0` with provider and input identity,
- an explicit mechanical carrier (dry mass, CG, length, reference diameter,
  motor aft station, declared recovery) taken from the existing mass rollup and
  motor primitive,
- a declared retained-legacy environment (ISA-1976 density/sound speed and the
  power-law wind) and declared source/provenance strings,
- the explicit rate policy `legacy-dimensional-rate-couple/1.0.0`.

Three consumers share that object and `aero_coefficients::evaluate_static`:

1. `run_bounded` through the shared A1d-1 driver (`six_dof::drive_candidate`);
2. `query` at any supplied rigid state/time/flags;
3. `curves`, a static Mach sweep at a reference state's altitude and flow
   direction.

The result type (`astraea-bounded-candidate-result/1.0.0`) is separate from
`SimulationResult`: no legacy validity/PASS string, termination is
`TimeLimit` or `Touchdown`, landing evidence exists only after a completed
touchdown, and prefix maxima are labeled committed-sample observations rather
than a predicted apogee.

## Composition, frames and signs

- Body B is right handed with +Y noseward; navigation is ENU; `R_NB` maps B to N.
  Air-relative velocity is ground velocity minus toward-ENU wind, rotated to B.
  The static law, `alpha`/`beta`/incidence construction and the wind transform
  are the accepted core (`aero_coefficients`), not re-implemented here.
- The static wrench returned about the prepared datum is translated once to the
  instantaneous CG with `M_G = M_O + (r_O−r_G)×F` and dimensionalized once by
  the prepared references. The force is total body force: no wind drag is added
  after it. Gravity and thrust remain identified mechanical terms added by the
  composition; the driver projects rail force and zeros rail moment exactly as
  in the legacy path.
- The inherited rate couple is shared with the legacy assembly
  (`six_dof::legacy_dimensional_rate_couple`), body order `(pitch, roll, yaw)`:

  ```
  pitchDamp = 0.5*rho*V*S*Lvehicle*Lvehicle*1.5*omega.x
  yawDamp   = 0.5*rho*V*S*Lvehicle*Lvehicle*1.5*omega.z
  rollDamp  = 0.25*rho*V*S*rbody*rbody*4.0*omega.y
  M_rate_B  = (-pitchDamp, -rollDamp, -yawDamp),  F_rate_B = 0
  ```

  It is a dimensional pure couple using vehicle length and body radius, not the
  SB1 coefficient length `D`; the formula does not establish real damping.
  Static diagnostics never acquire it: `curves` excludes rates, and a query with
  rates reports the static coefficient/moment fields unchanged plus a separate
  rate moment.
- A live declared canopy disables the airframe branch. The declared constant
  canopy drag (`q * (π/4)d² * Cd` along −v̂) plus the same rate couple is used;
  airframe coefficients, derivatives and CP are `null` with reasons. Canopy
  evaluation refuses Mach > 1.0 instead of inheriting the legacy
  extrapolation. A canopy does not excuse an earlier unsupported ascent query.
- The candidate drag scalar is `−F_aero · v̂` (body vectors), distinct from a
  static total coefficient and from canopy drag.

## Support, refusal and numerics

- Forward flow, `0 ≤ Mach < 0.8` and incidence ≤ 5° are enforced at every
  evaluation, including speculative adaptive stages, rail-bound states and
  negligible-force states. There is no rail/negligible-force waiver, no blending
  and no legacy fallback. Unsupported geometry fails at preparation.
- Cant must be exactly 0°; a historical airframe drag scale must be omitted or
  exactly 1.0. No calibration, fit or CP-based drag table is consumed or
  transferred; the result records the `no-historical-calibration/1.0.0` policy.
- `V = 0` with zero rates returns zero dimensional static loads with absent flow
  angles/coefficients (undefined, never fabricated zeros). `V = 0` with nonzero
  body rates is refused: no separately identified zero-speed rate model exists.
- `candidate-aero-negligibility/1.0.0`: when the maximum possible static
  aerodynamic force at the evaluated state, conservatively
  `q_inf S (|C| + CA0)` with `|sin(alpha)| <= 1` (or the declared canopy
  `q_inf S_cd Cd`), is at most `1e-6` of the instantaneous weight, load
  composition substitutes zero dimensional aero loads and reports no
  flow/coefficient observation (the direction of a velocity that cannot produce
  a measurable force is not evidence). The substitution error is bounded by the
  same relative force bound, and every state above the bound is fully
  support-checked, so the policy cannot admit a meaningful reverse/off-axis
  flow. Exactly-zero airspeed keeps its distinct zero-speed status. Curve points
  carry an explicit caller direction and report the same bound per point while
  retaining static coefficients. This is a declared numerical load
  approximation, not an empirical or domain waiver. It is required because the
  legacy rail clamp and adaptive stage combination can produce a micrometre-
  scale reverse velocity component at the pad while the committed state is at
  rest.
- `near-unit-quaternion/1.0.0`: query, curve and trajectory composition accept
  only finite attitudes with `| |q| - 1 | <= 1e-6`, normalize them once, and
  refuse anything else instead of silently using a nonorthogonal frame (the
  shared integrator has the same entry requirement).
- The retained ISA-1976 atmosphere is enforced at the instantaneous altitude
  (`0..20 km ASL`), not only at the declared launch altitude.
- Candidate motor preparation additionally refuses nonfinite/nonpositive motor
  masses, a negative max thrust and a nonfinite/nonpositive integrated thrust
  impulse before the shared mechanical primitive can reach a legacy panic; the
  legacy validator itself is unchanged.
- Mechanical/motor placement, diameter/length and the declared carrier
  length/diameter are validated before any kernel assertion. Nonfinite state,
  time, rate or degenerate quaternion input is refused as `InvalidInput`.
- An evaluation failure aborts the run and carries a structured record: model
  and composition ID, phase label, `speculative` flag, stage time, deployment/
  rail flags, the rigid state and the reason. A speculative record is not a
  localized committed crossing.

## Shared-driver bridge and legacy preservation

`six_dof.rs` gained only: `pub(crate)` visibility for the A1d-1 seam, an
arithmetic-preserving extraction of the mechanical/flow carrier
(`stage_mechanics`), the canopy selection/law and the rate-couple expression now
shared by the legacy assembly, and a candidate-only exact-horizon bridge
(`drive_candidate`). The legacy public wrapper keeps its `t += dt` loop and
300 s horizon; the candidate clamps only its own last bracket and stops after the
state at the requested time is committed, so reported time and committed state
cannot disagree and no stage is evaluated past the stop.

Extraction is not a physical change: the retained synthetic Estes Alpha/C6
telemetry-parity request produces a byte-identical response before and after
(1 969 393 bytes, SHA256
`f37d195fc903e3599603706a9e3f6b95b152d7a79b4639a31f50fa4f64972249`), including
after the provider, engine helper and horizon bridge were added.

The prepared carrier's legacy slope/CP/drag fields are overwritten with NaN, so
any accidental consultation would poison the trajectory instead of returning a
plausible legacy number. A test additionally proves that absurd finite legacy
carrier values and NaN values produce identical candidate trajectories.

## DTO path and its actual blocker

The native helper (`astraea-engine/src/native_candidate.rs`) runs the real
`FrontendVehicle` through the existing adapter and the existing mass rollup, and
compares nothing at runtime with `models::prepare_flight_vehicle` (which is
CP-dependent and therefore not used). A test-only comparison confirms that the
candidate carrier's dry mass, CG, length, reference diameter, motor station and
recovery fields equal the legacy mechanical preparation for the same DTO.

The existing SB1 adapter refuses a DTO that flags a motor mount
(`motor-mount internal/external topology ambiguous`). The native fixture
therefore declares the motor aft station explicitly, and the core preparation
validates it against length, forward-end and diameter. Reproducing the legacy
mount bore/retention resolution inside a candidate-preparation adapter remains an
explicit later extension (RMP06/RMP07 scope), not a silent guess.

The synthetic fixture is a declared cone/cylinder/four-fin vehicle with declared
synthetic mass/recovery, a prescribed constant CA0 and the certified Estes C6
thrust record; the still-air environment is declared. It is not as-flown
geometry, a source export or empirical evidence.

## Evidence summary

- Core: 170 tests pass offline (154 retained, 16 candidate, 1 driver-horizon).
- Engine: 65 tests pass offline `--all-targets` (61 retained, 4 native-candidate
  boundary tests). Examples compile.
- Native example on the committed fixture: bounded 2.0 s ascent, 201 committed
  samples, rail departure 0.5057 s, burnout 1.86 s, time-limit termination, no
  landing/apogee claim, observed-prefix peak altitude 32.1 m, maximum Mach
  0.068, maximum incidence 0.48°; direct query and static curve reproduce the
  committed sample's static coefficient wrenches bit for bit.
- Evidence locations, hashes and per-check status are in the run record's
  `EVIDENCE.json`; raw logs/outputs are in the external evidence directory.
- Independent read-only review (Codex CLI/GPT-6): pass 1 ACCEPT WITH REQUIRED
  FIXES (aero-negligibility policy, motor validation, attitude policy,
  instantaneous altitude, parachute completeness); pass 2 resolved four of five
  and raised three canopy-specific defects; pass 3 ACCEPT with no new findings.
  The reviewer ran no builds/tests; the coordinator re-ran both suites and the
  byte-identical legacy snapshot after every fix.

## Limitations that remain

SB1 is a small-angle static method; the composite dynamics are UNKNOWN and the
empirical qualification is unqualified. The mechanical carrier is the legacy
primitive mass model, not measured data. The retained atmosphere/wind are
identified assumptions, not qualified weather. Axial drag is a prescribed
constant CA0, not a qualified source. Canopy recovery, unsteady/transonic/rate
physics, source-specific qualification, as-flown/team/platform evidence, project
identity/migration, GUI exposure and the WASM asset are untouched. A time-limited
prefix has no landing and its highest sample is not a predicted apogee.
