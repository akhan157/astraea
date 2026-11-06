# Decision rules for continuation

## Frozen technical/product decisions

| Issue | Required decision |
| --- | --- |
| Primary goal |A useful, dependable 1.0 for real collegiate design/planning within demonstrated mission/output scope, not an experimental-only handover. General public is the market; Binghamton University's rocketry team is the first intended customer. [Owner clarification](OWNER-1.0-RELEASE-BAR.md). Companion-first is not approved as a downgrade. |
| Physical authority |One Rust/WASM core. New native candidate uses existing static evaluator; TS is not a second runtime physics engine. |
| Legacy defaults |Old/no-provider projects/commands remain legacy. Explicit new identities/migration required before app exposure. |
| Static moments |Return independent force+moment; no CP prerequisite, no C>=old guard filter and no moment derived from Cd/CP. |
| Body conventions |P0: right-handed +Y forward; omega=(pitch,roll,yaw); stations aft of nose map to negative bodyY. |
| Axial source |First native increment accepts explicit prescribed CA0; label that actual source. Friction-only Cd cannot become total CA. |
| Candidate rates |Explicitly named inherited dimensional rate couple for diagnostic dynamics; no relabeling static SB1 as rate-qualified. Missing rate data is not zero. |
| Recovery |Live canopy deactivates static airframe branch; identified canopy/rate composition; airframe coefficients N/A. No recovery fallback for unsupported ascent. |
| Zero speed |Static zero loads/nullable angles; nonzero-rate zero-speed support must be modeled explicitly or refused. |
| Candidate support |Every stage/read obeys its model support, including rejected trials, rail and negligible forces. No silent blend/fallback or truncated-success disguise. |
| Horizon |Exact candidate stop semantics; incomplete result has absent landing values and honest prefix peaks. Preserve old300s legacy semantics. |
| Evidence |Source/implementation/numerical/empirical qualification are separate. Already-exposed flights are development, not fresh holdouts. |
| Data |Read input-only eligible records; protect unseen outcomes/custody. Rights/public availability/as-flown fidelity are different checks. |
| Scope |No default switch, release, external contact, paid capacity or holdout release without applicable review/authorization. |

## Owner clarification: quality, not a prototype handover

[1.0 release bar](OWNER-1.0-RELEASE-BAR.md) records the owner's latest direction:
meaningful team design variation and useful end-to-end engineering, not one tuned
preset or asking customers to make the model trustworthy. Queen's was a
transcription error; no team partnership/data/acceptance is inferred. A possible
general/validated option does not authorize an experimental-only 1.0, arbitrary
confidence levels or a two-solver implementation. Missing empirical data blocks
the affected qualification claims, not all useful independent engineering.
No numerical budgets, acceptance statuses or release permissions changed.
The owner explicitly requires continuity with all prior discussion: integrate
this quality clarification into the existing roadmap/architecture and accepted
work, without restarting, inventing a new plan or making a mode split mandatory.

## Coordinator may decide without another permission loop

- Which bounded ready packet/available efficient model to assign, worktree names,
  exact module names consistent with contracts, local test/evidence locations.
- Small internal refactors preserving accepted semantics, local commits, focused
  rework and error-message/UI wording that does not change a product promise.
- Choice among source-supported candidate implementations after reviewing source,
  support, predictions and independent material-physics review. Record rationale.
- Whether an incomplete WIP fragment is useful or should be reimplemented in a
  clean worktree, while preserving the original patch/branch.
- Parking an external dependency and progressing independent work; preparing a
  request without sending it.

## Decisions still requiring evidence/explicit external input

- Exact API names are implementation choices; observation definitions, model
  composition, frames, null/support semantics and provenance cannot drift silently.
- No final universal percent-error target, flight-count requirement, interval width,
  coverage criterion or reset/release date is approved. RMP05 must derive budgets
  and sample design from actual mission reserves/measurements before RMP14 scoring.
- Qualification of damping, transonic/finite-angle behavior, weather, recovery,
  structural predictions and containment requires relevant measurements. A stronger
  model/agent or another simulator's agreement cannot supply them.
- Source export fields/units/axes must be verified from an actual permitted format;
  source data rights and applicable platform/executable access must exist.
- Owner/team approval is required for changed primary/companion promises, numerical
  acceptance budgets, external contact/spending/publication and new outcome access.

## Required decision record

Use `templates/DECISION.md`: question, evidence/source identities, options, selected
choice/rationale, alternatives rejected, support/qualification consequences,
reviewer, affected interfaces/tests and reopening trigger. No silent adjustment
of a frozen protocol; a changed model requires a new prospective validation round.
