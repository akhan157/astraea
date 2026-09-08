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
     - Subsonic base suction peaking at Mach 1.0 ($C_D \approx 0.38$), decaying smoothly as $0.38 / M^{1.2}$ in supersonic expansion.
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

---

## 5. Technical Contract 1: Verified 6-DOF Adaptive Integrator Specification

### 5.1 State Vector & Frame Definitions
Astraea defines one canonical state vector $\mathbf{x}(t)$ in 3D Euclidean space:
$$\mathbf{x}(t) = \begin{bmatrix} \mathbf{r}_N(t) \\ \mathbf{v}_N(t) \\ \mathbf{q}_{NB}(t) \\ \boldsymbol{\omega}_B(t) \end{bmatrix} \in \mathbb{R}^3 \times \mathbb{R}^3 \times \mathbb{H}_1 \times \mathbb{R}^3$$

- **Navigation Frame ($N$):** Standard right-handed East-North-Up (ENU) tangent inertial frame: $+X_N$ East, $+Y_N$ North, $+Z_N$ Up (Altitude AGL). (Three.js WebGL viewport maps $+Z_N$ to viewport $+Y$ for visual vertical alignment).
- **Body Frame ($B$):** Origin at instantaneous Center of Mass ($\mathbf{r}_{CG}(t)$). $+Y_B$ aligned with vehicle longitudinal axis (pointing toward nosecone tip), $+X_B$ lateral pitch axis (coplanar with fin 1), $+Z_B$ lateral yaw axis completing right-handed triad.
- **Attitude Quaternion ($\mathbf{q}_{NB}$):** Unit quaternion rotating vectors from body frame $B$ into navigation frame $N$:
  $$\mathbf{v}_N = \mathbf{R}_{NB}(\mathbf{q}_{NB}) \cdot \mathbf{v}_B$$

### 5.2 Equations of Motion
For rigid-body motion with instantaneous vehicle mass $m(t)$ and diagonal inertia tensor $\mathbf{I}_B(t) = \text{diag}(I_{xx}, I_{yy}, I_{zz})$:

$$\dot{\mathbf{r}}_N = \mathbf{v}_N$$
$$\dot{\mathbf{v}}_N = \frac{1}{m(t)} \mathbf{R}_{NB} \mathbf{F}_B + \mathbf{g}_N$$
$$\dot{\mathbf{q}}_{NB} = \frac{1}{2} \mathbf{q}_{NB} \otimes [0, \boldsymbol{\omega}_B]^T$$
$$\dot{\boldsymbol{\omega}}_B = \mathbf{I}_B(t)^{-1} \left[ \mathbf{M}_B - \boldsymbol{\omega}_B \times (\mathbf{I}_B(t) \boldsymbol{\omega}_B) \right]$$

### 5.3 Numerical Integrator: Adaptive Dormand-Prince RK54
- **Integrator:** Embedded Runge-Kutta 5(4) with continuous 4th-order dense output.
- **Tolerances:** Independent absolute tolerances:
  - Position: $\text{atol}_{\mathbf{r}} = 10^{-3}\text{ m}$
  - Velocity: $\text{atol}_{\mathbf{v}} = 10^{-2}\text{ m/s}$
  - Attitude: $\text{atol}_{\mathbf{q}} = 10^{-5}$
  - Angular Rate: $\text{atol}_{\boldsymbol{\omega}} = 10^{-3}\text{ rad/s}$
- **Quaternion Normalization:** Renormalize $\|\mathbf{q}_{NB}\| = 1$ at every accepted step. Measure error using geodesic rotation angle $\Delta \theta = 2 \arccos(|q_1 \cdot q_2|)$, never raw Euclidean subtraction.
- **Dense-Output Event Root-Finding:** Continuous interpolation for exact event localization:
  - $t_{\text{rail}}$: Distance along rail $s(t) - L_{\text{rail}} = 0$
  - $t_{\text{burnout}}$: $t - t_{\text{burn}} = 0$
  - $t_{\text{apogee}}$: Vertical velocity zero-crossing $v_{N,y}(t) = 0$
  - $t_{\text{main}}$: Main deploy altitude $r_{N,y}(t) - h_{\text{main}} = 0$
  - $t_{\text{touchdown}}$: Ground contact $r_{N,y}(t) = 0$
