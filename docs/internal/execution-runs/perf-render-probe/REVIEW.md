# Review: perf-render-probe (orchestrator, 2026-11-11)

Verdict: **accepted and merged** into local `main` at `0bbbda7` (`--no-ff`). Not pushed.

| | |
| --- | --- |
| Lane commits | `73af0cb` assignment (orchestrator), `7fd65d9` script, `08c99ff` RESULT.md (author), `31e5453` median fix (orchestrator) |
| Author | `pi` / `deepseek/deepseek-flash`, thinking max (OpenCode Go author failed on balance before any work) |
| Reviewer | orchestrator, `claudeAgent` / `claude-opus-5-5` (different family from the author) |

## Checks the reviewer ran

- Measurement section (`const metric` .. `return result`) diffed against the
  evidence probe `render-ab.mjs`: byte-identical.
- No hardcoded host paths: only flags; the full Chromium is passed via `--chromium`.
- Finding fixed by the orchestrator: `median` took the upper-middle value, which
  biased the default `--runs 4` summary high. Now averages the two middle values
  (`median([4,1,3,2]) = 2.5`). Commit `31e5453`.
- Root `RESULT.md` replaced by this lane's record, following the repo's
  one-record-per-lane-at-root practice; the previous record stays at `git show 250c8f9:RESULT.md`.
- Re-run in the merged tree, real GPU (Iris Xe via ANGLE), 4 interleaved rounds,
  baseline dist = runtime of `06d19a8`, after = `0bbbda7` build (runtime of `250c8f9`):
  orbit rAF 60.0 / 60.2 fps, orbit main-thread 1.000 / 1.032 s, playback rAF
  47.4 / 49.6 fps (paired +2.3). Raw JSON outside Git, sha256 `dbf038e1…a88797`.
  No leftover browsers or preview servers.

## Not done

- No `package.json` script (no other `scripts/perf` probe has one).
- WebKit variant not committed; the WebKit numbers came from a separate
  scratch probe kept outside Git (no CDP metrics on WebKit).
