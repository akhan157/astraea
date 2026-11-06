# Lane ui-polish-pass — result

Status: implementation complete, pending coordinator review. This lane cannot
self-accept and did not edit the acceptance register, manifest, task board or
handoff.

- Branch: `ui-polish-pass`
- Base: `f8e10959e44a396c52d62b8d45cbdeb01aadbf33` (tip of `frontend/design`)
- Assignment commit: `0f5330a36c36318747157fdd0fc468a69413e7c6`
- Implementation commits:
  - `25bd216ac8996ccfa4ac9623fde5061bb6ce4eab` — kit primitives
  - `042bd30ca84e8b51f93fb708c0b8845211640698` — stage/evidence changes
  - `be54572f7e98362e5262c6c2c96a78402281ba3a` — regression tests and browser assertions
  - `7b030ddd8177c8b6bcc111929816df59121cd9cb` — landing version from `package.json`
  - `78a549438d2fe3319313d2ef76b4464a9a432d51` — recaptured landing images
- Report commit: this commit (`RESULT.md` + `EVIDENCE.json`).
- Evidence directory: `/home/ak/.paseo/worktrees/3s8t98rp/evidence-ui-polish-pass/`

## Gate 1 amendments

1. **Stability-row type lookup.** `Aero.tsx` resolves a row's component type from
   `s.design.vehicle.components.find(c => c.id === row.partId)?.type`. No type
   field was added to the DTO, adapter row or engine.
2. **Choices (a)/(b).** Native `<select>` keeps its OS-drawn option popup while
   the closed control is themed; the 1279/1023/719 drawer breakpoints are
   unchanged. Both were approved.
3. **StageHeader height.** The subtitle wraps onto at most one extra row below
   `2xl`. At 1280 the top bar stays 44 px; the Airframe stage header moves from
   44 px to 56 px. The Run shortcut stays in the button's text/accessible name
   (`sr-only` below `2xl`) and in its title.
4. **Flight-model chooser.** `Flight.tsx` now uses `Disclosure` with
   `chevron={false}`. It remains a native `<details>/<summary>` with the same
   summary text, accessible name, role and keyboard behaviour; no extra chevron
   was added. The existing `getByRole('checkbox')`/`getByLabel` browser checks
   still pass.
5. **Version test collection.** `npx vitest run --maxWorkers=2
   vite.config.test.ts --reporter=verbose` prints
   `✓ vite.config.test.ts > landing page version > injects the package.json
   version at build time`; see `gate2-after/version-test-verbose.log`.
6. **preview-journeys.** Existing assertions were kept; the new checks are
   additive. Two panel toggles are re-clicked after the 1024/800 layout checks
   so later existing journeys see the same open-panel state as before.
7. **Base runs.** Each falsifier has a failing run at `f8e1095` recorded in
   `gate2-base/` (`FAILURES.md`, unit logs, `base-probe.log`/JSON).
8. **Commits.** Logical commits are listed above.

## Item results

### 1. Aero breakdown sentence and body tubes — fixed

The native stability assembly never creates an aero surface for a body tube:
`crates/astraea-core/src/aero.rs:1302-1312` advances the axial chain and pushes
nothing into `aero_surfaces`; `aero.rs:1453-1470` then emits a contribution with
`cp`/`cna` as `None`, serialized as JSON `null` and mapped by
`src/console/data/adapter.ts:215-217` to an unknown CNα. The engine therefore
reports no value, not zero lift.

The empty sentence is no longer rendered. Zero-CNα rows now use singular/plural
wording (`1 part carries no lift (…). It moves…` /
`N parts carry no lift (…). They move…`). Unknown body tubes and parachutes are
explained in plain words: they are not modelled as lifting surfaces in this
subsonic rollup, the engine reports no CNα or CP for them, and they still move
the CG. Other unknown types keep the engine's own reason. The live Aero text
contains no `0 parts carry no lift` and no `CNα N/A`.

### 2. Native controls — replaced

