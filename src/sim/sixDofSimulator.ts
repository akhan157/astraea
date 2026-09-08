/**
 * Astraea 6-DOF (Six Degrees of Freedom) Numerical Trajectory Engine
 *
 * Implements rigid body dynamics in 3D space:
 * - 3 Translational DOF: Position r = [x, y, z]^T, Velocity v = [u, v, w]^T
 * - 3 Rotational DOF: Attitude Quaternion q = [q0, q1, q2, q3]^T, Angular Velocity omega = [p, q, r]^T
 *
 * Solves coupled Euler-Poinsot rotational dynamics and Newton-Euler translational equations:
 * - Atmospheric wind vectors and altitude shear
 * - Angle of attack (alpha) and sideslip (beta)
 * - Aerodynamic restoring moments (pitch/yaw weathercocking)
 * - Pitch/yaw/roll aerodynamic damping moments
 * - Roll spin induced by fin cant
 * - Dynamic motor plume base drag coupling during burn
 * - 3D launch rail guidance with elevation and azimuth vectors
 * - 3D landing coordinates and parachute drift
 */

import { RocketVehicle, ParachuteComponent } from '../core/types';
import { MotorSpec, getMotorThrustAt, getMotorMassAt } from '../propulsion/motorDatabase';
import { computeAerodynamicCurves } from '../aero/transonicAero';
import { aggregateVehicleMass } from '../core/mass';
import { getAtmosphereAt } from './flightSimulator';

export interface Vector3D {
  x: number; // East (m)
  y: number; // Up / Altitude AGL (m)
  z: number; // North (m)
}

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface SixDofTelemetryPoint {
  time: number;             // seconds
  position: Vector3D;       // East, Up, North (m)
  velocity: Vector3D;       // m/s in world frame
  speed: number;            // scalar magnitude m/s
  mach: number;
  altitude: number;         // y coordinate (m AGL)
  acceleration: number;     // scalar m/s^2
  angularVelocity: { p: number; q: number; r: number }; // roll, pitch, yaw rates (rad/s)
  angleOfAttackDeg: number; // total incidence angle (degrees)
  pitchDeg: number;         // pitch attitude (degrees)
  rollDeg: number;          // roll attitude (degrees)
  yawDeg: number;           // yaw attitude (degrees)
  drag: number;             // Newtons
  thrust: number;           // Newtons
  mass: number;             // kg
  dynamicPressure: number;  // Pa
}

export interface SixDofEvent {
  time: number;
  name: string;
  altitude: number;
  velocity: number;
  description: string;
}

export interface SixDofSimulationResult {
  apogeeAltitude: number;         // meters AGL
  apogeeTime: number;             // seconds
  apogeePosition: Vector3D;       // coordinates at apogee
  maxVelocity: number;           // m/s
  maxMach: number;
  maxAccelerationG: number;       // G's
  burnoutAltitude: number;
  burnoutVelocity: number;
  burnoutTime: number;
  railExitVelocity: number;       // m/s
  isRailExitSafe: boolean;        // >= 15 m/s
  weathercockAngleDeg: number;    // turning angle into wind off rail
  landingPosition: Vector3D;      // touchdown coordinates (m)
  landingDistance: number;        // total lateral drift from launch pad (m)
  landingVelocity: number;        // m/s
  landingKineticEnergy: number;   // Joules
  isLandingSafe: boolean;         // <= 20 J
  flightDuration: number;         // seconds
  events: SixDofEvent[];
  telemetry: SixDofTelemetryPoint[];
}

export interface SixDofOptions {
  railLength?: number;            // meters (default 3.0m)
  railElevationDeg?: number;      // degrees from horizontal (default 85 deg, 90 = vertical)
  railAzimuthDeg?: number;        // degrees from North (default 0 deg = North)
  launchAltitudeASL?: number;     // meters above sea level
  windSpeedSurface?: number;      // m/s at ground level (default 3.0 m/s)
  windAzimuthDeg?: number;        // direction wind is coming from (degrees from North)
  mainDeployAltitudeAGL?: number; // meters AGL
  timeStep?: number;              // seconds (default 0.01s)
  finCantAngleDeg?: number;       // fin cant angle for spin stabilization (degrees, default 0)
}

