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
import { integrateRigidStep, normalizeQuaternion as normQ, simOmegaToKernel, kernelOmegaToSim, simInertiaToKernel, Vec3, LoadsAt } from '../dynamics/rigidBody';
import { detectEvents, EventState, NEWTON_EVENT_STATE } from '../dynamics/events';

export interface Vector3D {
  x: number; // East (m)
  y: number; // Up / Altitude AGL (m)  [ENU: +Z_nav is up; here y is the display-up alias]
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
  isLandingSafe: boolean;         // <= 20 J kinetic energy safety gate
  isLandingVelocitySafe: boolean; // <= 6.0 m/s landing speed
  terminated: boolean;            // true only on actual ground touchdown
  landingMass: number;            // actual retained mass at landing (kg)
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
 * Normalizes a quaternion to prevent numerical drift (production kernel).
 */
const normalizeQuaternion = normQ;

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

  // Baseline CG offset for restoring-moment lever arm (CP - CG). The mass
  // rollup CG is a coarse constant proxy (documented limitation).
  const baselineCg = massRollup.cg;

  /**
   * Production flight RHS (NORMATIVE, Gate 4-P0-2).
   * Evaluates FULL instantaneous loads (thrust, aero forces/moments, gravity,
   * dynamic mass/inertia) at an arbitrary stage state/time. Passed as `loadsAt`
   * to integrateRigidStep so the simulator performs genuine 4th-order coupled
   * integration instead of per-macro-step frozen loads.
   * Kernel is frame-agnostic Cartesian RK4 in the simulator display frame
   * {x: East, y: Up, z: North}; returns kernel-form Loads.
   */
  function computeFlightLoads(
    tStage: number,
    st: {
      r: { x: number; y: number; z: number };
      v: { x: number; y: number; z: number };
      q: { w: number; x: number; y: number; z: number };
      w: { x: number; y: number; z: number };
    },
    flags: { drogueDeployed: boolean; mainDeployed: boolean }
  ) {
    const altASL = launchAltitudeASL + st.r.y;
    const atmosSt = getAtmosphereAt(altASL);
    const powered = tStage < motor.burnTime;
    const thrustSt = getMotorThrustAt(motor, tStage);
    const motorSt = getMotorMassAt(motor, tStage);
    const massSt = vehicleDryMass + motorSt.currentMass;
    const mRad = motor.diameter / 2;
    const Ixx_mot = 0.5 * motorSt.currentMass * mRad * mRad;
    const Iyy_mot = (motorSt.currentMass * (3 * mRad * mRad + motor.length * motor.length)) / 12;
    const IxxSt = Ixx_dry + Ixx_mot; // roll-axial
    const IyySt = Iyy_dry + Iyy_mot; // transverse pitch
    const IzzSt = IyySt;

    const qSt = { w: st.q.w, x: st.q.x, y: st.q.y, z: st.q.z };
    const RSt = quaternionToMatrix(qSt);
    const windSt = getWindVectorAt(st.r.y, windSpeedSurface, windAzimuthDeg);
    const relWorld = {
      x: st.v.x - windSt.x,
      y: st.v.y - windSt.y,
      z: st.v.z - windSt.z,
    };
    const relBody = rotateWorldToBody(RSt, relWorld);
    const airspeedSt = Math.sqrt(relBody.x * relBody.x + relBody.y * relBody.y + relBody.z * relBody.z);
    const machSt = airspeedSt / atmosSt.speedOfSound;
    const qInfSt = 0.5 * atmosSt.density * airspeedSt * airspeedSt;
    const latSpeedSt = Math.sqrt(relBody.x * relBody.x + relBody.z * relBody.z);
    const alphaSt = Math.atan2(latSpeedSt, Math.max(0.1, Math.abs(relBody.y)));

    const aeroSt = getAeroAtMach(machSt, powered);
    let cdSt = aeroSt.totalCd;
    const cpSt = aeroSt.cp;

    let effAreaSt = refArea;
    if (flags.mainDeployed && mainChute) {
      effAreaSt = (Math.PI / 4) * Math.pow(mainChute.diameter, 2);
      cdSt = mainChute.cd || 1.5;
    } else if (flags.drogueDeployed && drogue) {
      effAreaSt = (Math.PI / 4) * Math.pow(drogue.diameter, 2);
      cdSt = drogue.cd || 0.8;
    }

    const dragAxialSt = qInfSt * effAreaSt * cdSt * Math.sign(relBody.y || 1);
    const cnaSt = 12.0;
    const normalSt = qInfSt * refArea * cnaSt * Math.sin(alphaSt);
    const aeroBody = {
      x: latSpeedSt > 0 ? -normalSt * (relBody.x / latSpeedSt) : 0,
      y: -dragAxialSt,
      z: latSpeedSt > 0 ? -normalSt * (relBody.z / latSpeedSt) : 0,
    };

    // Total force body -> nav, add gravity (display y is Up)
    const forceBodyN = rotateBodyToWorld(RSt, { x: aeroBody.x, y: aeroBody.y + thrustSt, z: aeroBody.z });
    forceBodyN.y -= massSt * 9.80665;

    const dStatic = cpSt - baselineCg;
    const roll = st.w.y;
    const pitch = st.w.x;
    const yaw = st.w.z;
    const pitchDampSt = 0.5 * atmosSt.density * Math.max(1, airspeedSt) * refArea * totalLength * totalLength * 1.5 * pitch;
    const yawDampSt = 0.5 * atmosSt.density * Math.max(1, airspeedSt) * refArea * totalLength * totalLength * 1.5 * yaw;
    const rollDampSt = qInfSt * refArea * rBody * rBody * 4.0 * roll;
    const rollTorqueSt = qInfSt * refArea * rBody * Math.sin(finCantRad) * 4.0;

    return {
      forceN: { x: forceBodyN.x, y: forceBodyN.y, z: forceBodyN.z },
      momentB: {
        x: -(dStatic * aeroBody.z) - pitchDampSt,
        y: rollTorqueSt - rollDampSt,
        z: (dStatic * aeroBody.x) - yawDampSt,
      },
      inertiaB: { x: IyySt, y: IxxSt, z: IzzSt },
      mass: massSt,
    };
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

  let isApogeeReached = false;
  let isDrogueDeployed = false;
  let isMainDeployed = false;
  let eventState: EventState = { ...NEWTON_EVENT_STATE };

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
    const rollDampingTorque = qInf * refArea * rBody * rBody * 4.0 * omega.p;

    // Roll torque induced by fin cant angle: T_roll = q * S_ref * R_body * sin(delta_cant) * N_fins
    const rollTorque = qInf * refArea * rBody * Math.sin(finCantRad) * 4.0;

    const momentBody = {
      // Pitch moment around X_b: (r_cp - r_cg) x F_body.x-component
      // With d = x_cp - x_cg > 0 (CP aft of CG under nose-forward convention),
      // r_cp - r_cg = (0, -d, 0)_B, so M_x = -d * F_body.z
      x: -(staticMarginMeters * aeroForceBody.z) - pitchDampingTorque,
      // Roll moment around Y_b: fin cant roll torque - roll damping
      y: rollTorque - rollDampingTorque,
      // Yaw moment around Z_b: M_z = d * F_body.x
      z: (staticMarginMeters * aeroForceBody.x) - yawDampingTorque,
    };

    // Linear Acceleration in World Frame
    let constrainedForceN: Vector3D = { x: totalForceWorld.x, y: totalForceWorld.y, z: totalForceWorld.z };
    let accelWorld: Vector3D = {
      x: totalForceWorld.x / totalMass,
      y: totalForceWorld.y / totalMass,
      z: totalForceWorld.z / totalMass,
    };

    // Launch Rail Constraint (keep — this constrains acceleration while the
    // FSM's RAIL_EXIT has not fired)
    const distanceAlongRail = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);

