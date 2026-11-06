# RMP05a — input-only owner/custodian request (incomplete)

[Input-only form](input-only-request.json) · [assignment](../../../execution-runs/RMP05-input-only/ASSIGNMENT.md) · [packet](../../packets/RMP05.md).

**No case is selected, no budget is agreed, no rights/eligibility signoff exists, and nothing is ready for validation.** This is a concrete request/gap form, not a real-flight input package, production schema, scorer, independent eligibility review or authorization to access outcomes.

The original pilot freeze structure is retained as `pilotFreeze`, with additional plainly labeled unselected per-output decision records. Case/family/custodian/rights/input/observation/model/protocol/prediction identities stay NULL. Numeric decision reserves, useful design differences, interval widths, risk/confidence and all four budget allocations stay NULL. The units/purposes are discussion hints, not accepted rules/events. No historical percentage or RMP12 provisional100us/.01m/.02m/s diagnostic limit was adopted as an owner budget.

## What is actually needed from the responsible owner/team

1. **Identify one actual mission/vehicle family and priorities.** Initial proposed priorities are apogee targeting, effective rail departure and stability through burnout; select what matters rather than treating every listed output as a promised capability. Single-stage COTS/passive/dual-event is a hypothesis, not a measured Mach/Re/AoA envelope.
2. **Supply or identify permitted input-only records:** as-flown geometry/features/finish; exact motor curve/provenance; launch/dry mass and CG/datum/inertia evidence or justified bounds; atmosphere pressure/profile/time; rail/button/release definitions; recovery sections/events/CdA. The form maps all seven groups to missing provenance, uncertainty, contradictions and affected outputs. Every provided field must later get its own source/classification; group completion cannot hide an unknown field. Manufacturer nominal, measured, interpreted and omitted data remain distinct.
3. **Name a responsible decision owner and independent custodian, and establish use rights.** Public availability or repository license alone does not authorize third-party raw-data redistribution or establish as-flown fidelity/blindness. Record actual grant scope/hash and independent review; missing permissions stay blocked.
4. **For the selected decisions, agree useful limits before outcomes:** applicable rule/event/datum, alternatives, usable reserve, smallest useful design delta, maximum useful uncertainty width, acceptable risk/confidence, and input/measurement/model/numerical allocations with dependence rationale. Unknowns may remain NULL with the affected decision blocked; the assistant must not invent agreement.

## Keep outcomes and private information separate

This committed file is an **empty public-method template**. Actual private team/site/person identifiers, access grants, raw inputs and custodian locations belong in a permissioned local package outside Git until redistribution scope is reviewed. Use opaque references/hashes here where appropriate; the `sealedOutcomeLocationHeldByCustodianOnly` field requests a custody declaration, **not a raw outcome path or its contents**. No raw telemetry, apogee/landing measurements, source notebook outcomes or protected files should be pasted into this form or opened to fill it.

`observationSchemaOnly` asks only instrument/channel/calibration/units/datum/timebase/filter/dependency metadata. The custodian retains sealed outcome values until the final model/protocol/predictions are frozen and access separately authorized. An input-only form does not grant that access. Do not run holdout/round2 scoring or contact anybody from this request; `unsentRequest` is local and unsent.

The exposure/dependency plan requires vehicle/family/team/source/motor/aero/weather/instrument/reconstruction/person edges. No actual independence graph is claimed while a case is unselected. Published/previously examined examples remain development/reference evidence, shared reconstructed columns are not independent sensors, and a new worktree never restores blindness. RMP14/custodian must review actual case overlap and split eligibility.

## Checks / disposition

```sh
python3 -m json.tool docs/internal/execution-package/evidence/RMP05/input-only-request.json >/dev/null
```

Structural coordinator checks also confirm incomplete/not-ready, all unagreed budget/signoff fields NULL and no selected actual case or outcome values. Those are form-integrity checks, not RMP05 scientific passes. C01/C04 remain in progress for form/gap/exposure preparation; C02/C03/C05 are blocked on actual permission/custody/owner agreement and eligibility. Independent **case** review is pending and cannot be replaced by reviewing an empty template.

Sources are the unchanged [proposed mission matrix](../../../accuracy-program/collegiate-mission-and-decision-matrix.md), [proposed accuracy structure](../../../accuracy-program/collegiate-accuracy-spec-proposed.md), [input-only pilot template](../../../accuracy-program/execution-2026-10-25/pilot-freeze-template.json), [exposure ledger](../../../accuracy-program/sources-and-exposure.json) and [comparison contract](../../../accuracy-program/comparison-input-contract-v0.1.md). No historical thresholds/rules were rewritten or promoted to accepted gates.
