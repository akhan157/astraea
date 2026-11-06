# Project status

## Reproducibility update — 2026-10-25

The [saved-input and engine-provenance review](delivery-review-2026-10-25-repro.md)
records immutable dispatch archives, schema 1.6 migration, explicit reload/re-run,
and exact runtime-byte identity. All 1,397 frontend tests, TypeScript, production
bundle and full Chromium acceptance pass. No prediction equations or accuracy
criteria changed; further accuracy tasks await the user discussion.

## Current execution update — 2026-10-25

See the [engine and calibration delivery review](delivery-review-2026-10-25.md).
Signed transition force/moment transport is repaired; explicit event-qualified
refitting and strict new-application provenance are implemented. These changes
do not establish collegiate accuracy or resolve the large development residuals.
Changes remain local and unpublished.

## Current execution update — 2026-10-24

The [integrated delivery review](delivery-review-2026-10-24.md) records confirmed
workflow/import fixes, qualified calibration claims, 1,314 passing frontend
tests, Linux desktop compilation/unit and headless runtime evidence, and the
remaining 1.0 gaps. Engine math and the production WASM are unchanged; no new
empirical accuracy is claimed. Changes are local; PR1/main/publication stay on
hold. The collegiate mission direction below remains in force.

## Project-wide readiness baseline — 2026-10-22

This section preserves the mission direction and pre-run evidence. Consult the
2026-10-24 execution update above for subsequently measured work. Older dated
entries below are historical evidence, not additional current promises.

**Primary users:** college rocketry teams. **Product goal:** a team can define a
mission, compare designs, record the as-built vehicle, predict a flight, defend
its decisions, and use qualified flight evidence to improve the next design.
Another member must be able to reproduce the saved configuration and result.
Version 0.9 is beta preparation; 1.0 is not an assertion that every model or
output is validated. Keep the repository private and PR1 unmerged; no tag,
production deployment or release publication without owner approval.

### Collegiate baseline — agreed direction, 2026-10-22

Aim for professional-grade engineering practice, not an unsupported claim of
professional-grade predictive accuracy. The first proposed evaluation mission
is a single-stage collegiate competition vehicle on a commercial solid motor,
with passive stability and dual-event recovery. This is a starting mission,
not a claim that its full flight regime is validated or a promise to support
every competition category.

**Team-led acceptance:** using an existing flown vehicle and archived log, a
team should complete these tasks without a developer operating the app:

1. Reconstruct the vehicle, identifying measured mass/CG, estimated geometry,
   motor data and launch conditions without silent source-feature loss.
2. Compare a baseline with a named design change; recover both configurations
   and explain the predicted change without claiming untested trend accuracy.
3. Save a reviewable result with version, inputs, assumptions, unresolved
   limits and provenance; another member reopens and reproduces it.
4. Compare qualified flight measurements without aligning away timing errors;
   distinguish input uncertainty, sensor limitations and candidate model error.
5. Apply any project-specific calibration with its labels, then demonstrate
   benefit on a subsequent flight/configuration not used to choose the fit.
   If that flight is unavailable, persistence may pass but predictive benefit
   remains unverified.

Record completion, developer interventions, lost information and decisions the
team could not support. Existing automated/native checks do not substitute for
this evaluation. Team recruitment, data access and sharing consent are still
needed; no outreach, private submission channel or team adoption is claimed.

**Next capability/evidence audit:** map this mission's geometry, motor,
speed/angle regime, atmospheric conditions, inertia and recovery decisions to
actual engine support and measured evidence. Assess the impact of cylindrical
dry inertia and surface-wind-only flight inputs before prioritizing changes.
Do not default the audience to small subsonic rockets because those are easier
to score. Keep the old proposed subsonic accuracy gate as a baseline, not as
evidence that the collegiate mission is covered.

Compare Astraea, RASAero and RocketPy using a versioned, common input record:
separate geometry-derived aerodynamics, supplied drag curves and flight-fitted
calibration. Match reference area, motor/mass/CG, atmosphere, altitude/time
datums and events before comparing outputs. Record software configuration,
source rights, mismatches and failures. Cross-code agreement is a diagnostic;
wind-tunnel and qualified flight measurements provide empirical checks.

