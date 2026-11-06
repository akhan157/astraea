# Coordinator review: live-sizing-fix

Disposition: **accepted** (merged into `frontend/design` at `2686eb3`, follow-up `10f0cf6`).
Author: OMP `deepseek/deepseek-flash` (max). Author did not self-accept.

## Review rounds

| Round | Author commit | Finding (coordinator) | Fixed in |
|---|---|---|---|
| 1 | `4ff792f` | Single global pending slot dropped concurrent distinct stability keys (probe: 3 keys requested → engine saw 2) | `5d84ecc` |
| 1 | `4ff792f` | Tube length not capped by its children; README failure still reachable from the tube side | `5d84ecc` |
| 1 | `4ff792f` | Drawing2D paired current vehicle with stale layout | `5d84ecc` |
| 1 | `4ff792f` | Viewport/PartsTree used the preview aero model for other designs (mixed keys) | `5d84ecc` |
| 1 | `4ff792f` | Markers from last-prop refs instead of snapshot breakdown | `5d84ecc` |
| 2 | `5d84ecc` | Markers disappeared during the stale window (opt-in tied to a loading prop) | `6d532ee` |
| 3 (in-tree, built app) | `6d532ee` | Track press rebuilt the slider window around the pressed value; first move jumped to 4452 mm | `39b4dad` |

## Coordinator verification (merged tree)

- `npx tsc --noEmit` → exit 0.
- `npx vitest run --maxWorkers=2 src/console` → 44 files, 372 passed (at `10f0cf6`).
- `pnpm build` (cargo on PATH, 2 jobs) → success.
- Independent Chromium probe on `vite preview` with production CSP (scripts and
  screenshots in `.paseo/worktrees/3s8t98rp/evidence-coordinator-live-sizing/`):
  track press at 80% then 30-step drag: window constant 1420–2900, values
  monotonic, 0 empty frames, 0 frames without markers, release→ready 24 ms,
  no page/console errors. Drogue packed-mass slider 0.09–0.36 kg, step 0.005.

## Not claimed

Base build did not visibly blank in the author's probe; the accepted gain is
validity, speed and stability, not a removed flicker.
