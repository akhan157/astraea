# BX1 blind outcome extraction

Generated 2026-11-17T01:44:17Z. Rules: `/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/FROZEN-RULES-FOR-EXTRACTOR.json` (sha256 `4a9a3087994cc5430d51801ae2aa99de572b3055c093cf95400546e874e6c799`), frozen before this lane opened any log. Custody manifest `/home/ak/astraea-evidence/R6-public-cohort/blind-manifest.json` (sha256 `39a009108f3442aad4706c3a93c6aad3d72c21fc9a184124952d9ce45d35acd7`).

Blind: no prediction, BL1 output or prior outcome was read; this extractor contains no expected apogee.

## Findings

Under the frozen rules as written, **0 of 12 flights is usable**. The measured apogees are reported, but every flight is excluded.

1. **E6 pad reference fails on all 12.** No log carries the 5 s of pre-liftoff samples the rule requires; every file starts at or within 3.9 s of ignition. Pad coverage per file:

| id | pad coverage s | pad samples | pad median m |
|---|---|---|---|
| V001-01 | 0.2 | 4 | 0.439 |
| V001-02 | 0.15 | 3 | 0.411 |
| V001-03 | 0.2 | 4 | 0.599 |
| V001-04 | 0.05 | 1 | 0.352 |
| V001-05 | 0.15 | 3 | 0.107 |
| V001-06 | 0.15 | 3 | 0.224 |
| V001-07 | 0.1 | 2 | -0.092 |
| V001-08 | 0.2 | 4 | 0.518 |
| V001-09 | 0.1 | 2 | -0.092 |
| V001-10 | 0.15 | 3 | 0.085 |
| V002-01 | 3.9 | 32 | 2851.000 |
| V002-02 | 2.6 | 26 | 2855.000 |

   This is a rule-versus-data incompatibility, not a flight defect: the logs begin at ignition rather than during the pad wait. The measured apogees do not depend on it materially (pad medians are within 0.6 m of the channel zero).

2. **E3 recovery trips the literal per-interval test in four V001 files.** The test compares two adjacent 0.05 s samples; the barometer reports in 0.37 m steps, so one three-step drop inside a single interval reads as 21.9 m/s, and touchdown itself produces a pressure jump. The measured 1 s-window descent rates below 50 m AGL are:

| id | literal trigger (t, m/s) | 1 s-window descent median (m/s) | 1 s-window fastest (m/s) |
|---|---|---|---|
| V001-01 | 52.195 s, -21.93 | -4.01 | -5.84 |
| V001-07 | 56.995 s, -21.93 | -0.36 | -18.56 |
| V001-08 | 29.145 s, -21.93 | -5.82 | -12.04 |
| V001-10 | 29.045 s, -21.93 | -2.18 | -11.66 |

   None of these flights descends ballistically from altitude; the fastest sustained 1 s-window rate in the set is 18.56 m/s (descending). The verdict below is still the literal one, because the frozen rule does not specify a window. Whether the rule means sustained descent is an owner decision, not an extractor edit.

3. **Both V002 logs end airborne** (no impact sample): V002-01 at 1196 m AGL, V002-02 at 348 m AGL. E3 excludes both by the missing-impact clause.

4. **V002-02 has no barometric channel either.** The frozen E4 exemption names V002 I140W only, so the J270W flight is excluded under E4 as written; its GPS maximum is a diagnostic, not an outcome.

No rule was amended after the data were opened. The E6 and E3 questions are returned to the owner; the predictions stay frozen and untouched.

## Results

