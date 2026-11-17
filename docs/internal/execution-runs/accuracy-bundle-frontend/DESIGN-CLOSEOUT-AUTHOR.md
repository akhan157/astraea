# Closeout author design note — three bounded UI gates (2026-11-12)

Author lane `integrate-appbound-e1b`, branch `integrate/appbound-e1b`.
Verified at the start of this note: `pwd` = lane path, branch as above,
`git rev-parse HEAD` = `ae4cdec0307da30a909015a0327fbf12f7d75c02`, clean tree.
Base `482616d6bf6e7c0fba392863e30511b6058b7739` is an ancestor of HEAD
(`git merge-base --is-ancestor` exit 0). The only commits since the base are
`82ecde2` and `ae4cdec`, both docs-only (2 files, +29 lines).

Owner message 2026-11-12 explicitly approves the Gate 1 bounded split and
overrides the assignment's "stop after design note" instruction: this note is
written **before** material journey edits, and implementation proceeds under
this approved design unless a material scope issue appears. The coordinator
still owns acceptance; the author cannot self-accept, merge, push or edit
existing register/manifest/board/handoff/review records. Only new author
records are added.

## Scope

In scope (author):

- one new focused, reusable browser runner `scripts/accuracy-closeout.mjs`;
- new author records in this folder
  (`DESIGN-CLOSEOUT-AUTHOR.md`, `RESULT-CLOSEOUT-AUTHOR.md`,
  `EVIDENCE-CLOSEOUT-AUTHOR.json`);
- evidence files outside the repo under
  `../evidence-accuracy-bundle-frontend/closeout/`.

Out of scope for this lane: any `src/`, `crates/`, register, manifest, board or
existing handoff/review edit; any engine rebuild with source changes; any full
browser-smoke rerun; any threshold, default, schema, physics or claim change;
any push/release.

The runner is authored here; the **coordinator** executes and reviews it
independently. The author's own browser evidence is gathered through the T3
shared preview browser against the built `dist/` served with the exact
production CSP from `dist/_headers` — not through an alternative browser.

## Environment and identity (mechanism shared by both items)

1. `free -h` must show at least 2 GiB available before build/browser work;
   `CARGO_BUILD_JOBS=2` for the WASM rebuild; any test run is capped at
   `--maxWorkers=2`.
2. `pnpm build` = `build:engine` (cargo release, `wasm32-unknown-unknown`) +
   `tsc` + `vite build`. Record the command, exit code, log path, the built
   `src/engine/astraea_engine.wasm` sha256/bytes and the `dist/assets/*.wasm`
   sha256/bytes. Expected: identical bytes in both places; the previously
   recorded lane identity `21eea59…` (2 035 057 bytes) from the same engine
   source. Root's `91c94095…` is a different build directory and is not used
   here. Engine source is unchanged from the approved option-2 bundle:
   `git rev-parse HEAD:crates/astraea-engine` is recorded as the source tree
   hash, and `git status --porcelain crates src` stays clean before probes.
3. Serve `dist/` with `vite preview` plus the verbatim
   `Content-Security-Policy` line parsed from `dist/_headers` (the same
   mechanism `scripts/browser-smoke.mjs` uses). The document-level CSP is
   proven in-page: `new Function('return 1')()` must throw (eval blocked) while
   the WASM engine still flies. Falsifier: eval succeeds, or the engine is
   unavailable.
4. The app is the built production bundle; the run's own engine identity
   (`production-rust-wasm` sha256 shown in Saved Runs) must start with the built
   WASM hash. No store mutation is used to create any passing result; all
   inputs are typed/clicked in the real UI, and `preview_evaluate` is read-only
   DOM inspection.

## Item 1 — nose tip radius, production UI and persistence

Mechanism: Airframe → parts tree → `Von Kármán Nosecone` (NASA Student Launch
preset, base diameter 0.152 m) → Inspector "Nose tip radius" field, which is
absent by default (`Add` button). Observable path: `Add` stages 0.001 m; the
number field edits millimetres; `Apply staged edits` commits; the project's
local save reports `Saved locally`; a full page reload re-reads the project.

Expected observable result, in order:

1. default: `Add Nose tip radius` present, no number input, no warning; hint
   text verbatim: "Blunt tip radius, used only by the built-up method above
   about Mach 0.9. It does not change the drawn nose, the mass or the legacy
   model. Absent is a sharp tip."
2. `Add` shows the millimetre field at 1 mm, no warning.
3. typing `200` (mm, above the 152 mm base diameter) keeps 200 — it is not
   clamped — and shows "This nose tip radius is outside what the engine
   accepts (0 to the nose base diameter). Stability, aero curves and flights
   are refused until it is corrected or cleared."
4. typing `-1` also warns; returning to `1.5` clears the warning.
5. unrelated geometry unchanged: the 2D dimension drawing's geometry (all
   polygon points, rect attributes, viewBox) and the parts-tree mass label are
   captured with the nose selected before the edit and must be byte-identical
   at every state (absent, 1.5 mm, 200 mm). The drawing/mass code never reads
   `tipRadius`; a difference is a real defect, not an accepted variance.
6. persistence of an added value: apply 1.5 mm, wait for `Saved locally`,
   reload the page, reselect the nose → field still 1.5 mm and no warning.
