# Project Astraea: Master Product & Technical Specification
## The Unified Open-Source Rocket Engineering Environment
**Document Version:** 1.0.0  
**Date:** 2026-09-08  
**Status:** APPROVED & LOCKED FOR BUILD  
**Domain:** Aerospace Systems Engineering, Computer-Aided Design (CAD), Flight Dynamics  
**Target Audience:** Collegiate Rocket Teams (NASA Student Launch, Spaceport America Cup, EuRoC), High-Power Rocketeers (NAR/TRA L1–L3), and Commercial Sounding Rocket Engineers.

---

## 1. Executive Vision & The 10x Paradigm Shift

### 1.1 The Problem: The Disconnected Rocketry Archipelago
Modern rocketeers and university competition teams currently design, simulate, and launch rockets using a fragmented, legacy archipelago of tools:
- **Geometry & 3D Modeling:** SolidWorks / Onshape / FreeCAD
- **Subsonic Sizing & Stability:** OpenRocket (Java Swing, 2D side-view)
- **High-Mach Transonic/Supersonic Drag:** RASAero II (Closed-source, legacy Win32, no 3D canvas)
- **Aeroelastic Fin Flutter Limits:** RockSim Pro ($125+ commercial license)
- **6-DOF Trajectory & Weather Dispersions:** RocketPy (Python scripts, no GUI)
- **Motor Sizing & Internal Ballistics:** openMotor / NASA CEA / ThrustCurve
- **Flight Altimetry & Data Logging:** AltOS / FlightSketch / Open MCT

**The Failure Modes of the Status Quo:**
1. **Model Staleness:** Dimensions, masses, and thrust curves must be manually transcribed across multiple programs. When fin geometry changes in CAD, the simulation files become silently invalid.
2. **The "Single Number" Delusion:** Legacy tools predict apogee as a single static number (e.g. *3,412 ft*) with zero uncertainty quantification, leading to 15–25% altitude errors in competition due to real-world surface roughness and atmospheric turbulence.
3. **Passive Calculators vs. Intelligent Co-Pilots:** Legacy tools do not warn engineers when aerodynamic choices (such as steep boattail angles $> 10^\circ$ or thin fin foils susceptible to flutter) will cause in-flight failures.
4. **The Broken Verification Loop:** Flight telemetry recorded by altimeters on the rocket is rarely fed back into simulation models to calibrate actual drag coefficients ($C_D$).

### 1.2 Astraea's Core Proposition
**Project Astraea** is a unified, visual, end-to-end rocketry workstation. It completely eliminates the need for legacy rocketry software by combining:
1. **Interactive 3D Parametric CAD (WebGL/Three.js):** 60 FPS real-time geometry updates.
2. **Unified Aerodynamics (Subsonic to Hypersonic $M=0$ to $M=4$):** Rogers Modified Barrowman ($K_{fb} + K_{bf}$), Van Driest II compressible skin friction, wave drag, base drag with motor plume reduction, and supersonic Center of Pressure migration.
3. **Aeroelasticity & Safety Co-Pilot:** Real-time NACA TN 4197 fin flutter boundary calculation, boattail flow separation alerts, and launch rail exit velocity verification ($\ge 15\text{ m/s}$).
4. **Certified Propulsion Engine:** RASP motor database, thrust curve interpolation $F(t)$, and live propellant mass/CG depletion.
5. **Numerical 6-DOF Trajectory & Weather Soundings:** ISA 1976 atmosphere, live Open-Meteo REST API wind soundings, and dual-mode Monte Carlo landing dispersion ellipses.
6. **Closed-Loop Flight Evidence Ledger:** Ingesting AltOS/FlightSketch CSV logs, synchronizing simulated vs. actual curves, and automatically solving for the rocket's true real-world $C_D$.
7. **Legal Clean-Room Architecture:** 100% public-domain NASA/NACA/USAF physics, zero proprietary code contamination, and fair-use file interoperability (`.ork`, `.rkt`, `.cdx1`, `.eng`).

---

## 2. Workstation Architecture: The 5 Studio Modes

