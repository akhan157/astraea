# Lane viewport-look — coordinator review

Reviewer: coordinator session (Claude Opus 5.5, Anthropic family). Author:
OpenCode Go `opencode-go/deepseek-v4.1-flash` (variant max), a different family.
The author did not self-approve. This is independent review, not owner acceptance.

## Run history (retained)

- The first author session wrote most of the work, then failed before committing:
  `invalid_request_error: image input is not available on this engine`. It had tried
  to read a screenshot, and DeepSeek V4.1 Flash has no image input. The coordinator
  committed its tree unchanged as checkpoint `c9d90da` on `viewport-look`
  (unreviewed WIP).
- A second session resumed from `c9d90da` on `viewport-look-b`, under a rule never to
  read images (numeric probes only; the coordinator does the visual checks). Commits
  `8116188`, `673929f`, `99852d1`, `0f9e079`.
- Lesson for future DeepSeek lanes: state the no-image rule in every brief.

## Gate 1

Approved with amendments A–E (shadow refresh on every caster move, including Flight
playback; selection-only dim that never touches markers or overlays; no refit
jitter; drag frame times; logical commits). The coordinator's visual review of the
checkpoint found the Flight pose clipped under the toolbar; the resume fixed it by
fitting the pose envelope into the free canvas region.

## Diff review

Changes are confined to `src/console/viewport/*` (new `appearance.ts`, `framing.ts`,
`overlays.ts` with tests), `scripts/preview-journeys.mjs` (assertions added only) and
`CHANGELOG.md`. Geometry still comes from the native layout. CG/CP markers, ghost,
x-ray and parachute/motor overlays bypass the colour and dim path. Ghost meshes do
not cast shadows.

## Checks run by the coordinator on the merged tree (41c14d2)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 155 files, 1874 tests passed (the author reported 156/1875 in its worktree; not reconciled, no failing test seen) |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0, 30 journeys, including auto-frame 0.800 at 1600 and 1280, a shadow refresh during Flight playback, and the Flight pose inside the free region |
| Headless Chromium screenshots, 1600×1000 | Airframe matches the owner-viewed mockup: part colours, seams, about 80% fill, corner axis gizmo, floor shadow; selecting the payload bay highlights it and dims the rest; no console errors |

## Findings carried forward

1. **Flight at 1280×800 is cramped (layout, not viewport).** The Flight stage leaves
   the canvas about 170 px tall, so the fitted rocket is about 40 px. Before this lane
   it was larger but overlapped the toolbar and readout. Queued as lane `flight-layout`.
2. Drag frame time: p50 +22%, p95 +0–27%. The host was under load, so the result is
   inconclusive. Re-measure on a quiet machine.
3. The ghost-overlay shadow refresh is code-verified only.

## Disposition

Accepted increment for the 3D view look. Owner acceptance pending. README and landing
screenshots are now stale relative to the new look; the coordinator refreshes them
after `flight-layout`.
