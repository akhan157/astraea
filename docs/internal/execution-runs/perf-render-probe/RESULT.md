> Moved 2026-11-14 from the repo-root `RESULT.md` (main @ `a57a7c8`, lines 1–207) during owner-approved tidy-up. Text unchanged.

# Lane result: perf-render-probe

## Record placement (flagged for the reviewer)

`ASSIGNMENT.md` asks for a short `RESULT.md` in the lane root. The root
`RESULT.md` merged at `250c8f9` was the previous lane's record
(`viewport-render-quality`, added in `7f600a3`, updated in `31bd432`); it was
deposited in the same place by that lane. This file replaces it in the working
tree and nothing is lost from history:

```
$ git show 250c8f9:RESULT.md    # previous lane record, blob a232f09
```

If the root file should keep belonging to `viewport-render-quality`, this lane's
record belongs beside it instead (or under `docs/internal/perf-render-probe/`)
and the diff needs a decision before acceptance.

## Pin

| | |
| --- | --- |
| Worktree | `<lane-worktree>` (path in `ASSIGNMENT.md`) |
| Branch | `perf-render-probe` |
| Base SHA | `250c8f9f478591a9f981a10a2f96e7ad45829031` (= `origin/main`) |
| Dispatched at | `73af0cb` (orchestrator `ASSIGNMENT.md`) |

## Commits

| SHA | Contents |
| --- | --- |
| `7fd65d9` | `scripts/perf/compare-render-ab.mjs` (new, 251 lines) |
| this commit (`HEAD`) | `RESULT.md` |

## What changed

`scripts/perf/compare-render-ab.mjs` is the committed form of the throwaway
`render-ab.mjs` (`<evidence>/perf-3d-viewing/`) that measured the
viewport-render-quality merge. The measurement itself is copied verbatim:

- interleaved rounds, odd round baseline→after, even round after→baseline;
- CSP taken from `<after-root>/dist/_headers` and served by both `vite preview`
  instances; baseline served as `preview(dirname(--baseline-dist), basename(--baseline-dist))`;
- launch args `--enable-gpu --use-gl=angle --use-angle=gl --ignore-gpu-blocklist`,
  context `1600x1000` @ `deviceScaleFactor: 1`, `astraea.workstation.toured` set
  before load, `pageerror`/`console.error` captured;
- `load` 60 s → `[data-layout-state="ready"]` 60 s → 1200 ms settle;
- orbit drag: rAF delta collector, CDP `Performance.getMetrics` before/after,
  260 pointer moves on `cos(a)*60 / sin(a)*26` with `a = (i/40)π` around
  `(830,380)`, drawing buffer (buffer px, CSS px, dpr) before and after;
- playback: nav `Pipeline stages` → `/^Flight/`, `[role="slider"][aria-label="Flight time"]`,
  `main canvas:visible`, 800 ms settle, `aria-valuenow` start, `Play` exact click,
  3 s, `Pause` best-effort, `playing` flag.

Removed (only non-reusable parts): the `createRequire` of an absolute
`package.json`, the hardcoded `perf-optimize` baseline root, the hardcoded
`main-merge` after root, the hardcoded `chromium-1234` executable, the evidence
output default, and the `RUNS`/`OUT` env vars. Options are now flags in the
`compare-app-ab.mjs` style: `--baseline-dist`, `--after-root`, `--runs`
(default 4), `--out`, plus optional `--chromium <path>` for a full Chromium.

Added: a `--runs` positive-integer guard, a `summary` key in the JSON and a
closing console summary (per-variant medians for orbit rAF fps, orbit CDP task
seconds, playback rAF fps; paired per-round median deltas; `glRenderer` string
per variant so a SwiftShader/llvmpipe fallback is visible). `package.json` is
untouched: no other `scripts/perf` probe has a script entry there.

## Commands run and output

Node and install (5.1 GiB available before the build, above the 2 GiB floor):

```
$ node --check scripts/perf/compare-render-ab.mjs
(no output, exit 0)
$ pnpm install --frozen-lockfile
Done in 360ms using pnpm v12.14.0
$ env CARGO_BUILD_JOBS=2 pnpm build
dist/assets/three~app-CX-CDfoK.js    992.10 kB │ gzip: 271.32 kB
dist/assets/app-BAER-TpP.js          836.29 kB │ gzip: 243.45 kB
✓ built in 5.48s
$ wc -l scripts/perf/compare-render-ab.mjs
251
```

Smoke A — same build on both sides, explicit full Chromium, `--runs 1`:

```
$ node scripts/perf/compare-render-ab.mjs \
    --baseline-dist <lane-worktree>/dist --after-root <lane-worktree> --runs 1 \
    --chromium "$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome" \
    --out <scratch>/smoke-full.json
1 baseline: orbit raf 60.4 fps (276 frames, p50 16.699999999999818 p95 16.700000000000728, task 0.975s, buffer 2062x1192->2062x1192); playback raf 59.5 fps (181 frames, p50 16.69999999999891, 0->3.0084000000000004s)
1 after: orbit raf 60.4 fps (275 frames, p50 16.699999999999818 p95 16.700000000000728, task 0.953s, buffer 2062x1192->2062x1192); playback raf 46.1 fps (140 frames, p50 16.700000000000728, 0->3.021799999999997s)

glRenderer baseline "ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL ES 3.2)" (2062x1192 -> 2062x1192)
glRenderer after    "ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL ES 3.2)" (2062x1192 -> 2062x1192)
orbit rAF fps       baseline 60.4  after 60.4  paired 0.0 (0.0%)
orbit task seconds  baseline 0.975  after 0.953  paired -0.022
playback rAF fps    baseline 59.5  after 46.1  paired -13.4 (-22.5%)
written /tmp/perf-render-probe/smoke-full.json
(exit 0)
```