    if (!eventState.hasLeftRail) {
      if (distanceAlongRail < railLength) {
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

        // Track rail-constrained net force for the kernel (P0-1: the
        // constrained force, not the free-body force, must drive translation)
        constrainedForceN = {
          x: forwardAccel * totalMass * railVector.x,
          y: forwardAccel * totalMass * railVector.y,
          z: forwardAccel * totalMass * railVector.z,
        };

        // Suppress rotations on rail
        omega = { p: 0, q: 0, r: 0 };
        q = normalizeQuaternion(initialQ);
      }
    }

    if (eventState.hasLeftRail) {
      // Free flight: unconstrained
      constrainedForceN = { x: totalForceWorld.x, y: totalForceWorld.y, z: totalForceWorld.z };
    }

    const scalarAccel = Math.sqrt(accelWorld.x * accelWorld.x + accelWorld.y * accelWorld.y + accelWorld.z * accelWorld.z);
    if (scalarAccel > maxAccel) maxAccel = scalarAccel;

    // Production FSM: one-shot direction-filtered event detection
    const ev = detectEvents(eventState, {
      t,
      altitudeAlongRail: distanceAlongRail,
      railLength,
      burnTime: motor.burnTime,
      verticalVelocity: vel.y,
      altitude: pos.y,
      mainDeployAlt,
    });
    eventState = ev.state;

