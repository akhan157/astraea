# Survey of Rocketry Engineering Tools
## Architecture, Aerodynamic Solvers, and File Formats of Key Industry Tools
**Project Astraea Technical Investigation**  
**Date:** 2026-09-08  
**Target Applications:** RockSim, OpenRocket, RocketPy, openMotor, NASA CEA

---

## 1. Executive Landscape Matrix

University competition teams (NASA Student Launch, Spaceport America Cup, EuRoC) and high-power rocketeers (HPR Level 1–3) currently juggle several disparate software packages:

| Software | License / Access | Core Domain | Physics Methodology | Strengths | Critical Weaknesses |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **RockSim** | Commercial ($125+) Proprietary Desktop | Subsonic Design & Stability | "RockSim Method" (extended Barrowman + boattail fin integrals + vortex lift) | Fin flutter velocity (NACA TN 4197), large motor database | Closed-source, costly, poor high-Mach drag accuracy, legacy UI |
| **OpenRocket** | Open-Source (Java GPL) | Subsonic Vehicle Design & 6-DOF | Classical Barrowman + Component Interference; 4th-order Runge-Kutta | Open format (`.ork`), active community, visual 2D side-view | Java Swing UI, no modern 3D canvas, inaccurate above Mach 0.8 |
| **RocketPy** | Open-Source (Python MIT) | 6-DOF Trajectory & Dispersions | Quaternion 6-DOF numerical ODE integration; GFS/ECMWF atmospheric models | Real-world weather ensembles, Monte Carlo landing ellipses, multi-stage | No visual 3D CAD editor, requires Python scripting / Jupyter |
| **openMotor** | Open-Source (Python/C++ MIT) | Internal Ballistics & Propellant Grains | Face-offset grain regression; Chamber pressure $P_c(t)$; De Laval nozzle flow | Accurate burn curves for BATES, Finocyl, Moon, and Star grains | Isolated to motor casing; no vehicle airframe coupling |
| **NASA CEA** | Open-Source (NASA Fortran/C) | Thermochemical Combustion Equilibrium | Gibbs free energy minimization ($\min G = \sum \mu_i n_i$) | Exact theoretical $I_{sp}$, characteristic velocity $c^*$, flame $T_c$ | Antiquated Fortran I/O, difficult to embed into modern apps |

---

## 2. High-Mach Aerodynamics: Public Semi-Empirical Methods

Supersonic sounding-rocket prediction does not require full CFD (Navier-Stokes). The public-domain literature pipeline used here rests on **Missile DATCOM**-style semi-empirical terms and the **Rogers Modified Barrowman theory**, both of which are independently documented in the open literature.

> **Provenance note (2026-10-17).** The public-domain citations in this section
> (Barrowman, Rogers, Allen & Perkins, Ackeret, Van Driest, Taylor–Maccoll)
> apply to the **named methods**. Several coefficients used by the shipped
> solver are Astraea's own values, not published formulas: the base-drag curve,
> the motor-plume factor, the nose-shape factors, the supersonic CP shift and
> the body-lift station. Their source of record is the implementation and its
> module/function documentation (`crates/astraea-core/src/aero.rs`); no primary
> public source has been located for them. Where a number below is a model
> coefficient it is labelled as such — read those as values to validate, not as
> literature results. See [`aero-provenance.md`](../aero-provenance.md).

### 2.1 Subsonic Regime ($M < 0.8$): Rogers Modified Barrowman Method
Standard Barrowman theory (NASA TM X-67216) makes two critical simplifying assumptions that fail on real airframes:
1. It includes only $K_{fb}$ (the lift induced on the fin in the presence of the body) and **completely omits $K_{bf}$** (the lift induced on the body in the presence of the fins).
2. It assumes linear aerodynamics ($\alpha \approx 0$) and ignores viscous crossflow lift as angle of attack increases.

**Rogers Modified Formulation:**
- **Total Fin-Body Interference:**
  $$K_{total} = K_{fb} + K_{bf}$$
  Where:
  $$K_{fb} = 1 + \frac{R}{s + R}$$
  $$K_{bf} = \frac{R^2}{(s + R)^2} \cdot \left[ \left(1 + \frac{s}{R}\right) - \frac{R}{s + R} \right]$$
  *(Here $R$ is body tube radius, $s$ is fin semispan).*
  Inclusion of $K_{bf}$ increases predicted fin-region normal force by **15% to 25%**, correcting the common real-world observation that standard Barrowman underpredicts fin effectiveness at low angles of attack.

