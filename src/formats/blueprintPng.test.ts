/**
 * Blueprint PNG rasterizer contract tests (Q10 zero-dep canvas).
 *
 * jsdom does not rasterize SVG nor encode PNGs, so these cases pin the
 * forward contract that the app runtime — not the test host — must satisfy:
 *   - empty/whitespace documents are rejected up front, before any DOM work;
 *   - the exporter fails explicitly when canvas PNG encoding is unavailable
 *     (jsdom's canvas has no `toBlob`), rather than mysteriously;
 *   - when the runtime does expose a conforming encoder, the returned Blob
 *     carries the image/png MIME.
 */

// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderBlueprintPng } from './blueprintPng';
import { exportBlueprintSvg } from './blueprint';

/** Runtime surface the rasterizer relies on from a decoded <img>. */
interface FakeImage {
  onload: (() => void) | null;
  onerror: (() => void) | null;
  src: string;
}

/**
 * Minimal image whose load event fires when its src is assigned; fidelity is
 * irrelevant here.
 */
const FAKE_IMG: FakeImage = {
  onload: null,
  onerror: null,
  set src(_v: string) {
    // jsdom does not decode blob: URLs: simulate a successful decode so the
    // load handler registered before src assignment runs.
    if (typeof this.onload === 'function') this.onload();
  },
};

const SVG = exportBlueprintSvg({
  id: 'v1',
  name: 'PNG Target',
  version: '1.0',
  author: 'test',
  components: [
    {
      id: 'bt1',
      name: 'Tube',
      type: 'bodytube',
      length: 0.3,
      outerDiameter: 0.04,
      innerDiameter: 0.038,
      materialId: 'cardboard',
    },
  ],
});

let originalCreateElement: typeof document.createElement;

beforeEach(() => {
  // Bind: jsdom's HTMLDocument methods check their receiver instance.
  originalCreateElement = document.createElement.bind(document);
});

afterEach(() => {
  document.createElement = originalCreateElement;
});

describe('renderBlueprintPng', () => {
  it('rejects an empty SVG document without touching the DOM', async () => {
    // No DOM stubbing expected: the guard must trip before createElement.
    await expect(renderBlueprintPng('')).rejects.toThrow(/empty SVG/);
    await expect(renderBlueprintPng('   \n ')).rejects.toThrow(/empty SVG/);
  });

  it('fails explicitly when the canvas runtime cannot encode PNGs', async () => {
    const created: unknown[] = [];
    document.createElement = (tag: string) => {
      if (tag === 'img') return FAKE_IMG as unknown as HTMLImageElement;
      if (tag === 'canvas') {
        const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
        // jsdom's toBlob is a legacy callback stub, not the Promise encoder:
        // drop it to simulate a runtime that cannot encode PNGs at all.
        const withoutEncoder = canvas as unknown as { toBlob: undefined };
        withoutEncoder.toBlob = undefined;
        created.push(canvas);
        return canvas;
      }
      return originalCreateElement(tag);
    };
    const createObjectURL = (b: Blob) => `blob:svg-${b.size}`;
    const revokeObjectURL = () => {};
    const oldUrl = globalThis.URL;
    // @ts-expect-error URL stub lacks the factory constructor members
    globalThis.URL = { createObjectURL, revokeObjectURL };
    try {
      await expect(renderBlueprintPng(SVG)).rejects.toThrow(/canvas\.toBlob/);
    } finally {
      globalThis.URL = oldUrl;
    }
    expect(created).toHaveLength(1);
  });

  it('encodes to a Blob with the image/png MIME contract via canvas.toBlob', async () => {
    const drawImage = () => {};
    document.createElement = (tag: string) => {
      if (tag === 'img') return FAKE_IMG as unknown as HTMLImageElement;
      if (tag === 'canvas') {
        const canvas = originalCreateElement('canvas') as HTMLCanvasElement;
        // The lib-declared toBlob is the legacy callback form; the runtime
        // under test implements the Promise form, so the stub is cast.
        canvas.toBlob = (async (format: string) => {
          expect(format).toBe('png');
          return new Blob(['\x89PNG'], { type: 'image/png' });
        }) as unknown as typeof canvas.toBlob;
        canvas.getContext = (() => ({ drawImage }) as unknown as CanvasRenderingContext2D) as unknown as typeof canvas.getContext;
        return canvas;
      }
      return originalCreateElement(tag);
    };
    const createObjectURL = (b: Blob) => `blob:svg-${b.size}`;
    const revokeObjectURL = () => {};
    const oldUrl = globalThis.URL;
    // @ts-expect-error URL stub lacks the factory constructor members
    globalThis.URL = { createObjectURL, revokeObjectURL };
    try {
      const blob = await renderBlueprintPng(SVG);
      expect(blob.type).toBe('image/png');
      expect(blob.size).toBeGreaterThan(0);
    } finally {
      globalThis.URL = oldUrl;
    }
  });
});