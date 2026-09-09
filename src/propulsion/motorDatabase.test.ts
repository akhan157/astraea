/**
 * Motor depletion contract tests (Round-16 audit §4.1).
 *
 * The production depletion law is impulse-proportional on the CURVE integral
 * (getMotorImpulseTotal === integrateThrustCurve), so every identity below
 * must hold exactly for every certified motor: wet/dry/propellant splits,
 * burnout continuity, no interior saturation, flow differentiating mass, and
 * flow integrating back to the propellant load. The nameplate totalImpulse is
 * display data cross-checked with an explicit tolerance — dynamics never use
 * it as a denominator.
 */
import { describe, it, expect } from 'vitest';
import {
  CERTIFIED_MOTORS,
  getMotorMassAt,
  getMotorMassFlowAt,
  getMotorThrustAt,
  getMotorImpulseTotal,
  integrateThrustCurve,
  validateMotorSpec,
} from './motorDatabase';

const MOTORS = Object.values(CERTIFIED_MOTORS);
if (MOTORS.length === 0) throw new Error('motor test: no certified motors');

describe('motor depletion: exact identities for every certified motor', () => {
  it('wet/dry/propellant identities hold at every query time', () => {
    for (const m of MOTORS) {
      // Certified data split (decimal literals; floating-point exactness).
      expect(m.totalMass).toBeCloseTo(m.dryMass + m.propellantMass, 12);
      for (const t of [0, 0.13, m.burnTime * 0.5, m.burnTime * 0.99, m.burnTime, m.burnTime + 2]) {
        const st = getMotorMassAt(m, t);
        // Endpoint branches return the certified literals; the interior
        // branch is one floating-point addition, exactly self-consistent.
        if (t <= 0) expect(st.currentMass).toBe(m.totalMass);
        else if (t >= m.burnTime) expect(st.currentMass).toBe(m.dryMass);
        else expect(st.currentMass).toBe(m.dryMass + st.propellantRemaining);
        expect(st.propellantRemaining).toBeGreaterThanOrEqual(0);
        expect(st.propellantRemaining).toBeLessThanOrEqual(m.propellantMass);
      }
    }
  });

  it('burnout continuity: wet at ignition, exactly dry at and after burnout', () => {
    for (const m of MOTORS) {
      expect(getMotorMassAt(m, 0).currentMass).toBe(m.totalMass);
      expect(getMotorMassAt(m, 0).propellantRemaining).toBe(m.propellantMass);
      expect(getMotorMassAt(m, m.burnTime).currentMass).toBe(m.dryMass);
      expect(getMotorMassAt(m, m.burnTime).propellantRemaining).toBe(0);
      expect(getMotorMassAt(m, m.burnTime + 5).currentMass).toBe(m.dryMass);
      // Approach from inside the burn: no jump at the boundary.
      const justBefore = getMotorMassAt(m, m.burnTime * (1 - 1e-9));
      expect(Math.abs(justBefore.currentMass - m.dryMass)).toBeLessThanOrEqual(1e-6 * m.propellantMass);
    }
  });

  it('no interior saturation: propellant remains until burnout', () => {
    for (const m of MOTORS) {
      for (const f of [0.25, 0.5, 0.75, 0.9, 0.99]) {
        const st = getMotorMassAt(m, m.burnTime * f);
        expect(st.propellantRemaining).toBeGreaterThan(0);
      }
      // Strictly decreasing while thrust is delivered.
      const a = getMotorMassAt(m, m.burnTime * 0.4).propellantRemaining;
      const b = getMotorMassAt(m, m.burnTime * 0.6).propellantRemaining;
      expect(b).toBeLessThan(a);
    }
  });

  it('mass flow differentiates the implemented mass function', () => {
    for (const m of MOTORS) {
      for (let i = 0; i < m.thrustCurve.length - 1; i++) {
        const a = m.thrustCurve[i];
        const b = m.thrustCurve[i + 1];
        const segLen = b.time - a.time;
        if (!(segLen > 0)) continue;
        const mid = (a.time + b.time) / 2;
        const h = Math.min(1e-4, segLen / 4);
        const fd =
          (getMotorMassAt(m, mid + h).currentMass - getMotorMassAt(m, mid - h).currentMass) / (2 * h);
        const flow = getMotorMassFlowAt(m, mid);
        const scale = Math.max(1e-12, Math.abs(flow));
        expect(Math.abs(fd - flow) / scale).toBeLessThanOrEqual(1e-6);
      }
      expect(getMotorMassFlowAt(m, -1)).toBe(0);
      expect(getMotorMassFlowAt(m, m.burnTime + 1)).toBe(0);
    }
  });
  it('mass flow integrates back to the propellant load and vanishes at burnout', () => {
    for (const m of MOTORS) {
      // Segmentwise-exact quadrature: flow is linear on each thrust-curve
      // segment, so endpoint trapezoids recover the propellant load to fp.
      let delivered = 0;
      let peak = 0;
      const c = m.thrustCurve;
      for (let i = 0; i < c.length - 1; i++) {
        const f0 = -getMotorMassFlowAt(m, c[i].time);
        const f1 = -getMotorMassFlowAt(m, c[i + 1].time);
        peak = Math.max(peak, f0, f1);
        delivered += 0.5 * (f0 + f1) * (c[i + 1].time - c[i].time);
      }
      expect(Math.abs(delivered - m.propellantMass) / m.propellantMass).toBeLessThanOrEqual(1e-9);
      // Thrust curve ends at zero, so the flow is continuous through burnout.
      expect(Math.abs(getMotorMassFlowAt(m, m.burnTime * (1 - 1e-6))) / peak).toBeLessThanOrEqual(0.01);
    }
  });

  it('curve integral is the authoritative denominator; nameplate cross-check is documented', () => {
    for (const m of MOTORS) {
      expect(getMotorImpulseTotal(m)).toBe(integrateThrustCurve(m, m.burnTime));
      expect(getMotorThrustAt(m, 0)).toBe(0);
      expect(getMotorThrustAt(m, m.burnTime)).toBe(0);
      // Data-quality cross-check only (dynamics never use the nameplate):
      // the worst certified spread (I205) is ~9.6%.
      const spread = Math.abs(integrateThrustCurve(m, m.burnTime) - m.totalImpulse) / m.totalImpulse;
      expect(spread).toBeLessThanOrEqual(0.12);
    }
  });
});

