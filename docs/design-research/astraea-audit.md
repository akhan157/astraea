# Astraea Running-App Audit — Main Checkout (`C:/Users/adnan/orca/astraea`)

**Lane:** 4 (owns `docs/design-research/astraea-audit.md` + `docs/design-research/evidence/astraea/`)
**Date accessed / exercised:** 2026-09-10, 20:03–20:40 local (`-0400`)
**Executor model:** OpenRouter `openrouter/deepseek/deepseek-v4-flash-0731` (session-configured model), running the walkthrough directly through Orca page automation — no subagents.
**Method:** Expert inspection walkthrough, not a usability study. App launched with the repo's existing dependencies via `node node_modules/vite/bin/vite.js` (Vite 8.2.2) in a supervised Orca terminal; driven through headless Chrome (Puppeteer via Orca in-session page automation; a dedicated spawned Chrome with `--use-gl=swiftshader` for WebGL stability). All numbers below were read from the rendered DOM during a live session.

## Checkout identity

| Checkout | Path | Git HEAD | Committed | Worktree state |
|---|---|---|---|---|
| Main (primary audit target) | `C:/Users/adnan/orca/astraea` | `d79dbe8` | 2026-09-10 15:51 -0400 | clean |
| Current frontend worktree (secondary, separately labeled) | `C:/Users/adnan/orca/workspaces/astraea/astraea-frontend` | `1fcbbe2` | 2026-09-10 16:34 -0400 | only untracked `docs/design-research/` (this lane) |

Both point at origin `https://github.com/akhan157/astraea.git`. Frontend worktree = main + 2 commits (`feat(wa3): worker Monte Carlo competition session + mission status rail`, `fix(wa3): de-race session suite`).

## Runtime identity

- Viewports (measured, per browser): captures on the Orca shared headless browser (`AUD-main-001`, `-011`, `-014`, `AUD-fe-001`) are 1440×900 CSS at Windows device scale 1.25 → 1800×1125 px (014 is 1280×800 CSS → 1600×1000 px). Captures on the spawned headless Chrome (`AUD-main-002-010`, `-012`, `-013`) were taken at the process's native headless window, 764×485 px @ dpr 1 — file names encode the intended 1440×900 CSS target; stated pixel sizes are the measured values above, not the name labels. `AUD-main-010` was re-captured during review rework in a fresh spawned Chrome with `--window-size=1440,900`: 1424×805 px @ dpr 1 (window chrome subtracts 16 px).
- Console/runtime errors seen: **one** (PNG export `toBlob`, see F1); import failures surfaced via `window.alert` text captured in-session (see T4). No crashes, no exceptions in the 6-DOF run path.
- **200% zoom could not be produced** in the available headless tooling (browser zoom API not exposed; `--force-device-scale-factor=2` ineffective because the second Chrome launch attached to the existing profile; CSS `zoom` inert on the root; Ctrl+= not routed to browser UI in headless). Reported as tool limitation rather than app observation.

## Severity scale used

`Blocker` = feature/safety-critical unusable · `Major` = shipped feature fails · `Minor` = degrades workflow · `Info` = observation for design, no failure. `N/A` = feature absent (noted per checkout).

Mapping to the coordinated evaluation-method scale (`evaluation-method.md`): Blocker≈Critical, Major≈High, Minor≈Medium, Info≈Low; `N/A` is kept lane-local because confirmed feature absence is a scope marker recorded per checkout (absent-on-main vs absent-everywhere), not an observed failure, and the method's ladder (Critical..Low) and its `Unverified hypothesis` slot both apply to suspected or demonstrated defects rather than confirmed absences — no finding in this audit is an unverified hypothesis, so no mapping is needed for it.

---

## Findings summary (priority order)