| id | motor | format | liftoff s | pad median m | apogee AGL m | status | excluded by |
|---|---|---|---|---|---|---|---|
| V001-01 | Estes C6-5 | pressure | 0.244 | 0.439 | 232.19 | excluded | E6, E3 |
| V001-02 | Estes C6-5 | pressure | 0.194 | 0.411 | 240.98 | excluded | E6 |
| V001-03 | Estes C6-5 | pressure | 0.244 | 0.599 | 214.94 | excluded | E6 |
| V001-04 | Estes C6-7 | pressure | 0.094 | 0.352 | 200.85 | excluded | E6 |
| V001-05 | Estes C6-7 | pressure | 0.194 | 0.107 | 201.22 | excluded | E6 |
| V001-06 | Estes C6-7 | pressure | 0.194 | 0.224 | 216.08 | excluded | E6 |
| V001-07 | AeroTech D13-10W | pressure | 0.144 | -0.092 | 533.83 | excluded | E6, E3 |
| V001-08 | Quest QC6-5 | pressure | 0.244 | 0.518 | 230.62 | excluded | E6, E3 |
| V001-09 | Quest QC6-5 | pressure | 0.144 | -0.092 | 232.11 | excluded | E6 |
| V001-10 | Quest QC6-5 | pressure | 0.194 | 0.085 | 234.00 | excluded | E6, E3 |
| V002-01 | AeroTech HP-I140W-14 | gps | 3.900 | 2851.000 | 3773.00 | excluded | E6, E3 |
| V002-02 | AeroTech HP-J270W-14 | gps | 2.600 | 2855.000 | n/a (GPS max 6660.00, diagnostic) | excluded | E6, E3, E4 |

## Rule results

### V001-01 (Estes C6-5, pressure)

- sha256 `013c6fd5d14cb8a13b4c6d84cc0aa38deac16612300a9a2ac499b8b92ae31184`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_C6-5_1.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6, E3
- E7_liftoff_undefined: **pass** — liftoff at 0.244 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.200 s < 5 s
- E1_logger_loss: **pass** — 1335 baro samples; last sample at 66.745 s; max sample gap on ascent 0.051 s; 1213 samples after apogee
- E2_cato: **pass** — apogee 232.19 m AGL; ascent 5.851 s; step 234.05 m vs 6 sigma = 0.00 m
- E3_recovery: **fail** — impact sample yes (min post-apogee AGL -1.74 m); below-50 m descent >20 m/s: (52.195, -21.93)
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-2.18, 234.05] m; native pad median 0.439 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'C6-5' matches the sealed record's 'Estes C6-5'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 232.62, "descent_rate_1s_fastest_below_50m_mps": -5.84, "descent_rate_1s_median_below_50m_mps": -4.01, "e3_literal_trigger": [52.195, -21.93], "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -21.93, "pad_available_drift_m": 0.0, "pad_available_s": 0.2, "pad_available_samples": 4}`

### V001-02 (Estes C6-5, pressure)

- sha256 `cbb9fb4266e7a55a559e76a8f226ca21ee135e5666271a608bdc618a9d0e3db3`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_C6-5_2.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6
- E7_liftoff_undefined: **pass** — liftoff at 0.194 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.150 s < 5 s
- E1_logger_loss: **pass** — 1377 baro samples; last sample at 68.845 s; max sample gap on ascent 0.051 s; 1233 samples after apogee
- E2_cato: **pass** — apogee 240.98 m AGL; ascent 7.001 s; step 240.98 m vs 6 sigma = 1.02 m
- E3_recovery: **pass** — impact sample yes (min post-apogee AGL -0.68 m); below-50 m descent >20 m/s: none
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-1.09, 240.98] m; native pad median 0.412 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'C6-5' matches the sealed record's 'Estes C6-5'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 241.39, "descent_rate_1s_fastest_below_50m_mps": -5.11, "descent_rate_1s_median_below_50m_mps": -4.37, "e3_literal_trigger": null, "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -14.64, "pad_available_drift_m": 0.0, "pad_available_s": 0.15, "pad_available_samples": 3}`

### V001-03 (Estes C6-5, pressure)

