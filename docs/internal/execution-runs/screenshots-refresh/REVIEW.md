# Lane screenshots-refresh — coordinator review

Reviewer: coordinator session (Claude Opus 5.5). Author: OpenCode Go
`opencode-go/deepseek-v4.1-flash` (variant max), under a no-image-reading rule. The
author did not self-approve. This is independent review, not owner acceptance.

- Base `22bdf40`. Lane commits `a0c2b0b`, `07cc481`, `cc769ae`, `1fd2665`, `8955ecf`, `949eed3`.
- Coordinator review fix `e0208f5`. Merged as `19e3002`.

## Visual review (coordinator, all 11 images)

The README set (design, aero-inputs, flight, verify, live-sizing) and the landing set
(hero, airframe, motor, flight, verify, montecarlo) show the current product: part
colours, framing, corner gizmo, Aero table, wrapped gate reasons. The live-sizing
image shows a valid shape (fin span 180→239 mm) with staged-edit deltas.

**Finding (fixed by the coordinator, `e0208f5`):** the landing Monte Carlo crop cut the
ring legend mid-line. The capture now scrolls the legend into view, and a new `seen()`
assertion requires it inside the crop. That assertion failed before the scroll fix
("ring legend … is outside the crop") and passes after. In the same commit:
`index.html` `width`/`height` now match the regenerated images (the author's
finding 1), and the Airframe alt text no longer mentions the parts tree, which the
crop excludes.

## Checks run by the coordinator on the merged tree (19e3002)

| Command | Result |
|---|---|
| `node scripts/capture-screenshots.mjs` (landing set, after the fix) | exit 0; montecarlo 1912×1244, 100/100/100 runs |
| `npx vitest run vite.config.test.ts` | passed |
| `pnpm build` | exit 0 |
| `pnpm test:browser` | exit 0 |

## Carried forward

- **Product defect found by the author (finding 2):** enabling "Use built-up aero model
  (beta)" empties the provider's stability contributions, so the layout length falls
  from 2.97 m to 1 and the 3D rocket disappears. Queued as lane `beta-aero-layout`.
- The Monte Carlo panel needs a taller dock than Flight's default at 1600×1000 (the
  capture drags the separator to 720). This is product behaviour; noted only.

## Disposition

Accepted increment. Owner acceptance pending.
