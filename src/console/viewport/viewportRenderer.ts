/**
 * The viewport owns exactly one WebGL renderer for the life of the page.
 *
 * Why not one renderer per R3F canvas: browsers cap live contexts per page
 * (WebKit: 16), and WebKit keeps an explicitly lost context in that active set
 * until the context object is destroyed or collected. Stage navigation mounts
 * a new R3F canvas each time, so a canvas-per-stage lifecycle accumulates lost
 * contexts and eventually makes WebKit recycle one ("too many active WebGL
 * contexts", followed by "loseContext: context already lost"). Reusing one
 * renderer across those canvas mounts keeps the count constant.
 *
 * R3F is told this renderer is caller-provided, so on Canvas unmount it
 * disposes the render lists and calls `forceContextLoss()` instead of fully
 * disposing the renderer. The viewport must survive that unmount, so the
 * forced loss is suppressed; explicit `release()` below still has the original
 * and is the only path that deliberately loses the owned context.
 */

import * as THREE from 'three';

export interface ViewportRendererHost {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  /**
   * Idempotent. Detaches the canvas (so a loss event cannot reach the viewport
   * shell listener), loses the context if it is still live, and disposes the
   * renderer, which removes the listeners three attached to the canvas.
   */
  release: () => void;
}

export type ViewportRendererFactory = () => ViewportRendererHost | null;

/**
 * Wrap a freshly created renderer as a viewport-owned host. Exported so the
 * reuse and idempotent-release rules are unit-testable without a GPU; the
 * production factory below creates the real canvas and `WebGLRenderer`.
 */
export function makeViewportRendererHost(
  createRenderer: () => { canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer },
): ViewportRendererHost | null {
  let created: { canvas: HTMLCanvasElement; renderer: THREE.WebGLRenderer };
  try {
    created = createRenderer();
  } catch {
    // A broken driver must become the labeled fallback, not a render error.
    return null;
  }
  const { canvas, renderer } = created;
  const forceContextLoss = renderer.forceContextLoss.bind(renderer);
  // R3F's caller-provided-renderer teardown must not lose the shared context.
  // Explicit release uses the captured original, after the isContextLost guard.
  renderer.forceContextLoss = () => undefined;

  let released = false;
  return {
    canvas,
    renderer,
    release: () => {
      if (released) return;
      released = true;
      try {
        canvas.remove();
      } catch {
        /* the canvas may already be detached */
      }
      try {
        if (!renderer.getContext().isContextLost()) forceContextLoss();
      } catch {
        /* the driver may already have lost the context */
      }
      try {
        renderer.dispose();
      } catch {
        /* dispose is best effort once the driver has failed */
      }
    },
  };
}

export function createViewportRendererHost(): ViewportRendererHost | null {
  if (typeof document === 'undefined') return null;
  return makeViewportRendererHost(() => {
    const canvas = document.createElement('canvas');
    // The lifecycle regression uses this marker to tell the real canvas from
    // R3F's contextless placeholder. It is not a visual change.
    canvas.dataset.viewportCanvas = 'true';
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    return { canvas, renderer };
  });
}

/**
 * Holds the current host. `acquire` is lazy and reuses a successful host;
 * a failed construction leaves the slot empty for a later attempt. `drop`
 * is idempotent and is the only place the owned context is released.
 */
export class ViewportRendererStore {
  private current: ViewportRendererHost | null = null;

  constructor(private readonly factory: ViewportRendererFactory) {}

  acquire(): ViewportRendererHost | null {
    if (this.current !== null) return this.current;
    this.current = this.factory();
    return this.current;
  }

  peek(): ViewportRendererHost | null {
    return this.current;
  }

  drop(): void {
    const host = this.current;
    this.current = null;
    host?.release();
  }
}

export const viewportRenderers = new ViewportRendererStore(createViewportRendererHost);

/** The viewport's one renderer, created on first use. */
export const ensureViewportRenderer = (): ViewportRendererHost | null => viewportRenderers.acquire();

/** Release the owned renderer and forget the host; a later acquire creates a new one. */
export const releaseViewportRenderer = (): void => viewportRenderers.drop();
