# Astraea Capability Decision Queue (consolidated 2026-09-10)

## DECISIONS (user, 2026-09-10)

**Frontend frozen until the feature set is established**; all UI accumulates in
worktrees and reconciles in one final pass. Engines/logic built now.

| # | Decision |
|---|---|
| C1 | **BUILD** — dispatched, lane `astraea-c1-fins` |
| C2 | **BUILD** — dispatched, lane `astraea-c2-cad` |
| C3 | **BUILD** — queued: waiver-containment + KML |
| C4 | **BUILD** — queued; merges with C8 minimal editor |
| C5 | **BUILD** — dispatched with C6, lane `astraea-c3-explain` |
| C6 | **BUILD** — dispatched with C5, lane `astraea-c3-explain` |
| C7 | **DESIGN-ONLY NOW** — general-purpose staging: defaults + user overrides + per-team calibration from their own logs + honesty flags. Not team-specific; no sponsor gate. Phase-1 coding not scheduled |
| C8 | **BUILD MINIMAL** — dropdown of live thrust curves + "make your own" editor at the bottom; folds into C4 |
| C9 | **BUILD MINIMAL (2D strip)** — assessed: engineering value already ships numerically (clearanceCheck + density advisory over exact user dims); a visual adds legibility + mistake-catching + team communication, not new predictions (folded-chute shape unknowable, cord unmodelable, density bands heuristic). 2D axial cross-section strip earns its place; full 3D render does not |
| C10 | **BUILD** after a usage check: add the grain shapes people actually use if low-effort |
| C11 | **PARKED** — possibility only, no build |
| C12 | **BUILD the valuable parts** — GPS-track ingest + landing back-cast; drop fluff; PDF report only if it earns its place |
| C13 | **BUILD expanded** — first-run experience questionnaire then optional guided interactive tour with spotlight/dim-screen walkthrough |
| C14 | **BUILD** — sensible default motor variance with explicit typical-range vs estimate presentation |
| C15 | **BUILD expanded** — full bidirectional interop: import from other tools and export back to them |
| C16 | **BUILD** — real equilibrium chemistry solver, validated against published CEA results |
| C17–C21 | **STAY CLOSED** (Tier 3 confirmed) |

Single decision surface for every candidate capability. Sources: forum intel
(docs/forum-intel-report.md), tool census (astraea-research/docs/tool-coverage-report.md),
frontend plan (astraea-frontend/docs/frontend-plan.md), exception ledger
(docs/superset-exception-ledger.md), staging package
(astraea-staging-research/docs/staging-design-package.md).

**Standing policy:** frontend work is frozen until the feature set is
established; UI accumulates in worktrees and reconciles in one pass.

Effort: S ≤1d, M 1-3d, L 3-7d, XL >1wk. Evidence: forum recurrence +
tool-census verdict.

---

## Tier 1 — Master recommends BUILD (cheap, evidence-strong, each beats a paid or broken tool)

| # | Capability | Impact | Effort | Evidence | Why |
|---|---|---|---|---|---|
| C1 | **Fin structural loads** — root bending moment, σ vs yield w/ safety factor, tip deflection, first-mode frequency; extends shipped flutter | H | S–M | Census: only paid, email-gated AeroFinSim covers it; no free alternative; TRF flutter-tool threads | Completes the fin-aeroelasticity suite; classical beam theory, no validation-data gate |
| C2 | **STEP/STL export** — native solid/print export of airframe geometry | H | M | Census T4: ork2step broken on OR 24.x; Reddit STEP wishlist; 3D-print forum active | Kills the fragile-script CAD bridge; geometry already computed; differentiator |
| C3 | **Waiver-containment + KML** — drift ellipse vs waiver cylinder/polygon PASS-FAIL, multi-day forecast soundings, KML track export | H | M | Forum T1 (4 threads, top theme); census §8#1: RockSim Launch Visualizer **currently down** | Only unserved paid workflow; extends shipped MC; safety/legal hook |
| C4 | **Live ThrustCurve API search** — official JSON API + attribution, on-demand motor lookup | M | S | Census T20: official AI-friendly API; community motor-data backbone | Keeps motor DB current; trust/positioning value |
| C5 | **Wind-profile CSV import** — saved multi-level wind tables | M | S | Forum T1/T10; OR 24.12 parity | Removes external-CSV glue; parity with incumbent |
| C6 | **CP/CG transparency panel** — per-component breakdown, "why CP moved", units clarity | M | S | Forum T3/T6 (boattail CP, swing-test, %-vs-caliber confusion) | Turns shipped linter into trust/teaching surface |

## Tier 2 — Pending YOUR product call (master not decided)

| # | Capability | Impact | Effort | Evidence | The open question |
|---|---|---|---|---|---|
| C7 | Staging/clustering phase-1 (E4) | H | L–XL | Forum P6 (wanted, 3+ threads); design package ready | Do we fund the biggest modeling lift now, before a sponsor/data exists? |
| C8 | Thrust-curve editor (E5) | M | M–L | Forum: **zero** demand signal; frontend plan spec'd it | Build for completeness, or stay import-only? |
| C9 | Recovery-bay 3D packing visualizer (E2) | M | M–L | No demand signal; spec'd in master product spec | Visual polish vs engineering value? |
| C10 | Extra grain geometries — finocyl/moon/c-slot (openMotor parity) | M | M | Census: openMotor is the open reference | Needed for motor-design users, or BATES/star enough? |
| C11 | Component-level aero loads — per-component C_A/C_N vs (AoA,Mach) CSV | M | M | Forum T7 (1 expert thread); RASAero whole-vehicle only | Niche research-tier; worth sizing? |
| C12 | Evidence UX completion — GPS-track ingest, back-cast plot, PDF report | M | M | Forum P5 (LPV2 workflow, Blue Raven) | Polish of shipped loop, or leave as-is? |
| C13 | Beginner onboarding pack — reference-frame docs, units explainer, first-run guided sim | M | S | Forum T6 (CG-ref, stability-units confusion) | Support-load reducer; scope? |
| C14 | Per-motor-class impulse sigma defaults for MC | L–M | S | Forum T7 replies ("vary by 10%") | Honest UQ out of the box; tiny |
| C15 | RockSim `.rkt` **export** | M | S–M | Census: import ships, export doesn't | Round-trip parity worth it? |
| C16 | Propellant equilibrium (Gibbs solvers, E7) — CEA/ProPEP3 parity | M | L | Census: PARTIAL; needs reference corpus | Academic niche; corpus required to validate |

## Tier 3 — Master recommends NOT building (with rationale)

| # | Capability | Why not |
|---|---|---|
| C17 | AltOS `.eeprom` binary parsing (E3) | Census: community flies CSV-exportable loggers; firmware-versioned layout, no validation pair |
| C18 | Mobile native / dedicated field app (P10) | Web already runs on mobile; high effort, secondary-tier evidence |
| C19 | Full CFD integration | Out of scope by design; CFD is a validation peer, not a competitor |
| C20 | ThrustCurve Tracer (image→.eng) | No demand signal; import covers the workflow |
| C21 | Formal TRA/NAR certification (E6) | Organizational, not technical |

---

## Decision asked

Approve Tier 1 (C1–C6) as one build wave? Then pick any of Tier 2
(C7–C16) to promote, and confirm Tier 3 stays closed or reopen any line.

Frontend remains frozen; UI for approved Tier 1/2 items gets folded into the
final frontend reconciliation pass, not built now.