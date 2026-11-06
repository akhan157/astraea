# RMP06b — accepted native actual-E1 profile bridge

Base `8a63a0147665f6f3554f6a2a8af6921d07ba8f03`; current existing isolated branch
`execute-rmp01-package-c80e7d3`. Source: `03c7618` core bridge/mechanical seam,
`cfdded2` native selection, `2997a35` independent checker. No other worktree touched.

## Completed bounded scope

One immutable supplied E1 profile now actually supplies P/T/rho/a/mu, toward-ENU
wind, airspeed, Mach, q and Re/m through native candidate trajectory stages,
load queries and static curves. The shared mechanical assembly does not compute
legacy atmosphere/shear on the profile path. Landing reads and profile-only
burnout diagnostic use that selected environment too. Every profile read checks
coverage before zero/negligibility/rail/canopy load shortcuts. Failures retain
stage/phase/state/model context; no fallback.

Fractional stage-time validity uses a checked integer epoch plus separate
fraction, not a rounded f64 UTC timestamp. At validUntil only fraction zero is
accepted. Elapsed time must be finite, nonnegative and <2^53 seconds. Profile
values are time-constant within declared validity, so integer-floor sampling
occurs only AFTER fractional validity is checked. Altitude is explicit launch
geometric-MSL plus state AGL, with exact vertical-datum identity agreement.
Negative MSL is permitted when explicitly covered; no legacy altitude clamp.

Native-only strict selection/helper/example retains the full effective profile
and candidate inputs, source/model IDs and per-read E1 observations. Old native
request/default path does not activate profiles. No dispatch, schema/project/UI,
frontend or generated WASM activation.

## Important boundary: parent RMP06 still partial

Axial source here is the already-explicit prescribed CA0, not the low-Re-limited
RMP06a local total source. There is no automatic blend or Re floor. That local
source needs a reviewed startup/source-support extension; measured source and
physical qualification remain RMP02/RMP08. Cache policy/budgets remain unrun
(C05); parent C07 now in_progress (prescribed source bridge evidenced, local
source not integrated); C08 product reopen/migration unactivated and partial.
C04 native profile semantics passes. No new empirical, source-qualified weather,
nozzle/damping/recovery or launch-accuracy claim.

## Fresh evidence

- 183 core tests,73 engine all-target tests; examples build.
- Six new core tests exercise fractional endpoints, epochs >2^53/i64 overflow,
  MSL/AGL/datum, wind signs, coverage under shortcuts, changed dynamics, shared
  consumers, contextual failure and profile burnout Mach. Three native boundary
  tests exercise real requests, effective provenance and strict failures.
- Nine independent Python native cases recalculate all 201 committed samples'
  pressure/rho/mu/Mach/q/Re and axial force; verify query/curve equality, actual
  changed dynamics despite unchanged source label, rejection and expiration.
- Legacy response and RMP01 native report remain byte-identical:
  `f37d195f…` and `a8b08ccb…` respectively.
- Direct query and trajectory environment/load observations are exact. Curves
  reconstruct velocity from Mach/direction and reevaluate E1; numerical equality
  uses explicit f64 roundoff tolerances (2e-12 in Rust,3e-12 in Python), not a
  physical/numerical trajectory qualification budget.
- Independent high-effort read-only Codex/OpenAI gpt-6.1-sol review ACCEPT at
  `cfdded2`; no required implementation changes. Reviewer ran no builds/tests.
  Contract also independently accepted before implementation. Separate sessions
  are independent authorship review, not different-model consensus.

## Failed attempts / limitations / availability

Initial core test compile attempted PartialEq on existing non-PartialEq wrench/
identity types; tests corrected to compare meaningful fields, no core math change.
The first synthetic wind-change test was exactly on the 5deg rail incidence
boundary and a speculative stage correctly refused it. The refusal is retained
as a test; the supported scenario explicitly points wind along the rail instead.
No support threshold or vehicle model was relaxed. Rustfmt remains unavailable;
no formatter success/installation claimed.

Portable evidence: fixture, checker, tests, REVIEW.md, native-checks.json and
EVIDENCE.json in this run directory. Raw reports/logs/transcripts external at
`/home/ak/.paseo/worktrees/3s8t98rp/evidence-rmp06-profile-bridge/` (not Git).
One serial reviewer at a time, one Cargo command with two compiler/test threads,
~10GiB available measured before work. All commands/reviewers finished; no task
server/watch/browser/background build remains, lease released at checkpoint.
Author model installed OpenAI gpt-6.1-sol; reviewer same installed model/high in
separate read-only sessions; no usage-limit/reset or cost telemetry supplied.

No new flight outcomes, holdouts, source acquisition, external contact, paid
capacity, push, main merge, tag, release or deployment. Existing automation
remains disabled. User explicitly requested autonomous continuation through the
roadmap unless owner input is actually required; do not ask for routine starts.

## Next action

Park RMP06 local-source startup/physical qualification honestly, retain this
useful profile bridge. Continue unblocked RMP02 retained-source eligibility and
availability ledger at current accepted head; read its required source/rights/
geometry records before any bounded extraction. RMP03 source/schema work and
RMP04 platform/updater-plan review remain independently actionable when their
actual inputs/capabilities are available. No default/product activation or
qualification shortcut is authorized.