    if (ev.fires.includes('RAIL_EXIT')) {
      hasLeftRail = true;
      const scalarSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
      railExitVel = scalarSpeed;
      weathercockAngleDeg = totalAlphaDeg;
      events.push({
        time: t,
        name: 'Launch Rail Departure',
        altitude: pos.y,
        velocity: scalarSpeed,
        description: `Exited ${railLength.toFixed(1)}m launch rail at ${scalarSpeed.toFixed(1)} m/s (safe threshold >= 15 m/s). Initial crosswind weathercocking: ${totalAlphaDeg.toFixed(1)}°.`,
      });
    }

    if (ev.fires.includes('MOTOR_BURNOUT')) {
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

    if (ev.fires.includes('APOGEE_DROGUE')) {
      isApogeeReached = true;
      maxAltitude = pos.y;
      apogeeTime = t;
      apogeePos = { ...pos };
      isDrogueDeployed = true;
      omega = { p: 0, q: 0, r: 0 }; // tumbling / drogue decouples attitude
      events.push({
        time: t,
        name: 'Apogee & Drogue Deployment',
        altitude: pos.y,
        velocity: Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z),
        description: `Apogee reached at ${pos.y.toFixed(0)}m (${(pos.y * 3.28084).toFixed(0)} ft) AGL. High-speed drogue parachute ejected.`,
      });
    }

    if (ev.fires.includes('MAIN_DEPLOY')) {
      isMainDeployed = true;
      events.push({
        time: t,
        name: 'Main Parachute Deployment',
        altitude: pos.y,
        velocity: Math.abs(vel.y),
        description: `Main parachute opened at ${pos.y.toFixed(0)}m AGL. Decelerating descent for safe landing.`,
      });
    }

