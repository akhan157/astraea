# Lane result: webkit-contexts

## Status

Implemented; every required check is green. **Not self-accepted** — awaiting
independent coordinator review. The coordinator merges and validates the
combined `frontend/design` behavior (including the doc-claims and
no-parachute lanes at `f7999d2`); this lane stayed viewport-owned.

## Pin and commits

| | |
| --- | --- |
| Base pin | `cb195f8928226bac8b7ca84b0875fc62fa2e031e` (`cb195f8`, parent `89fc995ee711774513119a95751f423c1f92a972`) |
| Branch | `webkit-contexts` (worktree `/home/ak/.t3/worktrees/astraeat3/t3-29f972a9`) |
| Author | OpenCode Go `opencode-go/deepseek-v4.1-flash`, variant `max` |
| Fix | `146e8e1` `fix(viewport): reuse one WebGL renderer across stage mounts` |
| Regression | `3993d21` `test(viewport): lifecycle regression for one context across navigation` |
| CI | `6346158` `ci: run the viewport lifecycle regression on WebKit` |
| Docs | this commit |

No push, merge, release or deploy. `scripts/preview-journeys.mjs` was not
modified. No engine, physics, schema, design or output changes.

## Root cause

**The viewport created a new WebGL context on every stage mount. WebKit keeps
an explicitly lost context in its 16-slot per-page active set until the
context object is destroyed or garbage-collected. By the 17th tracked context,
WebKit recycles the oldest one — which the app had already lost — producing
both CI messages from one event.**

- `Workstation.tsx:286-291` renders only the active stage, keyed, so each stage
  switch unmounts `Viewport`.
- `Viewport.tsx` mounted a fresh R3F `<Canvas>` with each mount; each canvas
  creates one WebGL context.
- R3F 9.3's caller-provided-renderer teardown disposes render lists and calls
  `forceContextLoss()`; that marks the context lost but does not destroy
  WebKit's `WebGLRenderingContextBase`.
- WebKit (`WebGLRenderingContextBase.cpp`, snapshot line numbers):
  - `maxActiveContexts = 16` (194);
  - contexts enter the active set on creation (335-349);
  - entries are removed only by `destroyGraphicsContextGL()` (699), i.e. the
    destructor (675), `stop()` (5165) or `recycleContext()` (6107);
  - `WEBGL_lose_context.loseContext()` → `forceLostContext()` only sets the
    lost state and does not remove the entry (5103-5127);
  - `recycleContext()` prints “There are too many active WebGL contexts…”
    (6103), then calls `forceLostContext()` without checking lost (6106); that
    prints exactly “WebGL: INVALID_OPERATION: loseContext: context already
    lost” (5105-5106).

### Reproduction (before the fix)

Current unfixed build, Playwright WebKit 2370 (Playwright 1.64.1) in a
disposable `ubuntu:24.04` container: 60 rapid Airframe↔Mission switches created
63 contexts (61 loss calls) and produced **10 pairs of the exact two CI
errors**. 20 and 40 switches did not reproduce because WebKit's GC reclaimed
some contexts in time — the failure is timing-dependent, so trimming one or
two contexts or slowing the test would not be a fix. Chromium, same build, 20
switches created 23 contexts and changed the visible context each mount, but
freed lost contexts, so only WebKit failed. Artifacts:
`~/.t3/evidence/webkit-contexts/probe-webkit-fast.log`,
`probe-churn-20.log`.

## What changed

### One owned renderer for the page

New `src/console/viewport/viewportRenderer.ts`:

- creates one canvas + `THREE.WebGLRenderer` (WebGL2, antialias, alpha,
  high-performance) on first use and keeps it across stage mounts;
- marks the real canvas `data-viewport-canvas="true"`;
- preserves R3F's ownership distinction: the renderer is caller-provided, so
  R3F still disposes render lists on Canvas unmount and never calls
  `renderer.dispose()`. Only R3F's `forceContextLoss()` is suppressed, with an
  explanatory comment; the captured original is kept for explicit release;
