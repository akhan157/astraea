# Astraea Competitive Gap Analysis & Master Feature Backlog
**Document Version:** 1.0  
**Date:** 2026-09-08  
**Purpose:** Exhaustive Feature Inventory Across RASAero II, RockSim Pro, OpenRocket, RocketPy, openMotor, and NASA CEA to Guide Astraea's Roadmap toward Total Replacement of Legacy Tooling.
**Completion status (product-completion program, 2026-09-10):** every
*Planned* row in the matrix below is now **SHIPPED** and covered by the
test suite + evidence emitter (30 files / 333 tests, emitter passed=true):
protuberance drag, boattail monitor, `.cdx1` + aero-matrix export, live
weather soundings + manual wind tables, Monte Carlo dispersion, BATES/star
grain regression + chamber pressure, ideal nozzle chemistry (APCP),
dual-compartment packing math + black-powder sizing, altimetry ingestion +
sim overlay + Cd calibration, RASP `.eng` / RockSim `.rse` motor import,
blueprint SVG export, and the 4-studio workstation shell. Residual
non-implemented workflows live in `docs/superset-exception-ledger.md`
(E1–E7), each with prerequisite, alternative, and re-visit condition.

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
| **Aero (High-Mach)** | Boattail Separation Angle ($> 10^\circ$) Warning | RASAero II | Advisory check on boattail angle | *Planned (Phase 2)* |
| **Aero (High-Mach)** | Protuberance Drag (Launch Lugs & Rail Buttons)| RASAero II, OpenRocket | Boundary layer immersion protuberance drag | *Planned (Phase 2)* |
| **Aeroelasticity** | Fin Flutter Critical Speed ($V_f$) | RockSim Pro ($125+) | NACA TN 4197 Eq 18 with shear modulus | **IMPLEMENTED** |
| **Propulsion** | Certified Solid Motor Database | RockSim, OpenRocket | Pre-loaded Estes, AeroTech, Cesaroni motors | **IMPLEMENTED** |
| **Propulsion** | Instantaneous Thrust Interpolation $F(t)$ | RockSim, RocketPy | Linear spline RASP thrust curve parser | **IMPLEMENTED** |
| **Propulsion** | Propellant Grain Regression (BATES, Star) | openMotor | Core regression & chamber pressure $P_c(t)$ | *Planned (Phase 2)* |
| **Propulsion** | Nozzle Chemistry ($I_{sp}, c^*, \gamma, T_c$) | NASA CEA | Gibbs free energy minimization | *Planned (Phase 2)* |
| **Trajectory** | Numerical Trajectory Integration | OpenRocket, RocketPy | Euler-Cromer ODE integrator | **IMPLEMENTED** |
| **Trajectory** | ISA 1976 Standard Atmosphere ($h \to \rho, a, P$) | RocketPy | Troposphere & Stratosphere models | **IMPLEMENTED** |
| **Trajectory** | Collegiate Safety Gates (Rail $v \ge 15$, KE $\le 20\text{J}$) | None (Teams calculate manually) | Automated badge validation in Flight Sim | **IMPLEMENTED** |
| **Trajectory** | 6-DOF Quaternion Rigorous Kinematics | RocketPy | Euler-Poinsot rigid-body dynamics in `src/sim/sixDofSimulator.ts` | **IMPLEMENTED** |
| **Trajectory** | Real-World Weather Soundings (NOAA/GFS) | RocketPy | Open-Meteo REST API integration | *Planned (Phase 2)* |
| **Trajectory** | Monte Carlo Dispersion Ellipses | RocketPy | Statistical parameter perturbation runs | *Planned (Phase 2)* |
| **File Formats** | OpenRocket (`.ork`) Import / Export | OpenRocket | Client-side JSZip + fast-xml-parser | **IMPLEMENTED** |
| **File Formats** | RockSim (`.rkt`) Import | RockSim | Client-side native XML parser | **IMPLEMENTED** |
| **File Formats** | RASAero (`.cdx1`) Outer Mold Line Export | RASAero II | Plaintext geometry format generator | *Planned (Phase 2)* |
| **File Formats** | Aerodynamic Matrix Export (`.csv`) | RASAero II | Export $C_D(M), C_{N\alpha}(M), CP(M)$ table | *Planned (Phase 2)* |
| **Recovery** | Dual-Deployment Event Sequencing | OpenRocket, RocketPy | Apogee drogue + main parachute AGL | **IMPLEMENTED** |
| **Recovery** | Dual-Compartment Physical Packing Visualizer | RecoverySys | Coupler shoulder inset & volume check | *Planned (Phase 3)* |
| **Recovery** | Black Powder Separation Charge Sizing | RecoverySys | $P_{\text{target}}$ ideal gas shear pin formula | *Planned (Phase 3)* |
| **Validation** | Flight Altimetry Log Ingestion (AltOS, CSV) | AltOS, FlightSketch | Drag-and-drop time-series parser | *Planned (Phase 4)* |
| **Validation** | Simulated vs. Actual Telemetry Overlays | None (Teams use Excel/MATLAB) | Synchronized multi-plot comparison | *Planned (Phase 4)* |
| **Validation** | Effective $C_D$ Calibration Optimizer | None (Manual guesswork) | Automated error-minimizing $C_D$ solver | *Planned (Phase 4)* |

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

