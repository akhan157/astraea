# Reference methods and evidence — A2, v0.1

Access date: **2026-10-24**. Primary-source review only; no reference executable or experiment was run. [Source versions, hashes and exposure](sources-and-exposure.json) accompany this note. Headline percentages are not a tool ranking.

## Evidence categories

| Evidence | What it can establish | What it cannot establish alone |
|---|---|---|
| Matched wind-tunnel coefficients | Aerodynamic force/moment/CP behavior for the tested geometry, Mach, Re, AoA, roll and support/base corrections | Motor, atmosphere, event timing, recovery or full-flight apogee accuracy |
| Ballistic/free-flight model tests | Measured aerodynamic behavior of the test article during its observed trajectory | A whole collegiate mission or every geometry the code accepts |
| Atmospheric soundings/profiles | Pressure, temperature and wind versus altitude at a specified place/time, with sampling/model limits | A wind-tunnel aerodynamic experiment or independent validation of Cd |
| Measured rocket flight | End-to-end prediction residuals, conditional on measurement/input quality and pre/postflight status | Unique attribution of error to drag, or every intermediate output |
| Same supplied-drag cross-code run | Numerical/trajectory consistency under matched shared inputs and conventions | Native aerodynamic accuracy or physical truth; shared wrong inputs may agree |
| Fitted-drag reconstruction | Fit behavior and conditional explanatory power for the fitted record | Uncalibrated native-aero accuracy or prediction of a subsequent flight |

## RASAero II

