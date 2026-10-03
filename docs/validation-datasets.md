# Astraea validation datasets: findings

Date of research: 2026-10-03. Sandbox egress was restricted: only github.com git clones/GitHub API worked. rasaero.com, rocketryforum.com, nasa.gov, arxiv.org, zenodo.org, psu.edu, umn.edu, thrustcurve.org, readthedocs were blocked, so those are listed as UNVERIFIED leads only.
Everything under "Verified" below was cloned (shallow) and inspected locally (headers, row counts, max values computed by me).

## Key finding on licensing
RocketPy repo (https://github.com/RocketPy-Team/RocketPy) is MIT licensed (LICENSE: "MIT License, Copyright (c) 2018 Giovani Hidalgo Ceotto"). The flight CSVs live in `data/rockets/*` and the vehicle definitions live as code in `docs/examples/*_flight_sim.ipynb`. No separate data licence. Each notebook states "Permission to use flight data given by <team member>, <year>" (Juno III README says data was shared with the RocketPy team). So: MIT for the repo, but the data's provenance is team permission to RocketPy, not an explicit data licence. Safest approach for Astraea: do not redistribute the CSVs inside Astraea's repo. Fetch them at test time (or cite and ask the teams), and keep the original attribution. Cite RocketPy as Ceotto et al., J. Aerospace Eng. 34(6), 2021, doi 10.1061/(ASCE)AS.1943-5525.0001331.

Important caveat for ALL RocketPy cases: there is no .ork/.rkt/CDX1 file. Vehicle definition = Python parameters in the notebook (nose kind/length, radius, fin n/span/root/tip/sweep/position, mass, inertia, motor). Drag is usually a team-supplied Cd(Mach) curve (RASAero, OpenRocket, or a hand table) in `data/rockets/<name>/*.csv` or inline. For validating Astraea's own drag buildup, you must rebuild geometry from the notebook and ignore the supplied Cd curve. Body length, fin thickness and some tube lengths are often NOT given. Several teams give a sim-tuned mass and drag multiplier. Measured apogees below that I computed from the CSVs agree with the notebook's "official" figure unless noted.

Clone used: `git clone --depth 1 https://github.com/RocketPy-Team/RocketPy` (HEAD dated 2026-07-21). Files are at `data/rockets/<dir>/`, motors at `data/motors/**.eng` (ThrustCurve-style RASP files), weather at `data/weather/*.nc` (ERA5 reanalysis).

---

## A. RocketPy validation set (ranked)

### 1. Prometheus, Western Engineering Rocketry Team (WERT), Spaceport America Cup 2022. Rating A- (dims partial, two raw AltOS logs)
- Notebook: https://github.com/RocketPy-Team/RocketPy/blob/master/docs/examples/prometheus_2022_flight_sim.ipynb
- Data: `data/rockets/prometheus/2022-06-24-serial-5115-flight-0001-TeleMetrum.csv` (7082 lines) and `...serial-6583-flight-0003-TeleMega.csv` (6235 lines). Raw AltOS CSV export. Columns: time, state, acceleration, pressure, altitude, height, speed, temperature, accel_x/y/z (TeleMega), gyro, tilt, GPS lat/lon/alt. Two independent altimeters on one flight.
- Vehicle: dry 13.93 kg (liftoff mass not stated: add motor), 5.5 in dia (r=0.06985 m), Von Karman nose 0.742 m, 3 trapezoidal fins span 0.13, root 0.268, tip 0.136, sweep 0.066 m, inertia Ixx 4.87 kg m^2, CG without motor 0.9549 m from tail. Total length and fin thickness not given (nose position 2.229 m from tail with 0.742 nose implies ~2.97 m overall). Rail buttons at 0.69 and 0.21 m.
- Motor: Cesaroni 7579M1520-P (Pro98 3G), `data/motors/cesaroni/Cesaroni_7579M1520-P.eng`; burn 4.897 s, prop 3.737 kg, case 2.981 kg.
- Measured: official apogee 3898.37 m AGL; my max of TeleMega `height` = 3898.37 m; TeleMetrum `height` max 3903.77 m (differs by 5 m between the two units). Max `speed` on TeleMetrum 317.9 m/s (about Mach 0.93 at altitude, so top end of subsonic/transonic). RocketPy last sim 4190 m (+7.5%).
- Conditions: 2022-06-24 09:17 local, Spaceport America, elevation 1401 m (the notebook sets env year 2023 but reanalysis file is spaceport_america_pressure_levels_2023_hourly.nc: date/year mismatch, treat the weather as approximate), rail 5.18 m, inclination 80 deg, heading 75 deg (assumed). Main at 457.2 m, drogue at apogee.
- Caveats: the Cd table is the team's, not derived. Wind unknown. Permission "given by Giorgio Chassikos, 2024".

### 2. Andromeda, Aristotle Space and Aeronautics Team (AUTH/ASAT), EuRoC 2022. Rating B+ (dims in notebook, raw log, transonic/supersonic)
- Notebook: .../docs/examples/andromeda_flight_sim.ipynb. Data: `data/rockets/andromeda/flight_data.csv` (1140 rows; t, alt ft, vz ft/s, alt m, vz m/s), `thrust_curve.csv` (team static test of the motor), `drag_coefficient.csv`.
- Motor: Cesaroni Pro M2020 (team's own measured thrust curve instead of Cesaroni's); loaded mass 20.98 kg in notebook.
- Measured: apogee 3443 m official; my max of file 3438.5 m; max vz 324.1 m/s (about Mach 0.95 to 1.0): a transonic validation point. RocketPy 3614.95 m (+5%).
- Conditions: EuRoC 2022-10-14 about 14:00, Portugal (Windy winds used). Dims: see notebook (not extracted in detail here).

### 3. Cavour, PoliTo Rocket Team, EuRoC 2023. Rating B+
- Notebook: .../cavour_flight_sim.ipynb. Data: `data/rockets/polito/altimeter_cavour.csv` (405 rows: t, altitude m, velocity m/s, lat, lon; 0.1 s interval, looks coarse/integer-rounded), `drag_coefficient_power_off/on.csv`.
- Motor: Cesaroni 3618L995-P. Mass 8.219 kg (loaded, per notebook). Max alt 2789 m = official 2789 m. Max velocity 314 m/s (Mach about 0.93). Ballistic flight (no recovery), so no descent-rate data; good for ascent + free-fall/ballistic descent check.
- Simulated 2806 m (+0.6%) but notebook warns the wind profile differs from the real one.

### 4. Juno III, Projeto Jupiter (USP), Spaceport America Cup 2023, 10k SRAD solid. Rating B+ (three raw logs, SRAD motor)
- Notebook: .../juno3_flight_sim.ipynb. Data: `data/rockets/juno3/` README.txt, `cots_altimeter.csv` (RRC3, 612 rows: time, altitude, pressure, velocity, temp, events), `cots_GNSS.csv`, `srad_telemetry.csv` (72,710 rows, 11.6 MB, noisy IMU/baro/GPS), `drag_curve.csv`.
- Vehicle: r=0.0655 m, mass 24.05 kg (loaded, with motor), Von Karman nose 0.565 m, 3 trapezoidal fins root 0.20 tip 0.12 span 0.13, tail 0.0655 to 0.0535 over 0.068 m. SRAD motor "Mandioca" with thrust curve `data/motors/projeto-jupiter/mandioca_thrust_curve.csv` and grain geometry.
- Measured: flight-card apogee 3213 m; the RRC3 altitude column max reads 10700.6, which is feet (3261 m): this does NOT match 3213 m exactly, so check units/offset and the pad reference before use. The `velocity` column max of 7215 is clearly bad; do not trust it. Only drogue fired.
- Conditions: 2023-06-23 about 17:00 local, elevation 1480 m, rail 5.2 m, inclination 85, heading 105 (sim assumptions).

### 5. Halcyon, Aerospace Team Graz (ASTG), EuRoC 2023 (overall winner). Rating B (hybrid motor, high-rate log)
- Notebook: .../halcyon_flight_sim.ipynb. Data: `data/rockets/astg/altimeter_halcyon.csv` (65,883 rows at 100 Hz: filtered altitude AGL, filtered acceleration), `gnss_halcyon.csv`, hotfire thrust `engine_Halcyon_4thHotfire.eng`.
- Hybrid (liquid-oxidiser) motor with hotfire data; dry 10.67 kg, loaded 14.61 kg. Max alt in file 3470.8 m; official 3450 m. Differences of 20 m between file and flight card: note the file is a filtered estimate.
- RocketPy sim 3163 m (-9%).

### 6. NDRT 2020 (Notre Dame Rocket Team). Rating B+ (small/mid K/L, full dims, subsonic)
- Notebook: .../ndrt_2020_flight_sim.ipynb. Data: `data/rockets/NDRT_2020/ndrt_2020_flight_data.csv` (1819 rows: time and altitude ft AGL, axial acceleration in g with separate time axis).
- Vehicle (the most complete dims of the set): r=0.1015 m (8 in body), mass 18.998 kg (dry per notebook; comment says 20.846 kg dry, so ambiguous), tangent nose 0.610 m, 4 fins span 0.165, root 0.152, tip 0.0762, sweep angle 13 deg, fin position 3.050 m from nose, boat-tail transition 0.1015 to 0.0775 m over 0.127 m at 1.2 m, Cd constant 0.44 (team's). Rail 3.353 m, rail buttons given.
- Motor: Cesaroni 4895L1395-P (L1395), prop. 5 grains, burn 3.433 s, case 1.848 kg.
- Measured: 4320 ft (1316.7 m) reported; my max of file 4331.9 ft AGL. Measured stability 2.875 cal. Drift 2275 ft.
- Conditions: 2020-02-23 16:00 UTC, Three Oaks MI (elev 206 m), heading 181, inclination 90, ERA5 winds.
- Good low-speed (max about Mach 0.4 to 0.5) test of Cd, mass, motor and wind drift.

### 7. EPFL Rocket Team Bella Lui, Kaltbrunn 2020. Rating B (K-class, subsonic)
- Notebook: .../bella_lui_flight_sim.ipynb. Data: `data/rockets/EPFL_Bella_Lui/bella_lui_flight_data_filtered.csv` (768 rows: time, z m, v m/s; the notebook uses the first 573 rows).
- Vehicle: r=0.078 m (156 mm dia), mass 18.226 kg, tangent nose 0.242 m, 3 fins span 0.200 root 0.280 tip 0.125, boat tail 0.078 to 0.0675 m over 0.05 m. Cd table is hand-given (about 0.43 subsonic).
- Motor: AeroTech K828FJ (`data/motors/aerotech/AeroTech_K828FJ.eng`), grains 85.6 mm.
- Measured: max z in file 458.97 m, max v 90 m/s (the 90 value looks capped; check). RocketPy README claims apogee error 0.45% and time error 0.47%.
- 2020-02-22 13:00 local, elevation 407 m, rail 4.2 m. Only a drogue.

### 8. Others in the same dataset (less documented)
- Genesis (Faraday UPV, EuRoC 2023): `data/rockets/genesis/flight_data_faraday.csv` (17,934 rows), max 2916.7 m vs official 2916 m. Cesaroni 3618L995-P, mass 9.214 kg, r=0.047 m, Von Karman nose 0.27 m, fins span 0.105 root 0.2 tip 0.11. 2023-10-12 14:00, elevation 160 m, rail 12 m (?), inclination 84. Rating B.
- Camoes (REX, EuRoC 2023, air brakes): `flight_data.csv` (14,347 rows), max 3016.0 m vs 3015 m official. SRAD "Mariachi" motor, 22.8 kg loaded. Air-brake rocket: only useful if Astraea models brakes. Rating B-.
- Lince (UC3M, EuRoC 2023): `lince/main_data.csv` (44,455 rows), max 3668.5 m in the file versus 3587 m official (so the file and the flight card disagree by 81 m: check). Cesaroni M1101, 10.69 kg loaded. Rating B-.
- Erebus-11 (BME Suborbitals, EuRoC 2022): `erebus11/flight_data_filtered.csv` (747 rows), max 3001.8 m vs 3020 m official. Cesaroni Pro54 K-class, 5.82 kg loaded. Ballistic. Rating B-.
- Astra (Faraday UPV, EuRoC 2022): `astra/flight_data.csv` only 65 rows (t, alt, lat, lon), official 3250 m. Rating C+.
- Hedy (TU Wien Space Team, EuRoC 2025, liquid bi-prop): `data/rockets/hedy/cats_tust/{baro,flightInfo,gnssInfo,imu,filteredDataInfo}.csv` (CATS flight computer export, with baro pressure and IMU), dry 17.2 kg, 3.707 m long, 115 mm tank diameter etc. in the notebook. Date 2025-10-12. I did not extract apogee. Rating B-.
- Valkyrie (Bisky Team, 2025): K650 (Cesaroni 1997K650-21A); official 2098.02 m. No raw log in the data folder listing (only motor files). Rating C.
- Valetudo (Projeto Jupiter, 2019): Only summary numbers (logs lost): apogee 860 m AGL, drift 350 m E-W, 25 m N-S. Keron SRAD motor. RASAero Cd curves available (`Cd_PowerOff_RASAero.csv`, `Cd_PowerOn_RASAero.csv`), r=0.04045 m, tangent nose 0.274, fins span 0.077 / root 0.058 / tip 0.018. Rating C+ but has an independent RASAero Cd to compare against Astraea's drag buildup. Launch 2019-08-10, Tatui, elev 668 m, rail 5.7 m, inclination 84.7.
- Defiance Mk. IV (U of Toronto Aerospace, Launch Canada 2024, hybrid): apogee 9308.318 m. Thrust curve `Thrust_curve.csv` and Cd curve `DragCurve.csv` in repo, no flight log. Dry 13.832 kg, loaded 37.211 kg. The highest altitude in the set. Rating C+/B-.
- Calisto, Berkeley (data/rockets/berkeley): demo/test files, not flight validation.

---

## B. Other verified repositories

### 9. Rocket-Logger, Nick Spivak, Tripoli L1 cert, METRA (Pine Island NY), 2026-09-05. Rating B- (small H, raw data, full flight window)
- https://github.com/truenickspivak/Rocket-Logger. Write-up linked: https://nickspivak.com/rocketry.html (not fetched; egress blocked).
- Data in repo: `data/2026-09-05-L1-flight-55Hz.csv` (6,344 rows at 55 Hz, BMP581 + SPA06 pressure, 6-axis IMU), ground test CSV; the raw 42 MB log is attached to a GitHub release (I did not verify the release asset exists). Motor file `sim/AeroTech_H219T.eng`.
- Vehicle: LOC IV-X2 kit (commercial kit, so published dims from the vendor, not in repo), dry mass 1.975 kg (in `sim/flysim.m`). No .ork. Drag coefficient is a guess (0.60 +/- 0.09 in the Monte Carlo).
- Measured apogee 320.9 m (pressure-reduced with pad pressure 997.73 hPa and 23 C), 311.4 m with a standard-atmosphere reduction, peak velocity 92.2 m/s, peak accel 12.58 g. Deployment spikes corrupt the baro (readme explains).
- Licence: none found in file listing (no LICENSE). Contact the author before redistributing.
- Caveat: a hobbyist single flight, geometry must be sourced elsewhere. Useful for H-class sanity and Monte Carlo comparison. Note that the date is recent (about one month before today); data not independently vetted.

### 10. ISSUIUC (Illinois Space Society) Intrepid flights, with ISS_SILSIM model files. Rating C+ (raw logs for transonic/supersonic, vehicle files from a different configuration)
- Flight data: https://github.com/ISSUIUC/flight-data (marked "migrated to Box" but the directories are still in the repo). Folders: 20211030 (Endurance), 20220507 / 20220623 (Intrepid I, II), 20221029 (Intrepid III test 1), 20230305, 20230507, 20230621 (Intrepid III, IREC 2023 competition), 20231001, 20231118, 20240323 (the last four I did not inspect).
- 20230621 files: `irec_2023_telemega.csv` (15,939 rows), `irec_2023_easymega.csv` (6,891 rows), `irec_2023_tars.csv` (SRAD, 8,202 rows). AltOS fields. By my calculation the TeleMega `height` max is 8323.7 m and `speed` max 595.95 m/s (the AltOS CSV units are metres and m/s, so about Mach 1.9, 27,300 ft). Not verified against the official IREC score card.
- Vehicle: https://github.com/ISSUIUC/ISS_SILSIM has `ork_files/rocket.ork` (plain XML; Haack nose 0.914 m, 6.18 in class body, custom motors incl. Cesaroni N3800/N3400) and `utils/RASAero_fetch/cdx1/Intrepid_5800_mk6_*.CDX1` (CDX1 for a 4.02 in diameter design with an N5800 motor, dated 2022-04-05). The ork and CDX1 are design-study files that do NOT obviously match the flown 2023 vehicle (different diameter/motor), so they cannot be used as ground truth.
- No LICENSE file in either repo (all rights reserved by default); treat as view-only until you ask.
- Value: the closest thing to a free high-altitude, supersonic raw log with an actual M/N motor. You would need to get the real Intrepid III dims from ISS/IREC papers (UNVERIFIED lead: ISS IREC 2023 technical report).

### 11. catsystems/euroc21-team-data (EuRoC 2021 shared logs). Rating C (logs only)
- https://github.com/catsystems/euroc21-team-data, licence GPL-3.0 (LICENSE file present). Folders: Aris-Euler, Aris-Piccard (TeleMetrum and TeleMega .eeprom + CSV, CATS logs), ICLR (Eggtimer dumps), STA-CARL2 (Altimax, Eggtimer, RRC3 altimeters), SkywardER-Lynx (SRAD + Eggtimer).
- No vehicle definition files; the READMEs say "Todo / Coming soon". Only useful if you can obtain the dims elsewhere (team papers).

### 12. Imperial College ART (icl-art/OpenRocket). Rating C (design only)
- https://github.com/icl-art/OpenRocket: `Rockets that flew/ASTRA 11.04.2021.ork`, `ASTRA 13.06.2021.ork`, `APEX 29.08.2021.ork`. README says: ASTRA G-class, flights 2021-04-11 apogee 546 m, 2021-06-13 apogee 523 m. No log files, no licence file. Tiny, useful as a low-speed .ork parse test only.

### 13. PSP-High-Altitude/OpenRocket-Files. Rating C-: many .ork designs (Argonia, DM2, DM3, Skyshot), no flight logs seen, no licence file. Not a validation source.

### 14. inoobs13/OpenRocket_FlightData_Plotter: only MATLAB code; no data. Not useful.

---

## C. UNVERIFIED leads (could not fetch; do not treat as confirmed)
- RASAero II "Comparisons with Altitude Data" page on rasaero.com: reports RASAero II apogee vs altimeter/optical/accelerometer/GPS data for a set of HPR and amateur flights (average 3.47% error, 80.6% within 10%, 41.7% within 5%, per a rocketryforum thread summary). Likely tabular only, with no raw logs. Seen via search snippets only.
- Rocketry Forum threads: MESOS flight to 293k ft vs RASAero 290k ft; "Leave No Doubt" M2020 to Mach 3. Anecdotal.
- NASA Student Launch PLAR/FRR PDFs (e.g., Penn State 2019 `https://liontechrocketlabs.psu.edu/files/2019/04/Penn-State-2019-PLAR.pdf`, 2018 `https://sites.psu.edu/psurocket/files/2018/04/PLAR-2017-2018-234m5gl.pdf`, FSU Panama City 2026 PLAR `https://web1.eng.famu.fsu.edu/me/senior_design/2026/team533pc/files/FloridaStateUniversityPanamaCity-2026-PLAR-Report.pdf`). They appear in search results; I could not read them. USLI rockets (about 4-6 in, 4000-5500 ft AGL, L/M motors) typically publish dims, mass, motor, predicted vs actual apogee. Expect altimeter plots, not CSV. Terms: team-copyright documents.
- UMN Space Grant Midwest Rocketry Competition post-flight report (UMD High Power Rocketeers) at dept.aem.umn.edu: blocked.
- arXiv 2512.22248 "Amortized Inference for Model Rocket Aerodynamics": claims OpenRocket apogee MAE 19.9 m on 8 valid flights; I could not tell if the flight dataset is published.
- HMC E80/E178 pages (pages.hmc.edu/spjut): course .ork + flight comparisons. Blocked.
- A Zenodo record 5119968 turned up in search but appears to be Loon balloon data (not rocketry).
- Western Engineering Rocketry Team GitHub org (https://github.com/werocketry): has RocketFlightSim (MIT), post-flight-analysis, Hyperion-II. I did not clone these. A natural place to look for more WERT flight data and the Prometheus dims.
- Not found at all: any Zenodo/Kaggle/figshare dataset pairing .ork + altimeter logs for HPR flights.

---

## Recommended first five for validation (in order)
1. **Prometheus (WERT, SAC 2022, M1520)**. Two raw AltOS logs of the same flight, nearly complete geometry, a real Cesaroni M thrust file, 3.9 km, up to about Mach 0.93: a mid-high case that exercises transonic drag rise and Mach-dependent drag. Resolve the weather-year mismatch and get total length/fin thickness from WERT.
2. **NDRT 2020 (L1395)**. Most complete dimension set, plain subsonic, rail/wind/conditions given, measured stability margin (2.875 cal) for Barrowman CP/CG checks, and a raw altitude and axial acceleration log. A clean regression baseline.
3. **Andromeda (EuRoC 2022, M2020)**. A raw altitude/velocity log to Mach about 0.95-1.0, with a team-measured thrust curve and a mass of about 21 kg. Cross-check against Cavour (Mach 0.93) for wave drag onset.
4. **Juno III (SAC 2023, SRAD solid)**. Three independent raw logs (RRC3, GNSS, SRAD telemetry) and a user-defined motor (grains + thrust). Resolve the unit/offset question first (feet; 3261 m vs 3213 m).
5. **Defiance Mk. IV (9308 m, hybrid) as the stretch case, with Intrepid III 2023 (ISSUIUC, Mach about 1.9, 8.3 km) as the supersonic raw-data target**. Defiance has only apogee but with thrust and Cd inputs; Intrepid has the best raw supersonic logs but you must source vehicle dims (the SILSIM files are not the flown vehicle).
Small-rocket sanity check: Rocket-Logger (H219T, 320.9 m, 92 m/s) once you get the LOC IV-X2 dims, and Bella Lui (K828FJ, 459 m).

Practical notes: use the same atmosphere/pad elevation convention as the logs (AGL vs MSL), compare apogee, time-to-apogee, max velocity and burnout altitude (not just apogee), and run Monte Carlo over Cd, mass and thrust scatter, since all of these teams' predictions were 5-9% off in RocketPy.