New `kit/Controls.tsx` (`Select`, `Checkbox`, `Range`), `kit/Disclosure.tsx`,
and `TextField` in `kit/Fields.tsx`. `SelectField` now wraps `Select`;
`SliderField` wraps `Range`; `Button` gained a `type` prop. Native elements and
roles are retained:

- Selects: `SelectField` call sites (nose shape, airfoil section, material,
  surface finish, motor ingredient), Altimetry time/altitude units,
  CalibrationReview condition/recovery selects, ProjectLedger review,
  RecoveryCard bay/shear-pin, SavedRuns baseline/variant, SimFlightOverlay
  baseline/compare/sync/interpolate.
- Checkboxes: FlightTimeline full flight; AeroControls forced turbulence and
  built-up model; Candidate declarations/tangent-ogive/conical transitions;
  ShareFlightCard consent; SimFlightOverlay layer toggles.
- Ranges: all SliderField inspector sliders, ComparePanel blend, FlightTimeline
  scrubber, MomentArmHistoryPanel point, SimFlightOverlay time cursor.
- Details: Flight model chooser, Build trace JSON, SavedRuns disclosures,
  Candidate result disclosures, CalibrationCard fit/advanced disclosures,
  ModelStatusPanel full hashes, MomentArmHistoryPanel definitions.

The browser probe finds zero unthemed `select`, `details`, checkbox or range
elements on every stage. The OS select popup remains native by design; replacing
it would change the role. Text/number/date/file inputs and textareas were not in
the finding and are unchanged.

### 3. Launch-site form — compact themed form

`SiteEditor` now uses the inspector's `FieldRow` + `TextField` + small `Button`
pattern. Measured: input width 578 → 118 px, form height 222.75 → 120.25 px,
Apply button height 37.5 → 23.25 px. Labels, accessible names, submit-on-Enter,
error role and the clear action are unchanged.

### 4. Unset launch site — display only

The Mission site card now reads `Elevation: Not set` with
`sea level standard day assumed`, plus a `Set launch site` button that scrolls
to and focuses the site altitude field. No preset, engine input, run option or
`caseResolver` value changed; a site that actually declares 0 m still shows it.
The Flight read-only summary uses the same wording.

### 5. Flight inspector — read-only summary

The Flight inspector no longer renders `LaunchInspector`. It shows one
`Launch settings` section (rail / site and wind / recovery) with
`Effective guide travel`, rail angle/azimuth, surface wind, wind from,
launch-site elevation and main-deploy altitude as formatted values, plus an
**Edit in Mission** button that switches to Mission. Mission keeps the editable
form. Measured: the summary contains zero inputs/selects/textareas.

### 8. 1280×800 and 1024×768 — layout

Mechanism: nowrap + shrink-0 on Run and Compare revision, shortcut hint
`sr-only` below `2xl` (accessible name and title retained), palette width
240 px at `xl` and 320 px at `2xl`, StageHeader subtitle on its own row below
`2xl`, mass-budget name column `minmax(170px,1.4fr)` with wrapping, and Aero
lifting-surface names wrapped instead of the ineffective inline `truncate`. No
drawer breakpoint changed.

Built measurements (`gate2-after/after-probe.json`):

| Size | Header scrollWidth / innerWidth | Top bar height | Airframe stage header | Run rect (height) | Compare height | Subtitle sw/cw | Mass names clipped |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1600×1000 | 1600 / 1600 | 44 | 42 | x1326 w192 h26.75 | 26.5 | 381 / 381 | 0 |
| 1280×800 | 1280 / 1280 | 44 | 56 | x1065 w133 h26.75 | 26.5 | 604 / 604 | 0 |
| 1024×768 | 1024 / 1024 | 44 | 56 | x809 w133 h26.75 | 26.5 | 673 / 673 | 0 |
| 800×600 | 800 / 800 | 44 | 56 | x585 w133 h26.75 | 26.5 | 704 / 704 | 0 |

