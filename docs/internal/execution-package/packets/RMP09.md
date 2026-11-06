# RMP09 — Measured mechanics, propulsion, guide release and recovery

## Purpose/status and prerequisites

Remaining work, not implemented by this package. RMP01 common provider/driver and RMP05 eligible inputs/mission decisions for qualification. Analytic/source/contract work can begin before external data closes.

[RMP09a](../../execution-runs/RMP09-mechanics-invariants/RESULT.md): analytic invariants of the
legacy primitive mass/inertia model; review ACCEPT; **RMP09-C01 PASS** for that model
with declared inputs. Measured comparison (C07) open. [Evidence](../../execution-runs/RMP09-mechanics-invariants/EVIDENCE.json).

Bounded domain/error and explicit-only legacy-preservation checks
**RMP09-C06/C08 PASS** after author-independent coordinator review
(`cc79b11`). [Result](../../execution-runs/RMP09-domain-legacy/RESULT.md);
[evidence](../../execution-runs/RMP09-domain-legacy/EVIDENCE.json).
Temporal off-nominal validity, speculative-prefix folding, canopy support
boundaries and direct legacy summary/event bit preservation are verified.
Unsupported terrain/inflation/shock/multibody physics is not qualified.
Measured mechanics (C07), broader physical qualification and product
default/migration remain open.

## Required reading

Mission decision matrix and output-contract audit; core six_dof.rs mass/motor/guide/event/recovery primitives, mass.rs; actual models preparation, src/console/stages/Recovery.tsx. Preserve accepted guide-travel labels.
Also read [control loop](../CONTROL-LOOP.md), [checks](../CHECKS.md) and
[decisions](../DECISIONS.md). Repository source paths above are reading targets,
not permission to open raw protected outcomes.

## Owner/files and frozen decisions

Author Sol/high for cross-file/numerical work; coordinator leases exact files
and repins base at dispatch. Independent scientific review for material model/
statistical choices. At most one allocated compute job in this lane.

Lease mechanics/recovery modules and their adapter/event boundaries in small subpackets; source data ledger and permitted fixtures. Shared six_dof/models edits sequential. No unrelated aero coefficient/GUI migration changes.

Measured/as-flown values remain distinguishable from material estimates/reconstruction. Correct body inertia/rate ordering. No fitted ballast/motor timing to conceal aero errors. Per-section recovery mass/energy and actual release event govern claims; unsupported opening shock remains unavailable.

## Ordered subcommits / input-output contract

1. Audit actual carrier/mass/inertia/motor mounting/depletion assumptions against measured inputs, uncertainty and original frames/timebases; identify missing data separately.
2. Implement/verify mechanics only where justified. Preserve common gravity/thrust/depletion assembly identities and limiting/conservation cases; do not silently change legacy defaults.
3. Define rotational guide freedom from button/contact travel and appropriate thrust-rise/timing observation; keep final button departure separately labeled if different.
4. Define recovery state machine, actual trigger/latency/CdA/suspended section masses/terrain reference, permitted zero-rate/low-speed models and omitted inflation/shock physics.
5. Run synthetic event/failure tests, then eligible measured mechanics/guide/recovery comparisons and independent claim-specific review.

Each implementation commit records effective inputs, typed outputs, identities,
support/qualification and error/null semantics before dependent consumers change.
API names for future modules are proposals until the coordinator accepts a
source-specific contract; do not fill missing measurements/schema by guessing.

## Acceptance checks

- **RMP09-C01 — Mechanics:** Positive finite masses/inertias, physical CG bounds, frame/permutation/parallel-axis and depletion limiting cases pass with explicit source inputs.
- **RMP09-C02 — Motor/timebase:** Actual thrust curve, mounting/pressure assumptions and ignition/liftoff/burnout clock conventions recorded; no alignment to improve outcome.
- **RMP09-C03 — Guide event:** Effective button/guide travel defines first rotational freedom; source rule and speed observation use the same event/datum.
- **RMP09-C04 — Recovery sequence:** Drogue/main ordering, delayed/failed trigger, already-deployed flag and independent sections obey actual configuration.
- **RMP09-C05 — Section energy:** Correct suspended mass, descent/landing state and per-section energy; whole-vehicle number is not competition per-section proof.
- **RMP09-C06 — Domain/error:** Unsupported terrain/profile/recovery/canopy/zero-speed conditions explicit; no earlier unsupported airframe failure hidden by canopy.
- **RMP09-C07 — Measurement comparison:** Eligible mass/CG, guide speed/timing and recovery observations with uncertainty meet predeclared output budgets for claimed scope.
- **RMP09-C08 — Legacy preservation:** New mechanics activate only explicitly; old source behavior/results retained or a separately reviewed migration documents changes.

## Negative/failure cases

Motor outside carrier, multiple ambiguous mounts, impossible CG/inertia, stale thrust import, missing trigger timestamp, chute absent/live flags, incorrect AGL/MSL ground, split body mass mismatch, contact before nominal touchdown.

## Commands and portable evidence

Focused native mass/motor/event/guide/recovery tests, existing synthetic kernel fixtures and permitted input observations; no raw new outcomes without RMP14 authority. Claim-specific field tests require actual authorized team/platform access.

Use templates/RESULT.md and EVIDENCE.json. Save base/commit/source/runtime hashes,
input/assumption records, commands/logs, per-check pass/fail/blocked disposition,
failed attempts, independent review and exact remaining scope. Keep large/raw/
restricted artifacts separately inventoried; do not claim they are in Git.

## Stop/escalation and successor

Missing physical inputs/observation quality blocks qualification. Do not make examples pass by changing thresholds or inventing supported multi-body/terrain/shock capability.

Successor: RMP10 output histories/peaks, RMP12 numerical event checks, RMP13 uncertainty and RMP14 frozen scoring.

## Ready-to-send assignment prompt

> Execute RMP09 in a pinned isolated worktree using this brief and its reading.
> Confirm concrete input/output/source contracts and exact file lease before edits.
> Deliver the ordered small increments, exercise every listed acceptance/failure
> case and return portable evidence plus limitations/review-ready commits. Preserve
> legacy behavior and no missing-data fabrication. Do not expand into unrelated
> science/DTO/default/release work, open new holdouts, push or contact outsiders.
> Stop only the blocked dependency and continue useful independent authorized work.
