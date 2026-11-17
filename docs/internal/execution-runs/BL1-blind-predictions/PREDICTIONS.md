# BL1 — blind predictions, phase 1 (no outcomes opened)

Status: **frozen before any opening.** Source commit f7a893489c5c7063653beaa810b81c84a3b1dcba.
**Round 2 arithmetic: 12 of 12 flights predicted.** The four missing curves were supplied by
the owner on 2026-11-16 (ThrustCurve.org API, downloaded by the orchestrator) and imported
through the app's own RASP parser; the six round-1 rows are unchanged from commit `bee7329`.
**0 outcomes opened.**
WASM `src/engine/astraea_engine.wasm` sha256
`4c1ec4ed7192f0f0eab9206481e74d2627c3a2f8010376a69f9194df10824535` (asserted by the probes).
Lane: `bl1-blind-predictions`. Protocol: STEP0-BENCHMARK-SPEC §6, steps 1–3 only. No
flight log, vehicle page, custody manifest, published result or book was opened.

Inputs (the only ones used):

| Input | Value |
|---|---|
| `V001-Estes_Emerald_Streak.design.xml` | sha256 `275a50c5f5318aec031066af216c9719a724d55b15740b0b3b26cbf8ceec5e98` |
| `V002-DDVulcanite.design.xml` | sha256 `18e54445961696bb1ffc9af670816faa2febd3b94a439ad8429b79c25230ad67` |
| Sealed flight list | STEP0-BENCHMARK-SPEC §6 "Sealed list" |
| Motor curves | `step4-blind/motors/` (owner-authorized downloads): D13W `1940ce3c…`, Quest C6 `08d25d4f…`, I140W `7986dc11…`, J270W `602eda39…`; `SHA256SUMS` and `PROVENANCE.json` in the same folder |
| Motors | the app's own `src/propulsion/motorDatabase.ts` (`CERTIFIED_MOTORS`) |
| Physics | the released WASM above, through the app's `vehicleDto`/`motorDto`/`flightRunOptions` |
| Motor import | the app's own `parseRaspEng` (`src/formats/engParser.ts`) |

## 1. Qualification

### 1.1 The app's own import path refuses both designs

Both staged files are the ORK's `rocket.ork` XML with `<simulations>` and `<flightdata>`
removed. Packed as an `.ork` and imported through `parseOrkFile` (the app's only ORK path,
`src/io/files.ts:256-267`), each is refused:

| Design | Refusal (`InvalidOrkFileError`) |
|---|---|
| V001 | `Unsupported mass/CG override on 'Sustainer'` |
| V002 | `Unsupported mass/CG override on 'Stage'` |

`src/formats/orkParser.ts:354-356` refuses any stage mass override and any `overridecg`.
V001's stage carries `overridemass 0.07161` + `overridesubcomponentsmass=true`; V002's carries
`overridemass 1.0552` + `overridecg 0.739775` + `overridesubcomponentscg=true`.

Two further importer behaviours matter and are recorded in `EVIDENCE.json`:

1. The importer drops every nested element attribute (`fast-xml-parser` `preserveOrder` puts
   them beside the child list; `orderedNodeToLegacy` never merges them). A fin seat declared
   `method="bottom"` is therefore read as a top offset. Both designs declare their fin sets
   that way, so the imported airframe is unstable and its "flight" is a dud: V001 static
   margin −0.500 caliber, apogee 20.1 m at Mach 0.096; V002 −0.437 caliber (recorded as
   `unreconstructed` in PREDICTIONS.json). This is a product finding, not a property of the
   design.
2. The importer discards components it does not model (`innertube` motor mounts,
   `tubecoupler`, `bulkhead`, `centeringring`). Their mass is covered by the stage override;
   their CG contribution is not.

