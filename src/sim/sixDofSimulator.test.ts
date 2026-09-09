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
    expect(res.terminationReason).toBe('touchdown');
    expect(res.touchdownNominal).toBe(true);
    const touchdown = res.events.find((e) => e.name === 'Ground Touchdown');
    expect(touchdown).toBeDefined();
    // Touchdown event time IS the flight duration: no macro-endpoint stand-in.
    expect(res.flightDuration).toBe(touchdown!.time);
    // Canonical terminal telemetry is FULL PRECISION (audit §6.4): the final
    // point coincides exactly with the touchdown root state, mass, and time.
    const last = res.telemetry[res.telemetry.length - 1];
    expect(last.altitude).toBe(0);
    expect(last.time).toBe(res.flightDuration);
    expect(last.position.x).toBe(res.landingPosition.x);
    expect(last.position.y).toBe(res.landingPosition.y);
    expect(last.position.z).toBe(0);
    expect(last.mass).toBe(res.landingMass);
    const lastSpeed = Math.sqrt(last.velocity.x * last.velocity.x + last.velocity.y * last.velocity.y + last.velocity.z * last.velocity.z);
    expect(lastSpeed).toBe(res.landingVelocity);
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

describe('6-DOF production adversarial sweeps (Round-17 audit §7/§10)', () => {
  // Synthetic test motors satisfy validateMotorSpec (ordered zero-ended
  // curves, wet/dry identity, fitting bore) and fly the production path.
  const testMotor = (
    id: string,
    burnTime: number,
    curve: { time: number; thrust: number }[],
    prop: number
  ) => ({
    id,
    designation: `TEST ${id}`,
    manufacturer: 'Test',
    impulseClass: 'G',
    diameter: 0.018,
    length: 0.07,
    totalImpulse: 3.0,
    avgThrust: 5.0,
    maxThrust: 12.0,
    burnTime,
    propellantMass: prop,
    totalMass: 0.015 + prop,
    dryMass: 0.015,
    thrustCurve: curve,
  });

  it('activates pre-burnout apogee at burnout from the stashed pending root', () => {
    // Round-17 audit §7.3: the velocity zero-crossing (t ≈ 3.9 s) precedes
    // burnout (6 s) by whole event-free brackets. Production must carry the
    // pending root, activate apogee AT burnout, and report the physical peak
    // — never the activation altitude — as apogee.
    const weak = testMotor('weak-sustain', 6.0, [
      { time: 0.0, thrust: 0.0 },
      { time: 0.1, thrust: 9.0 },
      { time: 0.25, thrust: 9.0 },
      { time: 0.4, thrust: 0.2 },
      { time: 6.0, thrust: 0.0 },
    ], 0.02);
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, weak, {
      railLength: 1.0,
      railElevationDeg: 85.0,
    });
    expect(res.terminated).toBe(true);
    expect(res.touchdownNominal).toBe(true);
    // Physical peak precedes burnout; activation coincides with burnout.
    expect(res.apogeeTime).toBeLessThan(weak.burnTime);
    const burnout = res.events.find((e) => e.name === 'Motor Burnout');
    const apogee = res.events.find((e) => e.name === 'Apogee & Drogue Deployment');
    expect(burnout).toBeDefined();
    expect(apogee).toBeDefined();
    expect(apogee!.time).toBe(burnout!.time);
    // Activation altitude is not assigned to the physical maximum.
    expect(res.apogeeAltitude).toBeLessThan(200);
    expect(res.validity).toBe('PASS');
  });

  it('terminates abnormally on rail-return flameout without penetration', () => {
    // Round-17 audit §6.5/§7.4: thrust cut just after liftoff drops the
    // vehicle back onto the stop. No rail exit, no apogee sequencing — ground
    // contact terminates abnormally with UNKNOWN validity and committed
    // states never penetrating the base (unit-exactness is covered by the
    // clamp policy test; telemetry is decimetre-rounded display data).
    const dead = testMotor('flameout', 3.0, [
      { time: 0.0, thrust: 0.0 },
      { time: 0.03, thrust: 6.0 },
      { time: 0.06, thrust: 0.0 },
      { time: 3.0, thrust: 0.0 },
    ], 0.005);
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, dead, {
      railLength: 2.0,
      railElevationDeg: 85.0,
      timeStep: 0.05,
    });
    expect(res.terminated).toBe(true);
    expect(res.terminationReason).toBe('touchdown');
    expect(res.touchdownNominal).toBe(false);
    expect(res.validity).toBe('UNKNOWN');
    expect(res.railExitVelocity).toBe(0);
    expect(res.events.some((e) => e.name === 'Launch Rail Departure')).toBe(false);
    expect(res.events.some((e) => e.name === 'Ground Touchdown')).toBe(true);
    expect(res.isRailExitSafe).toBe(false);
    expect(res.isLandingSafe).toBe(false);
    const elRad = (85.0 * Math.PI) / 180;
    const rail = { x: 0, y: Math.cos(elRad), z: Math.sin(elRad) };
    for (const p of res.telemetry) {
      for (const v of [p.position.x, p.position.y, p.position.z, p.velocity.x, p.velocity.y, p.velocity.z]) {
        expect(Number.isFinite(v)).toBe(true);
      }
      const s = p.position.x * rail.x + p.position.y * rail.y + p.position.z * rail.z;
      expect(s).toBeGreaterThan(-0.06);
    }
  });

  it('serves same-bracket burnout and rail exit in refined order', () => {
    // Round-17 audit §7.6: burnout (0.2 s) and rail exit land in one macro
    // bracket. Both transitions must apply — the old chord-first loop could
    // skip a reselected event — and the flight must complete nominally.
    const fast = testMotor('fast-burn', 0.2, [
      { time: 0.0, thrust: 0.0 },
      { time: 0.05, thrust: 12.0 },
      { time: 0.15, thrust: 12.0 },
      { time: 0.2, thrust: 0.0 },
    ], 0.01);
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, fast, {
      railLength: 2.4,
      railElevationDeg: 85.0,
    });
    const rail = res.events.find((e) => e.name === 'Launch Rail Departure');
    const burn = res.events.find((e) => e.name === 'Motor Burnout');
    expect(rail).toBeDefined();
    expect(burn).toBeDefined();
    expect(Math.abs(rail!.time - burn!.time)).toBeLessThan(0.011);
    expect(rail!.time).toBeLessThanOrEqual(burn!.time);
    expect(res.terminated).toBe(true);
    expect(res.touchdownNominal).toBe(true);
  });

  it('deploys main at apogee when the peak stays below the threshold', () => {
    // Round-17 audit §7.6: a sub-threshold peak ties MAIN to APOGEE at the
    // committed root. Main must not fire before apogee, and the flight must
    // complete under the canopy.
    const res = simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, {
      railLength: 1.0,
      railElevationDeg: 85.0,
      mainDeployAltitudeAGL: 500.0,
    });
    const apogee = res.events.find((e) => e.name === 'Apogee & Drogue Deployment');
    const main = res.events.find((e) => e.name === 'Main Parachute Deployment');
    expect(apogee).toBeDefined();
    expect(main).toBeDefined();
    expect(main!.time).toBeGreaterThanOrEqual(apogee!.time);
    expect(main!.time - apogee!.time).toBeLessThan(0.05);
    expect(res.terminated).toBe(true);
  });
});
