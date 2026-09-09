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

import { RocketVehicle } from '../core/types';
import { MotorSpec, getMotorMassAt } from '../propulsion/motorDatabase';
import { aggregateVehicleMass } from '../core/mass';
import { getAtmosphereAt } from './flightSimulator';
import { integrateRigidAdaptive, denseOutputAt, normalizeQuaternion as normQ, simOmegaToKernel, kernelOmegaToSim, Vec3, LoadsAt, RigidState } from '../dynamics/rigidBody';
import { detectEvents, EventState, NEWTON_EVENT_STATE, AstraeaEvent, EventSamplePair } from '../dynamics/events';
import { computeFlightLoads, prepareVehicle, StageKinematicState, FlightLoadsDetail } from '../dynamics/loads';

export interface Vector3D {
  x: number; // East (m)
  y: number; // North (m)
  z: number; // Up / Altitude AGL (m)
}

export interface Quaternion {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface SixDofTelemetryPoint {
  time: number;             // seconds
  position: Vector3D;       // East, North, Up (m)
  velocity: Vector3D;       // m/s in ENU navigation frame
  speed: number;            // scalar magnitude m/s
  mach: number;
  altitude: number;         // z coordinate (m AGL)
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
  terminationReason: 'touchdown' | 'timeout'; // how the loop ended (throws propagate)
  touchdownNominal: boolean;      // touchdown sequenced after apogee (abnormal impact => false)
  unsupportedHandling: 'continue-and-mark-UNKNOWN'; // preview manifest: unsupported segments continue, validity UNKNOWN, safeties closed
  landingMass: number;            // actual retained mass at landing (kg)
  flightDuration: number;         // seconds
  validity: FlightValidity;       // contract §7 exclusive four-state
  enveloped: boolean;             // within Mach ∈ [0,4] & α ≤ 30° envelope
  offNominalExcursion: boolean;   // any committed free-flight stage left VALID (drives UNKNOWN with enveloped badge coexistence resolved)
  events: SixDofEvent[];
  telemetry: SixDofTelemetryPoint[];
}

export type FlightValidity = 'PASS' | 'FAIL' | 'UNKNOWN' | 'NOT_APPLICABLE';

/**
 * Committed-root prerequisite evaluation (production event policy, Round-16
 * audit §6.2): whether the named transition's crossing predicate holds AT a
 * reconstructed root state. Chord-time simultaneity is never proof of
 * physical simultaneity — every applied tie must pass this check at the root
 * it is applied at. MOTOR_BURNOUT is time-based and handled by the caller.
 */
export function eventCrossedAtRoot(
  name: AstraeaEvent,
  root: RigidState,
  rail: { x: number; y: number; z: number },
  railLength: number,
  mainDeployAlt: number
): boolean {
  switch (name) {
    case 'RAIL_EXIT':
      return root.r.x * rail.x + root.r.y * rail.y + root.r.z * rail.z >= railLength;
    case 'APOGEE_DROGUE':
      return root.v.z <= 0;
    case 'MAIN_DEPLOY':
      return root.r.z <= mainDeployAlt;
    case 'TOUCHDOWN':
      return root.r.z <= 0;
    default:
      return false;
  }
}

/**
 * Root-order candidate selection (production event policy, Round-16 audit
 * §6.1): choose which candidate to serve from refined root times.
 * Prerequisite-free events (rail, burnout) compete by refined order; a
 * dependent transition is never served ahead of an earlier rail/burnout root.
 * Returns the index into `names` to serve explicitly.
 */
export function selectNextCandidate(
  names: readonly AstraeaEvent[],
  refinedTimes: readonly number[]
): number {
  const isFree = (n: AstraeaEvent): boolean => n === 'RAIL_EXIT' || n === 'MOTOR_BURNOUT';
  let best = 0;
  let bestTime = refinedTimes[0];
  for (let i = 1; i < names.length; i++) {
    if (!isFree(names[i])) continue;
    if (refinedTimes[i] < bestTime - 1e-9) {
      best = i;
      bestTime = refinedTimes[i];
    }
  }
  if (!isFree(names[best])) {
    // Dependent first candidate: yield to any earlier prerequisite-free root.
    for (let i = 0; i < names.length; i++) {
      if (!isFree(names[i])) continue;
      if (refinedTimes[i] < bestTime - 1e-9) return i;
    }
  }
  return best;
}

/**
 * Projected base-contact policy (production rail policy, Round-16 audit
 * §6.5): clamp a rail-bound state against the launch stop. Zero force alone
 * leaves inward velocity integrating into penetration — position projects to
 * the stop plane and inward along-rail velocity is removed.
 */
export function clampRailBaseContact(
  pos: { x: number; y: number; z: number },
  vel: { x: number; y: number; z: number },
  rail: { x: number; y: number; z: number }
): void {
  const s = pos.x * rail.x + pos.y * rail.y + pos.z * rail.z;
  if (s < 0) {
    pos.x -= rail.x * s;
    pos.y -= rail.y * s;
    pos.z -= rail.z * s;
    const vAlong = vel.x * rail.x + vel.y * rail.y + vel.z * rail.z;
    if (vAlong < 0) {
      vel.x -= rail.x * vAlong;
      vel.y -= rail.y * vAlong;
      vel.z -= rail.z * vAlong;
    }
  }
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

/**
 * Rotates a 3D vector from body frame to world frame: v_world = R * v_body
 */

/**
 * Rotates a 3D vector from world frame to body frame: v_body = R^T * v_world
 */

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

  // Production loads assembly (NORMATIVE, Gate 1r): the inline duplicate was
  // moved to src/dynamics/loads.ts. prepareVehicle caches geometry; the loads
  // assembly below (loadsAtStage) delegates to the production computeFlightLoads.
  const pv = prepareVehicle(vehicle);

  // 1. Initial State along Launch Rail
  // Rail unit vector in world coordinates (Up = +Y, East = +X, North = +Z)
  const elRad = (railElevationDeg * Math.PI) / 180;
  const azRad = (railAzimuthDeg * Math.PI) / 180;

  // ENU rail vector: x=East, y=North, z=Up
  const railVector: Vector3D = {
    x: Math.cos(elRad) * Math.sin(azRad),
    y: Math.cos(elRad) * Math.cos(azRad),
    z: Math.sin(elRad),
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
  let maxAlphaDeg = 0;
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
  // Previous-tick kinematic sample for root-localized crossing detection
  let prevSample = {
    t: 0,
    altitudeAlongRail: 0,
    verticalVelocity: 0,
    altitude: 0,
  };
  // FULL rigid-state checkpoint at prevSample.t (round-13 audit 3.7): the
  // restart engine re-integrates from this state to reconstruct the root
  // state at a localized crossing, so a transition (rail off, recovery
  // deployed, touchdown) is applied AT its crossing rather than one step late.
  let prevFullState: RigidState = {
    r: { x: 0, y: 0, z: 0 },
    v: { x: 0, y: 0, z: 0 },
    q: { ...initialQ },
    w: { x: 0, y: 0, z: 0 },
  };
  // FSM state at the bracket base (before the current bracket's transitions).
  let prevEventState: EventState = { ...NEWTON_EVENT_STATE };

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

  // Shared loads configuration (macro evaluations and the stage RHS).
  const flightCfg = {
    vehicle,
    motor,
    launchAltitudeASL,
    windSpeedSurface,
    windAzimuthDeg,
    finCantRad,
  };

  // Worst active-model validity observed at ANY stage-RHS evaluation (not
  // just macro samples): intermediate accepted-trajectory excursions into
  // EXTRAPOLATED/UNSUPPORTED must propagate into the final result.
  let sawUnsupportedLoad = false;
  let sawExtrapolatedLoad = false;

  // Adaptive stage-RHS: recompute full loads at every Dormand-Prince stage
  // from that stage's state and time. Reads the LIVE event/recovery flags, so
  // a restart integrates the remainder under post-transition dynamics. Before
  // rail exit the rail constraint is a UNILATERAL base contact (audit §6.4):
  // thrust minus gravity and drag is projected SIGNED along the rail, so the
  // vehicle may decelerate while sliding, and only the pad contact (s <= 0
  // with inward velocity AND inward force) holds the state. Rail-bound stages
  // scope incidence out of validity (contact dynamics carry transverse loads)
  // but record every other classification: the exclusion is incidence-only
  // (audit §5.3), captured on committed spans and discarded on speculative
  // reconstructions.
  const loadsAtStage: LoadsAt = (tStage, stStage) => {
    const railBound = !eventState.hasLeftRail;
    const flags = { drogueDeployed: isDrogueDeployed, mainDeployed: isMainDeployed };
    const L: FlightLoadsDetail = computeFlightLoads(tStage, stStage as StageKinematicState, flags, { ...flightCfg, railBound }, pv);
    if (L.loadValidity === 'UNSUPPORTED') sawUnsupportedLoad = true;
    else if (L.loadValidity === 'EXTRAPOLATED') sawExtrapolatedLoad = true;
    if (!eventState.hasLeftRail) {
      const railUnit: Vec3 = { x: railVector.x, y: railVector.y, z: railVector.z };
      const sAlong = stStage.r.x * railUnit.x + stStage.r.y * railUnit.y + stStage.r.z * railUnit.z;
      const vAlong = stStage.v.x * railUnit.x + stStage.v.y * railUnit.y + stStage.v.z * railUnit.z;
      const fdot = L.forceN.x * railUnit.x + L.forceN.y * railUnit.y + L.forceN.z * railUnit.z;
      if (sAlong <= 0 && vAlong <= 0 && fdot <= 0) {
        // Seated against the launch stop with inward velocity and inward
        // force: contact reaction cancels the net force; body moments stay
        // locked. Positive thrust (or outward velocity) releases the vehicle.
        return {
          forceN: { x: 0, y: 0, z: 0 },
          momentB: { x: 0, y: 0, z: 0 },
          inertiaB: L.inertiaB,
          mass: L.mass,
        };
      }
      return {
        forceN: { x: fdot * railUnit.x, y: fdot * railUnit.y, z: fdot * railUnit.z },
        momentB: { x: 0, y: 0, z: 0 },
        inertiaB: L.inertiaB,
        mass: L.mass,
      };
    }
    return L;
  };

  const adaptiveTolerances = {
    r: 1e-3,
    v: 1e-2,
    q: 1e-5,
    w: 1e-3,
  } as const;

  // Normative production advance: adaptive DP5(4), with dense output for
  // event localization. Fixed RK4 remains only as a benchmark oracle.
  const integrateState = (s: RigidState, t0: number, h: number) =>
    integrateRigidAdaptive(
      s,
      loadsAtStage,
      t0,
      t0 + h,
      adaptiveTolerances,
      Math.min(0.05, h),
      Math.min(0.005, h)
    );
  const stepState = (s: RigidState, t0: number, h: number): RigidState =>
    integrateState(s, t0, h).state;
  // Speculative reconstruction that must NOT contaminate validity: stage
  // evaluations on a duplicated pre-transition span are already recorded by
  // the full-span advance that tiled the committed trajectory (audit §5.3).
  // A throw aborts the simulation fail-closed, so plain restore suffices.
  const stepStateWithRestore = (s: RigidState, t0: number, h: number): RigidState => {
    const keepU = sawUnsupportedLoad;
    const keepE = sawExtrapolatedLoad;
    const out = stepState(s, t0, h);
    sawUnsupportedLoad = keepU;
    sawExtrapolatedLoad = keepE;
    return out;
  };

  // Sim-state parts -> kernel rigid state (component conversion, no copies).
  const toKernel = (p: Vector3D, v: Vector3D, qq: Quaternion, om: { p: number; q: number; r: number }): RigidState => ({
    r: { x: p.x, y: p.y, z: p.z },
    v: { x: v.x, y: v.y, z: v.z },
    q: { w: qq.w, x: qq.x, y: qq.y, z: qq.z },
    w: simOmegaToKernel(om),
  });

  // Refine a crossing against the SAME accepted adaptive trajectory. Dense
  // output avoids repeated sub-integrations and preserves pre-transition
  // dynamics exactly until the localized root. The reconstruction duplicates
  // an already-recorded committed span, so its stage validity is discarded.
  const refineCrossing = (
    base: RigidState,
    t0: number,
    t1: number,
    crossed: (s: RigidState) => boolean
  ): { time: number; state: RigidState } => {
    const tol = 1e-5;
    if (crossed(base)) {
      throw new Error('restart engine: crossing already satisfied at the bracket base');
    }
    const keepU = sawUnsupportedLoad;
    const keepE = sawExtrapolatedLoad;
    const path = integrateState(base, t0, t1 - t0);
    sawUnsupportedLoad = keepU;
    sawExtrapolatedLoad = keepE;
    if (!crossed(path.state)) {
      throw new Error('restart engine: crossing not bracketed by the segment end — detector mismatch');
    }
    let a = t0;
    let b = t1;
    while (b - a > tol) {
      const mid = (a + b) / 2;
      if (crossed(denseOutputAt(path.dense, mid))) b = mid;
      else a = mid;
    }
    const time = (a + b) / 2;
    return { time, state: denseOutputAt(path.dense, time) };
  };

  // Crossing predicates per event, evaluated on reconstructed trajectory
  // states (shared by root refinement, root-order competition, and
  // committed-root tie evaluation).
  const crossedFor = (name: AstraeaEvent) =>
    (s: RigidState): boolean => eventCrossedAtRoot(name, s, railVector, railLength, mainDeployAlt);

  // Single FSM transition (one-shot): the driving engine applies events one
  // at a time at their resolved roots, keeping the FSM state in lockstep.
  // The stashed pre-burnout apogee root (pendingApogee*) is the EARLIEST
  // known root across the bracket: a later detection result must never clear
  // a pending root that belongs to an event not yet applied (audit §6.1), and
  // applying APOGEE consumes it. Remainder re-detection repopulates roots
  // discovered later in the bracket. A transition applied at `appliedAt`
  // additionally invalidates carried pending roots in its future (audit
  // §6.3): they were localized under superseded pre-transition dynamics.
  const applyFsmTransition = (prev: EventState, name: AstraeaEvent, fsm: EventState, appliedAt: number): EventState => {
    const keepPrevPending = prev.pendingApogeeTime !== undefined &&
      (fsm.pendingApogeeTime === undefined || prev.pendingApogeeTime <= fsm.pendingApogeeTime);
    const pendingTime = keepPrevPending ? prev.pendingApogeeTime : fsm.pendingApogeeTime;
    const pendingAlt = keepPrevPending ? prev.pendingApogeeAlt : fsm.pendingApogeeAlt;
    const pendingSurvives = pendingTime !== undefined && pendingTime <= appliedAt + 1e-12;
    const s: EventState = {
      ...prev,
      pendingApogeeTime: pendingSurvives ? pendingTime : undefined,
      pendingApogeeAlt: pendingSurvives ? pendingAlt : undefined,
    };
    switch (name) {
      case 'RAIL_EXIT': s.hasLeftRail = true; break;
      case 'MOTOR_BURNOUT': s.hasBurnedOut = true; break;
      case 'APOGEE_DROGUE':
        s.isApogeeReached = true;
        s.pendingApogeeTime = undefined;
        s.pendingApogeeAlt = undefined;
        break;
      case 'MAIN_DEPLOY': s.isMainDeployed = true; break;
      case 'TOUCHDOWN': s.touchedDown = true; break;
      default: break;
    }
    return s;
  };

  // Event side-effects at the RECONSTRUCTED root state (round-13 audit 3.7):
  // metrics (velocity/altitude at the crossing) and recovery flags are taken
  // from the root state — never from a tick that arrived one step late, and
  // never carrying a post-crossing overshoot.
  const applyEvent = (name: AstraeaEvent, timeOf: number, root: RigidState, peak?: { time: number; alt: number }): void => {
    switch (name) {
      case 'RAIL_EXIT': {
        hasLeftRail = true;
        const scalarSpeed = Math.sqrt(root.v.x * root.v.x + root.v.y * root.v.y + root.v.z * root.v.z);
        railExitVel = scalarSpeed;
        // Initial crosswind weathercocking: production TOTAL incidence at
        // the reconstructed crossing state (rail-aligned body, wind
        // impinging). Crosswind at rail exit lies in the yaw plane, so the
        // pitch-only alphaDeg would miss it — total incidence covers any plane.
        const exitLoads = computeFlightLoads(timeOf, root as StageKinematicState, { drogueDeployed: isDrogueDeployed, mainDeployed: isMainDeployed }, flightCfg, pv);
        weathercockAngleDeg = exitLoads.kinematics.alphaTotalDeg;
        events.push({
          time: timeOf,
          name: 'Launch Rail Departure',
          altitude: root.r.z,
          velocity: scalarSpeed,
          description: `Exited ${railLength.toFixed(1)}m launch rail at ${scalarSpeed.toFixed(1)} m/s (safe threshold >= 15 m/s). Total air-relative incidence at rail exit: ${weathercockAngleDeg.toFixed(1)}°.`,
        });
        break;
      }
      case 'MOTOR_BURNOUT': {
        burnoutAlt = root.r.z;
        burnoutVel = Math.sqrt(root.v.x * root.v.x + root.v.y * root.v.y + root.v.z * root.v.z);
        const atmo = getAtmosphereAt(launchAltitudeASL + root.r.z);
        events.push({
          time: timeOf,
          name: 'Motor Burnout',
          altitude: root.r.z,
          velocity: burnoutVel,
          description: `Motor burnout at ${root.r.z.toFixed(0)}m AGL. Burnout velocity: ${burnoutVel.toFixed(0)} m/s (Mach ${(burnoutVel / atmo.speedOfSound).toFixed(2)}). Transitioning to unpowered coast.`,
        });
        break;
      }
      case 'APOGEE_DROGUE': {
        isApogeeReached = true;
        // Physical apogee metrics are separate observables from recovery
        // activation (audit §6.3): the caller passes the peak — a freshly
        // refined root, or the FSM-localized peak for stashed roots — never
        // the activation state. Activation altitude is not assigned to the
        // physical maximum.
        const peakAlt = peak?.alt ?? root.r.z;
        const peakTime = peak?.time ?? timeOf;
        maxAltitude = peakAlt;
        apogeeTime = peakTime;
        apogeePos = { x: root.r.x, y: root.r.y, z: peakAlt };
        isDrogueDeployed = true;
        // No rate reset: the drogue's drag acts through the loads assembly
        // at the next stage-RHS evaluation (momentum-conserving; the
        // parachute drag decelerates/rotates the vehicle physically).
        events.push({
          time: timeOf,
          name: 'Apogee & Drogue Deployment',
          altitude: peakAlt,
          velocity: Math.sqrt(root.v.x * root.v.x + root.v.y * root.v.y + root.v.z * root.v.z),
          description: `Apogee reached at ${peakAlt.toFixed(0)}m (${(peakAlt * 3.28084).toFixed(0)} ft) AGL. High-speed drogue parachute ejected.`,
        });
        break;
      }
      case 'MAIN_DEPLOY': {
        isMainDeployed = true;
        events.push({
          time: timeOf,
          name: 'Main Parachute Deployment',
          altitude: root.r.z,
          velocity: Math.abs(root.v.z),
          description: `Main parachute opened at ${root.r.z.toFixed(0)}m AGL. Decelerating descent for safe landing.`,
        });
        break;
      }
      case 'TOUCHDOWN': {
        const finalImpactSpeed = Math.sqrt(root.v.x * root.v.x + root.v.y * root.v.y + root.v.z * root.v.z);
        const lateralDrift = Math.sqrt(root.r.x * root.r.x + root.r.y * root.r.y);
        events.push({
          time: timeOf,
          name: 'Ground Touchdown',
          altitude: 0,
          velocity: finalImpactSpeed,
          description: `Touchdown at ${finalImpactSpeed.toFixed(1)} m/s. Total lateral wind drift: ${lateralDrift.toFixed(0)}m from pad.`,
        });
        break;
      }
      default:
        break;
    }
  };

  // Touchdown root time and sequencing: set once when the terminal transition
  // resolves. touchdownNominal is false for abnormal impact without apogee.
  let touchdownTau: number | null = null;
  let touchdownNominal = false;
  while (t < maxSimTime) {
    // =====================================================================
    // EVENT RESTART ENGINE (round-13 audit 3.7/4, Round-16 causality repair)
    // Crossings inside the bracket (prevSample.t, t] are detected by the
    // FSM, refined to roots on the pre-transition trajectory, and applied
    // EXPLICITLY in refined chronological order: the selected event applies
    // at its own root, and FSM-simultaneous ties apply only when their own
    // crossing predicate holds at the committed root state. The remainder of
    // the bracket integrates under POST-transition dynamics, then
    // re-detects. A bracket is fully resolved before any macro-step
    // integration, so the rail constraint, recovery drag, and touchdown
    // velocity cannot lag one step past their crossing.
    // =====================================================================
    let bT = prevSample.t;
    let bSample: EventSamplePair = { ...prevSample };
    let bState: RigidState = { ...prevFullState };
    let bEvent: EventState = { ...prevEventState };
    let eState: RigidState = bState;
    let earlyTerminated = false;
    let transitionsInBracket = 0;
    while (bT < t - 1e-12) {
      // Endpoint state at t on the CURRENT (pre-this-transition) trajectory:
      // the FSM brackets [bT, t] between the checkpoint and this endpoint.
      // This full-span advance tiles the committed trajectory, so its stage
      // evaluations record validity; speculative reconstructions below do not.
      eState = stepState(bState, bT, t - bT);
      const det = detectEvents(bEvent, bSample, {
        t,
        altitudeAlongRail: eState.r.x * railVector.x + eState.r.y * railVector.y + eState.r.z * railVector.z,
        railLength,
        burnTime: motor.burnTime,
        verticalVelocity: eState.v.z,
        altitude: eState.r.z,
        mainDeployAlt,
      });
      // Independent abnormal-impact terminal path (audit §6.5): ground contact
      // while descending terminates the flight even when apogee sequencing
      // never completed. The FSM touchdown requires apogee; this path does
      // not. It fires only when the FSM yields no touchdown of its own.
      const groundContact =
        !bEvent.touchedDown && bState.r.z > 0 && eState.r.z <= 0 &&
        !det.events.some((e) => e.name === 'TOUCHDOWN');
      if (det.events.length === 0) {
        // Commit detector bookkeeping through the resolved time even when no
        // event fires (audit §6.1): a pre-gate apogee root stashed in
        // det.state must survive event-free brackets, or burnout-time
        // recovery has no crossing to recover.
        bEvent = { ...det.state };
        eventState = { ...det.state }; // LIVE for the remainder's stage-RHS
        if (groundContact) {
          const ref = refineCrossing(bState, bT, t, crossedFor('TOUCHDOWN'));
          eState = { ...ref.state, r: { x: ref.state.r.x, y: ref.state.r.y, z: 0 } };
          applyEvent('TOUCHDOWN', ref.time, eState);
          bEvent = applyFsmTransition(bEvent, 'TOUCHDOWN', det.state, ref.time);
          touchdownNominal = bEvent.isApogeeReached;
          eventState = { ...bEvent };
          touchdownTau = ref.time;
          earlyTerminated = true;
          break;
        }
        break;
      }
      // Root-order competition (audit §6.1/§6.2): refine every candidate root
      // on the pre-transition trajectory, then serve them in refined order.
      // Chord-time order can reverse against true root order (nonlinear rail
      // root vs exact burnout boundary); dependent events keep FSM order
      // among themselves so deferred same-instant ties retain sequencing.
      const refinedTimes = det.events.map((evt) => {
        if (evt.name === 'MOTOR_BURNOUT') return motor.burnTime;
        if (evt.time <= bT) return evt.time;
        if (crossedFor(evt.name)(bState)) return evt.time; // deferred tie: keep FSM order
        return refineCrossing(bState, bT, t, crossedFor(evt.name)).time;
      });
      const serveIdx = selectNextCandidate(
        det.events.map((e) => e.name),
        refinedTimes
      );
      const cand = det.events[serveIdx];

      // --- refine the selected crossing root on the pre-transition path ---
      let tau: number;
      let root: RigidState;
      if (cand.time <= bT) {
        // Degenerate root at/behind the bracket base: the transition applies
        // to the bracket state directly (localizeCrossing returned t0).
        tau = bT;
        root = bState;
      } else if (cand.name === 'MOTOR_BURNOUT') {
        // Time-based transition: the crossing time IS the burn boundary.
        tau = motor.burnTime;
        root = stepStateWithRestore(bState, bT, tau - bT);
      } else {
        const ref = refineCrossing(bState, bT, t, crossedFor(cand.name));
        tau = ref.time;
        root = ref.state;
      }

      // --- apply the selected event EXPLICITLY at its root ---
      const serve = (evt: { name: AstraeaEvent; time: number }, atTau: number, atRoot: RigidState): void => {
        transitionsInBracket++;
        if (transitionsInBracket > 64) {
          throw new Error('restart engine: transition cap exceeded in one macro bracket — re-detection is not converging');
        }
        // Stashed pre-burnout roots precede the bracket base (evt.time <=
        // bT): the EVENT time is the FSM's localized root while the state is
        // the bracket base (documented approximation, audit 3.7 path).
        const evTime = evt.time <= bT ? evt.time : atTau;
        if (evt.name === 'APOGEE_DROGUE') {
          // Physical apogee metrics are separate observables from recovery
          // activation (audit §6.3): a freshly refined root IS the peak; a
          // stashed root reports the FSM-localized peak time/altitude.
          const fresh = evt.time > bT;
          const peak = fresh
            ? { time: atTau, alt: atRoot.r.z }
            : {
                time: det.state.pendingApogeeTime ?? evTime,
                alt: det.state.pendingApogeeAlt ?? atRoot.r.z,
              };
          applyEvent(evt.name, evTime, atRoot, peak);
        } else {
          applyEvent(evt.name, evTime, atRoot);
        }
        bEvent = applyFsmTransition(bEvent, evt.name, det.state, atTau);
      };
      serve(cand, tau, root);
      // --- FSM-simultaneous ties reevaluated at the COMMITTED root ---
      // Chord equality is not physical simultaneity (audit §6.2): each tied
      // candidate applies only if its own crossing predicate holds at the
      // root the selected event committed (burnout: root at/after boundary).
      for (let i = 0; i < det.events.length; i++) {
        if (i === serveIdx) continue;
        const evt = det.events[i];
        if (Math.abs(evt.time - cand.time) > 1e-12) continue; // FSM-simultaneous only
        const holds =
          evt.name === 'MOTOR_BURNOUT'
            ? tau >= motor.burnTime - 1e-12
            : eventCrossedAtRoot(evt.name, root, railVector, railLength, mainDeployAlt);
        if (holds) serve(evt, tau, root);
      }
      eventState = { ...bEvent }; // LIVE for the remainder's stage-RHS
      if (bEvent.touchedDown) {
        // Reconstructed ground state: altitude AT the crossing, no overshoot.
        // Touchdown time, final state, landing mass, telemetry, and flight
        // duration align EXACTLY at the touchdown root (audit §6.3): the
        // macro endpoint time must never stand in for the localized root.
        eState = { ...root, r: { x: root.r.x, y: root.r.y, z: 0 } };
        touchdownTau = tau;
        touchdownNominal = bEvent.isApogeeReached;
        earlyTerminated = true;
        break;
      }

      // Next bracket: from the transition root, re-resolve the remainder.
      bT = tau;
      bState = root;
      bSample = {
        t: tau,
        altitudeAlongRail: root.r.x * railVector.x + root.r.y * railVector.y + root.r.z * railVector.z,
        verticalVelocity: root.v.z,
        altitude: root.r.z,
      };
    }

    // Commit the resolved bracket-end state.
    pos.x = eState.r.x; pos.y = eState.r.y; pos.z = eState.r.z;
    vel.x = eState.v.x; vel.y = eState.v.y; vel.z = eState.v.z;
    q.w = eState.q.w; q.x = eState.q.x; q.y = eState.q.y; q.z = eState.q.z;
    const eo = kernelOmegaToSim(eState.w);
    omega.p = eo.p; omega.q = eo.q; omega.r = eo.r;

    if (earlyTerminated) break;

    // Projected base contact (audit §6.5): the stage RHS cancels inward
    // force, but committed position/velocity must not penetrate the stop.
    if (!eventState.hasLeftRail) {
      clampRailBaseContact(pos, vel, railVector);
    }
    // Physical-apogee argmax backstop (audit §6.3): committed samples only
    // climb toward the maximum; event-assigned peaks are never lowered here.
    if (!isApogeeReached && pos.z > maxAltitude) {
      maxAltitude = pos.z;
      apogeeTime = t;
      apogeePos = { x: pos.x, y: pos.y, z: pos.z };
    }

    // Production loads at the macro-step state (NORMATIVE): single source for
    // thrust/aero/moments/mass. Derives both the kernel display loads AND the
    // telemetry kinematics — no inline duplicate of the load assembly.
    const macroState: StageKinematicState = {
      r: { x: pos.x, y: pos.y, z: pos.z },
      v: { x: vel.x, y: vel.y, z: vel.z },
      q: { w: q.w, x: q.x, y: q.y, z: q.z },
      w: { x: omega.q, y: omega.p, z: omega.r }, // {pitch, roll, yaw}
    };
    const macroDetail = computeFlightLoads(t, macroState, {
      drogueDeployed: isDrogueDeployed,
      mainDeployed: isMainDeployed,
    }, flightCfg, pv);

    const airspeed = macroDetail.kinematics.airspeed;
    const mach = macroDetail.kinematics.mach;
    const qInf = macroDetail.kinematics.qInf;
    const totalAlphaDeg = macroDetail.kinematics.alphaTotalDeg;
    const dragAxial = macroDetail.kinematics.dragAxial;
    const thrustScalar = macroDetail.kinematics.thrust;
    const totalForceWorld: Vector3D = {
      x: macroDetail.forceN.x,
      y: macroDetail.forceN.y,
      z: macroDetail.forceN.z,
    };
    const totalMass = macroDetail.mass;
    if (mach > maxMach) maxMach = mach;
    if (airspeed > maxSpeed) maxSpeed = airspeed;
    // Free-flight envelope only (matches the stage-RHS validity scope):
    // rail-sit crosswind incidence is contact-dynamics regime, not aero.
    if (eventState.hasLeftRail && !isDrogueDeployed && !isMainDeployed && totalAlphaDeg > maxAlphaDeg) maxAlphaDeg = totalAlphaDeg;

    // Linear Acceleration in World Frame
    let accelWorld: Vector3D = {
      x: totalForceWorld.x / totalMass,
      y: totalForceWorld.y / totalMass,
      z: totalForceWorld.z / totalMass,
    };

    // Launch Rail Constraint (display kinematics while the FSM's RAIL_EXIT
    // has not fired): signed displacement along the rail axis, projected
    // from the rail base (pad at origin): s = dot(r - r_rail0, u_rail).
    const distanceAlongRail =
      pos.x * railVector.x + pos.y * railVector.y + pos.z * railVector.z;

    if (!eventState.hasLeftRail) {
      if (distanceAlongRail < railLength) {
        // Signed along-rail acceleration (audit §6.4): the vehicle may
        // decelerate while sliding; only the pad contact holds it.
        const forwardForce =
          totalForceWorld.x * railVector.x +
          totalForceWorld.y * railVector.y +
          totalForceWorld.z * railVector.z;
        const forwardVel =
          vel.x * railVector.x + vel.y * railVector.y + vel.z * railVector.z;
        let forwardAccel = forwardForce / totalMass;
        if (distanceAlongRail <= 0 && forwardVel <= 0 && forwardAccel <= 0) {
          forwardAccel = 0; // unilateral base contact (matches the stage RHS)
        }
        accelWorld = {
          x: forwardAccel * railVector.x,
          y: forwardAccel * railVector.y,
          z: forwardAccel * railVector.z,
        };

        // Suppress rotations on rail (display + next-step basis)
        omega = { p: 0, q: 0, r: 0 };
        q = normalizeQuaternion(initialQ);
      }
    }

    const scalarAccel = Math.sqrt(accelWorld.x * accelWorld.x + accelWorld.y * accelWorld.y + accelWorld.z * accelWorld.z);
    if (scalarAccel > maxAccel) maxAccel = scalarAccel;

    // Telemetry sampling (every 0.05s)
    if (Math.round(t / dt) % 5 === 0 || isApogeeReached || !hasLeftRail) {
      const euler = quaternionToEulerDeg(q);
      telemetry.push({
        time: parseFloat(t.toFixed(3)),
        position: { x: parseFloat(pos.x.toFixed(1)), y: parseFloat(pos.y.toFixed(1)), z: parseFloat(pos.z.toFixed(1)) },
        velocity: { x: parseFloat(vel.x.toFixed(1)), y: parseFloat(vel.y.toFixed(1)), z: parseFloat(vel.z.toFixed(1)) },
        speed: parseFloat(airspeed.toFixed(1)),
        mach: parseFloat(mach.toFixed(3)),
        altitude: parseFloat(pos.z.toFixed(1)),
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

    // Checkpoint the resolved state at t as the NEXT bracket's base.
    prevSample = {
      t,
      altitudeAlongRail: distanceAlongRail,
      verticalVelocity: vel.z,
      altitude: pos.z,
    };
    prevFullState = toKernel(pos, vel, q, omega);
    prevEventState = { ...eventState };

    // ENU identity mapping: r/v/q pass through in navigation coordinates
    // {x: East, y: North, z: Up}. Body-rate labels remain explicit:
    // omega {p=roll, q=pitch, r=yaw} <-> kernel {x=pitch, y=roll, z=yaw}.
    const kernelInState = toKernel(pos, vel, q, omega);
    const next = stepState(kernelInState, t, dt);

    // IDENTITY write-back: r/v/q propagate unchanged; body-rate label inverse
    pos.x = next.r.x; pos.y = next.r.y; pos.z = next.r.z;
    vel.x = next.v.x; vel.y = next.v.y; vel.z = next.v.z;
    q.w = next.q.w; q.x = next.q.x; q.y = next.q.y; q.z = next.q.z;
    const o = kernelOmegaToSim(next.w);
    omega.p = o.p;
    omega.q = o.q;
    omega.r = o.r;

    // NOTE: roll is integrated purely by the coupled stage-RHS (roll torque
    // from fin cant, dimensionally-correct pd/(2V) roll damping). The
    // round-13 §4 post-step roll limiter is REMOVED: its timescale
    // (I / q S r^2 C_lp) and equilibrium (p = sin(cant)/r) are dimensionally
    // wrong and it overwrote the integrator's solved angular state.


    t += dt;
  }
  // Terminal alignment (audit §6.3/§6.4): touchdown time, final state, landing
  // mass, telemetry, and flightDuration coincide EXACTLY at the touchdown
  // root — never at the later macro-bracket endpoint. The terminal telemetry
  // point is canonical FULL-PRECISION state (audit §6.4): display rounding
  // applies to presentation only. Ground z = 0 is the declared contact-state
  // projection of the dense root, not an unchanged interpolant.
  if (touchdownTau !== null) {
    t = touchdownTau;
    const touchdownLoads = computeFlightLoads(t, {
      r: { x: pos.x, y: pos.y, z: pos.z },
      v: { x: vel.x, y: vel.y, z: vel.z },
      q: { w: q.w, x: q.x, y: q.y, z: q.z },
      w: { x: omega.q, y: omega.p, z: omega.r },
    }, { drogueDeployed: isDrogueDeployed, mainDeployed: isMainDeployed }, flightCfg, pv);
    if (touchdownLoads.loadValidity === 'UNSUPPORTED') sawUnsupportedLoad = true;
    else if (touchdownLoads.loadValidity === 'EXTRAPOLATED') sawExtrapolatedLoad = true;
    const euler = quaternionToEulerDeg(q);
    const touchdownAccel = Math.sqrt(
      touchdownLoads.forceN.x * touchdownLoads.forceN.x +
      touchdownLoads.forceN.y * touchdownLoads.forceN.y +
      touchdownLoads.forceN.z * touchdownLoads.forceN.z) / touchdownLoads.mass;
    telemetry.push({
      time: t,
      position: { x: pos.x, y: pos.y, z: 0 },
      velocity: { x: vel.x, y: vel.y, z: vel.z },
      speed: touchdownLoads.kinematics.airspeed,
      mach: touchdownLoads.kinematics.mach,
      altitude: 0,
      acceleration: touchdownAccel,
      angularVelocity: { p: omega.p, q: omega.q, r: omega.r },
      angleOfAttackDeg: touchdownLoads.kinematics.alphaTotalDeg,
      pitchDeg: euler.pitchDeg,
      rollDeg: euler.rollDeg,
      yawDeg: euler.yawDeg,
      drag: touchdownLoads.kinematics.dragAxial,
      thrust: touchdownLoads.kinematics.thrust,
      mass: touchdownLoads.mass,
      dynamicPressure: touchdownLoads.kinematics.qInf,
    });
  }
  // Landing metrics: use ACTUAL retained mass at touchdown (dry vehicle +
  // remaining motor hardware), not the liftoff dry mass. Only meaningful
  // when the simulation actually terminated via touchdown (not timeout).
  const landingSpeed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);
  const motorStateAtLanding = getMotorMassAt(motor, t);
  const landingMass = vehicleDryMass + motorStateAtLanding.currentMass;
  const landingKineticEnergy = 0.5 * landingMass * Math.pow(landingSpeed, 2);
  const lateralLandingDrift = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
  const terminated = eventState.touchedDown;
  // Contract §8: continuous validated envelope M ∈ [0,4], α_total ≤ 30°.
  // Contract §7: exclusive {PASS, FAIL, UNKNOWN, NOT_APPLICABLE}.
  // Validity consumes the ACTIVE-model load validity from committed
  // trajectory segments (audit §5.3/§7): an UNSUPPORTED excursion takes
  // precedence even without termination; abnormal impact (touchdown without
  // apogee sequencing) is UNKNOWN; a supported-but-extrapolated excursion
  // (15-30° incidence, Mach 4-6) is UNKNOWN, never nominal PASS; an
  // UNSUPPORTED excursion forces every safety output closed.
  const enveloped = maxMach <= 4.0 && maxAlphaDeg <= 30.0;
  const finiteLanding = Number.isFinite(landingKineticEnergy) && Number.isFinite(landingSpeed);
  const offNominalExcursion = sawUnsupportedLoad || sawExtrapolatedLoad;
  const validity: FlightValidity =
    sawUnsupportedLoad ? 'UNKNOWN' :
    !terminated || !finiteLanding ? 'FAIL' :
    !touchdownNominal ? 'UNKNOWN' :
    offNominalExcursion || !enveloped ? 'UNKNOWN' :
    'PASS';
  const certified = validity === 'PASS';
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
    isRailExitSafe: certified && railExitVel >= 15.0,
    weathercockAngleDeg,
    landingPosition: pos,
    landingDistance: lateralLandingDrift,
    landingVelocity: landingSpeed,
    landingKineticEnergy,
    isLandingSafe: certified && terminated && landingKineticEnergy <= 20.0,
    isLandingVelocitySafe: certified && terminated && landingSpeed <= 6.0,
    terminated,
    terminationReason: terminated ? 'touchdown' : 'timeout',
    touchdownNominal: terminated ? touchdownNominal : false,
    unsupportedHandling: 'continue-and-mark-UNKNOWN',
    landingMass,
    flightDuration: t,
    validity,
    enveloped,
    offNominalExcursion,
    events,
    telemetry,
  };
}
