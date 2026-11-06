# Integrated delivery review — 2026-10-24

**Disposition: improved 0.9 beta preparation; collegiate 1.0 is not established.**
This run fixes confirmed data-integrity defects, qualifies calibration claims,
and establishes new source/runtime evidence. It does not improve or independently
validate the aerodynamic model. No release, main merge, deployment or remote push
was performed. Work is on the local `delivery/integration-20261024` branch.

## Resulting behavior

- Undo/redo restores the effective motor registry as well as the project. An
  undone import, replacement or thrust-curve edit no longer remains active in
  simulation/export behind the restored project view.
- New/Open/preset boundaries isolate session runs and late callbacks. A run is
  retained on reopening only when its exact persisted case identity/input key
  is present; matching geometry alone is insufficient. Preset undo restores
  terminal context without resurrecting pending work.
- Delayed saves cannot mark later edits or another document saved. Newer
  open/import intent wins, and committed edits invalidate pending reads.
  Background simulation completion does not cancel a deliberate file load.
  Storage optimistic concurrency and project schema remain unchanged.
- RockSim structural and attached sibling order survives parsing. Export and
  preview refuse unsupported mass/CG overrides, including explicit zero;
  imports refuse active or ambiguous override metadata/attributes. Existing
  geometry-only material/offset/staging limits remain disclosed. This is not
  a claim of full vendor interoperability.
- Calibration identifies velocity/altitude feature proxies, actual filter and
  speed support, vertical/unpowered assumptions and in-sample residuals. Long
  method details are expandable. Applied calibration is provenance, not a
  verified accuracy or applicability pass. Selection, coefficients and scale
  behavior did not change.
- Opt-in local startup tracing writes bounded native/pre-app event codes to a
  fixed launch-selected path. It captures failures before App imports succeed,
  without recording raw errors, URLs or project content. Default behavior is
  unchanged. It is instrumentation for the unresolved Windows issue, not a fix.
- Engine building follows Cargo's configured target directory. An actual
  custom-directory test reproduces the old missing-default failure and verifies
  the copied artifact against Cargo's output instead of a stale default file.

## Verification and artifact identity

Product code was verified at `cda5a0c` with subsequent build/harness-only fixes
through `ef09c87`. No Rust flight/aerodynamic source changed from `1745adb`.
The production WASM remains 1,179,073 bytes, SHA-256
`e4ab1b9d207f791734108c6a85e480da3660603a66fdb97101f9ff033efe0985`.

| Check | Measured result and boundary |
|---|---|
| Production build + TypeScript | Pass; final build 4.11 s |
| Frontend suite | 102 files / 1,314 tests passed, 72.19 s |
| Built Chromium journeys | Pass, 132.83 s; eight stages, persistence, supported imports/exports, refusals, seeded ensembles, 1,000 landings, calibration and sharing |
| Desktop Rust API/compile and unit tests | Pass in isolated Debian Linux image; 12 tests. No Windows/Mac execution implied |
| Standalone startup checks | Five Rust boundary checks and four Node page-script checks passed; Rust checks also occur in the desktop suite, not additional unique tests |
| Actual pre-app failure | Missing-module Linux Tauri fixture persisted `script_resource_error` and `root_empty_5s` through native IPC. Its deliberate 12 s timeout is expected, not an ordinary app pass |
| Embedded desktop smoke | Offline debug binary, no dev server, Xvfb/container: 533.076171 m apogee, Mach 0.291179, 18.898937 m/s rail exit, touchdown, WASM workers, no page errors |
| Four development flights | All recovered declared input hashes match; production replay reproduces existing residuals. No fresh holdouts or fitted input changes |
| Kernel baseline | Previously measured 108 core + 22 engine/parity tests remain applicable to the identical kernel/WASM; they were not relabeled as new final-commit test runs |

The [Linux verification recipe](verification/Dockerfile.linux) pins the base
image digest. It expects workspace/toolchain/Node mounts; its CA is a temporary
build secret, not an image layer. Native builds used the already verified
frontend bundle in a separate worktree and a read-only CLI dependency mount;
no host system packages or network policy were changed. The normal debug
binary was restored after the deliberate failure fixture and its SHA-256
matches the smoke-tested artifact.

Native smoke is **not** an installer, hardware-GPU, real desktop interaction,
signing, updater or macOS acceptance pass. The checker is named
`macos-smoke-check.mjs`, but this new run is Linux. The WebGL renderer string is
not hardware evidence. The verified production debug binary SHA-256 is
`acfc180512b5c8146255f32bc2159faa80ca819e27422d7c4ae8d3be35620bcb`;
the deliberate missing-module fixture is a distinct artifact.

Local raw logs/manifests, including failed checks and corrections, are under
`/workspace/astraea-plan/evidence/`. The first combined test run exposed a
background-result/load interaction and accidental Node-test collection;
Chromium additionally exposed an ambiguous Run locator and old calibration
labels. Those were corrected before the passing results above. Do not hide
those failures or weaken numerical assertions to obtain a green run.

## Accuracy conclusions and 1.0 requirements

The [research packet](accuracy-program/README.md) and
[proposed decision-based specification](accuracy-program/collegiate-accuracy-spec-proposed.md)
are accepted as research/planning evidence, not approved accuracy thresholds.
RASAero's published table mixes prospective/reconstructed conditions: its
3.47% signed mean is not its roughly 6.24% mean absolute error or a blind
collegiate acceptance standard. No reference executable was run.

The [calibration diagnosis](accuracy-program/diagnostics/D1-D2-calibration-findings.md)
and [independent review](accuracy-program/diagnostics/independent-review.md)
explain the 0.818/0.883 input/estimator differences. A lower fitted coast Cd can
increase apogee while reducing its own in-sample force surrogate residual; it
cannot repair the already excessive modeled altitude/speed before that window.
No ratio reversal, payload fitting, global correction or new physics is justified.

The [output-contract audit](accuracy-program/diagnostics/collegiate-output-contract-audit.md)
identifies remaining engineering work: effective guide-release travel, an
authoritative powered-flight CP/CG/margin history, and peak-load resolution.
The existing generic gates do not establish competition compliance. Calibration
physical eligibility/event-filter support and durable regime provenance also
remain open. Stored case summaries alone cannot reconstruct earlier variant
inputs; separately saved complete baseline/variant envelopes remain necessary.

New qualified as-flown inputs and protected outcomes, an actual team-led
reproduction session, Windows installed-app diagnosis, interactive Mac
acceptance, production signing and real-feed updates are still needed. Several
prior platform/comparator artifacts live outside this workspace and are not
independently accessible here. A concrete access-location request is pending.

Do not call the result 1.0 on the basis of these software checks. Preserve failed
and unscorable validation rounds, develop only on identified development data,
and freeze final-model predictions/criteria before opening future holdouts.
