# RMP02 — D1 — qualify retained aerodynamic references

## Purpose/status

PARTIAL: RMP02a retained-source eligibility/custody gate is independently accepted at
`44d74d7`; C01/C05 pass for explicit exclusions and paired-evidence guard only.
[Result](../../execution-runs/RMP02-source-eligibility/RESULT.md) and
[feature/quantity matrix](../evidence/RMP02/README.md):64 retained artifact entries,
25 guard tests, **zero qualified cases**. C02 blocked; C03/C04 in progress.
Physical/convention/native-density extraction and geometry qualification remain OPEN.
No source acquisition, new curve reading, model change or outcome access occurred.

## Prerequisites (closure versus early work)

- Early work uses retained public source records and the implemented A1b adapter boundaries.
- Closure requires independent extraction/convention review and an actually matching geometry or explicit extension decision.
- Do not wait for RMP01 to inventory eligibility; do not score a native model before its geometry/domain exists.

## Required reading

- STOP/migration handoff (private coordination notes)
- [Full roadmap](../../roadmap-to-collegiate-1.0-2026-10-26.md)
- Model routing (private coordination notes)
- [A1b eligibility decision](../../accuracy-program/diagnostics/A1b-reference-eligibility-2026-10-26.md)
- [Open geometry ledger](../../accuracy-program/sb1-foundation-2026-10-26/D1/geometry-ledger.json)
- [Retained extraction method](../../accuracy-program/first-batch-2026-10-26/D1/README.md)
- [Subsonic retained method](../../accuracy-program/sb1-foundation-2026-10-26/D1/README.md)
- [Existing inventory](../../accuracy-program/execution-2026-10-25/candidateinventory.json)

## Files owned/prohibited/shared leases

- Existing `docs/internal/accuracy-program/sb1-foundation-2026-10-26/D1/` and `first-batch-2026-10-26/D1/` public ledgers; preserve original readings.
- CREATE `docs/internal/execution-package/evidence/RMP02/` for eligibility decisions and reviewed deltas; no raw copyrighted PDFs by default.
- Shared lease: geometry/provider changes belong to RMP01/RMP08; request a design ticket rather than editing their source.
- All proposed CREATE paths require dispatch-time existence/ownership check; preserve unrelated dirty work and negotiate shared edits sequentially.

## Frozen decisions

- ARCAS ordinate-ogive/finite-tip, reflex lip, compound fin anchors and section details remain unresolved/nonmatching for the current adapter.
- Neither a tangent-ogive declaration nor omission of the lip/anchors turns approximate geometry into exact qualification.
- A supplied-total-force/independent-moment path tests normalization/load assembly; it does not qualify native coefficient generation.
- D-4013 and D-4014 moment stations differ; translate with original S/L/datum and signs before merging.

## Ordered implementation/review substeps and commit boundaries

1. Commit 1: reconcile retained source/configuration inventory with A1b support; record each exact/approximate/excluded geometry decision.
2. Freeze a finite extraction subset by report/page/figure/Mach/incidence/power/base convention before re-reading points.
3. Review original-density crops, axis calibration, symbol center and resolution; retain first and independent reader picks separately.
4. Commit 2: add unresolved axial/supersonic points only where actual retained material supports them; keep omitted conditions explicit.
5. Reconcile reader disagreement from source, retaining raw picks and rationale; estimate absolute floors near zero rather than percent residuals.
6. Commit 3: normalize force and independent moment together; record paired coverage and gaps without executing new flight studies.
7. Independent reviewer signs geometry, sign/datum, base correction and uncertainty decisions; author corrects one bounded issue per follow-up.
8. Commit 4: publish eligible subset plus exclusions, extension requests and exact questions for RMP08/RMP13.

## Input/output contracts and source fields

- Input record: report ID/hash, printed/PDF page, figure/table, configuration and original scan/crop identity.
- Per point: source coordinates, axis calibration, quantity/units, S/L, axes/signs, moment datum, Mach, Re or Re/m, alpha, roll, power/trip/base correction.
- Geometry: measured/drawn/nominal/interpreted features and uncertainty, with lip/anchors/tip/ordinate discrepancies individually named.
- Output: immutable first/independent/normalized values, absolute extraction uncertainty, resolution floor, exclusion reason and reviewer identity.
- Unknown conditions remain unavailable; no interpolated or calculated component is labeled measured.

## Acceptance checks

| ID | Mechanism | Pass condition | Evidence |
| --- | --- | --- | --- |
| RMP02-C01 (Eligibility) | compare every chosen geometry feature to A1b capability | every mismatch resolved by evidence or explicitly excluded/nonmatching | feature matrix and review |
| RMP02-C02 (Conventions) | independent S/L/datum/sign/base reconstruction | dimensional force/moment preserved and stations not directly conflated | conversion worksheet |
| RMP02-C03 (Extraction) | two retained readings and source-resolution check | differences reconciled or uncertainty/exclusion retains disagreement | picks/crops/calibration hashes |
| RMP02-C04 (Near zero) | inspect near-zero force and moment symbols | absolute uncertainty governs; no unstable relative-error pass | floor rationale per source |
| RMP02-C05 (Paired evidence) | cross-index CN/CA and independent Cm conditions | CP-only or unmatched-condition data cannot earn native qualification | paired eligibility table |

## Negative/failure cases

- Unreadable markers, ambiguous finite tip/base correction or missing Re stay excluded/open; source title Mach range does not fill conditions.
- An approximate ARCAS match may be development-only; no harmlessness assertion without bounded discrepancy evidence.

## Exact permitted checks or required prerequisites

- Read-only packaging/check command from repository root: `git diff --check -- docs/internal/execution-package/packets/RMP02.md`.
- Future extraction prerequisite: retained source image/PDF is actually available, rights checked, and bounded subset approved; a hash alone is insufficient.
- Accepted bounded custody/exclusion guard: `python3 scripts/diagnostics/check-reference-eligibility.py`; `python3 -m unittest discover -s scripts/diagnostics/tests -p test_reference_eligibility.py -v`. Exit0 verifies the frozen exclusion/custody contract, not model qualification.
- Existing extraction scripts have historical paths; inspect and port path inputs before execution. Native-density originals are unavailable here; no fresh extraction execution is promised.
- Commands above are future resumed-work checks unless explicitly read-only packaging checks; this package records no new executions.

## Evidence to save

- Save source/geometry eligibility matrix, extraction subset hash, calibration/pick identities and absolute uncertainty ledger.
- Save reviewer disposition, unresolved rows, source availability/rights and exact native-method extension requests.
- Record pinned base, owner/model/effort, exact commands/exit status, source/input/artifact hashes, review disposition, limitations and next action.
- Historical external logs/binaries may be unavailable; identify missing artifacts honestly and never count retained hashes as fresh execution.

## Escalation/stop decisions

- Stop qualification on ambiguous geometry/sign/reference/base convention; choose a narrower eligible question or escalate to independent scientific review.
- Do not restart broad source acquisition or contact authors without separate authorization.
- Preserve defaults/main and stopped automation; no external contact, holdout access, paid/remote operation or publication is implied.

## Successor/ready-made agent assignment prompt

RMP03 consumes reviewed normalization; RMP08 consumes geometry/regime gaps; RMP13 uses measurement floors.

> Close retained D1 eligibility using A1b boundaries. Own public source ledgers only, preserve independent picks and ARCAS mismatches, deliver paired force/moment conventions and extraction uncertainty. No outcomes, broad search, source-model edits or accuracy claim.
> Before work pin current integration base, inspect dirty state/active runs, name exact leases and resource budget, and retain completed evidence. Independent material-science/convention review is required where applicable.