Smoke B — identical command without `--chromium`:

```
1 baseline: orbit raf 59.2 fps (286 frames, p50 16.699999999999818 p95 16.700000000000728, task 1.368s, buffer 2062x1192->2062x1192); playback raf 50.1 fps (152 frames, p50 16.700000000000728, 0->3.008199999904633s)
1 after: orbit raf 60.4 fps (272 frames, p50 16.699999999999818 p95 16.799999999999727, task 0.885s, buffer 2062x1192->2062x1192); playback raf 47.5 fps (144 frames, p50 16.699999999999818, 0->3.009799999999998s)

glRenderer baseline "ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL ES 3.2)" (2062x1192 -> 2062x1192)
glRenderer after    "ANGLE (Intel, Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2), OpenGL ES 3.2)" (2062x1192 -> 2062x1192)
orbit rAF fps       baseline 59.2  after 60.4  paired 1.2 (2.0%)
orbit task seconds  baseline 1.368  after 0.885  paired -0.483
playback rAF fps    baseline 50.1  after 47.5  paired -2.6 (-5.2%)
written /tmp/perf-render-probe/smoke-default.json
(exit 0)
```

Default binary resolution (measured, not assumed):

```
$ node -e "import('playwright').then(({chromium})=>console.log(chromium.executablePath()))"
<home>/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome
$ ls <that path>
No such file or directory      # full chromium 1248 is not installed
$ ls ~/.cache/ms-playwright/
chromium-1228  chromium-1234  chromium_headless_shell-1228
chromium_headless_shell-1234  chromium_headless_shell-1248  ...
```

So the default launch used `chromium_headless_shell-1248/chrome-headless-shell`
(a different, newer build than the `--chromium` full Chromium 1234), yet it
still reported the same ANGLE/Intel Iris Xe renderer under the GPU args. It did
not fall back to software on this host. Consequence recorded for use: pass
`--chromium` when A/B numbers must come from one identical browser build, and
read the `glRenderer` line in the summary before trusting a run.

Field parity against the original evidence JSON
(`<evidence>/perf-3d-viewing/render-ab.json`):

```
result   MATCH
orbit    MATCH
playback MATCH
errors: [] []
top-level: [ 'results', 'summary', 'urls' ]   # only the approved extra key
```

Guard and hygiene:

```
$ node scripts/perf/compare-render-ab.mjs --baseline-dist <lane>/dist --after-root <lane> --runs 0 --out <scratch>/bad-runs.json
Error: --runs must be a positive integer; 1 round is the smoke minimum
(exit 1, no browser launched)

$ rg -n 'ms-playwright|perf-optimize|main-merge|astraea-evidence|createRequire|/home/' scripts/perf/compare-render-ab.mjs
no hits

$ pgrep -af '^/[^ ]*ms-playwright' ; pgrep -af '^node .*vite'
no playwright browser
no vite server

$ git diff --stat 73af0cb..HEAD
 scripts/perf/compare-render-ab.mjs | 251 +++++++++++++++++++++++++++++++++++++
 1 file changed, 251 insertions(+)
$ git diff --stat 250c8f9..HEAD
 scripts/perf/compare-render-ab.mjs | 251 +++++++++++++++++++++++++++++++++++++
 1 file changed, 251 insertions(+)

Both taken at HEAD = `7fd65d9`, i.e. before the `RESULT.md` commit; with it the
same commands report two files. Final stat is in the lane report.
```

## Not done, and why

- `package.json`: untouched. No existing `scripts/perf` probe has a script
  entry, and scope item 2 makes that line conditional.
- No push, no merge, no register/board/manifest/handoff edit; the author cannot
  self-accept. Lane branch stays local.
- N=1 smokes only. The playback column is visibly noisy at one round per variant
  (the historical evidence records the same: one after run stalled at 7.3 fps).
  The smoke proves the probe runs and reports; it is not a performance verdict.
- `analyze-render.mjs`, `longtask-timeline.mjs`, `src/`, `crates/`, tests, CI and
  `vite.config.ts` were left alone as out of scope.
- Raw JSON stayed in `/tmp/perf-render-probe/`; nothing under the repo.

## Checks

| Check | State |
| --- | --- |
| `node --check` | pass (exit 0) |
| build in lane | pass (`✓ built in 5.48s`) |
| smoke with `--chromium`, real GPU | pass (exit 0, Intel Iris Xe, `errors: []`) |
| smoke without `--chromium` | pass (exit 0, headless shell 1248, Intel Iris Xe, `errors: []`) |
| metric field parity with original | pass (result/orbit/playback key sets identical) |
| no host paths / absolute paths in file | pass (`rg` no hits) |
| runtime processes cleaned up | pass (`pgrep` anchored: none) |

Author cannot self-accept; review and acceptance are the orchestrator's.

---

- No change to the surroundings, backdrop, grid colours (only tone-mapping
  exemption), viewcube, camera framing geometry, part colour rules, markers,
  seams, `data-*` probes, physics or the shared-renderer lifecycle.
- No full browser-suite run and no push/merge — left to the orchestrator.
