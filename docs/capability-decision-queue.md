# Astraea Capability Decision Queue (consolidated 2026-09-10)

> **Historical product decisions, not an active dispatch queue (2026-09-26).** The frontend-freeze and worktree-dispatch language below records the September 10 sequencing and was superseded by the promoted Tauri/Rust/Linear-Dense frontend on `main`. Consult [current project status](project-status.md) and the [exception ledger](superset-exception-ledger.md) before scheduling an item: `BUILD` here does not imply it remains unimplemented or fully UI-wired. Tier 3 deferrals remain deliberate unless revisited with evidence.

## Current disposition crosswalk

This crosswalk supersedes the historical “queued/dispatched/pending” labels below. “Shipped” means the capability exists in code; it does not itself claim empirical flight validation.

| Decision | Current disposition |
|---|---|
| C1 fin structure, C2 STEP/STL, C3 waiver/KML, C6 CP/CG breakdown | Engine/export/UI scope shipped; verify complete native desktop journeys before calling acceptance closed. KML refuses when the run has no telemetry payload. |
| C4 live ThrustCurve, C5 wind CSV, C8 thrust-curve editor | API/parser/editor engines exist, but their corresponding search/import/edit UI surfaces remain outstanding. |
| C7 staging | Design-only; no staged-flight sponsor/data. |
| C9 recovery packaging | Minimal 2D strip and checks shipped; full 3D packing intentionally rejected. |
| C10 additional grain geometries | BATES/star shipped; revisit finocyl/moon/c-slot only after usage evidence. |
| C11 component-level aerodynamic loads | Parked. |
| C12 evidence workflow | CSV/GPX, overlays, calibration and back-cast shipped; empirical comparison with a real flown vehicle is still needed. |
| C13 onboarding | Content/logic exists, but end-user acceptance and integration scope should be checked before expansion claims. |
| C14 motor uncertainty | Typical motor-variance defaults ship. |
| C15 interop | RKT export and several other adapters ship; `.rse` export UI and project-envelope Header/App cutover remain gaps. |
| C16 Gibbs equilibrium | 60-case restricted-species CEA corpus regression ships. Solver-to-nozzle preset coupling and shifting-equilibrium expansion are not implemented. |
| C17–C21 | Remain closed/deferred per the historical decision unless fresh user evidence reopens them. |

See [project status](project-status.md), [exception ledger](superset-exception-ledger.md), and [adapter matrix](adapter-matrix.md) for verification scope and sequencing.

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

**Historical standing policy (superseded):** the frontend-freeze and worktree
reconciliation process below was in force when this queue was written. The
Tauri/Rust/Linear-Dense frontend has since been promoted to `main`; use
`project-status.md` for current sequencing.

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

## Decision record (closed for this queue)

The approval prompt below was for the September 10 planning session and is
historical, not an outstanding request. Many Tier 1 and Tier 2 capabilities
were later implemented; consult `superset-exception-ledger.md` for
current engine/UI status, and `project-status.md` for actual next work.

Do not treat the former frontend-freeze instruction as current. UI additions
should follow the active integration policy and acceptance checks.
