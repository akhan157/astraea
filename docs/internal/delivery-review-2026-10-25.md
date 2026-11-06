# Engineering progress — 2026-10-25

This dated checkpoint is retained as history. Later [saved-input reproduction and
engine provenance](delivery-review-2026-10-25-repro.md) supersedes its open variant
archive/binary-provenance statements. The [current-source Linux smoke](delivery-review-2026-10-25-native.md)
records the subsequent embedded desktop check and its platform limits.

The signed aerodynamic assembly and explicit event-qualified calibration refit
are integrated locally. These are method-conformance and workflow improvements;
collegiate 1.0 accuracy is still not established. Nothing was pushed or released.

## Engine findings and repair

Matched-condition CP plots and flight calculations disagree; their competing
Mach laws remain unselected. Independent review identified a separate concrete
error: flight preparation discarded negative transition contributions. The
repair preserves signed force slopes and first moments, including cancelling
groups, and rejects unsupported/ill-conditioned total slopes before deriving CP.
It retains the existing flight Mach weighting and drag-axis definitions.

A native diagnostic evaluator calls actual production preparation and loads.
For the controlled boattail, low-speed CP changes from 2.390572 to 2.446661 m,
matching signed Barrowman assembly. Native/TS comparison covers 72 controlled
states, with maximum xyz force difference 1.14e-13 N. This is implementation
agreement, not independent aerodynamic validation.

All four final-workspace development replays match the post-repair lane metrics.
Cosmic, Mini DX3 and Top Shot are unchanged; Adventurer apogee increases 0.007922 m.
The existing roughly +80 m/+319 m discrepancies remain unexplained. Macro-step
refinement changes those two apogees by centimeters, without establishing a full
numerical error bound. Source/input uncertainties and force-coefficient/Mach
model qualification remain open.

## Calibration and outputs

New application requires declared event, motion and mass evidence for both
trajectories. Default previews retain their original numeric behavior. An
explicit event-qualified refit discards whole original smoothing neighborhoods
that overlap thrust/recovery; it never clips the input before smoothing, tunes
event times or optimizes against apogee. Versioned provenance records selection,
counts, support, source declarations and input identity. Old adjustments remain
applied with unverified status; no silent migration/refit occurs.

On frozen pre-repair WASM, Cosmic's diagnostic scale changes 0.883167 to
0.882839; hypothetical apogee increases another 0.074462 m. Flown motion/mass
remain unverified, so this is not an approved real-flight calibration. The fit
also does not qualify powered drag or other speed/attitude regimes. Engine binary
identity is not yet part of calibration persistence.

Rail input now states effective guide travel and its geometric limits. Stability
is explicitly geometry-only with optional percent-length conversion. Sampled
Max-Q records observed sample timing without a continuous-peak error promise.
Generic thresholds are unchanged and do not establish competition compliance.

## Verification boundary

Full core: 112 tests passed. Lane engine/native parity: 25 tests passed; affected
Vitest: 57 passed. Calibration: 59 focused tests plus six frozen-WASM tests passed.
Integrated TypeScript and production frontend build passed. Final frontend/browser
reconciliation is recorded in the execution evidence and appended below.

Root production WASM SHA-256:
`b20775542b5b3ee7f87d3234d69af5c2b1c8a307757b05924d332f173d143788`.
Its four replay metric sets exactly match lane post-repair metrics despite a
different binary hash. Lane hashes and pre-repair artifacts remain distinguished.
No fresh holdouts were opened. Logs, failures and source/artifact manifests are
under `/workspace/astraea-plan/evidence/`.

Remaining gates include coefficient/Mach model qualification, complete variant
reproduction and binary provenance, protected as-flown validation, team-led
acceptance, and installed Windows/Mac/signing/updater verification. Prior Linux
native smoke is historical evidence; it is not a new desktop pass for this build.

### Integrated acceptance

Production TypeScript/build passed; full Chromium acceptance passed in 126.185 s
under production CSP using system Chromium. This includes real-log refusal,
explicit event-qualified synthetic application, browser/file save and reopen,
removal, all exports/imports and the 1,000-flight seeded ensemble. Synthetic
workflow results are not empirical flight accuracy evidence.

The first full frontend run found one obsolete unconditional-application test
(1,355 passed, one failed). Its replacement verifies real-log refusal and legacy
retention/removal; the focused Evidence Studio file passed 21 tests. The final full
suite passed: 106 files / 1,357 tests in 74.575 s. Failed sandbox metadata/listen attempts and missing default
browser-cache logs remain preserved; permitted local execution and the existing
system Chromium resolved those environment restrictions without product changes.
