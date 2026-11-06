# Engineering changelog

Detailed, dated engineering notes. The user-facing summary is the
[changelog](../../CHANGELOG.md).

## Unreleased

### Added — built-up aerodynamic model behind a beta flag (RMP19 1b)

- The researched built-up method (per-component drag build-up, transonic endpoint
  blend, supersonic fin strips, nose CP caps, junction rule, cumulative booster
  composition) now backs the engine's `stability` and `aero_curves` commands when
  a project selects `aero-buildup 1.0.0` with the legacy transonic term. Panels
  show the model, version and the component-breakdown limitation.
- Flight and Monte Carlo **refuse before any engine call** while the selection is
  present, because the flight still consumes legacy coefficients; the 6-DOF data
  path is untouched until 1c. No default change: the beta is off by default and
  promotion requires the engine-corpus native re-run, held-out flights and the
  owner decision.
- Project schema 1.13.0 persists the selection and pins it per case; unknown
  archived versions refuse replay. Legacy behaviour and bytes are unchanged when
  no selection is present.
- Verified: TS-oracle parity 216 points at 2.2e-16 (1 ulp), adapter 6/6, engine
  58/58, full TS suite 137 files / 1755 tests, production-CSP browser journey,
  and WASM curves at 6.8 µs/evaluation (1.55x the legacy call).

### Added — project schema 1.13.0 records the aerodynamic-model identity

- New `AeroModelSelection { modelId, modelVersion, terms.transonic }` with a
  closed registry (`aero-buildup` at `1.0.0`). A present selection joins the case
  identity (`runKey`/`mcKey`) and the snapshot (`aeroModel`, `aeroModelKey`);
  `snapshotDivergence` reports the new `aero-model` section. An absent selection
  is the legacy path and leaves every existing key byte-identical.
- Project schema `1.12.0 → 1.13.0`: optional selection on the envelope (the
  default for new runs) and on each case's pinned inputs (what the run actually
  used). The migration is a no-op; 1.12 documents without the field load and
  re-save byte-identically, and a 1.12 document that declares it is refused.
- Reading an archive whose id/version this build does not know fails with the
  exact missing model instead of substituting one. Case input capture pins the
  envelope's selection at dispatch.
- Focused tests: identity parsing/keying, case-identity participation and
  divergence, envelope and case-input round-trips, 1.12 migration refusal.
  Full suite: 135 files / 1749 tests.

### Changed — candidate report 3.0.0 and archive 2.0.0

- The candidate runtime now reports `astraea-native-candidate-report/3.0.0`
  (`astraea-native-profile-candidate-report/3.0.0` for the profile envelope). The
  static-curve block carries an explicit applicability outcome: `status`,
  `policyId`, `notApplicable` with its reason and reference context, and
  `points: null` when a live canopy or a zero-direction reference makes airframe
  curves inapplicable. A completed trajectory and its query are no longer thrown
  away by an inapplicable optional consumer, and real invalid-grid/domain
  failures still refuse. `equivalence.curveComparison` replaces the single
  boolean, so "not compared" is never reported as `false`.
- Curve sampling evaluates the reference-Mach point from the reference stage's own
  measurements instead of reconstructing the velocity through normalise/scale
  roundings. The report's f64-bit wrench comparison is therefore true at the
  reference Mach whenever the query is, instead of differing in the last bits;
  every other curve point is unchanged.
