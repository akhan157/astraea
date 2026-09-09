/**
 * Astraea 6-DOF / Numerical Trajectory Flight Simulator
 * Solves equations of motion from launch rail release, motor burn, transonic coast,
 * apogee ejection, dual-parachute recovery, and ground touchdown.
 * Incorporates the ISA 1976 Standard Atmosphere and high-Mach aerodynamic drag.
 */

import { RocketVehicle, ParachuteComponent } from '../core/types';
import { aggregateVehicleMass } from '../core/mass';
import { MotorSpec, getMotorThrustAt, getMotorMassAt } from '../propulsion/motorDatabase';
import { computeAerodynamicCurves } from '../aero/transonicAero';

export interface AtmosphericState {
  temperature: number;    // Kelvin
  pressure: number;       // Pascals
  density: number;        // kg/m^3
  speedOfSound: number;   // m/s
}

/**
 * ISA 1976 Standard Atmosphere model for altitude h (meters above sea level)
 */
export function getAtmosphereAt(altitude: number): AtmosphericState {
  const h = Math.max(0, altitude);
  const T0 = 288.15;      // Sea level temp (15 C)
  const P0 = 101325.0;    // Sea level pressure (Pa)
  const L = 0.0065;       // Lapse rate (K/m)
  const g0 = 9.80665;     // Gravitational acceleration (m/s^2)
  const R = 287.05287;    // Gas constant for air (J/(kg*K))
  const gamma = 1.4;      // Heat capacity ratio

  if (h <= 11000) {
    // Troposphere
    const T = T0 - L * h;
    const P = P0 * Math.pow(T / T0, g0 / (R * L));
    const density = P / (R * T);
    const speedOfSound = Math.sqrt(gamma * R * T);
    return { temperature: T, pressure: P, density, speedOfSound };
  } else {
    // Lower stratosphere (isothermal 11km - 20km)
    const T11 = 216.65;
    const P11 = 22632.1;
    const dh = h - 11000;
    const P = P11 * Math.exp((-g0 * dh) / (R * T11));
    const density = P / (R * T11);
    const speedOfSound = Math.sqrt(gamma * R * T11);
    return { temperature: T11, pressure: P, density, speedOfSound };
  }
}

export interface FlightTelemetryPoint {
  time: number;             // seconds
  altitude: number;         // meters AGL
  velocity: number;         // m/s
  acceleration: number;     // m/s^2
  mach: number;
  dynamicPressure: number;  // Pascals (0.5 * rho * v^2)
  drag: number;             // Newtons
  thrust: number;           // Newtons
  mass: number;             // kg
}

export interface FlightEvent {
  time: number;
  name: string;
  altitude: number;
  velocity: number;
  description: string;
}

export interface SimulationResult {
  apogeeAltitude: number;         // meters AGL
  apogeeTime: number;             // seconds
  maxVelocity: number;           // m/s
  maxMach: number;
  maxAccelerationG: number;       // G's
  burnoutTime: number;            // seconds
  burnoutAltitude: number;        // meters
  burnoutVelocity: number;        // m/s
  railExitVelocity: number;       // m/s (critical safety check >= 15 m/s)
  isRailExitSafe: boolean;
  landingVelocity: number;        // m/s
  landingKineticEnergy: number;   // Joules
  isLandingSafe: boolean;         // KE <= 20 J
  flightDuration: number;         // seconds
  events: FlightEvent[];
  telemetry: FlightTelemetryPoint[];
}

export interface SimulationOptions {
  railLength?: number;            // meters (default 2.4m / 8ft)
  railAngleDeg?: number;          // degrees from vertical (default 0 deg)
  launchAltitudeASL?: number;     // meters above sea level (default 0m)
  mainDeployAltitudeAGL?: number; // meters AGL for main parachute (default 250m)
  timeStep?: number;              // seconds (default 0.01s)
}

/**
 * Runs numerical flight trajectory simulation.
 *
 * NON-AUTHORITATIVE SCOPE (audit §8): this legacy path is explicitly excluded
 * from authoritative use — Euler–Cromer propagation, late event detection,
 * dry-vehicle-only impact mass, and an OR-gated landing-safety flag with no
 * model-validity or actual-touchdown gating. Retained as a benchmark oracle
 * for its own regression tests only. Authoritative simulation is
 * `simulate6DofFlight()`.
 */
