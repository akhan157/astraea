# RocketPy team-example round 2 protocol

**Frozen before predictions on 2026-10-22.** The run is blind by procedure with
disclosed prior exposure; it is not a never-seen or independently blind test.
This record fixes the engine, cases, input mappings, uncertainty, outcome
selection, measurement extraction, and acceptance rule before any round-2
prediction or outcome value is read.

## Question and scope

This is a prospective check of Astraea's default built-up aerodynamics against
the flight outcomes associated with public RocketPy team-example notebooks.
It is not a calibration. There will be no model, coefficient, mass, motor, or
weather choice made in response to an outcome. The aerodynamic drag scale is
1.0, and no team-provided power-on or power-off Cd curve is imported. The
engine's existing dry-airframe inertia approximation remains cylindrical; it
does not model fin-shape-specific inertia. Freeform-fin flutter is unavailable.

The proposed future 1.0 scope is a single-stage, commercial solid-motor rocket
0.5–3.0 m long with nominal simulated peak Mach below 0.8. Scope membership is
decided from frozen input classification and the committed nominal prediction;
it is never decided from measured outcomes. Results outside this scope remain
reported and do not count toward its coverage. The ten frozen prediction cases
below are not a claim of six in-scope or independent-blind airframes.

## Blinding and prior exposure

The coordinator reported that earlier screening had seen public Bella Lui and
Prometheus summary values. Earlier preparation also viewed stripped notebook
source, input JSON for Valkyrie, file sizes and names, code comments, some
dropped-line samples whose strip headers matched apogee, a plot limit, and a
comment implying drift-only data for one rocket. The prior worker reported a
mapping-only smoke and no flight prediction. I reviewed stripped input code,
notebook/input hashes, and model mappings for this phase. I did not open
notebook outputs, flight telemetry, altitude rows, apogee plots, or outcome
metadata before this protocol and the prediction commit. Because of the earlier
exposure and its uncertain extent, the round is described as **blind by
procedure with disclosed prior exposure**, not independent-blind.

`scripts/round2/strip_notebook.py` reads notebook JSON but emits only code-cell
source, discards all outputs and markdown, drops cells matching flight-data or
comparison terms, and drops result-like lines. Its log records cell/line
numbers and matching keywords, never dropped contents. Input definitions were
reviewed from this stripped output. Raw notebooks and raw flight data remain
outside this repository and are not redistributed.

## Frozen cases and screening

The source screen comprised the 17 examples specified in the round-2 handoff.
The pinned local RocketPy example snapshot contains 16 notebooks; SEBliquid2023
has no notebook in that snapshot. Ten input configurations are mapped in
`src/validation/round2/vehicles.ts` and will all be attempted in source order.
The six other local notebooks and the missing example are excluded using only
input structure:

| Example | Frozen disposition | Input-based reason |
|---|---|---|
| Bella Lui EPFL2020 | Predict | Supported single airframe and mapped solid motor. |
| NDRT2020 | Exclude | Stepped body diameter; one Astraea body tube cannot preserve its outer mold line. |
| Valetudo2019 | Exclude | Team-built Keron motor, outside the proposed commercial-motor scope. |
| SEBliquid2023 | Exclude | No source notebook is present in the pinned 16-notebook input snapshot. |
| JunoIII2023 | Predict | Mapped as an out-of-scope team-built solid motor; report it, do not count it as commercial scope. |
| Andromeda2022 | Predict | Supported airframe and mapped notebook motor input. |
| Astra2022 | Predict | Supported airframe and mapped commercial motor input. |
| Prometheus2022 | Predict | Supported airframe and mapped commercial motor input. |
| EREBUS11 | Predict | Supported airframe and mapped notebook motor input. |
| Halcyon2023 | Exclude | Hybrid motor and associated oxidizer tank are outside the supported solid-motor model. |
| Cavour | Predict | Supported airframe and mapped commercial motor input. |
| GENESIS2023 | Predict | Supported airframe and mapped commercial motor input. |
| Camoes | Exclude | Flight controller commands air brakes; that configuration is not represented by this harness. |
| Lince2023 | Predict | Freeze the notebook's single-motor pre-deployment configuration and apogee flight; later copied post-deployment configurations are not separate cases. |
| DefianceMkIV2024 | Exclude | Hybrid motor and oxidizer tank are outside the supported solid-motor model. |
| Hedy2025 | Exclude | Liquid engine and feed system are outside the supported solid-motor model. |
| Valkyrie2025 | Predict | Supported single airframe and mapped commercial solid motor; weather limitations are recorded below. |

