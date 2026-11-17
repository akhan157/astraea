# S4 Gate 1 — non-apogee evidence inventory (in progress)

Base 64313c8aa52aaa4516a9e1302f865a34ba1b34d4. Research only; no comparison was run. This author cannot self-accept. The inventory is not exhaustive and the dispositions below are provisional: do not treat an unlocated source as proof that no evidence exists.

| Output | Located measured source and disposition |
|---|---|
| Rail-exit speed | Not established. Raven FIP logs below contain independent-clock axial acceleration and accelerometer-integrated velocity, but `src/validation/development/dofproCases.ts` records actual rail geometry and ignition-to-recorder offset as unknown. A rail-exit event and velocity at that event are missing; the channels alone do not identify it. |
| Stability margin | No direct flight measurement identified. A measured CG together with independently measured aerodynamic CP at the same configuration and flow condition would be a proxy. ORK geometry/CG and modeled CP are not a measured margin. |
| Maximum Mach | Candidate comparable, n=1: `R40-published-cohort/cohort_manifest.json`, Proteus 6 notes report maximum velocity 3201 ft/s, Mach 2.94, mean of two integrated accelerometers. Source does not state how Mach was derived; compare only if its air-relative definition and atmosphere are established. Astraea reports macro-sampled air-relative Mach (`docs/internal/output-dictionary.md`). Otherwise retain as non-comparable. |
| Time to apogee | Candidate comparable, n=4 admitted development cases: `flight-data/cosmic-cargo-2986.csv` metadata gives 7.454 s; `flight-data/dofpro/G69_30JUN2017_G69N-P_1_FIP.csv`, `TopShot_14DEC2017_E12-6_1.csv`, `20210417_Adventurer_J510W_1_Raven.csv` have timestamped barometric AGL channels. `src/validation/development/benchmark.ts` and `dofproCases.ts` define their respective clock and input assumptions. Use source-record clock to barometric peak, report clock offset uncertainty, and compare to simulated ignition-to-physical peak. [INFERENCE] This is a diagnostic comparison, not a synchronized measurement of ignition-to-peak. Eleven G69 development logs exist, but only the first is registered in the development benchmark; `docs/flight-validation/mini-dx3-protocol.md` describes all 11. Their eligibility and event clocks remain to be inventoried. |
| Drogue descent rate | No phase-specific measured rate established. Barometric altitude histories and pyro channels exist in Raven logs; actual recovery configuration, identifiable deployment events and matched phase intervals need qualification before comparison. Proteus 6 notes give total parachute descent time of 529 s, not a drogue rate. |
| Main descent rate | Cosmic Cargo metadata in `docs/flight-validation/cosmic-cargo-2986-excerpt.csv` reports descent velocity -7.559 m/s and landing velocity -9.786 m/s; phase and averaging definitions and as-flown recovery configuration are not established. Raven channels above may support phase-specific barometric slopes, but need event and interval qualification. No comparable phase-specific rate established. |
| Landing drift | Qu8k notes in R40 manifest say it landed only 3 miles from launch, without coordinates, uncertainty or precise distance. No matched measured displacement identified. Wind and landing coordinates or a documented displacement are needed. |

R40, R41, R42, R44 and R47 include modeled outputs; cached maxima and flight results are not independent measurements. The R40 manifest's Proteus notes and Qu8k note are source-attributed observations, not cached simulation values. `docs/flight-validation/candidates.md` documents additional Raven and Featherweight candidates and their unresolved clock, unit and model association issues. `flight-data/development-admission-roles-2026-10-22.json` reserves Emerald Streak and Vulcanite; do not consume their flight samples to fill gaps. Holdout directories were not opened.

## Proposed fixed reporting rules

Before executing, freeze the eligible flight list, source hashes, event and measurement definitions, input assumptions, and treatment of missing data. For each eligible flight use one row: flight ID; source and measurement method; measured event definition and value/unit; candidate event definition and value/unit; signed candidate-minus-measured difference; percent difference only for nonzero measurement; availability and limitations. Record every eligible flight and failure, never select by agreement. State n and source limitations; do not infer physical qualification or change thresholds. Do not equate accelerometer-integrated ground/axial velocity with air-relative Mach without a defensible conversion. For time-to-apogee retain the logger clock offset and sampled peak uncertainty. A measurement without comparable event definition is reported as unavailable, not silently dropped. For outputs finally established to lack comparable measured data, the Release Readiness Report must state “no evidence” and name the missing measurement.

## Rule sources

`docs/internal/competitive-landscape-and-minimum-bar.md` cites IREC/Spaceport America Cup Rules & Requirements and DTEG 2024 v1.1.3 and 2026 v1.1, including a simulation profile and recovery information. Specific IREC rail-exit speed, stability-margin and descent-rate thresholds: not cited in repo in the material inspected. NASA Student Launch thresholds: not cited in repo in the material inspected. Do not assert a competition threshold from these incomplete citations. `docs/internal/output-dictionary.md` identifies Astraea's own 15 m/s rail screen and Tripoli Level 1 landing-speed rule; these are not evidence of IREC or NASA rules.

## Remaining work

Complete a systematic inventory of all specified R40/R41/R42/R44/R47, flight-data, permitted flight-validation and validation sources, including log coverage and phase/event definitions; check rule citations comprehensively. The table does not yet meet the requested every-source inventory and no final no-evidence disposition is claimed. No test, simulation, or comparison ran; no source or test edits. `free -h` reported 8.3 GiB available.

## Orchestrator disposition (2026-11-15)

The author's inventory is bounded but sufficient to decide. More searching would not change which outputs have a defined measured event.

| Output | Disposition |
|---|---|
| Time to apogee | **Report-only comparison at step 3**: n = 4 development flights (Cosmic Cargo, G69N 30JUN2017, Top Shot, Adventurer), using the reporting rule above. It is diagnostic, with the clock-offset uncertainty stated. The flight list is frozen now, before any comparison |
| Max Mach | **Report-only comparison at step 3**: n = 1 (Proteus 6, 2.94, from integrated accelerometers). Labelled non-comparable unless the source's Mach definition is established. No accuracy claim |
| Rail-exit speed | **No evidence.** Missing: a rail-exit event with velocity, plus rail geometry and the ignition offset |
| Stability margin | **No evidence.** Missing: a measured CG plus an independently measured CP for the same configuration |
| Drogue and main descent rate | **No evidence.** Missing: as-flown recovery configuration plus qualified deployment events and phase intervals |
| Landing drift | **No evidence.** Missing: landing coordinates or a documented displacement, plus measured wind |
| IREC and NASA SL thresholds | **Not cited in the repo.** The report makes no competition-threshold claim |

Emerald Streak and Vulcanite are sealed sets and are not used here.
