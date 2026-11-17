// @vitest-environment jsdom
/**
 * Adaptive render ratio. A 1x display supersamples in clean steps (1.5, 2)
 * while the GPU keeps up and the canvas fits the pixel budget; a 2x display is
 * already at the ceiling; a slow GPU settles back to the display's own ratio.
 */
import { describe, expect, it } from 'vitest';
import { CLIMB_AFTER, MAX_QUALITY, PIXEL_BUDGET, nextQuality, renderDpr } from './Viewport';

const LAPTOP = 1031 * 596;

describe('renderDpr', () => {
  it('steps a 1x display through 1, 1.5 and 2', () => {
    expect(renderDpr(0, 1, LAPTOP)).toBe(1);
    expect(renderDpr(1, 1, LAPTOP)).toBe(1.5);
    expect(renderDpr(2, 1, LAPTOP)).toBe(2);
  });

  it('never goes below native or above 2', () => {
    expect(renderDpr(0, 2, LAPTOP)).toBe(2);
    expect(renderDpr(2, 2, LAPTOP)).toBe(2);
    expect(renderDpr(2, 3, LAPTOP)).toBe(2);
    expect(renderDpr(0, 1.25, LAPTOP)).toBe(1.25);
    expect(renderDpr(2, 1.25, LAPTOP)).toBe(2);
    expect(renderDpr(-5, 1, LAPTOP)).toBe(1);
    expect(renderDpr(9, 1, LAPTOP)).toBe(2);
  });

  it('keeps the drawing buffer inside the pixel budget on a large 1x canvas', () => {
    const ultrawide = 2560 * 1300;
    const ratio = renderDpr(MAX_QUALITY, 1, ultrawide);
    expect(ratio * ratio * ultrawide).toBeLessThanOrEqual(PIXEL_BUDGET);
    expect(ratio).toBe(1.5);
    // Too large even for 1.5: native only.
    expect(renderDpr(MAX_QUALITY, 1, 3840 * 2000)).toBe(1);
  });

  it('treats an unmeasured canvas and bad inputs safely', () => {
    expect(renderDpr(MAX_QUALITY, 1, 0)).toBe(2);
    expect(renderDpr(Number.NaN, 1, LAPTOP)).toBe(2);
    expect(renderDpr(MAX_QUALITY, Number.NaN, LAPTOP)).toBe(2);
  });
});

describe('nextQuality', () => {
  it('drops one level on a slow window', () => {
    expect(nextQuality({ level: 2, fast: 0 }, 1 / 30)).toEqual({ level: 1, fast: 0 });
    expect(nextQuality({ level: 0, fast: 2 }, 1 / 30)).toEqual({ level: 0, fast: 0 });
  });

  it('climbs only after consecutive fast windows', () => {
    let state = { level: 0, fast: 0 };
    for (let i = 1; i < CLIMB_AFTER; i++) {
      state = nextQuality(state, 1 / 60);
      expect(state.level).toBe(0);
    }
    state = nextQuality(state, 1 / 60);
    expect(state).toEqual({ level: 1, fast: 0 });
    expect(nextQuality({ level: MAX_QUALITY, fast: 0 }, 1 / 60).level).toBe(MAX_QUALITY);
  });

  it('a middling window resets the climb streak; bad samples change nothing', () => {
    expect(nextQuality({ level: 1, fast: 2 }, 1 / 50)).toEqual({ level: 1, fast: 0 });
    const state = { level: 1, fast: 1 };
    expect(nextQuality(state, 0)).toBe(state);
    expect(nextQuality(state, Number.NaN)).toBe(state);
  });
});
