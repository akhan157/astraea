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
 * `force` re-probes.
 *
 * The probe is a temporary canvas. It is released before returning: a probe
 * context left alive still occupies one of the browser's per-page WebGL slots
 * (WebKit keeps a lost context tracked until it is collected), so a viewport
 * that probes on every restore would spend a slot each time. Release failures
 * are ignored: they must not turn an available GPU into a false negative.
 */
export function canUseWebGL(force = false): boolean {
  if (!force && probed !== null) return probed;
  let canvas: HTMLCanvasElement | null = null;
  let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
  try {
    if (typeof document === 'undefined') {
      probed = false;
      return probed;
    }
    canvas = document.createElement('canvas');
    // The viewport renders with three, which requires WebGL2; fall back to
    // WebGL1 only so the diagnostic still distinguishes "no GL at all".
    gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as
      | WebGLRenderingContext
      | WebGL2RenderingContext
      | null;
    probed = gl !== null;
  } catch {
    probed = false;
  }
  try {
    if (gl !== null && !gl.isContextLost()) {
      (gl.getExtension('WEBGL_lose_context') as { loseContext?: () => void } | null)?.loseContext?.();
    }
  } catch {
    /* release is best effort; the probe result stands */
  }
  try {
    canvas?.remove();
  } catch {
    /* a detached probe canvas cannot fail removal in practice */
  }
  return probed;
}

/**
 * `lost` starts true when no context can be created at all. A context lost
 * later is caught on the container's capture phase — the event does not
 * bubble from the canvas — and the default teardown is prevented so nothing
 * else is disturbed. `retry` proves recovery and remounts the canvas (epoch).
 *
 * `probe` is the initial context check; it is injectable so a run without a
 * real GPU (jsdom) can still exercise both branches. `recover`, when given,
 * replaces the retry probe: the viewport uses the real replacement renderer
 * as its availability check, so a restore does not spend a throwaway probe
 * context. A failed recovery keeps the fallback.
 */
export function useWebGLLoss(
  containerRef: RefObject<HTMLDivElement | null>,
  probe: (force?: boolean) => boolean = canUseWebGL,
  recover?: () => boolean,
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
    const onRestored = (): void => {
      setLost(false);
      // A remounted viewport can already be showing the fallback for a lost
      // shared context (its initial `lost` state is false because the probe is
      // satisfied). A naturally restored context must re-render that viewport,
      // so bump the epoch even when `lost` did not change.
      setEpoch((n) => n + 1);
    };
    el.addEventListener('webglcontextlost', onLost, true);
    el.addEventListener('webglcontextrestored', onRestored, true);
    return () => {
      el.removeEventListener('webglcontextlost', onLost, true);
      el.removeEventListener('webglcontextrestored', onRestored, true);
    };
  }, [containerRef, epoch]);
  const retry = useCallback(() => {
    let recovered = false;
    try {
      recovered = recover ? recover() : probe(true);
    } catch {
      recovered = false;
    }
    setLost(!recovered);
    setEpoch((n) => n + 1);
  }, [probe, recover]);
  return { lost, retry, epoch };
}

/** The labeled fallback shown in place of the 3-D canvas. */
export const WEBGL_FALLBACK_TITLE = '3D viewport unavailable — editing preserved';
