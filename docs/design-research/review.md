# Design research review — Muse judgment lane

- Reviewer model: `openrouter/meta/muse-spark-1.3-contributor` (session-configured; recorded per task instruction)
- Date: 2026-09-10/11 UTC. Binding contract: `docs/design-research/brief.md` + `docs/design-research/evaluation-method.md`, read in full before any lane study.
- Ownership: this file (`docs/design-research/review.md`) is the reviewer's ONLY output. All lane studies, evidence, source, config, scripts treated READ ONLY — no edits made outside this file (verified via `git status`, see §5).
- Method: full read of all four lane studies; spot-opened 8 evidence images across lanes and compared pixels against report annotations; checked every evidence-register ID for resolvability (local file or real URL); checked cross-lane contract counts.

## 1. Cross-lane contract compliance

| Contract item (brief) | Result |
|---|---|
| 12 screened candidates total | PASS — CAD 4 + SIM 4 + OPS 4 = 12, each with category/user/positioning/relevance/access/rationale/URL+date |
| ≥6 deep-studied products total | PASS — full deeps: NX, Onshape, STK, SDI, Foundry-family, Seeq = 6. Mechanical (invalidation only), PI Vision (deep-lite), Grafana (screened-light), CATIA (partial), Creo (screened), STAR-CCM+ (screened) correctly not counted as full deeps |
| Each reference lane ≥3 complete workflows | PASS — CAD 6 (W1–W6), SIM 4 (§3–§6), OPS 9 (W-1–W-9). All include task/state, steps, selection model, error/recovery, source-vs-interpretation, adaptation + acceptance criterion, NOT-to-copy, unresolved |
| ≥2 genuinely observed UI examples per reference lane | PASS — CAD 6 plates, SIM 4 examples + browser-capture artifact, OPS 8 figures. All are real product UI, none fabricated as vendor screenshots |
| Practitioner signal or documented bounded failure per lane | PASS — CAD: GoEngineer VAR article + 3DSwym tips + documented account-wall failure; SIM: MATLAB Answers thread + Volupe trainer blog + Reddit/portal failures; OPS: Seeq thread + ITI blog + Reddit thread + three bounded failures |
| Audit task coverage (preset/edit/undo, motor, freshness, invalid import, evidence, export, studio switching, keyboard/compact) | PASS — T1–T8 cover all; compare-overlay absence honestly reported as N/A, not fudged |
| Screenshot/viewport claims (1440×900 + 1280×800, 200% zoom) | PASS — both viewports captured; 200% zoom explicitly reported as tool limitation, not an app claim |
| Source-vs-interpretation labeling | PASS in all lanes ([INTERP] tags, per-workflow source-vs-interpretation blocks) |
| No production-readiness / compliance-certification overclaims | PASS — CAD §12, SIM §14 + "no accessibility/performance compliance" line, OPS gaps section, audit "not certified (out of scope)" all explicit |
| No fabricated adoption or hands-on claims | PASS — vendor-reported items labeled as such; hands-on claimed only where true (Grafana Play, audit live app, local dir inspection) |

## 2. Spot-checks (pixels vs annotations)

Opened and inspected: `cad-ev-nx-chamfer-ai-select.png`, `cad-ev-onshape-compare-panel.png`, `sdi_compare_time_tolerance.png`, `stk_timeline_view.jpg`, `ops-quiver-overview-annotated.png`, `ops-seeq-compare-annotated.png`, `AUD-main-001-cad-default-1440x900.png`, `AUD-main-010-sim-stale-after-input-change-1440x900.png`.

7 of 8 match their report annotations (dialog contents, selection colors, compare headers/slider, tolerance values 0 Match/1 Mismatch + 0.5 time tol, availability-vs-access rows, Quiver/Seeq overlay positions, audit default-workstation callouts). One mismatch, filed as AUD-R1 below.

## 3. Lane verdicts

### 3.1 CAD study (`cad-study.md`) — REVISE (minor, non-blocking)

Substantively compliant: 4 screened, 2 deep + CATIA partial, 6 workflows, 6 annotated plates, practitioner signal + bounded failure, no overclaims, frontend-vs-data-model recommendations separated. Rework items for owning lane:

- CAD-R1 (§8 evidence index): ID `CAD-013` is missing from the sequence (index jumps CAD-012 → CAD-014; `CAD-004m`/`CAD-010p` suffixes also unexplained). Either add the missing row or add one sentence stating the gap is intentional (e.g. retired ID) so a coordinator audit does not read it as a dropped item.
- CAD-R2 (§4.4 / §3): annotations for FIG-1–FIG-6 live in report text only; unlike the OPS lane no numbered overlays are burned into the images. This meets the brief ("adjacent numbered annotations/callouts in the report"), but add one sentence in §4.4 stating explicitly that callouts are text-side, to pre-empt a coordinator flag.

### 3.2 Simulation study (`simulation-study.md`) — REVISE (minor, non-blocking)

Substantively compliant: 4 screened, STK + SDI deep plus Mechanical invalidation deep-study, 4 workflows, 4 observed examples + method artifact, exact tolerance-band math quoted, F5-vs-auto-delete provenance contrast honestly drawn, Reddit-summary evidence correctly labeled low strength. Rework items:

- SIM-R1 (§6, §11, §12): text cites `SIM-EVID-004b` ("How SDI Compares Data") but the §11 index has no `004b` row — `SIM-EVID-004` covers two URLs. Add an explicit `SIM-EVID-004b` index row (same table, own locator) so every cited ID resolves 1:1.
- SIM-R2 (§8 Example C): the `stk_timeline_view.jpg` callouts ("Accesses"/"Access Line") are the vendor tutorial's own baked-in labels, and the text does say so — accepted as written, no change needed beyond keeping that sentence. Recorded here to close the check.

### 3.3 Operations study (`operations-study.md`) — REVISE (minor, non-blocking)

Substantively compliant: 4 candidates with honest open-source classification of Grafana, 2 deep + PI Vision deep-lite + Grafana screened-light, 9 workflows, 8 visuals (strongest overlay-annotation discipline in the package), three practitioner threads + three bounded failures, explicit "no physics validation" framing (§7-equivalent line 7). Rework items:

- OPS-R1 (§evidence register, OPS-111): the Display/Investigation-range screenshot (`2019-03-14_14-30-52.jpg`) is cited by KB filename but not saved locally, unlike every other visual. Download it into `evidence/operations/` (brief: "save images locally when permitted") or add one sentence explaining why it cannot be archived.
- OPS-R2 (Figure 2, `ops-pivision-workspace-annotated.png`): the source image already carries vendor red callouts 1–11 and the lane adds blue numbers — state the color legend in the figure caption (one sentence) so readers never confuse vendor numbers with lane numbers.

### 3.4 Astraea audit (`astraea-audit.md`) — REVISE (minor, non-blocking)

Substantively compliant: main + FE checkouts identified by hash, all brief task areas exercised live (T1–T8), F1–F6 findings with severity and evidence, no numeric UX score, no real-user-study claim, FE deltas separately labeled, fixtures synthetic-labeled, viewports exact. Rework items:

- AUD-R1 (visual evidence item 4, `AUD-main-010-sim-stale-after-input-change-1440x900.png`): the opened image shows the 6-DOF Flight Sim modal filling the frame; the report's callouts ([1] run manifest, [2] STALE badge, [3] KPIs) are not visible in the captured pixels. Either re-capture with the modal closed so the STALE badge is visible, or correct the callouts to describe what the shot actually shows.
- AUD-R2 (severity scale, §"Severity scale used"): the lane's Blocker/Major/Minor/Info/N/A scale differs from the evaluation-method's Critical/High/Medium/Low/Unverified-hypothesis scale. Add a one-sentence mapping (e.g. Major≈High, Minor≈Medium) or one sentence justifying the lane-local scale, so synthesis can compare findings across lanes.

## 4. Claims that outrun evidence — NONE BLOCKING

No adoption fabrication, hands-on fabrication, compliance certification, or production-readiness claim was found in any lane. The closest approaches, all already contained by the lanes' own labeling, are recorded for the coordinator: SIM §9.2 Reddit themes rest on search summaries without direct reads (labeled low strength — acceptable, do not strengthen in synthesis without direct reads); OPS PI Vision "industrial relevance corroborated" rests on a vendor-aligned integrator blog (caveat already in-register — synthesis must keep the caveat); audit F1 root-cause ("Promise-form toBlob") is a plausible runtime diagnosis from one session (keep as observed-failure + hypothesis, not a certified root cause).

## 5. Change-scope confirmation

`git status --porcelain` shows only `?? docs/design-research/` (untracked research directory). No source, config, test, or lane-study edits were made by this reviewer; the only file this lane owns or writes is this `review.md`.