[Official manual](https://www.rasaero.com/dloads/RASAero%20II%20Users%20Manual.pdf): **1.0.2.0, copyright 2019**; [official homepage](https://www.rasaero.com/home.htm) advertises that version. Its advertised Mach 0.01–25 calculation range is model availability, not uniform validation. The homepage says methods were calibrated against wind-tunnel, free-flight, sounding-rocket and other engineering-code evidence; these sources are therefore not presumptively unseen tests.

Method details relevant to controlled comparisons (manual printed pp53–55, 78–80, 84–85, 93): subsonic CP offers Barrowman or Rogers Modified Barrowman; the latter adds body/interference and viscous-crossflow effects. Default skin friction transitions at Re 500,000; all-turbulent is optional. Wind selects a planar 3-DOF dynamic/weathercocking calculation; no-wind uses 2 DOF. Atmosphere is anchored to launch inputs and based on US Standard Atmosphere 1976. Nozzle exit diameter affects both powered drag and altitude thrust correction, assuming sea-level RASP thrust. It is stored in CDX1, not ENG. Manual pressure wording differs between pp78 and80; resolve the precise station/reduced-pressure convention before claiming a matched-atmosphere run. Record every option and assumption.

### Published flight statistics

The [official altitude comparison](https://www.rasaero.com/comparisons-alt.htm) contains **36 per-flight rows**, including repeated vehicles, staged vehicles and experimental motors. It reports 3.47% average error, 80.6% within ±10%, and 41.7% within ±5%. The [reproducible audit](tools/audit-rasaero-table.py) gives **+3.46795% signed mean**, **6.23718% mean absolute error**, and **29/36, 15/36** using the displayed integer altitudes; displayed-percent rounding changes the final decimals. This is flight-weighted, not equal-vehicle weighted.

The page's notes identify mixed barometric, GPS, integrated-accelerometer, optical and inferred/extrapolated altitude methods. MESOS staging delay/launch angle and AeroPac launch angle were adjusted postflight; other entries use video/coning or balloon-referenced pressure corrections. Selection completeness, preregistration, independent scoring, uncertainties and per-row exact program version are not established. Most design files are said to be included in the download, but were not inspected. This is developer-published evidence with valuable qualifications, not an unbiased blind cohort or a ready-made Astraea acceptance threshold.

### Wind-tunnel and free-flight claims

The [official comparison index](https://www.rasaero.com/comparisons.htm) groups several kinds of measurement under its heading. [NASA/NACA A53D02](https://ntrs.nasa.gov/citations/19930087740) concerns zero-lift drag of a fin-stabilized fineness-10 body over Mach 0.6–10, using ballistic/free-flight wind-tunnel methods; [NASA TR R-100](https://ntrs.nasa.gov/citations/19630004995) is a collection of free-flight zero-lift drag data on bodies of revolution. These are not atmospheric profiles or full rocket recovery tests. The original reports were catalogued here; their numeric curves were not independently redigitized.

The [official ARCAS comparison slides](https://www.rasaero.com/dloads/RASAero%20II%20Comparisons%20with%20ARCAS%20CP%20and%20CD%20Data.pdf) compare short/long sounding-rocket configurations to NASA TN D-4013/D-4014, subsonic through Mach 4.63. Re is **3×10⁶ per foot**; Mach-Alt inputs match test Re for Aero Plots. That table is not used by the flight solver. Fin-anchor drag was approximated through equivalent rail-guide geometry; a small base lip was omitted. CP and **power-off, zero-AoA** drag comparisons do not validate powered base drag. The slides acknowledge an unusual transonic CP shift for the long model and method-specific CP differences. No aggregate digitized error distribution or uncertainty budget is supplied. Read the [original D-4013](https://ntrs.nasa.gov/api/citations/19670020050/downloads/19670020050.pdf) and [D-4014 mirror](https://www.rasaero.com/dloads/ARCAS%20NASA%20TN%20D-4014.pdf) before reproducing force/base corrections or extraction.

Independent measurements exist underneath these comparisons; the RASAero overlays themselves are authored by the software developer. Calibration provenance and review independence must remain explicit.

## RocketPy

The [current documentation](https://docs.rocketpy.org/en/latest/index.html) identifies **1.13.0** and describes six-DOF variable-mass trajectory and parachute simulation. Its [Rocket input guide](https://docs.rocketpy.org/en/latest/user/rocket/rocket_usage.html) requires dry mass/inertia, geometry and powered/unpowered drag curves, and recommends RASAero when no measured/CFD curve is available. Thus “RocketPy native aero” is an insufficient label: identify the origin of every drag curve and lift/moment method.

The [official 1.0.0 validation table](https://docs.rocketpy.org/en/v1.0.0/index.html#validation) publishes Bella Lui and NDRT apogee, timing and velocity comparisons, supplied by EPFL and Notre Dame teams. Apogee errors below 1% coexist with larger errors in other outputs. The [2021 paper](https://ascelibrary.org/doi/10.1061/%28ASCE%29AS.1943-5525.0001331) and [author repository](https://github.com/RocketPy-Team/RocketPaper) identify Valetudo, Bella Lui and NDRT research provenance. The publisher full text returned 403; raw records/notebooks were intentionally not opened. Preflight freezing, fitted-drag use, input reconstruction, sensor processing and inclusion/exclusion rules therefore remain **unverified**, not assumed absent. The current marketing claim of [under-1% apogee error](https://rocketpy-team.github.io/) does not define a universal bound or cohort-wide metric.

The [atmospheric model documentation](https://docs.rocketpy.org/en/latest/user/environment/1-atm-models/index.html) distinguishes standard/custom atmosphere, forecasts, soundings, reanalysis and ensembles. These are environmental inputs. A balloon profile used to convert pressure altitude or supply winds is not a tunnel force measurement. In a prospective test, archived forecasts and retrospective reanalysis must be separately labelled.

The [FlightComparator guide](https://docs.rocketpy.org/en/latest/user/flight_comparator.html) provides interpolation and error metrics for measured data, other codes and analytical references. Its synthetic demonstration is software functionality, not flight validation. Datum and event alignment remain the experimenter's responsibility. Do not align apogee to evaluate apogee time, or treat a derived velocity channel as an independent speed measurement.

## OpenRocket

The [official documentation page](https://openrocket.info/documentation.html) links **technical documentation for 13.05 (2013-05-10)** and distinguishes it from the original thesis. This is a method snapshot, not an audit of the latest executable. It emphasizes extended Barrowman methods, subsonic flow and approximate transonic/low-supersonic treatment. Section6.4 compares ARCAS at matched Mach/Re while substituting an available fin airfoil for double-wedge fins; it discusses boattail/base treatment, excessive high-supersonic drag and deficient normal-force slope. Chapter6's small-rocket and hybrid flight examples include mass, roughness and motor uncertainty. These historical examples do not establish a current all-mission accuracy percentage.

The technical document is CC BY-SA per the official page; original thesis uses a different noncommercial/no-derivatives license. RASAero sources are copyrighted/all-rights-reserved; this packet stores original summaries, links and hashes, not redistributed manuals or software. NASA/NACA catalog entries mark US-government public-use material. RocketPy repositories advertise MIT licensing; verify individual third-party telemetry rights before reuse. Public availability alone does not establish permission to redistribute every flight file.

## Execution recommendation and blocked evidence

Use [comparison contract v0.1](comparison-input-contract-v0.1.md). First compare coefficients at matched test conditions; then trajectories using common supplied aero; finally separate end-to-end native-aero runs and prospective measured flights. Record residuals without ranking tools on incompatible metrics.

Blocked: no RASAero runtime/GUI acceptance, complete nozzle geometry, matched exported aero curves, or new qualified blind measurement cohort was supplied. Exact RocketPy paper input/calibration provenance and current OpenRocket implementation differences need a bounded follow-up if those cases are selected as development evidence. This packet does not run or certify any comparator.
