import { describe, it, expect } from 'vitest';
import { getAtmosphereAt, simulateFlight } from './flightSimulator';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

describe('6-DOF Numerical Trajectory Flight Simulator', () => {
  describe('ISA 1976 Standard Atmosphere', () => {
    it('returns exact sea level atmospheric constants', () => {
      const seaLevel = getAtmosphereAt(0);
      expect(seaLevel.temperature).toBeCloseTo(288.15, 1);
      expect(seaLevel.pressure).toBeCloseTo(101325.0, 0);
      expect(seaLevel.density).toBeCloseTo(1.225, 2);
      expect(seaLevel.speedOfSound).toBeCloseTo(340.29, 0);
    });

    it('models colder temperature and lower pressure at 5000m altitude', () => {
      const highAlt = getAtmosphereAt(5000);
      expect(highAlt.temperature).toBeLessThan(288.15);
      expect(highAlt.pressure).toBeLessThan(101325.0);
      expect(highAlt.density).toBeLessThan(1.225);
    });
  });

  describe('Full Trajectory Simulation', () => {
    it('simulates Estes Alpha III flight on Estes C6 motor', () => {
      const motor = CERTIFIED_MOTORS.estes_c6;
      const result = simulateFlight(PRESET_ESTES_ALPHA, motor, { railLength: 1.0 });

      expect(result.apogeeAltitude).toBeGreaterThan(80); // Realistic Estes C6 apogee
      expect(result.apogeeAltitude).toBeLessThan(400);
      expect(result.apogeeTime).toBeGreaterThan(3.0);
      expect(result.maxVelocity).toBeGreaterThan(30);
      expect(result.isRailExitSafe).toBe(true);
      expect(result.landingVelocity).toBeLessThan(15);
      expect(result.events.length).toBeGreaterThanOrEqual(4); // Liftoff, Burnout, Apogee, Touchdown
      expect(result.telemetry.length).toBeGreaterThan(20);
    });

    it('simulates NASA Student Launch target on Aerotech K550W motor', () => {
      const motor = CERTIFIED_MOTORS.aerotech_k550w;
      const result = simulateFlight(PRESET_NASA_STUDENT_LAUNCH, motor, {
        railLength: 3.6, // 12-foot competition rail
        mainDeployAltitudeAGL: 200,
      });

      expect(result.apogeeAltitude).toBeGreaterThan(450);
      expect(result.maxVelocity).toBeGreaterThan(80);
      expect(result.railExitVelocity).toBeGreaterThan(18); // Safe competition rail clearance
      expect(result.events.some((e) => e.name.includes('Apogee'))).toBe(true);
    });
  });
});
