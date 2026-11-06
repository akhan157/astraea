# RMP09-C05 — per-section energy gap

Status: **external / blocked; local note only.** No per-section model or
production change was made.

## Requirement

RMP09 packet C05: “Correct suspended mass, descent/landing state and per-section
energy; whole-vehicle number is not competition per-section proof.”

## Current implementation

- The native result exposes only whole-vehicle landing values:
  `landing_kinetic_energy` (`six_dof.rs:1950`, assigned at `:2886`;
  `models.rs:836`, copied at `:956`) and `landing_mass`. The 20 J screen in
  `models.rs:957` is therefore a whole-vehicle screen, not a section result.
- There is no per-section mass, suspension/attachment graph, section descent
  state or section energy accumulation. The accepted domain ledger records
  “No inflation/opening-shock, no multibody/suspended sections”
  (`RMP09-domain-legacy/SOURCE-DOMAIN-LEDGER.md`).
- The RMP10 recovery-readout record explicitly leaves per-section energy open
  (`RMP10-recovery-readouts/RESULT.md:119`).

## Why it is external

Per-section energy needs actual section masses, hardware/CdA assignments,
suspended-vs-attached relationships, descent/landing states and a declared
energy definition. Those are team/platform measurements, not derivable from the
whole-vehicle `landing_kinetic_energy`. Inventing sections or partition weights
is prohibited.

## Local product

No pass is claimed. The whole-vehicle number is documented as not being
competition per-section proof; no code or test was manufactured.

## Falsifier

- Any per-section energy derived from `landing_kinetic_energy` without section
  masses/states.
- Section masses that do not sum to the landing mass, or shared hardware
  counted in more than one section.
- A competition/landing claim that uses the whole-vehicle 20 J screen as
  per-section evidence.