describe('motor record validation: fail-closed generic handling (Round-17 audit §5.2)', () => {
  it('accepts every bundled certified motor', () => {
    for (const m of MOTORS) {
      expect(() => validateMotorSpec(m)).not.toThrow();
    }
  });

  it('rejects degenerate and inconsistent records instead of degrading silently', () => {
    const base = CERTIFIED_MOTORS.estes_c6;
    expect(() => validateMotorSpec({ ...base, thrustCurve: [] })).toThrow(/at least two points/);
    expect(() => validateMotorSpec({ ...base, thrustCurve: [{ time: 0, thrust: 0 }] })).toThrow(/at least two points/);
    const unordered = [...base.thrustCurve];
    unordered[2] = { ...unordered[2], time: unordered[1].time };
    expect(() => validateMotorSpec({ ...base, thrustCurve: unordered })).toThrow(/strictly increase/);
    const negThrust = base.thrustCurve.map((p, i) => (i === 3 ? { ...p, thrust: -1 } : p));
    expect(() => validateMotorSpec({ ...base, thrustCurve: negThrust })).toThrow(/nonnegative thrust/);
    const hotEnd = base.thrustCurve.map((p, i, arr) => (i === arr.length - 1 ? { ...p, thrust: 0.5 } : p));
    expect(() => validateMotorSpec({ ...base, thrustCurve: hotEnd })).toThrow(/endpoints must be zero/);
    expect(() => validateMotorSpec({ ...base, totalMass: base.dryMass })).toThrow(/identity violated/);
    expect(() => validateMotorSpec({ ...base, burnTime: -2 })).toThrow(/burnTime/);
    // Degenerate curves throw at use, never degrade to a jump:
    // an empty curve with a positive nameplate still cannot deplete.
    const empty = { ...base, thrustCurve: [] as { time: number; thrust: number }[] };
    expect(() => getMotorImpulseTotal(empty)).toThrow(/no finite positive impulse/);
    expect(() => getMotorMassAt(empty, 0.5)).toThrow(/no finite positive impulse/);
  });
});

describe('motor query and peak hardening (Round-18 audit §4.2)', () => {
  it('rejects nonfinite query times instead of reading zero', () => {
    const m = CERTIFIED_MOTORS.estes_c6;
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => getMotorThrustAt(m, bad)).toThrow(/time must be finite/);
      expect(() => getMotorMassFlowAt(m, bad)).toThrow(/time must be finite/);
      expect(() => getMotorMassAt(m, bad)).toThrow(/time must be finite/);
      expect(() => integrateThrustCurve(m, bad)).toThrow(/time must be finite/);
    }
  });

  it('rejects positive-infinite delivered impulse', () => {
    const base = CERTIFIED_MOTORS.estes_c6;
    const overflowing = {
      ...base,
      id: 'test-overflow',
      burnTime: 10,
      totalImpulse: 1e308,
      avgThrust: 1e307,
      maxThrust: 1e308,
      thrustCurve: [
        { time: 0, thrust: 0 },
        { time: 5, thrust: 1e308 },
        { time: 10, thrust: 0 },
      ],
    };
    expect(() => validateMotorSpec(overflowing)).toThrow(/no finite positive impulse/);
  });

  it('locks tabulated peak to declared maxThrust on bundled records', () => {
    for (const m of MOTORS) {
      const peak = Math.max(...m.thrustCurve.map((p) => p.thrust));
      expect(peak).toBe(m.maxThrust);
    }
  });
});
