# SC1 — blind scoring and development comparison

Status: **blind result NOT AVAILABLE — 0 of 12 scorable under the frozen rules.**

Generated 2026-11-17T01:52:44Z.

The predictions were frozen at `cbdef58` (`docs/internal/execution-runs/BL1-blind-predictions/PREDICTIONS.json`) before any log was opened; the outcomes were extracted once, blind to the predictions, at `c0f473a` (`docs/internal/execution-runs/BX1-blind-extraction/OUTCOMES.json`). STEP0-BENCHMARK-SPEC §6 forbids changing an exclusion or extraction rule after the opening, so the rules below were not amended. The owner decision of 2026-11-16 records the blind result as not available and adds the NON-BLIND development comparison in §2.

## 1. Blind result: 0 of 12 scorable under the frozen rules

No score is reported in this part. Every flight is excluded by a rule written before the opening. Exclusions are quoted from `OUTCOMES.json`; they are not recomputed or reinterpreted here.

| flight | motor | format | excluded by | rule detail |
|---|---|---|---|---|
| V001-01 | Estes C6-5 | pressure | E6, E3 | **E6**: pad coverage 0.200 s < 5 s<br>**E3**: impact sample yes (min post-apogee AGL -1.74 m); below-50 m descent >20 m/s: (52.195, -21.93) |
| V001-02 | Estes C6-5 | pressure | E6 | **E6**: pad coverage 0.150 s < 5 s |
| V001-03 | Estes C6-5 | pressure | E6 | **E6**: pad coverage 0.200 s < 5 s |
| V001-04 | Estes C6-7 | pressure | E6 | **E6**: pad coverage 0.050 s < 5 s |
| V001-05 | Estes C6-7 | pressure | E6 | **E6**: pad coverage 0.150 s < 5 s |
| V001-06 | Estes C6-7 | pressure | E6 | **E6**: pad coverage 0.150 s < 5 s |
| V001-07 | AeroTech D13-10W | pressure | E6, E3 | **E6**: pad coverage 0.100 s < 5 s<br>**E3**: impact sample yes (min post-apogee AGL -4.09 m); below-50 m descent >20 m/s: (56.995, -21.93) |
| V001-08 | Quest QC6-5 | pressure | E6, E3 | **E6**: pad coverage 0.200 s < 5 s<br>**E3**: impact sample yes (min post-apogee AGL -2.03 m); below-50 m descent >20 m/s: (29.145, -21.93) |
| V001-09 | Quest QC6-5 | pressure | E6 | **E6**: pad coverage 0.100 s < 5 s |
| V001-10 | Quest QC6-5 | pressure | E6, E3 | **E6**: pad coverage 0.150 s < 5 s<br>**E3**: impact sample yes (min post-apogee AGL -1.01 m); below-50 m descent >20 m/s: (29.045, -21.93) |
| V002-01 | AeroTech HP-I140W-14 | gps | E6, E3 | **E6**: pad coverage 3.900 s < 5 s<br>**E3**: impact sample NO; min post-apogee AGL 1196.00 m; below-50 m descent >20 m/s: none |
| V002-02 | AeroTech HP-J270W-14 | gps | E6, E3, E4 | **E6**: pad coverage 2.600 s < 5 s<br>**E3**: impact sample NO; min post-apogee AGL 348.00 m; below-50 m descent >20 m/s: none<br>**E4**: no barometric channel in this log; the E4 exemption is written for V002 I140W only |

Counts: E6 (pad reference) fails 12 of 12; E3 (recovery) fails 6; E4 (altitude channel) fails 1 (V002-02). The frozen verdict is **0 usable flights**; the blind score is therefore **not available**, not zero and not a failure.

## 2. NON-BLIND development comparison

**Every row in this part is NON-BLIND development data.** It was computed after the logs were opened, under the four relaxed rules below. It is not a blind result and must never be reported as one. The relaxation was written and justified from the log structure before any prediction was compared with any measurement.

