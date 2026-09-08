import { describe, it, expect } from 'vitest';
import {
  computeCompressibleSkinFriction,
  computeNoseconeWaveDrag,
  computeBaseDrag,
  computeAerodynamicCurves,
} from './transonicAero';
import { PRESET_NASA_STUDENT_LAUNCH } from '../store/rocketStore';

describe('Transonic & Supersonic Aerodynamics Engine', () => {
  it('computes Van Driest II compressible turbulent skin friction with altitude scaling', () => {
    const cfSubsonic = computeCompressibleSkinFriction(0.2, 0.5, 68, 0);
    const cfSupersonic = computeCompressibleSkinFriction(2.0, 0.5, 680, 0);

    expect(cfSubsonic).toBeGreaterThan(0.002);
    // Compressibility thins boundary layer gradient, lowering Cf
    expect(cfSupersonic).toBeLessThan(cfSubsonic);

    // Altitude scaling: Thinner air at 8km lowers Reynolds number, increasing friction coefficient
    const cfHighAlt = computeCompressibleSkinFriction(1.5, 1.0, 500, 8000, 0.1);
    const cfSeaLevel = computeCompressibleSkinFriction(1.5, 1.0, 500, 0, 0.1);
    expect(cfHighAlt).toBeGreaterThan(cfSeaLevel);
  });

  it('proves Von Kármán nosecone has lower wave drag than conical at Mach 2', () => {
    const vonKarmanComp = {
      id: 'vk',
      name: 'Von Karman Nose',
      type: 'nosecone' as const,
      shape: 'vonkarman' as const,
      length: 0.5,
      baseDiameter: 0.1,
      wallThickness: 0.002,
      isHollow: true,
      materialId: 'carbonfiber',
    };

    const conicalComp = {
      ...vonKarmanComp,
      shape: 'conical' as const,
    };

    const waveCdVK = computeNoseconeWaveDrag(vonKarmanComp, 2.0);
    const waveCdConical = computeNoseconeWaveDrag(conicalComp, 2.0);

    expect(waveCdVK).toBeLessThan(waveCdConical);
  });

  it('models continuous C1 base drag with peak at Mach 1.0 and power-on plume drop', () => {
    const baseCdPowerOff = computeBaseDrag(1.5, 0.05, 0.05, false);
    const baseCdPowerOn = computeBaseDrag(1.5, 0.05, 0.05, true);

    expect(baseCdPowerOn).toBeLessThan(baseCdPowerOff * 0.5);

    // Peak at Mach 1.0
    const peak = computeBaseDrag(1.0, 0.05, 0.05, false);
    const prePeak = computeBaseDrag(0.9, 0.05, 0.05, false);
    const postPeak = computeBaseDrag(1.1, 0.05, 0.05, false);

    expect(peak).toBeCloseTo(0.38, 2);
    expect(prePeak).toBeLessThan(peak);
    expect(postPeak).toBeLessThan(peak);
  });

  it('generates complete Mach 0 to 4 drag curve with transonic spike', () => {
    const res = computeAerodynamicCurves(PRESET_NASA_STUDENT_LAUNCH, false, 21);

    expect(res.dragCurves.length).toBe(21);
    expect(res.maxTransonicCd).toBeGreaterThan(res.subsonicCd); // Transonic drag rise
    expect(res.machAtMaxCd).toBeGreaterThanOrEqual(0.9);
    expect(res.machAtMaxCd).toBeLessThanOrEqual(1.3);

    // Center of Pressure should migrate forward above Mach 1
    const subCP = res.dragCurves[0].cp;
    const superCP = res.dragCurves.find((d) => d.mach >= 2.0)?.cp || 0;
    expect(superCP).toBeLessThan(subCP);
  });
});
