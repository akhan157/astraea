# Competitive landscape and minimum product bar

Prepared 2026-10-28 as the owner's requested basis for scope decisions: *"look at
the current landscape of all the tools being used for this work, primarily
collegiate, what the expectations are, what people are used to using — that is
our minimum match."*

This is a **requirements input**, not a qualification claim. It does not certify
Astraea, does not open protected outcomes, and does not change any acceptance
register status. Sources are cited so figures can be re-checked; where a figure
is a vendor's own claim it is labelled as such.

## 1. Who the competition actually is

| Tool | Position | Notes |
| --- | --- | --- |
| **OpenRocket** | De facto free standard; what students learn first | 6-DOF, extended Barrowman, real-time CG/CP, staging, component library, 3D view, `.ork` interchange |
| **RockSim** (Apogee) | Commercial incumbent, more advanced | Long-standing alternative; `.rkt` interchange |
| **RASAero II** | The high-power / sounding-rocket reference | Combined aero analysis + trajectory; **explicitly subsonic/transonic/supersonic**; 2-DOF (no wind) and 3-DOF |
| **RocketPy** | Open-source Python, research/collegiate traction | Used in EUROC/academic work; good for scripted studies |
| **ThrustCurve.org** | The motor database everyone imports from | The interchange source for certified motor curves |

Interchange matters: **`.ork` and `.rkt` are the lingua franca.** A tool that
cannot read and write them is not in the conversation.

## 2. What the competitions demand

**Spaceport America Cup / IREC** (the flagship collegiate event) per the 2025–2026
Rules & Requirements and the Design, Test & Evaluation Guide (DTEG):

- Target apogee **10,000 ft / 30,000 ft / 45,000 ft AGL**
- Minimum payload **2.2 lb** (historically 8.8 lb in some classes)
- COTS solid motors
- **Apogee accuracy is 70% (350 points) of flight-performance score**
- DTEG requires a **flight simulation profile graph** (altitude vs time, plus events) in the design report
- Recovery information, altimeters, and documented methods

Read that again: **the thing our app is worst at is worth 70% of the score.**

## 3. The accuracy bar

| Source | Apogee error | Scope |
| --- | --- | --- |
| **RASAero II** (vendor) | **3.47% mean** across barometric/optical/accelerometer/GPS data | High-power, wide range |
| RASAero II, MESOS to 293,000 ft | **−1.26%** | Extreme altitude |
| **OpenRocket Plus** (25-flight corpus, Mach 0.54–4.33) | mean **−0.38%**, σ 5.44%, **MAE 4.74%** | Broad Mach range |
| Ironbark (student sim w/ CFD coefficients) | **0.97–1.64%** | Two high-power flights |
| Community expectation (The Rocketry Forum) | *"10–15% is about right for most sims"* | Pragmatic floor |

**Derived bar: mean absolute apogee error ≈ 5% or better, across a stated
Mach/geometry range.** 10–15% is the tolerated floor; anything outside the
sim's own stated uncertainty band is a fail, regardless of magnitude.

## 4. Where Astraea stands against that

| Axis | Landscape bar | Astraea today | Gap |
| --- | --- | --- | --- |
| **Apogee accuracy** | MAE ≈ 5% | **+6 to +10%**, 3 blind flights, 1 vehicle; **outside its own uncertainty band** → own-rule **FAIL** | **Behind** |
| **Independent vehicles** | broad corpus (25+ flights, many airframes) | **1** blind vehicle (Madcow Mini DX3 ~1 m, 41 mm). Others are development data (G69N, Cosmic Cargo, Adventurer, Top Shot) or unscorable (RocketPy round 2) | **Far behind** |
| **Regime coverage** | subsonic → supersonic (Mach 0.5–4+) | Evidence clustered **subsonic, small, low-finesse**. Model has transonic/supersonic terms (Van Driest II, wave drag, Mach CP shift) but they are **unvalidated** | **Capability present, evidence absent** |
| **Vehicle scale** | 10k–45k ft, 8.8 lb payload, high-power | Evidence is a **1 m model rocket at ~4,300 ft** | **Wrong regime entirely** |
| **Motor database** | ThrustCurve.org-scale (thousands) | **~7 certified motors** in `motorDatabase.ts` | **Severe** |
| **Component model** | nose, tubes, transitions, 3 fin planforms, mass, parachute | Same core set present | **Comparable** — missing launch lugs, rail buttons, bulkheads, couplers, pods, staging |
| **File interchange** | `.ork` + `.rkt` read/write | Both present | **Met** |
| **6-DOF, real-time CG/CP, Monte Carlo** | expected | Present | **Met** |
| **Transonic aero reference** | RASAero validates against ARCAS wind tunnel | Per-band ARCAS scoring now active (`b43e203`): subsonic CA 11.2%/4.9%, **transonic short CA 15.7% (retained red vs 15% target)**, transonic long 13.8%; per-band CP 1.1–6.4 pp | **Measured & gated: transonic short CA fails by 0.7 pp; supersonic CA unvalidated** |

