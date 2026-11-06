# Mini DX3 validation protocol (pre-registered 2026-10-21)

Status: **registered before any Astraea prediction for these vehicles and before
the holdout logs were decoded.** This file must not be edited after the holdout
prediction is committed, except to append dated amendments below the line at
the end. Results go in a separate file.

## Why these cases

The DOFPro archive (Harvey Mudd College, https://dofpro.org/RCK/fltdata/FlightData.html)
publishes two Madcow Mini DX3 configurations with an OpenRocket model, measured
no-motor mass and CG, repeated flights on one motor, and logged barometric data.
Unlike earlier candidates, the model file and the page agree:

| Configuration | Page (no motor) | ORK stage override | Fins |
|---|---|---|---|
| Mini DX3 Modified (min-diameter, 38 mm) | 344.71 g, CG 20 in | 0.34471 kg, CG 0.508 m | trapezoid |
| Standard Mini DX3 (29 mm mount) | 333.55 g, CG 19 in | 0.33355 kg, CG 0.4826 m | trapezoid |

Both share the same outer mold line: 165.1 mm ogive nose, one 40.894 mm diameter
body 762.0 mm long (two equal-radius tubes, aerodynamically one), three plywood
trapezoid fins (root 137.236, tip 38.2016, sweep 74.2696, span 42.9006,
thickness 2.3368 mm, square edge, aft edge 7.62 mm forward of the body base).

## Cases

1. **Development case (open, not validation): G69N, 11 flights.** 30 Jun 2017
   (6 flights; page: 68 °F, 26 % RH, no wind) and 22 Oct 2018 (5 flights; no
   weather stated). Raven FIP logs were decoded and their apogees inspected on
   2026-10-21 *before* this registration, so this case can only shake out the
   harness. Its result is reported but never counted as validation.
2. **Holdout (blind): F67W, 8 flights, 15 Nov 2019.** Standard Mini DX3. Page:
   1 mph wind, ~30 % RH, 65 °F. Logs (Teensy logger, raw barometric pressure)
   were downloaded and hashed but **not decoded or plotted** at registration.

Holdout file digests (SHA-256):

```
09b3f7feeffe3d1a331313bbcbff737be5e7e3b0c97da6661d417c4a507bc692  20191115_DX3_F67-9W_1_GPS.TXT
34abda0e21834693ca1cac09ffbc9bb11745887d48ad0fe8a48f8c6e67e15079  20191115_DX3_F67-9W_2_GPS.TXT
b2986691bbdc1fce637536e8db5aed150c0620c3e2a74ec29bb0e08a4059b70a  20191115_DX3_F67-9W_3_GPS.TXT
63c90afebee4dd64aae894335c177311d671c1745fa6076409356c870b82b712  20191115_DX3_F67-9W_4_GPS.TXT
629618c7d536fdef57eeff3e90e01c9ff162f02f145b3319012cb7cff4cdce3a  20191115_DX3_F67-9W_5_GPS.TXT
d7fbea3d8003a974b8e607eb3559f3e9e32c6291842f34d7da2729ace5d9c3c7  20191115_DX3_F67-9W_6_GPS.TXT
72f1a07d5577b744657db279ec33d1f9021d82d84cfb9ab08fc6509cb434d042  20191115_DX3_F67-9W_7_GPS.TXT
a9c52e7618e24af374139965d8c8251b7d70e92b8b7ee7453a7b8deb060fe21f  20191115_DX3_F67-9W_8_GPS.TXT
7098c50aa4727d714480aabcc65ed2333ffe2df43be01c7bae63fb3ed2c78ccc  ParseTeensyLoggerEggfinder.m (team parser, format reference)
```

Model files: `MiniDX3MinDiamWAvionics.ork` `399bf2ed…6f4e`,
`StandardMiniDX3WAvionics.ork` `b24bf91e…5102e`. Raw third-party files stay
outside the repository until redistribution permission is obtained.

## Model inputs (frozen)

The engine is the shipped WebAssembly build through the production bridge,
default aerodynamics, `dragCdScale` = 1 (no calibration), default time step.

| Input | Nominal | Uncertainty sampled (uniform) | Source |
|---|---|---|---|
| Airframe mass (no motor) | page value | ±2 g | page = ORK override |
| Airframe CG from nose tip | page value | ±10 mm | page = ORK override |
| Nose mass/CG | 173.641 g at 0.1778 m | fixed | ORK nose override |
| Remaining mass | body-tube override solved so the rollup equals the page mass and CG exactly | — | derived |
| G69N curve | ThrustCurve cert RASP simfile `5f4294d20002e90000000876` (136.3 N·s) | impulse ×[0.97, 1.03] | NAR cert |
| F67W curve | ThrustCurve manufacturer RASP simfile `5f4294d20002e9000000088a` (62.0 N·s); **no certified curve exists** | impulse ×[0.95, 1.05] | manufacturer |
| Motor loaded / propellant mass | G69N 201 g / 62.2 g; F67W 80.8 g / 30 g (ThrustCurve, assumed to include hardware) | loaded mass ±10 g | ThrustCurve |
| Launch elevation | ISA pressure altitude of the flight's median pre-launch pad pressure | see temperature | logger |
| Ambient temperature | not an engine input (ISA assumed) | bounded by sampling the elevation input between the pressure altitude and the density altitude at the stated temperature ±3 °C | page |
| Surface wind | dev 2017: 0; dev 2018: 1 m/s; holdout: 0.45 m/s | dev 2017 [0, 1]; dev 2018 [0, 4]; holdout [0, 1.5] m/s; azimuth [0, 360)° | page |
| Rail length | 1.83 m | [1.2, 2.4] m | not recorded |
| Rail elevation | 88° | [85, 90]° | not recorded |

Prediction = one nominal run plus a seeded Monte Carlo of 200 runs over the
sampled inputs (seed 20261021), reported as the 5th–95th percentile interval.

## Measurement definition (frozen)

- Altitude AGL from barometric pressure with the ISA pressure-altitude relation
  `h = 44330.77·(1 − (p/p0)^0.190263)` m, relative to the median pad pressure
  of the 5 s before liftoff. For Raven files the logger's own `Baro (Atm)`
  channel is used, not its derived altitude.
- Apogee = maximum of a centered 5-sample running median of that altitude
  (suppresses single-sample spikes and ejection overpressure).
- Liftoff = first time axial acceleration exceeds 3 g for 3 consecutive
  samples; if a holdout file lacks usable acceleration, the first time the
  altitude exceeds 5 m AGL (stated per flight).
- Reported per flight: apogee, time from liftoff to apogee. Group statistics:
  min, median, max. No flight is excluded unless its log is undecodable or
  physically non-nominal (for example a motor failure), and any exclusion is
  stated with its reason before comparison.

## Acceptance rule (frozen; chosen by the project owner 2026-10-21)

The **holdout passes** only if both hold:

1. **Overlap**: the predicted 5th–95th percentile apogee interval overlaps the
   measured [min, max] apogee range of the 8 flights; and
2. **Central accuracy**: |nominal predicted apogee − measured median| ≤ 15 % of
   the measured median.

Time-to-apogee is reported (signed error vs median) without a pass criterion.
Signed and absolute errors are reported regardless of outcome.

## Integrity rules

- No model or input change after the holdout prediction is committed. A
  harness bug found after unblinding is reported with both the original and
  the corrected result, the corrected one clearly labelled post hoc.
- The holdout prediction (nominal and interval) is committed to the repository
  **before** the holdout logs are decoded.
- A pass is evidence for this vehicle class only: subsonic (well below
  Mach 0.6), ~1 m, 41 mm, single-stage, trapezoid fins, F/G motors. It is not a
  general accuracy claim.

---

Amendments (append below, dated):

### Amendment 1 — 2026-10-21 (before any holdout prediction or decoding)

**Development-case result on the v1.0 model (commit 14423c9 inputs, engine at
266b433).** All 11 G69N flights by the frozen measurement definition: median
apogee 887.6 m, range 599.7–1017.6 m, time to apogee ≈ 12.7 s. Prediction:
nominal 1,274 m at 14.6 s; Monte Carlo p05–p95 1,232–1,332 m (2017 inputs) and
1,232–1,309 m (2018). Peak Mach 0.67: the scope line "well below Mach 0.6" above
is wrong for G69N; the holdout motor (F67W) is lower energy.

**Diagnosis (development data only).**
1. Motor inputs match the primary source: the NAR certification sheet (via
   ThrustCurve cert mirror, SHA-256 `56ba1a5d…aaee`) gives 136.7 N·s (σ 1.6),
   initial mass 201 g, mass after firing 137 g in 38/120 hardware, so the
   ThrustCurve loaded mass includes the case.
2. Early-burn acceleration implies ~10 % less thrust-to-mass than the published
   inputs (inferred liftoff mass 604 g vs 546 g modelled, if the certified
   thrust holds). The accelerometer cannot separate thrust from mass. This is
   recorded, not corrected: no input was changed.
3. That shortfall does not explain the miss. Flying the model at a liftoff mass
   that matches the measured ~186 m/s peak velocity still gives 1,163 m (+31 %).
4. The coast-phase axial accelerometer gives an effective drag coefficient of
   0.77 / 0.70 / 0.68 at Mach 0.3 / 0.4 / 0.5 (coast mass 481.7 g; higher if
   the mass is higher), against the model's 0.53 / 0.52 / 0.52.
5. Cause found in code: `compute_fin_wave_drag` (crates/astraea-core/src/aero.rs)
   returns 0 below Mach 0.8, so subsonic fin leading-edge pressure drag and
   trailing-edge base drag are absent. These fins are square-edged plywood;
   their blunt edges total ~23 % of the reference area.

**Model change, decided by the project owner before unblinding.** Add subsonic
and supersonic fin leading-edge pressure drag and trailing-edge base drag
exactly as published in the Barrowman/OpenRocket build-up (Niskanen 2009,
OpenRocket technical documentation §3.4; OpenRocket `FinSetCalc`,
`BarrowmanDragCalculator`): square LE uses the stagnation coefficient
0.85·(1 + M²/4 + M⁴/40) (M ≤ 1), rounded/airfoil LE uses (1 − M²)^−0.417 − 1
(M < 0.9, with the published transonic/supersonic branches), both × cos²Γ_LE;
TE base drag 0.12 + 0.13 M² (M ≤ 1), 0.25/M (M > 1) for square, half for
rounded, zero for airfoil; each term × span·thickness/A_ref × fin count. No
coefficient is taken from these flights. After the change the development case
is re-run and reported; then the holdout prediction is committed and only then
are the holdout logs decoded. Acceptance rule and holdout inputs are unchanged.

**Measurement deviation (development case).** The Raven begins logging
~0.15 s before liftoff, so the "5 s pad window" holds 2–3 samples; the median
of the available pre-liftoff samples is used. For the holdout, the launch
elevation input needs the pad pressure; it will be taken from pressure samples
that precede liftoff only, without looking at flight data.

### Amendment 2 — 2026-10-21 (model change landed; before any holdout prediction or decoding)

The published fin edge terms from Amendment 1 are implemented in both engines
(`compute_fin_edge_drag` in crates/astraea-core/src/aero.rs,
`computeFinEdgeDrag` in src/aero/transonicAero.ts); native matches the TS
oracle bit-for-bit (Estes Alpha/C6 live-aero oracle 333.2894 → 320.5895 m).
No other model change was made. For these fins (60° leading-edge sweep,
cos²Γ ≈ 0.25) the terms add ≈0.08 to Cd: model ≈0.60 vs measured ≈0.70.

Development case on the changed model: nominal 1,174 m at 13.9 s; Monte
Carlo p05–p95 1,157–1,225 m (2017 inputs), 1,136–1,203 m (2018); measured
median 887.6 m (range 599.7–1017.6 m, ≈12.7 s). Still +32 %. The remaining
gap (≈10 % thrust-to-mass shortfall of unknown cause plus ≈15 % Cd) is
recorded, not chased: no further model or input change is made before the
holdout, so the holdout tests exactly this model.

Holdout liftoff detection: the Teensy `A` accelerometer axis orientation is
not documented, so liftoff uses the magnitude |A| > 3 g for 3 consecutive
samples (units identified from the ≈1 g pad reading); if that fails, the 5 m
AGL fallback applies. The pad-pressure script reports only the pre-liftoff
pad pressure before the prediction is committed.

### Amendment 3 — 2026-10-21 (replacement holdout; nothing decoded)

The registered F67W holdout logs turned out to contain only GPS NMEA sentences
(no barometer or accelerometer lines; established by counting line types
only), so the frozen barometric measurement cannot be applied. Decided by the
project owner before any decoding:

**Primary holdout (blind): Standard Mini DX3, three nominal Teensy-logger
flights with an MS5611 barometer.** G138T (10 Apr 2021) is excluded before
decoding: the archive states the rocket shredded at max-Q.

| Flight | File (SHA-256) | Page conditions |
|---|---|---|
| G77R/L, 5 Feb 2021 | `20210205_MiniDX3_G77-10R-L_trimmed.TXT` `08d0b217…6b6` | no wind, 66 °F, 37 % RH |
| G79W/L, 5 Feb 2021 | `20210205_MiniDX3_G79-10W-L_trimmed.TXT` `755a2bcb…d09` | no wind, 66 °F, 37 % RH |
| H128W, 10 Apr 2021 | `20210410_MiniDX3_H128W-14_Trimmed.TXT` `238208db…4f2` | 9 mph wind, 67 °F, 24 % RH |

Full digests: `08d0b217590beb2d64fd29a8fa50d85d5dcafa43f67bff25f421341f56b016b6`,
`755a2bcb926abe760060e6dd73cfa723c0adc497bcac1e48ed161ebe2ad66d09`,
`238208db6e52c9aadc7e978af7b5a49610e0a53468327f4a2f82f7e6a53c57c5`; team parser
`ScanTeensyDataLogger.m` `d13efed9…bea`.

Inputs (otherwise as in the frozen table): airframe 333.55 g ±2 g, CG
0.4826 m ±10 mm. Motor curves from ThrustCurve, choosing the RASP simfile by
source cert > mfr > user: G77R/L motorId `5f4294d20002310000000246` (NAR,
102.9 N·s, 122.5 g / 64 g), G79W/L `5f4294d20002310000000245` (NAR, 108.3 N·s,
124 g / 65 g), H128W `5f4294d20002310000000083` (TRA, 172.9 N·s, 206 g / 94.2 g);
impulse ×[0.97, 1.03], loaded mass ±10 g; lengths from the ORK (0.124, 0.124,
0.194 m), diameter 29 mm. Wind: G77/G79 nominal 0, sampled [0, 1] m/s; H128W
nominal 4.0 m/s (9 mph), sampled [2.5, 5.5] m/s; azimuth [0, 360)°.
Temperature bound: 18.9 °C (G77/G79) and 19.4 °C (H128W), ±3 °C. Elevation:
ISA pressure altitude of the median MS5 pressure in the 5 s before liftoff.

Measurement: MS5 pressure (Pa) through the frozen definition. Liftoff: ICM
acceleration magnitude (milli-g ÷ 1000) > 3 g for 3 consecutive samples; LIS
(g) if the ICM is unusable; else 5 m AGL. As before, the pad-pressure step
reports only the pad pressure until the prediction is committed.

**Acceptance (per flight):** the measured apogee lies within the predicted
p05–p95 interval, and |nominal − measured| ≤ 15 % of measured. The holdout
passes only if all three flights pass. Time-to-apogee is reported.

**Secondary, report-only: F67W, 8 flights, GPS.** Apogee = maximum $GPGGA
MSL altitude (fix quality ≥ 1) minus the median $GPGGA altitude of the first
60 s of valid fixes. Compared against the F67W prediction with the inputs
frozen above (wind 0.45 m/s, 18.3 °C). No pass/fail: GPS vertical error is
±10–20 m and receivers can lose lock during boost.
