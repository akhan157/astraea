# Astraea Forum Intelligence Report — Demand Signals from the Rocketry Community
**Task:** RESEARCH-FORUMSCAN (read-only)
**Date:** 2026-09-10
**Author:** dispatched worker, astraea-research worktree
**Scope (coordinator-approved):** targeted sampling. High-signal TRF subforums (19 of 97) + Reddit (snippet-tier) + ThrustCurve (official AI endpoints). Full-forum crawl explicitly parked — see §5.
**Guardrails honored:** public pages only; no auth/Cloudflare bypass (none encountered); robots.txt respected (≥5s pacing, crawl-delay 1 observed, disallowed paths untouched: `/search/`, `/whats-new/`, `/account/`, etc.); no PII; no republishing of poster content — summary + short verbatim quote only.

---

## 1. Source Map

| Source | URL | robots.txt / ToS stance | Scraping accessibility | Rough volume | Top recent themes |
|---|---|---|---|---|---|
| The Rocketry Forum (TRF) | rocketryforum.com | robots: Googlebot/Bingbot crawl-delay 1, allow `/`; AI crawlers (GPTBot, ClaudeBot, anthropic-ai) crawl-delay 30; unlisted UAs unrestricted. Disallowed: `/search/`, `/whats-new/`, `/goto/`, account/login/conversations, `?order=`/`?direction=` paths | **Fully readable.** XenForo, plain HTML server-rendered, no JS required for content; Cloudflare in front but zero challenge observed on plain GETs (200 + `xf_session` cookie) | **147,966 thread-page URLs / 147,869 unique threads** in 4 sitemap files (sitemap lastmod 2026-09-09); 97 forums; thread IDs to ~198k (est. 2004–now) | Build logs (LPR/MPR/HPR), electronics & software, recovery & ejection reliability, motors/impulse, staging/airstarts/clusters, aerodynamics & CFD-vs-solver comparisons, weather/landing-drift prediction |
| OpenRocket forum | forum.openrocket.info | n/a | **Subdomain does not resolve** (NXDOMAIN). OpenRocket community lives in TRF forum 36 "Rocketry Electronics & Software" + openrocket.info wiki + Discord (linked in 24.12 announcement) | OR release announcement thread alone: 30 posts + 2 pages; OR topics appear weekly in forum 36 | Release feedback (24.12), wind-data workflows, bug reports (`.ork` save crash, tailcone CP), support Q&A |
| Reddit r/rocketry + r/modelrocketry | reddit.com/r/rocketry, /r/modelrocketry | Public JSON endpoints returned HTML (blocked for unauthenticated automated access at probe time, 2026-09-10) → **snippet-tier via web search**, per coordinator approval | Not directly scrapable this session; search-indexed thread URLs cited | High (both subs large, active) | Software choice (OpenRocket vs RockSim vs RASAero), sim accuracy caveats, feature wishlists (CAD/STEP import, HIL/TVC, dispersion tooling, mobile app) |
| ThrustCurve | thrustcurve.org | robots crawl-delay 3; publishes **`/llms.txt` + `/llms-full.txt` + JSON API** explicitly "for AI & Agentic" use with attribution guidelines; disallows `/mystuff/`, `/admin/`, param-filtered motor pages | **Officially AI-friendly**; API is the intended path (search/download/metadata JSON, OpenAPI spec) | 10 manufacturers listed in llms-full.txt; motor search + simfile DB (.eng/.rse) | Motor data for simulators, RASP format docs, simulator ecosystem (10 sim tools listed: OpenRocket, RASAero, RockSim, SpaceCAD, WinRoc, AeroFinSim, Burnsim, …) |

**Access verdict:** TRF is the single deepest accessible source (147k threads, no challenge). Reddit is evidence-blocked at API level; treated as secondary tier. ThrustCurve is cooperative by design. OpenRocket "forum" = TRF subforum 36.

---

## 2. Top Themes Ranked by Recurrence

Ranking by number of sampled threads / distinct posts exhibiting the signal + user emphasis. Evidence: source + thread URL. (R) = Reddit, snippet-tier.

