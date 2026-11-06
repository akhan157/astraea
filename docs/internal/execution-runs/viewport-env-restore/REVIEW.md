# Lane viewport-env-restore — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash` (variant max). The author did not self-approve.
This is independent review, not owner acceptance.

- Base `738f8e3`. Lane commits `271ac12`, `12322d0`, `ad63b34`. Merged as `10b619d`.
- Owner direction (2026-11-05): keep the rocket changes; restore the previous surroundings
  (backdrop, grid, no floor shadow) and the CAD-style viewcube.

## Deviation accepted

The cube's reserved footprint is centred on the drei cube (`[w-128, w]`) instead of
being inset a further 64 px. The inset box would have left half the cube's silhouette
over the Flight free region.

## Checks run by the coordinator on the merged tree (10b619d)

| Command | Result |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2` | 162 files, 1931 tests passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0: viewcube 128×128 at the 64 px bottom-right margin, no shadow probe or catcher; clicking the cube turns the camera 46.3°; 1280×800 Flight free region 229.5 px, rocket 173.2 px; 1600×1000 free region 479.6 px, rocket 345.3 px |
| Coordinator screenshots, 1600×1000 Airframe and Flight | Radial backdrop, original grid and CAD viewcube are back; rocket colours, seams and framing are kept; no floor shadow; no page errors |

## Engine fixes now on this branch (research P1/P2/P4, merged by the research session)

Coordinator UI check on this build, each preset run fresh:

| Preset | Margin | Apogee | Max Mach | Gates |
|---|---|---|---|---|
| Estes Alpha III | 4.80 cal | 299 m | 0.29 | 5 pass |
| NASA Student Launch | 4.03 cal | 533 m | 0.29 | 5 pass |
| Spaceport America | 4.38 cal | 5,126 m | 1.68 | 4 pass, 1 fail (landing speed 184.3 m/s) |

A pre-research build (`3685d91`, temporary worktree, since removed) gives Spaceport
4.26 cal, 5,130 m, the same max Mach and **the same landing-speed failure**. The P4/P1
shifts match the research session's prediction (margin +0.12 cal, apogee −4 m), and the
landing failure **predates** those fixes. The new manifest fields are not shown on the
Build screen.

Pre-existing product finding (not caused by any recent lane): the Spaceport America
example lands at 184 m/s, which reads as a chute that never slows it. Investigate
separately.

## Disposition

Accepted increment. Owner acceptance pending. The README/landing screenshots must be
recaptured: they show the `viewport-look` environment.