Astraea organizes its capabilities into **5 dedicated studio modes** accessible via the top-level mode switcher:

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   ASTRAEA WORKSTATION HEADER                                │
│ [🚀 ASTRAEA]  [📐 Airframe CAD] [🌪️ Aero & Flutter] [🔥 Propulsion] [🚀 Trajectory] [📊 Evidence]│
├──────────────────────────────┬──────────────────────────────┬───────────────────────────────┤
│    LEFT SIDEBAR (Contextual) │   CENTER VIEWPORT (Shared)   │  RIGHT SIDEBAR (Inspector)    │
│  - Axial Component Tree      │  - Interactive 3D WebGL      │  - Parametric Sliders         │
│  - Reorder / Add / Delete    │    Three.js Canvas           │  - Material & Surface Finish  │
│  - Motor Bay Assignment      │  - Solid / Wireframe / X-Ray │  - Real-Time Flutter Warnings │
│  - Recovery Compartments     │  - Live 3D CG & CP Markers   │  - Mass Overrides             │
│  - Flight Sequence Checklist │  - Floating Metric HUD       │  - Active Safety Linters      │
└──────────────────────────────┴──────────────────────────────┴───────────────────────────────┘
```

---

### Mode 1: Airframe CAD Studio (`[📐 Airframe CAD]`)
*Primary Objective: Rapid, intuitive 3D composition of the vehicle's outer mold line and internal structural compartments.*

1. **3D Viewport Controls:**
   - Smooth orbital navigation, panning, zoom, view presets (Side, Front, Top, Perspective), and camera reset.
   - Three rendering modes:
     - **Solid Shaded:** Physically-based metallic/roughness materials with component finish colors.
     - **Technical Wireframe:** CAD wireframe with luminous cyan lines for internal geometry alignment.
     - **X-Ray Transparent:** Acrylic semi-transparent airframe revealing recovery compartments, parachutes, and motor casings.
2. **Procedural Geometry Components:**
   - **Nosecones:** Conical, Tangent Ogive, Parabolic, Von Kármán (Haack series $C=0$), and Elliptical. Supports solid core or thin-walled hollow geometry.
   - **Body Tubes:** Cylindrical airframe shells with outer diameter, inner diameter, wall thickness, and motor mount gating.
   - **Transitions:** Conical frustums for shoulder expansions or aft boattail contractions.
   - **Fin Sets:** Trapezoidal, clipped delta, and elliptical fin sets (3, 4, or 6 fins). Extruded with bevels and cross-section profiles (Square, Rounded, Streamlined Airfoil, Supersonic Double-Wedge).
   - **Recovery Bays:** Internal parachute compartments with shock cord, packing length, and bulkheads.
   - **Internal Mass Items:** Avionics sleds, payload ballast, altimeter bays, and tracking beacons.
3. **Material Catalog & Surface Finish:**
   - Material densities for G10 Fiberglass ($1850 \text{ kg/m}^3$), Carbon Fiber ($1550 \text{ kg/m}^3$), Kraft Cardboard ($680 \text{ kg/m}^3$), Aircraft Plywood ($680 \text{ kg/m}^3$), Balsa Wood ($160 \text{ kg/m}^3$), 6061-T6 Aluminum ($2700 \text{ kg/m}^3$), and 3D printed PLA/ABS/PETG.
   - Surface finish selector affecting boundary layer skin friction: *Polished Carbon*, *Smooth Painted & Buffed*, *Standard Paint*, *Raw 3D Print / Matte*.
4. **Active Aerospace Safety Linter:**
   - **Boattail Angle Check:** Warns if boattail half-angle $\theta > 10^\circ$ (boundary layer flow separation risk).
   - **Static Stability Margin Check:** Flags understable vehicles ($< 1.0\text{ cal}$) and overstable weathercocking risks ($> 2.8\text{ cal}$).
   - **Fineness Ratio ($L/D$) Check:** Highlights excessively stubby ($< 8:1$) or excessively flexible ($> 25:1$) airframes.
5. **Collegiate Competition Blueprint Export:**
   - One-click export of **Vector SVG Blueprints** and dimensioned PNG diagrams with annotated component lengths, outer diameters, fin spans, and total vehicle length formatted for NASA Student Launch and Spaceport America Cup PDR/CDR packets.

---

### Mode 2: Aerodynamics & Aeroelasticity Studio (`[🌪️ Aerodynamics & Flutter]`)
*Primary Objective: Provide rigorous aerodynamic drag and stability predictions spanning subsonic, transonic, and supersonic regimes ($M=0$ to $M=4$), eliminating the need for RASAero II.*

1. **Subsonic Aerodynamics ($M < 0.8$):**
   - **Rogers Modified Barrowman Method:** Incorporates both fin-in-presence-of-body ($K_{fb}$) and body-in-presence-of-fins ($K_{bf}$) interference factors:
     $$K_{fb} = 1 + \frac{R}{s + R}, \quad K_{bf} = \left(\frac{R}{s + R}\right)^2 \cdot \left(1 + \frac{s}{R}\right), \quad K_{total} = K_{fb} + K_{bf}$$
   - Accurately models fin-region normal force without the 15–25% underprediction flaw of classic Barrowman.
   - Allen & Perkins viscous crossflow lift at angle of attack.
2. **High-Mach Drag Breakdown ($M=0.8$ to $M=4.0$):**
   - $$C_D(M) = C_{D,f}(M) + C_{D,wave}(M) + C_{D,base}(M) + C_{D,protuberance}$$
   - **Skin Friction ($C_{D,f}$):** Van Driest II compressible turbulent boundary layer formulation accounting for kinetic heating and Reynolds number.
   - **Wave Drag ($C_{D,wave}$):**
     - Nosecone wave drag based on fineness ratio and shape (Von Kármán Sears-Haack minimal drag vs. Conical shock).
     - Fin wave drag via Ackeret supersonic linear theory adjusted for leading-edge sweep angle and airfoil cross-section (double-wedge vs. rounded).
   - **Base Drag ($C_{D,base}$):**
     - Subsonic base suction peaking at Mach 1.0 ($C_D \approx 0.38$), dropping off supersonically ($1/M^{1.1}$).
     - **Motor Plume Reduction:** 60% reduction in base drag during powered motor burn ($C_{D,base,power-on} \approx 0.38 \cdot C_{D,base,power-off}$).
     - **Boattail Reduction Factor:** Base area reduction cutting base drag proportional to $(d_{base} / d_{body})^2$.
   - **Protuberance Drag:** Boundary-layer immersed parasitic drag for cylindrical launch lugs and aerodynamic airfoil rail buttons:
     $$C_{D,lug} = C_{D,cylinder} \cdot \frac{A_{frontal}}{S_{ref}} \cdot \left(\frac{y_{lug}}{\delta(x)}\right)^{1/7}$$
3. **Supersonic Center of Pressure Migration:**
   - Models the forward migration of vehicle CP at high Mach numbers as fin lift effectiveness degrades ($\propto 1/\sqrt{M^2 - 1}$) while nosecone lift remains constant.
4. **NACA TN 4197 Fin Flutter Boundary:**
   - Calculates critical flutter velocity ($V_f$) and flutter Mach number ($M_f$):
     $$V_f = a \cdot \sqrt{\frac{2 \cdot G \cdot (t/c)^3 \cdot (\text{AR} + 2)}{1.337 \cdot \text{AR}^3 \cdot P_{\text{ambient}} \cdot (\lambda + 1)}}$$
   - Automatically checks material shear modulus $G$ against predicted maximum flight velocity with a $1.25\times$ safety factor.
5. **RASAero Interoperability:**
   - Export aerodynamic matrix table (`.csv`) with columns: `[Mach, AoA, CD_power_off, CD_power_on, CNa, CP]`.
   - Export RASAero `.cdx1` outer mold line geometry.

---

### Mode 3: Propulsion & Motor Studio (`[🔥 Propulsion & Motors]`)
*Primary Objective: Provide comprehensive rocket motor selection, custom thrust curve editing, and real-time propellant mass depletion modeling.*

1. **Certified COTS Motor Library:**
   - Pre-loaded database of certified solid rocket motors from **Estes**, **AeroTech**, and **Cesaroni CTI** spanning impulse classes A through M.
   - Parameters: Designation, impulse class, casing diameter, length, total impulse ($I_t$), average thrust, peak thrust, burn time, propellant mass, and total wet mass.
2. **RASP (`.eng`) / RockSim (`.rse`) Thrust Curve Engine:**
   - Interactive SVG thrust curve editor displaying $F(t)$.
   - Real-time linear spline interpolation: `getMotorThrustAt(motor, t)`.
   - Propellant consumption tracking:
     $$m_{propellant}(t) = m_{prop,total} \cdot \left(1 - \frac{\int_0^t F(\tau) d\tau}{I_{total}}\right)$$
   - Longitudinal Center of Gravity shift calculation as propellant burns from the aft motor casing, moving the rocket's CG forward during ascent.
3. **Motor Mount Assignment:**
   - Assign motor to any body tube or internal motor mount tube.
   - Automated check verifying motor diameter matches tube inner diameter with standard centering rings.

---

### Mode 4: 6-DOF Trajectory & Weather Studio (`[🚀 Trajectory & Weather]`)
*Primary Objective: Accurate flight simulation from launch rail release through parachute descent, including atmospheric wind profiles and statistical landing dispersion.*

1. **Standard Atmosphere Model (ISA 1976):**
   - Real-time evaluation of temperature $T(h)$, pressure $P(h)$, air density $\rho(h)$, and speed of sound $a(h)$ up to $20\text{ km}$ altitude.
2. **Atmospheric Wind Soundings (Dual-Source):**
   - **Automated Live REST API Fetch:** Integrated connection to Open-Meteo / NOAA GFS to pull live atmospheric soundings (wind speed, wind azimuth, temperature vs altitude) by launch site latitude and longitude.
   - **Manual Wind Shear Profile:** Editable table allowing engineers to define custom wind vectors at discrete altitude layers (e.g. surface, $500\text{m}$, $1000\text{m}$, $2000\text{m}$, $3000\text{m}$).
3. **Flight Dynamics Numerical Integration:**
   - Solves equations of motion at $\Delta t = 0.01\text{s}$ tracking:
     1. **Ignition & Launch Rail Ascent:** Constrained rail guidance checking **Rail Exit Velocity** ($\ge 15\text{ m/s}$ minimum safe clearance gate).
     2. **Powered Ascent:** Thrust active, mass depleting, power-on base drag active.
     3. **Burnout & Coasting Ascent:** Unpowered coast, tracking Max Velocity, Max Mach, and Max Dynamic Pressure ($Q_{max} = \frac{1}{2} \rho v^2$).
     4. **Apogee & Drogue Ejection:** Exact velocity zero-crossing ($v = 0$), deploying high-speed drogue parachute.
     5. **Main Parachute Deployment:** Triggered at target altitude AGL (e.g. $250\text{m}$), decelerating to touchdown speed.
     6. **Ground Touchdown:** Landing velocity and **Kinetic Energy at Touchdown** check ($E = \frac{1}{2} m v^2 \le 20\text{ J}$ safety stamp).
4. **Monte Carlo Dispersion Engine:**
   - **Fast Interactive Mode (Main Thread):** Runs $N = 50 - 100$ trajectory passes in $\sim 1\text{s}$ with Gaussian perturbation of wind azimuth ($\pm 15^\circ$), launch rail elevation ($\pm 1^\circ$), and motor impulse ($\pm 2\%$).
   - **Deep Competition Mode (Web Workers):** Runs $N = 500 - 1000$ trajectory passes in the background, plotting a 2D landing scatter plot with 1-sigma ($39.3\%$), 2-sigma ($86.5\%$), and $95\%$ containment ($k = 2.45\sigma$) landing dispersion ellipses (using the bivariate Rayleigh/Chi-square $df=2$ distribution: $P = 1 - e^{-k^2/2}$).
5. **Interactive Telemetry Dashboard:**
   - Altitude vs. Time curve.
   - Velocity vs. Time & Mach vs. Time curve.
   - Acceleration vs. Time curve.
   - Event timeline with exact timestamps and velocities.

---

### Mode 5: Recovery Packaging & Flight Evidence Ledger (`[📊 Flight Evidence & Logs]`)
*Primary Objective: Close the loop between simulation and physical reality—packaging recovery bays safely and calibrating aerodynamic models using real flight altimeter logs.*

1. **Dual-Compartment Recovery Packaging Visualizer:**
   - Physical clearance verification between recovery bulkheads, coupler shoulders, avionics sleds, and folded parachutes.
   - Computes packed parachute density ($\text{g/cm}^3$) to prevent over-compression deployment jams:
     $$\rho_{\text{packed}} = \frac{m_{\text{chute}}}{V_{\text{bay}}} \quad (\text{Target: } 0.25 - 0.35\text{ g/cm}^3)$$
2. **Automated Black Powder Ejection Sizing:**
   - Ideal gas expansion formulation:
     $$m_{\text{BP}} = \frac{P_{\text{target}} \cdot V_{\text{bay}}}{R \cdot T_{\text{combustion}}}$$
   - Automatically determines target pressure $P_{\text{target}}$ based on shear pin ratings (e.g. 2-56 or 4-40 nylon shear pins) to ensure positive separation without airframe rupture.
3. **Flight Altimetry Log Ingestion:**
   - Direct drag-and-drop ingestion of physical flight logs from **AltOS** (`.eeprom`, CSV), **FlightSketch**, **StratoLogger**, and generic data logger CSVs.
4. **Synchronized Flight vs. Simulation Multi-Plot Overlay:**
   - Visual comparison overlaying the simulated predicted altitude curve directly on top of the recorded sensor altimeter curve.
   - Displays exact delta metrics: $\Delta h_{\text{apogee}}$, $\Delta v_{\text{burnout}}$, and descent rate discrepancies.
5. **Automated Effective $C_D$ Calibration Engine:**
   - Solves the inverse flight dynamics problem: utilizes measured deceleration during unpowered coasting flight to calculate the physical painted rocket's true real-world drag coefficient ($C_{D,\text{calibrated}}$).
   - Feeds the calibrated $C_D$ back into the vehicle specification, ensuring subsequent simulations achieve $< 3\%$ error.

---

## 3. Data Specifications & File Formats

### 3.1 Astraea Single Source of Truth (`.astraea.json`)
The canonical vehicle representation is stored as a versioned, normalized JSON schema:
```json
{
  "schemaVersion": "1.0.0",
  "id": "vehicle-1788883500",
  "name": "Astraea Competition Sounding Rocket",
  "author": "University Rocketry Team",
  "units": "SI",
  "components": [
    {
      "id": "nc-01",
      "name": "Von Kármán Nosecone",
      "type": "nosecone",
      "shape": "vonkarman",
      "length": 0.65,
      "baseDiameter": 0.1524,
      "wallThickness": 0.0035,
      "isHollow": true,
      "materialId": "fiberglass",
      "surfaceFinish": "polished",
      "color": "#06b6d4"
    },
    {
      "id": "bt-01",
      "name": "Main Airframe Tube",
      "type": "bodytube",
      "length": 1.45,
      "outerDiameter": 0.1524,
      "innerDiameter": 0.146,
      "materialId": "carbonfiber",
      "surfaceFinish": "smooth_paint",
      "color": "#18181b"
    },
    {
      "id": "fin-01",
      "name": "Aft Clipped Delta Fins",
      "type": "trapezoidfinset",
      "finCount": 4,
      "rootChord": 0.32,
      "tipChord": 0.12,
      "span": 0.18,
      "sweepLength": 0.18,
      "thickness": 0.0048,
      "crossSection": "airfoil",
      "axialOffset": 1.10,
      "materialId": "carbonfiber"
    }
  ],
  "motor": {
    "assignedMotorId": "aerotech_k550w",
    "motorMountTubeId": "bt-01"
  },
  "recovery": {
    "drogueChuteId": "chute-drogue",
    "mainChuteId": "chute-main",
    "mainDeployAltitudeAGL": 250
  }
}
```

### 3.2 Interoperability Adapters
- **OpenRocket (`.ork`):** Bidirectional import and export via client-side `JSZip` and `fast-xml-parser`. Maps OpenRocket XML nodes (`<nosecone>`, `<bodytube>`, `<transition>`, `<trapezoidfinset>`) directly into Astraea's component tree.
- **RockSim (`.rkt`):** Native XML parser converting millimeters and grams to SI units (meters and kilograms).
- **RASAero II (`.cdx1`):** Plaintext outer mold line export and aerodynamic lookup table export.
- **ThrustCurve / RASP (`.eng`):** Standard motor thrust curve format ingestion.
- **AltOS / FlightSketch (CSV):** Sensor time-series telemetry parser.

---

## 4. Verification, Testing & Safety Acceptance Criteria

Astraea enforces automated verification across all computational layers:
1. **Aerodynamics Unit Tests:**
   - Nosecone analytical centroids: Conical ($0.666 \cdot L$), Ogive ($0.466 \cdot L$), Parabolic ($0.500 \cdot L$), Von Kármán ($0.500 \cdot L$).
   - Barrowman & Rogers fin lift slopes verified against published NASA TM X-67216 benchmarks.
   - Van Driest II compressible skin friction scaling monotonically down with Mach number.
   - High-Mach wave drag: Von Kármán wave drag verified $< 60\%$ of Conical wave drag at Mach 2.0.
   - Fin flutter speed ($V_f$) calculated within $1\%$ of NACA TN 4197 Equation 18.
2. **Trajectory & Atmospheric Unit Tests:**
   - ISA 1976 atmosphere tested against sea level ($15^\circ\text{C}, 101325\text{ Pa}, 1.225\text{ kg/m}^3, 340.3\text{ m/s}$) and stratosphere ($11\text{km}$).
   - Apogee prediction on Estes Alpha III within $\pm 5\%$ of published Estes C6 flight data.
   - Launch rail exit velocity check correctly flags unsafe launches $< 15\text{ m/s}$.
   - Touchdown kinetic energy correctly flags high-impact landings $> 20\text{ J}$.
3. **Performance Targets:**
   - 3D WebGL Canvas renders at consistent **60 FPS** during continuous parameter slider dragging on integrated laptop GPUs.
   - Live Barrowman & high-Mach aerodynamic curve evaluation runs in **$< 10\text{ms}$**.
   - 6-DOF numerical flight trajectory simulation runs in **$< 50\text{ms}$**.
   - Fast Monte Carlo dispersion (100 runs) executes in **$< 1.5\text{s}$**.