### T1. Weather → landing-drift prediction and waiver containment (4 threads) — STRONG
Drift prediction from winds-aloft forecasts is a *workflow gap* the community patches with an Excel workbook.
- TRF "GPS DriftCast": "I have never actually used the program to aid in launching rockets. It's just too clunky. Manual inputs for the wind profiles dependent on a forecast website" (dev admits pain). User demand: "If I had a big flight planned, I would constantly be on the Windy app, manually iterating through the winds aloft forecasts days in advance and guessing where my rocket may end up." Waiver link: "HPR waivers not only include altitude limits, but also horizontal limits. This tool will help keep your flight 'in the cylinder' and on the property." Another: "(Now can you get it to work 3 days out ?????)". Zoomer: `https://www.rocketryforum.com/threads/gps-driftcast-gps-drift-2-0-vastly-improved-landing-location-prediction-based-on-winds-aloft-forecasts.185800/`
- OpenRocket 24.12 announcement: multi-level wind input shipped; community volunteered an **external** wind-CSV generator (gpsdriftcast.com/orwind) — weather data ingestion is still external tooling. `https://www.rocketryforum.com/threads/announcement-openrocket-24-12-final-is-now-available-for-download.193437/`
- LPV2 flight post: back-casting landing point from actual pad/impact coords with updated multi-level wind sim; drift analysis is post-hoc manual work. `https://www.rocketryforum.com/threads/lpv2-on-an-h250g-blue-raven-and-open-rocket-data-inside.198848/`
- (R) Wishlist: "advanced, automated dispersion analysis… large sets of varied atmospheric data files… statistical landing zones and hard weather-constraint boundaries before heading to a launch field." `https://www.reddit.com/r/rocketry/comments/m7mh03/simulation_software_caveats/`

### T2. Flight-data ↔ simulation overlay & calibration (3+ threads) — STRONG
Users manually overlay recorded altimeter data on sim curves; calibration is a known best practice.
- LPV2: "I overlaid an Open Rocket MultiLevel Wind sim with the Blue Raven Data where it makes sense / For example, this is altitude -vs- time four ways" + quaternion→KML conversions discussed. `https://www.rocketryforum.com/threads/lpv2-on-an-h250g-blue-raven-and-open-rocket-data-inside.198848/`
- GPS DriftCast: Excel-based back-cast to validate DriftCast. `https://www.rocketryforum.com/threads/gps-driftcast-…185800/`
- (R) Consensus: "fly the rocket once, look at the real-world data, tweak your simulation parameters (such as surface finish or Cd overrides) to match reality" — calibration is manual in OpenRocket. `https://www.reddit.com/r/rocketry/comments/wjam2y/rasaero_vs_openrocket/`

### T3. CP/CG trust gaps & high-Mach accuracy (4+ threads) — STRONG
Users distrust or are confused by solver CP outputs; supersonic accuracy drives tool-switching.
- Boattail CP: "adding the boattail moved the CP forward 7 inches & rendered the rocket unstable" — questioned by clubmates; mirrored in OpenRocket: "I'm seeing a similar Cp shift and nose mass insensitivity in OpenRocket … The Cp shifted 4.5" forward rendering the rocket technically unstable." `https://www.rocketryforum.com/threads/impact-of-boattail-on-cp.198351/`
- Swing-test mismatch: "Be aware that, in reality, the CP moves forward at increased angle of attack. But OR assumes that the rocket remains at a low AOA when calculating the CP." `https://www.rocketryforum.com/threads/openrocket-cp-and-swing-test-on-small-model.198788/`
- Tailcone CP bug persists across OR versions: "the CP location is the same in v24.12 as it was in v23.something." `https://www.rocketryforum.com/threads/announcement-openrocket-24-12-…193437/`
- (R) OR vs RockSim CP disagreements ("disagree by 1,000 ft", CP discrepancy threads) → users told neither is truth; both are approximations. `https://www.reddit.com/r/rocketry/comments/stgng8/openrocket_and_rocksim_disagree_by_1000_ft/`, `https://www.reddit.com/r/rocketry/comments/124eyts/center_of_pressure_discrepancy/`
- (R) High-Mach: "OpenRocket's accuracy begins to degrade past Mach 1 to Mach 2… almost universally recommend switching to RASAero II." `https://www.reddit.com/r/rocketry/comments/o9d88p/what_are_limitations_of_openrocket_and_is_there/`