- **Discontinuous Forcing Reset:** Stop and restart integrator at state transitions (rail exit, staging, motor burnout, parachute bloom) to prevent numerical stiffness.

---

## 6. Technical Contract 2: Unified Air-Relative Loads & Aerodynamic Validity API

### 6.1 Flow State Evaluation
All aerodynamic models consume a single, synchronized `FlowState`:
$$\mathbf{v}_{\text{air}, N} = \mathbf{v}_N - \mathbf{w}_N(\mathbf{r}_N, t)$$
$$\mathbf{v}_{\text{air}, B} = \mathbf{R}_{NB}^T \cdot \mathbf{v}_{\text{air}, N}$$
$$V = \|\mathbf{v}_{\text{air}, B}\|, \quad \bar{q} = \frac{1}{2} \rho(h) V^2, \quad M = \frac{V}{a(h)}, \quad Re = \frac{\rho(h) V L_{\text{ref}}}{\mu(h)}$$
$$\alpha = \text{atan2}(v_{\text{air}, B, z}, v_{\text{air}, B, y}), \quad \beta = \text{atan2}\left(v_{\text{air}, B, x}, \sqrt{v_{\text{air}, B, y}^2 + v_{\text{air}, B, z}^2}\right)$$

### 6.2 Load Assembly & Moment Transformation
Aerodynamic forces and moments are assembled about the vehicle's instantaneous Center of Mass:
$$\mathbf{F}_B = \bar{q} S_{\text{ref}} \begin{bmatrix} C_X(\beta, M) \\ -C_D(\alpha, \beta, M) \\ C_Z(\alpha, M) \end{bmatrix}$$
$$\mathbf{M}_{\text{CG}} = \mathbf{M}_{\text{ref}} + (\mathbf{r}_{\text{ref}} - \mathbf{r}_{\text{CG}}(t)) \times \mathbf{F}_B + \mathbf{M}_{\text{damping}}$$

Where aerodynamic pitch and yaw damping moments are evaluated with rate derivatives:
$$M_{\text{pitch, damp}} = \bar{q} S_{\text{ref}} L_{\text{ref}} \left[ C_{m_q}(M) \frac{q_B L_{\text{ref}}}{2V} \right]$$
$$M_{\text{yaw, damp}} = \bar{q} S_{\text{ref}} L_{\text{ref}} \left[ C_{n_r}(M) \frac{r_B L_{\text{ref}}}{2V} \right]$$
$$M_{\text{roll, cant}} = \bar{q} S_{\text{ref}} d_{\text{ref}} \left[ C_{l,\delta} \delta_{\text{cant}} + C_{l_p}(M) \frac{p_B d_{\text{ref}}}{2V} \right]$$

### 6.3 Aerodynamic Validity Classifications
Every aerodynamic evaluation returns a strict operational domain classification:
- `VALID`: Flow parameters within validated physics envelope ($M \le 4.0, \alpha \le 15^\circ$).
- `EXTRAPOLATED`: Flow parameters exceed nominal test envelope ($15^\circ < \alpha \le 30^\circ$ or $4.0 < M \le 6.0$). Emits simulation warning.
- `UNSUPPORTED`: Unphysical conditions ($\alpha > 30^\circ$ or negative pressure). Strict mode halts simulation with error.

---

## 7. Technical Contract 3: Reproducible Ensemble Runner & Uncertainty Quantification

### 7.1 Scenario Definition Schema
An uncertainty ensemble is fully specified by an immutable `scenario.json`:
```json
{
  "scenarioVersion": "1.0.0",
  "vehicleSpecPath": "rocket.astraea.json",
  "motorSpecPath": "aerotech_k550w.eng",
  "randomSeed": 42,
  "sampleCount": 500,
  "samplingMethod": "latin_hypercube",
  "uncertainParameters": {
    "windSpeedSurface": { "distribution": "weibull", "shape": 2.1, "scale": 4.5 },
    "windAzimuthDeg": { "distribution": "uniform", "min": 0, "max": 360 },
    "railElevationDeg": { "distribution": "gaussian", "mean": 85.0, "std": 0.5 },
    "motorTotalImpulseMultiplier": { "distribution": "gaussian", "mean": 1.0, "std": 0.015 },
    "surfaceRoughnessMicrons": { "distribution": "lognormal", "mean": 5.0, "std": 1.2 }
  },
  "safetyLimits": {
    "minRailExitVelocity": 15.0,
    "maxLandingKineticEnergy": 20.0,
    "maxLandingDriftRadius": 1500.0
  }
}
```

