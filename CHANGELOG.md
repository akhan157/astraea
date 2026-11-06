# Changelog

User-facing changes. Detailed engineering notes:
[docs/internal/engineering-changelog.md](docs/internal/engineering-changelog.md).

## 0.10.0 — unreleased

### Added

- **3D viewport look.** Each part now draws in the colour already stored in the
  design, with a material finish that follows its material — clearcoat for
  fibreglass, carbon and printed plastics, metal for aluminium, matte for
  cardboard and wood — so imported designs without colours still show their part
  boundaries. Thin dark rings mark where hull sections join (`RocketComponent.color`
  wins over the material tone; a selected part keeps the accent and the rest
  dims, and hover never dims anything). The camera auto-frames the whole rocket,
  fins included, at about 80% of the canvas's limiting dimension, refits when the
  length or the canvas size changes without resetting the orbit you set, and
  keeps your zoom. A viewcube sits in the bottom-right corner and still
  re-orients the view when a face is clicked. In Flight the upright,
  attitude-posed rocket is fitted into the canvas area the toolbar, pose readout,
  scrubber and viewcube leave free, so no pose — on the rail, at apogee or at any
  scrubber position — runs under the chrome. Lighting is a hemisphere fill, a key
  light, a cool rim light and a radial glow over the grid, tone-mapped with ACES;
  the floor is clean, with no cast shadow. The Flight pose gets the same
  materials and lighting.
- **Live part sizing.** Dimension rows in the part inspector now have a slider
  alongside the number field. Dragging stages the edit immediately, so mass,
  stability and the built-up aero table update while you drag. The slider range
  follows the current value, mass rows step in grams, the inner diameter cannot
  exceed the outer diameter, and a fin/load/parachute offset is capped by its
  parent tube. A tube's length is also bounded below by the last part attached
  to it, and an existing design that already overflows shows a plain warning
  (on the tube or the part) instead of being rewritten. The 3D view keeps the
  last solved shape while the next stability result lands, so it no longer
  blanks mid-drag, and the CG/CP markers stay on that same shape until the next
  result arrives. Pressing the slider track keeps the window fixed from the
  value before the press instead of jumping to a recomputed range. Typed values,
  the unit-aware scrub, arrow nudges and revert still work.
- **Design inputs carried end-to-end.** Surface finish, forced turbulent flow,
  nozzle exit diameter, body-tube rail guide/lug/launch shoe, and fin airfoil
  section, bevels and leading-edge radius can be set in the editor, saved with
  the project, and are used by the built-up aero model. A fin cross-section of
  "airfoil" maps to Subsonic NACA unless an explicit section is chosen. This
  closes the input-plumbing defect the matched-state diagnostic found; the
  flight path remains held. The Student Launch sample's constant-diameter
  transition is now a body tube with the same geometry and mass, so the beta
  model supports the template.
- **Workstation design pass.** The beta notice is one line, with the full
  statement a click away. Long caveats (launch rail, recovery timing, sharing,
  model status) collapse to a summary with *More*; Build shows short engine
  hashes and a trace summary, with the full hashes and JSON one click away. On
  windows narrower than 1280 px the inspector becomes a drawer, below 1024 px
  so does the parts tree, and phones get a desktop-size notice. Timeline event
  labels no longer overlap: apogee, burnout, main and touchdown are labelled
  first and the rest become ticks with tooltips. The flight readout no longer
  covers the controls, and angle of attack shows "—" while on the rail. Part
  names show in full on hover, the flight-model choice looks like a control,
  and the guided tour no longer covers the mass budget. The examples now aim
  for what they can reach: NASA Student Launch targets 550 m as a practice
  flight (it had shown −61 % against 1,371 m), and the Estes Alpha III park
  flyer targets 300 m (the C6 flies about 1,000 ft). The landing-page
  screenshots were recaptured from this build.

### Changed

- **Screenshots refreshed.** The README and landing-page images were recaptured
  from this build, so they show the collapsed inspector on Airframe and Aero and
  the current 3D look. The capture script measures each stage's workspace and
  dock from the DOM instead of cropping a fixed rectangle, and the README
  live-sizing image now shows a fin-span drag.
- **Flight stage at 1280×800.** The dock under the flight canvas now opens at a
  height that scales with the window — about 38%, floored by what the Monte
  Carlo controls need and capped at 400 px, with a height you drag still winning
  — so the fitted rocket is about 173 px tall on a 1280×800 window instead of
  44 px, and larger than before at 1600×1000. On short windows the flight-model
  chooser and the whole-design readiness line share one row, and the pose readout
  sits in the canvas's bottom band beside the scrubber, so the canvas loses one
  band instead of two. Nothing is removed: every control, value and warning stays
  reachable and keeps its accessible name.