### T4. Cross-tool interoperability friction (4 threads) — STRONG
Every bridge between sim and CAD/manufacturing is manual or broken.
- ork2step: "it only works with OR 15.x … If you try and use a 24.x .ork it will error out." `https://www.rocketryforum.com/threads/convert-ork-to-step.198186/`
- 2-stage build: "updating my SolidWorks + OpenRocket files to match" — dual-maintenance staleness. `https://www.rocketryforum.com/threads/2-stage-first-attempt.194370/`
- RKT→ORK archiving: "I simply downloaded the .rkt file from their website … and saved it as a .ork file." `https://www.rocketryforum.com/threads/apogee-invicta-kits-rkt-to-ork-conversion.196094/`
- (R) ".rkt import into OpenRocket is notoriously messy. Many users recommend completely rebuilding a rocket design from scratch." `https://www.reddit.com/r/rocketry/comments/124eyts/center_of_pressure_discrepancy/`
- (R) CAD geometry import wishlist: "import custom CAD geometry (STEP/IGES files) straight into OpenRocket … without having to approximate shapes using standard component trees." `https://www.reddit.com/r/rocketry/comments/m7mh03/simulation_software_caveats/`

### T5. Staging / clustering / airstart complexity (3+ threads) — MEDIUM-STRONG
- 2-stage first attempt: electronics routing through sustainer to ignite booster ("include a path for wires … in case you end up finding the ignition from the lower stage to be inconvenient/unreliable"), adapter/reducer design, dual-deployment of booster + sustainer. `https://www.rocketryforum.com/threads/2-stage-first-attempt.194370/`
- How would you simulate this? (exotic multi-tube geometry): "I can get the tubes in the right place by treating them and tube fins, or by adding a cluster of inner tubes," and dual-chute event confusion: "I set both chutes to deploy at apogee, but it doesn't seem to make any difference." `https://www.rocketryforum.com/threads/how-would-you-simulate-this.198647/`
- Staging/airstarts/clusters forum hosts 2-stage J-impulse record attempts, cluster RSO safety threads, rkt-to-ork staging conversions (see T4).

### T6. Beginner usability & documentation gaps (3+ threads) — MEDIUM
- CG reference: "from what reference point does OR measure a rocket's CG location? I've assumed it's the forward tip… I can't find that specific answer in the online OR wiki." `https://www.rocketryforum.com/threads/cg-measured-from-what-reference-point-in-open-rocket.198668/`
- Stability units confusion: "51.9% stability sounds dangerously bad. 150% stability sounds safe" (percent-vs-calibers mixups). `https://www.rocketryforum.com/threads/openrocket-cp-and-swing-test-on-small-model.198788/`
- OR support-Q&A etiquette thread exists because support is fragmented (`how-to-ask-an-openrocket-support-question…157409`).

### T7. Advanced/expert aero analysis (2-3 threads) — MEDIUM (expert tier)
- Component loads: "anyone knew of a way to obtain per component values for C_A and C_N at various AOA and Mach from the current analytical aero standard solvers (OpenRocket, RASAero II)" — RASAero only does whole-vehicle. `https://www.rocketryforum.com/threads/determining-aerodynamic-component-loads-at-various-aoa-and-mach-subsonic-supersonic.198341/`
- Protuberance drag: RASAero has the method "built into RASAero II," OpenRocket does not; user-side CFD comparisons cited. `https://www.rocketryforum.com/threads/streamlined-protuberance-drag-camera-shroud-drag-and-saturn-i-block-i-flight-data.197825/`
- UQ/statistical forecasting thread (Kriging/data assimilation): dismissed as jargon ("AI troll" reaction) but the substantive replies reinforce variance awareness: "the engine performance can vary by 10%" and "The winds can be different at different altitudes. And they are changing minute by minute." `https://www.rocketryforum.com/threads/applications-of-stochastic-statistical-methods-…193984/`

