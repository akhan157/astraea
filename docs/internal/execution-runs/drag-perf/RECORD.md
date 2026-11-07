# Slider-drag frame time: pre-viewport-look vs current (2026-11-07)

Owner-queued item 6b. The question: did `viewport-look` (merged 41c14d2) slow the
live-sizing drag? Its author measured +22 % p50 on a loaded host and called the result
inconclusive.

Method: production builds of `ac805fc` (before viewport-look, temporary worktree, since
removed) and `frontend/design@c074f7c` (current, which includes viewport-env-restore with
the floor shadow removed). Chromium with SwiftShader, 1280×800, NASA SL preset; drag the
Booster tube length slider through 60 pointer moves at about 33 ms; record
requestAnimationFrame intervals. 3 drags per run; runs interleaved base/current twice.
Host load 1.7 at start. The probe script is in external evidence `evidence-drag-perf/`.

| Run | Build | Frames | p50 ms | p95 ms | max ms |
|---|---|---|---|---|---|
| 1 | base ac805fc | 218 | 133.4 | 266.7 | 533.3 |
| 1 | current | 205 | 150.0 | 266.6 | 583.3 |
| 2 | base ac805fc | 213 | 150.0 | 333.3 | 566.6 |
| 2 | current | 210 | 150.0 | 283.3 | 449.9 |

Conclusion: no regression is measurable. Current p50/p95 fall within the base's
run-to-run spread. Software rendering is slow and frame times are quantized, so these
numbers are relative, not real-GPU frame rates. A real-GPU check would need the
owner's machine.
