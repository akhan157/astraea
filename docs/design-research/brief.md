# Astraea commercial-grade design research brief

Status: research execution; no frontend redesign or source changes authorized in this package.

## Objective
Establish an evidence-backed basis for a professional aerospace/rocketry workstation redesign. OpenRocket and hobby-domain tools inform feature coverage, not the product-quality ceiling. Study commercial CAD, simulation, mission-analysis and operational-data products critically: industrial adoption is not proof of good UX. Enterprise appearance is not certification or solver validation.

## Workspaces and authority
- Coordinator: current astraea-frontend Orca session; fresh supervised Run (do not reuse prior dispatched-worker lifecycle IDs).
- Deliverables: `C:/Users/adnan/orca/workspaces/astraea/astraea-frontend/docs/design-research/` only.
- Main checkout `C:/Users/adnan/orca/astraea` is read-only and the primary running-product baseline.
- Other frontend worktrees contain later work; do not assume features absent from main are absent everywhere. Audit current frontend as a separately labeled comparison if feasible.
- No source/config/package/lockfile/test changes; no commits, merges, external publication, accounts, paid trials, purchases, or contacting people. No full build/lint/test suites. Temporary runtime artifacts must stay under lane evidence directories or ignored temporary locations.
- Use Orca-managed child terminal sessions. Bulk research/audit: explicitly selected DeepSeek V4 Flash. Review judgment: Muse Spark 1.3 Contributor. Coordinator verifies evidence and owns final acceptance.

## Independent lane ownership
1. `cad-study.md` and `evidence/cad/`: commercial CAD/configuration references. Screen Siemens NX, CATIA/3DEXPERIENCE, PTC Creo, Onshape (4 candidates). Deep-study NX and Onshape with documented selection/edit and version/compare journeys; investigate CATIA to the extent public access permits.
2. `simulation-study.md` and `evidence/simulation/`: Ansys STK, Ansys Mechanical/Workbench, MathWorks Simulation Data Inspector, Siemens Simcenter STAR-CCM+ (4 candidates). Deep-study STK and SDI plus relevant invalidation behavior.
3. `operations-study.md` and `evidence/operations/`: Palantir Workshop/Quiver (one family), AVEVA PI Vision, Seeq, Grafana (4 candidates; classify commercial/open-source positioning honestly). Deep-study Foundry and whichever industrial analytics tool has strongest accessible evidence. No claim that these products validate aerospace physics.
4. `astraea-audit.md` and `evidence/astraea/`: running main app task/visual audit, then explicitly distinguish current frontend worktree deltas. Own audit browser tabs and temporary dev servers only. Do not modify source to make a workflow work.
5. Later Muse review: `review.md` only; audit all delivered studies against this brief, cite defects with exact sections/evidence IDs, classify accept/revise/block. No research-lane edits by reviewer; specific fixes return to the owning DeepSeek lane.
6. Coordinator: `synthesis.md`, `reference-atlas.html`, process records and acceptance accounting. Lane workers do not edit them.

## Shared evidence format
Every study must be navigable and finite, not a link dump. Use stable lane IDs (CAD-001, SIM-001, OPS-001, AUD-001).

For each screened product: category, intended user/task, commercial positioning, documented industrial relevance if available, access level, include/deprioritize rationale, source URL and access date. Do not fabricate current adoption from old announcements.

For each deep workflow: task and starting state; step-by-step actions and resulting visible states; selection/context model; error/cancel/recovery where documented; visual hierarchy/density details; what the source actually shows versus interpretation; Astraea adaptation and testable acceptance criterion; what NOT to copy; unresolved questions.

For each evidence item record: ID, product/version or checkout, direct source URL or local reproduction, precise locator (heading, image, timestamp), date accessed, method (hands-on / observed screenshot / official documented / practitioner reported / inference), relevant observation, limitation, and linked local image if captured. A marketing screenshot is not hands-on evidence.

Visual requirement: at least two inspectable, genuinely observed visual examples per research lane, with adjacent numbered annotations/callouts in the report. Prefer actual UI screens over marketing art. Save images locally in owned evidence directory when permitted; otherwise embed/link directly with attribution and exact locator. Do not fabricate diagrams as vendor screenshots. Include source/license context; local research use only, no republication permission assumed.

Practitioner requirement: seek at least one relevant independent practitioner/training discussion per research lane. Treat anecdote as a signal, not population-level evidence; document unsuccessful access/search rather than inventing complaints. Prefer exact workflows to generic satisfaction ratings.

Research depth: 12 screened candidates overall; at least 6 deep-studied products overall; each reference lane supplies at least 3 complete workflow analyses across its selected products, not just summaries. If source access blocks a workflow, explicitly label its missing steps and find another accessible source/product. Do not buy or create accounts.

## Running Astraea audit acceptance
Exercise, not just inspect source: preset/import -> selection -> geometry edit -> undo; compatible/incompatible motor selection; simulation run and changed-input freshness; invalid import/failure recovery; Evidence ingestion/resample/compare if available; export path; studio switching/state preservation; keyboard/focus and compact layout. Use realistic existing presets and fixtures; do not fabricate physical test data as measured evidence.

Capture at least desktop 1440x900 and compact 1280x800 views (and 200% zoom if tool supports); exact viewport/source identity and per-step observations. Record console/runtime errors, but do not fix them. Missing shipped functionality is an observation, not a reason to special-case or patch. Report task results as observed pass/partial/fail/unavailable, not a numerical UX score without a method. No real user study performed: walkthrough is expert inspection.

## Review gates
- Every claimed pattern has a checkable source; claims don't outrun inspected material.
- Visual critique references actual observed images; exact pixel measurements only when measured.
- Recommendations address specific Astraea tasks and distinguish frontend changes from engine/store contract decisions.
- Features proposed by analogy are not silently approved scope.
- Errors, empty/stale states, data provenance, units, precision and recovery receive explicit attention.
- Accessibility/performance/security cannot be declared compliant from screenshots.
- No final visual direction or production readiness claim before prototype and representative-user validation.

## Final package
Integrated report with screened landscape, strongest patterns, annotated reference atlas, prioritized current-product findings, adopt/adapt/reject matrix, decision criteria for two later design directions, and explicit evidence/access gaps. Design concepts and production code are not this research deliverable.