- sha256 `de70993207aef53357bd7a8c9dd4ddfd916bc6297e9d6680337cf75f5ab83e9b`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_C6-5_3.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6
- E7_liftoff_undefined: **pass** — liftoff at 0.244 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.200 s < 5 s
- E1_logger_loss: **pass** — 1257 baro samples; last sample at 62.845 s; max sample gap on ascent 0.051 s; 1130 samples after apogee
- E2_cato: **pass** — apogee 214.94 m AGL; ascent 6.101 s; step 214.94 m vs 6 sigma = 0.95 m
- E3_recovery: **pass** — impact sample yes (min post-apogee AGL -0.49 m); below-50 m descent >20 m/s: none
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-1.09, 214.94] m; native pad median 0.599 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'C6-5' matches the sealed record's 'Estes C6-5'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 215.54, "descent_rate_1s_fastest_below_50m_mps": -4.75, "descent_rate_1s_median_below_50m_mps": -4.01, "e3_literal_trigger": null, "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -7.35, "pad_available_drift_m": 0.0, "pad_available_s": 0.2, "pad_available_samples": 4}`

### V001-04 (Estes C6-7, pressure)

- sha256 `6069b319732017e1c7f33ff7798f758301f8c45c7c3bd258d36b048658154fb9`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_C6-7_1.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6
- E7_liftoff_undefined: **pass** — liftoff at 0.094 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.050 s < 5 s
- E1_logger_loss: **pass** — 1189 baro samples; last sample at 59.445 s; max sample gap on ascent 0.051 s; 1044 samples after apogee
- E2_cato: **pass** — apogee 200.85 m AGL; ascent 7.151 s; step 200.85 m vs 6 sigma = 0.00 m
- E3_recovery: **pass** — impact sample yes (min post-apogee AGL -1.10 m); below-50 m descent >20 m/s: none
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-1.45, 200.85] m; native pad median 0.352 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'C6-7' matches the sealed record's 'Estes C6-7'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 201.2, "descent_rate_1s_fastest_below_50m_mps": -5.47, "descent_rate_1s_median_below_50m_mps": -4.01, "e3_literal_trigger": null, "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -14.59, "pad_available_drift_m": 0.0, "pad_available_s": 0.05, "pad_available_samples": 1}`

### V001-05 (Estes C6-7, pressure)

- sha256 `70ca39f9ed40c84d5dc558f8a166219e3cb71a8af0715edabafd02f65e884137`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_C6-7_2.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6
- E7_liftoff_undefined: **pass** — liftoff at 0.194 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.150 s < 5 s
- E1_logger_loss: **pass** — 1095 baro samples; last sample at 54.745 s; max sample gap on ascent 0.051 s; 953 samples after apogee
- E2_cato: **pass** — apogee 201.22 m AGL; ascent 6.901 s; step 201.22 m vs 6 sigma = 0.00 m
- E3_recovery: **pass** — impact sample yes (min post-apogee AGL -0.62 m); below-50 m descent >20 m/s: none
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-0.73, 201.22] m; native pad median 0.107 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'C6-7' matches the sealed record's 'Estes C6-7'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 201.33, "descent_rate_1s_fastest_below_50m_mps": -5.48, "descent_rate_1s_median_below_50m_mps": -4.37, "e3_literal_trigger": null, "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -14.64, "pad_available_drift_m": 0.0, "pad_available_s": 0.15, "pad_available_samples": 3}`

### V001-06 (Estes C6-7, pressure)

- sha256 `7bef1affbe0721f8aa22d799775d3b468f561b87cf95fb2f952d3be134c9f455`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_C6-7_3.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6
- E7_liftoff_undefined: **pass** — liftoff at 0.194 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.150 s < 5 s
- E1_logger_loss: **pass** — 1323 baro samples; last sample at 66.145 s; max sample gap on ascent 0.051 s; 1173 samples after apogee
- E2_cato: **pass** — apogee 216.08 m AGL; ascent 7.301 s; step 216.08 m vs 6 sigma = 1.03 m
- E3_recovery: **pass** — impact sample yes (min post-apogee AGL -0.50 m); below-50 m descent >20 m/s: none
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-0.73, 216.08] m; native pad median 0.224 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'C6-7' matches the sealed record's 'Estes C6-7'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 216.31, "descent_rate_1s_fastest_below_50m_mps": -4.75, "descent_rate_1s_median_below_50m_mps": -3.64, "e3_literal_trigger": null, "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -14.59, "pad_available_drift_m": 0.0, "pad_available_s": 0.15, "pad_available_samples": 3}`

