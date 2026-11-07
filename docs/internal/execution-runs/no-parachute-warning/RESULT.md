# Lane `no-parachute-warning` — result

Author: OpenCode Go `opencode-go/deepseek-v4.1-flash` (variant max). **Not self-accepted.**
Coordinator review pending.

- Worktree `/home/ak/.t3/worktrees/astraeat3/t3-5f32a0c5`, branch `no-parachute-warning`.
- Pin `8b31787cb7e07164058d964e0a6f248eb0f451aa`. Gate 1 note `0a0a3d9`.
  Implementation `576be3b`. This report is the commit after it.
- Approval: coordinator message 2026-11-07 — Gate 1 approved; all four decisions accepted
  (existing `Note` warn styling, include candidate Recovery, small shared helper, current
  design only). The browser block must undo all three actions and assert original component
  identities/order and current-result freshness, not merely the count.
- No push, merge, release, deploy or self-acceptance.

## What changed

| File | Change |
|---|---|
| `src/console/shell/NoParachuteNote.tsx` (new, 27 lines) | Shared note. `hasParachute` is type-only (`components.some(c => c.type === 'parachute')`); `NoParachuteNote` renders one `Note tone="warn"` with the exact sentence `No parachute in this design.`, or `null`. `data-no-parachute-note` is a DOM test hook. No panel, banner or run logic. |
| `src/console/shell/RunReadiness.tsx:4,21` | Renders the note inside the existing `Run readiness` region, after the `· ready to run` line and before the mount/preflight diagnostics. |
| `src/console/stages/Recovery.tsx:13,34-35,44` | Renders the note directly under `StageHeader` in all three branches: candidate refusal, no-run, and committed-run. It sits outside the results scroll container, so it is not covered by the stale-run opacity on recorded results. |
| `src/console/shell/noParachuteWarning.test.tsx` (new, 163 lines) | Seven UI regression tests (below). |
| `scripts/preview-journeys.mjs:158-224` | One self-contained built-UI block: remove both chutes, assert Flight/Recovery notes, amber color, non-blocking Run, stale banner and visible recorded stats; add one chute and assert both notes disappear; undo add + two removals with exactly three structural undo steps; deep-compare restored component ids/names/order to the pre-edit list; assert no stale banner, no "not a current result", and `Valid run` is visible. |

No other production, test, preset, engine, physics, threshold, schema, export or input file
was changed. `theme.ts` is untouched. No `preflight` or gate code was touched.

## Behavior

| Current design | Committed run | Flight readiness | Recovery |
|---|---|---|---|
| no chute | none | note shown | note shown in the no-run branch |
| no chute | recorded with chutes | note shown | note shown; recorded stats/events still render |
| chute present | none | note hidden | note hidden |
| chute present | recorded without chutes | note hidden | note hidden; recorded stats/events still render |

- Current design only: `s.design.vehicle.components` (the committed project design). It never
  reads `s.committed.run.events`, `s.committed.design`, the parachute table rows, or staged
  airframe drafts.
- Any `parachute` component counts; no diameter/Cd/mass/order/deployment rules.
- Candidate Recovery shows the note; candidate Flight is unchanged and has no readiness area.
- Removing every parachute leaves `currentPreflight().runnable === true`; the note is text only.

## Checks actually run

| Command | Result | Log |
|---|---|---|
| `pnpm install --frozen-lockfile --prefer-offline` | exit 0, 280 packages linked from the local store | — |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build:engine` | exit 0 (first build; subsequent builds no-op) | — |
| focused vitest: `noParachuteWarning`, `editBoundaries`, `recoveryResults`, `flightLayout`, `stageRendering`, `--maxWorkers=2` | **5 files, 35 tests passed, exit 0** | `/tmp/opencode/no-parachute-focused.log` |
| `pnpm exec tsc` | exit 0, no output | `/tmp/opencode/no-parachute-tsc.log` |
| `PATH="$HOME/.cargo/bin:$PATH" CARGO_BUILD_JOBS=2 pnpm build` | exit 0; vite built 3133 modules in 4.21 s | `/tmp/opencode/no-parachute-build.log` |
| `ASTRAEA_BROWSER=chromium node scripts/browser-smoke.mjs` | exit 0; every preview acceptance passed, including the new block | `/tmp/opencode/no-parachute-browser.log` |
| DOM probe on built `dist/`, production CSP, Chromium 1600×1000 | exit 0; exact values below; no page errors | `/tmp/opencode/no-parachute-probe.log` |

The generated `src/engine/astraea_engine.wasm` from this worktree is sha256
`4a897bbe4b96e98149c42c2413a4575a5511051e40039238690620aa0330b837`; no `crates/` or engine
source changed in this lane.

### Built-UI evidence (DOM only; no image read)

From `probe-no-parachute.mjs`, built `dist/` under the production CSP, Chromium 1600×1000:

```json
{
  "flight": {
    "noteText": "No parachute in this design.",
    "noteColor": "rgb(245, 181, 68)",
    "runDisabled": false,
    "staleBanner": "Showing the committed run. 2 inputs have changed since; press Ctrl+Enter to re-run.",
    "apogee": "Apogee (committed run) 533 m, Modeled"
  },
  "recovery": {
    "noteText": "No parachute in this design.",
    "noteColor": "rgb(245, 181, 68)",
    "noteBox": { "x": 319, "y": 110.9375, "width": 956, "height": 27.125 },
    "landingSpeed": "Landing speed 6.0 m/s, Modeled",
    "landingStatBox": { "x": 350, "y": 188.8125, "width": 61, "height": 27 },
    "descentEventsVisible": true
  },
  "flightAfterAdd": 0,
  "recoveryAfterAdd": 0,
  "afterUndo": {
    "noteCount": 0,
    "staleBannerCount": 0,
    "notCurrentCount": 0,
    "validity": "Valid run"
  }
}
```

`restored` deep-equals `original`: the seven NASA Student components, ids and order
(`nsl-nc`, `nsl-bt1`, `nsl-trans`, `nsl-bt2`, `nsl-fins`, `nsl-drogue`, `nsl-main`).
`pageErrors` is empty.

The `browser-smoke.mjs` log contains the new pass line:

    Preview acceptance passed: no-parachute note is current-design only, non-blocking,
    removed by a returning chute, and fully undone

### Falsifier (the tests are not tautological)

Created a detached worktree at the pin `8b31787`, copied only the new test file, linked
`node_modules` and the generated wasm, and ran the same focused test:

    Test Files  1 failed (1)
    Tests       6 failed | 1 passed (7)

All six positive assertions fail because the pin has no note; the single pass is the
negative "hides the note when a chute is present" case, which is vacuously true before the
feature exists. Log: `/tmp/opencode/no-parachute-before.log` (39,440 bytes). The temporary
worktree was removed.

## Deliberately not done

- Full suite and all browser engines: left for the combined export, as assigned.
- No screenshot was taken, opened or read; the coordinator will inspect screenshots and
  publish the named design backup.
- No `theme.ts` comment change: the owner approved the existing amber `Note` styling.
- No preflight issue, gate, validity, threshold, physics, engine, preset, schema or export
  change. Nothing blocks a run.

## Remaining

Coordinator review of implementation `576be3b` and this record. The lane is ready for the
combined full-suite/all-engine export check.
