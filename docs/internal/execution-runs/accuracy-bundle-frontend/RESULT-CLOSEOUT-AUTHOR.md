# Closeout author result — three bounded UI gates (2026-11-12)

Author lane `integrate-appbound-e1b`, branch `integrate/appbound-e1b`.
No production source change. Author cannot accept, merge or push; this record
is evidence for the coordinator's independent run and review.

## Pin and source identity

| | |
| --- | --- |
| Base (production pin) | `482616d6bf6e7c0fba392863e30511b6058b7739` (verified ancestor) |
| Head before this record | `4542d4e5a2c1c058bc3809151dbd6eac424a5c8b` (`docs:` design note only) |
| Engine source tree | `git rev-parse HEAD:crates/astraea-engine` = `d164f99ba3e3b7143cd63322912ffa7ef2cd1d7b` |
| `src`/`crates` diff since base | empty (`git diff --stat 482616d..HEAD -- src crates`) |
| Engine WASM | sha256 `21eea59ec76b494591aa546c43ceaf2d7cf296f82e8a28c2b7aa92f1efb2eb2e`, 2 035 057 bytes |
| `dist/assets/astraea_engine-B5C56RG8.wasm` | same sha256, same bytes (checked byte-identical in the runner) |

`CARGO_BUILD_JOBS=2 pnpm build` exit 0 (full log: external
`closeout/closeout-build.log`). This reproduces the lane's previously recorded
`21eea59…` from the same engine source; the root checkout's `91c94095…` is a
different build directory and was not used. Memory before build: 5.2 GiB
available; before the browser run: ≥ 3 GiB available. No vitest run was needed
(no test file changed); no full browser smoke was run.

## What ran

Command: `node scripts/accuracy-closeout.mjs` (new focused runner; the
coordinator runs it independently). Exit **0**, twice: once with an explicit
author evidence path (`author-run.json`, 30 screenshots, sha256
`5e5348c9…`) and once exactly as documented on the committed script
(sha256 `c159fcbf…`, exit 0, `runner-evidence.json`, sha256 `fcfb82a3…`, and
`runner-shots`, 30 screenshots). Both runs produced identical archived
sentences and identical deep-equality results. The committed runner's default
output paths are `runner-evidence.json` / `runner-shots`, so an independent
coordinator run does not overwrite the author evidence.

The built `dist/` was served with the verbatim production CSP parsed from
`dist/_headers`; the document response carried that header; an inserted inline
`<script>` was blocked (`script-src-elem` violation) while
`WebAssembly.compile` succeeded under `'wasm-unsafe-eval'`. The run's own
engine identity shown in Saved Runs is `Engine SHA-256 21eea59ec76b…`, matching
the built bytes. `pageerror`/console-error list is empty.

### Item 1 — nose tip radius (NASA Student Launch, base diameter 152 mm)

- default: `Add Nose tip radius` present; no input; production hint text
  exactly as shipped.
- `Add` stages 1 mm; edit to 1.5 mm accepted; `200` mm is **not clamped** and
  shows the production warning; `−1` mm also warns; returning to 1.5 clears it.
- unrelated geometry: the 2D drawing's polygon/rect/path/line geometry and the
  parts panel including `10.35 kg` are **byte-identical** at absent, 1.5 mm and
  200 mm.
- persistence: apply → `Save to this browser` (the slot reports
  `Saved locally (revision N)`) → reload → `Open saved project` (reports
  `Opened saved project (revision N)`) → field still 1.5 mm; clearing →
  save → reload → open → `Add` is back.