### V001-07 (AeroTech D13-10W, pressure)

- sha256 `331cb6495d93760025fd526b7e63b727c03723bc0a6d7bba1590a5683937402e`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_D13-10W_1.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6, E3
- E7_liftoff_undefined: **pass** — liftoff at 0.144 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.100 s < 5 s
- E1_logger_loss: **pass** — 1340 baro samples; last sample at 66.995 s; max sample gap on ascent 0.051 s; 1151 samples after apogee
- E2_cato: **pass** — apogee 533.83 m AGL; ascent 9.301 s; step 533.83 m vs 6 sigma = 0.00 m
- E3_recovery: **fail** — impact sample yes (min post-apogee AGL -4.09 m); below-50 m descent >20 m/s: (56.995, -21.93)
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-4.00, 533.83] m; native pad median -0.092 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'D13-10W' matches the sealed record's 'AeroTech D13-10W'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 533.74, "descent_rate_1s_fastest_below_50m_mps": -18.56, "descent_rate_1s_median_below_50m_mps": -0.36, "e3_literal_trigger": [56.995, -21.93], "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -130.95, "pad_available_drift_m": 0.0, "pad_available_s": 0.1, "pad_available_samples": 2}`

### V001-08 (Quest QC6-5, pressure)

- sha256 `9be8158fc3e3329fad7b80d55068ffaffaa10978bd996afb5895c745c46c7311`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_QC6-5_1.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6, E3
- E7_liftoff_undefined: **pass** — liftoff at 0.244 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.200 s < 5 s
- E1_logger_loss: **pass** — 769 baro samples; last sample at 38.445 s; max sample gap on ascent 0.051 s; 603 samples after apogee
- E2_cato: **pass** — apogee 230.62 m AGL; ascent 8.051 s; step 230.99 m vs 6 sigma = 0.00 m
- E3_recovery: **fail** — impact sample yes (min post-apogee AGL -2.03 m); below-50 m descent >20 m/s: (29.145, -21.93)
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-2.54, 230.99] m; native pad median 0.518 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'QC6-5' matches the sealed record's 'Quest QC6-5'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 231.14, "descent_rate_1s_fastest_below_50m_mps": -12.04, "descent_rate_1s_median_below_50m_mps": -5.82, "e3_literal_trigger": [29.145, -21.93], "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -29.06, "pad_available_drift_m": 0.0, "pad_available_s": 0.2, "pad_available_samples": 4}`

### V001-09 (Quest QC6-5, pressure)

- sha256 `11f0326ad3e82f1ee5686aeba2d75506817d0387cf8f4bbfa2d5d2f33d208452`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_QC6-5_2.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6
- E7_liftoff_undefined: **pass** — liftoff at 0.144 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.100 s < 5 s
- E1_logger_loss: **pass** — 1354 baro samples; last sample at 67.695 s; max sample gap on ascent 0.051 s; 1190 samples after apogee
- E2_cato: **pass** — apogee 232.11 m AGL; ascent 8.051 s; step 232.48 m vs 6 sigma = 0.00 m
- E3_recovery: **pass** — impact sample yes (min post-apogee AGL -1.18 m); below-50 m descent >20 m/s: none
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-1.09, 232.48] m; native pad median -0.092 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'QC6-5' matches the sealed record's 'Quest QC6-5'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 232.02, "descent_rate_1s_fastest_below_50m_mps": -5.1, "descent_rate_1s_median_below_50m_mps": -4.01, "e3_literal_trigger": null, "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -14.59, "pad_available_drift_m": 0.0, "pad_available_s": 0.1, "pad_available_samples": 2}`

### V001-10 (Quest QC6-5, pressure)

