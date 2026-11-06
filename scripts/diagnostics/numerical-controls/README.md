# N1 numerical diagnostic seam

This code prepares a generated external shadow of base
`00e768b2d2dcfc9913b2a9428040a67fd42d3d58`. Production files are unchanged.
Evidence is retained at
`/workspace/astraea-plan/evidence/accuracy-first-batch-20261025/N1`.
The prior build and 90 analytic cases are complete: do not rerun `prepare`,
`build`, or `analytic` while resuming this packet.

`review.py` makes a write-once review manifest from retained evidence, without
running the binary. It verifies every copied production file against base Git,
the complete generated source inventory, every declared edit's inverse, the
appended analytic source/root-body identity, and the recorded build and analytic
hashes. `run.py verify` checks the sealed files and complete current ledger.
Review-manifest identity does not grant permission: root must approve its digest
before `run.py run --approved-manifest SHA256` is invoked.

One historical discrepancy requires explicit root review: the preparation-time
hash of `numerical-controls.py` is `91278340…`, while its retained bytes on this
resume hash to `7f642a5d…`. No copy of the earlier preparer bytes is available.
The call manifest is preserved unchanged. The compiled main/appendix match
their original hashes, and the independent reconstruction verifies the actual
generated source without relying on historical preparer identity. The review
manifest records both complete hashes and this limitation.

## Source seam and provenance

The native main calls `astraea_engine::dispatch("simulate_flight", wire)` exactly
once in flight mode. The copied engine dispatch, frontend preparation, motor,
mass/aerodynamics, loads, event predicates/order, output conversion, and data are
unchanged. Only `astraea-core/src/six_dof.rs` has a generated production-prefix
diff; its exact before/after anchors and every source hash are in
`call-manifest.json`. Removing those edits recovers the entire original file.

Two tolerance declarations become separate ordinary/event control lookups.
Three adaptive integration call sites become wrappers that set a counter phase:
ordinary macro endpoints, exact-time burnout, and event-crossing reintegration.
The wrapper delegates unchanged arguments and returns the original result.
One event-root time tolerance becomes a control lookup. Counters observe trial
attempts, acceptances, both rejection paths, event-root bisection iterations,
and quaternion norm checks. Counters use thread-local storage and never feed
back into numerical decisions. They count all work, including event-restart
probes discarded later; they do not count uniquely committed steps.

The production DP arithmetic and piecewise cubic Hermite dense output are
unchanged. The fixtures call those same integrator/dense functions, sample three
off-node fractions per accepted step, and separately use the production root
bisection body copied verbatim. Its right-end root convention is retained.
The synthetic root helper is uninstrumented, so its reported root-iteration
counter is zero; the whole-flight event-root counter is instrumented.

Only four previously frozen request wire DTOs and their full expected WASM DTOs
are admitted. Their file digests, origin raw-result digests, and frozen WASM
digest are retained in the call manifest. No observed trajectories, source CSVs,
new observations, or additional WASM calls are needed. This packet does not
assert physical accuracy or primary-use suitability.

## Predeclared gates and execution

The existing manifest fixes 20 maximum native attempts: four defaults, eight
calls at ordinary/event tolerance scales 0.1 and 0.01, then eight calls retaining
scale 0.01 with root tolerances 1e-6 and 1e-7 s. Macro output step stays 0.01 s;
maximum adaptive step stays 0.05 s and initial step 0.005 s. Event-tolerance
comparisons must be made against the scale-0.01 integration run, so the root
effect is isolated. Every tightened call requires all four defaults to pass.

Default native/WASM comparison traverses every full DTO field recursively.
Object keys, array lengths/order, strings, booleans, and nulls must agree;
numeric tolerance applies only to numeric values. Coarse and terminal scalars
use absolute 1e-8 plus relative 1e-10, telemetry times use 1e-9 s plus relative
1e-12, and telemetry quaternion components use absolute 2e-12. Rounded
nonterminal telemetry channels must match exactly. All differences are retained.
Any parity/schema/process/engine/resource failure stops for root review;
budgets are computational reproduction gates, not physical error bounds.

The runner holds an exclusive file lock and fsyncs an attempt reservation and
directory before launching a process. A failure or interruption consumes that
ordinal; it is never retried. Successful resume requires contiguous planned
ordinals, unchanged requests and result/stderr/parity hashes, and no unledgered
numbered artifacts. A lost reservation or orphan file stops automatic progress.
`--through 4` can stop after defaults without changing the authorized plan.

Each flight uses CPU 1 via taskset and polls process-tree resident memory every
20 ms, terminating on an observed total over 2 GiB or 120 s. These sampled peaks
can miss brief excursions; there is no claimed kernel-enforced RSS cap. Source
`/workspace/astraea-plan/env.sh` and set `CARGO_BUILD_JOBS=1` for any separately
authorized build. Existing recorded build child peak RSS is 267956 KiB; its
tree-sampled peak is only 20964 KiB and is not the build's authoritative peak.

The five flight-free Python tests cover full frozen DTO traversal, type/schema
and numeric budgets, interrupted reservations, duplicate/orphan records, and
artifact integrity on successful resume. They execute no native or WASM flight.