- the limit is enforced by the real engine: with 200 mm applied, Run refuses
  with `prepareVehicle: nose tipRadius 0.2 m on component 'nsl-nc' exceeds its
  nose base diameter 0.152 m` (rendered in the app's run-failure line).

### Item 2 — opted-in saved flight and ensemble provenance (Build → Saved Runs)

Supported origin (NASA, built-up model + flight-drag opt-in; final declared tip
radius 1.5 mm):

- flight 547 m; ensemble 10 runs. Live Results/Monte Carlo lines and the Saved
  Runs archived lines are **identical strings** (flight:
  `data-archived-axial-drag` vs `[data-axial-drag]`, verbatim), and both name
  `nose tipRadius 0.0015 m`.
- after clearing the built-up model (which clears the opt-in), after reload and
  after `Load saved inputs`, the archived records are **deep-equal** to the
  first read (`recordsEqualAfterSettingsClear/AfterReload/AfterLoadInputs` are
  all `true` in `author-run.json`).

Refused origin (Spaceport America practice):

- the legacy baseline flew 5 014 m; with the opt-in the engine refused the
  shape and the flight stayed 5 014 m.
- live and archived lines both read exactly:
  `legacy 25-station Mach drag tables from compute_aerodynamic_curves; legacy
  drag used (refused: calibrated unsupported feature: fin set 'sac-fins' does
  not follow a body tube)` with the production warning
  `Built-up drag was requested but not used for this rocket.`
- same record survives settings clear and reload **byte-for-byte**
  (`recordsEqualAfterSettingsClear/AfterReload` = `true`).

Saved Runs shows the live engine identity `Engine SHA-256 21eea59ec76b…`.
The default project also archives one legacy flight at load with **no axial
line** — the default/absent path stays silent (diagnostic log
`diag-startup-run.log`: `Saved runs · 1` before any click, one `Flight` record,
no axial line).

## Design-note corrections (explicit, not silent)

The pre-edit design note expected a reload to "re-read the project". The app
has **no autosave and no auto-load**: the journey therefore uses the explicit
`Save to this browser` / `Open saved project` actions, and the same status text
(`Saved locally (revision N)` / `Opened saved project (revision N)`) is
asserted there. The note's falsifiers are otherwise unchanged.

The note's CSP falsifier named an eval probe. Under CDP-injected evaluation,
DevTools bypasses page CSP, so that probe is recorded as informational only;
enforcement evidence is the blocked inline `<script>` (`script-src-elem`
violation) plus a successful `WebAssembly.compile` under
`'wasm-unsafe-eval'` and the engine actually flying.

The note placed the run-failure sentence in the run banner; production renders
it in the footer status bar (`Run failed: …`) and a `Run failed` chip in the
stage header. The assertion targets the footer text.

## Failures retained (author script/instrumentation, not product defects)

`attempts/author-run-attempt{1..8}-*.json` and 2 screenshots:

1. eval-based CSP assertion invalid under CDP (DevTools bypasses page CSP);
   replaced by the inline-script + wasm probes. Recorded, not asserted.
2. missing `await` on an ElementHandle value (script bug).
3. display formatting (`1.0` mm) mistaken for a clamp (script bug).
4. run-failure text located in the header instead of the footer status bar
   (selector bug; the refusal itself was correct).
5. `[data-project-status]` is only rendered inside the Project menu; there is
   **no autosave** — the journey now uses the explicit Save/Open actions.
6. 2D/3D mode is stage-local and remounts in 3D, so the geometry read needed the
   2D radio after each run/reload.
7. stale project-menu status read before the new save status landed (poll fix).

## Deliberately not done

- no production `src`/`crates`/register/manifest/board/handoff/review edit;
- no full browser-smoke rerun; no engine rebuild with source changes; no
  threshold/default/schema/physics change;
- no merge, push, tag or release; no branch deletion; no other lane touched;
- the coordinator's independent execution/review and the guard review remain
  outside this author's authority.

## Remaining for the coordinator

1. Run `node scripts/accuracy-closeout.mjs` independently (exit 0 expected;
   evidence goes to the sibling `evidence-accuracy-bundle-frontend/closeout`).
2. Review the screenshots and the two exact archived strings, and the
   settings-cleared/reload deep-equality.
3. Decide disposition and update the acceptance records; the author does not
   self-accept and does not claim physical qualification from these UI checks.