| ID | Severity | Finding | Where | Evidence |
|---|---|---|---|---|
| F1 | **Major** | **PNG blueprint export fails at runtime** — `Failed to execute 'toBlob' on 'HTMLCanvasElement': parameter 1 is not of type 'Function'`. No file is produced; an inline red error appears and state is otherwise intact. | Main only: PNG button/`blueprintPng.ts` exist **only on main**. Frontend worktree has no PNG button (feature absent there). | T6, shot 009-era header state; error text captured in-session |
| F2 | **Minor** | **Export → import is not round-trip faithful.** Re-importing a just-exported `.ork` (NASA SL, booster edited to 1600 mm) changed total length 3120→3000 mm, booster mass 4.83→1.78 kg, stability 3.68→5.24 cal. Geometry (1600 mm booster) survived; masses/aggregates did not. | Both checkouts (same parser/exporter). | T1/T6 |
| F3 | **Minor** | **Studio-local configuration does not survive studio switches** (conditional render remounts): Trajectory wind-table rows + Monte-Carlo run count and Propulsion BATES grain inputs reset to defaults. Store-level state (selected motor, undo history) persists and works across switches. | Both checkouts, by design (`App.tsx` conditional render). | T7 |
| F4 | **Info** | Evidence “compare/overlay” (predictions vs measured altimetry) is **not shipped anywhere**: header in both checkouts reads “preview — evidence only, no sim overlay”; README Phase 5 unchecked. Parse/resample/calibrate are present and working. | absent everywhere | T5 |
| F5 | **Info** | Trajectory-graph annotation reads “Apogee: 387m (1269ft) 105s” where 105 s is total flight time (touchdown 104.85 s); apogee occurred at 8.42 s. Chart label is ambiguous (likely intended as duration axis max). | Both checkouts share the simulator | T3, shot 009 |
| F6 | **Info** | On 1280×800 compact: no horizontal overflow, header text can truncate (`hidden sm:block`, `hidden md:flex` classes), fixed 320 px sidebar remains. Nothing clipped or unclickable in the flow exercised. | Both checkouts | T8, shot 014 |

---

## T1 — Preset / import → selection → geometry edit → undo (PASS)

Steps (all on main checkout, dedicated Chrome):
1. Default load shows `PRESET Estes Alpha III` (4 parts, 4.80 cal `OVERSTABLE`, CG 287 / CP 406 mm, MASS 45.7 g) — shot `AUD-main-001`.
2. `Select` → NASA Student Launch preset: 7 parts, Von Kármán nosecone 650 mm/⌀152, 4.03 cal, Length×Dia 2970×152.0 mm, 10.35 kg — shot `AUD-main-002`.
3. Click left-sidebar card "Booster & Motor Section": card highlight + `PROPERTIES` panel + 3D selection all sync (selection model consistent across tree/canvas/inspector).
4. Edit Tube Length 1450→1600 mm in the Properties number field: HUD updated live (Length 3120, Mass 10.80 kg, 3.68 cal; booster card 4.83 kg) — shot `AUD-main-003`.
5. **Undo** (Ctrl+Z with body focus; App deliberately ignores shortcuts while focus is in an input): back to 2970/10.35 kg/4.03 cal/1450 mm — shot `AUD-main-004`.
6. **Redo** (Ctrl+Y): restored 3120/10.80 kg/3.68 cal/1600 mm — shot `AUD-main-005`.
7. Export current vehicle to `.ork` (valid ZIP + `rocket.ork` OpenRocket 1.9 XML, 657 B) → re-import through the header file picker: `Preset:` dropdown returns to the “Custom / imported” empty value, vehicle loads (length 3000×152 retained geometry; see F2 for masses) — shots `AUD-main-006`, fixture `AUD-fixture-nasa-sl-booster-1600mm.ork`.

Observed: preset switch replaces the vehicle and the preset dropdown label derives from vehicle id (never shows a stale preset name). Undo/redo operate on the geometry edit. **PASS** (with F2 exported separately).

## T2 — Motor compatibility (PASS)

Motor picker is one shared store slot (`selectedMotorId`) used by Propulsion Studio, Flight Sim modal and Trajectory.
- Estes Alpha (BT-50, bore ⌀24 mm): `[C] Estes C6 (⌀18 mm)` enabled; **all four larger motors disabled** with exact tooltip reasons — `motor ⌀29 mm exceeds mount 'Main Body Tube (BT-50)' bore ⌀24 mm` (H128W, I205) and ⌀54/⌀75 (K550W, M1820). Helper text: “Motor-mount bore ⌀24mm · 4 of 5 motors excluded (bore/length)”. Shot `AUD-main-008`.
- Incompatible-selection recovery: select K550W on NASA SL (bore 145 mm), then switch vehicle to Estes Alpha. Modal opens showing the K550W option selected **but disabled** ("cannot fit this mount"), `role=status` banner: `motor ⌀54 mm exceeds mount 'Main Body Tube (BT-50)' bore ⌀24 mm — select a fitting motor to enable the run.`, and **Run button disabled** — a run that would throw is never offered. Shots: `AUD-main-007`, `AUD-main-008`.
- Fit-math verified in source: bore = motor-mount tube `innerDiameter`, length retention ≥50% also checked (`reasonMotorExcluded`).