## 5. The minimum bar, stated as requirements

To be a credible collegiate tool — i.e. to match what teams already have —
Astraea must demonstrate:

1. **Accuracy:** mean absolute apogee error ≤ 5% across a stated envelope, with
   every case inside its published uncertainty band. 10% is the floor.
2. **Coverage:** independent flight comparisons across **multiple vehicle
   families** — not one airframe. Minimum credible: model/low-power, mid-power,
   high-power 10k ft, high-power 30k ft. That is 4 distinct regimes.
3. **Regime:** validated transonic and supersonic behaviour, scored against
   wind-tunnel data (ARCAS is already in hand).
4. **Scale:** high-power vehicles with payload mass, dual deployment, long rails.
5. **Motors:** a real certified motor database, not 7 entries. Import from
   ThrustCurve.org or equivalent.
6. **Interchange:** keep `.ork`/`.rkt` round-trip fidelity (already met).
7. **The competition artifact:** export the flight-simulation profile the DTEG
   asks for (altitude/velocity/acceleration vs time, with events).

## 6. What this implies for our roadmap

The 10-increment budget we just spent produced **real software quality**
(1580 tests, honest claims, sound data handling) but moved **none** of the bars
above except #6. That is the correct lesson: **the gap is evidence and data, not
code.**

Highest-value next work, in order:

1. **Done (`b43e203`): Per-band ARCAS transonic scoring.** Replaced the pooled
   average with per-band CA gates and per-band CP reporting, exposing the
   `15.7%` transonic short CA failure. Per `RMP08.md:20` and
   `2026-10-25-cp-scientific-review.md`, `transonic_fin_lift_slope_ratio`
   (`aero.rs:1582`, `transonicAero.ts:438`) is already present in the legacy
   curve, and isolated patches to legacy prefactors/CP laws or retuning wave-drag
   multipliers to pass the gate are prohibited; physical expansion must go
   through the candidate `P0`/`SB1` force-and-moment provider (`RMP02`/`RMP08`).
   Per `DECISIONS.md` (`OWNER-1.0-PRODUCT-BAR`), the target remains a
   primary-use collegiate 1.0 within a demonstrated envelope (companion-only is
   not approved as a downgrade).
2. **Build the motor database** from a legitimate source. Nothing above is
   testable on 7 motors.
3. **Run the vehicle-family comparison** across the 4 regimes in §5.2 using
   published/public flight data (DOFPro archive is already in use).
4. **Fix or explain the +32% G69N gap.** A known unexplained 32% error on
   development data is a landmine under any accuracy claim.

Items 1–3 are data/protocol work. Item 4 is the only one that is genuinely a
model problem — and it is the one that would most change the accuracy verdict.

## Sources

- OpenRocket feature docs and wiki feature comparison (openrocket.readthedocs.io, wiki.openrocket.info)
- RASAero II user manual and flight-data comparisons (rasaero.com: `/comparisons-alt.htm`, `/comparisons-flight.htm`, `/home.htm`) — vendor-published figures
- IREC / Spaceport America Cup Rules & Requirements (soundingrocket.org), DTEG 2024 v1.1.3 and 2026 v1.1
- OpenRocket Plus / RASAero II 25-flight corpus comparison (Zenodo technical report, 2025)
- OpenRocket technical documentation §6 "Comparison with experimental data"
- Ironbark trajectory/aerodynamic simulator (EUCASS 2023)
- `docs/accuracy.md` — our own flight-comparison record
- `docs/internal/roadmap-to-collegiate-1.0-2026-10-26.md` — our own target and gates

## Limits

- Competitor accuracy figures are largely **vendor- or author-self-reported**;
  no independent audit was performed here.
- No competitive product was executed. This is a documentary survey.
- Figures are point-in-time (2026-10) and tool versions move.
- This document sets a **product bar**. It is not an accuracy claim for Astraea
  and does not certify any envelope.
