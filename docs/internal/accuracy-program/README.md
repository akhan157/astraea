# Collegiate accuracy research packet — A1/A2

Latest adapter delivery: [actual project geometry, quadrature review and source
eligibility](diagnostics/A1b-integration-review-2026-10-26.md).

Latest implementation: [unused SB1 static foundation, subsonic source fixture
and updater lifecycle checks](sb1-foundation-2026-10-26/README.md).

Latest bounded execution: [2026-10-26 coefficient contract, numerical diagnostic
and native updater evidence](first-batch-2026-10-26/README.md). These are separate
engineering gates; collegiate primary-use accuracy remains unqualified.

Current execution synthesis: [concrete accuracy path, experiments, dependencies
and gates (2026-10-25)](accuracy-execution-plan-2026-10-25.md). The older packet
below remains preserved as the initial proposal and source audit.

Prepared/accessed **2026-10-24** against Astraea `1745adb7265b642c6a7ecfd12e1418b51f159bcb`. Status: **proposed requirements, ready for coordinator review**. This packet changes no model, product behavior, public claim, or frozen validation rule.

- [Mission, decisions and outputs](collegiate-mission-and-decision-matrix.md)
- [Reference methods and evidence](reference-methods-and-evidence.md)
- [Comparison input contract v0.1](comparison-input-contract-v0.1.md)
- [Proposed acceptance specification v0.1](collegiate-accuracy-spec-proposed.md)
- [Source and exposure ledger](sources-and-exposure.json)
- [Recomputed RASAero table statistics](rasaero-table-audit.json)
- [Calibration diagnosis and independent review](diagnostics/independent-review.md)
- [Four-case production replay](diagnostics/D3-development-replay-summary.md)
- [Collegiate output-contract audit](diagnostics/collegiate-output-contract-audit.md)

The evidence supports a decision-based evaluation program, **not a collegiate 1.0 accuracy declaration**. The existing six-vehicle / ±10% per-vehicle median / ±5% equal-vehicle bias / 80% interval-coverage proposal remains preserved and unapproved as a complete collegiate specification. Competition limits are requirements on vehicles; they do not establish a simulator's error allowance.

The most consequential findings are:

1. Current ESRA materials are **2027 REV P1**, effective 2026-10-15. The older soundingrocket.org documents page still presents 2025 rules. Pin revision and clause, rather than calling either page simply “current rules.” The new DTEG's rail-departure event depends on the forward rail button, and its stability limits depend on vehicle length. These details can change the engineering conclusion even before prediction error is considered.
2. RASAero's published **3.47%** is consistent with a **signed per-flight average**, not mean absolute error. Recomputing the 36 published rows gives approximately **6.24% mean absolute error**. The reported within-10% and within-5% counts reproduce as 29/36 and 15/36. Some entries explicitly use postflight trajectory adjustments; these are useful reconstruction evidence but cannot be treated as prospective blind predictions.
3. Wind-tunnel aerodynamic coefficients, balloon/weather profiles, measured flight trajectories, and matched-drag cross-code results answer different questions. RocketPy accepts external drag curves; a RocketPy comparison using RASAero drag is not an independent validation of that drag.
4. No examined primary source establishes universal apogee, CP, rail-speed, load or landing-dispersion tolerances suitable for Astraea's collegiate promise. Proposed accuracy budgets must come from a documented team decision margin and qualified measurement capability.

Recommended next actions, in order:

1. Coordinator accepts the evidence distinctions and input contract for subsequent comparisons; reviews the proposed first mission and remaining tolerance questions without changing public scope.
2. Commission a bounded product/engine audit of **effective rail length/event definition**, **stability through burnout in both length-percent and calibers**, and **max-Q sample resolution**. This packet identifies contract risks, not reproduced runtime defects.
3. Obtain one precise as-flown input manifest and a rights-qualified dataset inventory through the coordinator. Outcome custody must be separate before new model-development work. Do not send teams requests without authorization.
4. Review decision budgets with a collegiate team and independent numerical reviewer. Freeze output tolerances, useful uncertainty widths, cohort/regime allocation, model/WASM hashes and predictions before scoring unseen outcomes.
5. Execute RASAero comparisons only after executable access and required nozzle/motor inputs are available. Run native-aero and matched-drag comparisons as separate experiments.

Verification performed: downloaded and hashed seven primary-source artifacts, inspected linked documentation and local output contracts, independently recomputed the published RASAero summary, checked document links/JSON and `git diff --check`. No simulator, installer or flight validation was run. Publisher ASCE full text returned HTTP 403; its methodological details remain unverified. Large RASAero manual required shell download after the web reader's size limit. Raw fresh flight logs were not opened; published outcome exposure is explicitly recorded.

## 2026-10-25 engineering diagnosis and review

- [Matched CP paths and timestep sensitivity](diagnostics/2026-10-25-engine-findings.md)
- [Independent CP review and signed-assembly specification](diagnostics/2026-10-25-cp-scientific-review.md)
- [Independent event-qualified coast refit specification](diagnostics/2026-10-25-calibration-event-refit-review.md)

These are diagnosis/method-conformance evidence, not a newly qualified
collegiate prediction envelope. Implementation and final checks are reconciled
in the [current delivery review](../delivery-review-2026-10-25.md).

- [Recorded pressure-peak retention and integrated checks](diagnostics/2026-10-25-recorded-peak-retention.md) — closes decimation loss only, not continuous peak accuracy.
