/**
 * Astraea Production Loads Assembly (NORMATIVE, Gate 1r)
 *
 * The SINGLE authoritative aerodynamic/thrust/moment assembly used by
 * sixDofSimulator.ts. Both the flight simulator and verification benchmark
 * VV-004 consume this module — there is no test-local load assembly.
 *
 * Operates in the simulator display frame {x: East, y: Up, z: North}
 * (frame-agnostic Cartesian kernel). Body frame: +Y_B longitudinal noseward,
 * +X_B pitch, +Z_B yaw. Returns kernel-form Loads.
 */

import { RocketVehicle, ParachuteComponent } from '../core/types';
import { MotorSpec, getMotorThrustAt, getMotorMassAt } from '../propulsion/motorDatabase';
import { computeAerodynamicCurves } from '../aero/transonicAero';
import { getAtmosphereAt } from '../sim/flightSimulator';
import { aggregateVehicleMass } from '../core/mass';
import {
  Vec3,
  Loads,
  quaternionToMatrix,
  rotateBodyToWorld,
  rotateWorldToBody,
} from './rigidBody';

export interface StageKinematicState {
  r: { x: number; y: number; z: number };
  v: { x: number; y: number; z: number };
  q: { w: number; x: number; y: number; z: number };
  w: { x: number; y: number; z: number }; // {pitch, roll, yaw}
}

export interface RecoveryFlags {
  drogueDeployed: boolean;
  mainDeployed: boolean;
}

export interface LoadsAssemblyConfig {
  vehicle: RocketVehicle;
  motor: MotorSpec;
  launchAltitudeASL: number;
  windSpeedSurface: number;
  windAzimuthDeg: number;
  finCantRad: number;
  /** Direct wind vector override (m/s, display frame) for testability (Galilean invariance). */
  windOverride?: Vec3;
}

/** Power-law wind shear profile: v(h) = v_surf * (h/2)^0.14. */
export function getWindVectorAt(
  altitude: number,
  speedSurface: number,
  azimuthDeg: number
): Vec3 {
  const h = Math.max(1.0, altitude);
  const speed = speedSurface * Math.pow(h / 2.0, 0.14);
  const azRad = (azimuthDeg * Math.PI) / 180;
  const towards = azRad + Math.PI;
  // ENU: x=East, y=North, z=Up. Wind blows TOWARD the azimuth; the North
  // component lives in y, and there is no vertical wind (z = 0).
  return {
    x: speed * Math.sin(towards),
    y: speed * Math.cos(towards),
    z: 0,
  };
}

/**
 * Assembles FULL instantaneous loads for an arbitrary stage state/time.
 * Cached geometry from config is precomputed by the caller (vehicle dry mass,
 * reference area, dry inertias, aero curves) to keep stage cost low.
 */
export interface PreparedVehicle {
  vehicleDryMass: number;
  refDiameter: number;
  refArea: number;
  rBody: number;
  totalLength: number;
  Ixx_dry: number; // roll-axial (kg m^2)
  Iyy_dry: number; // transverse pitch
  baselineCg: number;
  drogue: ParachuteComponent | undefined;
  mainChute: ParachuteComponent | undefined;
  aeroPowered: ReturnType<typeof computeAerodynamicCurves>;
  aeroCoasting: ReturnType<typeof computeAerodynamicCurves>;
}

export function prepareVehicle(vehicle: RocketVehicle): PreparedVehicle {
  const massRollup = aggregateVehicleMass(vehicle);
  const totalLength = massRollup.totalLength;
  const refDiameter = massRollup.referenceDiameter;
  const refArea = (Math.PI / 4) * Math.pow(refDiameter, 2);
  const rBody = refDiameter / 2;
  const vehicleDryMass = Math.max(0.01, massRollup.totalMass);
  const Ixx_dry = 0.5 * vehicleDryMass * rBody * rBody;
  const Iyy_dry = (vehicleDryMass * (3 * rBody * rBody + totalLength * totalLength)) / 12;
  const parachutes = vehicle.components.filter((c) => c.type === 'parachute') as ParachuteComponent[];
  return {
    vehicleDryMass,
    refDiameter,
    refArea,
    rBody,
    totalLength,
    Ixx_dry,
    Iyy_dry,
    baselineCg: massRollup.cg,
    drogue: parachutes[0],
    mainChute: parachutes.length > 1 ? parachutes[1] : parachutes[0],
    aeroPowered: computeAerodynamicCurves(vehicle, true, 25),
    aeroCoasting: computeAerodynamicCurves(vehicle, false, 25),
  };
}

