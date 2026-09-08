# Project Astraea: Unified Open-Source Rocket Engineering Environment
## Product Strategy & Architectural Design Document (gstack Office Hours)

**Status:** APPROVED (Builder Mode Session)  
**Date:** 2026-09-08  
**Domain:** Aerospace Engineering / Open-Source Systems  
**Primary Target:** University Rocket Teams (NASA Student Launch, Spaceport America Cup, EuRoC) & Advanced High-Power Rocketry (HPR)

---

## 1. Executive Summary & Vision

Individual rocketeers and university competition teams currently design vehicles using a brittle, disconnected archipelago of specialist tools:
- **Geometry & Structure:** SolidWorks / Onshape / FreeCAD
- **Subsonic Sizing & Stability:** OpenRocket / RockSim
- **High-Mach Aerodynamics:** RASAero II
- **6-DOF Trajectory & Weather Dispersions:** RocketPy / MATLAB
- **Propulsion & Motor Sizing:** openMotor / NASA CEA / ThrustCurve
- **Ground Testing & Flight Telemetry:** LabVIEW / AltOS / Open MCT

Engineers waste dozens of hours manually transcribing dimensions, weights, and thrust curves across these programs. Furthermore, when geometry changes, simulation results become silently stale, and physical flight/static fire test logs are rarely fed back into simulation models systematically.

**Project Astraea** is an open-source, visual, end-to-end rocketry workstation that unifies design, simulation, and physical validation:
1. **Interactive 3D Assembly Canvas:** Rapidly compose airframes, nosecones, fin sets, internal compartments, couplers, and dual-deployment recovery systems.
2. **Integrated Headless Solver Pipeline:** Automatically drives **RocketPy** (6-DOF flight & Monte Carlo wind dispersion) and **NASA CEA** (propellant chemistry) via a local Python sidecar.
3. **Evidence-Backed Verification Ledger:** Directly ingests static test stand load cell data (CSV, TDMS) and flight altimetry logs (AltOS, FlightSketch, CSV) to compare simulated predictions against physical reality, satisfying collegiate PDR/CDR/FRR competition gates.

---

## 2. Agreed Core Premises

1. **Transcription is the primary friction point:** Manually keeping SolidWorks CAD, OpenRocket files, and flight reports in sync leads to sign errors, mass discrepancy, and out-of-date safety reports.
2. **Modern visual tooling is missing:** OpenRocket is stable but stuck in Java Swing with limited native high-Mach and dispersion capabilities. Teams desire a modern 3D Web/Desktop interface.
3. **A simulation is not validation:** True engineering readiness requires connecting simulated predictions with measured hardware evidence (static fire curves, drop tests, flight altimetry).

---

## 3. Architecture & Technical Strategy

