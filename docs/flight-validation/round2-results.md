# RocketPy team-example round 2 results

**Outcome audit completed 2026-10-22.** Protocol: [frozen round-2
protocol](round2-protocol.md). Frozen predictions: [JSON artifact
`round2-predictions.json`](round2-predictions.json), SHA-256
`90ab802a4bede950e5bf063468f29076ad23f0ddaf85e1ca36f8485b769b2733`.
Engine: `8a4e413194ce5fac3f4462745f87ec557e544bee`. The prediction commit
`31dd544` was pushed before any outcome filenames, headers, or telemetry were
opened. This is blind by procedure with disclosed prior exposure, not an
independent-blind validation round.

**Exposure correction:** before the protocol anchor, this worker listed only
the external package's top-level directory names, including that `flightdata`
and `derived` directories existed. It did not list outcome filenames or open
their contents. The protocol's statement that no outcome metadata was opened
is too broad if directory presence counts as metadata; this correction is part
of the record. The earlier worker's file-name/size and input-code exposures
remain as disclosed in the protocol.

## Outcome result

Ten frozen vehicle simulations completed, each with N=200, seed `20261021`,
and no engine errors. Header-only review found no log whose channel name,
reference, sensor, and units meet the frozen extraction rule. **No sample rows
were read. No measured apogee or signed error can be reported.** All ten
vehicle outcomes are unscorable; the central-error and interval-coverage
acceptance criteria therefore remain unevaluated. This is not an accuracy pass.

| Vehicle | Nominal apogee | Nominal Mach | Prediction p05–p95 | Proposed 1.0 scope | Outcome |
|---|---:|---:|---:|---|---|
| Bella Lui | 466.6 m | 0.255 | 425.4–485.4 m | In | Unscorable: `z (m)` does not identify sensor or AGL reference. |
| Andromeda | 3749.0 m | 1.043 | 3417.7–3917.5 m | Out: Mach ≥0.8 | Unscorable: `alt(ft)` / `alt(m)` do not identify sensor or AGL reference. |
| Astra | 3296.6 m | 0.929 | 2867.1–3424.3 m | Out: Mach ≥0.8 | Unscorable: `alt` has no units, sensor, or reference. |
| Cavour | 2945.4 m | 0.945 | 2735.8–3049.4 m | Out: Mach ≥0.8 | Unscorable: `altitude[m]` does not identify sensor or AGL reference. |
| EREBUS-11 | 2966.4 m | 0.896 | 2597.4–3099.6 m | Out: Mach ≥0.8 | Unscorable: `alt` has no units, sensor, or reference. |
| GENESIS | 2960.9 m | 0.876 | 2659.8–3094.3 m | Out: Mach ≥0.8 | Unscorable: only filtered AGL altitude (processing/source unspecified) and a GNSS file without altitude. |
| Lince | 3874.0 m | 1.014 | 3667.2–4014.8 m | Out: Mach ≥0.8 | Unscorable: only filtered AGL altitude (processing/source unspecified). |
| Prometheus | 3676.0 m | 0.981 | 3418.6–3850.7 m | Out: Mach ≥0.8 | Unscorable: pressure, altitude, and height headers lack units/reference. |
| Juno III | 2912.2 m | 0.764 | 2574.3–3142.8 m | Out: team-built motor | Unscorable: pressure and altitude channels lack units/reference; GNSS `ALT` lacks units/reference. |
| Valkyrie | 2311.8 m | 0.732 | 2141.6–2431.4 m | In | Unscorable: `altitude` has no units, sensor, or reference. |

The frozen 1.0 criteria identify two in-scope prediction cases, Bella Lui and
Valkyrie, and eight out-of-scope cases. **Zero of two in-scope cases and zero
of ten total cases have a scorable outcome.** No vehicle is added to the
1.0 breadth count. The excluded input configurations remain NDRT2020
(unsupported stepped diameter), Valetudo2019 (team-built motor), SEBliquid2023
(no notebook in the pinned snapshot), Halcyon2023 and DefianceMkIV2024
(hybrids), Camoes (controlled air brakes), and Hedy2025 (liquid engine/feed
system), as registered before predictions.

## Header audit and source record

[`round2-outcome-header-audit.json`](round2-outcome-header-audit.json) is
reproducible with:

```sh
python3 -I scripts/round2/audit_outcome_headers.py /path/to/flightdata
```

It hashes each candidate file and reads only its first CSV record. Candidate
files and SHA-256 values:

| Vehicle | Candidate log | SHA-256 |
|---|---|---|
| Bella Lui | `rockets_EPFL_Bella_Lui_bella_lui_flight_data_filtered.csv` | `ccf8bcecd91d5b912e8f8b3bcf9efe13248453e1a81dc79d2b4daea4e985de2d` |
| Andromeda | `rockets_andromeda_flight_data.csv` | `ebd3b757555b564c63937b69d2c222d6596355fc6e938d49537af293a9d48d14` |
| Astra | `rockets_astra_flight_data.csv` | `dd5287b375e84be8961a7c867dc9af764a42752af3109c25086d228978e4acae` |
| Cavour | `rockets_polito_altimeter_cavour.csv` | `f912724676eea0ca9ba031c3779e48f861538814170b050b7bda2887c31f29a8` |
| EREBUS-11 | `rockets_erebus11_flight_data_filtered.csv` | `045f5b9ed473b80095805d3ca7b831ca4b67c5afbe9156d58d1e91df9fc0b4a9` |
| GENESIS | `rockets_genesis_flight_data_faraday.csv` | `d88a7fc53cbd55d1dafeed5d5c6fcfcad27c7cf8e0a15221e67aae97eaa05a74` |
| GENESIS | `rockets_genesis_gnss_faraday.csv` | `5843d20becfb8cda3246f7ebbca2e090579ffffd5ac148ae3519be91a0c7b90b` |
| Lince | `rockets_lince_main_data.csv` | `a9cf47fe2b2e5be03168d36b1c41f0a5651a0c3b6db4ed091e1afc274bd7473e` |
| Juno III | `rockets_juno3_cots_GNSS.csv` | `557c80be4c0d9a5e6a5493177a9adfaa3b02c11b8ff814ed238b53540ac9f062` |
| Juno III | `rockets_juno3_cots_altimeter.csv` | `eef81b3bcc4c285667727c1e2c9ca502a67cb374f5e31bc4f87ed76b8a04c1ee` |
| Juno III | `rockets_juno3_srad_telemetry.csv` | `8cff1691d9a89bfccdb3a85f1a55ac26432b220c64e1c4c80cd7df16077af39c` |
| Prometheus | `rockets_prometheus_2022-06-24-serial-5115-flight-0001-TeleMetrum.csv` | `9fe8d17a25e7944267b34a45ed955303afd5818b3f18479a5f7ffb31a574cecf` |
| Prometheus | `rockets_prometheus_2022-06-24-serial-6583-flight-0003-TeleMega.csv` | `befe40714e6b88b3bd5af8cd51b569a94544c486ced299878f66ab264f9105a6` |
| Valkyrie | `rockets_valkyrie_flightInfo_merged.csv` | `0c7808a84fb39c83908ba9caa1d2d3ccb609d6db46c3d660b85977e6917795bc` |

The Prometheus notebook code uses the 2023-06-24 weather file and date, while
the candidate log filenames say 2022-06-24. The frozen weather mapping followed
the notebook's executable input code; the mismatch was not used to change
weather or select logs. Prometheus remains out of scope by its committed Mach
prediction. All raw telemetry remains external and is not redistributed.

## Limits and interpretation

The prediction inputs reproduce notebook airframe mass and CG by construction,
but replace the detailed source mass distribution with a residual body-tube
mass. Source-team inertia tensors and all team-supplied/fitted Cd curves were
not used. The round uses Astraea's built-up aero, not a copied RocketPy drag
curve. Its ERA5 profiles are reduced to equivalent ISA pressure/density
altitude plus surface wind; Valkyrie's weather is a broad ISA/wind bound. The
Monte Carlo interval represents only the frozen input variations, not model
uncertainty. Geometry support does not provide new empirical accuracy
evidence. The round yielded no scorable flight comparison and does not change
the existing accuracy conclusion.

## Dated correction and source-backed re-audit (2026-10-22)

The preceding section and [`round2-outcome-header-audit.json`](round2-outcome-header-audit.json)
preserve the original header-only finding as recorded at the earlier result
commit. The zero-score conclusion remains correct, but treating the CSV header
as the only admissible source of channel metadata was too restrictive. The
frozen protocol requires unambiguous channel, units and reference; it does not
limit those facts to literal header text. The dated [channel mapping
follow-up](round2-channel-mapping-2026-10-22.md) was committed and pushed before
telemetry samples were opened.

### Source-backed Prometheus mapping

Altus Metrum documentation establishes that CSV exports contain standard-unit
barometric pressure, altitude and height-above-pad fields, and that the
display-unit preference does not change CSV metric units. The TeleMetrum and
TeleMega telemetry specification defines pressure as a barometer sensor field.
The device height is a Kalman flight-state estimate that fuses barometer and
accelerometer data, so it is excluded by the frozen protocol's rule against
using processed/fused altitude as the primary barometric measurement. The
source-backed raw-pressure mapping was therefore pinned for each Prometheus
altimeter independently, with pressure converted to AGL against the median
pressure in the ten seconds before launch. The two resulting altimeter values
would be averaged as registered.