7. engine limit is real, not decoration: with 200 mm applied, Run simulation
   fails with the engine's own validation sentence
   `prepareVehicle: nose tipRadius 0.2 m on component 'nsl-nc' exceeds its nose
   base diameter 0.152 m` (grounded in `crates/astraea-engine/src/models.rs`
   line ~557). Then restore 1.5 mm.
8. clearing persists: `Clear Nose tip radius` → `Add` returns, geometry still
   identical, apply, reload → `Add` still present (no radius archived).

Falsifiers: any clamp of a typed out-of-range value; missing warning for
200 mm or −1; drawing/mass difference; value lost after reload in either
direction; engine accepting 200 mm or a different error text; any warning copy
not matching the production strings.

Exact artifacts: `author-t3-nose-default-1280x800.png`,
`author-t3-nose-warning-1600x1000.png` (plus mirrored widths), the raw
geometry/mass strings, and the JSON record
`author-t3-closeout.json` (`nose` section).

## Item 2 — opted-in saved flight and ensemble provenance display

Mechanism: Aero → Aerodynamic inputs → check "Use built-up aero model (beta)"
then "Use built-up drag in flights (beta)" (vehicle `flightDragSource:
'calibrated'`); run a flight and a 10-run ensemble. Each completed run is
archived into the project (`withRunCases`) and the project is saved locally.
Build → `Saved Runs` renders, for a record whose **archived inputs** carry the
opt-in, the archived `summary.axialDrag` string verbatim (plus the fixed
refusal warning when the string is the engine's refusal form). Reload re-reads
the project from local storage; "Load saved inputs" is the explicit open path.

Two production templates give both branches of the engine's own line:

- supported shape: NASA Student Launch (built-up method used);
- explicit refused fallback: Spaceport America practice (method refuses the
  shape; the engine states `legacy drag used (refused: …)`).

Both live in separate browser origins (different ports) because loading a
preset creates a fresh project and resets analysis; within each origin the
current settings are then changed (built-up model/opt-in cleared) to prove the
display does not depend on today's settings.

Expected observable results:

1. Supported flight: Flight → Results shows `Axial drag` with a verbatim
   sentence starting `calibrated build-up axial drag (alpha = 0) from the
   in-repo method port;` and containing `nose tipRadius 0.0015 m` (the radius
   added in item 1 reached the real engine) and `not a validated model`.
   Build → Saved Runs shows the same record with `data-archived-axial-drag`
   whose sentence is exactly equal (after removing the `Axial drag · ` label)
   and no refusal warning.
2. Supported ensemble (10 flights): Monte Carlo tab shows the same drag-source
   line with `; drag ladder from the nominal baseline flight; ensemble members
   share it`; Saved Runs shows the Ensemble record with the exact same sentence.
3. Refused flight (Spaceport): Results shows the warning
   `Built-up drag was requested but not used for this rocket.` above the
   verbatim line starting `legacy 25-station Mach drag tables from
   compute_aerodynamic_curves; legacy drag used (refused: `. Saved Runs shows
   the identical sentence and the same warning, and the flight's apogee equals
   the same vehicle's legacy baseline apogee.
4. Refused ensemble (10 flights) on the same vehicle: Saved Runs shows the
   refused ensemble line with the warning.
5. Independence from current settings: clear "Use built-up aero model (beta)"
   (which also clears the flight-drag opt-in in one undo entry). The archived
   lines must remain byte-identical for every stored record on both origins.
   A re-derivation from today's settings would remove the line or replace it
   with `calibrated drag not requested`; that is the falsifier.
6. Restore/open: reload the page on both origins → the project reports
   `Saved locally`, the same records exist, and the archived lines are still
   byte-identical. On the supported origin, `Load saved inputs` on the flight
   record is clicked once; its status message appears and the archived line is
   still unchanged.

Falsifiers: archived line missing or not equal to the engine's sentence;
warning present when the engine used the method, or absent when it refused;
line changing after settings are cleared or after reload; any fallback to the
legacy "calibrated drag not requested" text; any page error/console error
during the journeys.

Exact artifacts: `author-t3-saved-runs-supported-1280x800.png` and
`-1600x1000.png`, `author-t3-saved-runs-refused-1280x800.png` and
`-1600x1000.png`, exact strings in the JSON record (`savedRuns` sections for
both origins), and the command/exits log.

## Deliverables and stop conditions

- `scripts/accuracy-closeout.mjs`: standalone, mirrors the proven
  `browser-smoke.mjs` preview + CSP + Playwright pattern; performs both items,
  writes screenshots and a JSON evidence record; documented env knobs
  (`ASTRAEA_SHOTS_DIR`, `ASTRAEA_EVIDENCE_JSON`, `ASTRAEA_PREVIEW_URL`,
  `CHROMIUM_PATH`); exits non-zero on any assertion failure. The coordinator
  runs it; the author only syntax-checks it.
- New author records in this folder and evidence outside the repo as above.
- Author's own T3 shared-browser evidence is recorded with actual commands,
  exit codes, WASM hashes/bytes, exact strings, screenshot paths and the
  environment's available memory.

Stop conditions: a real product defect is reported to the coordinator with the
minimal proposed change, not patched by the author; any scope expansion
(engine/physics/default/schema/threshold/research) stops and returns to the
coordinator. No self-acceptance is implied by this note or the evidence.

Routing/model identity: focused UI journeys executed as the assigned
implementation sub-agent in this lane. No model switch is claimed or needed.