### T8. Reliability & packaging pain (3 threads, OpenRocket-specific) — MEDIUM
- ".ork save crash": "I get an 'uncaught exception' when I try to save it"; root cause "one or more of the Motors & Configurations is the problem." `https://www.rocketryforum.com/threads/cannot-save-an-ork-file.198859/`
- Windows installer SmartScreen friction: "the Windows installer is not yet whitelisted by Microsoft, so you might have to negotiate some extra security warnings." `https://www.rocketryforum.com/threads/announcement-openrocket-24-12-…193437/`
- DriftCast Excel x64 compile error + wind-speed override reverting — spreadsheet tooling fragility. `https://www.rocketryforum.com/threads/gps-driftcast-…185800/`

### T9. Recovery & ejection sizing (3+ threads) — MEDIUM
- Failure-to-eject forensics: wadding/friction/piston lore; "the ejection charge does not deploy the parachute. It only separates the 2 sections of airframe." `https://www.rocketryforum.com/threads/failure-to-eject-too-much-wadding-too-tight-parachute.188527/`
- 3D-printed ejection-charge test plugs + motor mass simulators for ground testing. `https://www.rocketryforum.com/threads/3d-printed-motor-mass-simulator.198422/`
- TRF ships its own static calculators (ejection-charge, recovery-harness, chute-packing, rail-exit, fin-flutter, vent-port pages) — the forum itself hosts standalone sizing calculators.

### T10. Price sensitivity (Reddit consensus) — MEDIUM (secondary tier)
- "RockSim… costs around $120+… community heavily leans toward OpenRocket simply because RockSim is widely considered not worth the price tag." `https://www.reddit.com/r/rocketry/comments/o9d88p/…`, `https://www.reddit.com/r/rocketry/comments/1mp9g59/rocket_software_simulation/`
- Related: mobile/field wishlist ("run quick simulation checks… at the launch site") `https://www.reddit.com/r/rocketry/comments/nk4wdx/model_rocket_flight_sim_beta_testers_iphoneipad/` + TRF "OR available on mobile?" aside (swing-test thread).

---

## 3. Tool-Switch Stories

| Story | From → To | Why | Evidence |
|---|---|---|---|
| Price-driven default migration | RockSim ($120+) → OpenRocket (free/GPL) | "skip buying RockSim"; OpenRocket "does everything RockSim can do (and more) without costing anything" | (R) `1mp9g59`, `o9d88p`; TRF `rocksim-vs-open-rocket.154171` (appears in search citations for OR/RockSim split) |
| Supersonic capability switch | OpenRocket/RockSim → RASAero II | Accuracy degrades past M≈1–2; RASAero "widely regarded as having superior aerodynamic modeling for high-speed compressible flow… (also free)" | (R) `o9d88p`, `wjam2y`, `17kgm9p` |
| Complementary chain, not switch | OR (design/sim) + SolidWorks (mechanical CAD) | Neither tool owns the full stack; user manually syncs: "updating my SolidWorks + OpenRocket files to match" | TRF `2-stage-first-attempt.194370` |
| Supplementary drift tool | Exported to Excel (GPS DriftCast) because no sim does forecast landing drift | "I have never actually used the program… It's just too clunky," yet users call it "the most awesome recovery tool I have ever used" — demand exists, packaging is the pain | TRF `gps-driftcast-…185800` |
| CAD bridge via fragile script | OR → STEP via third-party `ork2step` | Only works on OR 15.x files; errors on 24.x; install friction (Python version pinning) | TRF `convert-ork-to-step.198186` |
| Wind data pipeline | Manual Windy.com iteration → OR 24.12 multi-level wind | External CSV generator (gpsdriftcast.com/orwind) glued to the new import — weather still external | TRF `announcement-openrocket-24-12-…193437` |

**Implication for Astraea:** free (matches price story), M0–4 aero (matches RASAero story), closed-loop calibration (matches T2 best practice), and single-source-of-truth geometry (kills the SolidWorks+OR divergence story).

---

## 4. Signal → Capability Mapping

Legend: **SHIPPED** = implemented + tested per master spec / gap analysis (30 files/333 tests); **E#** = open exception ledger row (docs/superset-exception-ledger.md); **NEW** = candidate feature from this survey.