### 7.2 Bivariate 2D Landing Dispersion Ellipse Mathematics
For the resulting 2D landing coordinates $(x_i, z_i)$ (East, North), Astraea computes the bivariate covariance matrix $\mathbf{\Sigma} \in \mathbb{R}^{2 \times 2}$.

In a 2D bivariate Gaussian distribution, the cumulative containment probability inside ellipse $(\mathbf{r} - \boldsymbol{\mu})^T \mathbf{\Sigma}^{-1} (\mathbf{r} - \boldsymbol{\mu}) \le k^2$ is governed by the 2-DOF Chi-square distribution:
$$P(k) = 1 - e^{-k^2 / 2}$$

Astraea rigorously draws and labels containment boundaries:
- **$k = 1.000\sigma \implies 39.3\%$ probability**
- **$k = 1.414\sigma \implies 63.2\%$ probability**
- **$k = 2.000\sigma \implies 86.5\%$ probability**
- **$k = 2.448\sigma \implies 95.0\%$ probability** *(Official Spaceport America Cup / NASA Student Launch Safety Gate)*
- **$k = 3.035\sigma \implies 99.0\%$ probability**

Limit exceedance probabilities $\hat{P}_j = \frac{1}{N} \sum \mathbf{1}[g_j(\mathbf{y}_i) > 0]$ are reported with Wilson score binomial confidence intervals.

---

## 8. Verification & Validation (V&V) Acceptance Matrix

To achieve full engineering certification, Astraea enforces strict analytical benchmarks:
1. **Vacuum Ballistic Benchmark:** Neglecting aero and thrust, integrated trajectory matches closed-form parabolic coordinates $y(t) = v_0 t - \frac{1}{2} g t^2$ within $\le 10^{-4}\text{ m}$.
2. **Torque-Free Asymmetric Rigid-Body Rotation:** Over 100 characteristic rotation cycles, total mechanical energy drift $\frac{|\Delta E|}{E_0} \le 10^{-6}$ and angular momentum vector error $\frac{\|\Delta \mathbf{L}\|}{L_0} \le 10^{-6}$.
3. **Quaternion Antipodal Invariance:** Initial orientation $\mathbf{q}$ and $-\mathbf{q}$ produce mathematically identical trajectories.
4. **Event Localization Accuracy:** Dense-output root-finding resolves exact apogee and rail departure timestamps to within $\le 10^{-5}\text{ s}$.

---

## 9. Technical Contract 4: Advanced Multi-Body Separation, Rail Tip-Off & Roll Resonance

### 9.1 Multi-Stage Staging Separation Dynamics (`FD-SEP-001`)
At stage separation timestamp $t_{\text{stage}}$, the vehicle is decomposed into two distinct, coupled dynamic bodies:
$$\mathbf{x}_{\text{sustainer}}(t) = [\mathbf{r}_1, \mathbf{v}_1, \mathbf{q}_1, \boldsymbol{\omega}_1]^T, \quad \mathbf{x}_{\text{booster}}(t) = [\mathbf{r}_2, \mathbf{v}_2, \mathbf{q}_2, \boldsymbol{\omega}_2]^T$$

1. **Kinetic Separation Impulse ($J_{\text{sep}}$) & Kinematic Translation:**
   Accounting for pre-separation rotational velocity from child center-of-mass offset $\boldsymbol{\rho}_i^B$ from parent CG:
   $$\mathbf{r}_i^N = \mathbf{r}_P^N + \mathbf{R}_{NB} \boldsymbol{\rho}_i^B$$
   $$\mathbf{v}_i^{N,+} = \mathbf{v}_P^{N,-} + \mathbf{R}_{NB} (\boldsymbol{\omega}_P^{B,-} \times \boldsymbol{\rho}_i^B) + \frac{\mathbf{J}_i^N}{m_i}$$
   $$\boldsymbol{\omega}_i^{B,+} = \boldsymbol{\omega}_P^{B,-} + \mathbf{I}_i^{-1} \left( \mathbf{r}_{\text{offset}, i} \times \mathbf{J}_i^B \right)$$

