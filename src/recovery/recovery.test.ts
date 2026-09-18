/**
 * Recovery engine contract tests: dual-compartment bay packing, packed-chute
 * density, axial clearance stacks, pack advisories, shear-pin target
 * pressure, and black-powder charge sizing.
 */
import { describe, it, expect } from 'vitest';

import {
  bayVolume,
  clearanceCheck,
  deriveBays,
  packAdvisory,
  packedDensity,
  PACK_ADVISORY_JAM,
  PACK_ADVISORY_OK_MAX,
  PACK_ADVISORY_OK_MIN,
} from './packing';
import type { RocketVehicle } from '../core/types';
import {
  bpMass,
  CHARGE_MASS_MARGIN,
  GAS_SPECIFIC_CONSTANT_AIR,
  PIN_2_56,
  PIN_4_40,
  SHEAR_SAFETY_FACTOR,
  targetPressure,
} from './charges';

describe('packing: bay geometry and packed density', () => {
  it('bayVolume computes a cylinder volume in m^3', () => {
    // L = 1 m, d = 0.1 m -> r = 0.05 m
    const expected = Math.PI * 0.05 * 0.05 * 1;
    expect(bayVolume(1, 0.1)).toBeCloseTo(expected, 12);
    // Volume doubles with length, quadruples with diameter.
    expect(bayVolume(2, 0.1)).toBeCloseTo(2 * expected, 12);
    expect(bayVolume(1, 0.2)).toBeCloseTo(4 * expected, 12);
  });

  it('packedDensity: 50 g chute in 1 L bay = 0.05 g/cm^3', () => {
    // 1 L = 0.001 m^3 = 1000 cm^3.
    expect(packedDensity(50, 0.001)).toBeCloseTo(0.05, 3);
  });

  it('acceptance: 50 g chute in 1 L bay is loose', () => {
    expect(packAdvisory(packedDensity(50, 0.001))).toBe('loose');
  });
});

describe('packing: pack advisory thresholds', () => {
  it('ok band is [0.25, 0.35] inclusive with documented thresholds', () => {
    expect(PACK_ADVISORY_OK_MIN).toBeCloseTo(0.25, 9);
    expect(PACK_ADVISORY_OK_MAX).toBeCloseTo(0.35, 9);
    expect(packAdvisory(PACK_ADVISORY_OK_MIN - 1e-9)).toBe('loose');
    expect(packAdvisory(PACK_ADVISORY_OK_MIN)).toBe('ok');
    expect(packAdvisory(PACK_ADVISORY_OK_MAX)).toBe('ok');
    expect(packAdvisory(PACK_ADVISORY_OK_MAX + 1e-9)).toBe('tight');
  });

  it('density at/above the jam limit is jammed', () => {
    expect(packAdvisory(PACK_ADVISORY_JAM - 1e-9)).toBe('tight');
    expect(packAdvisory(PACK_ADVISORY_JAM)).toBe('jammed');
    expect(packAdvisory(0.9)).toBe('jammed');
  });
});

describe('packing: axial clearance stack', () => {
  it('fits exactly and reports zero remaining', () => {
    const result = clearanceCheck(1, [
      { name: 'drogue', length: 0.4 },
      { name: 'main', length: 0.6 },
    ]);
    expect(result.fits).toBe(true);
    expect(result.remaining).toBeCloseTo(0, 9);
  });

  it('reports overrun with negative remaining', () => {
    const result = clearanceCheck(1, [
      { name: 'drogue', length: 0.5 },
      { name: 'main', length: 0.7 },
    ]);
    expect(result.fits).toBe(false);
    expect(result.remaining).toBeCloseTo(-0.2, 9);
  });

  it('stacks many items along the bay axis', () => {
    const result = clearanceCheck(1, [
      { name: 'a', length: 0.1 },
      { name: 'b', length: 0.2 },
      { name: 'c', length: 0.3 },
    ]);
    expect(result.fits).toBe(true);
    expect(result.remaining).toBeCloseTo(0.4, 9);
  });
});

