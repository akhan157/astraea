# A1 implementation — in progress, not self-accepted

Base: a2d6bae37194a4e2e319468a7503a3ed0e548e56. Applied the owner-approved wording and added an ensemble refusal assertion. Independent review and acceptance remain outstanding.

Commands: `free -h` exit 0 (8.0 GiB available); `pnpm exec tsc --noEmit -p .` exit 0; focused Vitest command covering stageRendering, expectedError, expectedError.integration, flightLayout and ModelStatusPanel exit 1 (four suites could not resolve the missing `src/engine/astraea_engine.wasm`); full `pnpm exec vitest run --maxWorkers=2` interrupted, exit 130, after repeated missing-WASM failures; `pnpm exec vite build` exit 1, missing WASM. pnpm also warned that the existing node_modules symlink is not a real hoist directory. The new test was added after the focused run and has not run.

No screenshots or banner fit check were made because the built app failed. No server or browser started. No engine or WASM changes, network, or push. Next: provide the matching existing engine artifact in this lane without modifying it, rerun all checks and capture the requested production-CSP screenshots. No acceptance claimed.

## Verification rerun, 2026-11-16

Implementation commit `54caae13ca63f5c4309fec1a44b917825edacea2`. The provided `src/engine/astraea_engine.wasm` hashes to `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`; it was not rebuilt or committed. `free -h` exit 0, 8.6 GiB available. Each long check ran detached with its exit recorded:

- `pnpm exec tsc --noEmit -p .`: exit 0 (`/tmp/a1/tsc.log`).
- `pnpm exec vitest run --maxWorkers=2 src/console/stageRendering.test.tsx src/console/data/expectedError.test.ts src/console/stages/expectedError.integration.test.tsx src/console/stages/flightLayout.test.tsx src/console/evidence/ModelStatusPanel.test.tsx`: exit 0, 5 files / 26 tests (`/tmp/a1/focused.log`).
- `pnpm exec vitest run --maxWorkers=2`: exit 0, 193 files / 2,235 tests (`/tmp/a1/full.log`).
- `pnpm exec vite build`: exit 0 (`/tmp/a1/build.log`).

pnpm warned that the existing node_modules symlink is not a real hoist directory; the commands continued and returned the exits above. Production-CSP screenshots used Vite preview with the exact CSP from `dist/_headers`, checked against HTTP response headers, and Chromium. At 1280 × 800 the collapsed banner had one text rectangle, width 562 px; clientWidth and scrollWidth were both 562 px. The tooltip is the native title, captured with headed Chromium under Xvfb and an X11 pointer; its exact title was also read from the built page. Browser, server and virtual display were closed.

Screenshot SHA-256 (paths relative to the A1 evidence directory):

- `banner-collapsed.png`: `2b4de63445c7a8d0fa7599064a91a2848d62b223ac3ebb6f46fb383e615ab64a`
- `banner-expanded.png`: `ab462931e802980f015a01f146e8ad1355dc75f01d013af1a454845251c6fe54`
- `landing.png`: `c9a044e530ade5261e31faff862e11b91cd8bc7714f6b2dbf8583fd8b199d88a`
- `flight-error-line.png`: `efc0b9236877f046e3701f3bf0ccdbf680c6b12e5e55b29dd1fe8f7e2f3b8e95`
- `model-status.png`: `bec5894f1a579da8a56822fba197a57246161a7daac556726c9cd94fbeb9d758`
- `nozzle-hint.png`: `e834c17508e8987e3d0cb100f62f03043c58ac89c504d0de9edc1a011b53fa05` (input, headless).
- `nozzle-tooltip.png`: `087745a1c6faf6640c3743e28ffce7921a0e9b7bea7a5c824b5a47e2304b6d09` (native tooltip, headed X11).

No push, engine edits, WASM rebuild, or self-acceptance. Independent review remains required.

## Second-set owner decisions (chooser label, README), 2026-11-16

