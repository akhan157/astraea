# Lane result: viewport-env-restore

## Pin and commits

| | |
| --- | --- |
| Base | `738f8e31689eecc631efc098408e08efdab6e636` (= pin `738f8e3`, contains `ac805fc`) |
| Branch | `viewport-env-restore` (worktree `/home/ak/.t3/worktrees/astraeat3/t3-18133e49`) |
| Author | OpenCode Go `opencode-go/deepseek-v4.1-flash` |
| Feature commit | `271ac12` `feat(viewport): restore the radial backdrop, original grid and bottom-right viewcube` |
| Journey commit | `12322d0` `test(browser): assert the viewcube position, its click and the absent shadow rig` |
| Docs commit | added with this file |

Status: **implemented, all required checks green, awaiting coordinator review and the
coordinator's visual check.** Not self-accepted.

## What changed

**Restored, exactly as at `ac805fc`, in `src/console/viewport/Viewport.tsx`:**
the container backdrop `radial-gradient(ellipse at 50% 40%, #14171B 0%, #0B0C0E 70%)`;
the grid props `cellThickness 0.5`, `cellColor #1C2025`, `sectionThickness 0.8`,
`sectionColor #262B31`, `fadeDistance length*4+4` (its `position` was already the
pre-look expression, so the rocket still sits above it); `GizmoHelper
alignment="bottom-right" margin={[64,64]}` with `GizmoViewcube` (`#16191D` /
`#8B9199` / `#3D4249` / `#22414A`, opacity 0.95).

**Removed:** the floor-shadow feature end to end — shadow-catcher mesh, the key
light's `castShadow` and all `shadow-*` props, `shadows="soft"` on the Canvas, the
static-shadow `gl.shadowMap` setup, the `ShadowRefresh` component with its
`data-shadow-updates` probe, and the `castShadow` props in `Vehicle3D.tsx`. The
axis gizmo, its `AXES` table, `GIZMO_*` constants, the dynamic `gizmoMargin`
state/effect and the `shellSize` state are gone.

**Kept:** the lighting rig (hemisphere 0.6, key 2, cyan rim 1.2, fill 0.35) and
ACES at exposure 1.05 — only the key light's shadow props are gone, so the
rocket is shaded exactly as before. Everything rocket-related is untouched:
`appearance.ts`, section seams, selection/dim, `framing.ts`, `overlays.ts`
measurement, the rollup-layout fallback, keep-last-layout, preset snap, zoom
preservation, markers and every `data-*` frame probe.

**Added:** `viewcubeRect(width, height)` in `overlays.ts` and `reserveGizmo` on
`CameraFit`, so the Flight fit keeps the viewcube's corner clear and reports the
same rect as `data-gizmo-rect`. `data-orbit-version` / `data-orbit-turned` count
camera turns above 1° away from the fit's own writes, so the cube click is
assertable.

### Deviation from Gate 1, reported rather than silent

Gate 1 wrote the footprint as `[w-192, h-192, w-64, h-64]` (a 128-px box inset a
further 64 px). Implemented as a 128-px box **centred on the cube**, i.e.
`[w-128, h-128, w, h]`. Reason: drei draws the cube at 60 px per edge
(`group scale={[60,60,60]}`), so corner-on its silhouette reaches
`30·√2 ≈ 42.4 px` from the centre at `(w-64, h-64)`. The inset box would cover
only `[w-192, w-64]` and leave the cube's right/bottom 36 px over the free
region — a posed rocket could reach `w-68` and sit under it. The centred box
leaves 21.6 px of slack on every side and is still 128×128 at the 64-px margin.
The journey asserts the centre at `(w-64, h-64)` and the 128×128 size.

## Live measurements vs the Gate 1 prediction

Journey (`pnpm test:browser`, Chromium + SwiftShader, built `dist/` under the
production CSP):

