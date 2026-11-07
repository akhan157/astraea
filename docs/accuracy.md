# How accurate is Astraea?

Short answer: **one small rocket has produced scorable flight comparisons so
far, where Astraea predicts apogee 6–10 % too high.** Other comparisons remain
untested or unscorable. These results are for the original legacy model; the
experimental candidate model is not covered by this evidence.

## Blind test (October 2026)

Inputs, measurement method and pass/fail rule were fixed and committed before
any prediction was made, and predictions were committed before the flight logs
were opened. Data: the public [DOFPro archive](https://dofpro.org/RCK/fltdata/FlightData.html)
(Harvey Mudd College), Madcow Mini DX3 (≈1 m, 41 mm, 3 trapezoid fins),
barometric logs.

| Flight | Predicted apogee | Measured | Error |
|---|---|---|---|
| G77R | 934 m | 872 m | +7.0 % |
| G79W | 991 m | 934 m | +6.1 % |
| H128W | 1,404 m | 1,274 m | +10.2 % |

Result: **fail** under our own rule. Each prediction was within 15 %, but all
three fell outside the predicted uncertainty range, which accounts for
uncertain inputs (mass, motor, wind, launch angle) but not for model error.

## RocketPy team-example round 2 (October 2026)

Ten predictions completed, but the two cases inside the proposed 1.0 scope had
no scorable outcome under the frozen extraction rule. A source-backed audit
identified Prometheus's raw barometric pressure channel, but its logs lack the
required ten-second prelaunch pressure baseline; the other candidate logs
still lack documented sensor/reference/units or a valid unprocessed channel.
No apogee comparison can be scored. Earlier public-summary, input-code and
post-prediction Juno metadata exposure is disclosed, so this round does not add
independent-blind vehicles. See the [protocol](flight-validation/round2-protocol.md),
[channel mapping](flight-validation/round2-channel-mapping-2026-10-22.md) and
[outcome audit](flight-validation/round2-results.md).

## Other evidence

| Comparison | Result | Limits |
|---|---|---|
| Same airframe family, 11 G69N flights (development data) | +32 % | After the missing fin edge drag was found and fixed; remaining gap unexplained |
| Estes Cosmic Cargo, 1 flight | +27 % | Fin shape estimated, mass disputed, no weather |
| NASA ARCAS wind-tunnel data | see per-band table below | Wind tunnel only, not flight |

## Transonic and supersonic aerodynamics (October 2026)

Against NASA TN D-4013/4014 ARCAS wind-tunnel data (digitized, per-point
provenance and reading uncertainty retained). The comparison is **base-free on
both sides**: measured axial force is CA corrected to free-stream base
conditions, and the modeled Hoerner base drag is removed to match. CP residual
is stated in **percentage points of body length measured from the nose tip**,
and **bias = model − measured, so a positive value means the model places CP
further aft than the tunnel measured**. These are wind-tunnel comparisons —
they say nothing about flight prediction.

| Band | Body | CA MAE (scored Mach range) | CP MAE | CP bias | CP n (Mach range) |
|---|---|---|---|---|---|
| Subsonic (M < 0.9) | ARCAS-short | 11.2 % (0.60–0.80) | 2.5 pp | +2.5 pp | 2 (0.60–0.80) |
| Subsonic | ARCAS-long | 4.9 % (0.60–0.80) | 1.1 pp | +1.1 pp | 1 (0.80) |
| **Transonic (0.9 ≤ M < 1.5)** | **ARCAS-short** | **15.7 % (0.90–1.20)** | 4.7 pp | −1.9 pp | 4 (0.90–1.20) |
| Transonic | ARCAS-long | 13.8 % (0.90–1.20) | 3.8 pp | +1.9 pp | 3 (0.90–1.20) |
| Supersonic (M ≥ 1.5) | ARCAS-short | **not validated** | 5.2 pp | +1.9 pp | 5 (1.50–3.96) |
| Supersonic | ARCAS-long | **not validated** | 6.4 pp | +4.7 pp | 4 (1.80–3.96) |

**Coverage limits of this table.** The CA readings end at **M ≈ 1.20**, so drag
across 1.20–1.50 is **unvalidated despite the transonic band label**. CP sample
counts are small — `ARCAS-long` subsonic is a single point, where MAE equals
bias. Two further CP readings at M = 4.63 fall outside the model's M ≤ 4.0
sweep and are excluded. Quarantine counts differ by quantity: the benchmark's
CP summary reports **2** quarantined readings (the CP-only subset) while the
coverage check reports **12** legacy quarantined readings across all quantities;
both counts are correct for their filter.

**Transonic drag on the short body exceeds the 15 % research target (15.7 %).**
An earlier pooled average across all bands stayed under 15 % and so could not
show this; the benchmark now scores per band. The gate is retained red — the
physics was not tuned to make it pass.

What the residuals show about the model, per the CP column:

- **The model CP is Mach-dependent, not Mach-invariant.** A fin lift-slope
  correction moves it aft as Mach rises (ARCAS-short 75.0 % at M 0.6 to 77.9 %
  at M 1.2). An earlier investigation note describing a fixed Barrowman CP
  predates that correction and is superseded by the table above.
- **Through the transonic rise the model understates the excursion.** For
  ARCAS-short the tunnel CP moves aft from 72.0 % at M 0.90 to 85.5 % at
  M 1.20; the model moves only 76.8 % → 77.9 %. Residuals swing from +4.8 pp to
  −7.6 pp across four measured Mach points (0.90 to 1.20, three tenths of Mach).
- **At supersonic Mach the model barely follows the forward migration.** For
  ARCAS-short the tunnel CP runs from 78.5 % at M 1.5 down to 60.0 % at M 3.96,
  while the model moves only 73.0 % → 72.0 %. The residual therefore grows from
  −5.5 pp to **+12.0 pp**. The model's supersonic CP correction is far too
  small in magnitude — the issue is not merely its sign.

**No supersonic drag validation exists** — the eleven directly sourced
supersonic axial-force readings were recorded without free-stream base
correction and are not comparable to this base-free comparison. Supersonic drag
is unvalidated, not merely untested. (The supersonic CP rows above do exist and
are scored; it is axial force that has no comparable data.)

## What this means for you

- All three holdout predictions ran **high**. One vehicle does not establish
  a general error bound or justify subtracting 5–10 % from other predictions.
- The predicted Monte Carlo range is **too narrow**: it does not yet include
  model uncertainty. It is scenario sensitivity over three independently sampled
  inputs — wind direction, rail elevation and impulse scale — with every other
  input fixed; it is not a landing-probability or coverage forecast.
- **Measured and failing:** transonic drag on the short ARCAS body is 15.7 %
  against a 15 % research target. The model also understates how far CP travels
  through the transonic rise and barely follows its forward migration at high
  Mach. See the section above.
- **Untested or unvalidated:** supersonic drag (no comparable wind-tunnel
  data), supersonic flight, multi-stage and clustered rockets, large or heavy
  vehicles, other fin and nose shapes, recovery timing, descent rate and
  landing drift.

## Full record

- [Pre-registered protocol](flight-validation/mini-dx3-protocol.md) and
  [results](flight-validation/mini-dx3-results.md)
- [Cosmic Cargo comparison](flight-validation/README.md) and
  [other candidate datasets](flight-validation/candidates.md)
- [Proposed gates for 1.0](road-to-1.0.md)
- Want to help? [Share a flight](team-data-request.md).