- **Inspector and Aero table, second polish pass.** The inspector now
  auto-collapses when it would only show “Select a part in the tree or the 3D
  view” and opens as soon as a part is selected from the tree, the 3D view, a
  table row, the palette, the tour or a readiness link. A manual open while
  empty stays open, a manual close with content stays closed until the next
  selection, `]` and the toggle keep working, and the drawer still never opens
  over the canvas. The width change takes about 160 ms and is instant with
  reduced motion. Escape first discards staged airframe edits, then clears the
  selection when nothing is staged and no overlay is open. At 1280 the
  mass-budget header stays on one line, the palette shows “Search” with its key
  hint, and the Motor tool tabs no longer wrap. Aero lists body tubes,
  parachutes, mass items and engine-reported zero-CNα parts as dimmed secondary
  rows under “Not lifting surfaces”, with dashes instead of invented zeros, one
  footnote, and the same hover-to-find and click-to-select behaviour.
- **Console polish pass.** Native checkboxes, ranges, selects and disclosure
  triangles now use the console kit while keeping their native roles, names and
  keyboard behaviour. The Aero breakdown stops printing an empty
  “0 parts carry no lift ()” sentence and explains that body tubes and
  parachutes are not lifting surfaces in the subsonic rollup instead of
  presenting their CNα/CP as missing. An unset launch site reads “Not set ·
  sea level standard day assumed” rather than “0 m”, and the compact site form
  uses the inspector’s field/button pattern. Flight’s inspector shows the rail,
  site/wind and main-deploy settings as a read-only summary with an *Edit in
  Mission* action. At 1280×800 the header buttons no longer wrap, the stage
  subtitle stays readable, and mass-budget part names are no longer cut off;
  gate and result reasons wrap instead of truncating. The landing page takes
  its beta version from `package.json` and its screenshots were recaptured.
