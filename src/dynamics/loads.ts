/**
 * Astraea Production Loads Assembly (NORMATIVE, Gate 1r)
 *
 * The SINGLE authoritative aerodynamic/thrust/moment assembly used by
 * sixDofSimulator.ts. Both the flight simulator and verification benchmark
 * VV-004 consume this module — there is no test-local load assembly.
 *
 * Operates in the canonical right-handed ENU navigation frame {x: East,
 * y: North, z: Up} (normative contract §1.1b; gravity acts along -z).
 * Body frame: +Y_B longitudinal noseward, +X_B pitch, +Z_B yaw. Returns
 * kernel-form Loads (inertiaB = {pitch, roll, yaw}).
 *
 * Round-13 audit §3.5/§3.6 repair scope:
 *  - mass properties referenced to the INSTANTANEOUS combined CG x_c(t),
 *    with both component inertias parallel-axis translated to it;
 *  - d(I)/dt differentiated from the SAME linear depletion law used for I(t),
 *    including the moving-reference d(x_c)/dt terms (no factor-of-two);
 *  - complete wind-axis drag vector F_D,B = -D v_air,B/|v_air,B| on every
 *    channel (free flight AND parachute path), alongside the body-normal force;
 *  - signed paired incidence alpha = atan2(v_B,z, v_B,y), beta per contract
 *    §6 — never folded; vehicle + Mach dependent normal slope (no cna = 12);
 *  - load-level validity classification at aero-table Mach clamps;
 *  - damping moments vanish at zero airspeed (no Math.max(1, V) floor).
 */

import { RocketVehicle, ParachuteComponent } from '../core/types';
import { MotorSpec, getMotorThrustAt, getMotorMassAt, getMotorMassFlowAt } from '../propulsion/motorDatabase';
import { computeAerodynamicCurves } from '../aero/transonicAero';
import { computeRocketStability } from '../aero/barrowman';
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
  /** Direct ENU wind override (m/s) for testability (Galilean invariance). */
  windOverride?: Vec3;
  /** Rail-constrained stage (audit §5.3): transverse loads are carried by
   *  the rail under contact dynamics, so body incidence is not a validity
   *  input. Mach clamps, finite-input checks, and drag-domain handling still
   *  apply — the exclusion is incidence-only, never whole-validity. */
  railBound?: boolean;
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
  /** Whole-vehicle slender-body normal-force slope CNα (Barrowman, per radian),
   *  referenced to refArea. Vehicle-dependent base that the Mach-modified
   *  normal slope used by the loads assembly is scaled from. */
  cna0: number;
  /** Motor aft-end station measured from the nose (m): the flagged mount's
   *  aft end when a motor mount is assigned, else the vehicle aft end
   *  (documented fallback). The call site seats the motor centroid half a
   *  motor length forward of this station. */
  motorAftStationFromNose: number;
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
  if (!(massRollup.totalMass > 0)) {
    throw new Error('prepareVehicle: vehicle dry mass must be positive');
  }
  const vehicleDryMass = massRollup.totalMass;
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
    cna0: computeRocketStability(vehicle).totalCNa,
    motorAftStationFromNose: resolveMotorCentroid(vehicle, massRollup),
    drogue: parachutes[0],
    mainChute: parachutes.length > 1 ? parachutes[1] : parachutes[0],
    aeroPowered: computeAerodynamicCurves(vehicle, true, 25),
    aeroCoasting: computeAerodynamicCurves(vehicle, false, 25),
  };
}

/**
 * Motor aft-end station from the nose (m). A body tube flagged
 * `isMotorMount` seats the motor at its aft end; without an assigned mount
 * the motor is assumed at the vehicle aft end (documented fallback).
 */