### 2.1 Relaxed rules (written and justified before the comparison)

**(a) Pad reference.** Use the median of all samples before liftoff; if there are fewer than 3, use the logger's own channel zero.
- *Justification (structure only):* every file starts at or within 3.9 s of ignition, so no file can supply the frozen 5 s pad window; the pre-liftoff spans are 0.05–3.9 s and carry 1–32 samples. Three samples is the smallest set whose median is not a single reading, and the pressure logger's AGL channel is already zeroed at the pad (pad medians are within 0.6 m of zero, and ASL − AGL is constant per file). The channel zero is the logger's own pad definition, not a value fitted to a result. GPS logs have no channel zero, so a GPS flight with fewer than 3 pre-liftoff samples would stay excluded (none does).

**(b) E3 ballistic test.** Use a 1 s window instead of adjacent samples.
- *Justification (structure only):* the barometric channel samples every 0.05 s and quantises in 0.37 m steps, so a three-step drop inside one interval reads 21.9 m/s even though the 1 s median descent rate in those files is only −0.4 to −5.8 m/s; the same artefact appears in four files. The relaxed test takes, for every post-apogee sample below 50 m AGL, the first later sample at least 1.0 s away (20 sample intervals), and fails only if the fastest such rate is below −20 m/s. The 20 m/s physical threshold is unchanged, the impact requirement (a sample at or below 5 m AGL) is unchanged, and no file's outcome is consulted to choose the window.

