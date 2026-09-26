# Astraea Competitive Gap Analysis & Master Feature Backlog
**Document Version:** 1.0  
**Date:** 2026-09-08  
**Purpose:** Exhaustive Feature Inventory Across RASAero II, RockSim Pro, OpenRocket, RocketPy, openMotor, and NASA CEA to Guide Astraea's Roadmap toward Total Replacement of Legacy Tooling.

> **Historical baseline, not the active backlog (2026-09-26).** The matrix and phase-by-phase wording below capture the September 8 plan; its `Planned` cells and “NEXT UP” label were not rewritten in place. Read [current project status and prioritized next work](project-status.md), then the [exception ledger](superset-exception-ledger.md) and [adapter matrix](adapter-matrix.md) for implementation versus UI-wiring limits. In particular, Phase 2–4 engines largely ship, while empirical flight validation and several integration surfaces remain open.
**Completion status (2026-09-23 pass; refreshed 2026-09-26):** the *Planned*
rows below were implemented in engine/export scope and the matrix status cells
have been updated accordingly. Historical evidence at `f5105cf` was 58 suites /
760 cases with emitter passed=true; the current 2026-09-26 check is 62 frontend
files / 791 tests and 72 Rust core tests passing. “Implemented” here means the
capability and its tests exist, not that every workflow is UI-wired or
flight-validated:
protuberance drag, boattail monitor, `.cdx1` + aero-matrix export, live
weather soundings + manual wind tables, Monte Carlo dispersion, BATES/star
grain regression + chamber pressure, frozen-flow APCP nozzle chemistry +
engine-tested Gibbs solver (uncoupled from the nozzle preset; 60-case
restricted-species CEA corpus now regresses it — ledger E7 closed), ideal
nozzle chemistry (APCP), dual-compartment packing math + black-powder sizing +
derived-bay 2D strip (ledger E2 closed per C9), altimetry + GPX ingestion +
sim overlay + Cd calibration + GPS back-cast, RASP `.eng` / RockSim `.rse`
motor import, RKT/ENG/KML/STEP/STL download triggers with omission previews
(KML refuses until the S4 payload channel publishes; RSE trigger pending),
blueprint SVG/PNG export, versioned project-envelope engine (Header/App
cutover pending), and the 5-studio workstation shell. Residual
non-implemented or unwired workflows live in `docs/superset-exception-ledger.md`
and `docs/adapter-matrix.md` (E1 background MC host + wind CSV UI, E3 `.eeprom`,
E4 terrain/staging, E5 curve-editor UI, plus the project-envelope cutover and
RSE trigger; E2 and E7 closed). Nothing here claims empirical flight validation.

---

## 1. Competitive Audit Matrix

