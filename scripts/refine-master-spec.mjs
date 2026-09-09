import fs from 'fs';

let spec = fs.readFileSync('docs/astraea-master-product-spec.md', 'utf-8');

// 1. Replace Section 9 with rigorous multi-body, sliding rail, Pflanz shock, and roll lock-in
const newSection9 = `## 9. Technical Contract 4: Advanced Multi-Body Separation, Sliding Rail Tip-Off & Roll Resonance

### 9.1 Multi-Stage Staging Separation Dynamics (\`FD-SEP-001\`)
At stage separation timestamp $t_{\\text{stage}}$, the vehicle is decomposed into independent dynamic bodies (sustainer $i=1$, booster $i=2$).

1. **Kinematic Position & Velocity Initialization:**
   Accounting for child center-of-mass offset $\\boldsymbol{\\rho}_i^B$ and pre-separation parent angular velocity $\\boldsymbol{\\omega}_P^{B,-}$:
   $$\\mathbf{r}_i^N(t_{\\text{stage}}) = \\mathbf{r}_P^N + \\mathbf{R}_{NB} \\boldsymbol{\\rho}_i^B$$
   $$\\mathbf{v}_i^{N,+}(t_{\\text{stage}}) = \\mathbf{v}_P^{N,-} + \\mathbf{R}_{NB} (\\boldsymbol{\\omega}_P^{B,-} \\times \\boldsymbol{\\rho}_i^B) + \\frac{\\mathbf{J}_i^N}{m_i}$$
   $$\\boldsymbol{\\omega}_i^{B,+}(t_{\\text{stage}}) = \\boldsymbol{\\omega}_P^{B,-} + \\mathbf{I}_i^{-1} \\left( \\mathbf{r}_{\\text{offset}, i}^B \\times \\mathbf{J}_i^B \\right)$$
   Where $\\mathbf{J}_i^B$ is the separation impulse applied along separation unit normal $\\hat{\\mathbf{n}}_B$ with $\\mathbf{J}_1^B = -\\mathbf{J}_2^B = J_{\\text{sep}} \\hat{\\mathbf{n}}_B$.

2. **Rigorous Conservation Invariants:**
   In the absence of external impulses, total linear and angular momentum about an arbitrary inertial origin $\\mathbf{r}_0$ are conserved:
   $$\\frac{\\| \\Delta \\mathbf{P}_{\\text{total}} \\|}{\\| \\mathbf{P}_{\\text{initial}} \\|} \\le 10^{-6}, \\quad \\frac{\\| \\Delta \\mathbf{H}_0 \\|}{\\| \\mathbf{H}_{0, \\text{initial}} \\|} \\le 10^{-6}$$
   Where $\\mathbf{H}_0(t) = \\sum_{i=1}^2 \\left[ \\mathbf{R}_{NB} \\mathbf{I}_i \\boldsymbol{\\omega}_i^B + m_i (\\mathbf{r}_i^N - \\mathbf{r}_0) \\times \\mathbf{v}_i^N \\right]$.

3. **Continuous Geometric Collision & Recontact Detection:**
   Evaluates true boundary-surface clearance accounting for booster residual motor thrust tail-off ($F_{\\text{tail-off}}(t)$) and differential aerodynamic drag:
   $$d_{\\text{clearance}}(t) = (\\mathbf{r}_{1, \\text{aft}}^N(t) - \\mathbf{r}_{2, \\text{fore}}^N(t)) \\cdot \\hat{\\mathbf{n}}_N > 0 \\quad \\forall t \\in [t_{\\text{stage}}, t_{\\text{stage}} + t_{\\text{clearance}}]$$
   Where monitoring window $t_{\\text{clearance}}$ persists until relative separation exceeds $5 \\times D_{\\text{airframe}}$. If $d_{\\text{clearance}}(t) \\le 0$, Astraea emits a **Recontact / Stage Collision Hazard Flag**.

### 9.2 Launch Rail Sliding Multi-Point Tip-Off Dynamics (\`FD-TIP-001\`)
Launch rail departure is modeled as a sliding kinematic constraint using forward button ($x_{\\text{fwd}}$) and aft button ($x_{\\text{aft}}$):
1. **Phase 1 (Dual-Button Sliding Guide):** Both buttons engaged in rail channel ($s < L_{\\text{rail}} - (x_{\\text{aft}} - x_{\\text{fwd}})$). Motion is constrained to 1-DOF along rail vector $\\hat{\\mathbf{u}}_{\\text{rail}}$ with Coulomb sliding friction coefficient $\\mu_r \\approx 0.05$:
   $$\\ddot{s}_{\\text{rail}} = \\frac{\\mathbf{F}_{\\text{net}} \\cdot \\hat{\\mathbf{u}}_{\\text{rail}} - \\mu_r \\| \\mathbf{F}_{\\text{normal}} \\|}{m(t)}, \\quad \\boldsymbol{\\omega}_B = \\mathbf{0}$$
2. **Phase 2 (Sliding Fulcrum Tip-Off):** Forward button clears rail at $s = L_{\\text{rail}} - \\Delta x_{\\text{buttons}}$. The aft button remains in the channel, acting as an accelerating sliding fulcrum! Crosswinds induce an unbalanced transverse pitching torque:
   $$M_{\\text{tip-off}} = F_{N, \\text{crosswind}} \\cdot (x_{\\text{aft}} - x_{cp}) - m(t) g \\cos(\\theta_{\\text{rail}}) \\cdot (x_{\\text{aft}} - x_{cg}) - m(t) \\ddot{s}_{\\text{rail}} \\cdot (y_{\\text{button}} - y_{cg})$$
   $$\\ddot{\\theta}_{\\text{tip-off}} = \\frac{M_{\\text{tip-off}}}{I_{\\text{pitch}}(t) + m(t) (x_{\\text{aft}} - x_{cg})^2}$$
   Induces an exit pitch rate $\\dot{\\theta}_{\\text{exit}}$ that biases the initial trajectory before free-flight stabilization.
3. **Phase 3 (Free 6-DOF Flight):** Aft button clears rail at $s = L_{\\text{rail}}$. Full 6-DOF equations of motion take over.

### 9.3 Roll-Pitch Resonance Screening (\`FD-RES-001\`)
Fin cant angle $\\delta_{\\text{cant}}$ induces roll spin rate $p(t)$. Vehicle transverse pitch natural frequency varies with dynamic pressure:
$$\\omega_n(t) = \\sqrt{\\frac{C_{N\\alpha}(t) \\cdot \\bar{q}(t) \\cdot S_{\\text{ref}} \\cdot (x_{cp}(t) - x_{cg}(t))}{I_{\\text{pitch}}(t)}}$$

When roll rate crosses pitch natural frequency ($|p(t)| \\approx \\omega_n(t)$), aerodynamic cross-coupling can trigger **Roll-Pitch Lock-In Resonance**, amplifying angle of attack.
Astraea calculates the dimensionless **Resonance Avoidance Margin (RAM)** as an empirical screening metric:
$$\\text{RAM}(t) = \\frac{\\left| |p(t)| - \\omega_n(t) \\right|}{\\max(0.1, \\omega_n(t))}$$
Screening rule: Flags an advisory warning if $\\text{RAM}(t) < 0.20$ while dynamic pressure $\\bar{q} > 2,000\\text{ Pa}$.

### 9.4 Parachute Inflation Dynamics & Opening Shock Loads (\`FD-SHK-001\`)
Reference: T. W. Knacke, *Parachute Recovery Systems Design Manual* (NWC TP 6575, 1991), Section 5.3; and E. Pflanz (1942).
1. **Canopy Inflation Time ($t_f$):**
   $$t_f = \\frac{n_c \\cdot D_0}{V_0} \\quad (n_c = 8.0 \\text{ for conical ribbon, } 12.0 \\text{ for flat circular/annular})$$
2. **Pflanz Ballistic Coefficient ($A$):**
   $$A = \\frac{2 \\cdot m_{\\text{suspended}}}{\\rho \\cdot S_0 \\cdot C_D \\cdot V_0 \\cdot t_f}$$
3. **Pflanz Opening Shock Factor ($C_x$):**
   $$C_x = 1.0 + \\frac{1.45}{A + 0.35}$$
4. **Peak Opening Shock Force ($F_{\\text{shock}}$):**
   $$F_{\\text{shock}} = C_x \\cdot \\left(\\frac{1}{2} \\rho V_0^2\\right) \\cdot S_0 \\cdot C_D$$
   Evaluates structural margin of safety against rated harness proof load $F_{\\text{proof}}$:
   $$\\text{MS}_{\\text{harness}} = \\frac{F_{\\text{proof}}}{SF \\cdot F_{\\text{shock}}} - 1 \\quad (SF = 1.50 \\text{ required for flight safety})$$`;