Observed: no path lets an incompatible motor run. **PASS**.

## T3 — Simulation run + changed-input freshness (PASS)

- Estes Alpha + C6, defaults: Run → results in ~1–2 s: `Flight Status UNKNOWN · outside validated model` / `OFF-DOMAIN · not certifiable` + **`CURRENT · inputs match run`** badge; Apogee 387 m (1269 ft), Max V 104 m/s (Mach 0.31), rail exit 27.2 m/s (threshold ≥15), Touchdown at 5.2 m/s after 104.85 s, drift 625 m; run manifest lists motor/rail/wind/cant/main-alt inputs. Shot `AUD-main-009`.
- Change rail length 2.4→3.0 m → manifest updates and badge flips to **`STALE · configuration changed`**; KPI values stay visible but the outcome row is no longer presented as certifiable (UNKNOWN/OFF-DOMAIN + UNVERIFIED markers persist). Shot `AUD-main-010`.
- Re-run → **`FRESH — matches current inputs`** restored. No stale certified output survives (verified in-session and consistent with the shipped test contract).

Observed: freshness is keyed on the full input JSON (vehicle + motor + all options); mounting-eligibility gates the run first. **PASS**.

## T4 — Invalid import / failure recovery (PASS)

Fixtures created in the evidence dir (clearly labeled): garbage non-zip `.ork`, truncated ZIP `.ork`, malformed `.json` (plus unused malformed `.csv` for reference). All three imported via the header picker; `window.alert` texts captured:

| Fixture | Alert shown | Vehicle state after |
|---|---|---|
| `AUD-fixture-invalid-garbage.ork` | `Failed to load file: Invalid OpenRocket (.ork) file: Archive extraction failed: Can't find end of central directory : is this a zip file ? If it is, see …/howto/read_zip.html` | unchanged (2950×102.0 mm, 4.26 cal, 4 parts) |
| `AUD-fixture-invalid-truncated.ork` | `Failed to load file: Invalid OpenRocket (.ork) file: Archive extraction failed: Corrupted zip: can't find end of central directory` | unchanged |
| `AUD-fixture-invalid-badjson.json` | `Failed to load file: Unterminated string in JSON at position 16 (line 1 column 17)` | unchanged |

- After the three failures, a preset switch (→ NASA SL) still worked and the CAD HUD re-renders — UI remains interactive; no partial vehicle state. Shot `AUD-main-011` documents the recovered state (Nasa SL, 7 parts, 2970×152, 4.03 cal).
- Related recovery observed in Evidence studio: Parse with an empty/headerless textarea shows inline alert `parseAltimeterCsv: no valid data rows (expected a header naming time/t and alt/altitude/agl columns)` and leaves readouts at `—` (no crash).

Observed: every rejected file shows an actionable message; state preserved. **PASS**.

## T5 — Evidence ingestion / resample / calibrate / compare (PASS except compare = absent)

Realistic synthetic fixture: in-repo flight-log sample from `EvidenceStudio.test.tsx` saved as `AUD-fixture-synthetic-altimeter-log.csv` (header `time_s,altitude_m`, 13 rows, apogee 214.2 m @ 3.0 s; **synthetic, not measured telemetry**).
- Paste CSV (real keystrokes) → **Parse** → `Samples parsed 13`; **Resample** (dt 0.5 s) → `Samples @ dt 13`; `Apogee altitude 214.2 m`, `Apogee at 3.0 s` — exactly the shipped test contract. Shot `AUD-main-012`.
- Calibration card: default 3-point coast preset → **Calibrate Cd** → `Cd calibrated 14.3856`, `Fit RMSE 0.069 N`. Shot `AUD-main-013`.
- Recovery card renders (Bay volume 0.0071 m³, BP mass 1.66 g from presets).
- **Compare/overlay (measured altimetry vs predicted flight): absent** — header on both checkouts: “preview — evidence only, no sim overlay” (F4).

Observed: parse/resample/calibrate work; compare is not shipped anywhere. **PASS / N/A(compare)**.

## T6 — Export paths (PARTIAL — P1 Major F1)

Exported from NASA SL via header controls; downloads intercepted in-page (blob captured, file names verified):

