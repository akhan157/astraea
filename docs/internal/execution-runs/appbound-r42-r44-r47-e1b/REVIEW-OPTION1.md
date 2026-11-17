# App-bound R42/R44/R47 review

Date: 2026-11-11. Reviewer: **Codex Sol** (`gpt-6.1-sol`, high reasoning),
read-only and independent of the author and coordinator. Source `b2c4896`,
records head `a4cb6a0`, against `5f17db5`. This is an engine handoff review, not
frontend or release acceptance.

## Verdict

**ACCEPT WITH FINDINGS.** No blocking default drift or excluded physics change.
The opt-in engine handoff is acceptable.

## Blocking findings

None for this bounded handoff.

## Non-blocking findings

1. `crates/astraea-core/src/six_dof.rs:3271`: the ordinary burnout event
   description computes Mach with the ISA speed of sound even when
   `launchSiteTemperatureC` selects anchored air. Flight loads use the selected
   atmosphere correctly, but the displayed Mach can disagree. Fix before
   exposing the temperature option in the UI.
2. `crates/astraea-core/src/six_dof.rs:2026`: a launch site above 11 km is
   accepted, but the isothermal pressure exponent subtracts 11 km instead of the
   site altitude, giving a pressure discontinuity immediately above such a pad.
   Outside the evidenced terrestrial cases; fix or explicitly refuse.
3. `crates/astraea-engine/src/aero_provider.rs:313`: `aero_model_status` always
   reports flight refused/legacy. Reconcile before a UI consumes the status.

## Verified scope and physics

- Exactly 11 files, +2,374/−24 under `crates src`; no `src/` change.
- No E-1/E-1b boattail or base-drag production change; no `StabilityDto.parts`
  or `PartExtentDto`.
- Options absent: R42 resolves no terms; R44 returns legacy without building
  tables or a baseline pass; R41 diagnostics have no product caller.
- R42 applies the flight nozzle correction once while powered, separate from the
  vehicle's aero nozzle input.
- R44 replaces the drag tables after one baseline ascent; it does not add
  calibrated drag atop legacy drag. No hidden E-1b dependency.
- R47 converts metres to feet once before calibrated evaluation.
- Spaceport's unsupported fins explicitly select legacy drag and record the
  refusal; nose-radius low-Mach limitation and E-7 exclusion are non-blocking.

## Independent number check

Cohort MAE **5.625324600727461 %**, signed **+0.23630386939544862 %**, **18/20**;
delta vs corrected R41 Stack **+0.01268909823126485 pp**; Mini
**+29.01072759458858 %**, Cosmic **+24.584724177180604 %**, Top Shot
**−2.4013831766000138 %**, Adventurer **−4.908001389791328 %**. No meaningful
mismatch. Wiring product-vs-harness maxima **0.0/0.0**; research comparison
**0.0545020972846363 / 0.0036720939670661945**, ungated. Site round trips
**1.3374922084896002e−16** / **0.0**.

Identity fields and suites match: apogees **299.1795257133733**,
**533.0760350112048**, **5013.508465461415 m**; parity fixtures unchanged;
core **269/0/0, 5 suites**; engine **156/0/7, 19 suites**; seven evidence hashes
and both WASM hashes match.

## Stale/overstated text

- "Tree identical to `250c8f9`" is not literal: four docs/probe files differ;
  `crates` and `src` agree.
- "All flight outputs bit-identical" exceeds the probe's selected fields.
- `appbound_bundle_cohort.rs` retains stale research-harness descriptions and an
  obsolete test command; its ignored neutrality test targets research
  fingerprints.

## Residual uncertainty

Reviewer inspected implementation/evidence without rebuilding or rerunning the
suites. R3 remains explicitly not run. The attribution of the research bias
difference solely to base drag is an inference without an isolated comparison.
