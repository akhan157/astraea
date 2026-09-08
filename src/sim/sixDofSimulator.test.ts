import { describe, it, expect } from 'vitest';
import { simulate6DofFlight } from './sixDofSimulator';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

describe('6-DOF (Six Degrees of Freedom) Flight Simulator', () => {
  it('simulates 3D trajectory with launch rail elevation and wind drift', () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, motor, {
      railLength: 1.0,
      railElevationDeg: 85.0, // 5 degrees off vertical
      railAzimuthDeg: 90.0,   // Pointing East
      windSpeedSurface: 4.0,  // 4 m/s crosswind
      windAzimuthDeg: 270.0,  // Wind blowing from West
    });

    // Altitude and apogee
    expect(res.apogeeAltitude).toBeGreaterThan(50);
    expect(res.apogeeTime).toBeGreaterThan(2.5);
    expect(res.isRailExitSafe).toBe(true);

    // 3D coordinates: Rocket should drift due to rail angle and wind
    expect(Math.abs(res.landingPosition.x) + Math.abs(res.landingPosition.z)).toBeGreaterThan(5);
    expect(res.landingDistance).toBeGreaterThan(5);

    // Telemetry contains 3D position, velocity, and Euler angles
    expect(res.telemetry.length).toBeGreaterThan(20);
    const sample = res.telemetry[10];
    expect(sample.position).toBeDefined();
    expect(sample.angularVelocity).toBeDefined();
    expect(Number.isFinite(sample.pitchDeg)).toBe(true);
    expect(Number.isFinite(sample.rollDeg)).toBe(true);
  });

  it('demonstrates aerodynamic weathercocking into crosswinds', () => {
    const motor = CERTIFIED_MOTORS.estes_c6;

    // Launch with East crosswind (90 deg)
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, motor, {
      railLength: 1.2,
      railElevationDeg: 90.0, // Vertical rail
      windSpeedSurface: 6.0,  // Moderate crosswind
      windAzimuthDeg: 90.0,   // Wind from East
    });

    // Weathercocking angle off rail should be non-zero
    expect(res.weathercockAngleDeg).toBeGreaterThan(2.0);
    expect(res.events.some((e) => e.name.includes('Rail Departure'))).toBe(true);
  });

  it('spins up roll rate with non-zero fin cant angle', () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, motor, {
      railLength: 1.0,
      finCantAngleDeg: 1.0, // 1 degree fin cant for spin stabilization
    });
    // During ascent, roll rate p should spin up significantly
    const maxRollRate = Math.max(...res.telemetry.map((t) => Math.abs(t.angularVelocity.p)));
    expect(maxRollRate).toBeGreaterThan(1.0); // Rad/s
  });
});
