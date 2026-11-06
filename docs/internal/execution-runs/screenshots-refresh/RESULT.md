# Lane screenshots-refresh — result

Status: implementation complete, **awaiting coordinator review**. This lane cannot
self-accept, and it reviewed none of its own images (they are checked by numbers
here; the coordinator inspects them visually).

- Branch: `screenshots-refresh`
- Pin: `22bdf40d80cf28a60b7047a58c81aebd63be26fc` (lane assignment on `frontend/design`)
- Script, crops and `--readme` mode: `a0c2b0b` — `scripts: measure screenshot crops from the DOM`
- README set: `07cc481` — `docs: recapture the README screenshots from the current build`
- Landing set: `cc769ae` — `docs: recapture the landing-page screenshots from the current build`
- Changelog: `1fd2665` — `docs: note the screenshot refresh in the changelog`
- This commit — `scripts: capture under the production CSP`: the capture server now
  serves `dist` with the site's own policy, both sets were re-run from the same
  build under it, and this report was written. The five README files are
  byte-identical to the CSP-less run; the hero and Motor files were re-saved with
  the same dimensions and a few bytes of render-timing difference.

No product source (`src/**`), engine, test or config change. Nothing pushed,
merged, released or published.

## What changed

### `scripts/capture-screenshots.mjs`

1. **Crops come from the DOM.** The old `WORKSPACE = { x: 319, y: 44, width:
   956, height: 928 }` assumed a permanently open inspector; `ui-polish-2` now
   auto-collapses it on Airframe and Aero, so the old crop cut into the workspace
   and left dead space. The script now measures:
   - the stage `<main>` box for feature images (1281 CSS px wide with the
     inspector collapsed, 956 with it open);
   - `<main>` plus `[data-inspector-panel]` for the two shots whose subject is an
     inspector control (aero-inputs, live-sizing); it waits out the 160 ms width
     transition and fails if the panel is collapsed;
   - the dock from its own `role="separator"` down to the bottom of `<main>`.
   `rect()` rounds out to whole CSS pixels, so the PNG is exactly
   `clip × deviceScaleFactor`.
2. **`--readme` mode** captures the five README images into `docs/screenshots/`
   with the existing names and the assignment's settings (NASA Student Launch
   preset, 1600×1000, deviceScaleFactor 2, WebP q82). Default mode still writes
   the landing set to `public/landing/`; a positional `outDir` still overrides.
3. **Numeric self-checks** replace "captured $name": PNG IHDR dimensions must
   equal the crop × 2, the WebP must exceed 20 KB, and each shot declares DOM
   evidence checked *before* the shutter (stage rail `aria-current`, selected
   dock tab, panel visibility and position inside the crop, `data-layout-state`,
   `data-layout-length`, `data-markers`, gate/row counts). `solvedViewport()`
   rejects the WebGL fallback and a layout length of exactly 1 (the empty-scene
   fallback) — see finding 2.
4. **Monte Carlo** no longer waits 180 s for the string `/succeeded/`, which the
   UI never renders (that wait always timed out and the shot was taken blind).
   It now waits for `[data-mc-outcome-counts]` and for the run spinner to leave,
   asserts the requested run count and the plotted landing count, and raises the
   dock with a real pointer drag of its separator so the cloud, the 50/90/99 %
   rings and the summary statistics are actually inside the crop.
5. **The capture server applies the production CSP.** Vite preview does not read
   `dist/_headers`, so the old script captured a page served without its
   security policy. The script now reads the Cloudflare header from `dist`,
   passes it as a preview header (the same way `scripts/browser-smoke.mjs` does), and
   fails if the app response lacks it.

The old script took `montecarlo.webp` with no check at all; the new one reports
`100 runs, 100 supported nominal, 100 plotted`.

### Images and docs

- `docs/screenshots/{design,aero-inputs,flight,verify,live-sizing}.webp`
- `public/landing/{airframe,hero,motor,flight,verify,montecarlo}.webp`
- `README.md`: one alt line — "Dragging a body-tube dimension slider…" →
  "Dragging the fin-span slider…", because the live-sizing image now holds the
  fin-span slider. Every other alt/caption still matches its image (checked one
  by one against the DOM assertions in the table below).