- **Body Viscous Crossflow (Allen and Perkins, NACA Report 1048):**
  As angle of attack $\alpha$ grows, flow separates over the leeward side of the cylindrical airframe, generating vortex crossflow lift:
  $$C_{N,vortex} = \eta \cdot C_{dc} \cdot \left(\frac{A_{plan}}{S_{ref}}\right) \cdot \sin^2\alpha$$
  Where $C_{dc}$ is cylinder crossflow drag coefficient (~1.2) and $\eta$ is crossflow drag proportionality factor.
  **Critical Engineering Consequence:** Because body crossflow lift acts near the midpoint of the airframe, as $\alpha$ increases, **the Center of Pressure moves forward**, degrading static margin.

### 2.2 Transonic & Supersonic Regime ($0.8 \le M \le 5.0$)
In supersonic flight, air cannot signal upstream. Shock waves form at the nose tip and fin leading edges.

- **Supersonic Center of Pressure Forward Migration:**
  In supersonic flow, the lift-curve slope of planar fins drops with Mach number according to Ackeret linear theory:
  $$C_{N\alpha, fin} \propto \frac{1}{\sqrt{M^2 - 1}}$$
  Meanwhile, the nosecone normal force slope remains approximately constant ($C_{N\alpha, nose} \approx 2.0$).
  **The Result:** At Mach 2–4, the nosecone generates a much larger share of total vehicle lift compared to the fins, so the Center of Pressure migrates forward as Mach number rises. Astraea does **not** implement a sourced 1.5–2.5-caliber migration: the shipped curve applies `shift = 0.45 · (1 − 1/√M)` calibers, capped at **0.8 calibers** (`compute_mach_dependent_cp`). That shift is a model coefficient without a located primary source, so a pad-stable vehicle's transonic static margin must be read from the computed curve rather than from a rule of thumb.

- **Supersonic Wave Drag Breakdown ($C_{D,wave}$):**
  $$C_D(M) = C_{D,f}(M) + C_{D,wave}(M) + C_{D,base}(M) + C_{D,protuberance}$$
  (Astraea ships the last term as **0**: the vehicle model carries no protuberance
  geometry, so the breakdown reports `protuberanceCd = 0`.)
  1. **Nosecone Wave Drag:** Computed via Taylor-Maccoll conical shock equations or parabolic/ogive Karman-Moore series. Ogive and Von Kármán nosecones exhibit significantly delayed wave drag divergence compared to blunt cones.
  2. **Fin Wave Drag:** Computed based on leading-edge sweep angle $\Lambda_{le}$ and airfoil cross-section:
     - Subsonic leading edge ($M \cos\Lambda_{le} < 1$): Bow shock detached, rounded edges reduce drag.
     - Supersonic leading edge ($M \cos\Lambda_{le} > 1$): Attached oblique shock wave; double-wedge or diamond foils reduce wave drag by 60% over rounded foils.
  3. **Skin Friction ($C_{D,f}$):** Van Driest II compressible turbulent boundary layer formula accounting for kinetic aerodynamic heating:
     $$C_f = \frac{0.074}{\text{Re}^{1/5} \cdot \left(1 + \frac{\gamma - 1}{2} M^2\right)^{0.65}}$$
  4. **Base Drag ($C_{D,base}$):** Astraea's shipped curve is its own heuristic, not a cited public formula: $C_{D,base} = 0.12 + 0.13 M^2$ below $M = 0.8$, a smoothstep to a **0.38 peak** at $M = 1.0$, then $0.38 / M^{1.2}$ decay. The powered plume factor (a 0.38 reduction of base drag) and the boattail factor — pure geometric area scaling, $(d_{base}/d_{body})^2$ — are model coefficients of the same status. Treat them as values to validate, not as published results.

### 2.3 Aerodynamic Output Tables
- **Aerodynamic Tables (`.csv` / `.txt`):** A multi-dimensional matrix:
  $$\text{Columns: } [ \text{Mach}, \alpha, C_D, C_{N\alpha}, CP, C_{D,power-on}, C_{D,power-off} ]$$

---

## 3. RockSim: Commercial Collegiate Standard Deconstruction

RockSim (by Tim Van Milligan / Apogee Components) is heavily utilized by university teams for NAR/TRA certification and subsonic/transonic contest flights.

### 3.1 The "RockSim Method"
Unlike standard Barrowman (which is restricted to 3 or 4 planar fins on cylindrical tubes), the RockSim method introduces:
1. **Fins Mounted on Conical Transitions / Boattails:**
   Standard Barrowman assumes a constant body radius $R$. When fins are mounted on a tapering aft boattail, RockSim integrates the local radius $R(x)$ along the fin root chord:
   $$R_{eff} = \frac{1}{c_r} \int_0^{c_r} R(x) \, dx$$
   And adjusts the interference factor $K_{fb}$ accordingly.