“Predict” means an input mapping was frozen and the engine will be attempted;
it does not guarantee a valid run, an eligible 1.0-scope case, or a measurable
outcome. Engine errors, missing or ambiguous outcomes, and every excluded case
will be reported. No case will be added or removed based on predicted or
measured apogee.

## Engine and source inputs

Frozen engine source: `8a4e413194ce5fac3f4462745f87ec557e544bee` on `release/v1`
(freeform fin acceptance coverage). Predictions call the production
`simulateFlight` bridge with the instantiated WASM engine, default
aerodynamics, and drag scale 1.0. No engine changes are permitted between the
prediction and outcome commits. The harness uses the current cylindrical dry
inertia implementation, not RocketPy's supplied inertia tensor.

Notebook inputs are from RocketPy data snapshot `9bd6ad3a`. The external
notebook SHA-256 manifest has digest
`27c418b60e20e267ca7c503c086a1bdd5bb6f41400efad0da1344afbbb8d58de`.
Individual notebook SHA-256 values:

| Notebook | SHA-256 |
|---|---|
| andromeda_flight_sim.ipynb | `af60f6b41668aa41f90885324cd7e316c87053660da8f2eb8a755c6e29a83a0d` |
| astra_flight_sim.ipynb | `7e708a54ec4c1d3c2f7c4ec015ac1d537431a33dde79a4b91bb5e1602097731a` |
| bella_lui_flight_sim.ipynb | `1402eee9b084da9307acd9ec84e3f730118d0f6897f25943f2d8a691749061af` |
| camoes_flight_sim.ipynb | `dca32f4603c1acfdce58ffaf6ffce0355767d99da1db2a3ee88c5f60dd50140b` |
| cavour_flight_sim.ipynb | `9d407019f0a22f7e19bad163131c44dfc10295b1c2290e06035ef968616b83be` |
| defiance_flight_sim.ipynb | `0348a6fc8de79458cbc4a48fec1ef348f9c6a511fd7a215289c34b03aea939b` |
| erebus_flight_sim.ipynb | `85d34d7f05a2c3653864b9fdfda2347bfae916c350d480edb7c030c365fd67b4` |
| genesis_flight_sim.ipynb | `7ee71c93b82327814be4d0874ad83db8d4eca2877f8421025f718d87b511e854` |
| halcyon_flight_sim.ipynb | `ee4e85b91244c95bd4ae0381521aa077e817018e386f2afa9384918dbc453f25` |
| hedy_flight_sim.ipynb | `0feb477c3e254afa5ade9bcfb6a44c31f21416e7c1585900a2c90f427b628fe5` |
| juno3_flight_sim.ipynb | `fd9327a71280f23fb7baedbf50fc8b78fe68845426ffa2d59308f1343d39f112` |
| lince_flight_sim.ipynb | `a6c5f7094cb8c21d19090feb0c39d2b0df7a307b8160bc03e523a8d10127ce14` |
| ndrt_2020_flight_sim.ipynb | `ac6ac18064b7297c2f272035bb9e555902aad816add0b7860f6641ad033591b2` |
| prometheus_2022_flight_sim.ipynb | `44e5dfd07323771d54dec3bfb596f943620915d81f162a6b8cc25c3ea1438186` |
| valetudo_flight_sim.ipynb | `2b86db6b4846f1badf9d99a7d6825526c889e64303bee4d3c487a72ba3e69c47` |
| valkyrie_flight_sim.ipynb | `78aacf4df26933a87d28bfc71ad16e94828933672df20dce87545f0ce43267d3` |

