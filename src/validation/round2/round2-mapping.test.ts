import { describe, expect, it } from 'vitest';
import { aggregateVehicleMass } from '../../core/mass';
import { MOTORS, astraeaThrust, grainMass, notebookThrust, trapezoid, motorSpec } from './motors';
import { NOMINAL, ROUND2_VEHICLES, buildVehicle, geometry, vehicleMotor } from './vehicles';

describe('round 2 mapping: notebook values reproduce exactly', () => {
  for (const v of ROUND2_VEHICLES) {
    it(`${v.id}: airframe mass and centre of gravity equal the notebook's`, () => {
      const rollup = aggregateVehicleMass(buildVehicle(v, NOMINAL, 'm'));
      expect(rollup.totalMass).toBeCloseTo(v.dryMass, 9);
      // notebook CG is a rocket coordinate; the rollup measures from the nose tip
      expect(rollup.cg).toBeCloseTo(v.nose.tip - v.cgCoord, 9);
    });

    it(`${v.id}: outer mold line matches the notebook`, () => {
      const g = geometry(v);
      const rollup = aggregateVehicleMass(buildVehicle(v, NOMINAL, 'm'));
      const fins = rollup.components.find((c) => c.id === 'fins')!;
      expect(rollup.totalLength).toBeCloseTo(g.aftEnd, 9);
      expect(rollup.maxDiameter).toBeCloseTo(2 * v.radius, 12);
      expect(fins.axialStart).toBeCloseTo(v.nose.tip - v.fins.le, 9);
      expect(fins.axialStart + v.fins.root).toBeLessThanOrEqual(g.aftEnd + 1e-9);
      expect(v.fins.sweepLength).toBeGreaterThanOrEqual(0);
      if (v.tail) {
        const tail = rollup.components.find((c) => c.id === 'tail')!;
        expect(tail.axialStart).toBeCloseTo(v.nose.tip - v.tail.top, 9);
      }
    });

    it(`${v.id}: the motor sits where the notebook puts its centre of mass`, () => {
      const g = geometry(v);
      const m = MOTORS[v.motor];
      const spec = vehicleMotor(v, 'm');
      // loaded centre of mass in the rocket frame
      const loaded = (m.propellantMass * (v.motorPosition + v.propellantCg) + m.dryMass * (v.motorPosition + v.dryCg)) /
        (m.propellantMass + m.dryMass);
      expect(g.tubeEnd - spec.length / 2).toBeCloseTo(v.nose.tip - loaded, 9);
      // the engine's mount checks: bore fit and at least 50 % retention
      const tube = g.tubeEnd - g.tubeStart;
      expect(spec.diameter).toBeLessThanOrEqual(2 * v.radius - 0.004);
      expect(Math.min(spec.length, tube)).toBeGreaterThanOrEqual(0.5 * spec.length);
      expect(spec.totalMass).toBeCloseTo(m.propellantMass + m.dryMass, 12);
    });
  }
});

describe('round 2 motors', () => {
  it('computes propellant mass from grains as RocketPy does', () => {
    // Andromeda: one grain, certified propellant mass of the same motor is 4.349 kg
    expect(MOTORS.andromeda.propellantMass).toBeCloseTo(4.3463, 3);
    expect(grainMass(1, 0.02, 0.01, 0.5, 1000)).toBeCloseTo(Math.PI * (0.0004 - 0.0001) * 0.5 * 1000, 12);
  });

  it('keeps the file impulse (clip/zero anchors invent none) except where reshaped', () => {
    for (const [key, m] of Object.entries(MOTORS)) {
      const spec = motorSpec(key, m, 0.5);
      const expected = trapezoid(notebookThrust(m.raw, m.processing));
      if (key === 'juno3') {
        // reshape_thrust_curve = (5.8 s, 8800 N s), then negatives clipped
        expect(spec.totalImpulse).toBeGreaterThan(8800);
        expect(spec.totalImpulse).toBeLessThan(8800 * 1.005);
        expect(spec.burnTime).toBeCloseTo(5.8, 6);
      } else {
        expect(spec.totalImpulse / expected).toBeGreaterThan(0.999);
        expect(spec.totalImpulse / expected).toBeLessThan(1.001);
      }
      // engine contract
      expect(spec.thrustCurve[0]).toEqual({ time: 0, thrust: 0 });
      expect(spec.thrustCurve[spec.thrustCurve.length - 1].thrust).toBe(0);
      expect(spec.thrustCurve[spec.thrustCurve.length - 1].time).toBe(spec.burnTime);
      for (let i = 1; i < spec.thrustCurve.length; i++) {
        expect(spec.thrustCurve[i].time).toBeGreaterThan(spec.thrustCurve[i - 1].time);
        expect(spec.thrustCurve[i].thrust).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('clips at the notebook burn time with an interpolated end sample', () => {
    const clipped = notebookThrust([[0, 0], [1, 100], [2, 0]], { burnTime: 1.5 });
    expect(clipped).toEqual([[0, 0], [1, 100], [1.5, 50]]);
    const anchored = astraeaThrust(clipped);
    expect(anchored[anchored.length - 1].thrust).toBe(0);
    expect(anchored[anchored.length - 2]).toEqual({ time: 1.5, thrust: 50 });
  });
});
