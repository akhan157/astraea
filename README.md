# Astraea 🚀

> **Unified Open-Source Rocket Engineering Environment**  
> Go from mission concept and 3D parametric design to multi-solver flight simulation and physical test validation.

---

## 🎯 Overview

Individual rocketeers, collegiate competition teams (e.g. NASA Student Launch, Spaceport America Cup, EuRoC), and aerospace researchers currently manage rockets across a brittle, disconnected ecosystem of tools:
- **Geometry & CAD:** SolidWorks, Onshape, FreeCAD
- **Subsonic Aerodynamics & Stability:** OpenRocket, RockSim
- **Transonic & Supersonic Aerodynamics:** RASAero II
- **6-DOF Trajectory & Wind Dispersion:** RocketPy
- **Motor Chemistry & Internal Ballistics:** NASA CEA, openMotor, ThrustCurve
- **Avionics & Telemetry Logs:** AltOS, FlightSketch, Open MCT

**Astraea** is a modern visual workstation that unifies these disciplines into a **Single Source of Truth (SSOT)**:
1. **Interactive 3D Parametric CAD:** Real-time 3D rocket assembly canvas with live Barrowman Center of Pressure (CP) and Center of Gravity (CG) tracking.
2. **Headless Multi-Solver Integration:** Direct execution of **RocketPy** (6-DOF trajectories, weather ensembles, Monte Carlo landing ellipses) and **NASA CEA** (propellant thermochemistry).
3. **Closed-Loop Validation Ledger:** Ingest physical test-stand data (TDMS, CSV) and flight altimetry logs (AltOS, FlightSketch) to overlay predictions against flight evidence and calibrate aerodynamic coefficients.
4. **Third-Party Interoperability:** Bi-directional import and export with OpenRocket (`.ork`), RockSim (`.rkt`), and RASAero II (`.cdx1`).

---

## 📖 Architecture & Design Documentation

Read the full architecture and engineering roadmap in [docs/Astraea-design-doc.md](docs/Astraea-design-doc.md).

---

## 🛠️ Roadmap

- [x] **Phase 1: 3D Rocket Assembly Canvas** (React + Three.js / WebGL parametric airframe, fins, nosecone, transitions, live Barrowman & high-Mach aero)
- [x] **Phase 1.5: File Interoperability & 6-DOF Dynamics** (OpenRocket `.ork` & RockSim `.rkt` adapters, NACA TN 4197 fin flutter, 6-DOF quaternion flight engine)
- [x] **Phase 2: In-Browser Solver Integration** (Open-Meteo live soundings + manual wind tables + Monte Carlo dispersion; Gibbs equilibrium solver + frozen-flow APCP nozzle chemistry — no Python sidecar, all TypeScript in-repo)
- [x] **Phase 3/4: Recovery Subsystem & Dual-Compartment Packing** (Derived-bay 2D packing strip via `deriveBays`, clearance + density advisories, black powder charge sizing; full 3D X-ray rejected per C9)
- [x] **Phase 5: Closed-Loop Flight Evidence Ingestion** (Altimetry CSV + GPX ingest, sim-vs-flight overlay, Cd calibration, GPS back-cast)
- [ ] **Durable project reload (S3):** versioned `.astraea.json` envelope engine (`src/formats/projectJson.ts`) ships tested; Header/App still read/write the legacy bare vehicle — UI cutover pending.
- [ ] **Background MC host (E1):** chunk API + worker entrypoint ship tested; TrajectoryStudio still runs synchronously (cap 200). Host wiring with progress/cancel pending.
- [ ] **Empirical closure:** physics validates against published references, not flight data; browser visual validation not performed (jsdom + build only).
---

## 📄 License

Apache License 2.0. See `LICENSE` for details.
