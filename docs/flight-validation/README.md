# Real-flight validation candidate (found 2026-09-28)

Purpose: close the "real-flight comparison" gap recorded in the internal project-status notes
using public data only. This file records the candidate triple, what is verified, and what is
still missing. It is a **candidate**, not a completed validation.

**Scope limit (2026-10-17).** This is one vehicle, one motor and one flight, run on an
estimated fin planform, with two disagreeing public mass/length records (Estes 424 mm/36 g
vs Altimeter Cloud 457.20 mm/56.70 g) and unrecorded launch temperature, pressure and wind.
It is a limited-case comparison and a regression pin. It is not general empirical validation
of the aerodynamic model, and it is not a calibration of the shipped coefficients.

## Current production replay (2026-10-21)

The actual shipped WebAssembly engine, invoked through the production bridge in
`src/evidence/flightValidation.test.ts`, produces **371.70 m apogee** versus the
recorded **291.74 m** (**+27.4%**), and **113.43 m/s burnout velocity** versus the
previously derived **83.434 m/s** (2026-10-21, after the published fin
leading-edge and trailing-edge drag terms were added; before that change:
389.19 m, +33.4 %, 115.73 m/s). The test preserves the existing estimated
vehicle and assumed conditions, putting the recorded 10 m pad altitude into the
vehicle's launch-site field as the production bridge requires. No unknown mass
or drag scale was fitted. It also checks the standing 1e-9 relative parity
against the TypeScript oracle; parity is not physical validation.

This supersedes historical +54% baseline numbers below **for the current
production model**, not their recorded historical observations. The current
comparison still lacks measured fins, unambiguous flown mass and launch weather.
It remains incomplete, not an accuracy pass. Missing mass versus aerodynamic
error cannot be resolved by fitting this same flight.

**Correction (2026-10-21): the flight's effective coast Cd is ≈0.45, not 0.6118.**
The 0.6118 below came from a fit that discarded every non-positive drag
deceleration; on this differentiated, noisy velocity log that keeps only the
positive noise (135 of 393 points dropped) and biases Cd about +35 % high.
Keeping the signed values gives **0.4526**, and the independent window-based
derivation (`src/evidence/coastWindow.test.ts`) gives 0.453–0.464. Against the
model's own coast Cd of 0.5533 the calibrated drag scale is **0.818**, not
≈1.11: the real coast had *less* drag than modelled, so calibrating drag raises
the prediction to 411.6 m. The over-prediction on this flight is therefore not
explained by drag; the undocumented flown mass remains the dominant unknown.
Rows below that use 0.6118 are kept as the historical record only.

```sh
pnpm build:engine
pnpm exec vitest run src/evidence/flightValidation.test.ts --silent=false --reporter=verbose
```

See [independent dataset screening](candidates.md) for additional public sources,
provenance hashes, input contradictions and what must be resolved before using
them as validation cases.

## The candidate

