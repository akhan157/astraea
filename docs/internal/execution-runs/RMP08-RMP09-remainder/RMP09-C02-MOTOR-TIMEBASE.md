# RMP09-C02 — motor, mounting/pressure and timebase record

Status: **record only.** No thrust curve, fixture, motor database or production
code was edited. This is not a flight-motor qualification.

## Requirement

RMP09 packet C02: “Actual thrust curve, mounting/pressure assumptions and
ignition/liftoff/burnout clock conventions recorded; no alignment to improve
outcome.”

## Certified-curve record (application source)

- File: `src/propulsion/motorDatabase.ts`, SHA-256
  `1773e9a092e52fbaeec2a8792bd932002806c26393a8cf5b96d09f52bbfab9a3`.
- Entry `estes_c6` (`:52–99`): Estes C6, declared `totalImpulse: 8.8`,
  `burnTime: 1.86`, `maxThrust: 14.09`; 25 points = 24 tabulated points plus
  the `(0, 0)` ignition anchor.
- Recorded provenance comment (`:68–71`): certified NAR static-test curve via
  ThrustCurve.org, motorId `5f4294d20002310000000015`, RASP simfile source
  `cert`, simfileId `69eb2379c7d63000021d8c29`, profile
  `https://www.thrustcurve.org/motors/Estes/C6/`.
- Independent stdlib trapezoid integration of the committed 25 points:
  **8.8172 N·s** (declared 8.8; +0.2 %, consistent with tabulated rounding),
  final time exactly 1.86 s, maximum 14.09 N. This is a read-only record
  check, not a committed test.

## Identified provenance defect: fixture called “certified”

- File: `crates/astraea-engine/tests/fixtures/native-candidate-request.json`,
  SHA-256
  `ea853d96452372c9b662b9111cb56bd6ea510990adc16e24afdf691cac375a50`.
- The fixture’s motor is designated “Estes C6”, `burnTime 1.86`,
  `maxThrust 14.09`, but its curve has 22 points and differs from the certified
  record: at `t=0.139` thrust is **7.004 N** (certified **9.936 N**), at
  `t=0.192` it is **11.094 N** (certified **14.09 N**); the peak is at 0.209.
  Its trapezoid integral is **8.733 N·s** vs 8.8172 N·s certified.
- The test header (`native_candidate.rs:5–7`) calls this “the certified Estes C6
  thrust record.” On the committed bytes that claim is not true.
- Disposition: recorded only. The fixture is **not** renamed, edited or
  “fixed”; no thrust curve was changed. Coordinator/owner must decide whether
  the fixture is a deliberate resampling, a stale record, or a label defect.

## Other motor records (synthetic, not certified)

- `six_dof.rs:1082–1102` `estes_c6_motor()` is a synthetic 8-point diagnostic
  curve (max 14.2 N; propellant 0.0125 kg) used by legacy/core fixtures. It is
  not the certified record and must not be cited as such.

## Clock conventions

- Timebase is seconds from ignition with the native ignition event at `t = 0`
  (`docs/internal/output-dictionary.md:21`; `six_dof.rs` initialization and
  `Ignition & Rail Guidance`). Event/root clocks are not rounded plot times.
- Motor burnout is emitted at the exact `burn_time` when the bracket crosses it
  (`six_dof.rs:859–870`); the `AstraeaEvent` enum (`:695–702`) has **no
  Liftoff** event. Liftoff is a motion condition, not a recorded event; this is
  the convention that must be used in any comparison rather than inventing a
  liftoff timestamp.
- No outcome alignment was found in these paths: the motor curve is consumed at
  its own times (`motor_thrust_at`/`integrate_thrust_curve`, `:1147–1200`), and
  burnout/rail clocks are event roots, not fitted to apogee.

## Mounting and pressure assumptions

- Motor mounting: `crates/astraea-engine/src/models.rs:618–666` resolves at most
  one flagged mount (or the documented aft-end fallback), checks bore fit and
  ≥50 % length retention; multiple mounts, no bore, oversize diameter and
  insufficient retention are refused.
- Thrust pressure: no ambient-pressure or nozzle-exit pressure correction is
  applied; the curve is used as recorded (`model-path.md:53`). Powered base drag
  contains a project-authored 0.38 plume factor (`aero.rs:1809` comment), which
  is unvalidated and not part of the thrust curve.

## Limits

- The record above is for the committed application curve and native fixtures.
  It does **not** claim the shipped app uses the certified curve, does not
  qualify an actual flown motor lot/static test, and does not supply a measured
  mounting/pressure record for any vehicle.
- Falsifiers: a curve/time shift that improves the outcome; a source-hash or
  provenance mismatch; a fixture presented as certified while differing from
  the certified bytes; burnout not at the curve end; an ignition/liftoff datum
  mismatch.