// 2. Replace Section 10 with rigorous Datums & Sensor models
const newSection10 = `## 10. Technical Contract 5: Avionics, Sensor Physics & Hardware Protocols

### 10.1 Geodetic Coordinate & Altitude Datums (\`AV-DAT-001\`)
Astraea strictly distinguishes four altitude datums to prevent landing and deployment errors:
1. **WGS84 Ellipsoidal Height ($h_{\\text{ellips}}$):** Geometric height above the WGS84 reference ellipsoid (GPS raw output).
2. **Mean Sea Level Orthometric Height ($H_{\\text{MSL}}$):** Height above the geoid computed via the EGM96 gravitational model:
   $$H_{\\text{MSL}}(\\phi, \\lambda) = h_{\\text{ellips}} - N_{\\text{EGM96}}(\\phi, \\lambda)$$
3. **Above Pad Height ($h_{\\text{above\\_pad}}$):** Vertical displacement relative to the launch rail base:
   $$h_{\\text{above\\_pad}} = H_{\\text{MSL}} - H_{\\text{MSL, pad}}$$
4. **Terrain-Relative Altitude ($h_{\\text{AGL}}$):** True vertical clearance above local topography:
   $$h_{\\text{AGL}}(\\mathbf{r}_N) = H_{\\text{MSL}} - H_{\\text{terrain}}(\\phi, \\lambda)$$
   Main parachute deployment and ground touchdown are evaluated strictly against $h_{\\text{AGL}}$.

### 10.2 Sensor Specific Force Physics & Port Aerodynamics (\`AV-SEN-001\`)
1. **Specific Force Formulation:**
   Accelerometers measure specific force $\\mathbf{f}_B$ in the body frame, not pure kinematic acceleration:
   $$\\mathbf{f}_B = \\mathbf{R}_{NB}^T (\\mathbf{a}_N - \\mathbf{g}_N) + \\boldsymbol{\\omega}_B \\times (\\boldsymbol{\\omega}_B \\times \\mathbf{r}_{\\text{IMU}}^B) + \\dot{\\boldsymbol{\\omega}}_B \\times \\mathbf{r}_{\\text{IMU}}^B$$
   Where $\\mathbf{r}_{\\text{IMU}}^B$ is the lever-arm offset vector from the instantaneous vehicle Center of Mass $\\mathbf{r}_{CG}^B(t)$.
2. **Static Pressure Port Depression & Mach-Dip Lockout:**
   Barometric ports on the fuselage experience pressure depression in transonic flight:
   $$P_{\\text{port}} = P_{\\text{ambient}} + C_{p, \\text{port}} \\cdot \\left(\\frac{1}{2} \\rho V^2\\right)$$
   Where $C_{p, \\text{port}} \\approx -0.15$ to $-0.25$ between Mach 0.85 and 1.15. Astraea models the altimeter Mach-inhibit timer ($t_{\\text{lockout}} \\ge t_{\\text{burn}} + 1.0\\text{s}$) to prevent premature apogee ejection charges.

### 10.3 Supported Altimeter Protocol Decoders (\`AV-DEV-001\`)
Native binary and CSV decoders with schema validation:
- **AltOS:** TeleMetrum, EasyMini, TeleMega (\`.eeprom\` binary byte stream & CSV exports, parsing 16-bit ADC pressure and dual accelerometer channels).
- **FlightSketch:** FlightSketch Mini, FlightSketch Comp (BLE stream & CSV time-series).
- **Featherweight:** Raven 3/4, Blue Raven (multi-channel 100g accel, 16g accel, and baro CSV).
- **PerfectFlite:** StratoLogger CF, FireFly (direct EEPROM text dumps).`;