- `release()` is idempotent: detaches the canvas first (so a loss event cannot
  reach the viewport shell listener), checks `isContextLost()`, loses the
  context only if still live, then calls `renderer.dispose()` (which removes
  three's listeners) and forgets the host;
- constructor/filesystem failures return `null`; the viewport shows the
  labeled fallback instead of throwing a render error;
- `ViewportRendererStore` makes lazy acquisition, failed-acquisition retry and
  idempotent drop unit-testable.

`Viewport.tsx`:

- `<Canvas gl={shared.renderer} eventSource={canvasHost}>` renders the scene;
  R3F's own contextless placeholder canvas remains the measure/event element
  and is hidden (`visibility: hidden`, `aria-hidden`) so exactly one actual
  canvas is visible;
- the shared canvas is appended to the active viewport host in a layout effect;
  the `parentElement === host` check makes a stale cleanup harmless when the
  next mount already moved the canvas;
- `data-look-selected` / `data-look-hovered` expose the look state for the
  picker/hover regression;
- the fallback remains the same labeled `role="alert"` surface.

### Restore creates one real context

`useWebGLLoss` now accepts a `recover` callback. `Viewport` passes
`recoverRenderer`: it drops the lost host and creates the replacement renderer.
The replacement renderer **is** the availability check, so a restore creates
exactly one context and no throwaway probe. If creation fails, the fallback
stays. `canUseWebGL` still probes `webgl2` (then `webgl`) on first mount and now
releases its temporary context before returning; release failures do not change
the probe result.

A lost shared context that outlives its viewport (stage navigation without
Restore) is detected from `renderer.getContext().isContextLost()` and shows the
labeled fallback on the next mount instead of a dead canvas. A natural
`webglcontextrestored` also bumps the epoch, so a remounted fallback re-renders
even when its `lost` state did not change.

`releaseShellCanvases` and its test were removed. It force-lost canvases after
R3F had already lost them, could call `getContext()` on the contextless
placeholder, and cannot remove WebKit's active-set entry; keeping the shared
canvas would have been destroyed by it.

## Regression that fails before the fix

`scripts/viewport-context-lifecycle.mjs` (`pnpm test:viewport-context`) runs
the built app under the production CSP and asserts:

- initial WebGL contexts ≤ 2, exactly one shared renderer, one visible canvas,
  one hidden contextless placeholder; the placeholder never receives
  `getContext`;
- presets, orbit drag, viewcube, hover/pick, resize-fit, the Airframe
  3D/split/2D modes, Aero and Flight all work on the shared renderer;
- 60 stage switches create **zero** new contexts and keep the same canvas
  context;
- a loss shows the fallback, a stage round-trip with the lost context still
  shows the fallback and creates nothing, then Restore creates **exactly one**
  replacement context;
- zero browser console errors, with the existing CSP and no filtering.

Before the fix it fails at the first stage switch (created count grows and the
visible context identity changes); in WebKit the 60-switch run reproduces the
two exact console errors. Unit tests pin renderer reuse, idempotent release,
the `isContextLost()` guard, probe release and the recover path.

## Validation actually run

All on the final build (`dist/assets/app-DRXR9nam.js`, SHA-256
`32a62c376045a88e50b0c80bd4ce983708bdc080ed3a1a1f5482e2c239ef89ad`).

| Check | Command | Result |
| --- | --- | --- |
| Type check | `pnpm exec tsc --noEmit` | exit 0, no output |
| Focused unit tests | `vitest run --maxWorkers=2` on the viewport/WebGL tests | 31 passed |
| Full unit suite | `pnpm exec vitest run --maxWorkers=2` | 167 files, 1,960 tests passed (252 s) |
| Build | `CARGO_BUILD_JOBS=2 pnpm build` | exit 0 |
| Chromium acceptance | `pnpm test:browser` | exit 0; includes “WebGL loss preserves readouts; viewport restores” |
| Chromium lifecycle | `pnpm test:viewport-context` | initial 2 contexts, 60 switches, restore +1, placeholder 0, errors 0 |
| Firefox lifecycle | `ASTRAEA_BROWSER=firefox pnpm test:viewport-context` | same counts, errors 0 |
| WebKit lifecycle | in the container, `ASTRAEA_BROWSER=webkit pnpm test:viewport-context` | initial 2, 60 switches still 2, restore +1, placeholder 0, errors 0 |
| WebKit acceptance | in the container, `ASTRAEA_BROWSER=webkit pnpm test:browser` | exit 0; zero occurrences of either context error |

Browser versions: Chromium 156.0.8078.4, Firefox 157.0, Playwright WebKit 2370
(Playwright 1.64.1, Node 24.22.2 in `ubuntu:24.04`). The full WebKit
acceptance is the CI-equivalent run: the Ubuntu 24.04 container installs
WebKit with `--with-deps`, uses the host-built `dist/` from this commit, and
runs the same `pnpm test:browser` command as `.github/workflows/ci.yml`.
Artifacts and hashes are listed in `EVIDENCE.json`; raw logs live outside the
repo at `~/.t3/evidence/webkit-contexts/`.

### WebKit on this host

Playwright WebKit cannot run natively on CachyOS: build 2370 expects Ubuntu
24.04 libraries (ICU 74, the older libxml2 ABI, flite, avif16, harfbuzz-icu,
manette, enchant, hyphen); the host has ICU 78 and `ldd` reports
`libWPEWebKit-2.0.so.1` missing. No host system package was changed. The
approved disposable-container path above was used and the containers were
removed after the runs.

## Deliberately not done

- `scripts/preview-journeys.mjs` untouched; no doc-claims, Flight-readiness or
  Recovery changes.
- No merge from `frontend/design` (`f7999d2`); the coordinator will validate
  combined behavior. The full acceptance above runs the scripts at this pin.
- No renderer-related visual redesign; the canvas, chrome, camera fit and
  overlays are unchanged.
- No push, tag, release or deploy.
- Firefox full acceptance was not run; the focused lifecycle passed under
  Firefox and CI covers the full Firefox acceptance.

## Residual risk

- R3F's caller-provided renderer teardown is version-sensitive. The lockfile
  pins 9.3.0; the lifecycle regression fails if a future version starts
  disposing or losing the shared context across Canvas unmounts.
- WebKit still keeps the one released availability-probe context and the one
  released replacement context (after a Restore) in its active set until GC.
  That is bounded at 2–3 slots and does not grow with navigation; the previous
  per-stage accumulation is gone.
- Native WebKit was not run; the container run is the evidence. Do not read
  this as a native Safari pass.

**No self-acceptance.** This lane is ready for independent coordinator review.
