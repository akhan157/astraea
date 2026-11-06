import { describe, expect, it } from 'vitest';
import type { RocketVehicle, StabilityAnalysis } from '../core/types';
import { qualifyGeometryStability } from './geometryCpSupport';
import { explainStabilityAnalysis } from './stabilityBreakdown';
import { marginGate, stabilityBreakdown } from '../console/data/adapter';

const vehicle: RocketVehicle = {
  id: 'tail', name: 'Tail-cone test', version: '1.0', author: 'test',
  components: [
    { id: 'nc', name: 'Nose', type: 'nosecone', shape: 'ogive', length: 0.1, baseDiameter: 0.025, wallThickness: 0.001, isHollow: true, materialId: 'pla_3dprint' },
    { id: 'bt', name: 'Tube', type: 'bodytube', length: 0.3, outerDiameter: 0.025, innerDiameter: 0.024, materialId: 'cardboard' },
    { id: 'tc', name: 'Tail cone', type: 'transition', length: 0.06, foreDiameter: 0.025, aftDiameter: 0.0000125, wallThickness: 0.0002, isHollow: true, materialId: 'cardboard' },
  ],
};

/** What the engine returns for the vehicle above: its 2/3-length CP stand-in. */
function engineFallback(): StabilityAnalysis {
  return {
    totalLength: 0.46, maxDiameter: 0.025, referenceDiameter: 0.025, totalMass: 0.03, cg: 0.2, cp: (2 / 3) * 0.46,
    staticMarginCalibers: ((2 / 3) * 0.46 - 0.2) / 0.025, totalCNa: 5e-7, isStable: true, isOverStable: true,
    contributions: [
      { id: 'nc', name: 'Nose', type: 'nosecone', mass: 0.005, cg: 0.06, cp: 0.0466, cna: 2, axialStart: 0, axialEnd: 0.1 },
      { id: 'bt', name: 'Tube', type: 'bodytube', mass: 0.02, cg: 0.25, axialStart: 0.1, axialEnd: 0.4 },
      { id: 'tc', name: 'Tail cone', type: 'transition', mass: 0.005, cg: 0.42, cp: 0.43, cna: -1.9999995, axialStart: 0.4, axialEnd: 0.46 },
    ],
  };
}

describe('geometry CP support', () => {
  it('withholds CP, margin and the verdict when the engine substituted a CP for an unsupported slope', () => {
    const raw = engineFallback();
    const q = qualifyGeometryStability(raw);
    expect(q.cp).toBeNaN();
    expect(q.staticMarginCalibers).toBeNaN();
    expect([q.isStable, q.isOverStable]).toEqual([false, false]);
    expect(q.cpUnavailable).toMatch(/total normal-force slope 5e-7 \/rad is below the supported geometry range/);
    expect([q.totalCNa, q.cg, q.totalMass]).toEqual([raw.totalCNa, raw.cg, raw.totalMass]);
    expect(q.contributions).toEqual(raw.contributions);
    expect(raw.cp).toBeCloseTo(0.3067, 4);
  });

  it('withholds the native geometry fallback boundary and applies 64-epsilon conditioning', () => {
    const base = engineFallback();
    const at = (totalCNa: number, cnas: number[]) => qualifyGeometryStability({ ...base, totalCNa, cp: 0.3, staticMarginCalibers: 4, isStable: true, isOverStable: true,
      contributions: cnas.map((cna, i) => ({ ...base.contributions[0], id: `c${i}`, cna })) });
    expect(at(1e-4, [1e-4]).cpUnavailable).toBeDefined();
    expect(at(1e-4, [1e-4]).cp).toBeNaN();
    expect(at(1.01e-4, [1.01e-4]).cpUnavailable).toBeUndefined();
    expect(at(0.99e-4, [0.99e-4]).cpUnavailable).toBeDefined();
    expect(at(-3, [-3]).cpUnavailable).toMatch(/not a positive/);
    expect(at(Number.NaN, [1]).cpUnavailable).toMatch(/not finite/);
    const big = 1e14;
    expect(at(1e-3, [big, -big + 1e-3]).cpUnavailable).toMatch(/cancels/);
    const supported = at(16, [2, 14]);
    expect(supported).toEqual({ ...base, totalCNa: 16, cp: 0.3, staticMarginCalibers: 4, isStable: true, isOverStable: true, contributions: supported.contributions });
  });

  it('explains the missing CP instead of a verdict, pullers or a fallback-based what-if', () => {
    const notes = explainStabilityAnalysis(vehicle, qualifyGeometryStability(engineFallback())).plainLanguage.join(' ');
    expect(notes).toMatch(/Center of pressure and static margin are unavailable: .*total normal-force slope/);
    expect(notes).not.toMatch(/Stable:|Understable:|Overstable:|Pulls the CP|moves the CP|NaN/);
  });

  it('does not invent a what-if CP shift when removing a transition would leave no supported slope', () => {
    const shoulderOnly: StabilityAnalysis = { ...engineFallback(), totalCNa: 0.8, cp: 0.43, staticMarginCalibers: 9.2, isStable: true, isOverStable: true,
      contributions: [{ ...engineFallback().contributions[2], cna: 0.8 }] };
    const notes = explainStabilityAnalysis({ ...vehicle, components: [vehicle.components[2]] }, qualifyGeometryStability(shoulderOnly)).plainLanguage.join(' ');
    expect(notes).toMatch(/removing it would leave no supported normal-force slope/);
    expect(notes).not.toMatch(/moves the CP/);
  });

  it('the console shows CP/margin as unknown with the reason and the margin gate is unknown, not pass/fail', () => {
    const q = qualifyGeometryStability(engineFallback());
    const b = stabilityBreakdown(q, vehicle);
    expect(b.cp.confidence).toBe('unknown');
    expect(b.margin.confidence).toBe('unknown');
    expect(b.margin.reason).toBe(q.cpUnavailable);
    expect(b.marginPercentLength).toBeUndefined();
    const gate = marginGate(b.margin);
    expect(gate.status).toBe('unknown');
    expect(gate.reason).toContain(q.cpUnavailable!);
  });
});