function resolveMotorCentroid(
  vehicle: RocketVehicle,
  massRollup: { totalLength: number; components: { id: string; axialStart: number; length: number }[] }
): number {
  const mount = vehicle.components.find((c) => c.type === 'bodytube' && c.isMotorMount);
  if (mount) {
    const rec = massRollup.components.find((r) => r.id === mount.id);
    if (rec) {
      const mountEnd = rec.axialStart + rec.length;
      return mountEnd; // refined with motor length at the call site
    }
  }
  return massRollup.totalLength; // aft-end fallback (refined at the call site)
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

/**
 * Vehicle/Mach-dependent normal-force slope (audit §3.6): the Barrowman
 * whole-vehicle CNα is the subsonic slender-body value. Above Mach 1 the fin
 * lift effectiveness degrades as 1/sqrt(M^2-1) (master spec §6.2.3 / the same
 * mechanism the drag engine uses for the supersonic CP migration); the factor
 * is clamped at 1 so the transonic branch never amplifies the subsonic value.
 */
function normalSlopeAtMach(mach: number, cna0: number): number {
  if (!Number.isFinite(mach) || mach <= 1.0) return cna0;
  return cna0 * Math.min(1.0, 1.0 / Math.sqrt(mach * mach - 1.0));
}

/** Load-level validity classification (master spec §9.3.1 flow validity).
 *  `VALID`: aero table Mach ∈ [0,4]; `EXTRAPOLATED`: 4 < M ≤ 6 (table clamped
 *  at the supersonic endpoint); `UNSUPPORTED`: M > 6. An out-of-domain load is
 *  never silently claimed nominal. */
export type LoadValidity = 'VALID' | 'EXTRAPOLATED' | 'UNSUPPORTED';

export interface FlightLoadsDetail extends Loads {
  /** Gate-3 variable-inertia derivative; the production assembly always
   *  returns it (differentiated from the production mass law). */
  inertiaDotB: Vec3;
  /** Instantaneous combined CG, meters from nose tip (contract §1.2 origin). */
  combinedCg: number;
  loadValidity: LoadValidity;
  kinematics: {
    airspeed: number;
    mach: number;
    qInf: number;
    /** Signed paired pitch incidence, deg: α = atan2(v_B,z, v_B,y) (contract §6). */
    alphaDeg: number;
    /** Signed paired yaw incidence, deg: β = atan2(v_B,x, hypot(v_B,y, v_B,z)). */
    betaDeg: number;
    /** Signed total incidence (unfolded), deg: atan2(latSpeed, v_B,y). */
    alphaTotalDeg: number;
    latSpeed: number;
    /** Wind-axis drag magnitude D = q S_eff C_D (N). */
    dragAxial: number;
    thrust: number;
    /** Effective aero center of pressure this step (m from nose tip). */
    cp: number;
    /** Effective normal-force slope used this step (/rad); 0 under recovery. */
    cna: number;
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

  // ------------------------------------------------------------------
  // Instantaneous combined CG and mass properties (audit §3.5).
  // Production mass law IS getMotorMassAt: impulse-proportional depletion
  // (m_prop(t) = m_prop,total * (1 - I(t)/I_total)) on the burn interval. The
  // body-frame origin is the instantaneous combined CG ("contract §1.2
  // body frame origin at instantaneous Center of Mass"):
  //   x_c(t) = (m_d x_d + m_m(t) x_m) / (m_d + m_m(t))
  // Both component inertias (dry body AND motor) are parallel-axis
  // translated to x_c — never to the dry baseline CG.
  // ------------------------------------------------------------------
  const mDry = pv.vehicleDryMass;
  const mMot = motorSt.currentMass;
  const mass = mDry + mMot;
  const mRad = cfg.motor.diameter / 2;
  const mLen = cfg.motor.length;
  const xMot = Math.max(0.0, pv.motorAftStationFromNose - mLen / 2); // motor centroid: half a motor length forward of the mount/vehicle aft end
  const xDry = pv.baselineCg;                            // dry vehicle CG, m from nose
  const xC = (mDry * xDry + mMot * xMot) / mass;         // instantaneous combined CG
  const dDry = xDry - xC; // signed axial offsets -> combined CG
  const dMot = xMot - xC;

  // Component inertias about their OWN centroids.
  const Ixx_mot_c = 0.5 * mMot * mRad * mRad;
  const Iyy_mot_c = (mMot * (3 * mRad * mRad + mLen * mLen)) / 12;
  // Total inertia about the instantaneous combined CG (parallel-axis on the
  // axial offset; roll-axial inertia is invariant to axial translation).
  const Ixx = pv.Ixx_dry + Ixx_mot_c;
  const Iyy = pv.Iyy_dry + mDry * dDry * dDry + Iyy_mot_c + mMot * dMot * dMot;
  const Izz = Iyy;

  // ---------------- inertiaDot from the SAME mass law -----------------
  // Differentiating the impulse-proportional depletion (master contract):
  //   dm/dt = -m_prop,total * F(t) / I_total   for 0 <= t < burnTime; 0 after
  // and, because the combined CG moves as the motor drains:
  //   d(x_c)/dt = (dm/dt) * m_d * (x_m - x_d) / (m_d + m_m)^2
  // with d_d = x_d - x_c, d_m = x_m - x_c both satisfying d(d)/dt = -d(x_c)/dt:
  //   d(m_d d_d^2)/dt = 2 m_d d_d (d_d_dot)
  //   d(m_m d_m^2)/dt = (dm/dt) d_m^2 + 2 m_m d_m (d_m_dot)
  // (the audit §3.5 factor-of-two defect came from "2 dm d^2" at CONSTANT
  //  offset — here the offset moves, so both terms of the product rule appear
  //  exactly once and the reference motion is included).
  const dmDt = getMotorMassFlowAt(cfg.motor, tStage);
  const dIyy_mot_c_dt = ((3 * mRad * mRad + mLen * mLen) / 12) * dmDt;
  const xCDot = (dmDt * mDry * (xMot - xDry)) / (mass * mass);
  const dDryDot = -xCDot;
  const dMotDot = -xCDot;
  const dIyy = dIyy_mot_c_dt + 2 * mDry * dDry * dDryDot + dmDt * dMot * dMot + 2 * mMot * dMot * dMotDot;
  const dIxx_mot_dt = 0.5 * mRad * mRad * dmDt;
  // inertias stored as {pitch, roll, yaw} in kernel convention
  const inertiaDotB = { x: dIyy, y: dIxx_mot_dt, z: dIyy };

  const R = quaternionToMatrix({ w: st.q.w, x: st.q.x, y: st.q.y, z: st.q.z });
  const wind = cfg.windOverride ?? getWindVectorAt(st.r.z, cfg.windSpeedSurface, cfg.windAzimuthDeg);
  const relWorld = { x: st.v.x - wind.x, y: st.v.y - wind.y, z: st.v.z - wind.z };
  const relBody = rotateWorldToBody(R, relWorld);
  const airspeed = Math.sqrt(relBody.x * relBody.x + relBody.y * relBody.y + relBody.z * relBody.z);
  const mach = airspeed / atmos.speedOfSound;
  const qInf = 0.5 * atmos.density * airspeed * airspeed;
  const latSpeed = Math.sqrt(relBody.x * relBody.x + relBody.z * relBody.z);
  // Certified signed PAIRED incidence (contract §6) — α about the X_B pitch
  // axis, β about the Z_B yaw axis. Never folded, never clamped.
  const alpha = Math.atan2(relBody.z, relBody.y);
  const beta = Math.atan2(relBody.x, Math.sqrt(relBody.y * relBody.y + relBody.z * relBody.z));
  const alphaTotal = Math.atan2(latSpeed, relBody.y); // unfolded incidence magnitude
  const alphaTotalDeg = (alphaTotal * 180) / Math.PI;

  const aero = aeroAtMach(mach, powered, pv);
  let cd = aero.totalCd;
  const cp = aero.cp;
  let effArea = pv.refArea;
  // Recovery is LIVE only when a canopy exists AND its deployment flag is set
  // (audit §5.4): flags alone must never suppress airframe loads on a vehicle
  // with no parachute component.
  const drogueLive = flags.drogueDeployed && pv.drogue !== undefined;
  const mainLive = flags.mainDeployed && pv.mainChute !== undefined;
  if (mainLive && pv.mainChute) {
    effArea = (Math.PI / 4) * Math.pow(pv.mainChute.diameter, 2);
    cd = pv.mainChute.cd || 1.5;
  } else if (drogueLive && pv.drogue) {
    effArea = (Math.PI / 4) * Math.pow(pv.drogue.diameter, 2);
    cd = pv.drogue.cd || 0.8;
  }
  const dragAxial = qInf * effArea * cd; // wind-axis drag magnitude (N)
  // Validity belongs to the ACTIVE aerodynamic model. Free-flight slender-
  // body loads are nominal only through M=4 and 15° total incidence; the
  // transition envelope ends at M=6 or 30°. Recovery uses the canopy drag
  // model (constant canopy CD, declared empirical, same Mach clamps), so body
  // incidence is not a validity input while a chute is live. Rail-bound
  // stages likewise exclude incidence (contact dynamics carry transverse
  // loads) but keep every other check. Non-finite kinematics fail closed:
  // NaN comparisons must never fall through to VALID — and the classifier
  // covers every state input, not just Mach/airspeed/incidence (audit §5.3:
  // nonfinite rates must not classify VALID even when the kernel later
  // rejects the resulting loads).
  const recovery = drogueLive || mainLive;
  const railBound = cfg.railBound === true;
  const incidenceForValidity = recovery || railBound ? 0 : alphaTotalDeg;
  const statesFinite =
    Number.isFinite(st.r.x) && Number.isFinite(st.r.y) && Number.isFinite(st.r.z) &&
    Number.isFinite(st.v.x) && Number.isFinite(st.v.y) && Number.isFinite(st.v.z) &&
    Number.isFinite(st.w.x) && Number.isFinite(st.w.y) && Number.isFinite(st.w.z) &&
    Number.isFinite(st.q.w) && Number.isFinite(st.q.x) && Number.isFinite(st.q.y) && Number.isFinite(st.q.z);
  let loadValidity: LoadValidity =
    !statesFinite || !Number.isFinite(mach) || !Number.isFinite(incidenceForValidity) || !Number.isFinite(airspeed)
      ? 'UNSUPPORTED'
      : mach > 6.0 || incidenceForValidity > 30.0
        ? 'UNSUPPORTED'
        : mach > 4.0 || incidenceForValidity > 15.0
          ? 'EXTRAPOLATED'
          : 'VALID';
  // Wind-axis -> body transform (audit §3.6): the COMPLETE drag vector
  //   F_D,B = -D * v_air,B / |v_air,B|
  // opposes the air-relative velocity in EVERY channel (not merely the axial
  // one), in free flight and on the parachute path alike. The body-normal
  // force (transverse plane, slender-body normal slope) is added alongside —
  // never substituted for the transverse drag components.
  let aeroBody = { x: 0.0, y: 0.0, z: 0.0 };
  let cna = 0.0;
  // Model-domain handling (audit §6B): slender-body nose-first aero is
  // undefined for DOMINANT reverse axial flow — flow coming from a cone
  // within 45° of the pure aft axis. In free flight such a load fails closed
  // at the validity flag; rail-bound reverse flow is contact regime
  // (seated/tailwind), not a free-flight model violation.
  const tailFirstFreeFlight = !recovery && !railBound && relBody.y < 0.0 && -relBody.y >= latSpeed;
  if (tailFirstFreeFlight) {
    loadValidity = 'UNSUPPORTED';
  }
  if (airspeed > 1e-6) {
    const invV = 1.0 / airspeed;
    aeroBody.x = -dragAxial * relBody.x * invV;
    aeroBody.y = -dragAxial * relBody.y * invV;
    aeroBody.z = -dragAxial * relBody.z * invV;
    // Body-normal force: transverse-plane resistance q S C_Nα sin(α_total)
    // with the vehicle AND Mach dependent slope (audit §3.6 — cna = 12 gone).
    // Free flight only, and only inside the slender-body model domain: in
    // recovery the canopy constrains the body, and in dominant reverse flow
    // the normal-force law is undefined — both suppress it (canopy-constrained
    // body / blunt-base drag only).
    if (!recovery && !tailFirstFreeFlight) {
      cna = normalSlopeAtMach(mach, pv.cna0);
      if (latSpeed > 1e-9) {
        const normalMag = qInf * pv.refArea * cna * Math.sin(alphaTotal);
        const invLat = 1.0 / latSpeed;
        aeroBody.x += -normalMag * relBody.x * invLat;
        aeroBody.z += -normalMag * relBody.z * invLat;
      }
    }
  }

  const forceBodyN = rotateBodyToWorld(R, { x: aeroBody.x, y: aeroBody.y + thrust, z: aeroBody.z });
  forceBodyN.z -= mass * 9.80665;

  // Static aero moment arm from the INSTANTANEOUS combined CG (audit §3.5) —
  // never from the dry baseline CG. Under a live recovery canopy the drag
  // acts through the suspension lines, NOT the airframe pressure center, so
  // the cp-based static moment is zero there (audit §5.4: assigning the
  // airframe CP moment to canopy drag is unphysical); rate damping remains.
  const dStatic = recovery ? 0 : cp - xC;
  const roll = st.w.y;
  const pitch = st.w.x;
  const yaw = st.w.z;
  // Damping moments scale with airspeed (q S L² ∝ V): at zero airspeed the
  // damping must vanish — no Math.max(1, airspeed) floor (audit §3.6).
  const pitchDamp = 0.5 * atmos.density * airspeed * pv.refArea * pv.totalLength * pv.totalLength * 1.5 * pitch;
  const yawDamp = 0.5 * atmos.density * airspeed * pv.refArea * pv.totalLength * pv.totalLength * 1.5 * yaw;
  // Roll damping (contract §6 convention): L_p = q S d C_lp p d / (2 V)
  // = 0.25 ρ V S d² C_lp p — V-cancelled form vanishes at V = 0.
  const clp = 4.0; // roll-damping coefficient derivative (screened empirical)
  const rollDamp = 0.25 * atmos.density * airspeed * pv.refArea * pv.rBody * pv.rBody * clp * roll;
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
    combinedCg: xC,
    loadValidity,
    kinematics: {
      airspeed,
      mach,
      qInf,
      alphaDeg: (alpha * 180) / Math.PI,
      betaDeg: (beta * 180) / Math.PI,
      alphaTotalDeg,
      latSpeed,
      dragAxial,
      thrust,
      cp,
      cna,
    },
  };
}