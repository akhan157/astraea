# RMP09-C03 — guide/button event gap

Status: **external / blocked; local note only.** No guide model or production
change was made.

## Requirement

RMP09 packet C03: “Effective button/guide travel defines first rotational
freedom; source rule and speed observation use the same event/datum.”

## Current implementation

- Rail exit is emitted when the along-rail position first reaches the declared
  `rail_length` (`six_dof.rs:844–856`), and `railExitSpeed` is the speed at that
  same event root (`docs/internal/output-dictionary.md:42`).
- The input contract carries only `rail_length_m` (`CandidateOptions`,
  `flight_provider.rs:141`). There are no forward/rear button positions, button
  spacing, effective travel, or a separate first-rotational-freedom event.
- The output dictionary itself discloses “modeled full release after configured
  guide travel” and “guide geometry and first rotational freedom are
  unresolved” (`output-dictionary.md:42`).
- The mission matrix requires effective guide travel plus forward/rear button
  positions, and states that IREC DTEG §5.3 is **25 m/s at first rotational
  freedom**, not necessarily the final button leaving
  (`collegiate-mission-and-decision-matrix.md:34`).

## Why it is external

The source rule and the observation datum cannot be established from the
repository: measured rail/button geometry and positions, effective travel,
launch-angle/ignition convention and a qualified speed observation are team/
platform data. Separating first rotational freedom from final release would
also be a model change, not a documentation fix, and is not authorized here.

## Local product

No pass is claimed. The note pins the current full-guide-release semantics and
discloses that `railExitSpeed` is not first-rotational-freedom speed. No test
was manufactured for a behaviour the model does not represent.

## Falsifier

- `railExitSpeed` (or the `rail_exit` gate) used as if it were the speed at
  first rotational freedom while the forward button left earlier.
- A speed observation defined at a different event/datum than the reported
  release.
- A measured button position/travel record that contradicts the current
  full-`rail_length` release.
