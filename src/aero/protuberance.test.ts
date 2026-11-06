import { describe, it, expect } from 'vitest';
import {
  computeProtuberanceDrag,
  boattailSeparationCheck,
  ProtuberanceDragInput,
} from './protuberance';

const DEG2RAD = Math.PI / 180.0;

describe('Hoerner Protuberance Drag', () => {
  const base: ProtuberanceDragInput = {
    frontalArea: 0.002,
    refArea: 0.00785, // 0.1 m body tube
    lugHeight: 0.008,
    boundaryLayerThickness: 0.008,
  };

  it('returns zero drag for zero frontal area', () => {
    const cd = computeProtuberanceDrag({ ...base, frontalArea: 0 });
    expect(cd).toBe(0);
  });

  it('returns zero drag for zero lug height', () => {
    const cd = computeProtuberanceDrag({ ...base, lugHeight: 0 });
    expect(cd).toBe(0);
  });

  it('applies the (y/delta)^(1/7) Hoerner immersion factor', () => {
    // At y/delta = 1 the protuberance is fully immersed: factor = 1
    const fullyImmersed = computeProtuberanceDrag({ ...base, lugHeight: 0.008 });
    expect(fullyImmersed).toBeCloseTo(1.2 * (0.002 / 0.00785), 12);

    // Half-height protuberance: factor = (0.5)^(1/7)
    const halfHeight = computeProtuberanceDrag({ ...base, lugHeight: 0.004 });
    expect(halfHeight).toBeCloseTo(1.2 * (0.002 / 0.00785) * Math.pow(0.5, 1.0 / 7.0), 12);
  });

  it('is monotonic in y/delta and clamps at full immersion', () => {
    const ratios = [0.0, 0.125, 0.25, 0.5, 0.75, 1.0, 2.0, 4.0, 10.0];
    const cds = ratios.map((r) =>
      computeProtuberanceDrag({
        ...base,
        lugHeight: r * 0.008,
        boundaryLayerThickness: 0.008,
      })
    );

    for (let i = 1; i < cds.length; i++) {
      expect(cds[i]).toBeGreaterThanOrEqual(cds[i - 1]);
    }
    // Strictly increasing below full immersion
    expect(cds[4]).toBeGreaterThan(cds[3]);
    expect(cds[3]).toBeGreaterThan(cds[2]);
    expect(cds[1]).toBeGreaterThan(cds[0]);
    // Clamped: protruding beyond the boundary layer adds no drag
    expect(cds[6]).toBe(cds[7]);
    expect(cds[7]).toBe(cds[8]);
    expect(cds[6]).toBeCloseTo(1.2 * (0.002 / 0.00785), 12);
  });

  it('treats an undefined boundary layer as full immersion', () => {
    const cd = computeProtuberanceDrag({ ...base, boundaryLayerThickness: 0 });
    expect(cd).toBeCloseTo(1.2 * (0.002 / 0.00785), 12);
  });

  it('defaults to the Hoerner finite-cylinder crossflow Cd of 1.2', () => {
    const cd = computeProtuberanceDrag({ ...base });
    expect(cd).toBeCloseTo(1.2 * (0.002 / 0.00785), 12);
  });

  it('honors a custom base cylinder Cd', () => {
    const cd = computeProtuberanceDrag({ ...base, baseCylinderCd: 0.9 });
    expect(cd).toBeCloseTo(0.9 * (0.002 / 0.00785), 12);
  });

  it('throws on non-finite inputs', () => {
    const cases: Array<Partial<ProtuberanceDragInput>> = [
      { frontalArea: Number.NaN },
      { frontalArea: Number.POSITIVE_INFINITY },
      { lugHeight: Number.NaN },
      { boundaryLayerThickness: Number.NEGATIVE_INFINITY },
      { refArea: Number.POSITIVE_INFINITY },
      { baseCylinderCd: Number.NaN },
    ];
    for (const partial of cases) {
      expect(() => computeProtuberanceDrag({ ...base, ...partial })).toThrow(RangeError);
    }
  });

  it('throws on negative boundaryLayerThickness and refArea', () => {
    expect(() => computeProtuberanceDrag({ ...base, boundaryLayerThickness: -0.1 })).toThrow(/boundaryLayerThickness/);
    expect(() => computeProtuberanceDrag({ ...base, refArea: -1 })).toThrow(/refArea/);
  });

  it('keeps the zero-contract: zero area/height => 0 despite the refArea floor', () => {
    // Negative frontal area/lug height stay clamped (only the specified fields throw); zero stays 0.
    expect(computeProtuberanceDrag({ ...base, frontalArea: 0 })).toBe(0);
    expect(computeProtuberanceDrag({ ...base, lugHeight: 0 })).toBe(0);
    // NaN in any field throws even when the zero path would otherwise return 0.
    expect(() => computeProtuberanceDrag({ ...base, frontalArea: 0, refArea: Number.NaN })).toThrow(RangeError);
  });
});

describe('Boattail Separation Monitor', () => {
  it('flags a 15 deg half-angle boattail cone as separated', () => {
    const length = (0.1 - 0.05) / (2 * Math.tan(15 * DEG2RAD));
    const res = boattailSeparationCheck(0.1, 0.05, length);

    expect(res.halfAngleDeg).toBeCloseTo(15, 6);
    expect(res.separated).toBe(true);
  });

  it('passes a 5 deg half-angle boattail cone', () => {
    const length = (0.1 - 0.05) / (2 * Math.tan(5 * DEG2RAD));
    const res = boattailSeparationCheck(0.1, 0.05, length);

    expect(res.halfAngleDeg).toBeCloseTo(5, 6);
    expect(res.separated).toBe(false);
  });

  it('does not flag cones at or just below the 10 deg threshold', () => {
    const length = (0.1 - 0.05) / (2 * Math.tan(9.99 * DEG2RAD));
    const res = boattailSeparationCheck(0.1, 0.05, length);

    expect(res.halfAngleDeg).toBeCloseTo(9.99, 4);
    expect(res.separated).toBe(false);
  });

  it('flags cones just over the 10 deg threshold', () => {
    const length = (0.1 - 0.05) / (2 * Math.tan(10.01 * DEG2RAD));
    const res = boattailSeparationCheck(0.1, 0.05, length);

    expect(res.halfAngleDeg).toBeCloseTo(10.01, 4);
    expect(res.separated).toBe(true);
  });

  it('flags divergent flares by half-angle magnitude', () => {
    const length = (0.1 - 0.05) / (2 * Math.tan(15 * DEG2RAD));
    const boattail = boattailSeparationCheck(0.1, 0.05, length);
    const flare = boattailSeparationCheck(0.05, 0.1, length);

    expect(flare.halfAngleDeg).toBeCloseTo(boattail.halfAngleDeg, 12);
    expect(flare.separated).toBe(true);
  });

  it('fails closed on degenerate geometry', () => {
    expect(boattailSeparationCheck(0.1, 0.05, 0)).toEqual({ halfAngleDeg: 0, separated: false });
    expect(boattailSeparationCheck(0, 0.05, 1)).toEqual({ halfAngleDeg: 0, separated: false });
    expect(boattailSeparationCheck(0.1, -1, 1)).toEqual({ halfAngleDeg: 0, separated: false });
  });

  it('throws on non-finite diameters or length', () => {
    expect(() => boattailSeparationCheck(Number.NaN, 0.05, 1)).toThrow(RangeError);
    expect(() => boattailSeparationCheck(0.1, Number.POSITIVE_INFINITY, 1)).toThrow(RangeError);
    expect(() => boattailSeparationCheck(0.1, 0.05, Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});