# Astraea Clean-Room Engineering & Intellectual Property Compliance
**Document Version:** 1.0  
**Date:** 2026-09-08  
**Scope:** Legal and Technical Audit of Physics Implementations, File Formats, and Clean-Room Architecture  

---

## 1. Executive Legal Summary

Project Astraea is an independent, clean-room open-source rocket engineering workstation. To ensure absolute legal clearance and prevent any breach of intellectual property belonging to commercial or closed-source software vendors (such as Apogee Components' *RockSim* or Rogers Aeroscience's *RASAero II*), Astraea operates under the following strict legal and engineering boundaries:

1. **Underlying Physics is Public-Domain Science:** All aerodynamic, stability, aeroelastic, propulsion, and atmospheric formulations implemented in Astraea originate from unclassified, public-domain research published by United States government agencies (**NASA**, **NACA**, and the **U.S. Air Force**).
2. **Statutory Non-Copyrightability of Mathematics (17 U.S.C. § 102(b)):** Under United States copyright law and international treaties, ideas, physical laws, mathematical equations, and methods of operation cannot be copyrighted.
3. **Clean-Room Implementation:** No proprietary source code, closed-source binaries, or decompiled bytecodes have been incorporated into Astraea. Every algorithm is written cleanly from first principles in modern TypeScript, React, and Three.js.
4. **Interoperability Protection for File Formats:** Parsing and exporting third-party data formats (`.ork`, `.rkt`, `.cdx1`, `.eng`, `.rse`) for interoperability is recognized as protected fair use under established legal precedent (*Sega Enterprises Ltd. v. Accolade, Inc.*, *Sony Computer Entertainment, Inc. v. Connectix Corp.*) and codified under the reverse engineering exception of the Digital Millennium Copyright Act (**17 U.S.C. § 1201(f)**).

---

## 2. Public-Domain Provenance of Implemented Physics

Every physical model in Astraea is traced directly to original peer-reviewed government literature:

| Physical Module in Astraea | Primary Academic / Government Source | Public Domain Status |
| :--- | :--- | :--- |
| **Barrowman Stability Equations** | James S. Barrowman, *"The Practical Calculation of the Aerodynamic Characteristics of Slender Finned Vehicles"*, NASA TM X-67216 (1967). | NASA Technical Report (U.S. Government Work) |
| **Body-Fin Interference Factor ($K_{bf}$)** | Cambridge Rocketry Aerodynamics Specification; Rogers Modified Barrowman literature; NACA Report 1307 (1957). | Public domain government research |
| **Fin Flutter Boundary Velocity ($V_f$)** | *"Summary of Flutter Experiences as a Guide to the Preliminary Design of Lifting Surfaces on Missiles"*, NACA Technical Note 4197 (1958). | NACA Technical Report (U.S. Government Work) |
| **Compressible Skin Friction Drag ($C_{D,f}$)** | E. R. Van Driest, *"The Problem of Aerodynamic Heating"*, Aeronautical Engineering Review (1956); Schlichting Boundary Layer Theory. | Fundamental aerospace fluid dynamics |
| **Supersonic Wave Drag ($C_{D,wave}$)** | J. Ackeret, *"Air Forces on Airfoils Moving Faster than Sound"* (1925); Taylor & Maccoll conical shock theory (1933); Sears-Haack body optimization (1947). | Open scientific literature |
| **Standard Atmosphere Model** | *U.S. Standard Atmosphere, 1976*, NOAA, NASA, and USAF, NASA-TM-X-74335. | U.S. Government Work |
| **6-DOF Rigid Body Dynamics** | Newton-Euler rigid body equations of motion; Hamilton's quaternion algebra; Euler-Cromer / Runge-Kutta numerical integration. | Fundamental classical mechanics |
| **Solid Propellant Internal Ballistics** | George P. Sutton & Oscar Biblarz, *"Rocket Propulsion Elements"*; NASA SP-8039, *"Solid Rocket Motor Performance Analysis and Prediction"*. | Unclassified aerospace reference textbooks |

---

## 3. Clean-Room Architectural Boundaries

To prevent "tainted code" or copyright contamination:

- **Independent Functional Decomposition:**
  Astraea's engineers analyze only the **inputs and outputs** of external systems (e.g. what inputs are needed to calculate fin flutter, or what fields exist in an `.rkt` file). The internal architecture is designed from scratch to take advantage of modern web technologies (reactive Zustand state trees, Three.js WebGL procedural geometry buffers, and ESM modules), bearing zero architectural resemblance to Java Swing (OpenRocket) or legacy Win32 C++ (RASAero II / RockSim).

- **Data Schema Independence:**
  Astraea utilizes its own normalized data schema: the **Normalized Axial Component Tree (SSOT)** in versioned JSON. Third-party formats (`.ork` and `.rkt`) are treated purely as external inputs passed through clean-room translator adapters (`src/formats/orkParser.ts` and `src/formats/rktParser.ts`).

---

## 4. Legal Precedent Supporting File Interoperability

Competition rocketry teams require the ability to open their existing repositories of `.rkt` and `.ork` rocket designs without vendor lock-in.

- **17 U.S.C. § 1201(f) (Reverse Engineering Exception):**
  Specifically permits reverse engineering of computer programs for the sole purpose of identifying and analyzing elements necessary to achieve interoperability of an independently created computer program with other programs.
- ***Lotus Dev. Corp. v. Borland Int'l, Inc.* (516 U.S. 233):**
  Held that menu command hierarchies, file parameters, and functional system specifications are uncopyrightable methods of operation under 17 U.S.C. § 102(b).
- ***Google LLC v. Oracle America, Inc.* (141 S. Ct. 1183):**
  Reaffirmed that software interfaces and declarations necessary to allow developers to create compatible systems constitute fair use.

---

## 5. Summary Conclusion

Astraea maintains an auditable clean-room provenance trail. Its implementation of aerospace physics relies on unclassified, public-domain scientific literature published by NASA, NACA, and the U.S. Air Force. Its file adapters operate strictly within established statutory interoperability fair-use doctrine (17 U.S.C. § 1201(f)). By engineering independently from first principles using modern web standards, Astraea achieves high technical fidelity with rigorous IP risk mitigation.