**Consequence.** The prediction is made on a *declared-design reconstruction*: geometry and
component masses from the app's importer, then the design's own declared fin seats, component
CG overrides and stage mass/CG re-applied from the XML. Every applied number comes from the
design; the reconstruction code is `probe-lib.ts` (`collectDesignDeclarations`,
`applyDeclaredFinSeats`, `applyDeclaredComponentCg`, `applyDeclaredStageOverride`). The
reconstruction reproduces the declared stage mass to 1e-9 kg and, where declared, the stage CG
to 1e-6 m; static margins are positive and large (2.75 caliber V001, 8.80 V002).

### 1.2 Inputs

| Input | V001 Emerald Streak | V002 DD Vulcanite | Source | Uncertainty |
|---|---|---|---|---|
| Geometry | nose ogive 0.11684 m, Ø0.025 m tubes, 0.53594 m long | nose ogive 0.2413 m, Ø0.028702 m, 1.51765 m long | design XML | ±0.5 mm station; ORK written by OpenRocket 22.02 |
| Structural mass | 0.07161 kg (stage override) | 1.0552 kg (stage override) | design XML `<overridemass>` | ±1 g (spec: page-vs-ORK mass gap), in the scenario set |
| CG | 0.314814 m from nose (computed by the app from the imported parts; the stage `overridecg 0.31496` is inert with `overridesubcomponentscg=false`) | 0.739775 m from nose (stage override, applied) | design XML | V001 ±0.02 m (dropped mount/coupler CG); V002 ±0.0349 m (spec: page-vs-ORK CG gap), measured sensitivity in §5 |
| Motor | Estes C6 (bundled) for C6-5 ×3 and C6-7 ×3; D13W and Quest C6 (imported) | I140W and J270W (imported) | spec; app database; ThrustCurve files | see §1.3 |
| Rail | 3.0 m, 85° | 3.0 m, 85° | not recorded; app default (`DEFAULT_WORKSPACE`) | 1.2–3.0 m (scenario set); angle fixed at 85° plus the MC 1° σ |
| Launch altitude | sea level (engine default) | sea level (engine default) | not recorded | 0–400 m ASL (scenario set) |
| Site temperature | standard day (engine default, no `launchSiteTemperatureC`) | same | not recorded | 0–30 °C (scenario set) |
| Wind | 3.0 m/s surface, azimuth 0 | same | not recorded | 0–5 m/s (scenario set); direction via the app's 10° σ |
| Nozzle exit | not declared in the design; none sent | not declared; none sent | design XML has no `nozzleExitDiameter` | none |
| Surface finish | not declared in the design; method default | same | design XML | none |
| Drag model | **legacy 25-station tables**, confirmed from the engine's own `axialDrag` line: *"legacy 25-station Mach drag tables … legacy drag used (refused: … freeform planform; the calibrated method models trapezoidal fins only)"* | **legacy**, same refusal (freeform fin set) | engine `runManifest.axialDrag` | n/a |

### 1.3 Motors: all 12 flights are now flyable

Round 1 used only the app's bundled database (five records). Round 2 adds the four curves the
owner authorized, each read from
`/home/ak/astraea-evidence/goal-collegiate-accuracy/step4-blind/motors/`, its sha256 asserted
against the folder's `SHA256SUMS`, and parsed with the app's own `parseRaspEng`
(`src/formats/engParser.ts`). Geometry in every file matches the motor entry in the design
(diameter and length).