| # | Demand signal (evidence) | Astraea capability | Class |
|---|---|---|---|
| 1 | Forecast-wind landing drift + waiver cylinder containment (T1, DriftCast + waiver quotes) | Monte Carlo dispersion + landing ellipse exist; **needs**: forecast (multi-day) soundings, waiver polygon/cylinder check, KML export | NEW (extends SHIPPED trajectory MC) |
| 2 | Sim↔flight overlay & Cd calibration (T2, LPV2 manual overlay; Reddit calibration consensus) | Evidence studio: altimetry CSV ingest, sim/flight multi-plot overlay, automated Cd calibration | SHIPPED (diff: Featherweight/Blue Raven CSV covered; polar back-cast & GPS-track→KML = NEW nicety) |
| 3 | CP/CG explainability, boattail surprises, stability-units clarity (T3+T6) | Boattail angle linter, stability margin check (calibers), fineness ratio; **needs**: per-component CP/CG breakdown + plain-language "why" + margin display units | SHIPPED core + NEW transparency layer |
| 4 | Supersonic accuracy gap that pushed users to RASAero (T3) | M0–4 aero suite: Rogers Barrowman, Van Driest II, wave/base/plume drag, supersonic CP migration, `.cdx1`/aero-matrix export | SHIPPED (direct RASAero-replacement target) |
| 5 | Protuberance drag missing in OR, built into RASAero (T7) | Protuberance drag calculator (lugs/rail buttons/shrouds) | SHIPPED |
| 6 | Component-level aero loads per AoA/Mach (T7) | **needs**: per-component C_A/C_N vs (AoA,Mach) report + CSV export | NEW (expert tier) |
| 7 | STEP/STL export; CAD import wishlist (T4, ork2step broken; Reddit STEP wishlist) | `.ork` bi, `.rkt` import, `.cdx1` + blueprint SVG export; **needs**: STEP/STL export (and 3D-print mesh) | NEW (extends SHIPPED interop) |
| 8 | RKT→ORK manual conversion pain (T4) | `.rkt` import | SHIPPED (already covers the story's pain) |
| 9 | Staging/clustering/airstart + dual-chute event confusion (T5) | single-stage 6-DOF shipped; staging/clustering deferred | E4 (revisit triggered: 3+ signals) |
| 10 | Wind profile ingestion: multi-level import, CSV helper (T1/T10) | manual wind tables + Open-Meteo live soundings; **needs**: wind-profile CSV import to match OR 24.12 | NEW (small; parity) |
| 11 | Motor variance/uncertainty (T7 post: "vary by 10%", DriftCast weathercock) | MC motor impulse perturbation (±2%) already in scenario schema | SHIPPED (could add per-class sigma defaults = NEW nicety) |
| 12 | Recovery sizing calculators, ejection reliability (T9) | BP ejection sizing, shear-pin physics, dual-compartment packing math | SHIPPED |
| 13 | Loss/community trust in docs (T6, CG ref question unanswered in OR wiki) | **needs**: in-app reference-point docs, first-run tutorial, units clarity | NEW (low effort, UX) |
| 14 | Reliability/packaging complaints hurt incumbent (T8) | Web app = no installer/SmartScreen friction; save-crash class bugs avoided by JSON schema | SHIPPED (structural advantage) |

---

## 5. Prioritized Candidate Feature List

Impact (community pain relief), effort (engineering), evidence (sampled recurrence) — each rated H/M/L, then a priority score.

| Prio | Candidate | Impact | Effort | Evidence | Rationale / notes |
|---|---|---|---|---|---|
| P1 | Forecast-wind landing drift + waiver-containment check (polygon/cylinder PASS-FAIL, KML export) | H | M | H (4 threads, top theme; safety/waiver legal need) | Extends shipped MC dispersion; open-meteo forecast API; DriftCast proves demand + clunkiness of the alternative. Differentiator vs OR (no drift tool of its own). |
| P2 | STEP/STL export (+ 3D-print workflow) of airframe geometry | H | L–M | H (ork2step broken thread + Reddit CAD wishlist + 3D-printing forum active) | Feeds CAD/print pipeline; low risk since geometry already computed; resolver-class parity with OR's OBJ export but STEP is the pro-grade ask. |
| P3 | CP/CG transparency: per-component breakdown, "why did CP shift" panel, stability margin in calibers with plain-language units | M | L | H (boattail thread, swing-test thread, CP-discrepancy Reddit) | Turns shipped linter into a teaching/trust tool; cheap; directly addresses recurring confusion. |
| P4 | Wind-profile CSV import + saved multi-level wind presets | M | L | M–H (OR 24.12 shipped it; DriftCast/orwind helper) | Parity with incumbent + removes external-CSV glue step. |
| P5 | Evidence-studio UX completion: GPS-track ingestion (Blue Raven/FlightSketch), landing back-cast plot, event delta report as PDF | M | M | H (LPV2 workflow, DriftCast backcast) | Ships core exists; this is polish + formats users already use. |
| P6 | Staging/clustering/airstart modeling — reopen exception E4 | H | H | M (2-stage thread, airstarts forum, dual-chute confusion) | Big lift; sponsor-gated per ledger; this survey adds community evidence. Parked unless stakeholder appears. |
| P7 | Component-level aero loads (per-component C_A/C_N vs AoA/Mach) CSV | M | M | M (1 expert thread, low recurrence) | RASAero whole-vehicle only; niche but high-value for research teams. |
| P8 | Beginner onboarding pack: reference-frame docs, unit/margin explainer, first-run guided sim | M | L | M (CG-ref thread, stability-units confusion) | Cheap trust-builder; lowers support load. |
| P9 | Per-motor-class impulse sigma defaults for MC (10% class variance finding) | L–M | L | M (stochastic thread replies) | Tiny; makes UQ honest out of the box. |
| P10 | Mobile/field PWA quick-check (motor fit, drift, margins) | M | H | M (Reddit mobile wishlist, launch-site context) | Defer — high effort, secondary tier evidence. |

**Deliberately NOT prioritized:** interactive thrust-curve editor (E5 — no demand signal observed), AltOS .eeprom binary parsing (E3 — community flies Featherweight/Jolly Logic CSVs, which are covered), Gibbs full equilibrium solver (E7 — no forum demand), formal TRA/NAR certification (E6 — organizational, not technical).

---

## 6. Method, Guardrails, & Revisited Decisions

**Corpus:** 16 TRF threads read in full (OP + visible replies) across forums 36 (electronics & software), 134 (R&D), 206 (aero), 18 (techniques), 17 (scratch-built), 143 (recovery), 144 (motors), 189 (staging/airstarts), 190 (3D printing), 41 (beginners); 19 forum listing pages indexed; ThrustCurve `llms.txt`/`llms-full.txt`/simulators page read; 9 Reddit threads captured at snippet tier via web search (public indexing only, no API bypass). Pacing: ≥5s between site requests, small batches; 100% of TRF fetches returned 200 with zero Cloudflare challenge.

**Recurrence counting caveat:** themes ranked across a 16-thread sample, not the full forum; Reddit evidence is snippet-tier (search-generated summaries), so no verbatim Reddit quotes are used — only paraphrases with thread citations.

**Revisited decision — full-forum crawl (do NOT start):** sitemap census: 166,833 total URLs; 147,966 thread pages; 147,869 unique threads; 97 forums; multi-page threads nearly absent from sitemap (only 6 `page-N` URLs indexed, so crawl cost ≈ unique threads, not pages). At robots-respecting 1–2s pacing this is still a ≥3–4 day single-threaded crawl → parked as a future program with a different owner; targeted batch (this report) chosen per coordinator. If revisited: crawl thread pages only (skip `/posts/`, `/goto/`, `/media/`, `/designs/`, `/tags/`, `/parts/` = ~19k of 166.8k URLs), store gzipped HTML, parse to post-level JSONL, then keyword-prefilter + cheap-model theme pass (not frontier-LLM over the whole corpus).

**Admin note:** TRF's own static calculators (ejection-charge, recovery-harness, chute-packing, rail-exit, vent-port, fin-flutter pages) confirm demand for the exact sizing features Astraea already ships in Modes 3/5 — useful third-party validation of the shipped recovery/propulsion scope.