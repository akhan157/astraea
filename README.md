# Astraea

> **Unified Open-Source Rocket Engineering Environment**  
> Go from mission concept and 3D parametric CAD to multi-solver 6-DOF flight dynamics, internal ballistics, and flight telemetry validation.

---

## Overview

**Current status and next steps:** See [docs/project-status.md](docs/project-status.md) for the verified build/test state, outstanding UI integrations, desktop acceptance work, and empirical flight-validation boundary. Astraea is a restricted-preview engineering tool, not certified flight-readiness software.

Collegiate competition teams (NASA Student Launch, Spaceport America Cup, EuRoC), research laboratories, and high-power rocketry (HPR) engineers currently manage vehicles across a brittle, disconnected ecosystem of legacy tools:

* **Geometry & CAD:** SolidWorks, Onshape, FreeCAD
* **Subsonic Aerodynamics & Stability:** OpenRocket, RockSim
* **Supersonic Aerodynamics:** RASAero II
* **6-DOF Trajectory & Dispersion:** RocketPy
* **Propulsion & Internal Ballistics:** NASA CEA, openMotor, ThrustCurve
* **Avionics & Telemetry Logs:** AltOS, FlightSketch, Open MCT

**Astraea** unifies these disciplines into a single visual engineering workstation backed by a high-performance native compute core. It provides a single source of truth across airframe modeling, structural analysis, multi-physics simulation, and empirical hardware validation.

---

## Architecture & Capabilities

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ASTRAEA WORKSTATION (UI)                            │
│       React 19 + Three.js Viewport + Linear-Dense Workstation Shell        │
├─────────────────┬─────────────────────────────┬─────────────────────────────┤
│  Airframe CAD   │   Propulsion & Chemistry    │   Trajectory & Evidence     │
│  - 3D assembly  │   - BATES & star regression │   - 6-DOF quaternion ODE    │
│  - Live CP / CG │   - NASA CEA Gibbs solver   │   - Monte Carlo dispersion  │
│  - Aero models  │   - Nozzle performance      │   - Telemetry log overlay   │
├─────────────────┴─────────────────────────────┴─────────────────────────────┤
│                      TAURI IPC & COMPUTE BOUNDARY                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                     ASTRAEA-CORE (NATIVE RUST ENGINE)                       │
│  - 6-DOF adaptive DP5(4) integrator        - NASA CEA Gibbs free-energy     │
│  - Multi-threaded Monte Carlo (Rayon)     - Transonic & wave drag tables   │
│  - Classical & Rogers Barrowman CP         - Component mass rollups         │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 1. Interactive 3D Parametric CAD
* **Procedural Assembly Canvas:** Compose airframes with live WebGL rendering: conical, ogive, parabolic, von Kármán, and elliptical nosecones; hollow body tubes; conical transitions; and extruded trapezoidal or elliptical fin sets.
* **Real-Time Stability Tracking:** Sub-millisecond Center of Pressure (CP) and Center of Gravity (CG) tracking updated via in-place `BufferGeometry` updates during slider manipulation.
* **Multi-View Rendering:** Toggle between solid shaded, wireframe, and X-ray interior inspection modes with customizable coordinate axes, ground shadows, and dimension callouts.

### 2. Aerodynamics & Aeroelasticity
* **Subsonic Stability:** Classical Barrowman centroid formulas coupled with Rogers modified Barrowman methods for body-fin mutual lift interference ($K_{bf}$ factor).
* **Transonic & High-Mach Aerodynamics:** Van Driest II compressible turbulent skin friction, Ackeret supersonic fin wave drag, nosecone wave drag, and motor plume base-drag reduction factors.
* **Flow Detachment & Protuberances:** Automated boattail separation angle monitors ($\theta > 10^\circ$ detachment advisory) and Hoerner-based boundary-layer immersed protuberance drag for launch lugs and rail buttons.
* **Aeroelastic Fin Flutter:** Critical flutter velocity ($V_f$) and safe velocity thresholds computed using NACA TN 4197 formulation with built-in material shear moduli.

