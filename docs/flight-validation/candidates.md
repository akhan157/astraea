# Independent flight-data screening — 2026-10-20

These are **candidates, not additional validated flights**. No source's simulator
result is an Astraea accuracy result. No model coefficient or unknown mass was
fitted during this screening. Public availability is not redistribution permission;
raw third-party files were downloaded only outside the repository for inspection.
URLs, byte counts and SHA-256 digests are in [candidate-sources.json](candidate-sources.json).

## Priority 1: DOFPro flight archive

Source: https://dofpro.org/RCK/fltdata/FlightData.html

This is substantially better than a kit specification alone: multiple vehicles,
repeated flights, OpenRocket design files, motor names, no-motor mass/CG, and
weather notes for several flight groups. But the following problems must be
resolved before freezing validation cases.

| Candidate | Published inputs | Download inspection / unresolved issues |
| --- | --- | --- |
| Estes Emerald Streak, three C6-5 flights, 9 March 2017 | Archive says 70.61 g without motor, CG 12.4 in, diameter 28 mm; ORK and three Raven CSVs downloaded | ORK stage override is **71.61 g**, not 70.61 g; CG 0.31496 m. Uses freeform fins and stage mass override. No weather/rail conditions stated for these flights. Raven export has independently timed channels and ragged row widths; cannot read it as an ordinary rectangular time/altitude CSV. |
| Dual-deploy LOC Vulcanite, 11 February 2023 | Archive says 1055.2 g without motor, CG 30.5 in, I140W-14, ~65°F, 1 mph wind; ORK and Featherweight CSV downloaded | ORK stage mass agrees, but stage CG override **0.739775 m** disagrees with page's 30.5 in = 0.7747 m. Uses freeform fins. GPS file has 282 data rows of 16 fields, an initially nonmonotonic/duplicated timestamp, and unlabeled ALT units/datum. Rail/launch identity, pressure and unit convention still need confirmation. |
| Estes Top Shot, 14 December 2017 E12-6 group | Archive provides six flight links, model link, 195.5 g without motor, CG 26 in, ~40°F, 3 mph wind | First Raven CSV downloaded (2,321,295 bytes). Same ragged multi-time-channel export problem. Model and remaining flights not yet audited; do not infer precise conditions from group-wide weather alone. |
| Madcow Mini DX3 / LOC Vulcanite / Adventurer groups | Archive lists more motors, repeat flights, models, weather and GPS/barometric records | Not yet downloaded/audited. Some page summaries and filenames disagree on motors/dates. The G138T Mini DX3 record explicitly says rocket shredded: not a nominal rigid-body flight case. |

The three Emerald Streak files have 48 header columns but respectively only
155, 133 and 145 initial full-width data rows. Subsequent rows have widths
47/37/34/33 (and one 32-field row). Missing channel samples omit fields, shifting
later channels; a simple DictReader or selecting one global time column is not a
valid normalization. Do not turn an apparent peak from the initial aligned block
into a whole-flight apogee claim. Decode the exporter format/flags and retain each
channel's own timestamp before selecting or comparing a measured series.

Before using these cases:

1. Resolve page-versus-model mass/CG and exact flown configuration, including
   what the reported no-motor mass includes and which motor curve/revision flew.
2. Establish rail length/orientation, launch identity, altitude datum, atmosphere
   and wind uncertainties. Use logged sensor values only with a defensible
   calibration/interpretation; an electronics thermistor is not automatically
   ambient air temperature.
3. Normalize sensor channels without silently shifting columns, units or timing;
   record all transformations and quality-flag handling. Keep original digests.
4. Represent the measured fin shape, mass and CG without lossy import. Unsupported
   critical inputs must be refused, not silently dropped or replaced with guesses.
5. Clarify raw-data redistribution terms before adding fixtures. No clear license
   statement was found on the archive page during this pass.

## Priority 2: RocketPy-hosted team datasets

### Bella Lui / EPFL, 2020

Source: https://docs.rocketpy.org/en/develop/examples/bella_lui_flight_sim.html

Available: geometry, mass/inertia, K828 motor file, filtered altitude/velocity
CSV and ERA5 weather file references. The example credits permission from Antoine
Scardigli. It supplies its own drag curve; its reported 0.34% apogee difference is
**RocketPy's example result**, not a result for Astraea's aerodynamic model.

Reasons not to promote directly to a blind validation case:

- Published telemetry is filtered; raw logging/calibration and redistribution
  permission still need checking.
- Generated page's atmosphere summary reports 213.21 m/s surface wind, while its
  flight section reports ~1.26 m/s components. Recompute from the pinned weather
  source and correct timestamp; do not copy a contradictory rendered summary.
- Nose/fin placement, mass accounting and inertia must be mapped explicitly to
  Astraea's coordinate/physical model. Do not copy a fitted/supplied Cd curve and
  then claim independent validation of Astraea's own Cd model.

### Prometheus / Western Engineering Rocketry Team

Source: https://docs.rocketpy.org/en/develop/examples/prometheus_2022_flight_sim.html

Available: M1520 motor input, geometry, mass/CG/inertia, recovery details, TeleMetrum
CSV reference and ERA5 weather reference. The page reports RocketPy apogee
4188.81 m versus recorded 3903.77 m; those are not Astraea measurements.

Critical mismatch: title/CSV path identify **2022-06-24**, but rendered environment
sets **2023-06-24**. Resolve actual launch year/weather before scoring. The supplied
piecewise drag curve is another model input, not independent evidence of
Astraea's aerodynamic accuracy. Raw telemetry provenance, motor mass accounting
and redistribution terms remain to be audited.

## What this screening establishes

There are promising public sources for many more flights. It does **not** justify
relabeling them as validated: input contradictions, sensor formats and lossy
geometry mappings are real blockers, not details to tune away. Next useful step
is a frozen, provenance-complete case from one of these groups or a team response
to [the data request](../team-data-request.md), with uncertainties stated before
prediction and no post-hoc mass/drag adjustment.