describe('charges: shear-pin target pressure', () => {
  it('targetPressure = 2 * N * F / area in Pa with documented 2x factor', () => {
    // 2x safety factor is the documented contract (module header).
    expect(SHEAR_SAFETY_FACTOR).toBe(2);
    // 1 pin x 44 N on a 0.1 m bulkhead: A = pi * 0.05^2.
    const expected = (SHEAR_SAFETY_FACTOR * 1 * 44) / (Math.PI * 0.05 * 0.05);
    expect(targetPressure(1, 44, 0.1)).toBeCloseTo(expected, 12);
    // Audited literal: (2 * 44 N) / (pi * 0.0025 m^2).
    expect(targetPressure(1, 44, 0.1)).toBeCloseTo(11204.507993669431, 5);
  });

  it('targetPressure scales linearly with pin count', () => {
    expect(targetPressure(2, 44, 0.1)).toBeCloseTo(2 * targetPressure(1, 44, 0.1), 6);
    expect(targetPressure(3, 110, 0.1)).toBeCloseTo(3 * targetPressure(1, 110, 0.1), 6);
  });
});

describe('charges: shear pin presets', () => {
  it('presets carry documented force estimates and feed targetPressure', () => {
    expect(PIN_2_56.shearForceN).toBe(44);
    expect(PIN_4_40.shearForceN).toBe(110);
    expect(PIN_2_56.note.length).toBeGreaterThan(0);
    expect(PIN_4_40.note.length).toBeGreaterThan(0);
    const p = targetPressure(2, PIN_4_40.shearForceN, 0.1);
    expect(p).toBeGreaterThan(0);
    expect(Number.isFinite(p)).toBe(true);
  });
});

describe('charges: black-powder charge mass', () => {
  it('bpMass = ideal gas with air R_specific, +20% margin, in grams', () => {
    const p = 50000; // Pa
    const v = 0.01; // m^3
    const t = 2000; // K
    // Documented model: m = P*V / (R_specific * T), air R = 287 J/(kg*K), +20% margin.
    expect(GAS_SPECIFIC_CONSTANT_AIR).toBe(287);
    expect(CHARGE_MASS_MARGIN).toBeCloseTo(1.2, 9);
    const massKg = (p * v) / (GAS_SPECIFIC_CONSTANT_AIR * t);
    const expected = massKg * 1000 * CHARGE_MASS_MARGIN;
    expect(bpMass(p, v, t)).toBeCloseTo(expected, 12);
    // Audited literal for P = 50 kPa, V = 10 L, T = 2000 K.
    expect(bpMass(p, v, t)).toBeCloseTo(1.0452961672473866, 7);
  });

  it('bpMass scales linearly with volume and pressure and stays positive/finite', () => {
    const base = bpMass(50000, 0.01, 2000);
    expect(bpMass(50000, 0.02, 2000)).toBeCloseTo(2 * base, 9);
    expect(bpMass(100000, 0.01, 2000)).toBeCloseTo(2 * base, 9);
    expect(Number.isFinite(base)).toBe(true);
    expect(base).toBeGreaterThan(0);
  });

  it('bpMass defaults combustion temperature to 2000 K', () => {
    expect(bpMass(50000, 0.01)).toBeCloseTo(bpMass(50000, 0.01, 2000), 12);
  });
});