Base `993507e`. The previous author's uncommitted work on `README.md`, `src/console/stages/Flight.tsx` and `src/console/stages/flightLayout.test.tsx` was reviewed against the second owner decisions and kept; this turn verified it, captured the missing screenshots and reran every check.

- `Flight.tsx:43` summary now reads `Change flight model…`. The only test that referenced the old `Change…` text, `flightLayout.test.tsx:120`, asserts the new text inside a `summary`. The uniqueness check is restored at `:122` (`getAllByText('Change flight model…')` has length 1) under the unchanged "not rendered twice" comment.
- `README.md` blockquote (previously lines 30–34) is `**0.10 beta.**` + the full claim + the accuracy-record sentence. A normalization check compared the rendered blockquote (line joins collapsed) against `**0.10 beta.** ` + `BETA_ACCURACY_CLAIM` from `src/console/evidenceClaims.ts` + ` See the [accuracy record](docs/accuracy.md) for tested cases and known limits before using any number operationally.`: exact match, 478 characters.

Host before the checks: `free -h` 9.3 GiB available, `uptime` load average 2.78 (1 min); full suite started at 2.78, below the 6 gate. `mkdir -p /home/ak/a1-fix/tmp` first; every long command ran detached with `TMPDIR=/home/ak/a1-fix/tmp` and its exit echoed:

- `pnpm exec tsc --noEmit -p .`: exit 0 (`/home/ak/a1-fix/tsc.log`).
- `pnpm exec vitest run --maxWorkers=2 src/console/stages/flightLayout.test.tsx src/console/stageRendering.test.tsx src/console/data/expectedError.test.ts src/console/stages/expectedError.integration.test.tsx src/console/evidence/ModelStatusPanel.test.tsx`: exit 0, 5 files / 26 tests (`/home/ak/a1-fix/focused.log`).
- `pnpm exec vitest run --maxWorkers=2`: exit 0, 193 files / 2,235 tests (`/home/ak/a1-fix/full.log`).
- `pnpm exec vite build`: exit 0 (`/home/ak/a1-fix/build.log`).

pnpm again warned that the `node_modules` symlink is not a real hoist directory; `node_modules` is untracked and not committed. `vite build` copied the unchanged engine WASM as `dist/assets/astraea_engine-DkJqX04-.wasm`, sha256 `bc19590b8e75091f1123cb497a388b47209c0461b0ecda7eb02d6064fead57ff`; nothing was rebuilt.

Screenshots of the built app at 1280 × 800, Chromium headless, Vite preview serving `dist/` with the exact CSP from `dist/_headers` and the response header asserted equal (`/home/ak/a1-fix/capture.log`). The imported project was `/home/ak/astraea-evidence/goal-collegiate-accuracy/K4/byrum.astraea.json`; its committed run carried site temperature 37.78 °C, so the error band was not withheld.

- `flight-error-line-temperature-set.png`: full viewport. The rendered line is exactly `Average apogee error ±5.5 % (dev. data, 20 rockets; not a limit)` in the Flight run panel; box `{x:976,y:215.9,w:288,h:28.9}` inside the viewport. sha256 `71177353d45288c85d53ead824e2578a68aefa153f3139abcbe05cfd67c85986`.
- `flight-model-chooser.png`: 1000 × 120 clip of the Flight chrome row, showing the chooser summary `Change flight model…`. The summary's Chromium accessibility node is role `DisclosureTriangle`, name `Change flight model…`, focusable, collapsed; box `{x:331,y:118.9,w:160,h:27.3}`. sha256 `7abcd6a7a46c5ddc76342981aa9f26727ca2b070475e3c933b94723183e1be90`.

The capture scripts run this turn (the previous author's `.a1-fix-capture.mjs` plus a role probe) were deleted before the commit; no scratch file is in git. Browser and preview server were closed; no process started here remains.

Not done: no engine, `crates/` or WASM rebuild; no physics, threshold or K4 band change; no network, push, tag or release; no edits to `GOAL-HANDOFF.md`, the release report or the acceptance register; sealed cohort and round-2 result paths were not opened. Independent review and acceptance remain outstanding; this author does not self-accept.