| Export | Filename | Size/MIME | Content check |
|---|---|---|---|
| `.ork` | `nasa-student-launch-target-vehicle.ork` | 657 B (ZIP) | valid `rocket.ork`, OpenRocket 1.9 XML with geometry |
| JSON spec | `nasa-student-launch-target-vehicle.astraea.json` | 2,184 B | full vehicle JSON incl. all components |
| `.cdx1` (RASAero II) | `nasa-student-launch-target-vehicle.cdx1` | 320 B text | OML stations in inches with header comment |
| Aero `.csv` | `nasa-student-launch-target-vehicle-aero-matrix.csv` | 3,406 B csv | Mach 0–4 sweep, `CD_power_off/on, CNa, CP` columns |
| Blueprint `.svg` | `nasa-student-launch-target-vehicle-blueprint.svg` | 4,356 B svg | 940×235 viewBox, title/desc |
| Blueprint **PNG** | — | — | **Fails**: `PNG export failed: Failed to execute 'toBlob' on 'HTMLCanvasElement': parameter 1 is not of type 'Function'.` No file; inline error shown (good recovery, broken feature). PNG button exists only on main checkout; FE worktree contains no PNG button (feature absent there). |

Observed: 5/6 export paths produce valid files; PNG is broken in the shipped runtime (the rasterizer assumes a canvas `toBlob` promise API the hosting Chrome runtime does not provide in that form).

## T7 — Studio switching / state preservation (PASS with documented reset semantics)

Store-level (survives all studio switches):
- Selected motor `aerotech_h128w` set on Propulsion → switch Evidence → back: still selected.
- Undo history: edit 750→800 mm on Payload & Avionics Bay → switch Evidence → back → Ctrl+Z: restored to 750 (undo works across studio round-trips).

Studio-local (reset by design due to conditional render remount in `App.tsx`; `TrajectoryStudio` additionally keyed on `vehicle.id`):
- Trajectory: run count 50→25 + wind layer 2 added (alt 120 m / 8 m/s / 90°) → switch to CAD → back: run count 50, single default layer, probe 0 m.
- Propulsion: grain outer diameter 54→76 mm → switch away/back: 54 mm.

Observed: no persistence layer for in-progress studio configuration; vehicle/store state is the only long-lived state. Report as designed; flagged as F3 for design consideration (e.g., a competition work session loses wind-table edits on an accidental studio tab switch).

## T8 — Keyboard / focus / compact layout / zoom (PARTIAL)

- `1`/`2`/`3` view-mode shortcuts: Solid→Wireframe→X-Ray→Solid verified with active-button class readback. PASS.
- Ctrl+Z / Ctrl+Y: verified (T1) when focus is outside inputs; App intentionally ignores shortcuts inside `INPUT/SELECT/TEXTAREA` — undoing a just-typed numeric edit requires clicking away first (source-verified behavior, worth knowing for keyboard-first design).
- Escape closes the 6-DOF modal; modal implements focus trap + focus restore on close (source-verified, `FlightSimulationTab.tsx`).
- Compact **1280×800**: no horizontal scroll (`scrollWidth == innerWidth`), 320 px sidebar retained, header truncates rather than wraps; all flows exercised at 1440 remain reachable. Shot `AUD-main-014`.
- **200% zoom: not capturable** with available tooling (see Runtime identity) — documented tool gap, not an app claim.

Observed: keyboard map is minimal but consistent; PASS for what ships.

---

## Frontend-worktree deltas (secondary checkout, separately labeled)

| Feature | Main (`d79dbe8`) | Frontend worktree (`1fcbbe2`) | Classification |
|---|---|---|---|
| Mission Status Rail (validity/stability/motor/sim-freshness/weather/run badges) | **absent** | **present** — rendered live: `Valid · 0.05 kg · Over-stable · 4.80 cal · Motor Estes C6 · Sim not run · Weather unset · No run active` | absent-on-main only (FE-only files: `MissionStatusRail.tsx`, `MonteCarloSession.tsx`, `sim/monteCarloWorker.ts`) — shot `AUD-fe-001` |
| Monte Carlo competition session (`MonteCarloSession`) | absent | present (wa3) | absent-on-main only |
| PNG blueprint export | present but **broken (F1)** | **absent** (no button, no `blueprintPng.ts`) | feature divergence both ways |
| Evidence compare/overlay | absent | absent | absent everywhere |
| 6-DOF sim + freshness badges, motor-fit screening, evidence parse/resample/calibrate, exports (.ork/.json/.cdx1/.csv/.svg) | present | present | present on both |

Observed: main is behind the worktree on the wa3 features; everything exercised on main behaved identically in the FE worktree at load time (the two checkouts share the app shell; FE adds the rail).