| Motor | Flights | File (sha256 prefix) | Data source | Parsed: impulse / burn / peak / prop / total / points |
|---|---|---|---:|---|
| Estes C6 | V001-01..03 (C6-5), V001-04..06 (C6-7) | bundled `estes_c6` | cert (bundled NAR curve) | 8.8 N·s / 1.86 s / 14.09 N / 0.0108 / 0.0231 kg / 25 |
| AeroTech D13-10W | V001-07 | `AeroTech_D13W.eng` (`1940ce3c`) | **cert** | 19.2634 N·s / 1.520 s / 23.610 N / 0.0098 / 0.0326 kg / 32 |
| Quest QC6-5 | V001-08..10 | `Quest_C6.eng` (`08d25d4f`) | **cert** | 9.1856 N·s / 2.247 s / 23.234 N / 0.0083 / 0.0216 kg / 30 |
| AeroTech HP-I140W-14 | V002-01 | `AeroTech_HP-I140W.eng` (`7986dc11`) | **manufacturer (no cert file)** | 339.2630 N·s / 2.478 s / 179.023 N / 0.183 / 0.356 kg / 24 |
| AeroTech HP-J270W-14 | V002-02 | `AeroTech_HP-J270W.eng` (`602eda39`) | **manufacturer (no cert file)** | 701.4704 N·s / 2.563 s / 367.585 N / 0.381 / 0.642 kg / 39 |

`Quest_C6.eng` is the Quest C6-0 curve (the cert file ThrustCurve holds); it is used for the
QC6-5 flights because apogee is delay-independent in this engine (deployment is
altitude/apogee-driven). The D13W file carries delays 4-7-10; only its curve is used.

Provenance: `motors/PROVENANCE.json` records the ThrustCurve motor ids (`5f4294d2…0021`
D13W, `…0016` Quest C6, `…03f5` I140W, `…03f7` J270W), simfile ids and the `source` field
(`cert` or `mfr`). The ORK motor digests are OpenRocket digests, not ThrustCurve ids, so curve
identity rests on designation + declared geometry + those ThrustCurve records; recorded as an
assumption.

**Manufacturer-data handling.** I140W and J270W are `source: mfr`: no NAR/TRA certificate and
no published batch tolerance. Their qualified interval therefore adds a declared **base
impulse bracket of ±10 %** on top of the app's 5 % per-run sigma (10 000 runs: 8 shared
scenarios + `mfr-impulse-plus-10pct` + `mfr-impulse-minus-10pct`). The bracket is an
assumption, stated, not measured, and not tuned to any outcome. The *product* interval for
those two flights stays at the app's own 5 % sigma. D13W and Quest C6 are cert curves and keep
the same 8-scenario method as round 1.

Nominal maximum Mach: Emerald C6 0.190, D13W 0.386, Quest C6 0.177 (all subsonic); Vulcanite
I140W 0.581 (subsonic) and J270W 1.013 (transonic). The Vulcanite J270W is the only transonic
flight in the blind pool.

**Drag: the DD Vulcanite does NOT test the built-up model.** Both Vulcanite flights return
the legacy line from `runManifest.axialDrag`: *"legacy 25-station Mach drag tables … legacy
drag used (refused: … freeform planform; the calibrated method models trapezoidal fins
only)"*. The design's fin set is a freeform clipped delta, so the calibrated method refuses it
exactly as it refuses the Emerald's freeform fins. The only set that could test the new
built-up drag cannot; this is the answer to that question, not a missing run. The Emerald
D13W/QC6 flights also fly legacy.

## 2. Exclusion rules (written before any opening)

A flight is excluded only by one of these rules, each checkable from the log alone. The
custodian applies them before extraction; the rule id is recorded with the flight.

