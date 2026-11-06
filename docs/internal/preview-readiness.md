# Research preview readiness — 2026-10-20

## Release decision

**General v1 launch is on hold pending independent flight validation.** Keep
installers in a draft release and the repository private until owner approval.
The browser research preview may remain available. Passing software tests,
model gates, or implementation parity is not evidence of flight readiness.

Preview: https://release-v1.astraea-5e2.pages.dev/

Windows MSI/EXE, Linux AppImage/deb/rpm and Intel/ARM macOS artifacts were built
successfully by [Release run 39433642774](https://github.com/akhan157/astraea/actions/runs/39433642774),
from `ca7de5d`. They remain unpublished. This is packaging evidence, not native
installation/acceptance evidence. Later preview UI changes are not in those
installers.

## Software checks

The expanded frontend suite passed 1,021 tests across 80 files. `astraea-core`
passed 105 tests; the engine crate passed 16 command unit tests, one parity
integration test and two telemetry integration tests. Production ARCAS runtime
checks passed two tests. The build (including TypeScript) passed.

The browser acceptance suite now exercises real WebAssembly and actual UI:

- Landing page at phone width, experimental disclosure and expandable validation
  record without private-repository access.
- All eight stages, committed flight and baseline ~534 m apogee regression.
- Staged geometry edits, apply, undo/redo and refusal to export stale flight KML.
- IndexedDB save/restore after edits and page reload.
- Sorted wind CSV ingestion and preservation of prior data after malformed CSV.
- Ten consecutive export downloads: project JSON, RKT, ORK, STEP, STL, SVG, ENG,
  RSE, PNG and KML. Nonempty bytes are checked; format correctness additionally
  relies on the format unit suites, not this download check alone.
- Project and OpenRocket import round trips; malformed JSON preserves the project.
- Ten-flight Monte Carlo completion and cancellation with partial results discarded.
- Millisecond/feet flight-log ingestion and resampling into SI units.
- Chamber/nozzle and BATES grain computation; edited thrust curve saved as a new motor.
- No unexpected browser runtime, console or CSP errors across these journeys.

Expanded acceptance also passed in Chromium, Firefox and Playwright WebKit:

- All three presets complete flights (software regression values: Alpha 299 m,
  NASA Student Launch 533 m, Spaceport 5124 m after the 2026-10-21 fin edge
  drag terms; previously 311/534/5124 m; not accuracy evidence).
- Full 1,000-flight NASA ensemble completes with 1,000 landings; navigation stays
  responsive. A repeated ten-flight seed reproduces plotted points exactly.
- Real two-tab IndexedDB stale-save refusal preserves the newer tab's document.
- Forced WebGL context loss preserves readouts; restoring the viewport succeeds.
- At 1280×800, live readouts no longer cover the canvas in Airframe or Aero.
  Camera framing now accounts for viewport aspect ratio. A captured image also
  confirms the complete rocket is visible; this is not a rendering golden test.
- Unsupported OpenRocket fin shapes and mass/CG overrides are refused through
  the actual UI without replacing the current project; eight synthetic parser
  cases cover these refusal paths without redistributing third-party files.
  Supported mass overrides (including fins) now survive round trips; explicit
  zero values are preserved for validation instead of silently replaced. ORK
  export also refuses multiple fin sets or attachment order it cannot preserve.

Firefox ran natively on the Linux host. WebKit ran in the isolated official
`mcr.microsoft.com/playwright:v1.64.1-noble` container (image digest
`sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`),
with read-only source/dist and temporary browser/config files. This is browser
engine coverage, not a claim of native Safari/macOS or Windows Edge acceptance.
CI now reuses one built site on one runner for all three browser steps. It
neither rebuilds per browser nor consumes artifact-storage quota (an initial
artifact-sharing attempt hit the repository's existing GitHub storage limit).

The draft Linux AppImage from `ca7de5d` launched on an isolated Xvfb/DBus session
using extraction mode, without a development server. Its rendered workstation
showed ~534 m apogee. A newly built Linux release binary also displayed the
research warning and baseline flight. Software rendering and isolated HOME/XDG
directories were used; this does not establish installer integration, hardware
GPU behavior, native file-picker operation, or updater installation.

Live checks on the deployed `64eb22e` preview additionally passed ThrustCurve
search **and** motor download/import, Open-Meteo forecast retrieval, and an
intercepted ThrustCurve transport failure that surfaced an error without
fabricated results. External services are not required by the repeatable CI
suite; their availability can change.

Reproduce local acceptance after `pnpm build`:

```sh
CHROMIUM_PATH=/usr/bin/chromium pnpm test:browser
```

Re-run the same suite against the deployed preview, without replacing its CSP:

```sh
ASTRAEA_PREVIEW_URL=https://release-v1.astraea-5e2.pages.dev/ \
  CHROMIUM_PATH=/usr/bin/chromium pnpm test:browser
```

Each run uses an isolated browser profile, not the user's saved projects.
Browser Save downloads are exercised with the file-picker API disabled only in
that test profile. Native save dialogs and the browser file-picker UI are not
covered by that fallback test.

## Current empirical evidence, not a release pass

Reproduced `pnpm benchmark:arcas` on the release-branch engine sources:

| Comparison | Result | Limit |
| --- | --- | --- |
| ARCAS-short subsonic corrected non-base drag | 11.2% relative MAE, 2 points | One geometry/regime |
| ARCAS-long subsonic corrected non-base drag | 4.9% relative MAE, 2 points | One geometry/regime |
| ARCAS-short transonic corrected non-base drag | 15.7% relative MAE, 4 points | One geometry/regime |
| ARCAS-long transonic corrected non-base drag | 13.8% relative MAE, 3 points | One geometry/regime |
| ARCAS CP | 4.6 percentage-point MAE, 19 points | CP is not trajectory validation |
| NASA/TM-2005-213541 configuration 3 | 16.3% relative MAE, 7 points | Report-only; already examined, not a blind holdout |

There is no comparable base-corrected ARCAS supersonic drag score in that
benchmark. Excluded/quarantined readings are not counted as successes.
Production runtime tests establish agreement with the implementation being
benchmarked; they do not independently validate the equations.

The [Cosmic Cargo flight](../flight-validation/README.md) remains a candidate,
not completed flight validation: estimated fins, disputed mass/dimensions and
missing launch conditions. A new test through the actual production bridge and
shipped WebAssembly reproduces **371.70 m vs 291.74 m (+27.4%)**, with burnout
velocity 113.43 m/s vs the previously derived 83.434 m/s (after the 2026-10-21
fin edge drag terms; previously 389.19 m, +33.4%). No mass or drag scale
was fitted. Historical +54% errors and fitted payload/drag results must not be
relabeled as current independent accuracy evidence.

**Pre-registered blind test (2026-10-21): failed.** The Mini DX3
[protocol](../flight-validation/mini-dx3-protocol.md) froze inputs and an
owner-chosen rule before prediction; the [result](../flight-validation/mini-dx3-results.md)
over-predicts three blind barometric flights by +7.0 %, +6.1 % and +10.2 %,
each outside the input-uncertainty interval. The development case on the same
airframe family found and fixed missing fin edge drag (published terms, no
fitting) and still over-predicts by +32 %. Launch readiness remains gated on
validation.

[Public dataset screening](../flight-validation/candidates.md) identified DOFPro
repeat flights and RocketPy-hosted team records. Seven downloaded files were
hashed, but no new flight was promoted to validated status: input contradictions,
ragged sensor exports, supplied Cd curves, weather-date mismatches and raw-data
redistribution terms still need resolving. No raw third-party dataset was vendored.

Next validation work:

1. Extend the current production replay with a provenance-complete measured
   case; keep the existing Cosmic Cargo estimates visibly separate from measurements.
2. Source independent, usable flight datasets with measured geometry, all-up
   mass/CG, motor curve, launch atmosphere and raw telemetry. Request team data
   when public sources lack those inputs.
3. Freeze model, inputs and uncertainty-based acceptance criteria before
   comparison. Keep fitting/development flights separate from validation data.
4. Report signed and absolute errors by vehicle and regime, including failures,
   for apogee, event timing, velocity where measured, descent and landing/drift.
5. Restrict claims to demonstrated conditions. Decide launch readiness from
   evidence coverage, not an arbitrary number of flights.

## Still unverified / known limits

- Fresh native Windows/macOS installation and full desktop acceptance; Linux
  desktop integration and hardware-GPU acceptance. Build/headless smoke success
  is not a substitute for those interactive checks.
- Native Safari/macOS, Windows Edge and mobile workstation usability. The
  Playwright browser engines passed; only the landing page is checked at phone width.
- Real hardware telemetry import, arbitrary geometry and every export-import
  combination. Current ORK support intentionally refuses unsupported fin shapes,
  CG overrides, and stage/cascading mass overrides instead of changing them.
- Actual updater installation; draft/private release feeds are unavailable publicly.
- Default NASA Student Launch example still reports a failing landing-energy
  gate and low thrust-to-weight. No safety threshold was relaxed to make it pass.
- Weather profiles remain inspection data; only explicitly applied surface wind
  feeds the engine's own shear model.