- Committed candidate samples are bounded before memory runs away: collection is
  capped at 50 000 with a policy-named refusal, and the report carries the
  declared retained subset (at most 5 000, the app's existing display policy)
  plus `trajectory.retention` metadata. Observed-prefix peaks are still computed
  over every committed sample. A native-only research capture with a hard
  250 000 ceiling is not reachable through the command.
- `simulate_candidate` now also dispatches the explicit E1 profile envelope on
  native and wasm32; a present but malformed envelope never degrades to the
  untagged request. The content identity is unchanged (no key added to
  `identities`/`activePolicies`).
- The Console reads both archive generations: `astraea-candidate-result-archive/2.0.0`
  for new runs and `1.0.0` for existing records, which are parsed and re-saved
  byte-identically. Project schema stays `1.12.0`; no document migration. The
  app no longer decides the display subset itself — the engine's declared
  retention is validated (count, first/final, peaks, final state/flags) instead
  of being recomputed by a second implementation.
- The Console now offers the E1 profile path. A prepared environment selection
  (`launchTimeUtcUnixS`, `launchAltitudeGeometricMslM`, `verticalDatumIdentity`,
  the typed profile with its source identity, units, interpolation policy,
  validity window and knots) can be imported as JSON next to the candidate
  controls. The import is strict - unknown keys, non-integer epoch, an
  out-of-support altitude, empty knots or a non-`reject` extrapolation policy are
  refused at import time - and the engine remains the authority on coverage and
  values. A profile supplies the atmosphere and wind field, so the run takes its
  pad altitude from the declaration (shown as such), requires 0 m/s surface wind
  (refused with a reason otherwise, never silently dropped), and dispatches the
  documented `native-E1-profile-candidate-request/1.0.0` envelope. Profile runs
  archive the envelope verbatim, record the profile provenance
  (`profileEnvironment`), accept the profile report schema, and re-save/reopen
  byte-identically; the selection is session-scoped like an imported flight log
  and is restored by "Load saved inputs". Changing or clearing it marks the
  stored result stale without dispatching anything.
- Limits: legacy display telemetry collection remains unbounded internally and is
  unchanged.
### Removed — unsupported per-class motor-impulse certification defaults

- Deleted `src/sim/motorVariance.ts` and its suite. The module read a
  class-independent 6.7 % certification σ ceiling as an invented per-class
  ±6–10 % "typical" band that "tapers with class", set the suggested 1σ at that
  band edge (10 % for the small classes, above the ceiling it cited), and
  asserted a Gaussian family, per-class structure and physical meaning no cited
  source supports. LSP references showed no runtime consumer: only its own
  tests, the `monteCarlo.ts` doc comments and the benchmark inventories named
  it. The running ensemble's sigmas are the persisted workspace values, so no
  numeric default or sampler behaviour was involved.
- The sampler contract (`src/sim/monteCarlo.ts`, comments only) now states that
  each non-zero sigma is an independent draw and that the impulse sigma is a
  declared scenario scale with no measured motor distribution behind it.
- The ensemble panel now names the three sampled inputs (wind direction, rail
  elevation, one uniform thrust-curve scale), the inputs held fixed, and that
  the sigmas are declared assumptions whose percentages and radii are sample
  fractions — not physical probability or coverage. The containment stats read
  "Sample 50/90/99 % radius" and the ring legend "… of samples within …".
  No internal field names remain in that user-facing copy.
- No numerical default, sampler policy/RNG/order, Rust source, project schema or
  archive field changed: workspace sigmas stay 10°/1°/5 % with seed 20260927.
  A fixed-request probe (real shipped WASM bytes plus the TypeScript oracle)
  reproduced identical full result-vector digests before and after, with
  identical persisted defaults.
- The closed benchmark inventories were reduced explicitly: `motorVariance.ts`
  left the cited-file hashes and `motorVariance.test.ts` left the cited-file and
  collected-suite lists, so `scripts/emit-benchmark-metadata.cjs` still
  certifies. The inventory remains closed for every remaining suite (executed
  files outside it still fail certification); historical benchmark records and
  committed evidence hashes were not edited. Full suite 134 files / 1739 tests
  before, 133 files / 1731 tests after the deletion.
### Changed — attitude presentation extraction corrected (`attitude-euler/1.0.0`)

- `quaternion_to_euler_deg` (`crates/astraea-core/src/six_dof.rs`) and its TS
  mirror `quaternionToEulerDeg` (`src/sim/sixDofSimulator.ts`) mixed two Euler
  conventions: yaw used the outer-angle formula of `Rz·Ry·Rx` while pitch/roll
  used that product's middle/inner forms under `Rz·Rx·Ry` with the `yz` and `xz`
  cross terms sign-flipped. The three numbers were not a decomposition of the
  simulated attitude under any reading (576 candidate interpretations, best
  `max|ΔR| = 0.8649` rad on combined attitudes; the rail attitude at azimuth 30°
  read yaw −2.50° instead of −30°). On the retained vertical telemetry fixtures
  the old `pitchDeg` was clamped at 90.0° for the entire flight while the nose
  pitched over to −89.8°.
- The corrected convention is `R_NB = Rz(yaw)·Rx(pitch)·Ry(roll)` (intrinsic
  yaw→pitch→roll): `pitch = asin(2(wx+yz))` (nose elevation),
  `roll = atan2(2(wy−zx), 1−2(x²+y²))` (right-handed spin about +Y),
  `yaw = atan2(2(wz−xy), 1−2(x²+z²))` (right-handed about +Z). `q`/`−q` agree.
  At `|pitch| = 90` the roll/yaw split is a gauge: roll is pinned to 0, pitch to
  ±90, and yaw carries the combined z-rotation so the triple still reconstructs
  the attitude. The triple remains non-authoritative presentation data; `q` is
  canonical.
- Declared reporting migration, no schema bump: saved telemetry is only written
  with a recorded `engineIdentity`, which is the pre/post boundary. Old archives
  are byte-preserved and never recomputed; their `pitchDeg`/`rollDeg` are the
  legacy defective presentation and must not be compared with corrected values.
  No chart reads the triple (the 3D pose uses `q`); no beta claim or sampler
  surface is touched.
- The generated `telemetry-parity.json` Euler columns were regenerated from an
  independent implementation (`docs/internal/execution-runs/RMP12-attitude-display/`),
  not from the Rust/TS code under test; the trajectory/quaternion columns are
  byte-identical. wind0: 0 of 8138 rows change. wind3: 7910/7871/7910 of 7931
  rows change for pitch/roll/yaw (max angular delta 180.0/180.0/90.0 deg; the
  terminal full-precision row also changes).
- Verification: core library 230 tests and engine `telemetry_parity` 2 tests
  pass (0 gimbal-lock exemptions used); focused TS suite 20 tests; `tsc
  --noEmit` exit 0. Production WASM rebuilt from this source (SHA-256
  `be0aa3641ef91a8859f6c5daaba1d01a735098c10a02bb9839ae0689e4964bdc`,
  1,827,400 bytes); native example `70562e37054c66f1bb16842ae02653287e84329f185c1edec9f96a3ba283f59e`.
  Both runtimes received the same `simulate_flight` requests: 115,039 non-Euler
  numeric fields per case agree (max scaled 2.64e-16 wind0, 1.44e-14 wind3),
  all 15,000 Euler fields per case agree (pitch strict, roll/yaw modulo 360),
  and 0 lock exemptions were used. The new replies match the retained replies
  exactly on all 115,039 non-Euler numbers per case, so trajectory, quaternions,
  loads and events are untouched. The historical `cf57158b…` WASM stays
  historical; this build was made in this lane and no cross-root byte identity
  is claimed.

### Added — explicit unqualified candidate runtime command

- The Rust engine now dispatches `simulate_candidate` on native and wasm32 with
  the existing typed candidate request. It runs the shared prepared-provider
  bounded trajectory, direct query and static curves. The axial source remains
  the caller's explicit prescribed CA0; no local axial/friction source, default
  flight model, project schema, GUI selection or ensemble provider was added.
- The runtime command refuses profile envelopes and both null and non-null
  `diagnosticNumerics`; the native helper keeps the experiment-only controls.
  Legacy commands, legacy result schemas and default behavior are unchanged.
- Report schemas are versioned: `astraea-native-candidate-report/2.0.0` and
  `astraea-native-profile-candidate-report/2.0.0`. The content-identity scheme,
  canonical preimages, numerical-policy identity and core result schema are
  unchanged, so input/model digests remain equal while report metadata differs.
- Verification: 102 engine tests; native dispatch is deterministic; the rebuilt
  1,827,256-byte WASM (SHA-256 `307f585c9e1523bf441f5b5f3a9a1e11eee70a9683d3f2fb823c9a3984f40a1f`)
  served a real worker request with input/model digest
  `80c447b8426ef64fa93509dbc07e75bba1859c01bbdfa586f0e7da8b9ffdb1b4`.
  Across 14,958 numeric leaves the worst native/WASM relative difference was
  `1.06e-15` and event-time difference was zero; every observed refusal matched
  the native command text. Compared with the accepted parent build under the
  identical synthetic request, all report content except the named `schemaId`,
  `commands` and `scopeNote` representation deltas was identical, and the legacy
  serialized output was byte-identical. No GUI/browser, project, default or
  physical qualification was exercised or claimed.

### Added — explicit candidate selection, save/reopen journey

- The Console now has a real per-project candidate opt-in (`astraea-flight-model-selection/2.0.0`)
  with explicit prescribed CA0, axial source/power identity, six physical
  declarations, adapter interpretations, quadrature, horizon, step and curve
  Machs. Nothing is pre-checked, defaulted as a measurement or silently
  converted from legacy. A flagged motor mount is refused before dispatch with
  the accepted adapter's ambiguity reason; no DTO field is dropped to evade it.
- Project schema `1.12.0` adds the identity-only `1.11.0 -> 1.12.0` migration,
  candidate archive v3 inputs and a strict candidate result archive. Legacy
  v1/v2 cases, historical dictionary revisions, old/no-provider projects and
  1.11 documents remain readable; unknown versions/selections fail closed.
- Candidate results show only the supported run/query/curve/status surface:
  experimental/unqualified, computational completion, observed-prefix peaks
  labelled as observed (never apogee), absent landing with reason, nullable
  CP/flow/coefficients and unavailable reasons preserved. One model-aware output
  projection feeds live, saved and Build trace readouts; no legacy PASS or
  zero-fill.
- Preview, Monte Carlo, legacy drag/stability, copilot flight/stability,
  calibration fit/apply, moment-arm history, KML and arbitrary query are
  explicitly refused at their action boundaries while the candidate is
  selected. Legacy mass/design tools remain usable; no secondary consumer
  dispatches a legacy flight result for a candidate selection.
- Verification before the review correction: full TypeScript suite 134 files /
  1724 tests; production WASM SHA-256
  `da38461e247274f605b52abe06e71fad2c8eadbd76d55aa0ee31f069d0ce9ac6`.
  Candidate ensemble/profile/local axial source, empirical qualification and
  long-request budget remain open. The current correction receipts are below.

### Fixed — candidate review F1-F5 corrections

- Candidate archive parsing now enforces the promised relationships rather than
  field-by-field plausibility only: supported identities/status/policy, run-time
  bounds for events/apogee/query/peaks/samples, completion at the requested
  horizon, same-state query/reference/final relationships, curve-grid and
  supported-Mach checks, and linkage to the archived request/selection where
  directly known. Unknown report result schemas and forged archive result
  schemas are refused; nullable CP/flow/coefficients and historical schemas are
  preserved.
- Project schema is the approved `1.12.0` with identity-only `1.11.0 -> 1.12.0`
  migration. Candidate selection/v3 inputs/result archives are accepted at
  1.12; 1.11 documents migrate without candidate backfill; candidate fields in
  older schemas fail before adoption. An intermediate unapproved 1.13 bump was
  reverted; external 1.13 rework receipts are retained as historical evidence.
- Candidate run admission claims the token/abort before the first await. Double
  activation, cancellation during hashing/mass preparation, and late callbacks
  cannot dispatch or clear a newer run; cancelled work records no case and no
  analysis record remains running.
- Mission/Verify/Aero/preview/Build/header/sidebar/Model status no longer show a
  prior legacy result as current under candidate selection; archived history
  stays in Saved Runs. Candidate capture is a detached frozen snapshot and no
  longer freezes caller project or motor state.
- Candidate freshness uses one exact canonical invocation comparison at the
  shared boundary in addition to the existing FNV display key. A forced
  key-collision test still marks header/Flight/Build freshness stale.
- Supplement verification: TypeScript `tsc --noEmit` exit 0; focused
  candidate/import/schema tests 6 files / 182 tests; full suite **134 files /
  1742 tests**. Production build WASM remains 1,827,192 bytes SHA-256
  `da38461e247274f605b52abe06e71fad2c8eadbd76d55aa0ee31f069d0ce9ac6`;
  rebuilt app asset `app-Cuy6nalO.js` SHA-256
  `c9a07aa4ffbc4ae94ac69cf4a0d490bf274c9b689bc053ae7b187d592a3122cc`.
  Production-CSP Chromium supplement proof: real legacy run then candidate
  opt-in hides Mission target, Verify gates and sidebar legacy readouts; a
  deliberately held normal aggregate reply plus the real palette
  `Run Monte Carlo · 100 flights` refusal preserved Run-disabled/Cancel/current
  admission and produced exactly one aggregate mass and one candidate worker
  call; actual result used the dist WASM SHA and input/model digest
  `8f1173f6513d13cd6038e17476e9a746f1586257e2224fc4f8df9755a0e23820`;
  the retained actual 1.12 receipt imported, both 1.12 final-sample and
  omitted-context negatives were refused while preserving the open document,
  and normal 2 s/0.01 s cancellation recorded no case. No browser/runtime/CSP
  errors.
- Supplement F1: the retained final sample must match `finalState` position,
  velocity and final flags, and the declared display policy must retain every
  sample below the 5000 cap (or the exact capped count above it). The weak
  event-adjacency assertion was removed because first/final samples cannot prove
  a decimated archive's nearest-neighbor context; no fake proof is claimed.
  Actual coordinator 1.12 negative fixtures now fail closed and preserve the
  open document.
- Supplement F2b: the command-palette ensemble action on a candidate selection
  now sets only the unsupported-contract refusal; it preserves active busy,
  cancellation and admission token and cannot admit a second mass/candidate
  dispatch. The selected-contract wording no longer says “in this increment”.
- Retained engine observation: `curveMatchesReferenceSample` remains `false` at
  the observed reference Mach; the engine limitation is queued for its owner and
  the app neither relaxes nor suppresses it. The long-request/tiny-step response
  size limit remains a runtime risk; no engine cap was added.

### Fixed — forecast hour follows the selected launch

- Previously a future launch passed the date check, but the default forecast
  request and parser still used today's first hour. Requests now select one
  nearest UTC hour; parsing requires that exact timestamp and aligned layers.
  Versioned attribution records valid time separately from fetch time.
- A response for an edited location/time is refused rather than attached to
  the new selection. Failed requests preserve existing manual and forecast
  snapshots. No timeout, retry policy, physics or wind-layer engine support changed.
- Typecheck, 44 affected tests, the production build and a real-service
  production-function smoke passed. The genuine `c5ae34b` Linux AppImage then
  fetched 25 layers for 2026-10-23 15:00 UTC against a 14:56 UTC launch, saved
  their attribution, and staled the old run after explicitly applying surface
  wind. A fresh network-isolated launch failed to fetch and native Save retained
  identical forecast/manual snapshots. Evidence and package hashes are under
  `~/VMs/linux-beta-acceptance-c5ae34b/`; this is not a Windows acceptance pass.

### Fixed — export freshness is not flight approval

- `Build` used full `qualification.isPass` as the trace's `simulation.current`
  flag. A freshly computed NASA case with a 196.8 J landing-energy failure
  consequently exported `current:false`, despite unchanged inputs.
- Freshness now compares the committed run's key with the same canonical
  current key used by KML refusal. Flight qualification and physical gates
  retain their separate failing/unknown/offline states; no safety gate changed.
- Typecheck, ten export regressions and the production build passed. The genuine
  `890756a` AppImage's own extract-and-run path and native GTK trace exports
  confirmed current/failed-gate coexistence, then stale withdrawal after changing
  rail length from 3.66 to 3.70 m. Source/package hashes, actual files and UI
  evidence are under `~/VMs/linux-beta-acceptance-890756a/`.

### Added — additional source-qualified development airframes

- The shared `benchmark:flight` command now admits Top Shot E12 and Adventurer
  J510W alongside the existing two cases. Source-page model/log associations,
  Raven feet-AGL channels and recorder clock declarations were qualified before
  outcomes. Emerald Streak and Vulcanite groups remain reserved, not scored.
- Log, ORK and motor inputs are hash-pinned. Motor curves use the existing RASP
  parser and a pinned OpenRocket mirror of ThrustCurve cert/manufacturer records;
  no network fetch or raw third-party data is added to ordinary CI.
- The harness preserves declared whole-vehicle dry mass/CG and explicit part
  overrides. Unweighed mass estimates may be uniformly rescaled to leave a
  positive internal load inside the airframe. `modeledMassScale` is recorded,
  not fitted to a flight. A second positive Top Shot mass partition gave exactly
  the same apogee, timing and altitude trajectory in the current production WASM;
  this relies on cylindrical dry inertia and needs rechecking if that model changes.
- Top Shot retains the preselected ORK CG despite the page's 25.4 mm discrepancy.
  Adventurer uses an explicit conical approximation to its source ogive tail and
  a declared G10 proxy for anomalous source density. First logged pressure is
  only a pad-pressure proxy; weather and actual motor seating remain uncertain.
- Reports retain modeled max Mach. Neither new log supplies measured burnout,
  so powered/coast metrics remain blocked rather than borrowing a velocity peak.
  These are conditional development comparisons, not additional validation.

### Added — freeform fin sets (schema 1.5.0)

- New component `freeformfinset` (`points`: one fin's outline, x aft from the
  root leading edge, y outward; first point `(0,0)`, last `(rootChord,0)`).
  Rust: `Component::FreeformFin` in `aero.rs`/`mass.rs`, geometry in
  `fin_planform.rs`; TS oracle `src/aero/finPlanform.ts`. The planform is cut
  into strips at every vertex ordinate, where both edges are straight, so all
  integrals are exact (OpenRocket's `FinSetCalc` samples 48 uniform strips):
  area, MAC `∫c²/A`, MAC leading edge `∫x_le·c/A`, area centroid, and the
  span-weighted mean cosines `cosΓ` (mid-chord) and `cosΛ` (leading edge) =
  `Σ dy²/hypot(dy,dx) / span`, plus the span-weighted mean squared local
  leading-edge cosine `Σ dy³/(dy²+dx²) / span` used by the published cos²Λ
  pressure relation. The latter integrates each actual polygon edge and
  equals the trapezoid expression for a straight leading edge. A step parallel
  to the body axis has zero span weight.
- Models: mass = area·thickness·count·density at the area centroid. Barrowman
  CNα uses the trapezoid expression with `(cr+ct) → 2A/span` and mid-chord
  length `span/cosΓ`; isolated-fin CP = `macLead + 0.25·MAC` (OpenRocket's
  subsonic fraction), body-lift CP and interference factors as for trapezoids.
  Friction: wetted area `2·A·n`, reference length MAC. Wave drag uses the
  polygon area and root chord; leading-edge drag integrates local `cos²Λ`
  over each planform edge, while trailing-edge base drag uses projected span;
  transonic lift-slope uses `cosΛ`. The
  trapezoid arithmetic is untouched (pinned flights unchanged); a polygon
  tracing a trapezoid reproduces it to ≤1e-9 in TS and Rust, through a full
  flight (`src/aero/finPlanform.test.ts`, `tests/freeform_fin_parity.rs`,
  fixture from `pnpm fixtures:freeform`).
- Fail-closed: outline must start at `(0,0)`, end on the body at `x>0`, have
  every other point strictly outboard, be a simple polygon, and have exactly
  one material interval per span station (slots/notches that split a station
  are refused). Flutter (NACA TN 4197 is a trapezoid theory) is reported as
  unavailable, not approximated by an equivalent trapezoid. Inertia: the
  6-DOF model uses a vehicle-level cylinder inertia, so the fin shape enters
  through mass and CG only.
- ORK import reads `<freeformfinset>`/`<finpoints>`; canted or filleted fin
  sets are refused. Fin `axialoffset` now honours OpenRocket's `method`
  (`top`/`middle`/`bottom`; `absolute` refused). Previously the method was
  ignored and a bottom-referenced negative offset clamped to the tube front.
  RKT export refuses freeform fins; ORK, STL, STEP and SVG carry the outline.

Fixes for D1–D7 from the 2026-10-21 desktop passes are listed below.
The named Linux 0.9 native reacceptance is now recorded in the
[desktop checklist](desktop-acceptance-checklist.md); current Windows remains open.

### Fixed

- **Project files open under every name Save can produce (D1).** Save suggests
  `<name>.astraea.json`; Open also accepts a bare `.astraea` and any `.json`.
  The native and browser Save dialogs now carry a matching file type, and the
  Open pickers share one accept list with the import gate.
- **Projects keep their mission (D2).** Mission name, target apogee, site label
  and the fin shear-modulus override are stored in the project (schema
  **1.3.0**). Files saved before 1.3.0 open with the default mission ("Untitled
  mission", 1,000 m, "Unspecified site"); nothing is guessed. The shear
  override changes the flutter result and is part of the run identity. Before
  this fix a run made with an override was no longer "current" once the project
  was reopened (the override was dropped), which reproduces the Linux finding of
  an export trace reading `current:false` / "Fail: current inputs" while the
  UI showed a committed run (`src/state/openRunIdentity.test.ts`). The mission
  fields themselves are not part of the run identity. The Linux session itself
  was not available to confirm it was this exact case.
- **Save names the file that was written (D3).** The status reports the name
  chosen in the dialog, not the suggestion.
- **An export is never a ZIP with another format's name (D4).** With the trace
  option on (the default) the payload and its `.trace.json` are saved together
  as a `.zip`; a name typed in the native dialog without `.zip` gets it
  appended (`motor.eng` becomes `motor.eng.zip`). With the trace off the plain
  file is saved under its own extension. The Build stage says which applies.
- **Monte Carlo controls fit at 1280×800 (D5).** The five fields wrap into two
  columns and "Run N flights" is always on screen.
- **The desktop window fits the display (D6).** The default window is 1280×800
  where the monitor's work area allows it and shrinks (with room for its frame)
  on smaller displays; the minimum size shrinks with it.
- **Shortcut labels match the platform (D7).** Windows and Linux show
  Ctrl+Enter, Ctrl+K, Ctrl+Z and Ctrl+Shift+Z; macOS keeps ⌘↵, ⌘K, ⌘Z and ⇧⌘Z.
- **Fins now carry leading-edge pressure and trailing-edge base drag at all
  speeds.** Below Mach 0.8 the engine previously gave a fin's edges no drag, so
  square- and rounded-edged fins flew too far. The terms follow the published
  Barrowman/OpenRocket build-up (Niskanen 2009 §3.4), no coefficients fitted.
  Found by the pre-registered Mini DX3 development case
  (docs/flight-validation/mini-dx3-protocol.md), where the measured coast drag
  was ~0.70 against the model's 0.52. Preset apogees: Alpha III 311 → 299 m,
  NASA Student Launch 534 → 533 m, Spaceport unchanged. This is a model
  correction, not a validation result: the development case is still +32 %.

## 1.0.0 — 2026-10-18

First versioned release of the homemade-only tree. Astraea remains a
restricted-preview engineering tool, not certified flight-readiness software.

### Added

- `@tauri-apps/cli` is pinned as a dev dependency with a `pnpm tauri` script, so
  release bundles build from the repository instead of a globally installed CLI.
- `src-tauri/icons/icon.icns`, which the bundle icon list already referenced.
- `src-tauri/Cargo.lock` is committed so desktop release builds are reproducible
  (other lockfiles stay ignored).
- GitHub Actions: `ci.yml` (typecheck, Vitest, build, both cargo suites),
  `release.yml` (a `v*` tag builds Linux, Windows and macOS bundles into a draft
  release; unsigned), and `website.yml` (Cloudflare Pages deployment, pending
  owner credentials/setup). CI and website deploy run a built-site Chromium
  flight smoke check under the production content security policy.
- Thrust-curve editor (Motor stage → Curve editor): edits a copy of the selected
  motor's curve with undo/redo, live RASP-convention checks and recomputed
  impulse/class/burn/peak, and saves it as a `derived` motor record in one
  undoable step. The source motor is never modified.
- Boattail flow-separation advisory in the copilot checks (transitions steeper
  than a 10° half-angle). Geometry only; the drag model is unchanged.
- Flight-log units: `time_ms`/feet headers are converted, the Evidence studio can
  override the time and altitude units, and provenance and the ledger record
  whether each unit came from the header, the user, or the default.
- Project files now populate `cases` (completed flight and Monte Carlo runs from
  the session, as scalar summaries), `snapshots` (manual and forecast wind
  profiles, ensemble dispersion statistics) and `evidenceRefs` (indexed from the
  ledger). Cases from an opened file are carried forward on re-save.
- Content security policies for the desktop app and the website (self,
  WebAssembly, ThrustCurve.org and Open-Meteo only; the desktop also allows its
  Tauri IPC).
- Shared Rust WebAssembly engine in background workers on website and desktop;
  browser compute no longer needs Tauri IPC or a preview banner.
- IndexedDB project storage with legacy localStorage migration/fallback and
  stale-write protection; file-picker saves where supported, downloads elsewhere.
- Live tuning: cancellable, debounced flight summaries, thrust-to-weight and fin
  flutter margin, shown separately from committed run results.
- Monte Carlo spreads its 25-run chunks across a pool of engine workers (one per
  core, one kept free for live previews); cancel drops queued chunks and stops
  running ones.
- Product landing page at `/` (the web app moves to `/app/`): what Astraea
  does, the eight-stage pipeline, feature sections with real screenshots, an
  honest validation statement, and Web/Windows/macOS/Linux downloads with
  the visitor's OS highlighted. Plain HTML and CSS, so it does not load the
  workstation. `scripts/capture-screenshots.mjs` regenerates its screenshots
  from the built app.
- Signed desktop auto-updates: the app checks the release feed once per launch
  and installs only on request; release builds sign update artifacts with a
  repository-secret key.
- Telemetry recording is ~100× faster: the JavaScript-exact rounding now runs in
  floating point when provably away from a tie (bit-identical, pinned by a
  1.4M-value test), cutting a recorded flight from ~500 ms to ~60 ms.

### Changed

- Wind profiles (manual table and fetched sounding) persist in the project. They
  previously lived only in the Weather panel and were lost on navigation or save.
- Fonts are bundled (`@fontsource`) instead of loaded from Google Fonts, so the
  desktop app renders the same offline.
- The frontend build splits React, three.js and other vendor code into their own
  chunks.
- `packageManager` and `engines.node` are pinned in `package.json`.
- Version 1.0.0 across `package.json`, `astraea-core` and `astraea-workstation`;
  `tauri.conf.json` now reads its version from `package.json`.
- `tauri build` runs `pnpm build` first and `tauri dev` starts Vite on port 1420,
  so a bundle can no longer ship a stale `dist/`.
- `astraea-core` builds without compiler warnings (redundant assignments in the
  6-DOF loop and an unused dense-step field removed; no numerical change).
- `docs/internal/project-status.md` carries a measured ledger for this tree.

## 2026-10-17 — homemade-only cutover

### Removed

- Closed-format `.CDX1`/`.ALX1` import/export modules, UI wiring, and their tests.
- The calibrated aerodynamic engine, design fixtures, and the calibrated flight/loads
  benchmark suites.
- Reverse-engineering tooling (`reverse/`), engine method notes (`docs/re/engine/`),
  the closed-format corpus and ground-truth tables (`extract/calibrated`,
  `extract/datasets`, `extract/normalized`, `extract/formats`,
  `extract/native-runs/{corpus,tables,accuracy,cpfix,attribution,w20-synthetic}`),
  scratch extraction outputs, and the associated parity documentation.
- Parity/fixture scripts: `scripts/w20-synthetics.py`, `scripts/w20-sweep.ps1`,
  `scripts/export-calibrated-designs.mjs`,
  `scripts/calibrated-fixtures.vitest.config.mjs`, and the
  `fixtures:calibrated` package script.
- FinSim (AeroFinSim) vendor research material: the format notes
  (`docs/re/finsim.md`), the extracted vendor theory PDFs and sample corpus
  (`extract/finsim_raw/`, `extract/native-runs/finsim/`), and the vendored
  `capstone-wasm` package descriptor under `reverse/native/finsim/` (already
  recorded by SHA-256 in the research snapshot's `EXCLUDED-ARTIFACTS.md`).
  The whole set is preserved in the private research snapshot.
- Superseded specifications that still carried an `APPROVED` status or described the
  retired five-studio shell: `docs/Astraea-design-doc.md`,
  `docs/astraea-master-product-spec.md`, `docs/astraea-ui-ux-design-spec.md`,
  plus the one-off scripts that rewrote them (`scripts/audit-master-spec.mjs`,
  `scripts/fix-fourth-round.mjs`, `scripts/refine-master-spec.mjs`).
- Internal artifacts: `HANDOFF-2026-09-28.md`, `colab_cell_0.txt` –
  `colab_cell_7.txt`, and `phase2-result.json`.

### Changed

- The telemetry fixture generator now emits only `astraea/wind*` cases; the
  `aeroModel`/`launchTemperatureK` option loop is gone.
- `scripts/arcas-empirical.vitest.config.mjs` now targets only the independent
  NASA ARCAS and NASA 2005 benchmarks.
- `scripts/emit-benchmark-metadata.cjs` (and its self-test) no longer hash or
  inventory removed suites.
- Documentation now states the validation limit explicitly: Astraea ships only
  its own engine, validated against independent public NASA ARCAS and public
  Estes/Altimeter Cloud flight data; no closed-source reference comparison is
  claimed. The Cosmic Cargo record is stated as a limited single-flight case,
  not general empirical validation.
- `README.md` now describes the boattail-detachment and protuberance-drag
  helpers as unwired (the drag breakdown reports `protuberance_cd = 0`), drops
  the stale FinSim `.FIN` interoperability row, and states the effective-`Cd`
  optimizer as a recorded candidate that is never applied silently.
- `docs/internal/adapter-matrix.md` row 21 records that no `.FIN` reader exists in this
  tree; the row previously cited a `finParser` module that is not present.
- `.gitattributes` (byte-preservation rules for the removed extraction corpus)
  was deleted, and `.gitignore` no longer hides scratch-extraction or
  handoff-note patterns: the publication carries neither.
- `docs/internal/archive/superset-exception-ledger.md` and
  `docs/internal/archive/competitive-gap-analysis-and-backlog.md` no longer list the boattail
  separation advisory and protuberance drag as implemented; both now state they
  are unwired helpers.

### Preserved

- Independent public validation: `docs/internal/validation-arcas.md`,
  `docs/internal/arcas-source-result.md`, `docs/internal/arcas-rust-smoke.md`,
  `src/validation/arcas`, `src/validation/missile2005`,
  `scripts/arcas-runtime-smoke.mjs`, the Estes Cosmic Cargo flight evidence, and the
  ARCAS SU2 diagnostic notebook (`docs/internal/arcas-su2-colab.ipynb`) — only its scratch
  cell dumps were removed.
