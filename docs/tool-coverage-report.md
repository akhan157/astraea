# Astraea Rocketry Tool-Coverage Report — Exhaustive Popular-Tool Census
**Task:** RESEARCH-TOOLMAP (read-only)
**Date:** 2026-09-10
**Author:** dispatched worker, astraea-research worktree
**Builds on:** `docs/forum-intel-report.md` (TRF/Reddit/ThrustCurve demand signals) + `docs/competitive-gap-analysis-and-backlog.md` + `docs/superset-exception-ledger.md` (E1–E7) + `docs/rocketry-tools-reverse-engineering.md`
**Purpose:** enumerate every notable rocketry tool the community names, per tool assign Astraea's cover/keep/exceed verdict, so product can decide what to ship, match, or deliberately defer.
**Guardrails honored:** public pages only; citations with tier; no PII; no republishing — summaries + short quotes only. Pricing spot-checked 2026-09-10 against vendor/store pages; treat prices as approximate (hobby retail varies).

---

## 0. Executive Summary

41 tools/entries surveyed across 7 categories. Verdict counts:

| Verdict | Count | Meaning |
|---|---|---|
| **COVERED** | 13 | Astraea ships the capability (often a superset) |
| **PARTIAL** | 12 | Core ships; specific gap listed (mostly E1/E4/E7 or small parity items) |
| **MISSING-CHEAP** | 4 | Low-effort add we should consider (P1 launch-visualizer replacement, P2 STEP/STL export, E5 motor-editor items) |
| **MISSING-HARD** | 1 | Ledger/defer (P10 mobile field mode) |
| **N/A** | 11 | Out of scope (full CFD, mechanical CAD, organizational cert, or phantom/non-software entries) |

Top findings:
- **Two "phantom" enumeration entries, now disambiguated:** "ProLine" is **not software** (Wildman Rocketry fiberglass kit line + ProLine structural epoxy); "RoSim" has **no verifiable community footprint** (search results conflate it with RockSim). Both flagged §11 so nobody chases them.
- **Paid-gated landing-visualization is currently *unserved*:** Apogee's RockSim **Launch Visualizer is down** ("currently not working… no new subscriptions", rocksim.com, checked 2026-09-10). Astraea's shipped Monte-Carlo dispersion + landing ellipse is the only tool standing in that workflow — the P1 add (waiver-containment + KML) makes the replacement complete.
- **Everything the hobby reaches for around OpenRocket — fin flutter spreadsheets, AeroFinSim, DriftCast Excel glue, altimeter CSV forensics in Excel — maps to a shipped Astraea module.** The census's "already exceed" list (§9) is large.

---

## 1. Master Table — Desktop Simulators

