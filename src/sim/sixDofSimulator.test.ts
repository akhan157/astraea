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

describe('6-DOF production event/validity contracts (Round-15 audit §6/§7)', () => {
  it('aligns touchdown time, final state, landing mass, telemetry, and flightDuration at the root', () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, motor, {
      railLength: 1.0,
      railElevationDeg: 85.0,
      railAzimuthDeg: 90.0,
      windSpeedSurface: 4.0,
      windAzimuthDeg: 270.0,
    });
    expect(res.terminated).toBe(true);
    const touchdown = res.events.find((e) => e.name === 'Ground Touchdown');
    expect(touchdown).toBeDefined();
    // Touchdown event time IS the flight duration: no macro-endpoint stand-in.
    expect(res.flightDuration).toBe(touchdown!.time);
    // Landing mass is the retained mass at the root (post-burnout: dry motor).
    expect(res.landingMass).toBeCloseTo(
      res.telemetry[res.telemetry.length - 1].mass, 3
    );
    // Final telemetry point sits at the root: ground altitude, root time.
    const last = res.telemetry[res.telemetry.length - 1];
    expect(last.altitude).toBe(0);
    expect(Math.abs(last.time - res.flightDuration)).toBeLessThan(5e-4);
    // Event times strictly increase along the flight.
    for (let i = 1; i < res.events.length; i++) {
      expect(res.events[i].time).toBeGreaterThan(res.events[i - 1].time);
    }
  });

  it('propagates active-model validity into final validity and safety outputs', () => {
    const motor = CERTIFIED_MOTORS.estes_c6;
    // Nominal flight: free-flight incidence stays inside the envelope, so the
    // result certifies and rail safety reads SAFE.
    const nominal = simulate6DofFlight(PRESET_ESTES_ALPHA, motor, {
      railLength: 1.0,
      railElevationDeg: 85.0,
      windSpeedSurface: 2.0,
      windAzimuthDeg: 270.0,
    });
    expect(nominal.terminated).toBe(true);
    expect(nominal.validity).toBe('PASS');
    expect(nominal.isRailExitSafe).toBe(true);
    // Severe crosswind drives post-rail-exit incidence outside the slender-
    // body domain: the flight may still terminate, but validity is UNKNOWN
    // and no safety output may claim SAFE/PASS (fail-closed, audit §7).
    const severe = simulate6DofFlight(PRESET_ESTES_ALPHA, motor, {
      railLength: 1.0,
      railElevationDeg: 85.0,
      windSpeedSurface: 20.0,
      windAzimuthDeg: 270.0,
    });
    expect(severe.terminated).toBe(true);
    expect(severe.validity).toBe('UNKNOWN');
    expect(severe.isRailExitSafe).toBe(false);
    expect(severe.isLandingSafe).toBe(false);
  });
});