Primary references: [RASAero's reported flight statistics](https://www.rasaero.com/home.htm)
and [wind-tunnel comparisons](https://www.rasaero.com/comparisons.htm);
[RocketPy's validation table](https://github.com/RocketPy-Team/RocketPy#validation)
and [EREBUS example with supplied drag/reanalysis](https://docs.rocketpy.org/en/latest/examples/erebus_flight_sim.html).
Their published headline errors are not an apples-to-apples ranking or targets
already met by Astraea.

**First controlled comparison executed:** production WASM, OpenRocket 24.12
and RocketPy 1.13.0 ran the already-examined synthetic NASA-style preset at
vertical/zero-wind conditions, plus three declared design/mass variants.
Baseline apogee: Astraea 557.177 m; native OpenRocket aero 547.297 m;
OpenRocket supplied Astraea drag 557.150 m; RocketPy supplied Astraea drag
557.242 m. Matching the actual 25-point flight drag tables brings all four
configurations within 0.1 m across engines. This diagnoses a largely
aerodynamic source for this low-speed cross-code difference; it does not
establish measured accuracy, transonic coverage, recovery safety or team use.
Prioritize qualified as-built inputs and phase-resolved flight diagnostics,
not an unsupported integrator rewrite or universal drag correction.

The frozen inputs, actual output files, rejected initial setup, source/tool
identities and reproduction harnesses are external:
`~/flight-data/collegiate-comparator-audit-2026-10-22/REPORT.md` and
`comparison-results.json`. RASAero executable and transonic comparisons are
unexecuted. The working motor lacks the nozzle geometry required for a fully
matched RASAero powered model; do not substitute case diameter or a different
same-name motor silently.

**Release decision:** 0.9 must provide useful, dependable core workflows, not
ask teams to repair an untrustworthy baseline. A collegiate 1.0 needs both
team-led workflow evidence and characterized predictions for the selected
mission. Preserve old protocols/results; date any new scope or thresholds
before examining new holdouts. No cloud collaboration, advanced category or
new physics feature is implicitly authorized by this product direction.

### Readiness by user outcome

| Area | Established evidence / capability | Gap and closure evidence |
|---|---|---|
| Define the rocket | Unified project state, schema 1.5.0, custom motors, supported freeform fins, undo/redo and migrations | Preserve mass/CG, units, motor and provenance through import/edit/save/open; refuse unsupported source features rather than changing the vehicle |
| Compute the supported model | Shared Rust/WASM authority, parity/component checks and prior hosted code CI on `c533828` | New-head hosted jobs are blocked by account billing. Numerical consistency is not empirical accuracy; keep model limits explicit and correct physics only from a diagnosed discrepancy |
| Improve prediction accuracy | Four distinct conditional development reconstructions now produce measured-versus-WASM residuals, with source/event identity and per-metric limits | Diagnose input/model errors before selecting a correction; these comparisons do not add independent validation or prove lower general prediction error |
| Understand decisions | Modeled/calibrated/unknown states, stale-result withdrawal and explicit verification gates; mixed mass/CG confidence corrected with real-engine and built-UI proof | Preserve confidence per quantity: all contributing part masses must be weighed before their sum is measured; calculated CG remains modeled |
| Exchange and retain work | Actual Linux file/dialog and calibration round-trip evidence on `f13abde`; rebuilt `890756a` traces keep matching-input freshness separate from failed safety gates and become stale after a real input edit | Reaccept current Windows files/dialogs; preserve snapshot and archive identity rather than treating revision numbers as simulation counts |
| Finish a real user session | Packaged Linux editing/history, evidence, Monte Carlo, keyboard/layout and corrected trace evidence; `c5ae34b` native selected-hour online forecast and offline profile preservation | Current Windows `2f28c65` NSIS installs but the initial native WebView is blank; feature acceptance is open. Automated accessibility-tree checks are not human assistive-tech review; native forecast success does not establish weather-model accuracy |
| Install, update and recover | Genuine Linux AppImage self-runtime launch on `890756a`; earlier offline rendering, AMDGPU activity and synthetic context recovery; current `2f28c65` Windows MSI/NSIS artifacts built, NSIS installed; earlier hosted Mac smoke | Windows render diagnosis and MSI install acceptance remain open. Continuation workers hit provider usage limits; VM is off and artifacts preserved. Interactive Mac acceptance, production signing and real-feed updater installation remain distinct gates. Synthetic WebGL loss is not a driver reset; self-extraction does not prove FUSE mounting |
| Maintain and communicate | Prior hosted code CI, current local proof, draft PR1, concise 178-word README and separate engineering records | Restore hosted verification after the owner resolves billing; do not substitute old ledgers, test counts or feature additions for closure evidence |

### Accuracy work inside the whole product

1. **Qualify data first.** Record units, logger schema, altitude/time references,
   source hashes, configuration and uncertainties before simulation. Qualification
   is per metric: relative/coast diagnostics can be useful when an absolute
   validation comparison is not defensible. Never infer units by agreement.
2. **Develop and diagnose.** Reuse already-examined flights openly. Run one
   nominal production-engine case and compare powered ascent, coast and event
   timing where measured. Sensitivity checks test explanations, not a search
   for undocumented mass/drag values that happen to match.
3. **Make a targeted change.** Require physical justification and before/after
   residuals across development cases. Keep project-specific drag calibration
   labelled and separate from an improvement to the general model.
4. **Judge independently.** Qualify future holdouts before freezing predictions.
   Preserve earlier failed/unscorable experiments. Input uncertainty, measurement
   uncertainty and model discrepancy are different; never widen a band after
   seeing the holdout to manufacture a pass.

The existing overlay's apogee-aligned display is useful for inspection but
cannot validate time-to-apogee: a development benchmark must retain event-time
errors and use a declared launch reference, not align away the discrepancy.
The proposed [1.0 targets](../road-to-1.0.md) are unchanged by this workflow
review; they are not claims already met.

### Ordered gap filling

1. **Delivered:** `pnpm benchmark:flight` admits declared development cases
   before simulation and produces real measured-versus-WASM reports, compatible
   baseline/candidate comparisons, and explicit blocked metrics. Timing errors
   are not aligned away; coast stops at measured apogee and descent is separate.
2. **Delivered:** mixed measured/computed mass totals and calculated CGs no
   longer claim to be measured. Three real-engine regression cases and the
   actual built UI verified the distinction; 15 affected tests passed.
   The physical contract now separates computational domain from empirical
   validation. Numerical physics and safe unknown/stale behavior are unchanged.
3. **Delivered:** two more distinct source-qualified development reconstructions,
   Top Shot and Adventurer. Use the four-case residuals to choose a physically
   justified next correction, not a universal fudge coefficient.
4. Rebuild beta packages and reaccept the complete product journey. This can
   test a named snapshot while accuracy work continues; only final release
   acceptance must match the final source and exact packaged artifact.
   Linux `f13abde` has native payload/file/workflow evidence; `890756a` adds
   actual package-runtime and corrected trace evidence. `c5ae34b` adds a native
   selected-hour forecast, explicit surface-wind application and offline
   preservation of saved profiles. Preserve the named package hashes and
   external reports rather than relabelling any package a new head.
   The native coast-extract calibration persists at scale 0.883, but its fit
   differs from the full-record estimate near 0.818 and increases modeled apogee
   from 372 to 396 m against a 291.7 m log. Reconcile inputs/window/method before
   using either fit as evidence for a general model change.
5. Close production signing/updater and interactive Mac prerequisites, then
   assess the supported 1.0 claims against fresh evidence.

### Development comparisons — 2026-10-22

Real-data smoke generated the following conditional development comparisons,
using the production WASM and original launch references. They are not fresh
holdout scores or proof that the general model became more accurate.

| Development case | Observed / modeled apogee | Signed apogee error | Apogee timing difference |
|---|---|---|---|
| Cosmic Cargo #2986 | 291.740 / 371.704 m | +79.964 m | +0.531 s |
| Mini DX3 G69N, 30 Jun 2017 #1 | 854.549 / 1173.937 m | +319.387 m | +1.361 s |
| Top Shot E12-6, 14 Dec 2017 #1 | 309.046 / 301.627 m | −7.419 m | −0.689 s |
| Adventurer J510W, 17 Apr 2021 #1 | 3197.291 / 3040.356 m | −156.935 m | −1.351 s |

Timing differences retain declared recorder clocks. Unknown ignition/recorder
offsets remain an assumption, not an independently measured model timing error.

Cosmic Cargo uses source-declared burnout at 1.887 s and apogee at 7.454 s:
powered-ascent altitude RMSE 15.166 m (736 points), coast 67.309 m (2,149),
and descent 168.861 m (6,706). The earlier 150.644 m "coast" figure
incorrectly included descent and is superseded. Full-overlap RMSE includes
recovery behavior and must not be interpreted as an isolated drag error.
Mini DX3, Top Shot and Adventurer have no source-qualified measured burnout,
so their powered/coast split remains unavailable. Their accelerometer-integrated
velocities are sensor diagnostics, not independent evidence of burnout.

Cosmic Cargo's flown mass, fin outline and weather are uncertain; Mini DX3's
per-flight mass/CG and launch conditions are incomplete. Reports retain these
assumptions, exact raw-log/WASM hashes, unit/reference sources, phase intervals
and point counts. No uncertainty band or missing input was fitted to force
agreement. Reproduction uses external raw files as described in
[Contributing](../../CONTRIBUTING.md); raw third-party logs stay outside git.

Top Shot's page/model CG disagreement and material/mass reconstruction remain
explicit. Adventurer's ogive tail is approximated by a supported conical
transition, with an anomalous fin-density source declaration; nominal Mach
1.064 is outside the proposed Mach <0.8 stable scope. Top Shot is nominal Mach
0.231. Both use the first recorded pressure only as a pad-pressure proxy, not
measured weather. Aggregate mass/CG are preserved without changing explicit
part overrides; any redistribution of unweighed estimates is recorded.

The rebuilt WASM (`5073875f…`) reproduced the old two reports with zero apogee,
timing and full-overlap RMSE deltas. A different positive Top Shot mass partition
with the same dry aggregate also gave zero altitude/time trajectory deltas in
that engine. This checks the representation under current cylindrical inertia,
not real component masses or empirical accuracy.

Local evidence: production build passed; 97 unchanged test files passed in the
full run, then all 16 affected tests passed after correcting the new mapping and
fixture. Typecheck, the four-case real-data command and production-WASM
mass-partition smoke passed. The original two-case code `c533828` passed
[CI 39811395696](https://github.com/akhan157/astraea/actions/runs/39811395696).
Later hosted jobs were refused at the account billing/spending-limit gate;
do not claim a new hosted CI pass from these local checks.

Only one delegated worker and one heavy operation run at a time. Cap compiler
and test workers at two; keep the VM off during local builds. Prefer the
existing project store, provenance/parser modules, production bridge and
acceptance harnesses over a second engine, store or verification framework.

## Historical entries (superseded as current status)

**2026-10-20 — validation-first release hold.** General v1 launch is on hold;
keep the repository private and installers in draft. The browser may remain an
experimental research preview. Independent flight validation and fresh native
desktop acceptance are release gates; software tests are not a substitute.
See [preview readiness and validation plan](preview-readiness.md) for current
checks, measured benchmark residuals and explicit gaps. Older dated ledgers
below are historical, not current deployment or accuracy claims.

**Blind flight validation (2026-10-21): failed, with a model fix.** A
pre-registered DOFPro Mini DX3 case found missing subsonic fin edge drag (now
added from the published Barrowman/OpenRocket build-up) and then over-predicted
three blind barometric flights by +6–10 % (all outside the predicted interval).
See [results](../flight-validation/mini-dx3-results.md).

**Coverage expansion (2026-10-20).** Chromium, Firefox and Playwright WebKit
passed actual UI journeys, every preset, a 1,000-flight ensemble, seeded repeats,
two-tab stale-save protection and forced WebGL loss/recovery. A draft Linux
AppImage and a newly built release binary rendered the baseline flight on an
isolated display. Fixed live readouts occluding the rocket and made unsupported
OpenRocket fins/mass/CG overrides fail closed. Frontend suite now passes 1,021
tests. Current production WASM reproduces the incomplete Cosmic Cargo case at
389.19 m versus 291.74 m (+33.4%); this is not independent validation. After
the fin edge drag terms (below) it is 371.70 m (+27.4%). Additional
public flight candidates, hashes and unresolved input contradictions are recorded
in [dataset screening](../flight-validation/candidates.md). Native Windows/macOS,
interactive desktop integration and defensible independent flight validation
remain open gates.

**2026-10-17 — unified integration landed on local `main` (not yet pushed to `origin`).** This is the current delivery entry point. Older audits and desktop acceptance records describe their named commits, not the Console cutover. Passing numerical checks is not flight-readiness certification.

**2026-10-17 — homemade-only cutover.** The closed-format (`.CDX1`/`.ALX1`) import/export modules, the calibrated aerodynamic engine and its design fixtures, all reverse-engineering tooling and corpus data, the associated benchmark suites, and the parity documentation were removed. The same cleanup removed the FinSim (AeroFinSim) vendor research material — `docs/re/finsim.md`, the extracted vendor theory PDFs and sample corpus under `extract/`, and the single vendored FinSim package descriptor under `reverse/native/` — together with the superseded `APPROVED` specifications (`docs/Astraea-design-doc.md`, `docs/astraea-master-product-spec.md`, `docs/astraea-ui-ux-design-spec.md`; archived in the private research snapshot) and the internal handoff/Colab-cell/phase-artifact files. Astraea now ships only its own aerodynamic and flight-dynamics implementation. Empirical validation is limited to independent public sources: the NASA ARCAS material and the public Estes/Altimeter Cloud flight; no comparison against a closed-source reference implementation is claimed, and the removed suites' passing status says nothing about the remaining engine.

## Release branch update — shared engine and website hosting

Local `release/v1` now includes the shared Rust WebAssembly engine for both
browser and desktop (superseding the browser-preview limits in the older ledger
below), cancellable worker-pool execution, IndexedDB project slots with legacy
migration/fallback, browser file-picker/download Save/Open, and debounced live
flight summaries alongside committed results. TypeScript engines remain test
oracles only.

Cloudflare Pages deployment replaces GitHub Pages; all three required secrets
are set. The release-branch preview deployed successfully, and its real Chromium
flight returned ~534 m apogee with no runtime/CSP errors. Live ThrustCurve
search/import and Open-Meteo retrieval also passed. The repeatable browser suite
now covers editing, persistence, exports, analysis and malformed-input refusal;
see [preview readiness](preview-readiness.md) and [hosting setup](hosting.md).
These are software checks, not empirical flight validation. CI checks
`release/v1` as well as `main` and pull requests.

**Auto-updates (2026-10-19).** The desktop shell registers the Tauri updater
and process plugins; the app checks the release feed once per launch and
installs only on request. A local release build signed `.deb` and AppImage
update artifacts with the generated key, and the packaged binary launched
headless with the full Console, live preview and engine flight (534 m). The
AppImage could not be launched on the build host (its desktop session runs
inside another AppImage and AppImageLauncher), so AppImage launch is left to
the owner's Linux acceptance.

Checks after the auto-update work: `pnpm test` 79 files / 1,002 tests;
`pnpm test:browser` passed (534 m under the production CSP).

Checks rerun after hosting setup: `pnpm build` (including TypeScript) passed;
`pnpm test` passed 78 files / 999 tests; built-site Chromium flight smoke passed
with no runtime/CSP console errors; `astraea-core` passed 105 tests;
`astraea-engine` tests (including summary/full-flight parity) passed;
`cargo check --manifest-path src-tauri/Cargo.toml --locked` passed. Existing
jsdom canvas and Node localStorage warnings remain in frontend test output.
No fresh platform installer build or live hosted deployment is claimed.

Still gated: Cloudflare credentials/project creation, owner-approved push and
public-repo transition, Windows/macOS desktop acceptance and platform builds,
and owner-approved v1 tag. Installers are not code-signed. Signed desktop
auto-updates are configured (the updater key secret must be added; see
[hosting](hosting.md)); OS file associations, cloud projects and optional
offline website support are not. Launch-lug/rail-button drag remains deferred pending validation.
Design-direction review remains an owner decision.

## Unified product

- `src/console` is the production Claude Console: Mission, Airframe, Motor, Aero, Flight, Recovery, Verify and Build. The old five-studio shell and its independent stores are retired. Committed projects, drafts, undo and motor records live in `src/state/project.ts`; request tokens and immutable run history live in `src/state/analysis.ts`.
- Rust is the runtime compute authority. TypeScript engines remain numerical oracles, not a browser fallback. Browser and desktop execute that Rust authority through WebAssembly workers; browser compute is no longer withheld.
- The run layer derives the aero method and launch site from the vehicle, rejects contradictory overrides, and validates motor resolution, mount ambiguity, solid bores and finite inputs before dispatch. Supported in-line geometry uses Astraea's own drag/CP build-up; other layouts use the generalized model. Layouts outside the supported envelope are explicitly refused, not hidden under larger tolerances.
- `simulate_flight` is the approved exception to coarse IPC: one bounded display trajectory, at most 5,000 samples, with endpoints and event neighborhoods retained. Monte Carlo does not record trajectories. Charts, attitude playback, sampled max-Q, flutter sampling, evidence comparison and KML consume that native record; they do not rerun a TypeScript solver or synthesize a three-point flight.
- Rust mirrors V8 arithmetic where one-ULP differences were amplified after rail exit. The `v8_math` source retains the upstream V8/fdlibm notices; no third-party binary is added.
- Schema 1.1.0 carries vehicle, workspace, motor records and evidence ledger, with explicit older-document migrations. Revisioned local Save/Open rejects stale writes. File imports are atomic and disclose geometry-only conversions. Reviewed exports freeze their inputs before confirmation.
- The rule-based copilot reads the unified case and native engine. Fixes require explicit acceptance and an unchanged whole-input key, and apply as one undo step. It makes no autonomous edits or certification claim.

## Model and evidence limits

The [physical contract](astraea-normative-physical-contract.md) remains the modeling reference. The only empirical validation is a single independent public flight comparison: the rederived Cosmic Cargo coast case recorded in [the real-flight evidence](../flight-validation/README.md) — one Estes Cosmic Cargo flight on an Estes C6-7 (Altimeter Cloud 2986) with estimated fin planform, two disagreeing public mass/length records and unrecorded launch conditions — plus the public NASA ARCAS wind-tunnel/flight material in [validation-arcas.md](validation-arcas.md). That record is a limited-case comparison and a regression pin, not a calibration and not general empirical validation of the aerodynamic model. Do not reuse superseded unscaled prediction numbers. No closed-source reference implementation is used, bundled, or compared against.

- Forecast/manual wind profiles are inspectable and persist in the project as weather snapshots (before 2026-10-18 they lived only in the Weather panel and were lost on navigation or save). The current native flight contract uses a surface vector, not a layered atmosphere. Applying the profile's surface wind is explicit.
- Max-Q and minimum flutter ratio shown from the bounded trajectory are **sampled** extrema, not continuous-time bounds. Missing or non-nominal touchdown never produces a passing landing gate.
- Evidence checksums, review state and linked input keys are local workflow provenance, not signatures or a calibration signoff. A fitted Cd candidate is not silently applied.
- The negligible-aerodynamic-force validity rule changes an envelope qualification near apogee, not the trajectory forces. Historical validity totals must be tied to their source commit.
- Windows MSI installation and empirical flight validation are distinct from Linux debug-window and browser smoke evidence. Historical Windows acceptance is not claimed as a fresh Console retest.

## Verification ledger

**2026-10-18 — 1.0.0 release candidate (homemade-only tree, Linux x86_64).** Measured on this tree, superseding the pre-cutover ledger:

- `pnpm exec tsc --noEmit`: clean.
- `pnpm test`: 75 files, 970 tests passed.
- `cargo test` in `crates/astraea-core`: 104 passed, no compiler warnings.
- `cargo test` in `src-tauri`: 18 passed (16 unit, drag-Cd-scale parity, telemetry parity).
- `node scripts/emit-benchmark-metadata.cjs`: emitted.
- `pnpm tauri build --bundles deb,rpm`: produced `Astraea Workstation_1.0.0_amd64.deb` and `Astraea Workstation-1.0.0-1.x86_64.rpm` (4.4 MiB each, with bundled fonts). `beforeBuildCommand` rebuilt `dist/` first.
- The release binary, launched on a headless X display with nothing listening on the dev port, rendered the Console from embedded assets and its native engine produced the NASA Student Launch flight (534 m apogee, Mach 0.29, 18.9 m/s rail exit), matching the earlier debug-window figures. This was re-checked with the content security policy enabled. ThrustCurve/Open-Meteo requests and export downloads were not exercised under the policy.
- The browser build (`vite preview`, headless Chromium) shows the preview banner with the desktop download link. In the browser the 3D vehicle, masses and stability are empty by design: the layout comes from the native stability engine.

Not established by this ledger: the full [desktop acceptance checklist](desktop-acceptance-checklist.md) on this commit, a Windows MSI build/install, macOS bundling (the `release.yml` workflow builds both but has not run yet), and any empirical flight validation beyond the single record above. The pre-cutover 2026-10-17 ledger (85 suites) measured a tree that still contained the removed suites and is not evidence for this one.
