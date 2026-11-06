# RMP06b independent review

Independent read-only Codex/OpenAI gpt-6.1-sol, high effort; serial separate sessions, no author edits or executed builds/tests. Runtime transcript headers record the installed routing; no different-model consensus claim. Source reviewed cfdded2; later 2997a35 adds only the independently executed Python checker.

## Contract

**ACCEPT bounded preimplementation contract.** No required contract corrections in [ASSIGNMENT.md](../../../../docs/internal/execution-runs/RMP06-profile-bridge/ASSIGNMENT.md#L5). Reviewed against base `8a63a0147665f6f3554f6a2a8af6921d07ba8f03`; this accepts the proposed bridge, not its future implementation.

- **Time:** The frozen split is sound: finite `0 ≤ elapsed < 2^53`, floor/fraction separation, checked integer epoch addition, and fractional validity before integer sampling. Requiring fraction zero at `validUntil` prevents expired fractional queries from becoming valid through flooring, without converting the epoch to `f64`.
- **Altitude/datum:** AGL state plus explicit launch geometric-MSL altitude is coherent. Exact vertical-datum identity matching must occur in the bridge: [E1 sampling](../../../../crates/astraea-core/src/environment.rs#L140) checks the altitude enum but has no query datum-identity field.
- **Actual consumption:** Immutable ownership, source-ID agreement, prescribed CA0, and shared trajectory/query/curve evaluation are appropriately bounded. Cover composition, curve sampling, and the easily missed [landing assembly call](../../../../crates/astraea-core/src/flight_provider.rs#L1282). Profile validation must precede load shortcuts for zero speed, rail, canopy, and negligible forces.
- **Evidence:** Existing [native equivalence checks](../../../../crates/astraea-engine/src/native_candidate.rs#L569) compare coefficient wrenches only. The assignment correctly requires stronger evidence: density-sensitive dimensional loads, wind-sensitive flow/trajectory, and matching E1 observations/identities. P/T/μ/Re provenance does not establish integration of the local axial source.
- **Mechanical seam/burnout:** The private extraction is feasible while retaining legacy arithmetic. Burnout must use evaluator-derived air-relative Mach under an explicit **profile-only** selection; selecting every bounded candidate would alter RMP01 behavior. The current [burnout atmosphere read](../../../../crates/astraea-core/src/six_dof.rs#L2356) is explicitly covered by the lease.
- **Claims:** C04 advancement, prescribed-source-only C07 evidence, and native preservation evidence for C08 remain honest. C05 stays unrun, local-source startup stays blocked, product migration/reopening stays unactivated, and parent RMP06 remains partial.

No edits, builds, tests, network access, or datasets used.
## Implementation

**ACCEPT** — no consequential new bridge defect or required fix found at `cfdded240c5dd4f3e58935b96ac9fdf251290549` versus `8a63a0147665f6f3554f6a2a8af6921d07ba8f03`.

Read-only review confirms:

- Integer epoch addition is checked; fractional elapsed time remains separate, including rejection beyond the inclusive validity endpoint.
- Launch geometric-MSL plus state AGL is finite-checked; datum identity must match exactly.
- Profile evaluations precede load approximations. Speculative-stage refusals propagate without fallback. Landing and burnout reads use the selected profile.
- P/T/μ/Re provenance comes from actual E1 evaluation; toward-ENU wind is subtracted once. Attitude normalization preserves consistent flow and pressure semantics within floating-point roundoff.
- Query shares trajectory composition; curves reconstruct flow and reevaluate E1. Source ownership is immutable, IDs are checked, and the wrapper retains complete effective input.
- Axial input remains explicitly prescribed CA0. Engine exposure is native-only, with no dispatch/default activation.

Acceptance covers this prescribed-source bridge only. Local-source startup, cache, product integration, and physical qualification remain partial/open.

No edits, builds, tests, datasets, or network access. The reported 183 core/73 engine tests and byte-identical legacy/RMP01 reports were not independently rerun.

Only machine-local link destinations were normalized for portability; dispositions otherwise retained.