| Rule | Excludes a flight when |
|---|---|
| E1 logger loss | The log has no continuous sample through the apogee sample (truncated file, gap > 1 s in the ascent, or the file does not parse). |
| E2 CATO / no flight | Apogee above the pad is < 10 m AGL, or the ascent lasts < 1 s, or there is no altitude step above the 5 s pre-liftoff median plus its 6σ noise. |
| E3 recovery failure | The descent is ballistic: the post-apogee vertical speed exceeds 20 m/s at any sample below 50 m AGL, or the impact sample is missing. Apogee is not scored from a flight whose airframe was not recovered under canopy. |
| E4 no usable altitude channel | The log carries no pressure-altitude/barometric channel (GPS-only logs are E4-exempt for the V002 I140W flight and use the GPS rule in §3), or the channel is non-finite, out of range (< −100 m or > 10 000 m AGL), or not zeroed at the pad. |
| E5 multiple apogees | More than one local maximum above 50 m AGL (staging, a second burn, or two flights in one file). The extraction rule would otherwise score the wrong peak. |
| E6 pad reference unusable | Fewer than 5 s of pre-liftoff samples, or the pre-liftoff median drifts by more than 10 m across that window (not stationary on the pad). |
| E7 liftoff undefined | No sample in the first 10 s shows an ascent rate above 3 m/s for at least 0.2 s; the motor burn cannot be located. |
| E8 declared design mismatch | The log's own metadata names a motor or airframe different from the sealed flight record. (If the log has no metadata this rule cannot fire; the flight is scored.) |
| E9 GPS-only loss (V002 I140W only) | Fewer than 10 GPS altitude samples during the ascent, no fix/quality flag, or the maximum altitude is the last sample (truncated). Reported with "vertical uncertainty unstated" when scored. |

No outcome-based exclusion exists. A flight that shows an anomaly not covered above is
reported, not dropped. Excluded flights stay in the report with the rule id.

**Round 2 adds no rule.** E9 already covers the only GPS-only flight (V002 I140W); E1–E8 cover
the pressure logs. No rule was added or changed after seeing data (no data was seen).

## 3. Extraction rule (frozen per set)

- **V001, all 10 flights (pressure):** altitude above the pad = sample − median of the 5 s
  before liftoff; apogee = maximum of a centred 5-sample running median of that series.
- **V002 J270W-14 (pressure):** same rule.
- **V002 I140W-14 (GPS-only):** apogee = maximum GPS altitude above the pad median, reported
  with **"vertical uncertainty unstated"**.
- The measured value is AGL; the prediction is AGL (launch altitude ASL 0 in the product
  default, so ASL = AGL here).
- **Round 2 additions:** V001-07 (D13W) and V001-08..10 (Quest C6) use the same V001 pressure
  rule; V002-02 (J270W) uses the V002 pressure rule; V002-01 (I140W) uses the GPS-only rule
  above, with "vertical uncertainty unstated". No extraction rule changed.

## 4. Predictions

The nominal is the unperturbed app-default flight on the released WASM. The interval is the
qualified 5–95 % of §5. Both are AGL. Estes C6-5 and C6-7 share the same motor record and one
trajectory: apogee does not depend on the ejection delay in this engine.

| Flight | Motor | Drag / motor data | Nominal apogee | 5–95 % |
|---|---|---|---:|---:|
| V001-01 | Estes C6-5 | legacy / cert | 158.6 m | 140.7–177.1 m |
| V001-02 | Estes C6-5 | legacy / cert | 158.6 m | 140.7–177.1 m |
| V001-03 | Estes C6-5 | legacy / cert | 158.6 m | 140.7–177.1 m |
| V001-04 | Estes C6-7 | legacy / cert | 158.6 m | 140.7–177.1 m |
| V001-05 | Estes C6-7 | legacy / cert | 158.6 m | 140.7–177.1 m |
| V001-06 | Estes C6-7 | legacy / cert | 158.6 m | 140.7–177.1 m |
| V001-07 | AeroTech D13-10W | legacy / cert | 315.9 m | 295.6–341.9 m |
| V001-08 | Quest QC6-5 | legacy / cert | 172.3 m | 153.0–192.1 m |
| V001-09 | Quest QC6-5 | legacy / cert | 172.3 m | 153.0–192.1 m |
| V001-10 | Quest QC6-5 | legacy / cert | 172.3 m | 153.0–192.1 m |
| V002-01 | AeroTech HP-I140W-14 | legacy / **mfr** | 1079.7 m | 949.4–1214.6 m |
| V002-02 | AeroTech HP-J270W-14 | legacy / **mfr** | 1874.0 m | 1723.9–2035.7 m |

Exact values in `PREDICTIONS.json`. The first six (round 1, unchanged): nominal
158.64482146922478 m, interval [140.66479033716993, 177.1252110646571] m. Round 2:

| Flights | Nominal (m) | Qualified 5–95 % (m) | Product-only 5–95 % (m) |
|---|---:|---:|---:|
| V001-07 | 315.88728452122143 | 295.5613915213592 – 341.9237728011707 | 295.605550498635 – 335.1355837975023 |
| V001-08..10 | 172.27569656462566 | 153.03938250681023 – 192.09846457424766 | 154.20989306998658 – 189.5560219172358 |
| V002-01 | 1079.71805405715 | 949.3746123538143 – 1214.5982875595034 | 984.3272825263606 – 1171.5638432360258 |
| V002-02 | 1873.9911987839314 | 1723.9021917925506 – 2035.7343484173914 | 1764.8630263441607 – 1969.9609442084738 |

**Read this before scoring.** These are the released engine's answers for the design *as
declared*. The app itself cannot import either file (§1.1: mass/CG override refusal; the fin
`method` attribute is lost), so a user cannot reproduce these numbers through the product's
import path until both importer defects are fixed. The prediction tests the physics, not the
import-to-prediction path. This is a bounded result, not a product claim.

**V002-01 is GPS-only.** Its measured value is the maximum GPS altitude above the pad median,
reported with "vertical uncertainty unstated" (spec §6.4); the scoring must carry that caveat,
which is not part of the model interval above.

**No change to the first six.** The round-1 rows are byte-identical to commit `bee7329`; no
error was found in them. Round 2 only replaces the six rows that were "not qualified" because
their motor was missing.

## 5. Monte Carlo

**Sampler and settings.** The app's own ensemble: `per-run-v2`, run seed **20260927**, sigmas
**10° wind azimuth / 1° rail angle / 5 % impulse**, 1 000 runs per scenario. Round 1 (Estes
C6, 6 flights) and the two cert-curve round-2 configs (D13W, Quest C6) run 8 scenarios each;
the two manufacturer-curve configs (I140W, J270W) run 10 (the shared 8 plus
`mfr-impulse-plus-10pct` and `mfr-impulse-minus-10pct`). Total: 8 000 (C6) + 8 000 (D13W) +
8 000 (Quest C6) + 10 000 (I140W) + 10 000 (J270W) = **44 000 flights**, 0 failed.
`20260927`, the sigmas and `nRuns = 100` are
`DEFAULT_WORKSPACE` (`src/application/workspace.ts:55-85`); 1 000 is the UI's maximum run
count (`Flight.tsx:297`) and is used so the 5 % and 95 % nearest-rank quantiles are stable.
The sampler is the engine's: `subSeedOf(seed, i)` → `mulberry32` → draws in the fixed order
wind azimuth → folded rail elevation → impulse (`crates/astraea-core/src/monte_carlo.rs:463-497`,
mirrored by `src/sim/monteCarlo.ts`).

**Why a replay.** The app's ensemble command returns landing points only, not apogee (spec
Amendment 2). The probe therefore replays each run's draw and calls the same engine flight,
reading `apogeeAltitude`. The replay is verified against the engine's own `run_ensemble_chunk`:
25 runs, **maximum landing-position difference 0.0 m** (bit-identical), for the flown airframe.

**Scenarios** carry the inputs the flights did not record. Each is its own app ensemble with
the sigmas above; the qualified interval is the union over that motor's scenarios (8 000 or
10 000 samples). The interval rule is nearest-rank `ceil(p/100·n) − 1`, the engine's own
percentile rule. The table below is the shared eight; the two manufacturer brackets are
described in §1.3.