**(c) GPS-only exemption.** Extend the E4 GPS-only exemption to V002-02, carrying the caveat "vertical uncertainty unstated".
- *Justification (structure only):* V002-02 has the same 16-column GPS-only layout as V002-01 (UTCTIME/UNIXTIME/ALT/LAT/LON/#SATS/FIX/HORZV/VERTV/HEAD/FLAGS/…), no barometric channel, and FIX 3 with a valid fix flag in the pre-liftoff window. The frozen exemption names only V002-01; the channel structure of the two files is identical. The caveat is carried on every V002 row.

**(d) No touchdown, no measurement.** A log that ends airborne stays excluded; a missing touchdown is a real data gap.
- *Justification (structure only):* E3 requires an impact sample at or below 5 m AGL. Both V002 logs end while still descending, with their last samples 1196 m and 348 m above the pad and VERTV still negative. Rule (b) relaxes only the speed window; it does not supply a landing, and a file that stops while airborne cannot be distinguished from a logger or telemetry dropout after apogee. The frozen impact requirement therefore stands, and both Vulcanite flights remain unscored.

No other rule changes. For V001, E1, E2, E4, E5, E7 and E8 already pass; E6 is removed by (a) and E3 by (b). No rule file, threshold, prediction or outcome was edited.

### 2.2 Altitude reference check (V002 pad column is MSL; the apogee column is AGL above the pad)

The V001 logs carry `[Altitude (Baro-Ft-AGL)]` and `[Altitude (Baro-Ft-ASL)]`; their AGL channel is already pad-zeroed (ASL − AGL is constant to 0.02 ft per file). The V002 logs carry one GPS `ALT` column in metres MSL, so the pad median is MSL and the measured apogee is the difference. The extraction already applied that difference. Rechecking it from the custody copy:

| Mode | flight | raw max ALT (m MSL) | pad median (m MSL) | AGL arithmetic | AGL above pad (m) | extraction value |
|---|---|---|---|---|---|---|
| NON-BLIND | V002-01 | 6624.0 | 2851.0 | 6624.0 − 2851.0 = 3773.0 | 3773.00 | 3773.00 (already AGL) |
| NON-BLIND | V002-02 | 9515.0 | 2855.0 | 9515.0 − 2855.0 = 6660.0 | 6660.00 | 6660.00 (already AGL) |

So the apparent mix is a column-label mix, not a value mix: `apogee_agl_m` 3773.00 is already AGL (6624 − 2851), and 6660.00 is already AGL (9515 − 2855). Subtracting the pad median a second time would give 922 m and 3805 m, which is the error to avoid. Both V002 numbers remain unscored: their logs end airborne (rule d), and the vertical uncertainty is unstated.

For V001 the measured AGL is the maximum of the centred 5-sample running median of the native barometric AGL channel, in metres, as frozen in §6. Rule (a) changes only the pad reference where fewer than 3 pre-liftoff samples exist (V001-04, V001-07, V001-09 use the channel zero).

### 2.3 Per-flight comparison (NON-BLIND)

Signed error = (predicted − measured) / measured × 100. Negative means the prediction is low. The interval is the frozen qualified 5–95 % interval from `PREDICTIONS.json`.

| Mode | flight | airframe | motor | pad samples used | pad reference | pad ref (m) | measured AGL (m) | predicted nominal (m) | signed error % | 5–95 % interval (m) | inside? |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **NON-BLIND** | V001-01 | Estes Emerald Streak | Estes C6-5 | 4 | median of all pre-liftoff samples | 0.439 | 232.19 | 158.64 | -31.67 | 140.66–177.13 | **no** |
| **NON-BLIND** | V001-02 | Estes Emerald Streak | Estes C6-5 | 3 | median of all pre-liftoff samples | 0.411 | 240.98 | 158.64 | -34.17 | 140.66–177.13 | **no** |
| **NON-BLIND** | V001-03 | Estes Emerald Streak | Estes C6-5 | 4 | median of all pre-liftoff samples | 0.599 | 214.94 | 158.64 | -26.19 | 140.66–177.13 | **no** |
| **NON-BLIND** | V001-04 | Estes Emerald Streak | Estes C6-7 | 1 | logger channel zero (fewer than 3 pre-liftoff samples) | 0.000 | 201.20 | 158.64 | -21.15 | 140.66–177.13 | **no** |
| **NON-BLIND** | V001-05 | Estes Emerald Streak | Estes C6-7 | 3 | median of all pre-liftoff samples | 0.107 | 201.22 | 158.64 | -21.16 | 140.66–177.13 | **no** |
| **NON-BLIND** | V001-06 | Estes Emerald Streak | Estes C6-7 | 3 | median of all pre-liftoff samples | 0.224 | 216.08 | 158.64 | -26.58 | 140.66–177.13 | **no** |
| **NON-BLIND** | V001-07 | Estes Emerald Streak | AeroTech D13-10W | 2 | logger channel zero (fewer than 3 pre-liftoff samples) | 0.000 | 533.74 | 315.89 | -40.82 | 295.56–341.92 | **no** |
| **NON-BLIND** | V001-08 | Estes Emerald Streak | Quest QC6-5 | 4 | median of all pre-liftoff samples | 0.518 | 230.62 | 172.28 | -25.30 | 153.04–192.10 | **no** |
| **NON-BLIND** | V001-09 | Estes Emerald Streak | Quest QC6-5 | 2 | logger channel zero (fewer than 3 pre-liftoff samples) | 0.000 | 232.02 | 172.28 | -25.75 | 153.04–192.10 | **no** |
| **NON-BLIND** | V001-10 | Estes Emerald Streak | Quest QC6-5 | 3 | median of all pre-liftoff samples | 0.085 | 234.00 | 172.28 | -26.38 | 153.04–192.10 | **no** |

Flights excluded from the development comparison:

| Mode | flight | measured AGL (m) | reason not scored |
|---|---|---|---|
| **NON-BLIND** | V002-01 | 3773.00 | E3 via rule (d): no impact sample, log ends airborne<br>applied: E6 removed by (a) |
| **NON-BLIND** | V002-02 | 6660.00 | E3 via rule (d): no impact sample, log ends airborne<br>applied: E4 removed by (c), E6 removed by (a)<br>caveat: vertical uncertainty unstated |

For the four V001 flights whose frozen E3 verdict came from one 0.05 s interval, the relaxed fastest 1 s rates below 50 m AGL are −5.84, −18.56, −12.04 and −11.66 m/s (V001-01, V001-07, V001-08, V001-10). All four are slower than the unchanged −20 m/s threshold and all four have an impact sample, so (b) admits them.

The V002 measured values are shown for the altitude check only; they are not errors and are not part of any summary number.

### 2.4 Summary on the included flights (spec §6.6)

Included: **10 of 12** flights, all Estes Emerald Streak, all subsonic.

| Mode | metric | result | criterion | verdict |
|---|---|---|---|---|
| **NON-BLIND** | per-airframe median signed error, Estes Emerald Streak (n=10) | **-26.29 %** | ±10 % | **FAIL** |
| **NON-BLIND** | per-vehicle ±10 % test (all included airframes) | median signed error -26.29 % | every airframe within ±10 % | **FAIL** |
| **NON-BLIND** | flights within ±10 % | 0 of 10 | — | reported |
| **NON-BLIND** | mean \|error\| (mean absolute signed error) | **27.92 %** | ≤ 5.0 % | **FAIL** |
| **NON-BLIND** | interval coverage | **0 of 10** (0.0 %) | 80 % reference (P8; reported, not gated here) | 0 % — far below the reference |

Per-motor medians (context; the prediction is per motor):

| Mode | motor | n | median signed error % |
|---|---|---|---|
| **NON-BLIND** | AeroTech D13-10W | 1 | -40.82 |
| **NON-BLIND** | Estes C6-5 | 3 | -31.67 |
| **NON-BLIND** | Estes C6-7 | 3 | -21.16 |
| **NON-BLIND** | Quest QC6-5 | 3 | -25.75 |

## 3. What it means

All 12 flights fly the **legacy** 25-station Mach drag tables. The engine's own `runManifest.axialDrag` line says so for both designs: the calibrated (built-up) method refuses the freeform fin planform ("the calibrated method models trapezoidal fins only"). The frozen predictions record the same for every flight (`PREDICTIONS.json` `dragModel`). None of this comparison therefore tests the new default drag model; it measures the legacy fallback the app still uses for these two airframes.

On **Emerald Streak** the legacy fallback is **low by a median of 26.3 %** (signed -26.3 %, i.e. predicted apogee below measured), with a range of -40.8 % to -21.1 % over 10 flights. All 10 measurements sit **above** the frozen 5–95 % band, so the band is not merely centred wrong: it is entirely below the measured apogees. The direction is consistent with an over-draggy legacy table; this comparison alone does not prove the cause. The sign holds across four motors (C6-5, C6-7, D13-10W, QC6-5) and a 2.65× apogee range (201–534 m).

On **Vulcanite** no flight is included: both logs end airborne (rule d), so no Vulcanite error is reported and none is used in the summary. The two measured AGL apogees (3773 m and 6660 m) are recorded only to check the altitude reference; their vertical uncertainty is unstated.

The blind claim stays **pending**: a blind test of the new default model still needs logs that satisfy the frozen rules (5 s of pad data, a touchdown, and a barometric channel, or a GPS-only exemption that names the flight). This development comparison cannot substitute for it and must not be quoted as one.

## 4. Reproduction and scope

```
python3 docs/internal/execution-runs/SC1-blind-scoring/score_blind.py
```

Inputs: `PREDICTIONS.json` at `cbdef58`, `OUTCOMES.json` at `c0f473a`, and the 12 custody copies under `/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/outcomes/`; each copy's sha256 is re-checked against `OUTCOMES.json` before it is parsed. No file under `R6-public-cohort/` is opened; no network is used. The script writes this file in two steps: the blind result and the relaxed rules first, the comparison second.

No prediction, outcome, rule file, threshold, engine or app source was edited. The author cannot self-accept.

