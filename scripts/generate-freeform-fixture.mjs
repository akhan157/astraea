// Fixture generator (not a test): writes the freeform-fin parity fixture
// crates/astraea-engine/tests/fixtures/freeform-fin-parity.json from the TS
// oracles (mass rollup, Barrowman stability, aero curves, 6-DOF flight).
// Run with `pnpm fixtures:freeform`. Rust asserts that the native engine
// reproduces every number for a trapezoid, the same trapezoid written as a
// freeform polygon, and genuinely non-trapezoidal planforms.
import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { aggregateVehicleMass } from '../src/core/mass';
import { computeRocketStability } from '../src/aero/barrowman';
import { computeAerodynamicCurves } from '../src/aero/transonicAero';
import { trapezoidPlanformPoints } from '../src/aero/finPlanform';
import { simulate6DofFlight } from '../src/sim/sixDofSimulator';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH } from '../src/state/presets';
import { CERTIFIED_MOTORS } from '../src/propulsion/motorDatabase';

const FIXTURES = 'crates/astraea-engine/tests/fixtures';

const ALPHA_DELTA = [
  { x: 0, y: 0 },
  { x: 0.02, y: 0.012 },
  { x: 0.03, y: 0.012 },
  { x: 0.045, y: 0.05 },
  { x: 0.075, y: 0.05 },
  { x: 0.074, y: 0.03 },
  { x: 0.07, y: 0 },
];
const NSL_DELTA = [
  { x: 0, y: 0 },
  { x: 0.08, y: 0.07 },
  { x: 0.12, y: 0.07 },
  { x: 0.2, y: 0.18 },
  { x: 0.26, y: 0.18 },
  { x: 0.27, y: 0.1 },
  { x: 0.32, y: 0 },
];

function withFreeform(vehicle, points) {
  return {
    ...vehicle,
    components: vehicle.components.map((c) =>
      c.type === 'trapezoidfinset'
        ? {
            id: c.id,
            name: c.name,
            type: 'freeformfinset',
            finCount: c.finCount,
            points,
            thickness: c.thickness,
            crossSection: c.crossSection,
            axialOffset: c.axialOffset,
            materialId: c.materialId,
          }
        : c,
    ),
  };
}

function trapPoints(vehicle) {
  const f = vehicle.components.find((c) => c.type === 'trapezoidfinset');
  return trapezoidPlanformPoints(f.rootChord, f.tipChord, f.span, f.sweepLength);
}

function record(name, vehicle, motorKey, options) {
  const motor = CERTIFIED_MOTORS[motorKey];
  const mass = aggregateVehicleMass(vehicle);
  const stab = computeRocketStability(vehicle);
  const curves = computeAerodynamicCurves(vehicle, true, 41);
  const coast = computeAerodynamicCurves(vehicle, false, 41);
  const flight = simulate6DofFlight(vehicle, motor, options);
  console.log(`${name}: apogee ${flight.apogeeAltitude}, max Mach ${Math.max(...flight.telemetry.map((p) => p.mach))}, margin ${stab.staticMarginCalibers}`);
  return {
    case: name,
    vehicle,
    motorKey,
    options,
    mass: {
      totalMass: mass.totalMass,
      cg: mass.cg,
      totalLength: mass.totalLength,
      components: mass.components.map((c) => ({ id: c.id, mass: c.mass, localCG: c.localCG, globalCG: c.globalCG, axialStart: c.axialStart, axialEnd: c.axialEnd })),
    },
    stability: {
      cp: stab.cp,
      cg: stab.cg,
      totalCNa: stab.totalCNa,
      staticMarginCalibers: stab.staticMarginCalibers,
      contributions: stab.contributions.map((c) => ({ id: c.id, type: c.type, cna: c.cna ?? null, cp: c.cp ?? null })),
    },
    curveFields: ['mach', 'totalCd', 'frictionCd', 'waveCd', 'baseCd', 'cp', 'staticMarginCalibers'],
    curves: curves.dragCurves.map((d) => [d.mach, d.totalCd, d.frictionCd, d.waveCd, d.baseCd, d.cp, d.staticMarginCalibers]),
    coastCurves: coast.dragCurves.map((d) => [d.mach, d.totalCd, d.frictionCd, d.waveCd, d.baseCd, d.cp, d.staticMarginCalibers]),
    flight: {
      apogeeAltitude: flight.apogeeAltitude,
      flightDuration: flight.flightDuration,
      landingDistance: flight.landingDistance,
      landingVelocity: flight.landingVelocity,
      pointCount: flight.telemetry.length,
      eventTimes: flight.events.map((e) => e.time),
      sampleFields: ['time', 'altitude', 'speed', 'mach', 'drag', 'mass'],
      samples: flight.telemetry.filter((_, i) => i % 7 === 0).map((p) => [p.time, p.altitude, p.speed, p.mach, p.drag, p.mass]),
    },
  };
}

it('writes the freeform-fin parity fixture', () => {
  const alphaOpts = { railLength: 1, railElevationDeg: 85, railAzimuthDeg: 0, windSpeedSurface: 3, windAzimuthDeg: 90, mainDeployAltitudeAGL: 150, launchAltitudeASL: 0 };
  const nslOpts = { railLength: 3, railElevationDeg: 88, railAzimuthDeg: 0, windSpeedSurface: 2, windAzimuthDeg: 90, mainDeployAltitudeAGL: 300, launchAltitudeASL: 0 };

  const cases = [
    record('alpha/trapezoid', PRESET_ESTES_ALPHA, 'estes_c6', alphaOpts),
    record('alpha/freeform-trapezoid', withFreeform(PRESET_ESTES_ALPHA, trapPoints(PRESET_ESTES_ALPHA)), 'estes_c6', alphaOpts),
    record('alpha/freeform-clipped-delta', withFreeform(PRESET_ESTES_ALPHA, ALPHA_DELTA), 'estes_c6', alphaOpts),
    record('nsl/trapezoid', PRESET_NASA_STUDENT_LAUNCH, 'cesaroni_m1820', nslOpts),
    record('nsl/freeform-trapezoid', withFreeform(PRESET_NASA_STUDENT_LAUNCH, trapPoints(PRESET_NASA_STUDENT_LAUNCH)), 'cesaroni_m1820', nslOpts),
    record('nsl/freeform-clipped-delta', withFreeform(PRESET_NASA_STUDENT_LAUNCH, NSL_DELTA), 'cesaroni_m1820', nslOpts),
  ];

  const motors = {};
  for (const c of cases) motors[c.motorKey] = CERTIFIED_MOTORS[c.motorKey];
  writeFileSync(
    `${FIXTURES}/freeform-fin-parity.json`,
    `${JSON.stringify({
      generatedBy: 'pnpm fixtures:freeform (vitest + vite-node over the TS sources)',
      source: 'aggregateVehicleMass, computeRocketStability, computeAerodynamicCurves, simulate6DofFlight',
      motors,
      cases,
    })}\n`,
    'utf-8',
  );
});