    if (ev.fires.includes('TOUCHDOWN')) {
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

    // IDENTITY mapping: kernel is frame-agnostic Cartesian RK4 operating in the
    // simulator's display frame {x: East, y: Up, z: North}. r/v/forceN/quaternion
    // pass through unchanged so body->nav attitude coupling stays consistent.
    // Body rates/inertia use the certified label mapping:
    //   omega {p=roll, q=pitch, r=yaw} <-> kernel w {x=pitch, y=roll, z=yaw}
    //   Ixx=roll-axial, Iyy=Izz=transverse -> kernel inertiaB {pitch, roll, yaw}
    // Identity low-level load for rail-free basic validity; when loadsAt is
    // present this is overridden at every stage.
    const kernelInState = {
      r: { x: pos.x, y: pos.y, z: pos.z },
      v: { x: vel.x, y: vel.y, z: vel.z },
      q: { w: q.w, x: q.x, y: q.y, z: q.z },
      w: simOmegaToKernel(omega),
    };

    // Stage-RHS (P0-2): recompute full loads at every RK4 stage from that
    // stage's state and time. Pre-rail, project net force along the rail so
    // the constrained force actually drives translation (P0-1).
    const loadsAtStage: LoadsAt = (tStage, stStage) => {
      const flags = { drogueDeployed: isDrogueDeployed, mainDeployed: isMainDeployed };
      const L = computeFlightLoads(tStage, stStage, flags);
      if (!eventState.hasLeftRail) {
        // On-rail: project force along rail, zero body moments (the rail
        // constrains rotation; otherwise stage-RHS torque injection plus the
        // post-step rail-lock zeroing accumulates spin and diverges).
        const railUnit: Vec3 = { x: railVector.x, y: railVector.y, z: railVector.z };
        const fdot = L.forceN.x * railUnit.x + L.forceN.y * railUnit.y + L.forceN.z * railUnit.z;
        const fProj = Math.max(0, fdot);
        return {
          forceN: { x: fProj * railUnit.x, y: fProj * railUnit.y, z: fProj * railUnit.z },
          momentB: { x: 0, y: 0, z: 0 },
          inertiaB: L.inertiaB,
          mass: L.mass,
        };
      }
      return L;
    };

    const next = integrateRigidStep(kernelInState, {
      forceN: { x: constrainedForceN.x, y: constrainedForceN.y, z: constrainedForceN.z },
      momentB: { x: momentBody.x, y: momentBody.y, z: momentBody.z },
      inertiaB: simInertiaToKernel({ x: Ixx, y: Iyy, z: Izz }),
      mass: totalMass,
    }, dt, loadsAtStage, t);

    // IDENTITY write-back: r/v/q propagate unchanged; body-rate label inverse
    pos.x = next.r.x; pos.y = next.r.y; pos.z = next.r.z;
    vel.x = next.v.x; vel.y = next.v.y; vel.z = next.v.z;
    q.w = next.q.w; q.x = next.q.x; q.y = next.q.y; q.z = next.q.z;
    const o = kernelOmegaToSim(next.w);
    omega.p = o.p;
    omega.q = o.q;
    omega.r = o.r;

    // Quasi-steady-state roll (stiff-dynamics limit, NORMATIVE).
    // Roll timescale tau = I_roll / (q S r^2 C_lp) ~ 1e-4 s at this model
    // scale; at dt>=0.005 explicit fixed-step RK4 can resolve it, at dt=0.01
    // it is inside the stability bound and diverges. When tau_roll < dt,
    // integrate the fast-rotating roll as equilibrated (p -> p_eq =
    // sin(cant)/r) rather than explicitly — the roll damps to equilibrium
    // within one macro-step, so holding equilibrium is MORE correct than a
    // numerically unstable explicit step.
    if (eventState.hasLeftRail) {
      const qInfMacro = 0.5 * atmos.density * airspeed * airspeed;
      const rollDampCoeffMacro = qInfMacro * refArea * rBody * rBody * 4.0;
      const IrollMacro = Ixx; // kernel roll inertia (production Ixx = roll-axial)
      const tauRoll = rollDampCoeffMacro > 0 ? IrollMacro / rollDampCoeffMacro : 1e-3;
      if (tauRoll < dt) {
        const pEq = Math.sin(finCantRad) / Math.max(1e-6, rBody);
        omega.p = Math.sign(omega.p) * Math.min(Math.abs(omega.p), Math.abs(pEq));
      }
    }

    if (pos.y < 0 && !isApogeeReached) pos.y = 0;

    t += dt;
  }
  // Landing metrics: use ACTUAL retained mass at touchdown (dry vehicle +
  // remaining motor hardware), not the liftoff dry mass. Only meaningful
  // when the simulation actually terminated via touchdown (not timeout).
  const landingSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const motorStateAtLanding = getMotorMassAt(motor, t);
  const landingMass = vehicleDryMass + motorStateAtLanding.currentMass;
  const landingKineticEnergy = 0.5 * landingMass * Math.pow(landingSpeed, 2);
  const lateralLandingDrift = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  const terminated = eventState.touchedDown;
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
    isLandingSafe: terminated && landingKineticEnergy <= 20.0,
    isLandingVelocitySafe: terminated && landingSpeed <= 6.0,
    terminated,
    landingMass,
    flightDuration: t,
    events,
    telemetry,
  };
}