| Domain | Capability / Feature | In Legacy Tooling | In Astraea | Status in Astraea |
| :--- | :--- | :--- | :--- | :--- |
| **3D CAD** | Procedural 3D Parametric Rocket Canvas | None (OpenRocket: 2D side; RockSim: legacy 3D) | Modern Three.js WebGL (Solid, Wireframe, X-Ray) | **IMPLEMENTED** |
| **3D CAD** | Real-Time Live Sliders (< 1ms 60 FPS update) | None (All trigger slow UI re-renders) | In-place Buffer updates + Zustand store | **IMPLEMENTED** |
| **Aero (Subsonic)** | Classical Barrowman CP Calculation | OpenRocket, RockSim, RASAero | Analytical centroid formulas | **IMPLEMENTED** |
| **Aero (Subsonic)** | Rogers Modified Barrowman ($K_{bf}$ factor) | RASAero II | Exact body-fin mutual interference | **IMPLEMENTED** |
| **Aero (High-Mach)** | Van Driest II Compressible Skin Friction | RASAero II | Turbulent compressible boundary layer | **IMPLEMENTED** |
| **Aero (High-Mach)** | Supersonic Wave Drag ($C_{D,wave}$) | RASAero II | Ogive, Conical, Von Kármán, and Fin wave drag | **IMPLEMENTED** |
| **Aero (High-Mach)** | Base Drag with Motor Plume Effect | RASAero II | 60% plume drag drop & boattail factor | **IMPLEMENTED** |
| **Aero (High-Mach)** | Supersonic Center of Pressure Forward Shift | RASAero II | Live Mach 0 to 4 CP curve | **IMPLEMENTED** |
| **Aero (High-Mach)** | Boattail Separation Angle ($> 10^\circ$) Warning | RASAero II | Advisory check on boattail angle | **IMPLEMENTED** |
| **Aero (High-Mach)** | Protuberance Drag (Launch Lugs & Rail Buttons)| RASAero II, OpenRocket | Boundary layer immersion protuberance drag | **IMPLEMENTED** |
| **Aeroelasticity** | Fin Flutter Critical Speed ($V_f$) | RockSim Pro ($125+) | NACA TN 4197 Eq 18 with shear modulus | **IMPLEMENTED** |
| **Propulsion** | Certified Solid Motor Database | RockSim, OpenRocket | Pre-loaded Estes, AeroTech, Cesaroni motors | **IMPLEMENTED** |
| **Propulsion** | Instantaneous Thrust Interpolation $F(t)$ | RockSim, RocketPy | Linear spline RASP thrust curve parser | **IMPLEMENTED** |
| **Propulsion** | Propellant Grain Regression (BATES, Star) | openMotor | Core regression & chamber pressure $P_c(t)$ | **IMPLEMENTED** |
| **Propulsion** | Nozzle Chemistry ($I_{sp}, c^*, \gamma, T_c$) | NASA CEA | Frozen-flow nozzle plus Gibbs solver; CEA species and nozzle-coupling limits remain (see E7) | **IMPLEMENTED WITH MODEL LIMITS** |
| **Trajectory** | Numerical Trajectory Integration | OpenRocket, RocketPy | Euler-Cromer ODE integrator | **IMPLEMENTED** |
| **Trajectory** | ISA 1976 Standard Atmosphere ($h \to \rho, a, P$) | RocketPy | Troposphere & Stratosphere models | **IMPLEMENTED** |
| **Trajectory** | Collegiate Safety Gates (Rail $v \ge 15$, KE $\le 20\text{J}$) | None (Teams calculate manually) | Automated badge validation in Flight Sim | **IMPLEMENTED** |
| **Trajectory** | 6-DOF Quaternion Rigorous Kinematics | RocketPy | Euler-Poinsot rigid-body dynamics in `src/sim/sixDofSimulator.ts` | **IMPLEMENTED** |
| **Trajectory** | Real-World Weather Soundings (NOAA/GFS) | RocketPy | Open-Meteo integration; wind CSV import UI remains open (E1) | **IMPLEMENTED WITH UI GAP** |
| **Trajectory** | Monte Carlo Dispersion Ellipses | RocketPy | Rust/native ensemble and TypeScript engines; background worker progress/cancel UI remains open (E1) | **IMPLEMENTED WITH UI GAP** |
| **File Formats** | OpenRocket (`.ork`) Import / Export | OpenRocket | Client-side JSZip + fast-xml-parser | **IMPLEMENTED** |
| **File Formats** | RockSim (`.rkt`) Import | RockSim | Client-side native XML parser | **IMPLEMENTED** |
| **File Formats** | RASAero (`.cdx1`) Outer Mold Line Export | RASAero II | Plaintext geometry format generator | **IMPLEMENTED** |
| **File Formats** | Aerodynamic Matrix Export (`.csv`) | RASAero II | Export $C_D(M), C_{N\alpha}(M), CP(M)$ table | **IMPLEMENTED** |
| **Recovery** | Dual-Deployment Event Sequencing | OpenRocket, RocketPy | Apogee drogue + main parachute AGL | **IMPLEMENTED** |
| **Recovery** | Dual-Compartment Physical Packing Visualizer | RecoverySys | 2D axial strip and clearance/density advisory; full 3D packing is intentionally rejected | **IMPLEMENTED (2D SCOPE)** |
| **Recovery** | Black Powder Separation Charge Sizing | RecoverySys | $P_{\text{target}}$ ideal gas shear pin formula | **IMPLEMENTED** |
| **Validation** | Flight Altimetry Log Ingestion (AltOS, CSV) | AltOS, FlightSketch | CSV/GPX ingestion; raw AltOS `.eeprom` parsing is not supported (E3) | **IMPLEMENTED WITH FORMAT LIMIT** |
| **Validation** | Simulated vs. Actual Telemetry Overlays | None (Teams use Excel/MATLAB) | Synchronized multi-plot comparison | **IMPLEMENTED; EMPIRICAL CLOSURE PENDING** |
| **Validation** | Effective $C_D$ Calibration Optimizer | None (Manual guesswork) | Automated error-minimizing $C_D$ solver | **IMPLEMENTED; FLIGHT VALIDATION PENDING** |

---

## 2. Phase-by-Phase Technical Implementation Roadmap

### Phase 1 & 1.5: Core 3D CAD, Barrowman, Transonic Aero & Formats (COMPLETED)
- [x] **Procedural Three.js 3D Viewport:** Conical, Ogive, Parabolic, Von Kármán nosecones; hollow body tubes; transitions; extruded fin sets.
- [x] **Subsonic Stability Engine:** Classical Barrowman + Rogers Modified Barrowman ($K_{bf}$ body-lift induction).
- [x] **Aeroelastic Fin Flutter Engine:** NACA TN 4197 Equation 18 critical flutter velocity ($V_f$) and safe velocity with material shear modulus catalog.
- [x] **Transonic & Supersonic Drag Breakdown:** Van Driest II compressible turbulent skin friction, nosecone wave drag, fin Ackeret wave drag, base drag with motor plume power-on reduction.
- [x] **Certified Motor Engine:** Pre-loaded solid motor database with RASP thrust curves, burn depletion $m(t)$, and dry mass rollups.
- [x] **Numerical Flight Dynamics Simulator:** Launch rail exit velocity check ($\ge 15\text{ m/s}$), burnout, apogee, dual-parachute deployment, and touchdown kinetic energy check ($\le 20\text{ J}$).
- [x] **File Interoperability:** Client-side OpenRocket (`.ork`) bidirectional import/export and Apogee RockSim (`.rkt`) import.

---

### Phase 2: Solvers, High-Mach Interop & Environmental Weather (implemented; integration gaps remain)

The September plan's engines and export/sounding workflows were implemented: protuberance drag, boattail advisory, `.cdx1`/aero-matrix export, Open-Meteo soundings, and Monte Carlo dispersion. This does **not** mean all paths are end-to-end: wind CSV has no import view, and interactive large ensembles lack worker-host progress/cancel. See [E1](superset-exception-ledger.md).

---

### Phase 3: Recovery subsystem (implemented within declared scope)

Dual-compartment clearance/density calculations, an axial 2D packing strip, and black-powder sizing are implemented. Full 3D folded-parachute/cord packing is intentionally not modeled because the necessary geometry is unknowable. See [E2](superset-exception-ledger.md).

---

### Phase 4: Evidence ledger (software implemented; empirical closure pending)

CSV/GPX intake, simulation/flight overlays, effective-$C_D$ calibration, and GPS back-cast exist. Raw AltOS `.eeprom` parsing does not. No real-flight comparison has yet been recorded as empirical validation; secure a flown motor, matching vehicle record, and log before making accuracy claims. See [E3 and empirical intake](superset-exception-ledger.md) and [current status](project-status.md).