2. **Arbitrary Fin Counts:**
   Extends planar projection factors for 2, 5, 6, and 8 fins:
   $$C_{N\alpha, fins} = K_{fb} \cdot \left(\frac{N}{2}\right) \cdot (C_{N\alpha})_1 \quad (\text{for } N \ge 3)$$
3. **Angle of Attack Body Lift:**
   Estimates normal force on the cylindrical tube body at small angles of attack using slender body crossflow approximations.

### 3.2 Fin Flutter Velocity Formula (NACA TN 4197)
One of RockSim Pro's most valued features is the **Fin Flutter Speed Calculator**, which warns engineers before dynamic aeroelastic flutter tears fins off during high-acceleration motor burns.

The calculation is derived from **NACA Technical Note 4197** ("Summary of Flutter Experiences as a Guide to the Preliminary Design of Lifting Surfaces on Missiles"):

$$V_f = a \cdot \sqrt{\frac{2 \cdot G \cdot (t/c)^3 \cdot (\text{AR} + 2)}{1.337 \cdot \text{AR}^3 \cdot P_{\text{ambient}} \cdot (\lambda + 1)}}$$

**Parameters:**
- $V_f$: Critical flutter velocity ($\text{m/s}$). (Flight speed must remain below $V_f$ with a safety factor $\ge 1.25$).
- $a$: Local speed of sound at flight altitude ($\text{m/s}$).
- $G$: Material shear modulus ($\text{Pa}$):
  - Aluminum 6061-T6: $G = 26 \times 10^9 \text{ Pa}$
  - G10 Fiberglass: $G \approx 4.1 \times 10^9 \text{ Pa}$
  - Carbon Fiber (Quasi-isotropic): $G \approx 18 \times 10^9 \text{ Pa}$
  - Aircraft Plywood: $G \approx 0.6 \times 10^9 \text{ Pa}$
  - Balsa: $G \approx 0.15 \times 10^9 \text{ Pa}$
- $\text{AR}$: Fin aspect ratio:
  $$\text{AR} = \frac{s^2}{A_{fin}} = \frac{2s}{c_r + c_t}$$
- $P_{\text{ambient}}$: Static atmospheric pressure at flight altitude ($101325 \text{ Pa}$ at sea level).
  $$\lambda = \frac{c_t}{c_r}$$
- $t/c$: Thickness-to-chord ratio ($t / c_r$).
- $P/P_0$: Static atmospheric pressure ratio at altitude ($P / 101325 \text{ Pa}$).

### 3.3 RockSim File Format (`.rkt`)
RockSim versions 5+ use a direct XML schema (unlike `.ork`, which is zipped):
```xml
<RockSimDocument>
  <FileVersion>4</FileVersion>
  <DesignInformation>
    <RocketDesign>
      <Name>Level 3 High Power</Name>
      <Stage3Parts>
        <NoseCone>
          <ShapeCode>1</ShapeCode> <!-- 1=Ogive, 2=Conical, 3=Parabolic -->
          <Len>650.0</Len>
          <AftDia>152.4</AftDia>
        </NoseCone>
        <BodyTube>
          <Len>1200.0</Len>
          <OD>152.4</OD>
          <ID>146.0</ID>
          <FinSet>
            <FinCount>4</FinCount>
            <RootChord>300.0</RootChord>
            <TipChord>100.0</TipChord>
            <SemiSpan>150.0</SemiSpan>
            <SweepDistance>150.0</SweepDistance>
          </FinSet>
        </BodyTube>
      </Stage3Parts>
    </RocketDesign>
  </DesignInformation>
</RockSimDocument>
```

---

## 4. RocketPy: 6-DOF Numerical Trajectory Engine Deconstruction

RocketPy represents the academic and competition standard for flight trajectory simulation.

### 4.1 6-DOF Quaternion Equations of Motion
Rather than integrating simple 1D vertical altitude ($y(t)$), RocketPy solves full 6-degree-of-freedom rigid body kinematics using **unit quaternions** $\mathbf{q} = [q_0, q_1, q_2, q_3]^T$ to eliminate gimbal lock:

$$\begin{bmatrix} \dot{\mathbf{r}} \\ \dot{\mathbf{v}} \\ \dot{\mathbf{q}} \\ \dot{\boldsymbol{\omega}} \end{bmatrix} = \begin{bmatrix} \mathbf{v} \\ \frac{1}{m(t)} \left( \mathbf{F}_{aero} + \mathbf{F}_{thrust} + m(t)\mathbf{g} \right) - \boldsymbol{\omega} \times \mathbf{v} \\ \frac{1}{2} \boldsymbol{\Omega}(\boldsymbol{\omega}) \mathbf{q} \\ \mathbf{I}(t)^{-1} \left( \mathbf{M}_{aero} + \mathbf{M}_{thrust} - \boldsymbol{\omega} \times (\mathbf{I}(t) \boldsymbol{\omega}) - \dot{\mathbf{I}}(t) \boldsymbol{\omega} \right) \end{bmatrix}$$

### 4.2 Time-Varying Mass and Inertia Tensor Matrix
During propellant combustion, the rocket loses between 30% and 70% of its total liftoff mass in 2 to 10 seconds.
RocketPy updates the moment of inertia tensor at every integration step:
$$\mathbf{I}(t) = \begin{bmatrix} I_{xx}(t) & 0 & 0 \\ 0 & I_{yy}(t) & 0 \\ 0 & 0 & I_{zz}(t) \end{bmatrix}$$
Where solid propellant grains regress radially outward, decreasing $I_{yy}$ and shifting $x_{cg}$ forward as the motor empties.

### 4.3 Monte Carlo Wind Dispersion Engine
RocketPy's greatest strength over OpenRocket is statistical wind dispersion analysis. It draws parameters from normal distributions:
- Launch rail azimuth: $\theta \sim \mathcal{N}(\theta_0, 2^\circ)$
- Launch rail elevation: $\phi \sim \mathcal{N}(\phi_0, 1^\circ)$
- Motor total impulse: $I_t \sim \mathcal{N}(I_{t0}, 0.02 I_{t0})$
- Aerodynamic drag coefficient: $C_D \sim \mathcal{N}(C_{D0}, 0.08 C_{D0})$
- Wind shear profiles from real-world GFS weather forecasts (altitude vs wind vector).

Running $N = 1000$ trajectory passes yields a 95% confidence landing ellipse on satellite maps, satisfying NASA Student Launch and Spaceport America Cup safety requirements.

---

## 5. Architectural Recommendations for Project Astraea

Based on this survey of RockSim, OpenRocket, RocketPy and openMotor, Astraea should adopt a modern **hybrid architecture** that combines their strengths:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ASTRAEA HYBRID ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 1: Client-Side TypeScript (Sub-millisecond 60 FPS Viewport & CAD)    │
│  - 3D Three.js Parametric CAD Canvas (with in-place Buffer updates)        │
│  - Rogers Modified Barrowman Solver (K_fb + K_bf interference factors)      │
│  - NACA TN 4197 Fin Flutter Boundary Speed Calculator                       │
│  - Bidirectional OpenRocket (.ork) and RockSim (.rkt) XML Parsers           │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 2: Headless Python Sidecar (RocketPy Interop)                        │
│  - RocketPy 6-DOF Trajectory & Weather Ensemble Dispersions                 │
│  - openMotor Grain Geometry & Chamber Pressure Pc(t) Simulation             │
├─────────────────────────────────────────────────────────────────────────────┤
│  LAYER 3: Evidence-Backed Closed-Loop Ledger                                │
│  - AltOS / FlightSketch / Open MCT Altimetry Ingestion (CSV / Binary)       │
│  - Synchronized Predicted vs. Actual Flight Telemetry Overlays              │
│  - Calibrated CD Parameter Identification Engine                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Innovations to Implement in Astraea:
1. **Immediate (Phase 1.5):**
   - **Rogers Modified Barrowman Factor ($K_{bf}$):** Upgrade Astraea's stability engine from basic Barrowman to Rogers Modified Barrowman, providing more accurate subsonic CP values for high-power vehicles.
   - **NACA TN 4197 Fin Flutter Calculator:** Add the flutter velocity formula directly to the fin property inspector so teams immediately know their max safe speed.
   - **RockSim (`.rkt`) Importer:** Expand our parser suite to open both OpenRocket (`.ork`) and RockSim (`.rkt`) files.
2. **Phase 2 (Python Solver Sidecar):**
   - Connect the RocketPy headless engine for 6-DOF trajectories, incorporating atmospheric weather forecasts.
3. **Phase 3 & 4 (Recovery & Validation):**
   - Dual-compartment packing visualizer and black powder charge sizing.
   - Drag-and-drop flight log overlays (AltOS/FlightSketch) for model calibration.