| viewport | canvas | free region | prediction | rocket box | prediction | fit fraction |
| --- | --- | --- | --- | --- | --- | --- |
| 1280×800 | 636×326 | 229.5 px tall, full width | 229.5 | **173.2 px** | 172.9 | 0.5634 (= 0.8 of the region) |
| 1600×1000 | 956×480 | 479.6 px tall, full canvas | 479.6 | **345.3 px** | 357.8 | **0.8000** |

The free region is **not shrunk by the cube at either size**: 1280×800 keeps the
full 636 px width and 1600×1000 keeps the full canvas (`[0,0,956,479.6]`), so
the fitted envelope never intersects the reserved corner and the cube costs the
fit nothing. The gizmo reported `508,198,636,326` at 1280×800 (centre
`572,262 = canvas − 64`) and `828,352,956,480` at 1600×1000 (centre `892,416`).

The 1600×1000 box is 12.5 px below the historical 357.8. It is **not** the cube:
on the same build and size, a canonical ISO snap measures `64.5–422.3` =
**357.8 px**, and the region is unshrunk. The probe shows the cause is the
pre-existing keep-the-current-direction rule on refit: the fitted pitch reads
12.85° at a canonical ISO snap, 17.86° after the 1280×800 resize and 6.57° after
the 1600×1000 resize, because each refit derives its direction from
`camera.position − target` after the previous fit moved the target. That code
path (`direction.copy(current)`) is not touched by this lane. The assertions keep
passing with large margins (345.3 ≥ 281 and 173.2 ≥ 120), and the raw region
height is unchanged, so no assertion was weakened.

Cube click: the journey clicks 18 px right and 5 px up from the cube centre and
measures **46.3°** of camera turn (`data-orbit-turned 0 → 46.3`,
`data-orbit-version 0 → 8`); the probe measures 45.31°. Two clicks that miss the
cube (`onPointerMissed`) leave the orbit probe untouched, so the assertion cannot
pass on a stray canvas click.

## Checks actually run

| command | result |
| --- | --- |
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run --maxWorkers=2 src/console/viewport/` | 8 files, **56 tests passed** |
| `npx vitest run --maxWorkers=2` | **162 files, 1931 tests passed**, exit 0 |
| `PATH=$HOME/.cargo/bin:$PATH CARGO_BUILD_JOBS=2 pnpm build` | `✓ built in 878ms` |
| `ASTRAEA_BROWSER=chromium pnpm test:browser` | exit 0; every acceptance line passed |

The browser log's relevant lines:

```
Preview acceptance passed: 3D view auto-frames at 0.800 @ 1600×1000, 0.800 @ 1280×800; presets still re-orient
Preview acceptance passed: viewcube 508,198,636,326 (128×128 at the 64 px bottom-right margin); no shadow probe or catcher
Preview acceptance passed: clicking the viewcube turns the camera 46.3° (orbit version 0 -> 8)
Preview acceptance passed: Flight pose stays inside the free canvas region at 0.25s 308,65,334,244 | 6.10s 287,71,356,244 | 11.05s 258,126,396,202 | 12.16s 260,129,396,168
Preview acceptance passed: 1280×800 Flight free region 229.5 px tall; rocket 173.2 px
Preview acceptance passed: 1600×1000 Flight free region 479.6 px tall; rocket 345.3 px
```

Raw evidence: `~/.paseo/worktrees/3s8t98rp/evidence-viewport-env-restore/`
(`browser.log`, `probe.jsonl`, `GATE1.md`).

## Deliberately not done

- No pixel or image inspection: all verification is DOM attributes, JSON and
  printed numbers. The "no floor shadow" and overall look are the coordinator's
  visual check; the journey can only assert the removed probe and catcher are
  absent, which it does.
- No push, merge, release or publish. No subagents.
- No engine, physics, schema, preset, export or `framing.ts` change.
- The `viewcubeRect` deviation above is reported for the coordinator to accept or
  revert.

## Open items

1. Coordinator review of the diff and the cube-box deviation.
2. Coordinator visual check on the built surface (headless Chromium is not a
   visual proof).
3. Gate 2 acceptance and merge. The author cannot self-accept.
