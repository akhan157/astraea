/**
 * WebGL availability and loss for the viewport.
 *
 * The legacy shell's rule, kept: a missing or lost context never blocks
 * editing. The 3-D view drops to a labeled notice while the assembly tree,
 * inspectors, metrics and exports stay fully live.
 */

import { useCallback, useEffect, useState, type RefObject } from 'react';

/** Memo of the last probe, so a render does not re-probe on every mount. */
let probed: boolean | null = null;

/**
 * False when no WebGL context can be created (headless run, broken GPU).
 * `force` re-probes: the restore button uses it, so a fixed driver is picked
 * up without a reload.
 */
export function canUseWebGL(force = false): boolean {
  if (!force && probed !== null) return probed;
  try {
    if (typeof document === 'undefined') {
      probed = false;
      return probed;
    }
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') ?? canvas.getContext('experimental-webgl');
    probed = gl !== null && gl !== undefined;
  } catch {
    probed = false;
  }
  return probed;
}

/**
 * `lost` starts true when no context can be created at all. A context lost
 * later is caught on the container's capture phase — the event does not
 * bubble from the canvas — and the default teardown is prevented so nothing
 * else is disturbed. `retry` re-probes and remounts the canvas (epoch).
 *
 * `probe` is the context check; it is injectable so a run without a real GPU
 * (jsdom) can still exercise both branches.
 */
export function useWebGLLoss(
  containerRef: RefObject<HTMLDivElement | null>,
  probe: (force?: boolean) => boolean = canUseWebGL,
): { lost: boolean; retry: () => void; epoch: number } {
  const [lost, setLost] = useState(() => !probe());
  const [epoch, setEpoch] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onLost = (e: Event): void => {
      e.preventDefault();
      setLost(true);
    };
    const onRestored = (): void => setLost(false);
    el.addEventListener('webglcontextlost', onLost, true);
    el.addEventListener('webglcontextrestored', onRestored, true);
    return () => {
      el.removeEventListener('webglcontextlost', onLost, true);
      el.removeEventListener('webglcontextrestored', onRestored, true);
    };
  }, [containerRef, epoch]);
  const retry = useCallback(() => {
    setLost(!probe(true));
    setEpoch((n) => n + 1);
  }, [probe]);
  return { lost, retry, epoch };
}

/**
 * Release every canvas the shell still owns: force-lose its GL context (so
 * the GPU-side resources are freed even when R3F teardown races a remount)
 * and remove the element so a detached canvas never lingers.
 */
export function releaseShellCanvases(root: ParentNode | null | undefined): void {
  for (const canvas of Array.from(root?.querySelectorAll('canvas') ?? [])) {
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    (gl?.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    canvas.remove();
  }
}

/** The labeled fallback shown in place of the 3-D canvas. */
export const WEBGL_FALLBACK_TITLE = '3D viewport unavailable — editing preserved';