| Scenario | Why | p5 (m) | median (m) | p95 (m) |
|---|---|---:|---:|---:|
| app-default | sea level, ISA, 3.0 m/85° rail, 3 m/s wind | 142.3 | 159.4 | 174.3 |
| site-400m-0°C | unrecorded site | 142.2 | 159.2 | 174.1 |
| site-400m-30°C | unrecorded site | 148.0 | 166.2 | 182.1 |
| wind-0 | unrecorded weather | 150.3 | 167.6 | 182.5 |
| wind-5 | unrecorded weather | 133.3 | 150.5 | 165.8 |
| rail-1.2 m | unrecorded launcher | 139.9 | 157.2 | 172.3 |
| mass +1 g | page-vs-ORK mass gap | 141.0 | 158.1 | 173.0 |
| mass −1 g | page-vs-ORK mass gap | 143.7 | 160.7 | 175.5 |
| **union** | **qualified 5–95 % used for V001-01..06** | **140.7** | **159.7** | **177.1** |

Round-2 motors, same columns plus the two manufacturer brackets where they apply:

| Motor | Flights | Scenarios | Runs | Product p5 / p50 / p95 | Qualified p5 / p95 |
|---|---|---:|---:|---|---|
| AeroTech D13W (cert) | V001-07 | 8 | 8 000 | 295.6 / 316.7 / 335.1 | 295.6 / 341.9 |
| Quest C6 (cert) | V001-08..10 | 8 | 8 000 | 154.2 / 173.1 / 189.6 | 153.0 / 192.1 |
| HP-I140W (mfr) | V002-01 | 10 | 10 000 | 984.3 / 1083.8 / 1171.6 | 949.4 / 1214.6 |
| HP-J270W (mfr) | V002-02 | 10 | 10 000 | 1764.9 / 1878.8 / 1970.0 | 1723.9 / 2035.7 |

The two manufacturer brackets dominate the I140W/J270W qualified width: at base impulse
+10 % the I140W median is 1192.3 m, at −10 % it is 969.2 m; the J270W is 1989.9 m / 1748.1 m.
The certified-curve motors (D13W, Quest C6) keep the same eight scenarios as round 1.

Limits of the interval, stated rather than hidden:

- The MC covers wind azimuth, rail angle and motor impulse only. Site altitude, site
  temperature, wind speed, rail length and structural mass have no sigma in the product's
  ensemble API; their effect enters only through the scenario set (eight shared, plus the two
  manufacturer brackets for V002). A flight outside those bounds is outside this prediction's
  stated coverage.
- The Vulcanite page-vs-ORK CG gap (34.9 mm) is not a scenario because it does not move the
  answer: shifting the stage CG ±34.9 mm changes the I140W apogee from 1079.72 m to
  1079.29 m / 1080.21 m (−0.43 / +0.49 m, under 0.05 %), measured by
  `01b-extra-qualify.probe.ts` at the 8.8-caliber static margin.
- This is a **dispersion band, not a model-error band**. The model's development error is not
  in it: on the frozen cohort the legacy default is 7.02 % MAE subsonic and 7.57 % transonic,
  the improved model 5.54 % / 5.40 % (STEP0-BENCHMARK-SPEC §2 and Amendment 3, development
  data). All 12 blind flights here fly legacy drag; the Emerald rows are subsonic (Mach
  0.18–0.39) and the Vulcanite J270W is transonic (Mach 1.01). The expected error is of that
  order, not the ±11–13 % of these intervals alone. Coverage is reported, never tuned; an 80 %
  blind coverage claim cannot rest on these bands by themselves.

## 6. Freeze

`PREDICTIONS.json` carries the source SHA, WASM hash, both design hashes, the four downloaded
motor files and their provenance, every assumption, the reconstruction steps, the scenario
sets, the seed, the sigmas, the run counts and all 12 per-flight values. The probes and their
raw outputs (outside Git where large) reproduce every number from the two design files, the
motor files, the app parser and the WASM hash.

The six round-1 rows (`V001-01..06`) are copied verbatim from commit `bee7329` and asserted
JSON-identical by `03b-freeze.probe.ts`; they were not recomputed and no error was found in
them. The round-1 `sets` placeholder that said the Vulcanite had "no bundled motor" is removed
because round 2 supplies the curves; that metadata string was never a prediction.