Thrust inputs are the files selected by the notebook's `thrust_source` rule;
curves are copied without fitting and processed according to the notebook's
burn-time/reshape calls, then adapted only to Astraea's zero-thrust endpoint
contract. SHA-256: AeroTech K828FJ `ba778b6add25bb0d866ca22b68eb63a0bac93313f4ed65afc5a720f396073d1b`;
Cesaroni K650 `ca6760597aa5201edb3994e994a8caf03faf19a2973b29a9bcbaa4866ad63666`;
Cesaroni L995 `efc04492a3527bdb626d8ec0c18bbbd51f02012393d3b82e00b11d167b2dad2b`;
Cesaroni L1350 `8399eae18641308e5a302f40bfcb97572093368891ba69a80eb85a46d3775c2e`;
Cesaroni M1520 `f38ad06972a07e4ef04164a60718f099d732de6e433185e211dd87083f89e4ca`;
Cesaroni M1101 `8ebd097ec531581451f170380d7258029b61d0a36f37444f9329a8dc4e936d50`;
Andromeda team curve `5ffd815f0f2a259e98cecbf6186af58d45feded84d0cc6a2d5ef4abbc8b913dd`;
EREBUS11 team curve `c8e9c18faead7844db42cc733f4aa2516b8e806136041e0d282b2eaf3f63c53f`;
Juno III team-built curve `25e9cd7a80fa346df7575ce466400426abe8f37990ebe268491d5fbb3245ec44`.
These motor data do not validate Astraea aerodynamics. Team motor curves are
not treated as catalogue curves when describing source uncertainty.

ERA5 launch weather is used for the nine cases with a frozen archive file and
notebook launch time/location, interpolated per `scripts/round2/era5_launch.py`.
Valkyrie has no reproducible weather file; its frozen atmosphere is ISA at
592 m, 25 ± 10 °C, ±8 hPa, wind 2 ± 3 m/s and any direction. ERA5 file SHA-256:
Bella Lui `51a60794fca3a4511436ee54821307a557576399fe5d1252bbf7c7b639809e95`;
EuRoC 2022 `b4583116c89c9e2b8fb9a88ef61d6f7c2c25329559184f7bde7040694ac0d52d`;
EuRoC 2023 `a3d9e08eb3bb4480d1b8ef03b06878a1a1f76397fdc9dcc929fe5cc856f61d56`;
NDRT 2020 `e23b2e402bd2b8ed22cee249264601bf85d40e46391daa32dbd7b781b9979034`;
Spaceport America 2023 `25d48e9d03554251dc2d0601dcaa1e441ca7e7c502f573fceb4ce5c058da8694`.
NDRT weather is hashed for screening provenance and is not used by a prediction.
The engine accepts ISA plus surface wind only: launch pressure and temperature
are represented by an equivalent ISA pressure/density altitude, and 10 m wind
is converted to its 2 m reference using the engine's power law. This is an
atmosphere approximation, not a full ERA5 profile. For low launches below the
first ERA5 pressure level, the weather extractor uses hydrostatic 6.5 K/km
extrapolation and holds the lowest-level wind. No weather is selected by match
quality.

## Mapping and uncertainty frozen for the run

The notebook coordinate system is converted with `x = nose.tip - c` metres;
lengths, diameters, mass, motor position, loaded motor CG, nozzle position,
launch rail, inclination, and heading are taken from the stripped input
definitions. One Astraea body tube carries the residual airframe mass needed
to reproduce the notebook airframe mass and CG after nose, fin, and tail
components are included. The mapped motor is a uniform cylinder seated at the
mount end with its length set so loaded motor CG matches the notebook. This
matches total mass and CG, not the notebook's inertia tensor, detailed mass
distribution, or drag curves. Unsupported geometry or stage behavior is
excluded rather than approximated.

