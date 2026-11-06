// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { canvasOverlayRects, VIEWCUBE_MARGIN, VIEWCUBE_SIZE, viewcubeRect } from './overlays';

/** A rect in viewport coordinates, the shape `getBoundingClientRect` returns. */
function at(x0: number, y0: number, x1: number, y1: number): DOMRect {
  return {
    x: x0, y: y0, left: x0, top: y0, right: x1, bottom: y1,
    width: x1 - x0, height: y1 - y0, toJSON: () => ({}),
  } as DOMRect;
}

function stub(el: Element, rect: DOMRect): void {
  el.getBoundingClientRect = () => rect;
}

const roots: HTMLElement[] = [];

function build(): { canvas: HTMLElement; parent: HTMLElement; toolbar: HTMLElement; card: HTMLElement } {
  const parent = document.createElement('div');
  parent.style.position = 'relative';
  const canvas = document.createElement('div');
  const toolbar = document.createElement('div');
  toolbar.setAttribute('data-canvas-overlay', '');
  toolbar.style.position = 'absolute';
  canvas.appendChild(toolbar);
  parent.appendChild(canvas);
  const card = document.createElement('div');
  card.style.position = 'absolute';
  parent.appendChild(card);
  document.body.appendChild(parent);
  roots.push(parent);
  stub(canvas, at(0, 0, 956, 378));
  stub(toolbar, at(8, 8, 220, 34));
  stub(card, at(736, 48, 944, 198));
  return { canvas, parent, toolbar, card };
}

afterEach(() => {
  while (roots.length) roots.pop()?.remove();
});

describe('canvas overlays', () => {
  it('reports the tagged chrome and the absolutely positioned stage overlays in canvas pixels', () => {
    const { canvas } = build();
    expect(canvasOverlayRects(canvas).sort((a, b) => a.x0 - b.x0)).toEqual([
      { x0: 8, y0: 8, x1: 220, y1: 34 },
      { x0: 736, y0: 48, x1: 944, y1: 198 },
    ]);
  });

  it('ignores flow siblings, rects that miss the canvas and canvas-wide scrims', () => {
    const { canvas, parent } = build();
    const flow = document.createElement('div');
    flow.style.position = 'static';
    stub(flow, at(0, 0, 200, 60));
    parent.appendChild(flow);
    const dotted = document.createElement('div');
    dotted.setAttribute('data-canvas-overlay', '');
    stub(dotted, at(100, 100, 101, 101));
    canvas.appendChild(dotted);
    const scrim = document.createElement('div');
    scrim.style.position = 'absolute';
    stub(scrim, at(0, 0, 956, 378));
    parent.appendChild(scrim);
    const outside = document.createElement('div');
    outside.style.position = 'absolute';
    stub(outside, at(1200, 0, 1400, 100));
    parent.appendChild(outside);
    expect(canvasOverlayRects(canvas).map((r) => [r.x0, r.y0, r.x1, r.y1])).toEqual([[8, 8, 220, 34], [736, 48, 944, 198]]);
  });

  it('reports nothing when the DOM has no layout (jsdom default)', () => {
    const parent = document.createElement('div');
    const canvas = document.createElement('div');
    canvas.setAttribute('data-canvas-overlay', '');
    parent.appendChild(canvas);
    document.body.appendChild(parent);
    roots.push(parent);
    expect(canvasOverlayRects(canvas)).toEqual([]);
    expect(canvasOverlayRects(null)).toEqual([]);
  });

  it('counts an overlay a grandparent draws, so a stage card is measured too', () => {
    const frame = document.createElement('div');
    const viewport = document.createElement('div');
    const canvas = document.createElement('div');
    viewport.appendChild(canvas);
    frame.appendChild(viewport);
    const readout = document.createElement('div');
    readout.style.position = 'absolute';
    frame.appendChild(readout);
    document.body.appendChild(frame);
    roots.push(frame);
    stub(canvas, at(0, 0, 600, 300));
    stub(readout, at(12, 12, 588, 48));
    expect(canvasOverlayRects(canvas)).toEqual([{ x0: 12, y0: 12, x1: 588, y1: 48 }]);
  });
});

describe('viewcube footprint', () => {
  it('is a 128 px box centred 64 px in from the bottom-right corner', () => {
    const rect = viewcubeRect(1031, 596);
    expect(rect).toEqual({ x0: 1031 - 128, y0: 596 - 128, x1: 1031, y1: 596 });
    expect((rect.x0 + rect.x1) / 2).toBe(1031 - VIEWCUBE_MARGIN);
    expect((rect.y0 + rect.y1) / 2).toBe(596 - VIEWCUBE_MARGIN);
    expect(rect.x1 - rect.x0).toBe(VIEWCUBE_SIZE);
    expect(rect.y1 - rect.y0).toBe(VIEWCUBE_SIZE);
  });

  it('covers the real 60 px cube at every orientation', () => {
    // drei's GizmoViewcube is a 60-px cube (`group scale={[60,60,60]}`); its
    // corner-on silhouette reaches 30·√2 px from the centre.
    const reach = 30 * Math.SQRT2;
    for (const [width, height] of [[1031, 596], [956, 326], [711, 382]]) {
      const rect = viewcubeRect(width, height);
      const cx = width - VIEWCUBE_MARGIN;
      const cy = height - VIEWCUBE_MARGIN;
      expect(rect.x0).toBeLessThanOrEqual(cx - reach);
      expect(rect.y0).toBeLessThanOrEqual(cy - reach);
      expect(rect.x1).toBeGreaterThanOrEqual(cx + reach);
      expect(rect.y1).toBeGreaterThanOrEqual(cy + reach);
    }
  });

  it('clamps to the canvas instead of going negative', () => {
    const rect = viewcubeRect(100, 80);
    expect(rect).toEqual({ x0: 0, y0: 0, x1: 100, y1: 80 });
    expect(rect.x0).toBeGreaterThanOrEqual(0);
    expect(rect.y0).toBeGreaterThanOrEqual(0);
  });
});