Run is fully visible in every case; the visible fraction is 1.0. Before the
change, at 1280 the Run rect was y `-1.25` with height `45.5`, Compare was
`43` px high, the subtitle was `381/306`, and four mass names were clipped
(`151/140` etc.). RMP15-C05's 800×600 header-fit and Run-visible guarantee is
asserted again in `preview-journeys`.

### 9. Caveat text — wrapped

`kit/Status.tsx` gate reasons and the Flight Results `Basis` column no longer
use single-line `truncate`; they wrap with `break-words leading-snug`. No
caveat wording changed. At base the Verify reasons were `733/391` and
`1755/324`; after the change both Verify and Recovery report zero clipped
`[data-gate-reason]` elements, and Flight Results reports 13 basis cells with
zero clipped.

### 10. Landing page — version and images

`index.html` carries `%APP_VERSION%`; a Vite `astraea-app-version` plugin with
`transformIndexHtml` replaces it from the `package.json` version already read by
the config. Dev and build both get `Free · Beta 0.10.0 · …`; no second hardcoded
number remains. `vite.config.test.ts` invokes the plugin handler and asserts the
package version. `scripts/capture-screenshots.mjs` was rerun from the final
build, replacing all six `public/landing/*.webp`; the hero/parts tree no longer
shows the removed “Airframe Transition” part.

## Verification

All commands were run from the worktree. Memory was checked before heavy steps;
Rust builds used `CARGO_BUILD_JOBS=2`, Vitest `--maxWorkers=2`, and only one
browser/server ran at a time.

- `npx tsc --noEmit` → exit 0 (`gate2-after/tsc.log`).
- `npx vitest run --maxWorkers=2 src/console` → **49 files / 393 tests passed**
  (`gate2-after/vitest-console.log`).
- `npx vitest run --maxWorkers=2` → **150 files / 1820 tests passed**
  (`gate2-after/vitest-full.log`).
- `npx vitest run --maxWorkers=2 vite.config.test.ts --reporter=verbose` →
  1 file / 1 test passed; file and test name printed
  (`gate2-after/version-test-verbose.log`).
- `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` → exit 0
  (`gate2-after/build-final.log`); built landing contains
  `Free · Beta 0.10.0 · …`.
- `pnpm test:browser` → exit 0, all existing journeys plus the new assertions
  (`gate2-after/test-browser.log`). No console or CSP errors in the final probe
  (`after-probe.json`).
- After-probe screenshots: all eight stages at 1600×1000, 1280×800 and
  1024×768, the Mission site form, Flight Results, and the 800×600 header
  (`gate2-after/screenshots/`).
- `node scripts/capture-screenshots.mjs` → exit 0, six images captured
  (`gate2-after/capture-screenshots.log`).

### Base falsifier runs (`f8e1095`)

Recorded in `gate2-base/FAILURES.md` with logs. Highlights:

- Aero test: rendered `0 parts carry no lift ()` (expected null).
- Mission test: site card `Elevation0m`, no `Not set`.
- Flight inspector test: three editable launch-setup inputs.
- Controls test: `./Controls`/`./Disclosure` absent.
- Landing version test: `index.html` had no placeholder; built eyebrow read
  `Beta 0.9`.
- Browser probe: raw control counts per stage, site input `578×36`, 1280 Run
  wrapped (`h45.5`, y `-1.25`), Compare `h43`, subtitle/mass names clipped,
  gate reasons `733/391` and `1755/324`.

## Deliberately not done

- Items 6 (3-D viewport look) and 7 (empty inspector with no selection) — owner
  design decisions, out of this lane.
- No preset site altitude; no engine, schema, export, gate, threshold or physics
  change.
- No drawer breakpoint change (approved choice b).
- Native select option popups remain OS-drawn (approved choice a).
- `README.md` and `docs/screenshots/` were not recaptured; no broken in-scope
  string was found there.

## Open questions for the owner

None. The two Gate 1 choices were approved and implemented as stated.