- sha256 `09e271ff2df927a93fd3897e54ef5b7dc65cd9c77abcc7c8f5d73edb138cf0ee`; sealed path `R6-public-cohort/S01-dofpro/V001/Emerald_Streak_9MAR2017_QC6-5_3.csv`
- format: pressure; channels: Axial Accel (Gs), Baro (Atm), Current Draw (A), Lateral Accel (Gs), Temperature (F), Velocity (Accel-Ft/Sec), Volts Battery (V), Volts Pyro 3rd (V), Volts Pyro 4th (V), Volts Pyro Apogee (V), Volts Pyro Main (V), [Altitude (Accel-Ft)], [Altitude (Baro-Ft-AGL)], [Altitude (Baro-Ft-ASL)], [Velocity (Accel-Ft/Sec)], [Velocity (Accel-MPH)]
- status: **excluded**; excluded by E6, E3
- E7_liftoff_undefined: **pass** — liftoff at 0.194 s (<= 10 s) from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 0.150 s < 5 s
- E1_logger_loss: **pass** — 779 baro samples; last sample at 38.945 s; max sample gap on ascent 0.051 s; 618 samples after apogee
- E2_cato: **pass** — apogee 234.00 m AGL; ascent 7.851 s; step 234.00 m vs 6 sigma = 1.03 m
- E3_recovery: **fail** — impact sample yes (min post-apogee AGL -1.01 m); below-50 m descent >20 m/s: (29.045, -21.93)
- E4_altitude_channel: **pass** — barometric AGL channel present; finite=True; pad-relative range [-1.09, 234.00] m; native pad median 0.085 m (zero tolerance 10 m)
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename motor token 'QC6-5' matches the sealed record's 'Quest QC6-5'; the file header carries channel names only, no contradictory metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only; this is a pressure-log flight
- diagnostics: `{"apogee_if_pad_zero_m": 234.08, "descent_rate_1s_fastest_below_50m_mps": -11.66, "descent_rate_1s_median_below_50m_mps": -2.18, "e3_literal_trigger": [29.045, -21.93], "e3_smoothed_speed_median_below_50m_mps": 0.0, "e3_smoothed_speed_min_below_50m_mps": -21.93, "pad_available_drift_m": 0.0, "pad_available_s": 0.15, "pad_available_samples": 3}`

### V002-01 (AeroTech HP-I140W-14, gps)

- sha256 `0d43f917b3e413797b9307ebb0444a5ae1c6e37b7742d07dfa71bf9390b39748`; sealed path `R6-public-cohort/S01-dofpro/V002/2023-02-11__TkSpjutVul__20-07-29.csv`
- format: gps; channels: UTCTIME, UNIXTIME, ALT, LAT, LON, #SATS, FIX, HORZV, VERTV, HEAD, FLAGS, >40, >32, >24, RSSI, BATT
- status: **excluded**; excluded by E6, E3
- E7_liftoff_undefined: **pass** — liftoff at 3.900 s from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 3.900 s < 5 s
- E1_logger_loss: **pass** — 233 unique samples; last at 73.900 s; max ascent gap 0.600 s; 66 samples after apogee
- E2_cato: **pass** — apogee 3773.00 m AGL; ascent 14.800 s; 6 sigma = 0.00 m
- E3_recovery: **fail** — impact sample NO; min post-apogee AGL 1196.00 m; below-50 m descent >20 m/s: none
- E4_altitude_channel: **exempt** — V002 I140W is the rule's named GPS-only exemption; E9 applies instead
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename carries date and vehicle only, no motor; the custody manifest and spec declare V002/I140W-14 and the log header contradicts nothing
- E9_gps_only_loss: **pass** — 135 ascent GPS samples (min 10); fix flags present (FIX values [3], FLAGS ['0x03']); maximum is last sample = False
- diagnostics: `{"gps_vertical_speed_sources": "VERTV column present but not used for the apogee", "pad_available_s": 3.9, "pad_available_samples": 32}`
- caveat: vertical uncertainty unstated