describe('packing and charges: degenerate inputs are rejected', () => {
  it('rejects non-positive or non-finite inputs', () => {
    expect(() => bayVolume(0, 0.1)).toThrow(/must be > 0/);
    expect(() => packedDensity(50, 0)).toThrow(/must be > 0/);
    expect(() => packedDensity(NaN, 0.001)).toThrow(/must be finite/);
    expect(() => clearanceCheck(1, [{ name: 'x', length: -0.1 }])).toThrow(/must be > 0/);
    expect(() => targetPressure(0, 44, 0.1)).toThrow(/must be > 0/);
    expect(() => targetPressure(1.5, 44, 0.1)).toThrow(/whole number/);
    expect(() => targetPressure(1, 44, 0)).toThrow(/must be > 0/);
    expect(() => bpMass(0, 0.01)).toThrow(/must be > 0/);
  });
});
describe('packing: deriveBays from bodytubes + chute spans (C9/Q1-Q3)', () => {
  const tube = {
    id: 'tube',
    name: 'BT-50',
    type: 'bodytube' as const,
    materialId: 'cardboard',
    length: 0.311,
    outerDiameter: 0.0248,
    innerDiameter: 0.0241,
  };
  const chute = {
    id: 'chute',
    name: '12 in chute',
    type: 'parachute' as const,
    materialId: 'nylon',
    diameter: 0.305,
    cd: 0.8,
    mass: 0.008,
    axialOffset: 0.05,
  };
  const vehicle = (components: RocketVehicle['components']): RocketVehicle => ({
    id: 'v',
    name: 'v',
    version: '1',
    author: 't',
    components,
  });

  it('derives one bay per chute-hosting tube with entered dims and assumed bore', () => {
    const { bays, unplacedChutes } = deriveBays(vehicle([tube, chute]));
    expect(unplacedChutes).toEqual([]);
    expect(bays).toHaveLength(1);
    const [bay] = bays;
    expect(bay.tubeId).toBe('tube');
    expect(bay.lengthM).toEqual({ value: 0.311, provenance: 'entered' });
    expect(bay.innerDiameterM).toEqual({ value: 0.0241, provenance: 'entered' });
    expect(bay.ambiguityNote).toBeNull();
    expect(bay.items).toHaveLength(1);
    const [item] = bay.items;
    expect(item.kind).toBe('chute');
    // Packed length absent: missing (excluded from clearance, never guessed).
    expect(item.lengthM).toEqual({ value: null, provenance: 'missing' });
    // Packed diameter absent: assumed bore (documented fallback).
    expect(item.diameterM).toEqual({ value: 0.0241, provenance: 'assumed' });
    expect(item.massG).toEqual({ value: 8, provenance: 'entered' });
  });

  it('surfaces duplicate-chute ambiguity and unplaced chutes instead of guessing', () => {
    const second = { ...chute, id: 'chute2', name: 'second chute', packedLengthM: 0.12 };
    const stray = { ...chute, id: 'stray', name: 'stray chute', axialOffset: 9.9 };
    const { bays, unplacedChutes } = deriveBays(vehicle([tube, chute, second, stray]));
    expect(bays).toHaveLength(1);
    expect(bays[0].ambiguityNote).toMatch(/2 chutes share this tube/);
    expect(bays[0].items).toHaveLength(2);
    expect(unplacedChutes).toEqual(['stray chute']);
  });

  it('enters user-packed dims and sled bounds; tubes without chutes yield no bay', () => {
    const packed = { ...chute, packedLengthM: 0.14, packedDiameterM: 0.02 };
    const sled = {
      id: 'sled',
      name: 'avionics sled',
      type: 'masscomponent' as const,
      materialId: 'pcb',
      mass: 0.2,
      length: 0.1,
      axialOffset: 0.2,
      widthM: 0.02,
      heightM: 0.015,
    };
    const bareTube = { ...tube, id: 'bare', name: 'booster' };
    const { bays } = deriveBays(vehicle([bareTube, tube, packed, sled]));
    expect(bays).toHaveLength(1);
    const [bay] = bays;
    expect(bay.items).toHaveLength(2);
    expect(bay.items[0].lengthM).toEqual({ value: 0.14, provenance: 'entered' });
    expect(bay.items[0].diameterM).toEqual({ value: 0.02, provenance: 'entered' });
    expect(bay.items[1]).toMatchObject({
      kind: 'sled',
      lengthM: { value: 0.1, provenance: 'entered' },
      diameterM: { value: 0.015, provenance: 'entered' },
      massG: null,
    });
  });
});