| Tool | What it does | Where mentioned (cite + tier) | Popularity signal | Price | Astraea verdict |
|---|---|---|---|---|---|
| **OpenRocket** | Free Java design+6-DOF sim; clustering/staging, multi-level wind (24.12), free-form fins, `.ork` format, plugin-friendly | TRF: announcement thread `193437` (thread-read, intel §1/T1/T8); "OR vs RockSim disagree" Reddit `stgng8`, CP-discrepancy `124eyts` (snippet); TRF `best-rocket-simulator-software.159123` (snippet); official: openrocket.info, ThrustCurve simulators page (official-list) | Highest recurrence in hobby — the default free incumbent | Free / open-source (GPL) | **PARTIAL** — core ships: .ork bidirectional, subsonic+supersonic aero, 6-DOF, MC dispersion, motor DB. Gaps: staging/clustering (E4), multi-level wind CSV import parity (P4), open plugin ecosystem. Astraea beats: >M0.8 aero (OR degrades), weather soundings, evidence studio, modern 3D. |
| **RockSim / RockSim Pro** | Commercial design+sim; "RockSim Method" aero, fin flutter (NACA TN 4197), 360+ motor `.rse` DB, template printing; Launch Visualizer web add-on | TRF `is-roc-sim-really-worth-getting.37278` (snippet), `need-some-help-with-rocsim-10.185927` (snippet); Reddit price-resentment `1mp9g59`, `o9d88p` (snippet, intel T10); ThrustCurve simulators page (official-list) | Recurring as the paid alternative users migrate *from* | ~$120+ (intel T10 quote) | **PARTIAL** — `.rkt` import, fin flutter, certified motor DB ship. Gaps: `.rkt` export, Launch Visualizer equivalent (see §8 #1), closed-source "RockSim Method" refinement. Free + superset = direct price-story winner. |
| **RASAero II** | Freeware Windows aero+sim; Rogers Modified Barrowman, Missile-DATCOM-class M0.1–25 aero, protuberance drag, `.cdx1` OML + aero tables | TRF aero threads `198341`, `197825`, boattail `198351` (thread-read, intel T3/T7); Reddit "switch to RASAero" `o9d88p`, `wjam2y` (snippet); OR wiki Third-Party Compatibility (official-doc); ThrustCurve (official-list); rasaero.com (vendor) | The gold standard for supersonic accuracy; the switch target above M≈1–2 | Freeware (not open) | **COVERED** — M0–4 aero suite (Rogers Barrowman, Van Driest II, wave/base+plume drag, supersonic CP migration), `.cdx1` export, aero-matrix CSV export all ship. Note: M>4 hypersonic regime deliberately out of scope (N/A-adjacent). |
| **WinRoc** | Windows 3D design+sim; author Steve Roberson (d. 2003); binary motor DB, no import; orphaned freeware | ThrustCurve simulators page (official-list); Discount Rocketry mirror (vendor) | Listed on ThrustCurve (legacy lineage; effectively dead product) | Free (abandoned) | **COVERED** — full superset (3D parametric CAD + aero + sim). No maintained competitor risk. |
| **SpaceCAD** | Windows design+sim, professional UI, RASP `.eng` DB; TARC/UKROC official vendor | ThrustCurve simulators page (official-list); `spacecad.software.informer.com`, `modelrockets.co.uk` UKROC software page, `rocketrychallenge.org/vendors` (vendor/snippet) | ThrustCurve-listed; active in student-competition channel (TARC/UKROC student licenses ~£14.95) | ~$80 full; student/team licenses cheaper | **COVERED** — capability superset at zero price. Opportunity note: Astraea's shipped collegiate safety gates (rail exit ≥15 m/s, KE ≤20 J) target the same TARC/UKROC teams SpaceCAD sells into. |
| **AeroDRAG** | Windows drag-breakdown + flight sim, varying C_D with velocity, up to Mach 20; proprietary motor format (RASP must be hand-entered) | ThrustCurve simulators page (official-list); aerorocket.com (vendor) | ThrustCurve-listed; niche research/sounding-rocket use | For-purchase (AeroRocket) | **COVERED** — drag breakdown (skin friction, wave, base+plume, protuberance) + flight sim ship for M0–4; Mach-20 regime out of scope. |
| **AeroFinSim** (a.k.a. FinSim; "Mitchell AeroFinSim" attribution unverified — AeroRocket/John Cipolla per ThrustCurve + OR wiki) | Windows fin structural analysis: aerodynamic fin loads, bending strength vs. glue/fillet/through-wall attachment, flutter + divergence velocity (up to 6 fin sets), spin-stabilized canted-fin analysis; no file I/O — re-enter data each session | ThrustCurve simulators page (official-list); OR wiki Third-Party Compatibility ("OpenRocket does not analyze fin flutter or divergence… AeroFinSim performs this type of analysis") (official-doc); Reddit `1l64w44`, TRF `flutter-tools-for-you.183681` (snippet) | Officially cited as the fin-aero gap-filler for OR; hobby standard for flutter checks | Paid; download granted on email request only (gated) | **PARTIAL** — flutter velocity (NACA TN 4197) + material shear-modulus catalog ship. Gaps (cheap adds, §3 #3): fin root bending/glue-joint load check (AeroFinSim's structural mode) and canted-fin spin-stability analysis. Beating a gated paid tool = easy win. |
| **BurnSim** | Windows solid-motor steady-state internal ballistics: Kn(t), P_c(t), performance; nozzle/grain "what-if" + nozzle optimization | ThrustCurve simulators page (official-list); burnsim.com (vendor) | ThrustCurve-listed; hobby motor-design standard | Free (per ThrustCurve listing) | **PARTIAL** — BATES/star grain regression + chamber pressure + ideal nozzle chemistry ship. Gap: broader grain geometries (finocyl, c-slot, moon) + nozzle-dimension optimizer (small; see openMotor row). |
| **ProLine** | — | TRF designs `proline-1-2-scale-amraam.6228`, `proline-double-shot-single-stage.4530` (snippet); Wildman "ProLine" kit collection (vendor) | Search results contain only kit designs & epoxy references | — | **N/A — no such software.** "ProLine" = Wildman Rocketry fiberglass kit line + ProLine structural epoxy. Enumeration false positive; do not plan features against it. |
| **RoSim** | — | No credible community footprint found; searches conflate with RockSim/Roblox | None verifiable | — | **N/A — unverifiable phantom.** If it ever existed it is gone from community memory; treat as non-entry (§11). |

## 2. Master Table — Motor Tools, Thrust Data, Trajectory Engines

| Tool | What it does | Where mentioned (cite + tier) | Popularity signal | Price | Astraea verdict |
|---|---|---|---|---|---|
| **ThrustCurve.org** | Motor search/match/browse DB; `.eng`/`.rse` simfile download; officially AI-friendly JSON API + llms.txt; RASP format docs; motor-guide web sim | `llms.txt`/`llms-full.txt`/`info/simulators.html` read in full (official-list, intel §1); 10-manufacturer index | The community motor-data backbone; feed for every simulator listed above | Free (community-hosted) | **PARTIAL** — pre-loaded certified motor DB + RASP `.eng`/RockSim `.rse` import ship. Gap (cheap, §8 #4): live ThrustCurve API search (official, free, AI-blessed) for up-to-date motors on demand. |
| **ThrustCurve Motor Guide web sim** | In-site single-motor flight sim while picking motors | ThrustCurve `info/simulators.html` ("simple rocket flight simulator… on all platforms") (official-list) | Official fallback quick sim | Free | **COVERED** — superset: full design + aero + MC instead of a single-motor altitude guess. |
| **ThrustCurve Tracer** | Desktop app: trace a printed thrust curve → RASP `.eng` file | ThrustCurve `info/tctracer.html` (official-list) | Official motor-authoring utility | Free | **MISSING-CHEAP (defer)** — curve *import + visualization* ship; an image-trace-to-`.eng` tool is a small nicety, but no demand signal (consistent with E5). |
| **openMotor** | Open-source motor designer: grain regression (BATES, Finocyl, Moon, Star), P_c(t), De Laval nozzle; no vehicle coupling | docs: competitive-gap + reverse-engineering (comparator); github.com/openmotor (repo) | Open-source motor standard in the reverse-engineering doc's comparator set | Free (MIT) | **PARTIAL** — BATES/star regression + P_c + nozzle chemistry ship. Gap: extra grain geometries (finocyl/moon/c-slot) + casing-coupled burn — moderate geometry work, openMotor is the reference. |
| **NASA CEA** | Gibbs equilibrium thermochemistry: I_sp, c*, T_c for arbitrary propellant families | docs: gap-analysis + reverse-engineering (comparator); cea.grc.nasa.gov (official) | Academic/competition standard for theoretical performance | Free (NASA) | **PARTIAL** — ideal nozzle chemistry + documented APCP preset ship; full Gibbs species-equilibrium solver = **E7 (MISSING-HARD**, needs CEA reference-output corpus to validate). |
| **ProPEP3** | Freeware propellant performance/equilibrium program (shifted-equilibrium thermochemistry for many propellant combos) | Hosted/distributed via nakka-rocketry.net (community classic) | Long-standing hobby chem-tool alongside CEA | Free | **PARTIAL** — same E7 equilibrium gap as CEA; APCP preset + frozen composition covers the common Estes/AeroTech/Cesaroni case. |
| **RockSim Engine Editor** (RSE) | GUI `.eng`/`.rse` authoring: point-click thrust curve, impulse/isp readout, file merge/split; raw load-cell import (claimed) | ThrustCurve simulators page (official-list) | Official RockSim motor-authoring tool | Bundled with RockSim (paid) | **MISSING-CHEAP (defer)** — interactive thrust-curve editor explicitly parked as **E5** ("re-visit on user request"); forum survey found zero demand signal (intel §6). Import path covers the practical workflow. |
| **VCP — Visual Center of Pressure** | Spreadsheet-style CP/CG stability quick-look calculator, Windows | ThrustCurve simulators page (official-list); Sharif University software mirror (vendor) | Official aux list; legacy freeware | Free (mirrored) | **COVERED** — real-time CP/CG, boattail linter, stability margin in calibers blow past a spreadsheet tool. |
| **RocketPy** | Python 6-DOF trajectory: quaternion kinematics, GFS/ECMWF ensembles, Monte Carlo landing ellipses, multi-stage, motor/atmosphere framework | rocketpy.org (official); cited in TRF sim-choice threads as the scientific path (snippet); docs comparator | Academic + competition standard (NASA SL, SAC) for trajectories | Free (MIT) | **PARTIAL** — quaternion 6-DOF, ISA atmosphere, Open-Meteo soundings, Monte Carlo dispersion ship. Gaps: multi-stage (E4), background 500–1000-run MC (E1), Python research API/ecosystem. |

## 3. Master Table — Recovery & Flight-Data Logging (altimeter/avionics ecosystems)

Verdict = Astraea **evidence-studio coverage** of each ecosystem's flight-data output (ingest → overlay → Cd calibration). All below output CSV or CSV-exportable logs.

| Tool | What it does | Where mentioned (cite + tier) | Popularity signal | Price | Astraea verdict |
|---|---|---|---|---|---|
| **AltOS / AltusMetrum** (TeleMetrum/TeleMini/TeleMega/TeleGPS + ground station) | Open-hardware/open-source flight computers + RF telemetry ground station; baro/GPS/accel logging; raw flash dump is `.eeprom` (open format, firmware-version dependent) | docs: ledger **E3** + gap-analysis Phase 4 (comparator); altusmetrum.org (vendor) | Open-hardware flagship; common competition avionics | Hardware ~$150–400 (TeleMetrum v4 ~$300–400 per Wildman/store listings); software free/GPL | **PARTIAL** — generic CSV/log ingestion + sim overlay + Cd calibration ship; `.eeprom` binary parsing = **E3 (MISSING-HARD**: needs firmware record layout + validation pair; CSV export from AltOS tools is the working path). |
| **FlightSketch** (Mini $40, Comp $59) | Bluetooth baro+accel recorders; companion iOS app; CSV export | TRF LPV2 ecosystem mention (thread-read, intel §2); flightsketch.com (vendor) | Budget consumer altimeter, app-first UX | ~$40–60 | **COVERED** — FlightSketch CSV ingestion covered per intel signal mapping (#2). |
| **Featherweight** (Raven 4; Blue Raven / Blue Raven 2) + GPS tracker | Dual-deploy altimeters with USB CSV logs; attitude (quaternion) data on Blue Raven; GPS landing track | TRF LPV2 thread `198848`: Blue Raven + OpenRocket overlay w/ quaternion→KML talk (thread-read, intel T2); featherweightaltimeters.com (vendor) | HPR standard; LPV2 thread shows the exact overlay workflow Astraea ships | Blue Raven ~$175–225; Raven 4 used ~$125 (TRF `194546`, snippet) | **COVERED** — CSV ingestion + overlay + Cd calibration ship. Nicety (P5): Blue-Raven GPS-track + quaternion→KML back-cast import. |
| **Jolly Logic** (AltimeterTwo ~$80–100, AltimeterThree ~$100–110, Chute Release ~$150) | Self-contained LCD altimeters (no PC needed) / Bluetooth recorder; Chute Release = electronic main deployment hold-down | TRF T9 recovery-forensics threads reference chute-release/deployment practice; intel §1 equipment list (thread-read); vendor pages (vendor) | Consumer-friendly altimeters + flagship drift-control device | ~$55–160 | **COVERED** — altimeter CSV ingestion covered (generic). Chute Release is *hardware*: its deployment physics (altitude-based main release, drift control) is exactly Astraea's shipped dual-deploy sequencing + packing math. |
| **PerfectFlite** — StratoLogger II & StratoLoggerCF (PSII) | Dual-deploy altimeters; 20 Hz logging, 16 flights; DT4U USB kit download (CSV) | PerfectFlite product pages (vendor); ubiquitous HPR budget altimeter | Budget HPR workhorse | ~$70 + DT4U kit | **COVERED** — generic logger-CSV ingestion. |
| **Eggtimer Rocketry** (Quantum $40 kit, Proton $70 kit, Classic) | Wi-Fi flight computers (first Wi-Fi altimeter); onboard web server — arm, configure, and download flight data from any browser, no cable/app | eggtimerrocketry.com (vendor) | Very high recurrence in HPR electronics chatter (TRF forum 36); pricing/stats on vendor page | ~$40–70 kit | **COVERED** — browser/CSV-download data feeds the generic CSV pipeline with zero extra work. (Outside original enumeration; included because community recurrence is high.) |
| **Missile Works** (RRC3 / RRC3+) | Dual-deploy altimeter, multi-flight logging, auxiliary channel; USB data cable (UDC) download | missileworks.com, Wildman/CS Rocketry listings (vendor) | Mid-tier HPR standard, long track record | ~$70–75 + UDC cable | **COVERED** — same generic-CSV pipeline. (Added for the same reason as Eggtimer.) |

## 4. Master Table — Aero/Analysis: DATCOM, CFD, Educational

| Tool | What it does | Where mentioned (cite + tier) | Popularity signal | Price | Astraea verdict |
|---|---|---|---|---|---|
| **Missile DATCOM / Digital DATCOM** | USAF semi-empirical aero predictor (stability, dynamic derivatives); Digital DATCOM public-domain mirror; Missile DATCOM distribution gray/ITAR-adjacent | pdas.com/datcom.html, simtool.com/tools/missile-datcom, NTIS record ADA211086 (official/library-tier) | The underlying method class behind RASAero-class accuracy; referenced in expert aero threads (intel T7) | Public-domain mirror (Digital DATCOM) / restricted (Missile) | **N/A** — an engine/library, not a user tool; its semi-empirical methods are already incorporated in Astraea's M0–4 suite (Rogers Barrowman etc.). |
| **CFD++ (Metacomp)** | Commercial full CFD: hypersonic, reacting flow, moving boundaries; used by industry for launch-vehicle/missile analysis | metacomptech.com/cfd/, AIAA papers (official/vendor) | The "serious CFD" name teams cite for validation | Commercial (quote-based) | **N/A — full CFD solver, out of scope.** Astraea is analytical/semi-empirical by design; CFD remains a validation peer, not a competitor. |
| **OpenFOAM** | Open-source full CFD (Navier-Stokes) | openfoam.org (official); university/competition teams run it for custom aero validation | Open CFD standard in student teams | Free (GPL) | **N/A — same as CFD++: full solver, out of scope.** |
| **ANSYS FlowLab** | Education-focused Fluent-front-end CFD lab software | IAEA record, ANSYS/CADFEM product pages (official) | Historical educational tool | Discontinued | **N/A — discontinued** (superseded by ANSYS Student + tutorials). No action. |

## 5. Master Table — Web/Field Tools & Mobile Quick-Sim

| Tool | What it does | Where mentioned (cite + tier) | Popularity signal | Price | Astraea verdict |
|---|---|---|---|---|---|
| **GPS DriftCast** | Free web landing-drift prediction from live/forecast winds-aloft (Open-Meteo-backed, ~12 h window); single/dual-deploy profiles, weathercocking; Excel back-cast workbook | TRF `gps-driftcast-…185800` (thread-read, intel T1/T8 — incl. dev's own "It's just too clunky" and "most awesome recovery tool" quotes); gpsdriftcast.com (vendor) | Top TRF theme (drift/waiver containment, 4 threads) | Free | **PARTIAL** — MC drift + dispersion ellipse + live soundings ship. Gap = **P1 (§8 #1): forecast-multi-day UX, waiver polygon/cylinder PASS-FAIL, KML export.** Astraea should beat it, not match it: clunkiness is self-admitted, wind inputs are manual. |
| **AltimeterCloud** | Web platform: altimeter data cloud + drift calculator + flight-safety tools (by the DriftCast lineage) | altimetercloud.com/tools/drift_calculator; Reddit `1qoma11` "i built a browserbased flight safety tool" (snippet) | New-entrant web tooling; drift-calculator demand signal | Free tier | **PARTIAL** — same P1 gap; its altimeter-data-cloud half overlaps Astraea's shipped evidence studio (covered). |
| **RockSim Launch Visualizer** | Apogee's cloud 3D web sim: flight path over terrain, apogee marker, landing-coordinate prediction from a RockSim flight | rocksim.com + help pages (vendor, checked 2026-09-10) | Apogee's web-analytics push; paid subscription | **Currently DOWN — "unavailable… no new subscriptions"** | **MISSING-CHEAP (§8 #1)** — a paid-gated service that is *currently not working*; Astraea's MC landing ellipse covers the core and P1 (map overlay + KML) completes the replacement. Strongest "beat a paid tool" case in the census. |
| **Windy** | Free/premium weather visualization: winds-aloft forecast layers, the community's manual pre-launch workflow | TRF DriftCast thread: "constantly on the Windy app… manually iterating" (thread-read, intel T1) | Top-theme pipeline dependency | Free tier + premium | **N/A** — a weather *service*, not a sim; Astraea consumes Open-Meteo directly. Parity note: multi-level wind CSV import (P4) removes the manual Windy→CSV glue (OR 24.12 parity). |
| **Mobile quick-sim** (iPowerRocket iOS; "Model Rocket Flight Sim" iOS beta; thin mobile sims generally) | Small mobile apps: Barrowman, chute sizing, single-altitude forecast | App Store `ipowerrocket/id301295857` (vendor); TRF/Reddit mobile-wishlist threads (intel T10: "run quick simulation checks… at the launch site") | Persistent low-key mobile demand (secondary tier) | Free/small paid | **MISSING-HARD (P10, deferred)** — dedicated field quick-check mode is high-effort; Astraea's web app already runs on mobile (PWA base), so the gap is a dedicated workflow, not access. |

## 6. Master Table — CAD Interop & Manufacturing Pipeline

| Tool | What it does | Where mentioned (cite + tier) | Popularity signal | Price | Astraea verdict |
|---|---|---|---|---|---|
| **ork2step** (max-h-25) | Community Python script: OR `.ork` → STEP solids per component | TRF `convert-ork-to-step.198186`: "only works with OR 15.x… 24.x will error out" (thread-read, intel T4); github.com/max-h-25/ork2step (repo) | The de-facto OR→CAD bridge, and it is *broken on current OR* | Free | **N/A (bridge)** — Astraea shouldn't ship a bridge; it should ship **native STEP/STL export = MISSING-CHEAP (P2, §8 #2)**. Geometry is already computed in-repo; the export is the cheap moat that kills the fragile-script workflow. |
| **FreeCAD Rocket Workbench** (davesrocketshop/Rocket) | Open-source parametric rocket CAD inside FreeCAD: noses (Haack, Von Kármán, ogive…), tubes, transitions, rings, bulkheads, fin cans; OpenRocket-adjacent | github.com/davesrocketshop/Rocket (repo); cited in OR→CAD workflow discussions (snippet) | The open CAD-adjacent tool community points to | Free (open-source) | **COVERED** — parametric 3D CAD is Astraea's core; the workbench is a subset (no sim/aero of its own). Interop feeds via P2 exports. |
| **SolidWorks / Fusion 360 / OnShape** | Professional mechanical CAD; no official rocket-sim plugin; community glue is manual rebuild or ork2step/FreeCAD | TRF 2-stage thread `194370`: "updating my SolidWorks + OpenRocket files to match" (thread-read, intel T4); Reddit STEP-import wishlist `m7mh03` (snippet) | Dual-maintenance pain is a top-4 theme | Commercial (edu free tiers) | **N/A** — mechanical CAD environments, not sims; Astraea's single-source geometry + P2 STEP export converts the "sync two files" workflow into one export. |
| **Slicers** (Cura, PrusaSlicer, OrcaSlicer, Bambu Studio) | Slice STL/STEP-derived meshes for 3D-printed rocket parts | TRF 3D-printing forum active (thread-read, intel §1/T5); printed-rocketry communities (snippet) | Dominant manufacturing vector for scratch-built parts | Free/open | **N/A** — consumers of mesh/STEP output; Astraea unblocks them via P2. No simulation role. |

## 7. Master Table — Competition- & Launch-Official

| Tool | What it does | Where mentioned (cite + tier) | Popularity signal | Price | Astraea verdict |
|---|---|---|---|---|---|
| **NAR / TRA certification + FAA Class 2 COA waivers** (14 CFR Part 101 Subpart C) | Organizational: L1–L3 certification, club waivers; FAA classes 1/2/3; waivers carry altitude *and horizontal* limits | faa.gov PHAM ch31 s2 (official); tripoli.org; TRF DriftCast thread: "HPR waivers not only include altitude limits, but also horizontal limits" (thread-read, intel T1) | Every HPR flight touches it; waiver containment is the demand behind P1 | Membership-based; no sim software shipped by the bodies | **N/A (organizational; E6)** — no TRA/NAR sim tool to match. The *software-side* hook is P1: waiver-cylinder containment evidence (drift ellipse vs. waiver polygon, KML) + evidence-emitter artifacts for RSO sign-off (E6 alternative path, already documented). |
| **TARC / UKROC** (student competitions) | Annual competitions; vendor-partnered software channels (SpaceCAD, RockSim student editions) | rocketrychallenge.org/vendors, ukroc.com/suppliers-software (official); SpaceCAD student licensing (vendor) | Same student teams Astraea's collegiate safety gates target | Competition admin is free; partner software paid | **N/A as tool** — but a channel: Astraea's shipped rail-exit/KE gates + evidence emitter are designed for exactly these teams (see §9 #8). |

---

## 8. TOP-LINE: Tools/Features We Should Add Even If Not Requested

(Ordered by impact × evidence; "beat a paid/awkward tool" criterion.)

**1. Launch-visualizer replacement: forecast landing drift + waiver containment (P1) — beat the *down* paid tool.**
RockSim Launch Visualizer (paid) is unavailable; DriftCast (free) is self-admittedly clunky; users manually iterate Windy forecasts. Astraea already ships the physics (MC dispersion, landing ellipse, live soundings). Add: multi-day forecast soundings, waiver polygon/cylinder PASS-FAIL, KML export. This is the census's single strongest gap: unserved paid workflow, top TRF theme (4 threads), moderate effort.

**2. Native STEP/STL export (P2) — beat ork2step, which is broken on current OR.**
Every OR user reaching for CAD hits a Python script that errors on 24.x; Reddit explicitly wishes for STEP import/export. Geometry already computed in Astraea's parametric model — export is low-effort and unblocks SolidWorks/Fusion/OnShape + every slicer. Also feeds the "single source of truth" story that kills the SolidWorks+OR dual-maintenance thread.

**3. Fin structural-load analysis — beat gated AeroFinSim (paid, email-gated, no file I/O) + Bennett flutter spreadsheets.**
Flutter velocity ships; adding fin root bending load, glue-joint/through-wall attachment check, and (optionally) canted-fin spin-stability turns Astraea into a one-stop fin-aero tool. Cheap analytics over existing geometry. AeroFinSim's gate (email request, "sole discretion") is a customer service gift.

**4. Live ThrustCurve API motor search — parity with the free backbone, beats manual `.eng` hunting.**
ThrustCurve publishes an official AI-friendly JSON API with attribution rules + caching guidance. Pre-loaded DB + custom import ship; a live search widget keeps motors current and positions Astraea as the trusted motor-data surface. Low effort, high trust value.

**Honorable mentions (cheap parity, weaker demand):** wind-profile CSV import (P4, OR 24.12 parity); per-component aero loads C_A/C_N vs (AoA, Mach) CSV (P7, RASAero does whole-vehicle only); thrust-curve tracer / interactive editor (E5 — explicitly no demand signal, defer until someone asks).

## 9. TOP-LINE: Tools That Define Workflows We Already Exceed

1. **WinRoc** — dead since 2003, binary motor DB, no import. Astraea is a full superset; nothing to keep up with.
2. **VCP** — spreadsheet CP/CG quick-look → Astraea's real-time CP/CG + margin display + boattail linter is a strict superset.
3. **ThrustCurve Motor Guide web sim** — single-motor altitude guess → Astraea's full design + aero + MC + evidence pipeline.
4. **Bennett/FinSim flutter spreadsheet + AeroFinSim flutter mode** — standalone one-off calc → in-model flutter velocity with material catalog (Reddit `1l64w44` + TRF `flutter-tools-for-you.183681`, snippet tier).
5. **Altimeter CSV forensics in Excel** — LPV2's manual "altitude-vs-time four ways" overlay → evidence studio: drag-drop ingest, synchronized sim/flight overlay, automated Cd calibration (intel T2 workflow, shipped).
6. **TRF's own static calculators** (ejection charge, recovery harness, chute packing, rail exit, vent port, fin flutter pages) — forum-hosted one-offs → shipped Modes 3/5 sizing math (intel §6 notes this as third-party validation).
7. **DriftCast Excel back-cast workbook** (x64 compile errors, revert bugs — intel T8) — fragile spreadsheet drift validation → MC dispersion + evidence overlay.
8. **Manual SolidWorks + OpenRocket dual-maintenance** — "updating my SolidWorks + OpenRocket files to match" → single-source geometry; completed by P2 (STEP export), core already ships.
9. **Eggtimer/PerfectFlite/FlightSketch/Jolly Logic/RRC3 download-then-spreadsheet** — every one of these CSV pipelines lands directly in the evidence studio with zero per-vendor code (generic CSV ingest).
10. **RockSim price story** — "skip buying RockSim… OR does everything" (Reddit `1mp9g59`); Astraea is the same story with *more* than OR (supersonic aero, weather, MC, evidence) at the same price.

## 10. What the Census Did NOT Find (and why)

- **No free, maintained fin-structural tool** stands against AeroFinSim's gate (spreadsheets + Reddit threads only) → §8 #3 opportunity confirmed.
- **No modern mobile sim** beyond thin apps; demand exists but is secondary-tier (P10) → defer.
- **No competition-body sim software**; NAR/TRA ship certification processes, not tools → E6 stays organizational; P1 analytics is the technical hook.
- **No OR→CAD bridge works on current OR** (ork2step broken; OR has OBJ export only, no STEP) → P2 is not parity, it's a differentiator.

## 11. Method, Tiers, & Limitations

**Sources:** read in full — ThrustCurve `llms.txt` / `llms-full.txt` / `info/simulators.html` (the authoritative 10-tool simulator + aux list), OpenRocket wiki `Third-Party_Compatibility`, rocksim.com (checked live 2026-09-10). Prior work reused — TRF threads read in full in `docs/forum-intel-report.md` (tier: thread-read, cited by thread ID). Web-searched — Reddit/TRF snippets (tier: snippet, paraphrased, no verbatim republishing), vendor/official pages for pricing+spec (tier: vendor/official). Pricing from vendor/store listings on 2026-09-10; hobby retail varies, treat as approximate.

**Tier legend:** `thread-read` = read in full in prior research (intel report); `snippet` = search-indexed summary only, paraphrased; `official-list` = ThrustCurve/OR-wiki enumerated list; `vendor` = vendor/official product page; `repo` = source repository; `official` = government/body source.

**Guardrails honored:** public pages only; no logins, no PII; no republishing — tools described, pricing summarized, quotes kept to short verbatim fragments already captured in the intel report.

**Phantom entries:** **ProLine** (Wildman kit line + epoxy, not software) and **RoSim** (no verifiable footprint; search-noise conflation) are recorded as N/A so future planning cannot be built on them. "**Mitchell** AeroFinSim": author attribution unverifiable — authoritative sources (ThrustCurve, OR wiki) attribute AeroFinSim/FinSim to AeroRocket Engineering (John Cipolla); flagged for coordinator awareness.

**Limitations:** popularity signals combine the intel report's 16-thread TRF sample with search-indexed recurrence; they are directional, not corpus-wide (full-forum crawl remains parked per intel report §6). Prices are point-in-time. No source edits were made; this document is the only deliverable.