| Leg | Value | Source |
|---|---|---|
| Vehicle | Estes **Cosmic Cargo** (Education line, kit 0653) — OEM: length 16.7 in (424 mm), Ø 0.98 in (25 mm), weight 1.27 oz (36 g), BT-50 body, molded-plastic fins, 12 in (305 mm) parachute, payload section | Estes product page (`https://estesrockets.com/products/cosmic-cargo`) |
| Motor | **Estes C6-7** (black powder, 18 mm, burn 1.86 s, 8.82 N·s, avg 4.74 N, max 14.09 N, propellant 10.8 g, wet 23.1 g); Estes lists C6-7 among the recommended engines, max altitude 1000 ft (305 m) | Flight 2986 motor record; certified NAR static-test curve via the ThrustCurve.org API (motorId `5f4294d20002310000000015`, RASP simfile source `cert`, simfileId `69eb2379c7d63000021d8c29; profile page https://www.thrustcurve.org/motors/Estes/C6/); bundled as `estes_c6` in `src/propulsion/motorDatabase.ts` (24 tabulated points + ignition anchor, curve integral 8.817 N·s) |
| Log | Altimeter Cloud **flight 2986**, signed Nano V1 log, 10,059 samples, apogee **291.74 m** at 7.454 s | `https://www.altimetercloud.com/flights/2986/` → `https://www.altimetercloud.com/flightdata/6/2986.csv` (977,003 bytes, SHA-256 `adce6e39cf0fa9919c0349c83725ffe431b44a8b03db5ccbb71d6a7aad4066b8`) |

Cross-check: the same flight carried a second altimeter (flight 2985, FlightSketch Comp),
apogee 290.2 m — the two agree within 0.5%, so the recorded apogee is not a single-sensor
artifact. The measured apogee (291.74 m) also sits under Estes' published 305 m ceiling.

Dimension note (unresolved, recorded not hidden): the Altimeter Cloud rocket entry lists
Ø 25.40 mm × length 457.20 mm × 56.70 g, while Estes' own page says Ø 25 mm × 424 mm × 36 g.
The difference is plausibly payload/loaded weight and a length measurement taken at a
different build stage, but neither source is confirmed as the flown configuration, so the
flown mass/length are **not** yet established to validation tolerance.

Fixture in-repo: `cosmic-cargo-2986-excerpt.csv` (metadata preamble + header + 59 data rows).
The full 977 KB log is not committed; download it from the URL above and verify the digest.

## What this find already proved

Running the **real** log through the existing evidence parser exposed a genuine ingestion
defect that synthetic fixtures never hit:

- The header is `Time(ms),Altitude(m),…` — milliseconds with an unspaced unit suffix, and the
  data section is preceded by ~15 metadata rows. The parser previously required the header to
  be the first content line and only knew second-based aliases, so it threw
  `unrecognized header row` and ingested **0 rows**.

Fixed in `src/evidence/altimetry.ts` (commit on 2026-09-28): the parser now scans for a
recognized time+altitude header pair anywhere in the file, skips the metadata preamble,
accepts unspaced-unit and millisecond aliases, and scales `ms`→`s`. The real log now parses
**10,059 samples** (first sample −8.766 s). Regression coverage:
`src/evidence/altimetryRealLog.test.ts`.

## Pipeline comparison result (2026-09-28; loop closed 2026-09-28)

Run through the app's own modules (`src/evidence/flightValidation.test.ts`, 8 tests):

| Quantity | Recorded (flight 2986) | Astraea pipeline | Delta |
|---|---|---|---|
| Effective coast Cd | not published | **Cd 0.6118**, rmse 0.3434 N over 269 usable points (47 g, Ø 25.4 mm) | physically plausible band recovered from real data |
| Burnout velocity | 83.434 m/s | 121.8 m/s (certified C6 curve, 2026-09-28) | **+46%** |
| Apogee, uncalibrated (certified C6 curve, 2026-09-28) | 291.74 m | **449.5 m** | +157.8 m (+54%) |
| Apogee, flight-calibrated drag (`dragCdScale` = 0.6118 / 0.44; certified C6, 2026-09-28) | 291.74 m | **382.0 m** | +31.0%, still over |
| Apogee, calibrated drag **plus** 25 g payload (certified C6, 2026-09-28) | 291.74 m | **294.7 m** | +1.0% |
| Apogee, calibrated drag **plus** 30 g payload (certified C6, 2026-09-28) | 291.74 m | **276.8 m** | -5.1% |
| Studio compare path (align + compare, 50 m / 20% / 1 s band) | coast overlap passes | **0 matches, 52 mismatches, 1 OOT region** | honest gap: sim flies ~158 m high |
| Overlay UI ingestion of the real excerpt (metadata + ms) vs sim | paste succeeds, no alert | **mismatch, 300.0 m delta, region 1 of 1** | `SimFlightOverlay.test.tsx`: real format through the UI ingest path |

Interpretation, stated plainly: the workflow runs end to end on a real flight and
recovers a plausible drag coefficient from the real coast, but with estimated geometry the
solver **over-predicts** apogee and burnout velocity. The app's own published limit is that
single-number legacy predictions carry 15–25% altitude error; this measurement sits worse
than that, so the model is not yet calibrated to this flight. The regression test pins the
observed over-prediction (not an accuracy claim) so the bias cannot silently change.

### Why the over-prediction is mostly mass, not drag

The modelled airframe alone is **38.8 g dry**, very close to Estes' published 36 g, but that
excludes the flown payload and motor. Adding payload mass monotonically lowers apogee, and it
brackets the recorded flight almost exactly:

| Added payload | Apogee | Burnout velocity |
|---|---|---|
| 10 g | 402.1 m | 104.6 m/s |
| 30 g | 306.3 m | 79.7 m/s |
| **34 g** | **288.7 m** | 75.8 m/s |
| 40 g | 263.7 m | 70.4 m/s |

So ~34 g of payload reproduces the recorded 291.74 m (certified-motor remeasure 2026-09-28: 34 g -> 288.7 m; 20 g -> 353.1 m), and the recorded burnout velocity
(83.4 m/s) sits between the 30 g and 20 g rows. That means the headline +54% apogee delta is
mostly a **missing-mass** effect, not a demonstrated drag defect: the model's own coasting Cd
is 0.374–0.50 over the subsonic band versus the flight-calibrated 0.6118, i.e. within the
same order but ~25% low. The kit's payload section is exactly the kind of mass the OEM spec
sheet does not include.

## Motor record update (2026-09-28)

The bundled `estes_c6` record previously carried an 8-point thrust-curve
approximation (avgThrust 6.0 N, propellant 12.5 g, wet 24.8 g). It now carries
the certified NAR static-test curve served by the official ThrustCurve.org API
(24 tabulated points + ignition anchor; avgThrust 4.74 N, max 14.09 N,
propellant 10.8 g, wet 23.1 g; curve integral 8.817 N·s against the 8.82 N·s
nameplate). Regression coverage: `src/propulsion/motorDatabase.test.ts`
(certified nameplate + curve pins). Effect on the comparison above is small:
uncalibrated apogee moved 452.3 m -> 449.5 m (burnout velocity 117.2 -> 121.8 m/s), calibrated-drag apogee 384.1 m -> 382.0 m, and calibrated+payload brackets 299.9/282.4 m -> 294.7/276.8 m (25/30 g). All numbers above were re-measured on the certified record 2026-09-28 via a temporary probe test (since removed).
so the documented over-prediction stands and remains mostly a missing-mass effect.
The UI readouts now show the certified figures (peak 14.1 N, avg 4.7 N, prop 10.8 g);
`src/components/PropulsionStudio.test.tsx` and the `.eng` round-trip pins in
`src/formats/engParser.test.ts` were updated to match.

Fin geometry note: the official Estes instructions PDF for the Cosmic Cargo
(SKU 1324, `1324-Cosmic-Cargo-Instructions.pdf`, fetched 2026-09-28 from the
retail product page) confirms the fins are a snap-together molded-plastic fin can
(parts 072700-312C / 072700-877C on mounts 073211-877C / 073212-877C) with no
measurable planform — no root/tip/span/sweep drawing to digitize. The sheet also
gives an estimated all-up weight of 1.6 oz (45.4 g), between the 36 g OEM web spec
and the 56.7 g Altimeter Cloud entry. So measured fin geometry is still missing;
the estimated trapezoid fin set in the comparison stays an estimate. The PDF is
not committed (Estes copyright); the URL pattern is on the product page as the
"Download Instructions (PDF)" link.

Fixture-scope note: the Rust and Tauri test fixtures keep their own
self-consistent C6 copies by design (`estes_c6_motor()` in
`crates/astraea-core/src/six_dof.rs`, `c6_motor()` in
`src-tauri/src/models.rs`, the 4-point ensemble stub in
`src-tauri/src/commands.rs`, `estesC6Motor()` in `src/tauri/smoke.ts`).
The `models.rs` oracle pins (apogee 388.72 m, flight 105.288 s, landing
3.987 m/s) belong to that fixture curve, not to the certified record, so
they were deliberately NOT re-based by the motor swap. The TS suites that
consume `CERTIFIED_MOTORS.estes_c6` directly use the certified curve.

## Still missing before this is a validation

1. **Flown geometry and mass.** The kit's molded-plastic fin-can geometry and the flown all-up
   mass are not public, and the two sources disagree (Estes 424 mm/36 g vs Altimeter Cloud
   457.20 mm/56.70 g). Until the flown configuration is fixed, Cd and apogee remain
   estimates.
2. **Launch conditions.** The site ground level is recorded (10 m), but temperature,
   pressure and wind at launch were "not recorded", so no defensible atmospheric input.
3. **Real fin planform.** The calibration closes within about ±5% on estimated fins (certified-motor remeasure: +1.0% at 25 g, -5.1% at 30 g); the genuine
   article is a Cosmic Cargo `.ork`/`.rkt` so the loop above runs on measured geometry
   instead of estimates.

## Next search targets

- An OpenRocket `.ork` for the Estes Cosmic Cargo to replace the estimated fin planform.
  Checked 2026-09-28 with no hit: GitHub repo/code search (no `cosmic cargo` + `.ork` repos;
  code search needs auth), Apogee's design-file links page (no per-kit file index), the
  Estes product page (specs only), and RocketReviews OpenRocket library/search (blocked by a
  403 bot wall from here). The RocketReviews library is still the best unexhausted lead for a
  human browser session; alternatively use the [team data request](../team-data-request.md).
- A flight whose page records launch conditions (or a club flight report stating motor,
  apogee, and weather) so effective drag can be calibrated rather than assumed.