### Approach Selected: Desktop/Web Hybrid IDE with Local Solver Sidecar

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       ASTRAEA VISUAL WORKSPACE (UI)                          │
│        (Tauri / Web + Three.js 3D Viewport + React / Tailwind Design)       │
├─────────────────────────────────────────────────────────────────────────────┤
│  [Vehicle Hierarchy Tree]    [3D Interactive CAD Canvas]   [Simulation Hub]  │
│  - Nosecone (Ogive/Von Karman)- Visual airframe builder     - Launch rail setup│
│  - Recovery Bays (Dual-dep)   - Raycasted part placement    - Wind / Weather │
│  - Solid/Liquid Motor Casing  - Real-time CG / CP markers   - Dispersion map │
├─────────────────────────────────────────────────────────────────────────────┤
│                          CORE PROJECT DATA MODEL (SSOT)                     │
│               Normalized JSON/YAML Vehicle Spec + Evidence Ledger           │
├──────────────────────┬──────────────────────────────┬───────────────────────┤
│    File Adapters     │      Local Python Sidecar    │    Evidence Engine    │
│  - .ork (OpenRocket) │   - RocketPy 6-DOF Trajectory│  - Load cell / TDMS   │
│  - .rkt (RockSim)    │   - NASA CEA Thermochem      │  - AltOS / CSV Logs   │
│  - .cdx1 (RASAero)   │   - openMotor Grain Library  │  - Delta overlays     │
│  - STEP / OBJ Export │   - ThrustCurve REST Client  │  - Fresh/Stale state  │
└──────────────────────┴──────────────────────────────┴───────────────────────┘
```

### Core Components
1. **Front-End Viewport (Tauri + React + Three.js / WebGL):**
   * Real-time 3D parametric rocket assembly.
   * Visual Center of Gravity (CG) and Center of Pressure (CP) indicators updating as mass properties change.
   * Recovery bay visualizer with dual-compartment packing, coupler shoulder inset, and black powder ejection sizing.
2. **Single Source of Truth (SSOT) Project Spec:**
   * Vehicle tree stored in a schema-validated, versioned JSON format.
   * Tracks component provenance, material densities, and explicit mass-inclusion semantics.
3. **Local Python Execution Sidecar:**
   * Communicates over a lightweight local IPC / WebSocket bridge.
   * Direct integration with `rocketpy` for trajectory integration, parachute descent, and Monte Carlo landing ellipses.
   * Direct integration with `cea` for nozzle sizing and motor parameters.
4. **Third-Party File Interoperability:**
   * **OpenRocket (`.ork`):** Bidirectional vehicle snapshot import/export.
   * **RockSim (`.rkt`):** Vehicle import.
   * **RASAero II (`.cdx1`):** Outer-mold-line export and aerodynamic table ingestion.
   * **ThrustCurve API:** Direct motor search and RASP `.eng` curve injection.
5. **Closed-Loop Verification Engine:**
   * Drag-and-drop test data importer (AltOS flight logs, FlightSketch, test stand CSVs).
   * Overlays predicted vs. actual trajectory on synchronized time-series plots.
   * Computes error metrics, effective drag coefficients ($C_d$), and requirements compliance matrices.

---

## 4. Phase-by-Phase Implementation Roadmap

### Phase 1: Interactive 3D Rocket Modeling Shell
- Scaffold Tauri/Vite/Three.js repository.
- Build parametric procedural components: Nosecones (Conical, Ogive, Parabolic), Body Tubes, Transitions, Trapezoidal/Elliptical Fins.
- Implement live Barrowman center of pressure (CP) calculation and assembly center of gravity (CG) calculations in WebAssembly/TypeScript.
- Export/Import OpenRocket `.ork` files to immediately leverage existing community rocket models.

### Phase 2: Headless RocketPy Simulation Integration
- Wire the Python sidecar running RocketPy.
- Pass the normalized vehicle geometry and selected RASP `.eng` motor into RocketPy.
- Visualize 3D flight trajectories, apogee altitude, burnout velocity, and descent rates directly in the workspace.
- Implement Monte Carlo dispersion visualization on a 2D/3D map canvas.

### Phase 3: Recovery Subsystem & Dual-Compartment Architecture
- Port and expand the dual-compartment physical packing engine from RecoverySys.
- Automatic black powder separation charge sizing ($P_{\text{target}}$ using shear pin ratings and ideal gas expansion).
- Parachute descent calculations (main/drogue deployment altitudes and landing kinetic energy checks).

### Phase 4: Closed-Loop Validation & Flight Evidence Ingestion
- Implement altimeter and telemetry parser (AltOS `.eeprom`/CSV, FlightSketch, generic time-series).
- Synchronized multi-plot comparison: Predicted trajectory vs. Actual flight data.
- Automated generation of NASA Student Launch / Spaceport America Cup compliance summaries (PDR/CDR ready).

---

## 5. Risk Matrix & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Python environment dependency setup friction | High | Bundle embedded Python runtime with pre-installed `rocketpy` and `cea` inside the desktop Tauri package installer. |
| Licensing conflicts (GPL OpenRocket code) | Medium | Keep Astraea modular (MIT or Apache-2.0 core); interact with OpenRocket exclusively via file formats (`.ork`) and clean-room parsers rather than direct Java linking. |
| Heavy CAD divergence (SolidWorks mismatch) | Medium | Support STEP/OML outer mold line export and provide a clear mass-override field per component so physical scale readings always take precedence. |
| Inaccurate supersonic aerodynamics | Low | Provide clean export of OML geometry to RASAero format, with a dedicated tab to import RASAero $C_d$ tables back into the RocketPy flight solver. |

---

## 6. Engineering Review Decisions (2026-09-08)

### Core Architecture & State Model
1. **SSOT Vehicle Spec:** Normalized Axial Component Tree in versioned JSON (`src/core/types.ts`). Pure projection functions decouple the physics data model from WebGL rendering.
2. **Real-Time Stability Solver:** Client-side pure TypeScript Barrowman solver (`src/aero/barrowman.ts`) providing sub-millisecond, 60fps CP/CG updates while dragging CAD sliders.
3. **OpenRocket Ingestion:** Client-side pure TypeScript parser (`src/formats/orkParser.ts`) using `jszip` and `fast-xml-parser` for instant drag-and-drop with zero backend dependencies.
4. **State Management:** Zustand store (`src/store/rocketStore.ts`) with granular property selectors, non-React 3D render subscriptions, and immutable undo/redo history.
5. **3D Performance:** In-place `BufferGeometry` updates and shared materials to eliminate garbage collection frame stutter during slider manipulation.

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | SKIPPED | User opted for Builder Mode & direct engineering lock |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | SKIPPED | Not requested |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR | 0 open issues, 4 decisions locked, test plan published |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | DEFERRED | To be run after initial Phase 1 canvas scaffold |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | DEFERRED | Standard Vite+Vitest pipeline adopted |

- **VERDICT:** ENG CLEARED — ready to implement Phase 1.

NO UNRESOLVED DECISIONS