### 3. Propulsion & Thermochemistry
* **Certified Motor Library:** Pre-loaded solid motor database (Estes, AeroTech, Cesaroni) with instant RASP thrust interpolation, dry mass rollups, and propellant depletion curves $m(t)$.
* **Custom Motor Ingestion:** Direct parsing and export for RASP `.eng` and RockSim `.rse` motor definition files.
* **Propellant Grain Regression:** Analytical internal ballistics engine for BATES and star core propellant grains with real-time chamber pressure $P_c(t)$ and burn area curves.
* **NASA CEA Gibbs Equilibrium Solver:** Constrained chemical equilibrium solver utilizing the element-potential (Lagrange multiplier / Newton) method from NASA RP-1311. Validated against published NASA CEA benchmarks across APCP formulations.
* **Frozen Isentropic Nozzle Sizing:** Expansion ratios, characteristic velocity ($c^*$), thrust coefficients ($C_f$), and sea-level/vacuum specific impulse ($I_{sp}$).

### 4. 6-DOF Flight Dynamics & Atmospheric Dispersion
* **Rigorous Kinematics:** Full 6-DOF quaternion rigid-body equations of motion integrated with an adaptive Dormand-Prince DP5(4) ODE solver with dense root-finding for flight event boundaries.
* **Atmospheric Modeling:** Integrated 1976 US Standard Atmosphere (ISA) with support for live atmospheric sounding ingestion via Open-Meteo REST API, manual wind shear profile tables, and wind-profile CSV import into the manual table.
* **Monte Carlo Dispersion:** Statistical parameter perturbation sweeps (wind azimuth, launch rail elevation, motor impulse variations) outputting 1σ and 2σ landing dispersion ellipses. Ensembles run in absolute chunks (50 runs per call, up to 1000 runs) with live progress and a cancel that records no partial result.

### 5. Recovery Subsystem
* **Dual-Deployment Sequencing:** Staged apogee drogue deployment with barometric main parachute deployment altitude triggers.
* **Physical Bay Packaging:** 2D axial cross-section packing visualizer (`deriveBays`) with volume clearance checks and packed parachute density ($g/\text{cm}^3$) jam advisories.
* **Ejection Charge Sizing:** Automated black powder charge mass sizing ($m_{\text{BP}}$) based on shear pin ratings (2-56 / 4-40 nylon) and ideal gas expansion pressure requirements.

### 6. Closed-Loop Flight Validation Ledger
* **Telemetry Log Ingestion:** Drag-and-drop parsing of flight logs from AltOS (CSV), FlightSketch, and GPS tracking files (GPX), with a provenance block recording the source name, a SHA-256 of the exact text, parsed row and skipped-line counts, a dialect hint, and the parser's stated unit assumptions.
* **Sim vs. Flight Telemetry Overlay:** Time-synchronized multi-axis comparison of predicted vs. recorded altitude, velocity, and event markers.
* **Effective $C_d$ Calibration Optimizer:** Solves the inverse flight dynamics problem against unpowered coasting data to extract the physical airframe drag coefficient and feed calibrated parameters back into future predictions.
* **Landing Back-Cast Analysis:** Projects measured GPS landing coordinates onto simulation dispersion ellipses to assess trajectory compliance.

---

## File Interoperability

Formats are supported on a per-direction and per-feature basis. Some modules are tested without a UI consumer, and some exports intentionally refuse when required data are absent. See the [adapter matrix](docs/adapter-matrix.md) and [current project status](docs/project-status.md) for boundaries.