## Visual evidence (inspectable examples with callouts)

All PNGs are unmodified screenshots from this session, saved to `docs/design-research/evidence/astraea/` (local research use).

1. `AUD-main-001-cad-default-1440x900.png` — default Alpha workstation: **[1]** header (brand, project name, `Preset:` select, CAD/Propulsion/Trajectory/Evidence tabs, undo/redo, Flight Sim, import/export cluster), **[2]** `AXIAL ASSEMBLY` 4-part tree with selection highlight, **[3]** 3D canvas (blue ogive nose, white BT, red fins, CG/CP markers + cyan axis), **[4]** metric HUD (`4.80 cal OVERSTABLE`, CG 287, CP 406, Mass 45.7 g, L/D 19.2), **[5]** `PROPERTIES` inspector with `Calculated Component Physics` block — full workstation renders with no blank regions.
2. `AUD-main-003-nasa-sl-booster-edit-1600mm-1440x900.png` — **[1]** HUD Length × Dia 3120 × 152 + Mass 10.80 kg, **[2]** booster card `L: 1600mm … 4.83kg`, **[3]** properties Tube Length 1600.0 — live-edit propagation across tree/HUD/inspector.
3. `AUD-main-008-k550w-on-estes-alpha-excluded-1440x900.png` — **[1]** Estes Alpha tree, **[2]** Flight Sim modal motor list with disabled large motors + `cannot fit this mount`, **[3]** bore ⌀24 mm helper, **[4]** run-disabling status banner.
4. `AUD-main-010-sim-stale-after-input-change-1440x900.png` — **[1]** run manifest (rail 3.0 m) with the changed-input `STALE — inputs changed since run` marker at its right end, **[2]** `STALE · configuration changed` badge in the Flight Status strip, **[3]** the six KPI cards (Apogee 387 m, Max V 104 m/s, Rail Exit 27.2 m/s, Incidence 7.6°, Drift 625 m, Touchdown 0.8 J) with `UNVERIFIED · not certifiable` markers. **Re-captured 2026-09-10 21:09 during review rework** so all three callouts are visible in-pixel (the original frame showed only the modal's top config section, which is why the review flagged it); captured at 1424×805 px @ dpr 1 on a fresh spawned Chrome.
5. `AUD-main-014-compact-1280x800.png` — compact layout: fixed 320 px sidebar, no horizontal scroll, header truncation.
6. `AUD-fe-001-cad-default-1440x900.png` — FE worktree with Mission Status Rail beneath the header (badges: Valid/Over-stable/Motor/Sim not run/Weather unset/No run active).

Exact pixel measurements are not claimed anywhere; all layout remarks are qualitative except scroll/width assertions in T8.

## Limitations & open questions

- 200% zoom capture unavailable in tooling (see Runtime identity); 1440×900 + 1280×800 delivered.
- The 6-DOF sim was exercised on the Estes Alpha/C6 combination only; the NASA SL combinations ran eligibility but not the full trajectory in this pass.
- No real user study performed — expert walkthrough only; accessibility/performance/security not certified (out of scope for this lane and not claimed).
- F2 (round-trip fidelity) root cause not fully traced: may be material-identity loss in `.ork` export or geometry recomputation; reproduced once, worth a focused parsers pass.
- PNG export failure depends on the hosting runtime's canvas extensions; the app comment says the Promise-form `toBlob` is expected “in this application's canvas runtime” — plain Chrome does not provide it, so the feature fails wherever it ships into a stock browser.

## Services/tabs retained for coordinator verification (do NOT stop)

| Handle | Kind | Identity | Ownership |
|---|---|---|---|
| `astraea-main` (port 5191, `localhost`) | supervised Orca terminal, `node vite.js` at main checkout (pid 24480) | main app | mine, left running |
| `astraea-fe` (port 5192, `localhost`) | supervised Orca terminal, `node vite.js` at FE worktree (pid 23316) | FE app | mine, left running |
| Tab `main-dedicated` | spawned Chrome (pid 15368, `--use-gl=swiftshader`) | primary working tab | mine; spawner session owns it |
| Tabs `main-1440`, `main-compact`, `fe-1440`, `main-zoom200` | Orca shared headless browser | auxiliary tabs | mine |
| No user processes were started, stopped, or modified. | | | |

Report end. Lane evidence: `docs/design-research/evidence/astraea/` (15 screenshots, 6 fixtures).