- `CHANGELOG.md`: one bullet at the top of 0.10.0 “Changed”.

## Commands actually run

| Command | Result |
|---|---|
| `pnpm install --frozen-lockfile` | exit 0, 636 ms |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` (at the start and again before the final captures) | exit 0 both, `tsc` + `vite build` clean |
| `node --check scripts/capture-screenshots.mjs` | exit 0 |
| `node scripts/capture-screenshots.mjs --readme` | exit 0, 5 images under the production CSP, log `/tmp/opencode/capture-readme.log` |
| `node scripts/capture-screenshots.mjs` | exit 0, 6 images under the production CSP, log `/tmp/opencode/capture-landing-csp.log` |
| `magick identify -format …` on all 11 files | numbers in the tables below |

The final images were produced after the last `pnpm build`, from the committed
script, with `dist` served under the site's own `Content-Security-Policy` (the
script fails if the app response has no CSP). The five README files are
byte-identical between the CSP-less run and the CSP run, so the policy changes
no pixels. Across runs the whole-window hero and the Motor shot differ by tens
of bytes from render timing, so image bytes are not a reproducible artefact —
dimensions and checks are.

## Per-image numeric checks

CSS clip is the DOM-measured rectangle; pixels are the actual PNG dimensions the
script compared against it; bytes are the committed WebP size. Mean, standard
deviation and colour count come from `magick identify` and show a real,
non-blank frame (a blank panel has one colour and σ ≈ 0).

### README set — `docs/screenshots/`

| File | CSS clip | PNG | WebP bytes | mean | σ | colours | DOM evidence at the shutter |
|---|---|---|---|---|---|---|---|
| `design.webp` | 319,68 1281×904 | 2562×1808 | 81322 | 0.0880 | 0.0843 | 23923 | rail on Airframe; `data-layout-state=ready`, length 2.97 m, markers present; “Live stability and flight preview” inside the crop; Mass budget tab selected; 7 mass rows |
| `aero-inputs.webp` | 319,68 1281×904 | 2562×1808 | 123070 | 0.0885 | 0.0890 | 19925 | rail on Aero; fin selected (inspector 320 px open); “Vehicle aero inputs” and the built-up toggle inside; `Airfoil section` select inside; viewport ready, 2.97 m, markers present |
| `flight.webp` | 319,68 956×904 | 1912×1808 | 50634 | 0.0822 | 0.0646 | 13915 | rail on Flight; Timeline tab selected; “Flight time” scrubber present; timeline SVG reaches into the crop; viewport ready, 2.97 m |
| `verify.webp` | 319,68 956×904 | 1912×1808 | 104810 | 0.0828 | 0.0776 | 4486 | rail on Verify; 5 gate reasons; Landing-speed row fully inside the crop (y 478–566) and cites “35 ft/s” |
| `live-sizing.webp` | 319,68 1281×904 | 2562×1808 | 141892 | 0.0950 | 0.1043 | 39844 | rail on Airframe; fin span 180 → 239 mm with the pointer still down; span slider inside the crop; viewport ready, 2.97 m, CG/CP markers present |

### Landing set — `public/landing/`

| File | CSS clip | PNG | WebP bytes | mean | σ | colours | DOM evidence at the shutter |
|---|---|---|---|---|---|---|---|
| `airframe.webp` | 319,68 1281×904 | 2562×1808 | 81322 | 0.0880 | 0.0843 | 23923 | rail on Airframe; viewport ready, 2.97 m, markers; stability strip inside the crop |
| `hero.webp` | whole window | 3200×2000 | 150636 | 0.0883 | 0.0889 | 34042 | rail on Aero; viewport ready, 2.97 m, markers; stability strip visible |
| `motor.webp` | 319,68 956×904 | 1912×1808 | 72038 | 0.0629 | 0.0759 | 8690 | rail on Motor (inspector open, so main is 956) |
| `flight.webp` | 319,68 956×904 | 1912×1808 | 50976 | 0.0822 | 0.0647 | 13634 | rail on Flight |
| `verify.webp` | 319,68 956×904 | 1912×1808 | 104810 | 0.0828 | 0.0776 | 4486 | rail on Verify |
| `montecarlo.webp` | 319,372 956×600 | 1912×1200 | 56962 | 0.0879 | 0.0874 | 13071 | Monte Carlo tab selected; 100 requested, 100 supported nominal, 100 plotted; scatter and “Sample 50 % radius” fully inside; dock raised to 600 px by dragging the separator |

## Findings and things deliberately not done

1. **`index.html` now carries stale intrinsic sizes for the landing images.**
   The regeneration changes the real pixel sizes, so the hardcoded `width`/
   `height` attributes no longer match: airframe `1912×1856` → **2562×1808**,
   flight/motor/verify `1912×1856` → **1912×1808**, montecarlo `1912×812` →
   **1912×1200**; hero is unchanged (`3200×2000`). `landing.css` sets
   `width:100%; height:auto`, so this only misstates the pre-load aspect ratio
   (a layout-shift hint), it does not distort the images. `index.html` is outside
   this lane's file scope; the coordinator should decide whether to update those
   five attributes (or ask me to). The same file's airframe alt says "with the
   parts tree"; the crop excluded the parts panel before and still does, so that
   wording was already inaccurate — also untouched.
2. **Enabling the built-up aero model blanks the 3D view (pre-existing defect,
   not fixed here).** With *Use built-up aero model (beta)* checked:
   `data-layout-length` drops from 2.97 to 1 and the rocket disappears from
   Airframe and Aero, leaving only the CG/CP markers. Cause: the provider
   stability DTO empties the component contributions
   (`crates/astraea-engine/src/models.rs:1377-1397`,
   `contributions: Vec::new()`, `breakdown_unavailable: true`), `layoutFrom`
   builds `parts` from them (`src/console/viewport/Vehicle3D.tsx:21-27`) and
   `VehicleModel` skips every part without a layout entry
   (`src/console/viewport/Vehicle3D.tsx:116`). Same viewport crop, same session:
   β off σ 0.0723 / 4522 colours; β on σ 0.0241 / 1402 colours (grid and markers
   only). The `aero-inputs` image therefore keeps the legacy model selected — the
   inputs the built-up model reads are the same rows, and a blank canvas would
   misrepresent the Aero workspace. The previously committed image has similar
   whole-frame statistics (σ 0.0915, 18 969 colours), [INFERENCE] so it was taken
   with the legacy model selected too. The script now fails a capture whose
   viewport length is ≤ 1 m, so this cannot slip back in silently. Fixing it needs a
   product-source decision (keep the legacy layout for drawing while the beta is
   selected, or make the provider return part stations), which this lane may not
   make.
3. **The Monte Carlo panel does not fit the Flight dock's first-use height at
   1600×1000.** The dock opens at 303 CSS px (content 263) while the scatter is
   320 px tall and the outcome ledger starts at y 1026, so the default view shows
   the controls and only the top of the cloud. The capture raises the dock to
   600 px with a real separator drag — a state a user can reach — so the image
   matches the landing-page caption. The default-height behaviour itself is
   unchanged and not judged here.
4. **No unit tests were run.** No code under test changed: the diff is one
   standalone capture script plus images and docs. `pnpm build` ran `tsc` and the
   production bundle; the captures are that bundle served with its CSP in
   Chromium under SwiftShader, driven by Playwright mouse input (the live-sizing
   shot holds a real pointer drag). `pnpm test:browser` was not run. No
   screenshot was opened, read or attached by the author; every check above is a
   number or a DOM assertion.
5. **Raw logs** are at `/tmp/opencode/capture-readme.log` (pre-CSP README run),
   `/tmp/opencode/capture-landing-csp.log` (final landing run) and
   `/tmp/opencode/build-final.log`, outside the repo. The CSP README re-run was
   printed to the session rather than saved; its per-image numbers are identical
   to the pre-CSP run. The tables above are the durable record.

## For the coordinator

- Inspect the eleven images visually; the numbers say they are the right size
  and not blank, but only you can judge composition, cropping and whether each
  caption matches.
- Decide on finding 1 (five `index.html` size attributes) and finding 2 (built-up
  beta blank viewport, which needs its own lane).
- If any image needs a different composition, the crop, the selected part, the
  dock height and the drag distance are the knobs in `scripts/capture-screenshots.mjs`;
  re-running is two commands after `pnpm build`.