| Format | Direction | Scope / Capabilities |
| :--- | :--- | :--- |
| **OpenRocket (`.ork`)** | Import & Export | Supported component subset; staged/clustered fidelity and loss disclosure are not fully pinned. |
| **RockSim (`.rkt`)** | Import & Export | Supported XML subset with fail-closed omission preview; unsupported geometries are refused. |
| **RASAero II (`.cdx1`)** | Export | Outer mold line (OML) dimensional stations. |
| **Aerodynamic Matrix (`.csv`)** | Export | Mach 0 to 4 sweep: $C_D$ (power-on/power-off), $C_{N\alpha}$, and Center of Pressure. |
| **CAD Solid Models (`.step`)** | Export | AP203 manifold solid B-Rep export of outer mold line geometry. |
| **Additive Manufacturing (`.stl`)** | Export | High-resolution binary STL surface tessellations for 3D printing. |
| **Motor Curves (`.eng` / `.rse`)** | Import & Export | Import plus `.eng`/`.rse` export triggers with omission previews (dropped nameplate metrics, recomputed-on-import notes, and the exact re-import designation). |
| **Engineering Blueprints** | Export | Dimensioned technical drawing vector SVG and print-ready raster PNG. |
| **Google Earth (`.kml`)** | Export | Trigger refuses until a committed run has published its telemetry payload. |
| **Project Envelopes (`.json`)** | Import & Export | Versioned `.astraea.json` envelope via the fail-closed reader/builder; legacy bare-vehicle files migrate on read. Header Save/Open also keep a revisioned slot in browser storage (stale commits refused, corrupt bytes never overwritten). Case/snapshot/evidence payloads are not yet populated. |

---

## Getting Started

### Prerequisites
* **Node.js:** v20+ (Node v22+ or v24 recommended)
* **Package Manager:** `pnpm` (recommended) or `npm`
* **Rust Toolchain:** Stable `rustc` and `cargo` 1.80+ (required for desktop Tauri builds and core tests)

### Installation

Clone the repository and install frontend dependencies:

```bash
git clone https://github.com/akhan157/astraea.git
cd astraea
pnpm install
```

### Running the Development Environment

#### 1. Web Preview (Vite)
Runs the interactive workstation in your web browser:

```bash
pnpm dev
```

Navigate to `http://localhost:5173` to explore the workstation studios.

The browser preview has no Tauri IPC. Native compute operations fail closed there rather than silently falling back to the TypeScript test engines. Use the Tauri desktop application for simulations and other native compute workflows.

#### 2. Native Desktop Application (Tauri + Rust Core)
The native desktop application is powered by the compiled Rust backend. On Windows, use a **Visual Studio 2022 x64 Developer Command Prompt** so Rust finds the MSVC linker. The configured Tauri development URL is `http://localhost:1420`. In one terminal start Vite, and in another launch the native shell:

```bash
pnpm dev --port 1420
# in a second x64 Developer Command Prompt
cargo run --manifest-path src-tauri/Cargo.toml
```

To verify compilation without launching the app:

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

---

## Verification & Benchmark Rigor

Astraea is engineered under strict verification and validation standards:

```bash
# Run the frontend test suite (62 test files, 791 unit & integration tests)
pnpm test

# Run the native Rust core parity test suite (72 unit tests across 5 compute engines)
cargo test -p astraea-core --manifest-path crates/astraea-core/Cargo.toml --lib

# Generate the machine-readable Gate-5 benchmark certification artifact
node scripts/emit-benchmark-metadata.cjs
```

* **Test Coverage:** 62 test files spanning 791 automated test cases in Vitest.
* **Rust Engine Parity:** 72 cargo test vectors pinning bit-identical RNG streams (`mulberry32`), exact Barrowman stability centroids, and NASA CEA equilibrium tables within 0.5% relative error.
* **Type Safety:** 100% strict TypeScript compilation (`tsc --noEmit` clean).
* **Acceptance boundary:** These checks do not establish a packaged desktop release or empirical agreement with flight data. The [Round-19 audit](docs/astra-round19-audit.md) remains conditional for restricted preview.
---

## Project Timeline & Milestones

From architectural inception to a fully integrated, dual-engine rocket engineering workstation:

* **Sep 8, 2026 — Architecture & Phase 1 Foundations**
  * Established the Astraea product strategy, Single Source of Truth (SSOT) data model, and engineering roadmap.
  * Built procedural 3D parametric WebGL rocket airframe canvas in Three.js (nosecones, tubes, transitions, trapezoidal & elliptical fins).
  * Implemented sub-millisecond client-side Barrowman Center of Pressure (CP) and mass Center of Gravity (CG) tracking.
  * Formulated initial NACA TN 4197 fin flutter engine, Rogers modified Barrowman interference ($K_{bf}$), and OpenRocket (`.ork`) / RockSim (`.rkt`) parsers.

* **Sep 9–12, 2026 — Multidisciplinary Solvers & Physics Hardening**
  * Extracted dedicated flight dynamics and loads assembly engine with verified Galilean invariance under wind shear.
  * Authored internal ballistics solver: BATES and star core propellant grain regression with real-time chamber pressure $P_c(t)$ ODEs.
  * Implemented NASA CEA chemical equilibrium solver utilizing Gordon-McBride element-potential minimization.
  * Engineered dual-compartment recovery packing math with packed parachute density jam checks and shear-pin / black powder ejection sizing ($P_{\text{target}}$).
  * Hardened 6-DOF quaternion rigid-body kinematics through 15 automated Verification & Validation (V&V) benchmark suites and adversarial engineering audits.

* **Sep 13–15, 2026 — Telemetry Ingestion, Evidence Ledger & Universal CAD Export**
  * Developed closed-loop validation ledger: drag-and-drop telemetry ingestion for AltOS, FlightSketch, and GPX flight logs.
  * Synchronized multi-plot comparison engine overlaying simulated trajectory curves against recorded sensor telemetry.
  * Built effective $C_D$ inverse dynamics calibration optimizer to resolve physical painted airframe drag from unpowered coasting data.
  * Implemented full export pipeline: RASAero II (`.cdx1`), aerodynamic matrix tables (`.csv`), vector SVG blueprints, and print-ready PNG rasterization.

* **Sep 16–18, 2026 — Workstation Shell & Preflight Range Safety**
  * Assembled five dedicated workstation studios: Airframe, Aerodynamics, Propulsion, Trajectory & Weather, and Evidence & Recovery.
  * Implemented live atmospheric soundings via Open-Meteo REST API and manual wind shear profile tables.
  * Built Monte Carlo landing scatter engine with FAA waiver cylinder checks, multi-vertex waiver polygon containment, and KML 2.2 export for Google Earth.
  * Shipped omission-preview export triggers with fail-closed safety checks for RockSim (`.rkt`), RASP (`.eng`), KML (`.kml`), AP203 STEP (`.step`), and binary STL (`.stl`).

* **Sep 22–23, 2026 — High-Performance Native Rust Core (`astraea-core`)**
  * Ported 5 compute-heavy physics engines to a dedicated, dependency-free Rust crate (`crates/astraea-core`): 6-DOF adaptive DP5(4) integrator, Monte Carlo dispersion, NASA CEA Gibbs equilibrium, Barrowman/transonic aerodynamics, and mass rollups.
  * Validated bit-identical PRNG stream reproduction (`mulberry32`), exact stability centroids, and NASA CEA agreement within 0.5% relative error across 72 cargo unit tests.
  * Regressed Gibbs thermochemistry against a 60-case reference NASA CEA corpus across multiple propellant blends and chamber pressures.

* **Sep 24–26, 2026 — Tauri 2.0 Native Shell & Linear-Dense Redesign**
  * Packaged native standalone desktop workstation via Tauri 2.0 with a coarse-grained, asynchronous Rust IPC bridge.
  * Fully redesigned user interface adopting Direction B (Linear Dense: `#08090A` / `#0F1011` surfaces, single `#4C8DFF` signal accent, 13px sentence-case typography, and zero gradient clutter).
  * Promoted unified Tauri + Rust core + Linear-Dense frontend to `main`, backed by 62 vitest test suites (791 automated tests) and 72 cargo tests.

---

## License

Licensed under the Apache License, Version 2.0 (the "License"). You may obtain a copy of the License in the [LICENSE](LICENSE) file or at:

```text
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