// 3. Replace Section 11 with transient thermal soak & formal state machine
const newSection11 = `## 11. Technical Contract 6: Recovery Pyrotechnics & Temperature-Derated Shear Hardware

### 11.1 Transient Thermal Soak for Shear Pins (\`PY-SHR-001\`)
While the external fuselage surface reaches the aerodynamic adiabatic wall recovery temperature:
$$T_{\\text{wall}} = T_{\\text{ambient}} \\cdot \\left( 1 + 0.89 \\cdot \\frac{\\gamma - 1}{2} M^2 \\right)$$

Internal shear pins sheltered inside the airframe joint experience transient thermal conduction governed by lumped capacitance:
$$\\frac{dT_{\\text{pin}}}{dt} = \\frac{h_{\\text{cond}} A_{\\text{contact}}}{m_{\\text{pin}} c_p} (T_{\\text{airframe}} - T_{\\text{pin}})$$

Nylon 6/6 shear strength is derated according to the computed internal pin temperature $T_{\\text{pin}}(t)$:
$$F_{\\text{shear}}(T) = F_{\\text{nominal}} \\cdot \\max\\left(0.40, 1.0 - 0.0042 \\cdot (T_{\\text{pin}} - 20^\\circ\\text{C})\\right)$$
- **2-56 Nylon Shear Pin:** $F_{\\text{nominal}} = 155\\text{ N}$ ($35\\text{ lbf}$) at $20^\\circ\\text{C}$.
- **4-40 Nylon Shear Pin:** $F_{\\text{nominal}} = 310\\text{ N}$ ($70\\text{ lbf}$) at $20^\\circ\\text{C}$.

### 11.2 Dual-Altimeter Redundancy State Machine (\`PY-RED-001\`)
Dual-deployment pyrotechnic sequencing is formalized as an explicit Mealy state machine:
- **States:** \`IDLE\`, \`ARMED\`, \`BOOST_DETECTED\`, \`COASTING\`, \`APOGEE_PRIMARY_FIRED\`, \`APOGEE_BACKUP_FIRED\`, \`MAIN_PRIMARY_FIRED\`, \`MAIN_BACKUP_FIRED\`, \`TOUCHDOWN\`, \`FAULT_LOCKED\`.
- **Primary Apogee Trigger:** True vertical velocity zero-crossing ($v_{N,z} \\le 0\\text{ m/s}$ and $t > t_{\\text{burnout}}$).
- **Backup Apogee Trigger:** $t_{\\text{backup}} = t_{\\text{primary}} + 1.5\\text{s}$ OR barometric pressure confirms altitude drop $\\ge 50\\text{m}$ below apogee.
- **Primary Main Chute Trigger:** $h_{\\text{AGL}} \\le h_{\\text{main}}$ (default $250\\text{m}$).
- **Backup Main Chute Trigger:** $h_{\\text{AGL}} \\le h_{\\text{main}} - 50\\text{m}$ (default $200\\text{m}$).
- **Ejection Sizing Formula:**
  $$P_{\\text{target}} = \\frac{N_{\\text{pins}} \\cdot F_{\\text{shear}}(T) \\cdot SF + F_{\\text{friction}}}{A_{\\text{bulkhead}}}, \\quad m_{\\text{BP}} = \\frac{P_{\\text{target}} \\cdot V_{\\text{bay}}}{R_{\\text{gas}} \\cdot T_{\\text{flame}}}$$
  Where $R_{\\text{gas}} = 280\\text{ J/(kg}\\cdot\\text{K)}$ and $T_{\\text{flame}} = 1750\\text{ K}$, with safety factor $SF \\in [1.75, 2.25]$.`;