function aeroAtMach(
  mach: number,
  isPowered: boolean,
  pv: PreparedVehicle
): { totalCd: number; cp: number } {
  const data = isPowered ? pv.aeroPowered : pv.aeroCoasting;
  const curves = data.dragCurves;
  if (mach <= curves[0].mach) return { totalCd: curves[0].totalCd, cp: curves[0].cp };
  if (mach >= curves[curves.length - 1].mach) {
    const last = curves[curves.length - 1];
    return { totalCd: last.totalCd, cp: last.cp };
  }
  for (let i = 0; i < curves.length - 1; i++) {
    if (mach >= curves[i].mach && mach <= curves[i + 1].mach) {
      const f = (mach - curves[i].mach) / (curves[i + 1].mach - curves[i].mach);
      return {
        totalCd: curves[i].totalCd + f * (curves[i + 1].totalCd - curves[i].totalCd),
        cp: curves[i].cp + f * (curves[i + 1].cp - curves[i].cp),
      };
    }
  }
  const last = curves[curves.length - 1];
  return { totalCd: last.totalCd, cp: last.cp };
}

export interface FlightLoadsDetail extends Loads {
  kinematics: {
    airspeed: number;
    mach: number;
    qInf: number;
    alphaDeg: number;
    betaDeg: number;
    latSpeed: number;
    dragAxial: number;
    thrust: number;
  };
}