export function simulateFlight(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: SimulationOptions = {}
): SimulationResult {
  const railLength = options.railLength ?? 2.4;
  const launchAltitudeASL = options.launchAltitudeASL ?? 0;
  const mainDeployAlt = options.mainDeployAltitudeAGL ?? 250.0;
  const dt = options.timeStep ?? 0.01;

  // Calculate accurate dry vehicle mass via material densities and overrides
  const massRollup = aggregateVehicleMass(vehicle);
  const vehicleDryMass = Math.max(0.01, massRollup.totalMass);

  // Parachutes
  const parachutes = vehicle.components.filter((c) => c.type === 'parachute') as ParachuteComponent[];
  const drogue = parachutes[0];
  const mainChute = parachutes.length > 1 ? parachutes[1] : parachutes[0];

  // Precompute high-Mach aerodynamic drag curve
  const aeroData = computeAerodynamicCurves(vehicle, false, 25);

  function getCdAtMach(mach: number): number {
    const curves = aeroData.dragCurves;
    if (curves.length === 0) return 0.45;
    if (mach <= curves[0].mach) return curves[0].totalCd;
    if (mach >= curves[curves.length - 1].mach) return curves[curves.length - 1].totalCd;

    for (let i = 0; i < curves.length - 1; i++) {
      if (mach >= curves[i].mach && mach <= curves[i + 1].mach) {
        const t = (mach - curves[i].mach) / (curves[i + 1].mach - curves[i].mach);
        return curves[i].totalCd + t * (curves[i + 1].totalCd - curves[i].totalCd);
      }
    }
    return 0.45;
  }

  // Ref Area (frontal cross-section)
  const aftTube = vehicle.components.find((c) => c.type === 'bodytube');
  const refDiameter = aftTube && aftTube.type === 'bodytube' ? aftTube.outerDiameter : 0.05;
  const refArea = (Math.PI / 4) * Math.pow(refDiameter, 2);

  // State variables
  let t = 0;
  let altitude = 0; // meters AGL
  let velocity = 0; // m/s (positive upward)
  let maxAltitude = 0;
  let maxVelocity = 0;
  let maxMach = 0;
  let maxAccel = 0;
  let apogeeTime = 0;

  let railExitVel = 0;
  let hasLeftRail = false;

  let burnoutAlt = 0;
  let burnoutVel = 0;
  let hasBurnedOut = false;

  let isApogeeReached = false;
  let isDrogueDeployed = false;
  let isMainDeployed = false;

  const telemetry: FlightTelemetryPoint[] = [];
  const events: FlightEvent[] = [];

  events.push({
    time: 0,
    name: 'Ignition & Liftoff',
    altitude: 0,
    velocity: 0,
    description: `Motor ${motor.designation} ignited. Total liftoff mass: ${(vehicleDryMass + motor.totalMass).toFixed(2)} kg.`,
  });

  const maxSimulationTime = 300.0; // 5 minutes max

  while (t < maxSimulationTime) {
    const currentAltitudeASL = launchAltitudeASL + altitude;
    const atmos = getAtmosphereAt(currentAltitudeASL);

    // Motor state
    const thrust = getMotorThrustAt(motor, t);
    const motorState = getMotorMassAt(motor, t);
    const totalMass = vehicleDryMass + motorState.currentMass;

    // Aerodynamics
    const mach = Math.abs(velocity) / atmos.speedOfSound;
    if (mach > maxMach) maxMach = mach;
    if (Math.abs(velocity) > maxVelocity) maxVelocity = Math.abs(velocity);

    const q = 0.5 * atmos.density * Math.pow(velocity, 2);
    let cd = getCdAtMach(mach);

    // Recovery deployment drag
    let effectiveArea = refArea;
    if (isMainDeployed && mainChute) {
      const chuteArea = (Math.PI / 4) * Math.pow(mainChute.diameter, 2);
      effectiveArea = chuteArea;
      cd = mainChute.cd || 1.5;
    } else if (isDrogueDeployed && drogue) {
      const drogueArea = (Math.PI / 4) * Math.pow(drogue.diameter, 2);
      effectiveArea = drogueArea;
      cd = drogue.cd || 0.8;
    }

    const dragForce = q * effectiveArea * cd * Math.sign(velocity);
    const gravityForce = totalMass * 9.80665;

    // Newton's 2nd Law: a = (F_thrust - F_drag - F_gravity) / m
    const netForce = thrust - dragForce - gravityForce;
    const acceleration = netForce / totalMass;

    if (acceleration > maxAccel) maxAccel = acceleration;

    // Check Rail Exit
    if (!hasLeftRail && altitude >= railLength) {
      hasLeftRail = true;
      railExitVel = velocity;
      events.push({
        time: t,
        name: 'Launch Rail Exit',
        altitude,
        velocity,
        description: `Cleared ${railLength.toFixed(1)}m launch rail at ${velocity.toFixed(1)} m/s.`,
      });
    }

    // Check Motor Burnout
    if (!hasBurnedOut && t >= motor.burnTime) {
      hasBurnedOut = true;
      burnoutAlt = altitude;
      burnoutVel = velocity;
      events.push({
        time: t,
        name: 'Motor Burnout',
        altitude,
        velocity,
        description: `Burnout at ${altitude.toFixed(0)}m AGL, velocity ${velocity.toFixed(0)} m/s (Mach ${(velocity / atmos.speedOfSound).toFixed(2)}).`,
      });
    }

    // Check Apogee (velocity crosses zero from positive to negative)
    if (!isApogeeReached && velocity <= 0 && t > 0.5) {
      isApogeeReached = true;
      maxAltitude = altitude;
      apogeeTime = t;
      isDrogueDeployed = true;

      events.push({
        time: t,
        name: 'Apogee & Drogue Ejection',
        altitude,
        velocity: 0,
        description: `Apogee reached at ${altitude.toFixed(0)}m (${(altitude * 3.28084).toFixed(0)} ft) AGL. Drogue chute deployed.`,
      });
    }

    // Check Main Parachute Deployment
    if (isApogeeReached && !isMainDeployed && altitude <= mainDeployAlt) {
      isMainDeployed = true;
      events.push({
        time: t,
        name: 'Main Parachute Deployment',
        altitude,
        velocity,
        description: `Main parachute deployed at ${altitude.toFixed(0)}m AGL. Descent decelerating for soft touchdown.`,
      });
    }

    // Record telemetry point (every 0.05s to keep array light)
    if (Math.round(t / dt) % 5 === 0 || isApogeeReached || !hasLeftRail) {
      telemetry.push({
        time: parseFloat(t.toFixed(3)),
        altitude: parseFloat(altitude.toFixed(1)),
        velocity: parseFloat(velocity.toFixed(1)),
        acceleration: parseFloat(acceleration.toFixed(1)),
        mach: parseFloat(mach.toFixed(3)),
        dynamicPressure: parseFloat(q.toFixed(0)),
        drag: parseFloat(dragForce.toFixed(1)),
        thrust: parseFloat(thrust.toFixed(1)),
        mass: parseFloat(totalMass.toFixed(3)),
      });
    }

    // Touchdown detection
    if (isApogeeReached && altitude <= 0 && t > 1.0) {
      altitude = 0;
      events.push({
        time: t,
        name: 'Ground Touchdown',
        altitude: 0,
        velocity: Math.abs(velocity),
        description: `Landing at ${Math.abs(velocity).toFixed(1)} m/s after ${t.toFixed(1)}s total flight.`,
      });
      break;
    }

    // Numerical integration (Euler-Cromer)
    velocity += acceleration * dt;
    altitude += velocity * dt;
    if (altitude < 0 && !isApogeeReached) altitude = 0;
    t += dt;
  }

  const landingVelocity = Math.abs(velocity);
  const landingKineticEnergy = 0.5 * vehicleDryMass * Math.pow(landingVelocity, 2);
  const isRailExitSafe = railExitVel >= 15.0; // Standard rocketry safety requirement
  const isLandingSafe = landingKineticEnergy <= 20.0 || landingVelocity <= 6.0;

  return {
    apogeeAltitude: maxAltitude,
    apogeeTime,
    maxVelocity,
    maxMach,
    maxAccelerationG: maxAccel / 9.80665,
    burnoutTime: motor.burnTime,
    burnoutAltitude: burnoutAlt,
    burnoutVelocity: burnoutVel,
    railExitVelocity: railExitVel,
    isRailExitSafe,
    landingVelocity,
    landingKineticEnergy,
    isLandingSafe,
    flightDuration: t,
    events,
    telemetry,
  };
}
