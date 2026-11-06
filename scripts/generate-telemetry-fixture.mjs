// Fixture generator (not a test): writes the native parity fixtures
// crates/astraea-engine/tests/fixtures/{telemetry-parity,drag-cd-scale-parity}.json
// from the TS oracle `simulate6DofFlight`. Run with `npm run fixtures:telemetry`
// (= vitest run --config scripts/telemetry-fixtures.vitest.config.mjs).
// Regenerating must be byte-identical for the same TS sources.
import { readFileSync, writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { simulate6DofFlight } from '../src/sim/sixDofSimulator';
import { PRESET_ESTES_ALPHA } from '../src/state/presets';
import { CERTIFIED_MOTORS } from '../src/propulsion/motorDatabase';

const FIXTURES = 'crates/astraea-engine/tests/fixtures';
const WIRE = `${FIXTURES}/drag-cd-scale-parity.json`;

/**
 * Flat numeric field order of a fixture point row. Mirrors
 * `SixDofTelemetryPoint` (`src/sim/sixDofSimulator.ts:41-65`); the fixture
 * records this list so the Rust test can map rows back to fields.
 */
const FIELDS = [
  'time',
  'position.x',
  'position.y',
  'position.z',
  'velocity.x',
  'velocity.y',
  'velocity.z',
  'speed',
  'mach',
  'acceleration',
  'angularVelocity.p',
  'angularVelocity.q',
  'angularVelocity.r',
  'angleOfAttackDeg',
  'q.w',
  'q.x',
  'q.y',
  'q.z',
  'altitude',
  'pitchDeg',
  'rollDeg',
  'yawDeg',
  'drag',
  'thrust',
  'mass',
  'dynamicPressure',
];

function flat(p) {
  return [
    p.time,
    p.position.x,
    p.position.y,
    p.position.z,
    p.velocity.x,
    p.velocity.y,
    p.velocity.z,
    p.speed,
    p.mach,
    p.acceleration,
    p.angularVelocity.p,
    p.angularVelocity.q,
    p.angularVelocity.r,
    p.angleOfAttackDeg,
    p.q.w,
    p.q.x,
    p.q.y,
    p.q.z,
    p.altitude,
    p.pitchDeg,
    p.rollDeg,
    p.yawDeg,
    p.drag,
    p.thrust,
    p.mass,
    p.dynamicPressure,
  ];
}

it('writes the telemetry parity fixture', () => {
  const wire = JSON.parse(readFileSync(WIRE, 'utf-8'));
  const coreMotor = CERTIFIED_MOTORS.estes_c6;

  const cases = [];
  for (const windSpeedSurface of [0, 3]) {
    const options = {
      railLength: 1,
      railElevationDeg: 90,
      railAzimuthDeg: 0,
      windSpeedSurface,
      windAzimuthDeg: 90,
      mainDeployAltitudeAGL: 250,
      launchAltitudeASL: 1143,
    };
    const result = simulate6DofFlight(PRESET_ESTES_ALPHA, coreMotor, options);
    cases.push({
      case: `astraea/wind${windSpeedSurface}`,
      options,
      tsApogeeAltitude: result.apogeeAltitude,
      tsFlightDuration: result.flightDuration,
      tsTerminated: result.terminated,
      tsPointCount: result.telemetry.length,
      tsEventTimes: result.events.map((e) => e.time),
      points: result.telemetry.map(flat),
    });
    console.log(
      `astraea/wind${windSpeedSurface}: ${result.telemetry.length} points, apogee ${result.apogeeAltitude}, duration ${result.flightDuration}, terminated ${result.terminated}`,
    );
  }

  for (const c of cases) {
    if (c.points.length !== c.tsPointCount) throw new Error(`point count mismatch in ${c.case}`);
    for (const row of c.points) {
      if (row.length !== FIELDS.length) throw new Error(`row width mismatch in ${c.case}`);
      if (row.some((v) => !Number.isFinite(v))) throw new Error(`non-finite value in ${c.case}`);
    }
  }

  const doc = {
    generatedBy:
      'npm run fixtures:telemetry (vitest + vite-node over the TS sources, node v24.21.0)',
    generatedOn: '2026-10-16',
    source: 'simulate6DofFlight(PRESET_ESTES_ALPHA, CERTIFIED_MOTORS.estes_c6, options)',
    fields: FIELDS,
    vehicle: wire.vehicle,
    motor: wire.motor,
    cases,
  };
  writeFileSync(`${FIXTURES}/telemetry-parity.json`, JSON.stringify(doc), 'utf-8');

  // The drag-scale fixture keeps its exact bridge payload (vehicle, motor,
  // per-case options); only the TS oracle results are recomputed.
  for (const row of wire.cases) {
    const result = simulate6DofFlight(PRESET_ESTES_ALPHA, coreMotor, row.options);
    row.tsApogeeAltitude = result.apogeeAltitude;
    row.tsFlightDuration = result.flightDuration;
    row.tsLandingVelocity = result.landingVelocity;
    row.tsLandingDistance = result.landingDistance;
    console.log(`${row.case}: apogee ${result.apogeeAltitude}, duration ${result.flightDuration}`);
  }
  writeFileSync(WIRE, `${JSON.stringify(wire, null, 1)}\n`, 'utf-8');
});