2. **Momentum Conservation Invariant:**
   In the absence of external aerodynamic forces, the separation event strictly conserves linear and angular momentum about the system center of mass:
   $$\Delta \mathbf{P}_{\text{total}} = m_1 \mathbf{v}_1(t^+) + m_2 \mathbf{v}_2(t^+) - (m_1 + m_2) \mathbf{v}(t^-) = \mathbf{0} \quad (\text{tolerance } \le 10^{-7}\text{ N}\cdot\text{s})$$

3. **Recontact & Collision Detection:**
   Evaluates relative displacement along the separation vector accounting for booster residual motor thrust tail-off ($F_{\text{tail-off}}(t)$) and differential aerodynamic drag:
   $$d_{\text{rel}}(t) = (\mathbf{r}_1(t) - \mathbf{r}_2(t)) \cdot \hat{\mathbf{n}} > 0 \quad \forall t \in [t_{\text{stage}}, t_{\text{stage}} + 2.0\text{s}]$$
   If $d_{\text{rel}}(t) \le 0$, Astraea emits a **Recontact / Stage Collision Hazard Warning**.

### 9.2 Launch Rail Multi-Point Tip-Off Dynamics (`FD-TIP-001`)
Launch rail departure is modeled as a progressive multi-contact constraint with forward button ($x_{\text{fwd}}$) and aft button ($x_{\text{aft}}$):
1. **Phase 1 (Dual-Button Constrained):** Both buttons in rail guide channel ($s < L_{\text{rail}} - (x_{\text{aft}} - x_{\text{fwd}})$). 1-DOF constrained along rail vector; rotational rates $\boldsymbol{\omega} = \mathbf{0}$.
2. **Phase 2 (Tip-Off Pivot Phase):** Forward button exits rail at $s = L_{\text{rail}} - \Delta x_{\text{buttons}}$. Aft button remains pinned in the channel acting as a physical fulcrum! Crosswind $w_{\text{cross}}$ induces an unbalanced tip-off pitching torque about the aft button:
   $$M_{\text{tip-off}} = F_{N, \text{crosswind}} \cdot (x_{\text{aft}} - x_{cp}) - m g \cos(\theta_{\text{rail}}) \cdot (x_{\text{aft}} - x_{cg})$$
   $$\ddot{\theta}_{\text{tip-off}} = \frac{M_{\text{tip-off}}}{I_{\text{pitch}} + m (x_{\text{aft}} - x_{cg})^2}$$
   Induces an exit pitch rate $\dot{\theta}_{\text{exit}}$ that biases the initial post-rail trajectory.
3. **Phase 3 (Free 6-DOF Flight):** Aft button clears rail at $s = L_{\text{rail}}$. Full 6-DOF equations of motion take over.

### 9.3 Roll-Pitch Resonance & Roll Lock-In (`FD-RES-001`)
Fin cant angle $\delta_{\text{cant}}$ induces roll spin rate $p(t)$. As vehicle accelerates, vehicle pitch natural frequency varies with dynamic pressure:
$$\omega_n(t) = \sqrt{\frac{C_{N\alpha}(t) \cdot \bar{q}(t) \cdot S_{\text{ref}} \cdot (x_{cp}(t) - x_{cg}(t))}{I_{\text{pitch}}(t)}}$$

When roll rate crosses natural pitch frequency ($p(t) \approx \omega_n(t)$), asymmetric fin or mass moments induce **Pitch-Roll Resonance (Roll Lock-In)**, driving angle of attack to extreme angles ($> 20^\circ$).
Astraea calculates the **Resonance Avoidance Margin**:
$$\text{RAM}(t) = \frac{|p(t) - \omega_n(t)|}{\omega_n(t)}$$
Flags a critical hazard if $\text{RAM}(t) < 0.20$ while dynamic pressure $\bar{q} > 5,000\text{ Pa}$.

### 9.4 Parachute Inflation Dynamics & Opening Shock Loads (`FD-SHK-001`)
Canopy opening is modeled via the **Pflanz Ballistic Method**:
1. **Canopy Inflation Time ($t_f$):**
   $$t_f = \frac{n_c \cdot D_0}{V_0} \quad (n_c \approx 8.0 \text{ for conical ribbon, } 12.0 \text{ for flat circular})$$
2. **Pflanz Ballistic Coefficient ($A$):**
   $$A = \frac{2 \cdot m_{\text{suspended}}}{\rho \cdot S_0 \cdot C_D \cdot V_0 \cdot t_f}$$