// 4. Replace Section 12 with Sourced Handbook Clauses and Explicit Status Outcomes
const newSection12 = `## 12. Technical Contract 7: Competition Verification Engines & Git Semantic Diffs

### 12.1 Sourced Collegiate Competition Verification Engines (\`CP-PRF-001\`)
Astraea binds verification directly to published competition handbook clauses. Every rule check evaluates to one of four strict states: \`PASS\`, \`FAIL\`, \`UNKNOWN\` (insufficient data), or \`NOT_APPLICABLE\`.

1. **NASA Student Launch Rule Engine (2026 Handbook Binding):**
   - **Clause §4.3.2 (Rail Exit Velocity):** Minimum $80.0\\text{ ft/s}$ ($24.384\\text{ m/s}$) launch rail departure speed.
   - **Clause §4.3.4 (Landing Kinetic Energy Limit):** Touchdown kinetic energy $\\le 75.0\\text{ ft}\\cdot\\text{lbf}$ ($101.69\\text{ J}$) for every separated section.
   - **Clause §4.3.5 (Parachute Descent Drift):** All components must land within a $2,500\\text{ ft}$ ($762\\text{ m}$) radius of the launch pad under nominal wind.
   - **Clause §4.4.1 (Dual-Deployment Redundancy):** Two completely independent altimeters with dedicated batteries and separate ejection charges.

2. **Spaceport America Cup / ESRA Rule Engine (2026 DBT Rules Binding):**
   - **Clause §3.2.1 (Static Stability Margin):** Static margin $\\ge 1.50$ calibers and $\\le 2.50$ calibers at launch rail clearance.
   - **Clause §3.2.3 (Launch Rail Clearance Velocity):** Minimum $100.0\\text{ ft/s}$ ($30.48\\text{ m/s}$) for high-power entries.
   - **Clause §3.4.3 (Landing Containment Ellipse):** 95% containment ellipse ($k = 2.45\\sigma$) must fall entirely within the designated range boundary.
   - **Clause §3.5.2 (Recovery Harness Safety Factor):** Minimum structural safety factor $\\ge 2.0$ against peak opening shock force ($F_{\\text{shock}}$).

3. **EuRoC (European Rocketry Challenge) Profile (2026 Regulations Binding):**
   - **Clause §5.1 (Descent Velocity Limits):** Drogue descent rate between $20 - 35\\text{ m/s}$; main descent rate $\\le 9.0\\text{ m/s}$.
   - **Clause §5.4 (Altimeter Inhibit):** Transonic Mach-dip lockout verified.

### 12.2 Git-Backed Semantic Engineering Diffs (\`CP-DIF-001\`)
Generates human-readable engineering diffs across git revisions showing physical state changes:
\`\`\`text
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
    ├── Rail Exit Velocity: 23.8 m/s -> 25.1 m/s [PASS: >= 24.384 m/s per NASA SL §4.3.2]
    └── Fin Flutter Speed: 348 m/s -> 382 m/s (+9.8% structural safety boost)
\`\`\``;

// Cut old sections 9-12 and paste new
const s9Idx = spec.indexOf('## 9. Technical Contract 4');
if (s9Idx !== -1) {
  spec = spec.substring(0, s9Idx);
}

spec = spec.trim() + '\n\n' + newSection9 + '\n\n---\n\n' + newSection10 + '\n\n---\n\n' + newSection11 + '\n\n---\n\n' + newSection12 + '\n';

fs.writeFileSync('docs/astraea-master-product-spec.md', spec, 'utf-8');
console.log('Successfully updated docs/astraea-master-product-spec.md with refined engineering contracts!');