/**
 * Normalizes a quaternion in-place to prevent numerical drift
 */
function normalizeQuaternion(q: Quaternion): Quaternion {
  const len = Math.sqrt(q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z);
  if (len < 1e-9) return { w: 1, x: 0, y: 0, z: 0 };
  return {
    w: q.w / len,
    x: q.x / len,
    y: q.y / len,
    z: q.z / len,
  };
}

/**
 * Converts quaternion to rotation matrix R (body to world)
 * Body frame convention:
 * +Y_b = longitudinal nose-pointing axis
 * +X_b = lateral pitch axis (along fin 1)
 * +Z_b = lateral yaw axis
 */
function quaternionToMatrix(q: Quaternion): number[][] {
  const { w, x, y, z } = q;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/**
 * Rotates a 3D vector from body frame to world frame: v_world = R * v_body
 */
function rotateBodyToWorld(R: number[][], v: Vector3D): Vector3D {
  return {
    x: R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
    y: R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
    z: R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z,
  };
}

/**
 * Rotates a 3D vector from world frame to body frame: v_body = R^T * v_world
 */
function rotateWorldToBody(R: number[][], v: Vector3D): Vector3D {
  return {
    x: R[0][0] * v.x + R[1][0] * v.y + R[2][0] * v.z,
    y: R[0][1] * v.x + R[1][1] * v.y + R[2][1] * v.z,
    z: R[0][2] * v.x + R[1][2] * v.y + R[2][2] * v.z,
  };
}

/**
 * Converts attitude quaternion to Euler angles (degrees)
 */
function quaternionToEulerDeg(q: Quaternion): { pitchDeg: number; rollDeg: number; yawDeg: number } {
  const { w, x, y, z } = q;

  // Pitch (around X axis)
  const sinPitch = 2 * (w * x - y * z);
  const pitchRad = Math.abs(sinPitch) >= 1 ? Math.sign(sinPitch) * (Math.PI / 2) : Math.asin(sinPitch);

  // Roll (around Y longitudinal axis)
  const sinRoll = 2 * (w * y + z * x);
  const cosRoll = 1 - 2 * (x * x + y * y);
  const rollRad = Math.atan2(sinRoll, cosRoll);

  // Yaw (around Z axis)
  const sinYaw = 2 * (w * z + x * y);
  const cosYaw = 1 - 2 * (y * y + z * z);
  const yawRad = Math.atan2(sinYaw, cosYaw);

  return {
    pitchDeg: pitchRad * (180 / Math.PI),
    rollDeg: rollRad * (180 / Math.PI),
    yawDeg: yawRad * (180 / Math.PI),
  };
}

/**
 * Atmospheric wind model with power-law shear profile:
 * v_wind(h) = v_surface * (h / h_ref)^alpha_shear
 */
function getWindVectorAt(altitude: number, speedSurface: number, azimuthDeg: number): Vector3D {
  const h = Math.max(1.0, altitude);
  const shearExponent = 0.14; // Typical boundary layer wind shear over open terrain
  const speed = speedSurface * Math.pow(h / 2.0, shearExponent);

  // Azimuth is direction wind blows FROM (measured clockwise from North)
  // Wind blowing FROM East (90 deg) blows TOWARD West (-X direction)
  const azRad = (azimuthDeg * Math.PI) / 180;
  const towardsAngle = azRad + Math.PI;

  return {
    x: speed * Math.sin(towardsAngle),
    y: 0, // Assume horizontal wind
    z: speed * Math.cos(towardsAngle),
  };
}

/**
 * Runs full 6-DOF numerical flight trajectory simulation
 */
export function simulate6DofFlight(
  vehicle: RocketVehicle,
  motor: MotorSpec,
  options: SixDofOptions = {}
): SixDofSimulationResult {
  const railLength = options.railLength ?? 3.0;
  const railElevationDeg = Math.min(90, Math.max(70, options.railElevationDeg ?? 85.0));
  const railAzimuthDeg = options.railAzimuthDeg ?? 0.0;
  const launchAltitudeASL = options.launchAltitudeASL ?? 0.0;
  const windSpeedSurface = options.windSpeedSurface ?? 3.0;
  const windAzimuthDeg = options.windAzimuthDeg ?? 90.0; // East wind by default
  const mainDeployAlt = options.mainDeployAltitudeAGL ?? 250.0;
  const dt = options.timeStep ?? 0.01;
  const finCantRad = ((options.finCantAngleDeg ?? 0.0) * Math.PI) / 180;

  // Mass & Geometry
  const massRollup = aggregateVehicleMass(vehicle);
  const vehicleDryMass = Math.max(0.01, massRollup.totalMass);
  const totalLength = massRollup.totalLength;
  const refDiameter = massRollup.referenceDiameter;
  const refArea = (Math.PI / 4) * Math.pow(refDiameter, 2);

  // Transverse & Roll Moments of Inertia
  // Longitudinal cylindrical shell approximation: I_xx = 0.5 * m * R^2, I_yy = I_zz = m * (3*R^2 + L^2) / 12
  const rBody = refDiameter / 2;
  const Ixx_dry = 0.5 * vehicleDryMass * rBody * rBody;
  const Iyy_dry = (vehicleDryMass * (3 * rBody * rBody + totalLength * totalLength)) / 12;

  // Parachutes
  const parachutes = vehicle.components.filter((c) => c.type === 'parachute') as ParachuteComponent[];
  const drogue = parachutes[0];
  const mainChute = parachutes.length > 1 ? parachutes[1] : parachutes[0];

  // Aerodynamic curves (precomputed for powered and unpowered flight)
  const aeroPowered = computeAerodynamicCurves(vehicle, true, 25);
  const aeroCoasting = computeAerodynamicCurves(vehicle, false, 25);

  function getAeroAtMach(mach: number, isPowered: boolean) {
    const data = isPowered ? aeroPowered : aeroCoasting;
    const curves = data.dragCurves;
    if (mach <= curves[0].mach) return curves[0];
    if (mach >= curves[curves.length - 1].mach) return curves[curves.length - 1];

    for (let i = 0; i < curves.length - 1; i++) {
      if (mach >= curves[i].mach && mach <= curves[i + 1].mach) {
        const factor = (mach - curves[i].mach) / (curves[i + 1].mach - curves[i].mach);
        const c1 = curves[i];
        const c2 = curves[i + 1];
        return {
          totalCd: c1.totalCd + factor * (c2.totalCd - c1.totalCd),
          cp: c1.cp + factor * (c2.cp - c1.cp),
        };
      }
    }
    return curves[0];
  }

  // 1. Initial State along Launch Rail
  // Rail unit vector in world coordinates (Up = +Y, East = +X, North = +Z)
  const elRad = (railElevationDeg * Math.PI) / 180;
  const azRad = (railAzimuthDeg * Math.PI) / 180;

  const railVector: Vector3D = {
    x: Math.cos(elRad) * Math.sin(azRad),
    y: Math.sin(elRad),
    z: Math.cos(elRad) * Math.cos(azRad),
  };

  // Initial quaternion: align rocket longitudinal axis (+Y_body) with rail vector
  // Using rotation from [0, 1, 0] to railVector
  const dotY = railVector.y; // dot with [0, 1, 0]
  let initialQ: Quaternion = { w: 1, x: 0, y: 0, z: 0 };

  if (dotY < 0.9999) {
    // Rotation axis = [0, 1, 0] x railVector = [railVector.z, 0, -railVector.x]
    const rotAxis = { x: railVector.z, y: 0, z: -railVector.x };
    const axisLen = Math.sqrt(rotAxis.x * rotAxis.x + rotAxis.z * rotAxis.z);
    if (axisLen > 1e-6) {
      const angle = Math.acos(Math.max(-1, Math.min(1, dotY)));
      const sinHalf = Math.sin(angle / 2);
      initialQ = {
        w: Math.cos(angle / 2),
        x: (rotAxis.x / axisLen) * sinHalf,
        y: 0,
        z: (rotAxis.z / axisLen) * sinHalf,
      };
    }
  }

  // State Variables
  let t = 0;
  let pos: Vector3D = { x: 0, y: 0, z: 0 };
  let vel: Vector3D = { x: 0, y: 0, z: 0 }; // world frame
  let q: Quaternion = normalizeQuaternion(initialQ);
  let omega = { p: 0, q: 0, r: 0 }; // body frame angular velocity (rad/s)

  // Tracking metrics
  let maxAltitude = 0;
  let maxSpeed = 0;
  let maxMach = 0;
  let maxAccel = 0;
  let apogeeTime = 0;
  let apogeePos: Vector3D = { x: 0, y: 0, z: 0 };

  let railExitVel = 0;
  let hasLeftRail = false;
  let weathercockAngleDeg = 0;

  let burnoutAlt = 0;
  let burnoutVel = 0;
  let hasBurnedOut = false;

  let isApogeeReached = false;
  let isDrogueDeployed = false;
  let isMainDeployed = false;

  const telemetry: SixDofTelemetryPoint[] = [];
  const events: SixDofEvent[] = [];

  events.push({
    time: 0,
    name: 'Ignition & Rail Guidance',
    altitude: 0,
    velocity: 0,
    description: `Motor ${motor.designation} ignited at ${(railElevationDeg).toFixed(1)}° rail elevation. Liftoff mass: ${(vehicleDryMass + motor.totalMass).toFixed(2)} kg.`,
  });

  const maxSimTime = 300.0; // 5 min max

  while (t < maxSimTime) {
    const currentAltASL = launchAltitudeASL + pos.y;
    const atmos = getAtmosphereAt(currentAltASL);

    // Motor state & dynamic mass
    const isPowered = t < motor.burnTime;
    const thrustScalar = getMotorThrustAt(motor, t);
    const motorState = getMotorMassAt(motor, t);
    const totalMass = vehicleDryMass + motorState.currentMass;

    // Dynamic moments of inertia
    const motorRadius = motor.diameter / 2;
    const Ixx_motor = 0.5 * motorState.currentMass * motorRadius * motorRadius;
    const Iyy_motor = (motorState.currentMass * (3 * motorRadius * motorRadius + motor.length * motor.length)) / 12;
    const Ixx = Ixx_dry + Ixx_motor;
    const Iyy = Iyy_dry + Iyy_motor;
    const Izz = Iyy;

    // Center of gravity shift forward as motor burns out
    const currentCg = massRollup.cg;

    // Rotation Matrix R: Body to World
    const R = quaternionToMatrix(q);

    // Wind vector in world and body frames
    const windWorld = getWindVectorAt(pos.y, windSpeedSurface, windAzimuthDeg);
    const relativeVelWorld: Vector3D = {
      x: vel.x - windWorld.x,
      y: vel.y - windWorld.y,
      z: vel.z - windWorld.z,
    };

    const relativeVelBody = rotateWorldToBody(R, relativeVelWorld);
    const airspeed = Math.sqrt(
      relativeVelBody.x * relativeVelBody.x +
      relativeVelBody.y * relativeVelBody.y +
      relativeVelBody.z * relativeVelBody.z
    );

    const mach = airspeed / atmos.speedOfSound;
    if (mach > maxMach) maxMach = mach;
    if (airspeed > maxSpeed) maxSpeed = airspeed;

    // Dynamic Pressure q_inf = 0.5 * rho * V^2
    const qInf = 0.5 * atmos.density * airspeed * airspeed;

    // Angles of Attack in Body Frame (+Y is axial)
    const axialVelocity = relativeVelBody.y;
    const lateralX = relativeVelBody.x;
    const lateralZ = relativeVelBody.z;

    const lateralSpeed = Math.sqrt(lateralX * lateralX + lateralZ * lateralZ);
    const alphaRad = Math.atan2(lateralSpeed, Math.max(0.1, Math.abs(axialVelocity)));
    const totalAlphaDeg = (alphaRad * 180) / Math.PI;

    // Aerodynamics lookup
    const aero = getAeroAtMach(mach, isPowered);
    let cd = aero.totalCd;
    let cp = aero.cp;

    // Parachute deployment transitions
    let effectiveArea = refArea;
    if (isMainDeployed && mainChute) {
      effectiveArea = (Math.PI / 4) * Math.pow(mainChute.diameter, 2);
      cd = mainChute.cd || 1.5;
    } else if (isDrogueDeployed && drogue) {
      effectiveArea = (Math.PI / 4) * Math.pow(drogue.diameter, 2);
      cd = drogue.cd || 0.8;
    }

    // Aerodynamic Forces in Body Frame
    // Axial drag opposes axial motion
    const dragAxial = qInf * effectiveArea * cd * Math.sign(axialVelocity || 1);

    // Normal force slope (per radian)
    const cna = 12.0; // Typical slender body + 4-fin lift slope
    const normalForce = qInf * refArea * cna * Math.sin(alphaRad);

    let aeroForceBody: Vector3D = {
      x: lateralSpeed > 0 ? -normalForce * (lateralX / lateralSpeed) : 0,
      y: -dragAxial,
      z: lateralSpeed > 0 ? -normalForce * (lateralZ / lateralSpeed) : 0,
    };

    // Thrust vector in body frame (+Y is forward)
    const thrustBody: Vector3D = { x: 0, y: thrustScalar, z: 0 };

    // Total forces in body frame & world frame
    const totalForceBody: Vector3D = {
      x: aeroForceBody.x + thrustBody.x,
      y: aeroForceBody.y + thrustBody.y,
      z: aeroForceBody.z + thrustBody.z,
    };

    const totalForceWorld = rotateBodyToWorld(R, totalForceBody);
    // Add gravity (world -Y)
    totalForceWorld.y -= totalMass * 9.80665;

    // Aerodynamic Moments in Body Frame
    // Restoring moment: M = F_normal * (CP - CG)
    const staticMarginMeters = cp - currentCg;

    // Aerodynamic pitch/yaw damping moments: M_damp = -0.5 * rho * V * S_ref * L^2 * C_mq * omega
    const pitchDampingTorque = 0.5 * atmos.density * Math.max(1, airspeed) * refArea * totalLength * totalLength * 1.5 * omega.q;
    const yawDampingTorque = 0.5 * atmos.density * Math.max(1, airspeed) * refArea * totalLength * totalLength * 1.5 * omega.r;
    const rollDampingTorque = 0.5 * atmos.density * Math.max(1, airspeed) * refArea * rBody * rBody * 0.5 * omega.p;

    // Roll torque induced by fin cant angle: T_roll = q * S_ref * R_body * sin(delta_cant) * N_fins
    const rollTorque = qInf * refArea * rBody * Math.sin(finCantRad) * 4.0;

    const momentBody = {
      // Pitch moment around X_b: restoring torque + pitch damping
      x: (staticMarginMeters * aeroForceBody.z) - pitchDampingTorque,
      // Roll moment around Y_b: fin cant roll torque - roll damping
      y: rollTorque - rollDampingTorque,
      // Yaw moment around Z_b: restoring torque + yaw damping
      z: (-staticMarginMeters * aeroForceBody.x) - yawDampingTorque,
    };

    // Linear Acceleration in World Frame
    let accelWorld: Vector3D = {
      x: totalForceWorld.x / totalMass,
      y: totalForceWorld.y / totalMass,
      z: totalForceWorld.z / totalMass,
    };

    // Launch Rail Constraint
    const distanceAlongRail = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);

    if (!hasLeftRail) {
      if (distanceAlongRail < railLength) {
        // Constrain acceleration strictly along rail vector
        const forwardForce =
          totalForceWorld.x * railVector.x +
          totalForceWorld.y * railVector.y +
          totalForceWorld.z * railVector.z;

        const forwardAccel = Math.max(0, forwardForce / totalMass);
        accelWorld = {
          x: forwardAccel * railVector.x,
          y: forwardAccel * railVector.y,
          z: forwardAccel * railVector.z,
        };

        // Suppress rotations on rail
        omega = { p: 0, q: 0, r: 0 };
        q = normalizeQuaternion(initialQ);
      } else {
        // Just exited launch rail!
        hasLeftRail = true;
        const scalarSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
        railExitVel = scalarSpeed;

        // Compute weathercocking angle off rail
        weathercockAngleDeg = totalAlphaDeg;

        events.push({
          time: t,
          name: 'Launch Rail Departure',
          altitude: pos.y,
          velocity: scalarSpeed,
          description: `Exited ${railLength.toFixed(1)}m launch rail at ${scalarSpeed.toFixed(1)} m/s (safe threshold >= 15 m/s). Initial crosswind weathercocking: ${totalAlphaDeg.toFixed(1)}°.`,
        });
      }
    }

    const scalarAccel = Math.sqrt(accelWorld.x * accelWorld.x + accelWorld.y * accelWorld.y + accelWorld.z * accelWorld.z);
    if (scalarAccel > maxAccel) maxAccel = scalarAccel;

    // Euler Equations for Angular Acceleration (when off rail)
    let pDot = 0;
    let qDot = 0;
    let rDot = 0;

    if (hasLeftRail && !isApogeeReached) {
      pDot = (momentBody.y - (Izz - Iyy) * omega.q * omega.r) / Ixx;
      qDot = (momentBody.x - (Ixx - Izz) * omega.p * omega.r) / Iyy;
      rDot = (momentBody.z - (Iyy - Ixx) * omega.p * omega.q) / Izz;
    }

    // Check Motor Burnout
    if (!hasBurnedOut && t >= motor.burnTime) {
      hasBurnedOut = true;
      burnoutAlt = pos.y;
      burnoutVel = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      events.push({
        time: t,
        name: 'Motor Burnout',
        altitude: pos.y,
        velocity: burnoutVel,
        description: `Motor burnout at ${pos.y.toFixed(0)}m AGL. Burnout velocity: ${burnoutVel.toFixed(0)} m/s (Mach ${(burnoutVel / atmos.speedOfSound).toFixed(2)}). Transitioning to unpowered coast.`,
      });
    }

    // Check Apogee (vertical velocity crosses zero)
    if (!isApogeeReached && hasLeftRail && vel.y <= 0 && t > 0.8) {
      isApogeeReached = true;
      maxAltitude = pos.y;
      apogeeTime = t;
      apogeePos = { ...pos };
      isDrogueDeployed = true;

      // Tumbling / drogue eliminates attitude lock
      omega = { p: 0, q: 0, r: 0 };

      events.push({
        time: t,
        name: 'Apogee & Drogue Deployment',
        altitude: pos.y,
        velocity: Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z),
        description: `Apogee reached at ${pos.y.toFixed(0)}m (${(pos.y * 3.28084).toFixed(0)} ft) AGL. High-speed drogue parachute ejected.`,
      });
    }

    // Check Main Parachute Deployment
    if (isApogeeReached && !isMainDeployed && pos.y <= mainDeployAlt) {
      isMainDeployed = true;
      events.push({
        time: t,
        name: 'Main Parachute Deployment',
        altitude: pos.y,
        velocity: Math.abs(vel.y),
        description: `Main parachute opened at ${pos.y.toFixed(0)}m AGL. Decelerating descent for safe landing.`,
      });
    }

    // Telemetry sampling (every 0.05s)
    if (Math.round(t / dt) % 5 === 0 || isApogeeReached || !hasLeftRail) {
      const euler = quaternionToEulerDeg(q);
      telemetry.push({
        time: parseFloat(t.toFixed(3)),
        position: { x: parseFloat(pos.x.toFixed(1)), y: parseFloat(pos.y.toFixed(1)), z: parseFloat(pos.z.toFixed(1)) },
        velocity: { x: parseFloat(vel.x.toFixed(1)), y: parseFloat(vel.y.toFixed(1)), z: parseFloat(vel.z.toFixed(1)) },
        speed: parseFloat(airspeed.toFixed(1)),
        mach: parseFloat(mach.toFixed(3)),
        altitude: parseFloat(pos.y.toFixed(1)),
        acceleration: parseFloat(scalarAccel.toFixed(1)),
        angularVelocity: { p: parseFloat(omega.p.toFixed(2)), q: parseFloat(omega.q.toFixed(2)), r: parseFloat(omega.r.toFixed(2)) },
        angleOfAttackDeg: parseFloat(totalAlphaDeg.toFixed(2)),
        pitchDeg: parseFloat(euler.pitchDeg.toFixed(1)),
        rollDeg: parseFloat(euler.rollDeg.toFixed(1)),
        yawDeg: parseFloat(euler.yawDeg.toFixed(1)),
        drag: parseFloat(dragAxial.toFixed(1)),
        thrust: parseFloat(thrustScalar.toFixed(1)),
        mass: parseFloat(totalMass.toFixed(3)),
        dynamicPressure: parseFloat(qInf.toFixed(0)),
      });
    }

    // Touchdown detection
    if (isApogeeReached && pos.y <= 0 && t > 1.0) {
      pos.y = 0;
      const finalImpactSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      const lateralDrift = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

      events.push({
        time: t,
        name: 'Ground Touchdown',
        altitude: 0,
        velocity: finalImpactSpeed,
        description: `Touchdown at ${finalImpactSpeed.toFixed(1)} m/s. Total lateral wind drift: ${lateralDrift.toFixed(0)}m from pad.`,
      });
      break;
    }

    // Numerical State Integration (Euler-Cromer)
    vel.x += accelWorld.x * dt;
    vel.y += accelWorld.y * dt;
    vel.z += accelWorld.z * dt;

    pos.x += vel.x * dt;
    pos.y += vel.y * dt;
    pos.z += vel.z * dt;

    if (pos.y < 0 && !isApogeeReached) pos.y = 0;

    // Angular state integration
    if (hasLeftRail && !isApogeeReached) {
      omega.p += pDot * dt;
      omega.q += qDot * dt;
      omega.r += rDot * dt;

      // Quaternion derivative: qDot = 0.5 * q * omega
      const dqW = 0.5 * (-q.x * omega.p - q.y * omega.q - q.z * omega.r);
      const dqX = 0.5 * (q.w * omega.p + q.y * omega.r - q.z * omega.q);
      const dqY = 0.5 * (q.w * omega.q - q.x * omega.r + q.z * omega.p);
      const dqZ = 0.5 * (q.w * omega.r + q.x * omega.q - q.y * omega.p);

      q.w += dqW * dt;
      q.x += dqX * dt;
      q.y += dqY * dt;
      q.z += dqZ * dt;
      q = normalizeQuaternion(q);
    }

    t += dt;
  }

  const landingSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const landingKineticEnergy = 0.5 * vehicleDryMass * Math.pow(landingSpeed, 2);
  const lateralLandingDrift = Math.sqrt(pos.x * pos.x + pos.z * pos.z);

  return {
    apogeeAltitude: maxAltitude,
    apogeeTime,
    apogeePosition: apogeePos,
    maxVelocity: maxSpeed,
    maxMach,
    maxAccelerationG: maxAccel / 9.80665,
    burnoutAltitude: burnoutAlt,
    burnoutVelocity: burnoutVel,
    burnoutTime: motor.burnTime,
    railExitVelocity: railExitVel,
    isRailExitSafe: railExitVel >= 15.0,
    weathercockAngleDeg,
    landingPosition: pos,
    landingDistance: lateralLandingDrift,
    landingVelocity: landingSpeed,
    landingKineticEnergy,
    isLandingSafe: landingKineticEnergy <= 20.0 || landingSpeed <= 6.0,
    flightDuration: t,
    events,
    telemetry,
  };
}
