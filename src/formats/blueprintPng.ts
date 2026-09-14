/**
 * Astraea Blueprint PNG Rasterizer
 *
 * Renders a standalone blueprint SVG (see ./blueprint) to a PNG Blob using
 * only stock browser machinery: the document is served to an <img> through a
 * blob: URL, decoded, composited onto an offscreen <canvas> at its intrinsic
 * size, and encoded with the standard callback-form `canvas.toBlob` — no
 * rasterization dependency beyond what the host browser already provides
 * (Q10 zero-dep canvas).
 *
 * Encoding capability: the runtime must implement `canvas.toBlob` (present in
 * browsers, absent in plain jsdom). When it is missing — or when the encoder
 * yields no image data — the exporter fails with an explicit, actionable
 * error instead of a cryptic null dereference. The returned Blob always
 * advertises `image/png` regardless of the encoder's default MIME.
 */

/** MIME type requested from the canvas encoder. */
const PNG_MIME = 'image/png';

/** Intrinsic pixel size, preferring the decoder's report, else the SVG's own px width/height. */
function intrinsicSize(svg: string, img: HTMLImageElement): { width: number; height: number } | null {
  const nw = img.naturalWidth ?? Number.NaN;
  const nh = img.naturalHeight ?? Number.NaN;
  const natural =
    Number.isFinite(nw) && Number.isFinite(nh) && nw > 0 && nh > 0
      ? { width: Math.ceil(nw), height: Math.ceil(nh) }
      : null;
  const attrOf = (name: 'width' | 'height'): number | null => {
    const m = new RegExp(`\\b${name}="([0-9.]+)"`).exec(svg);
    const v = m ? Number(m[1]) : Number.NaN;
    return Number.isFinite(v) && v > 0 ? Math.ceil(v) : null;
  };
  const width = natural ? Math.ceil(natural.width) : attrOf('width');
  const height = natural ? Math.ceil(natural.height) : attrOf('height');
  return width !== null && height !== null ? { width, height } : null;
}

async function decodeImage(url: string): Promise<HTMLImageElement> {
  const img = document.createElement('img');
  const ready = new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('blueprint png: the SVG image failed to decode'));
  });
  img.src = url;
  await ready;
  return img;
}

/**
 * Rasterize `svg` to a PNG Blob. Rejects empty documents up front and fails
 * with a descriptive error when the environment cannot encode PNGs.
 */
export async function renderBlueprintPng(svg: string): Promise<Blob> {
  if (!svg || svg.trim() === '') {
    throw new Error('blueprint png: cannot rasterize an empty SVG document');
  }

  const source = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(source);
  try {
    const img = await decodeImage(url);
    const size = intrinsicSize(svg, img);
    if (!size) {
      throw new Error('blueprint png: cannot determine the SVG pixel size for the canvas');
    }

    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;

    if (typeof canvas.toBlob !== 'function') {
      throw new Error(
        'blueprint png: PNG encoding requires a canvas.toBlob-capable runtime, ' +
        'which this environment does not provide'
      );
    }
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('blueprint png: the canvas 2D context is unavailable in this environment');
    }
    context.drawImage(img, 0, 0);

    const png = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob
            ? resolve(blob)
            : reject(new Error('blueprint png: the canvas encoder returned no image data')),
        PNG_MIME
      );
    });
    // Enforce the image/png MIME contract even if the encoder omits a type.
    return png.type === 'image/png' ? png : new Blob([png], { type: 'image/png' });
  } finally {
    URL.revokeObjectURL(url);
  }
}