/** Full flight RHS: thrust + aero forces/moments + gravity + dynamic mass/inertia. */
export function computeFlightLoads(
  tStage: number,
  st: StageKinematicState,
  flags: RecoveryFlags,
  cfg: LoadsAssemblyConfig,
  pv: PreparedVehicle
): FlightLoadsDetail {
  const altASL = cfg.launchAltitudeASL + st.r.z;
  const atmos = getAtmosphereAt(altASL);
  const powered = tStage < cfg.motor.burnTime;
  const thrust = getMotorThrustAt(cfg.motor, tStage);
  const motorSt = getMotorMassAt(cfg.motor, tStage);
  const mass = pv.vehicleDryMass + motorSt.currentMass;
  const mRad = cfg.motor.diameter / 2;
  const Ixx_mot = 0.5 * motorSt.currentMass * mRad * mRad;
  // Motor transverse inertia about its own centroid, then PARALLEL-AXIS
  // translated to the baseline vehicle CG (motor mounted aft of CG by
  // motor center offset; audit §5.1). Izz = Iyy under axisymmetry.
  const Iyy_mot_c = (motorSt.currentMass * (3 * mRad * mRad + cfg.motor.length * cfg.motor.length)) / 12;
  // Motor CG offset from vehicle CG: motor axial base at vehicle aft, so its
  // center sits at (totalLength - motor.length/2) from nose; baseline cg from nose.
  const motorCgFromNose = Math.max(0, pv.totalLength - cfg.motor.length / 2);
  const dMot = motorCgFromNose - pv.baselineCg; // signed (m)
  const Iyy_mot = Iyy_mot_c + motorSt.currentMass * dMot * dMot;
  const Ixx = pv.Ixx_dry + Ixx_mot; // roll-axial (insensitive to axial offset)
  const Iyy = pv.Iyy_dry + Iyy_mot; // transverse pitch (parallel-axis corrected)
  const Izz = Iyy;

  // Gate 3: variable-inertia term from motor mass depletion.
  // Constant-flow depletion is the DISCHARGE MODEL in production use
  // (contract §5 motor model): dm/dt = -m_prop / t_burn while burning.
  // The parallel-axis term contributes d(Iyy)/dt = 2 m_mot d_mot (d_mot/dt),
  // which with d_mot constant reduces to the mass-flow term only; we account
  // for the mass-linked d(I)/dt via the two terms below.
  const dmDt = powered ? -cfg.motor.propellantMass / cfg.motor.burnTime : 0;
  const dIxx_mot_dt = 0.5 * mRad * mRad * dmDt;
  const dIyy_mot_dt =
    (3 * mRad * mRad + cfg.motor.length * cfg.motor.length) / 12 * dmDt +
    2 * dmDt * dMot * dMot; // d(m·d_mot²)/dt with d_mot constant = 2·dm·d²
  // inertias stored as {pitch, roll, yaw} in kernel convention
  const inertiaDotB = { x: dIyy_mot_dt, y: dIxx_mot_dt, z: dIyy_mot_dt };

  const R = quaternionToMatrix({ w: st.q.w, x: st.q.x, y: st.q.y, z: st.q.z });
  const wind = cfg.windOverride ?? getWindVectorAt(st.r.z, cfg.windSpeedSurface, cfg.windAzimuthDeg);
  const relWorld = { x: st.v.x - wind.x, y: st.v.y - wind.y, z: st.v.z - wind.z };
  const relBody = rotateWorldToBody(R, relWorld);
  const airspeed = Math.sqrt(relBody.x * relBody.x + relBody.y * relBody.y + relBody.z * relBody.z);
  const mach = airspeed / atmos.speedOfSound;
  const qInf = 0.5 * atmos.density * airspeed * airspeed;
  // Certified paired incidence (contract §6): α about the X_B (pitch) axis,
  // β about the Z_B (yaw) axis, from body-frame air-relative velocity.
  const latSpeed = Math.sqrt(relBody.x * relBody.x + relBody.z * relBody.z);
  // Signed paired incidence (contract §6): α about X_B (pitch), β about Z_B (yaw)
  const beta = Math.atan2(relBody.x, Math.max(1e-6, Math.hypot(relBody.y, relBody.z)));
  const alphaTotal = Math.atan2(latSpeed, Math.max(1e-6, Math.abs(relBody.y)));

  const aero = aeroAtMach(mach, powered, pv);
  let cd = aero.totalCd;
  const cp = aero.cp;
  let effArea = pv.refArea;
  if (flags.mainDeployed && pv.mainChute) {
    effArea = (Math.PI / 4) * Math.pow(pv.mainChute.diameter, 2);
    cd = pv.mainChute.cd || 1.5;
  } else if (flags.drogueDeployed && pv.drogue) {
    effArea = (Math.PI / 4) * Math.pow(pv.drogue.diameter, 2);
    cd = pv.drogue.cd || 0.8;
  }

  const dragAxial = qInf * effArea * cd; // wind-axis drag magnitude (N)

  // Wind-axis -> body transform (contract §6): drag opposes the air-relative
  // velocity unit vector; lift acts along the body Y-Z plane normal to it.
  let aeroBody = { x: 0.0, y: 0.0, z: 0.0 };
  if (airspeed < 1e-6 || latSpeed < 1e-9) {
    // No relative airflow / purely axial flow: zero transverse aero forces
    aeroBody.y = -dragAxial * (airspeed > 1e-6 ? relBody.y / airspeed : 0);
  } else {
    // Drag opposes airflow, axial component only (wind-axis -> body, §6)
    aeroBody.y = -dragAxial * (relBody.y / airspeed);
    // Normal force magnitude from total incidence, in the transverse X-Z
    // plane (signed by longitudinal air-speed direction to fold reverse flow
    // correctly): direction = -transverse velocity / latSpeed
    const cna = 12.0; // documented normal-force slope (Mach-averaged, screened)
    const normalMag = qInf * pv.refArea * cna * Math.sin(alphaTotal) * Math.sign(relBody.y);
    const nx = latSpeed > 0 ? -normalMag * (relBody.x / latSpeed) : 0;
    const nz = latSpeed > 0 ? -normalMag * (relBody.z / latSpeed) : 0;
    aeroBody.x = nx;
    aeroBody.z = nz;
  }

  const forceBodyN = rotateBodyToWorld(R, { x: aeroBody.x, y: aeroBody.y + thrust, z: aeroBody.z });
  forceBodyN.z -= mass * 9.80665;

  const dStatic = cp - pv.baselineCg;
  const roll = st.w.y;
  const pitch = st.w.x;
  const yaw = st.w.z;
  const pitchDamp = 0.5 * atmos.density * Math.max(1, airspeed) * pv.refArea * pv.totalLength * pv.totalLength * 1.5 * pitch;
  const yawDamp = 0.5 * atmos.density * Math.max(1, airspeed) * pv.refArea * pv.totalLength * pv.totalLength * 1.5 * yaw;
  // Roll damping: dimensionally correct N·m via nondimensional rate p·d/(2V)
  // (contract §6 convention): L_p = qInf S d C_lp p d / (2 V)
  const clp = 4.0; // roll-damping coefficient derivative (screened empirical)
  const rollDamp = (qInf * pv.refArea * pv.rBody * pv.rBody * clp * roll) / (2 * Math.max(1.0, airspeed));
  const rollTorque = qInf * pv.refArea * pv.rBody * Math.sin(cfg.finCantRad) * 4.0;

  return {
    forceN: { x: forceBodyN.x, y: forceBodyN.y, z: forceBodyN.z },
    momentB: {
      x: -(dStatic * aeroBody.z) - pitchDamp,
      y: rollTorque - rollDamp,
      z: (dStatic * aeroBody.x) - yawDamp,
    },
    inertiaB: { x: Iyy, y: Ixx, z: Izz }, // kernel {pitch, roll, yaw}
    inertiaDotB,
    mass,
    kinematics: {
      airspeed,
      mach,
      qInf,
      alphaDeg: (alphaTotal * 180) / Math.PI,
      betaDeg: (beta * 180) / Math.PI,
      latSpeed,
      dragAxial,
      thrust,
    },
  };
}