3. **Opening Shock Factor ($C_x$):**
   $$C_x = 1.0 + \frac{1.45}{A + 0.35}$$
4. **Peak Opening Shock Force ($F_{\text{shock}}$):**
   $$F_{\text{shock}} = C_x \cdot \left(\frac{1}{2} \rho V_0^2\right) \cdot S_0 \cdot C_D$$
   Verifies that $F_{\text{shock}}$ does not exceed the certified proof load of recovery harnesses, shock cords, and forged eye-bolts with structural safety factor $\ge 2.0$.

---

## 10. Technical Contract 5: Avionics, Sensor Physics & Hardware Protocols

### 10.1 Geodetic Coordinate & Altitude Datums (`AV-DAT-001`)
Rigorous transformations between coordinate datums:
- **WGS84 Ellipsoidal:** Geodetic Latitude $\phi$, Longitude $\lambda$, Ellipsoidal Height $h_{\text{ellips}}$.
- **Mean Sea Level (MSL):** Corrected with EGM96 Geoid Undulation model $N(\phi, \lambda)$:
  $$h_{\text{MSL}} = h_{\text{ellips}} - N(\phi, \lambda)$$
- **Above Ground Level (AGL):** Referenced to launch site terrain elevation $h_{\text{pad}}$:
  $$h_{\text{AGL}} = h_{\text{MSL}} - h_{\text{pad}}$$

### 10.2 Sensor Specific Force & IMU Physics (`AV-SEN-001`)
1. **Specific Force Formulation:**
   Accelerometers measure specific force $\mathbf{f}_B$, not kinematic acceleration:
   $$\mathbf{f}_B = \mathbf{a}_B - \mathbf{R}_{NB}^T \mathbf{g}_N + \boldsymbol{\omega}_B \times (\boldsymbol{\omega}_B \times \mathbf{r}_{\text{IMU}}) + \dot{\boldsymbol{\omega}}_B \times \mathbf{r}_{\text{IMU}}$$
   where $\mathbf{r}_{\text{IMU}}$ is the lever-arm offset vector from the vehicle Center of Mass.
2. **Static Port Transonic Pressure Depression:**
   Barometric altimeters experience transonic port depression:
   $$P_{\text{port}} = P_{\text{ambient}} + C_{p, \text{port}} \cdot \left(\frac{1}{2} \rho V^2\right)$$
   where $C_{p, \text{port}} \approx -0.18$ across Mach 0.85–1.15, causing false apogee barometric spikes ("Mach dip"). Astraea models altimeter Mach-inhibit timers.

### 10.3 Supported Altimeter Compatibility Contracts (`AV-DEV-001`)
Native, verified binary and CSV decoders for dominant competition flight computers:
- **AltOS:** TeleMetrum, EasyMini, TeleMega (`.eeprom` binary hex dumps and standard CSV).
- **FlightSketch:** FlightSketch Mini, FlightSketch Comp (BLE stream & CSV time-series).
- **Featherweight:** Raven 3/4, Blue Raven (multi-channel 100g accel, 16g accel, and baro CSV).
- **PerfectFlite:** StratoLogger CF, FireFly (direct EEPROM text dumps).

---

## 11. Technical Contract 6: Recovery Pyrotechnics & Temperature-Derated Shear Hardware

### 11.1 Temperature-Derated Shear Pin Mechanics (`PY-SHR-001`)
High-power competition rockets experience aerodynamic boundary layer skin friction heating:
$$T_{\text{recovery}} = T_{\text{ambient}} \cdot \left( 1 + 0.89 \cdot \frac{\gamma - 1}{2} M^2 \right)$$

Nylon shear pins (2-56 and 4-40) exhibit temperature-dependent shear strength degradation:
$$\tau_{\text{shear}}(T) = \tau_{\text{nominal}} \cdot \left[ 1.0 - 0.0042 \cdot (T - 20^\circ\text{C}) \right]$$
- **2-56 Nylon Shear Pin:** Nominal $155\text{ N}$ ($35\text{ lbf}$) at $20^\circ\text{C}$; drops to $125\text{ N}$ ($28\text{ lbf}$) at $65^\circ\text{C}$.
- **4-40 Nylon Shear Pin:** Nominal $310\text{ N}$ ($70\text{ lbf}$) at $20^\circ\text{C}$; drops to $251\text{ N}$ ($56\text{ lbf}$) at $65^\circ\text{C}$.