Nominal fin assumptions absent from the notebooks are 4 mm thickness and
rounded edges. Each of exactly 200 Monte Carlo runs per attempted vehicle uses
the fixed Mulberry32 seed `20261021`, in source order and sequentially. The
harness samples airframe mass uniformly ±2%, CG uniformly ±2% of mapped length,
fin thickness uniformly 2–6 mm, square/rounded edge with equal probability,
motor impulse uniformly ±3% (±5% for the three team curves), and propellant
mass uniformly ±5%, except Bella Lui spans the coded grain value through the
notebook's 1.373 kg comment. Pressure/density altitude is sampled uniformly
over the min/max bounds from frozen pad pressure and temperature limits; wind
speed and direction are sampled uniformly over the stated limits, with speed
floored at zero. Rail length is ±10%, inclination ±2°, and heading ±10° around
the notebook values. These are input-only assumptions, not fitted errors or a
model-form interval. The Monte Carlo p05–p95 interval therefore does not
include model uncertainty.

## Outcome selection and extraction

After the prediction commit, inspect only filenames and headers first. Select
all available flight logs explicitly associated with each frozen example and
the configured vehicle/motor from the source archive; never select by an
altitude, plot, or apparent agreement. Hash every selected raw file before
reading any sample values and record those hashes in the result record. Do not
commit raw third-party telemetry.

For each logger, use a barometric AGL altitude channel when the name and units
identify it unambiguously. Otherwise derive AGL from raw pressure relative to
the median pressure in the 10 seconds before launch and the standard
atmosphere. Processed/fused altitude is not eligible as a primary barometric
measurement. Use GNSS altitude, referenced to its prelaunch median, only when
no usable barometric channel exists and label it GNSS. If channel identity,
units, launch reference, or record association is ambiguous, exclude that log
with the exact reason; do not compare multiple channels and choose the closest.

For each selected altitude series, apply a centered five-sample median, find
the maximum, and report its timestamp. Define launch time as the first upward
crossing of 5 m AGL, with linear interpolation. If two eligible barometric
altimeters exist, extract each independently, use their mean apogee as the
flight value, and report both values and their spread. A missing launch
crossing prevents time-to-apogee scoring but does not change apogee extraction.
No valid eligible log means the vehicle has no scored outcome; it remains in
the frozen denominator and is reported as unscorable.

## Acceptance and reporting

For each vehicle with at least one scorable outcome, compare Astraea's nominal
apogee with the median of that vehicle's extracted flight apogees. Pass
requires both (1) absolute central error ≤15% of the measured median and (2)
that measured median lies within the frozen prediction p05–p95 interval. Both
criteria apply; neither is substituted for the other. Report each flight's
signed error, interval coverage, time-to-apogee when available, and sensor
spread. Also report per-vehicle median result, nominal Mach, scope decision,
all engine errors, exclusions, unscorable cases, and aggregate counts. No
aggregate pass can hide a per-vehicle failure. No uncertainty range may be
expanded after outcomes are opened.

The results phase must follow this immutable order on `release/v1`, with each
commit pushed fast-forward as its timestamp anchor:

1. Protocol commit: this file, input mappings and hashes, frozen harness and
   command; no predictions or outcomes.
2. Prediction commit: generated JSON for all ten attempts, including errors;
   no outcome values or metadata opened before this commit.
3. Results commit: outcome file hashes, extraction audit, all scored and
   unscorable cases, failures, and concise public accuracy/status updates.

The opt-in reproduction command is `pnpm build:engine && pnpm validate:round2`.
It runs the production WASM engine, fixed N=200/seed scenarios, and writes JSON
when `ROUND2_PREDICTIONS_OUT` is set. Raw inputs needed to regenerate copied
source curves and ERA5 values remain local and are not redistributed.
