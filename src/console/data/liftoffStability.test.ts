import { describe, expect, it } from 'vitest';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import type { RocketVehicle } from '../../core/types';
import { stabilityAnalysisFor } from '../testFixtures';
import { stabilityBreakdown } from './adapter';
import { liftoffStability, marginText, motorAftStation, stabilityAdvice, stabilityGate, withLiftoffStability } from './liftoffStability';

const vehicle = PRESET_NASA_STUDENT_LAUNCH;
const motor = CERTIFIED_MOTORS.aerotech_k550w!;
const analysis = stabilityAnalysisFor(vehicle, { cp: 2.6, cg: 1.4, totalMass: 12, referenceDiameter: 0.152, staticMarginCalibers: (2.6 - 1.4) / 0.152 });
const stab = stabilityBreakdown(analysis, vehicle);
const mountEnd = analysis.contributions.find((c) => c.id === 'nsl-bt2')!.axialEnd;

describe('stability at liftoff', () => {
  it('places the motor with its aft end at the mount aft end, as the flight engine does', () => {
    expect(motorAftStation(vehicle, stab)).toEqual({ station: mountEnd });
    const lift = liftoffStability(stab, vehicle, motor);
    const cg = (12 * 1.4 + motor.totalMass * (mountEnd - motor.length / 2)) / (12 + motor.totalMass);
    expect(lift.loadedCg.value).toBeCloseTo(cg, 12);
    expect(lift.margin.value).toBeCloseTo((2.6 - cg) / 0.152, 12);
    // The loaded motor moves the CG aft, so the liftoff margin is below the airframe-only one.
    expect(lift.margin.value).toBeLessThan(lift.geometry.value);
    expect(lift.geometry).toBe(stab.margin);
    expect(lift.margin.reason).toMatch(/loaded .*K550W/);
  });

  it('seats the motor at the tail when no mount is flagged', () => {
    const unflagged: RocketVehicle = { ...vehicle, components: vehicle.components.map((c) => (c.type === 'bodytube' ? { ...c, isMotorMount: false } : c)) };
    expect(motorAftStation(unflagged, stab)).toEqual({ station: stab.length });
  });

  it('is unknown, with the reason, when an input is missing, and keeps the airframe-only margin', () => {
    const noMotor = liftoffStability(stab, vehicle, null);
    expect(noMotor.margin.confidence).toBe('unknown');
    expect(noMotor.margin.reason).toMatch(/No motor is selected/);
    expect(Number.isFinite(noMotor.geometry.value)).toBe(true);

    const twoMounts: RocketVehicle = { ...vehicle, components: vehicle.components.map((c) => (c.type === 'bodytube' ? { ...c, isMotorMount: true } : c)) };
    expect(liftoffStability(stab, twoMounts, motor).margin.reason).toMatch(/marked as the motor mount/);

    const noCp = stabilityBreakdown(stabilityAnalysisFor(vehicle, { cpUnavailable: 'no CP here' }), vehicle);
    const lift = liftoffStability(noCp, vehicle, motor);
    expect(Number.isNaN(lift.margin.value)).toBe(true);
    expect(lift.margin.reason).toContain('no CP here');
  });

  it('gives advice that points the same way as the result', () => {
    expect(stabilityAdvice(0.4)).toMatch(/nose weight/);
    expect(stabilityAdvice(4.2)).toMatch(/smaller fins/);
    expect(stabilityAdvice(2)).toBeUndefined();
    expect(stabilityAdvice(Number.NaN)).toBeUndefined();
  });

  it('passes in the band, fails below it, cautions above it, and never depends on a run', () => {
    const at = (value: number) => stabilityGate({ ...liftoffStability(stab, vehicle, motor), margin: { value, unit: 'cal', confidence: 'modeled' } });
    expect(at(2)).toMatchObject({ id: 'static_margin', status: 'pass', label: 'Stability at liftoff', threshold: '≥ 1 cal (1–3 ideal)' });
    expect(at(2).advice).toBeUndefined();
    expect(at(0.5)).toMatchObject({ status: 'fail' });
    expect(at(0.5).advice).toMatch(/nose weight/);
    // Too much stability is safe to fly: a caution with advice, never a failure.
    expect(at(3.4)).toMatchObject({ status: 'caution' });
    expect(at(3.4).reason).toMatch(/above 3 cal: more stability than needed\. Safe to fly/);
    expect(at(3.4).advice).toMatch(/smaller fins/);
    expect(at(2).reason).toMatch(/Airframe only, without the motor/);
    const unknown = stabilityGate(liftoffStability(stab, vehicle, null));
    expect(unknown).toMatchObject({ status: 'unknown', fixStage: 'motor' });
    expect(unknown.reason).toMatch(/^Not checked: No motor is selected/);
  });

  it('shows extra precision only when a margin rounds onto a band edge', () => {
    expect(marginText(2.345)).toBe('2.35 cal');
    expect(marginText(0.996)).toBe('0.996 cal');
    expect(marginText(3.004)).toBe('3.004 cal');
  });

  it('gives Copilot the same liftoff margin Verify judges', async () => {
    const engine = withLiftoffStability({ stability: async (_v: RocketVehicle) => analysis }, motor, stabilityBreakdown);
    const seen = await engine.stability(vehicle);
    const lift = liftoffStability(stab, vehicle, motor);
    expect(seen.staticMarginCalibers).toBeCloseTo(lift.margin.value, 12);
    expect(seen.cg).toBeCloseTo(lift.loadedCg.value, 12);
    const none = await withLiftoffStability({ stability: async (_v: RocketVehicle) => analysis }, null, stabilityBreakdown).stability(vehicle);
    expect(Number.isNaN(none.staticMarginCalibers)).toBe(true);
    expect(none.cpUnavailable).toMatch(/No motor is selected/);
  });
});