After the mapping commits `7dccd72` and `d3a12f9` were pushed, sample records
were read only to establish the logger time/state coverage needed by that
frozen extraction. The `time` field spans -0.30 to 237.94 seconds, with just
30 records in the interval -10 to 0 seconds; those records span only -0.30 to
-0.01 seconds. There are no `Pad` state records. Thus neither Altus Metrum log
contains the required ten-second prelaunch pressure baseline. The pressure
channel is source-eligible, but no pressure-derived AGL series can be formed
under the unchanged protocol. No pressure or altitude values were used to
choose a channel, and no apogee was extracted. The `height` channel was not
substituted after seeing the data. The two altimeters remain independently
unscorable for this specific missing-baseline reason.

The files identify TeleMetrum serial 5115 / flight 0001 and TeleMega serial
6583 / flight 0003, but neither file contains a separate version/configuration
prologue. The local records therefore do not establish the actual firmware,
AltosUI exporter version, or per-flight configuration. The authoritative
published manuals checked are version v1.9.22.2 (13 Oct 2025); this is the
documentation version, not proof of the deployed software version. This
limits exact logger-version reproducibility but does not erase the documented
channel meanings. The frozen flight-time and state metadata were used only to
test whether the prelaunch window exists; no time-to-apogee metric is reported.

### Updated eligibility and outcomes

| Vehicle | Proposed 1.0 scope | Updated channel eligibility / blocker | Measured apogee | Central error | p05–p95 coverage |
|---|---|---|---:|---:|---|
| Bella Lui | In | Still unscorable: `z (m)` has no logger/schema evidence for barometric AGL. | — | — | — |
| Andromeda | Out: Mach ≥0.8 | Still unscorable: `alt(ft)` / `alt(m)` lack source/reference evidence for AGL. | — | — | — |
| Astra | Out: Mach ≥0.8 | Still unscorable: `alt` lacks units, sensor and reference. | — | — | — |
| Cavour | Out: Mach ≥0.8 | Still unscorable: `altitude[m]` lacks source/reference evidence for barometric AGL. | — | — | — |
| EREBUS-11 | Out: Mach ≥0.8 | Still unscorable: `alt` lacks units, sensor and reference; filename says filtered. | — | — | — |
| GENESIS | Out: Mach ≥0.8 | Still unscorable: filtered AGL channel lacks units, source and processing definition; GNSS candidate has no altitude. | — | — | — |
| Lince | Out: Mach ≥0.8 | Still unscorable: filtered AGL channel lacks units, sensor and processing definition. | — | — | — |
| Prometheus | Out: Mach ≥0.8 | **Changed:** `pressure` is source-eligible and mapped for both altimeters; neither has the required 10 s prelaunch baseline. | — | — | — |
| Juno III | Out: team-built motor | **Changed:** README identifies the COTS altimeter as RRC3; manual confirms units are configurable (default Imperial), but deployed units/configuration are absent. Still unscorable. | — | — | — |
| Valkyrie | In | Still unscorable: `altitude` lacks available logger/schema evidence for units, sensor and reference. | — | — | — |

No vehicle has a scorable measured apogee. The central-error and interval
criteria remain unevaluated, not passed. Coverage remains zero of two proposed
1.0-scope cases and zero of ten frozen cases. Prometheus remains out of scope
on the frozen nominal Mach classification. Its source-resolved channel audit
does not count as an accuracy result or add a vehicle toward 1.0 breadth.

The other candidate files were checked against the local provenance inventory
and available device/export documentation. No per-flight logger version or
configuration sidecars are present for them. The only local explanatory
sidecar is Juno's README; its flight-card apogee and prior RocketPy simulation
values had already been viewed by the coordinator after predictions: flight
card apogee **3213 m**, prior RocketPy simulation **3026.054 m**. These are
disclosed as post-prediction outcome exposure. Those values were not used to
choose a logger channel, units, vehicle, or score. The RRC3 manual confirms its
report units are configurable (factory default Imperial), but no recorded
setting resolves the `altitude`/`pressure` units in Juno's candidate file.

The results do not claim never-seen or independent-blind evidence. Public
Bella Lui and Prometheus summaries, source/notebook and input-code exposures,
the earlier header audit, and the Juno README outcome metadata exposure remain
disclosed. README remains unchanged.