### 11.2 Redundant Dual-Deployment State Machine (`PY-RED-001`)
Astraea models dual-altimeter pyrotechnic redundancy states:
1. **Primary Apogee Event:** Fires at vertical velocity zero-crossing ($v_y = 0\text{ m/s}$).
2. **Backup Apogee Event:** Fires at $t_{\text{primary}} + 1.5\text{s}$ or when barometric altitude drops $\ge 50\text{m}$ below detected peak.
3. **Primary Main Chute Event:** Fires at configured $h_{\text{main}}$ (e.g. $250\text{m}$ AGL).
4. **Backup Main Chute Event:** Fires at $h_{\text{main}} - 50\text{m}$ (e.g. $200\text{m}$ AGL).
5. **Black Powder Separation Charge Pressure Sizing:**
   $$P_{\text{target}} = \frac{N_{\text{pins}} \cdot F_{\text{shear}}(T) \cdot SF + F_{\text{friction}}}{A_{\text{bulkhead}}}$$
   $$m_{\text{BP}} = \frac{P_{\text{target}} \cdot V_{\text{bay}}}{R_{\text{gas}} \cdot T_{\text{flame}}} \quad (R_{\text{gas}} = 280\text{ J/(kg}\cdot\text{K)}, \, T_{\text{flame}} = 1750\text{ K})$$
   Enforces safety factor $SF \in [1.75, 2.25]$ to guarantee separation without airframe rupture.

---

## 12. Technical Contract 7: Competition Verification Engines & Git Semantic Diffs

### 12.1 Automated Collegiate Competition Verification Profiles (`CP-PRF-001`)
Astraea includes built-in verification rule engines for major collegiate competitions:

1. **NASA Student Launch Competition Profile:**
   - Target Altitude: Configurable target (e.g. 4,500 ft AGL).
   - Rail Departure Safety: $v_{\text{exit}} \ge 80\text{ ft/s}$ ($24.4\text{ m/s}$) on specified launch rail.
   - Touchdown Kinetic Energy Limit: $\le 75\text{ ft}\cdot\text{lbf}$ ($101.7\text{ J}$) for every separated section.
   - Parachute Drift Limit: Must land within $2,500\text{ ft}$ radius of launch pad under $20\text{ mph}$ wind.
   - Dual-Altimeter Redundancy: Verified dual independent power and deployment charges.

2. **Spaceport America Cup (ESRA) Competition Profile:**
   - Categories: 10,000 ft and 30,000 ft AGL (COTS Solid / Hybrid / Liquid).
   - 95% Landing Containment Ellipse ($k = 2.45\sigma$) must fall entirely within the designated range boundary.
   - Launch Rail Departure Velocity: $\ge 100\text{ ft/s}$ ($30.5\text{ m/s}$) for high-power entries.
   - Minimum Static Stability Margin: $\ge 1.5$ calibers at rail exit.

3. **EuRoC (European Rocketry Challenge) Profile:**
   - Metric safety gates (3 km and 9 km categories).
   - Maximum descent velocity: $\le 9\text{ m/s}$ under main parachute.

### 12.2 Git-Backed Semantic Engineering Diffs (`CP-DIF-001`)
Provides human-readable, domain-specific semantic diffs between any two git commits of a `.astraea.json` vehicle:
```text
[ASTRAEA SEMANTIC DIFF] commit 3f8a1b -> commit 9e2c4d
├── Airframe Geometry:
│   └── FinSet "Aft Delta": Span increased 140mm -> 160mm (+14.3%)
├── Mass Properties:
│   ├── Total Dry Mass: 8.42 kg -> 8.68 kg (+260 g)
│   └── Center of Gravity (CG): 1.482m -> 1.504m aft (+22 mm rearward drift)
├── Stability & Aero:
│   ├── Center of Pressure (CP): 1.720m -> 1.785m aft (+65 mm)
│   └── Static Stability Margin: 1.56 cal -> 1.84 cal (+0.28 cal increase)
└── Flight Dynamics (Aerotech K550W):
    ├── Predicted Apogee: 1,842m -> 1,795m (-47m / -154 ft penalty)
    ├── Rail Exit Velocity: 23.8 m/s -> 25.1 m/s (NASA SL 80 ft/s [24.38 m/s] PASSED)
    └── Fin Flutter Speed: 348 m/s -> 382 m/s (+9.8% structural safety boost)
```