### V002-02 (AeroTech HP-J270W-14, gps)

- sha256 `bf706a9e277df78e041b3fb2ec57ebe356c1486b18649699280088a7e43cd0f0`; sealed path `R6-public-cohort/S01-dofpro/V002/2023-07-08_DDVulcanite_J270_14-37-34.csv`
- format: gps; channels: UTCTIME, UNIXTIME, ALT, LAT, LON, #SATS, FIX, HORZV, VERTV, HEAD, FLAGS, >40, >32, >24, RSSI, BATT
- status: **excluded**; excluded by E6, E3, E4
- E7_liftoff_undefined: **pass** — liftoff at 2.600 s from a >3 m/s rise sustained >=0.2 s
- E6_pad_reference: **fail** — pad coverage 2.600 s < 5 s
- E1_logger_loss: **pass** — 319 unique samples; last at 145.500 s; max ascent gap 0.500 s; 123 samples after apogee
- E2_cato: **pass** — apogee 6660.00 m AGL; ascent 18.400 s; 6 sigma = 0.00 m
- E3_recovery: **fail** — impact sample NO; min post-apogee AGL 348.00 m; below-50 m descent >20 m/s: none
- E4_altitude_channel: **fail** — no barometric channel in this log; the E4 exemption is written for V002 I140W only
- E5_multiple_apogees: **pass** — 1 separate excursion(s) above 50 m AGL (5 m hysteresis)
- E8_design_mismatch: **pass** — filename names J270, matching the sealed record's J270W-14; no in-file motor metadata
- E9_gps_only_loss: **not_applicable** — E9 is scoped to V002 I140W only
- diagnostics: `{"gps_vertical_speed_sources": "VERTV column present but not used for the apogee", "pad_available_s": 2.6, "pad_available_samples": 26}`
- caveat: no rule-compliant extraction: the frozen E4 exemption is scoped to V002 I140W, so the GPS maximum is reported as a diagnostic only, not as a rule-compliant apogee

## Rules as applied (operational definitions, fixed before extraction)

- `altitude_channel_gps`: ALT column (m MSL); AGL = ALT - median(ALT, 5 s before liftoff)
- `ft_to_m`: x 0.3048 exactly
- `liftoff`: first sample t_i with t_i <= 10.0 s where some t_j >= t_i + 0.2 s has (z_j - z_i) > 3.0 m/s * (t_j - t_i)
- `pad_window`: [liftoff - 5.0 s, liftoff)
- `pad_median`: median of the altitude samples inside the pad window
- `running_median`: centred 5-sample median a'[i] = median(a[max(0,i-2) .. min(n-1,i+2)])
- `apogee_pressure`: max of the centred 5-sample running median of (sample - pad median), in metres AGL; earliest index wins ties
- `apogee_gps`: max of (ALT - pad median) in metres AGL; earliest index wins ties
- `E1_gap_threshold_s`: 1.0
- `E2_min_apogee_m`: 10.0
- `E2_min_ascent_s`: 1.0
- `E2_sigma_multiplier`: 6.0
- `E3_ballistic_speed_mps`: 20.0
- `E3_ballistic_below_agl_m`: 50.0
- `E3_impact_agl_m`: 5.0
- `E4_agl_bounds_m`: [-100.0, 10000.0]
- `E4_pad_zero_tolerance_m`: 10.0
- `E5_excursion_threshold_m`: 50.0
- `E5_hysteresis_m`: 5.0
- `E6_min_pad_s`: 5.0
- `E6_max_drift_m`: 10.0
- `E9_min_ascent_samples`: 10
- `duplicate_policy_gps`: rows with an identical UNIXTIME are merged; the file's duplicate rows were verified to carry identical ALT/FIX/FLAGS, so the first is kept

## Scope

- Only `blind-manifest.json` and the 12 listed logs were opened under `R6-public-cohort/`; no ORK, vehicle page, prose or archive.
- No engine, app or threshold change; no network.
- The author cannot self-accept.
