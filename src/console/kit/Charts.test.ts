import { describe, expect, it } from 'vitest';
import { LANDING_SCATTER_MAX, LANDING_SCATTER_MIN, landingScatterSize } from './Charts';

/** The scatter is square: every ring/point/tick is placed from this one edge. */
describe('landingScatterSize', () => {
  it('uses the limiting edge of the measured box', () => {
    expect(landingScatterSize(300, 500)).toBe(300);
    expect(landingScatterSize(500, 300)).toBe(300);
    expect(landingScatterSize(240, 240)).toBe(240);
  });

  it('never grows past the cap or shrinks below the readable floor', () => {
    expect(landingScatterSize(2000, 2000)).toBe(LANDING_SCATTER_MAX);
    expect(landingScatterSize(20, 20)).toBe(LANDING_SCATTER_MIN);
    expect(landingScatterSize(0, 500)).toBe(LANDING_SCATTER_MIN);
  });

  it('floors to whole pixels so the square stays inside the box', () => {
    expect(landingScatterSize(218.9, 500)).toBe(218);
    expect(landingScatterSize(500, 147.6)).toBe(147);
  });

  it('falls back to the floor before the first measurement', () => {
    expect(landingScatterSize(Number.NaN, 300)).toBe(LANDING_SCATTER_MIN);
    expect(landingScatterSize(300, Number.POSITIVE_INFINITY)).toBe(LANDING_SCATTER_MIN);
  });
});
