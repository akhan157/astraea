/**
 * Where the chrome drawn *over* the canvas actually is, in canvas pixels.
 *
 * The viewport cannot know which stage place a pose card or a scrubber on top of
 * it, and hard-coding those layouts would couple the camera to a stage file it
 * is not allowed to edit. So it measures: its own overlays are tagged
 * `data-canvas-overlay`, and every absolutely positioned element that a parent
 * draws across the canvas is picked up by walking up a few levels. Nothing here
 * touches WebGL, so the rule is unit-testable in jsdom with stubbed rects.
 */
import type { Rect } from './framing';

const ANCESTOR_LEVELS = 3;

/** The viewcube's margin from the canvas edges, in CSS px (drei `GizmoHelper`). */
export const VIEWCUBE_MARGIN = 64;
/** The reserved box around the viewcube, wide enough for any corner-on projection. */
export const VIEWCUBE_SIZE = 128;

/**
 * The viewcube's footprint in canvas pixels: a 128×128 box centred on the
 * gizmo's 64-px margin point in the bottom-right corner.
 *
 * drei draws the cube at 60 px per edge, so whichever corner faces the camera
 * its silhouette reaches at most `30·√2 ≈ 42 px` from the centre; the 128-px
 * box leaves 21 px of slack on every side. The box is centred on the cube
 * rather than inset by a further 64 px: an inset box would stop 64 px short of
 * the edge and leave the cube's right and bottom halves uncovered, which is
 * exactly where a posed rocket could slide under it.
 */
export function viewcubeRect(width: number, height: number, margin = VIEWCUBE_MARGIN, size = VIEWCUBE_SIZE): Rect {
  const half = size / 2;
  const centreX = width - margin;
  const centreY = height - margin;
  return {
    x0: Math.max(0, centreX - half),
    y0: Math.max(0, centreY - half),
    x1: Math.min(width, Math.max(0, centreX + half)),
    y1: Math.min(height, Math.max(0, centreY + half)),
  };
}

interface Rects { left: number; top: number; right: number; bottom: number; width: number; height: number }

function rectOf(el: Element): Rects | null {
  if (typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return null;
  return r;
}

function positioned(el: Element): boolean {
  if (typeof getComputedStyle !== 'function') return false;
  const style = getComputedStyle(el);
  return style.position === 'absolute' || style.position === 'fixed';
}

/** Canvas-local pixels, or null when the rect misses the canvas entirely. */
function toCanvas(r: Rects, base: Rects): Rect | null {
  const x0 = Math.max(0, r.left - base.left);
  const y0 = Math.max(0, r.top - base.top);
  const x1 = Math.min(base.width, r.right - base.left);
  const y1 = Math.min(base.height, r.bottom - base.top);
  if (x1 - x0 < 1 || y1 - y0 < 1) return null;
  return { x0, y0, x1, y1 };
}

/**
 * Overlay rectangles that sit on top of `canvas`, in canvas-local CSS pixels.
 * Empty in jsdom (every rect is 0×0), which keeps the unit-test framing the full
 * canvas.
 */
export function canvasOverlayRects(canvas: HTMLElement | null): Rect[] {
  if (!canvas) return [];
  const base = rectOf(canvas);
  if (!base) return [];
  const out: Rect[] = [];
  const add = (el: Element): void => {
    const r = rectOf(el);
    if (!r) return;
    const local = toCanvas(r, base);
    if (local) out.push(local);
  };

  for (const el of canvas.querySelectorAll('[data-canvas-overlay]')) add(el);

  let node: HTMLElement | null = canvas.parentElement;
  for (let level = 0; node && level < ANCESTOR_LEVELS; level++, node = node.parentElement) {
    for (const el of node.children) {
      if (el === canvas || el.contains(canvas) || canvas.contains(el)) continue;
      if (!positioned(el)) continue;
      add(el);
    }
  }

  // A canvas-sized scrim (for example a loading veil) is not "chrome"; keeping
  // it would collapse the frame to nothing. Neither is a 1×1 dot.
  return out.filter((r) => {
    const area = (r.x1 - r.x0) * (r.y1 - r.y0);
    return area >= 16 && area < 0.9 * base.width * base.height;
  });
}