- **Landing speed uses the cited Tripoli Level 1 limit.** The recovery
  landing-speed gate now checks touchdown speed against the Tripoli Level 1
  certification limit of 35 ft/s (10.67 m/s), with the primary source
  (https://www.tripoli.org/Level1) in the gate reason. The unsourced 20 J
  landing-energy pass/fail gate is gone: whole-vehicle landing energy remains a
  readout, noted as a lumped estimate with no standard threshold.
- **Spaceport America is a practice example.** The bundled example now targets
  5,100 m, which its M1820 motor reaches at the site, instead of claiming
  30,000 ft. The example grid notes that the bundled motor catalog is a small
  certified set and that other motors can be imported from .eng or .rse files.

## 0.9.0 — unreleased

Planned first public release, as a **beta**. Apogee was tested blind on one small
subsonic rocket, where predictions ran 6–10 % high; other vehicles and
supersonic flight are not independently validated. Nothing here is flight
approval; see [how accurate it is](docs/accuracy.md). 1.0 requires the accuracy
target and desktop acceptance gates to be met.

### Added

- **Built-up aerodynamic model (beta, panels only).** The Aero panel can
  optionally show a hybrid aerodynamics model built from the researched method:
  the build-up supplies the stability and aero coefficients, while Astraea's own
  total drag is kept over Mach 0.80–1.20 (component breakdown withheld inside
  that band). It is off by default, labelled *hybrid*, and recorded with the
  project and each case. Flight and Monte Carlo still use the legacy model and
  refuse to run while the beta is selected. The method reproduces the reference
  engine's coefficients on its corpus; the hybrid has **not** been validated
  against real flights, and no accuracy claim is made. A provenance page lists
  the published, derived, engine-observed and unvalidated terms and constants.
  Older projects open unchanged. Designs do not yet record surface finish,
  forced turbulent flow, fin bevels or leading-edge radius, or rail guides, lugs
  and launch shoe, so the beta evaluates a smooth, guide-free vehicle and reads
  drag low (8–41 % on nine test designs); the panel and provenance page say so.
- **Third-party notices.** The website footer and the Model & evidence status
  panel now link to a bundled notice file with the full licence texts for the
  fonts, JavaScript libraries and engine crates that ship with the app, plus the
  rights evidence that is still unresolved. It is generated from the installed
  packages and checked for drift; no network access is involved.
- **Share this flight.** In Verify, after importing a flight log, enter the
  rocket's measured liftoff mass and a few launch details and export one
  `.zip` with the log (byte for byte), your project, the motor curve and a
  README on how to send it. Nothing is uploaded. Your imported log is now kept
  when you move between stages (it is not saved in the project file).
- **Calibrate drag to your own flight.** In Verify, import a flight log, fit
  your airframe's drag to its coast phase, and apply the scale to the
  project. Flights, Monte Carlo and the live preview then use it, results
  read *Calibrated* (fitted to one flight, not a validation of the model),
  and it is saved with the project and listed in export traces. Remove it
  to return to the model's own drag.
- **Freeform fin sets.** Supported outlines, given as a list of points, now
  import from OpenRocket (`.ork`), fly, and export to `.ork`, STL, STEP and
  SVG instead of being refused. Mass, stability and drag follow the outline
  (OpenRocket's published Barrowman method). Edit the points as a table in the
  inspector. Fin flutter is not computed for freeform fins. OpenRocket fin
  positions given from the bottom or middle of the tube are now read
  correctly. Project files are now version 1.5.0; older files open unchanged.
- **Experimental candidate flight model (opt-in).** Flight can now be run with
  an explicitly declared candidate model instead of the supported legacy one:
  you state the prescribed CA0, the declarations the adapter requires and the
  curve grid, and the engine runs one bounded request whose query and static
  curves come from the same prepared state. It is experimental and unqualified
  by design: results read *Experimental · unqualified*, the observed-prefix
  maximum is never called a predicted apogee, landing values appear only for a
  real touchdown, and preview, Barrowman stability, copilot flight checks,
  calibration, moment-arm history, KML export, ensembles and cross-model deltas
  are refused rather than filled from the legacy model. Candidate cases save,
  reopen and reload their inputs, keeping the exact dispatched request and the
  executed engine identity. An optional E1 environment profile can be imported
  for the run: it replaces the atmosphere and wind field, is validated and shown
  with its source, datum and validity window, and is archived with the case.
  Project files are now schema 1.12.0; older files open unchanged.
- **Development flight diagnostics.** An opt-in benchmark compares declared
  flight data with the production engine, preserves timing errors, and separates
  ascent/coast/descent where measured boundaries exist. It now includes conditional
  Top Shot and Adventurer reconstructions alongside Cosmic Cargo and Mini DX3.
  See [Contributing](CONTRIBUTING.md) for the command and source requirements.

### Changed

- The beta accuracy statement is now scoped explicitly to the original legacy
  model. The blind-test result (6–10 % high apogee on one small subsonic rocket)
  is unchanged, but the app, landing page and accuracy page now state that this
  evidence does not cover the experimental candidate model.
- Verify's evidence panel is now "Flight evidence" in the app's own style.
  The recovery bay and charge sizing live only in Recovery.
- Desktop release drafts are marked as GitHub prereleases, not stable releases.
- Flight integration now stops adaptive steps at tabulated thrust-curve knots
  and reports localized events at the midpoint of a tighter time bracket.
  New trajectories and engine checksums change; historical runs retain their
  recorded values, and fits tied to another engine checksum remain inactive.
  This is a numerical correction, not a new flight-accuracy claim.

- **More realistic drag for fins.** Fin leading and trailing edges now add
  drag at all speeds (published Barrowman/OpenRocket method). Predicted
  apogees drop slightly for rockets with thick or square-edged fins (Estes
  Alpha III example: 311 → 299 m).

### Fixed

- The desktop app no longer writes a download diagnostic file to the shared temp
  directory. That file recorded export URLs and full destination paths in a
  predictable, world-readable location without an opt-in or size limit, and it
  followed a pre-existing symbolic link. Export downloads still work, including
  the second and later downloads in one session; nothing about the file is logged.
- Drag calibrations now stay tied to the design, motor, launch conditions and
  recorded engine they were fitted against. Changed inputs retain the fit as
  inactive history instead of silently applying its scale; restoring the inputs
  can reactivate it. Unknown or different recorded engines refuse calibrated
  runs, including previews, and saved inputs match the actual dispatched scale.
  Legacy fits remain explicitly unverified; no flight-accuracy claim is added.

- Geometry stability now withholds CP, margin and verdict when the total
  normal-force slope is unsupported or ill-conditioned, rather than using the
  engine's stand-in CP. The copilot reports these quantities as Unknown; the
  aerodynamic-input preview keeps drag visible without presenting that CP.

- Export traces retain the run's recorded event timeline and terminal state.
  The Flight-track export now needs a recorded nominal touchdown and refuses a
  timeout, an abnormal landing or missing terminal evidence, instead of calling
  a final trajectory sample a landing.

- Peak dynamic pressure is now described by what the recorded samples actually
  support. The stated limits are evidenced by synthetic analytic cases: sampling
  and decimation can miss the true peak by an unlimited amount, and rounding can
  make the displayed value exceed it. Neither a magnitude nor a timing error
  bound is claimed.

- Recovery readouts and export traces now come from one output dictionary, so
  the same run reports the same value, unit and confidence everywhere. Export
  traces carry the engine value and its qualification instead of their own
  rounded copy, and descent time is labelled by the clock that actually recorded
  it rather than promoted to a stronger level.

- Saved flight cases retain the run's own bounded display samples, so Saved runs
  can plot a historical trajectory again. Files from before this stay explicit
  that the samples were never retained; they are not rebuilt from the current
  engine.
- Saved flight cases now keep the same versioned output dictionary as the export
  trace: values, units, confidence, unavailable reasons, the native off-nominal
  flag and sampled peak context. Comparisons of two such runs use the selected
  units, the live small-delta suppression and both-record landing availability;
  older summary-only runs stay labelled historical rather than upgraded with
  current defaults. Project files are now schema 1.11.0; older files open
  unchanged.
- Project files can now be saved and reopened up to 64 MB, enough for several
  full flights with retained telemetry. The previous 8 MB limit still protects
  imported OpenRocket, RockSim and motor files. A project over the file limit is
  refused before anything is written, and nothing is lost: the design stays
  open and the browser copy remains a separate, quota-bound option.

- Saved runs retain dispatched inputs and effective motor curves, with explicit
  reload/re-run and protected historical motor/weather references.
- Run and calibration provenance identifies the actual compiled WASM bytes;
  missing legacy checksums remain unknown. Project files migrate to schema 1.6.

- Bounded flight telemetry retains its recorded pressure maximum. Conflicting
  required timestamps or an insufficient cap fail explicitly instead of silently
  losing required samples; continuous-time Max-Q remains unqualified.

- Flight loads preserve signed transition normal-force contributions and their
  moments; undefined normal-force stations fail before use.
- New drag adjustments require source-attributed eligibility review. An explicit
  event-qualified refit excludes contaminated smoothing neighborhoods and stores
  selection provenance; legacy adjustments remain labeled unverified.

- Undo/redo restores imported, replaced and edited motors, including the data
  used by simulations and saved files.
- Switching projects isolates completed runs and late simulation responses.
  Delayed saves and imports cannot overwrite newer document intent or mark
  later edits saved.
- RockSim import preserves tube/transition order. Unsupported mass/CG
  overrides are refused instead of silently discarded; export previews use
  the same refusal rules.
- Drag fitting identifies its vertical-coast assumptions, feature proxies and
  sample support. Its labels distinguish an applied fit from verified accuracy.
- Project files reopen under every name Save suggests (`.astraea.json`,
  `.astraea`, `.json`).
- Projects keep their mission name, target apogee and launch site.
- The save message shows the file that was actually written.
- Exports that include a trace file are saved as `.zip`, not under the
  payload's extension.
- Monte Carlo controls fit on a 1280×800 screen.
- The desktop window fits smaller displays.
- Keyboard shortcuts show Ctrl on Windows and Linux (⌘ on macOS).
- Confidence no longer labels mixed measured/computed mass totals or
  calculated centers of gravity as Measured.
- Export traces distinguish a current run from a passing flight check. A failed
  requirement no longer makes matching inputs look stale or suggests rerunning
  unchanged inputs to clear the failure.
- Weather forecasts use the nearest hour to the selected UTC launch time, show
  that hour, and keep saved wind profiles intact if a new request fails.

## 1.0.0 — 2026-10-18 (unpublished release candidate)

Never published: this release candidate was superseded by 0.9.0, which ships
the same features as a beta.

- Browser and desktop apps (Windows, macOS, Linux) on one Rust/WebAssembly
  engine.
- Airframe design with live stability, drag and flutter checks.
- Motor library with ThrustCurve.org search, custom motors and grain
  ballistics.
- 6-DOF flight, weather forecasts, dual-deployment recovery and Monte Carlo
  dispersion.
- Altimeter and GPS log import for comparing predictions with real flights.
- OpenRocket, RockSim, motor, STEP, STL, drawing and KML file support.
- Signed in-app updates for the desktop app.
