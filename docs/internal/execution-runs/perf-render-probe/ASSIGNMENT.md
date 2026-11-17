# Lane assignment: perf-render-probe

## Pin

| | |
| --- | --- |
| Worktree | `~/.paseo/worktrees/3s8t98rp/perf-render-probe` |
| Branch | `perf-render-probe` |
| Base SHA | `250c8f9f478591a9f981a10a2f96e7ad45829031` (= `origin/main`) |

First reply must be one line: `cwd confirmed <pwd> branch <branch> HEAD <sha>`.

## Why this lane exists

The owner merged a 3D-viewing upgrade (`250c8f9`, viewport-render-quality:
studio IBL, 128-segment bodies, bevelled fins, 2x supersampling). The
orchestrator measured its cost with a throwaway script that lives outside Git:
`/home/ak/astraea-evidence/perf-3d-viewing/render-ab.mjs` (results in
`RESULTS.md` next to it). The owner approved committing that probe so every
future 3D change gets the same check (owner, 2026-11-11: "go ahead").

## Scope

In scope:
1. Add `scripts/perf/compare-render-ab.mjs`: a cleaned, reusable version of
   `render-ab.mjs`. Read the original fully first. Match the CLI and header-comment
   style of `scripts/perf/compare-app-ab.mjs` (`--baseline-dist`, `--after-root`,
   `--runs`, `--out`; usage block at the top; "Raw output stays outside Git").
   - Remove every hardcoded absolute path (worktree paths, the
     `~/.cache/ms-playwright/chromium-1234` executable, the evidence path).
     Use `import { chromium } from 'playwright'` like `compare-app-ab.mjs`.
     Optional `--chromium <path>` flag for an explicit executable.
   - Keep the measurement itself identical: interleaved baseline/after rounds,
     production CSP from `dist/_headers`, real-GPU launch args, orbit drag
     (rAF fps, p50/p95 frame, main-thread task seconds via CDP metrics,
     drawing-buffer size before/after), then Flight playback rAF fps over 3 s.
   - Add a short summary print at the end (median per variant for orbit fps,
     orbit task seconds, playback fps, and the paired median delta).
2. Add one line to `package.json` scripts only if other `scripts/perf` probes
   already have one there; otherwise do not touch `package.json`.
3. A short `RESULT.md` in the lane root (see report format).

Out of scope: any `src/`, `crates/`, test, CI, `vite.config.ts` or dependency
change; `analyze-render.mjs` and `longtask-timeline.mjs`; docs other than the
header comment; the register, manifest, task board or handoff files.

## Non-negotiables

- Do not change what is measured or how (no relaxed waits, no different
  selectors unless the original one is broken on `250c8f9`, and then say so).
- No secrets, no host-specific absolute paths, no personal paths in the file.
- Raw output stays outside the repo. Do not commit JSON results.
- Keep jobs low: this host is memory-constrained. Before any build or browser
  run check `free -h`; if under 2 GiB available, wait and report.
  Builds: `env CARGO_BUILD_JOBS=2 pnpm build`. Kill preview servers and
  browsers when done.
- You cannot accept your own work. Do not merge, push, or edit records.

## Gate 1 (before writing the file)

Reply with a short design note: the CLI flags, what you remove, what you keep
verbatim, and how you will verify it. Then wait for approval.

## Required evidence

- `node --check scripts/perf/compare-render-ab.mjs` output.
- One real smoke run: `pnpm install --frozen-lockfile` and
  `env CARGO_BUILD_JOBS=2 pnpm build` in the lane, then
  `node scripts/perf/compare-render-ab.mjs --baseline-dist <lane>/dist --after-root <lane> --runs 1 --out <scratch>/smoke.json`
  (same build on both sides is fine for a smoke run). Paste the console output.
- `git diff --stat 250c8f9..HEAD`.

## Acceptance (orchestrator decides)

Script runs end to end with no hardcoded paths, produces the same metric
fields as the original, and the diff touches only `scripts/perf/` (+ optional
`package.json` line) and `RESULT.md`.

## Report format

`RESULT.md`: pin, commits, what changed, exact commands run with outputs,
what was not done and why. Final chat line: `branch perf-render-probe, HEAD <sha>, checks <state>`.

## Routing record

- 2026-11-11: dispatched to `opencode` / `opencode-go/deepseek-v4.1-flash` (variant max);
  failed before any work: "Insufficient balance" (OpenCode Go).
- 2026-11-11: re-dispatched to the routing.md fallback `pi` / `deepseek/deepseek-flash`
  (DeepSeek direct, thinking max, metered).