### Phase 2: Solvers, High-Mach Interop & Environmental Weather (NEXT UP)
1. **Protuberance Drag Calculator (Launch Lugs & Rail Buttons):**
   - Implement Hoerner-based parasitic drag for cylindrical launch lugs and aerodynamic airfoil rail buttons submerged in the fuselage boundary layer:
     $$C_{D,lug} = C_{D,cylinder} \cdot \frac{A_{frontal}}{S_{ref}} \cdot \left(\frac{y_{lug}}{\delta(x)}\right)^{1/7}$$
   - Prevents the historical overestimation error while giving high-power competition teams exact drag penalties.
2. **Boattail Flow Separation Angle Monitor:**
   - Warn engineers in the Property Inspector if boattail half-angle $\theta > 10^\circ$, where boundary layer flow detachment causes a drag penalty.
3. **RASAero II File Interoperability:**
   - `.cdx1` outer mold line file exporter.
   - Aerodynamic matrix exporter (`.csv`) outputting columns: `[Mach, AoA, CD_power_off, CD_power_on, CNa, CP]`.
4. **Live Atmospheric Weather Sounding Ingestion:**
   - Connect to Open-Meteo or NOAA GFS REST API to pull real-time wind speed, wind direction azimuth, temperature, and barometric pressure profiles by latitude/longitude.
5. **Monte Carlo Dispersion Engine:**
   - Run $N = 100 - 500$ trajectory integration passes with Gaussian perturbation of wind azimuth ($\pm 15^\circ$), launch rail angle ($\pm 1^\circ$), and motor total impulse ($\pm 2\%$).
   - Output 2D landing scatter plot with 1-sigma and 2-sigma dispersion ellipses.

---

### Phase 3: Recovery Subsystem & Dual-Compartment Physical Packaging
1. **Dual-Compartment Physical Packing Engine:**
   - Visualizing the physical clearance inside the airframe between recovery bulkheads, coupler shoulders, avionics sleds, and folded parachutes.
   - Computes packed parachute density ($\text{g/cm}^3$) to prevent over-compression jamming.
2. **Automated Black Powder Ejection Sizing:**
   - Ideal gas expansion formulation:
     $$m_{\text{BP}} = \frac{P_{\text{target}} \cdot V_{\text{bay}}}{R \cdot T_{\text{combustion}}}$$
   - Calculates target pressure $P_{\text{target}}$ based on shear pin ratings (e.g. 2-56 or 4-40 nylon shear pins) to guarantee separation without airframe rupture.

---

### Phase 4: Closed-Loop Flight Validation & Sensor Evidence Ledger
1. **Flight Altimetry Log Ingestion:**
   - Ingest real flight data from AltOS (`.eeprom`, CSV), FlightSketch, and generic data logger CSVs.
2. **Synchronized Flight vs. Simulation Multi-Plot Overlay:**
   - Plot simulated altitude curve directly on top of recorded sensor altimeter curve.
   - Highlight burnout velocity, apogee delta ($\Delta h$), and descent rates.
3. **Automated Effective $C_D$ Calibration Engine:**
   - Solves the inverse flight dynamics problem: uses measured deceleration during unpowered coast to determine the true effective $C_D$ of the physical painted rocket.
   - Feeds the calibrated $C_D$ back into future simulations.
