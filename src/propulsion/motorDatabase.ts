/**
 * Astraea Propulsion Engine & Certified Motor Database
 * Contains real RASP .eng thrust curves, propellant consumption models, and thrust interpolator.
 */

export interface ThrustPoint {
  time: number;   // seconds
  thrust: number; // Newtons
}

export interface MotorSpec {
  id: string;
  designation: string;
  manufacturer: string;
  impulseClass: string;
  diameter: number;       // meters
  length: number;         // meters
  totalImpulse: number;   // N*s
  avgThrust: number;      // N
  maxThrust: number;      // N
  burnTime: number;       // s
  propellantMass: number; // kg
  totalMass: number;      // kg (wet mass)
  dryMass: number;        // kg (casing and nozzle after burn)
  thrustCurve: ThrustPoint[];
}

export const CERTIFIED_MOTORS: Record<string, MotorSpec> = {
  estes_c6: {
    id: 'estes_c6',
    designation: 'Estes C6',
    manufacturer: 'Estes',
    impulseClass: 'C',
    diameter: 0.018,
    length: 0.070,
    totalImpulse: 8.8,
    avgThrust: 6.0,
    maxThrust: 14.2,
    burnTime: 1.86,
    propellantMass: 0.0125,
    totalMass: 0.0248,
    dryMass: 0.0123,
    thrustCurve: [
      { time: 0.0, thrust: 0.0 },
      { time: 0.08, thrust: 4.5 },
      { time: 0.18, thrust: 14.2 },
      { time: 0.28, thrust: 8.5 },
      { time: 0.50, thrust: 4.8 },
      { time: 1.00, thrust: 4.4 },
      { time: 1.50, thrust: 4.2 },
      { time: 1.86, thrust: 0.0 },
    ],
  },

  aerotech_h128w: {
    id: 'aerotech_h128w',
    designation: 'AeroTech H128W-14A',
    manufacturer: 'AeroTech',
    impulseClass: 'H',
    diameter: 0.029,
    length: 0.203,
    totalImpulse: 180.0,
    avgThrust: 128.0,
    maxThrust: 188.0,
    burnTime: 1.41,
    propellantMass: 0.098,
    totalMass: 0.214,
    dryMass: 0.116,
    thrustCurve: [
      { time: 0.0, thrust: 0.0 },
      { time: 0.05, thrust: 85.0 },
      { time: 0.12, thrust: 188.0 },
      { time: 0.30, thrust: 165.0 },
      { time: 0.60, thrust: 142.0 },
      { time: 0.90, thrust: 128.0 },
      { time: 1.20, thrust: 95.0 },
      { time: 1.41, thrust: 0.0 },
    ],
  },

  cesaroni_i205: {
    id: 'cesaroni_i205',
    designation: 'Cesaroni Pro29 3G 145-I205',
    manufacturer: 'Cesaroni (CTI)',
    impulseClass: 'I',
    diameter: 0.029,
    length: 0.285,
    totalImpulse: 382.0,
    avgThrust: 205.0,
    maxThrust: 285.0,
    burnTime: 1.86,
    propellantMass: 0.198,
    totalMass: 0.365,
    dryMass: 0.167,
    thrustCurve: [
      { time: 0.0, thrust: 0.0 },
      { time: 0.08, thrust: 150.0 },
      { time: 0.18, thrust: 285.0 },
      { time: 0.45, thrust: 245.0 },
      { time: 0.90, thrust: 215.0 },
      { time: 1.40, thrust: 185.0 },
      { time: 1.86, thrust: 0.0 },
    ],
  },

  aerotech_k550w: {
    id: 'aerotech_k550w',
    designation: 'AeroTech K550W (54mm)',
    manufacturer: 'AeroTech',
    impulseClass: 'K',
    diameter: 0.054,
    length: 0.520,
    totalImpulse: 1550.0,
    avgThrust: 550.0,
    maxThrust: 720.0,
    burnTime: 2.82,
    propellantMass: 0.810,
    totalMass: 1.580,
    dryMass: 0.770,
    thrustCurve: [
      { time: 0.0, thrust: 0.0 },
      { time: 0.08, thrust: 350.0 },
      { time: 0.20, thrust: 720.0 },
      { time: 0.60, thrust: 680.0 },
      { time: 1.20, thrust: 620.0 },
      { time: 1.80, thrust: 550.0 },
      { time: 2.40, thrust: 420.0 },
      { time: 2.82, thrust: 0.0 },
    ],
  },

  cesaroni_m1820: {
    id: 'cesaroni_m1820',
    designation: 'Cesaroni Pro75 5G M1820',
    manufacturer: 'Cesaroni (CTI)',
    impulseClass: 'M',
    diameter: 0.075,
    length: 0.750,
    totalImpulse: 5850.0,
    avgThrust: 1820.0,
    maxThrust: 2450.0,
    burnTime: 3.21,
    propellantMass: 2.850,
    totalMass: 5.120,
    dryMass: 2.270,
    thrustCurve: [
      { time: 0.0, thrust: 0.0 },
      { time: 0.10, thrust: 1100.0 },
      { time: 0.25, thrust: 2450.0 },
      { time: 0.80, thrust: 2150.0 },
      { time: 1.60, thrust: 1950.0 },
      { time: 2.40, thrust: 1750.0 },
      { time: 3.00, thrust: 1150.0 },
      { time: 3.21, thrust: 0.0 },
    ],
  },
};

/**
 * Fail-closed motor record validation (audit §5.2/§5.4): ordered finite
 * times from ignition, finite nonnegative thrust, zero thrust endpoints
 * (flow continuity), wet/dry/propellant identity, and positive geometry.
 * Invalid records throw — depletion never silently degrades to a
 * time-fraction fallback or a discontinuous jump.
 */
export function validateMotorSpec(motor: MotorSpec): void {
  const what = motor && (motor.designation || motor.id) ? `motor '${motor.designation || motor.id}'` : 'motor';
  if (!motor || typeof motor !== 'object') throw new Error(`motor validation: ${what} is not a record`);
  const pos = (v: number, name: string): void => {
    if (!Number.isFinite(v) || v <= 0) throw new Error(`motor validation: ${what} ${name} must be finite and positive (got ${v})`);
  };
  const nonNeg = (v: number, name: string): void => {
    if (!Number.isFinite(v) || v < 0) throw new Error(`motor validation: ${what} ${name} must be finite and nonnegative (got ${v})`);
  };
  pos(motor.burnTime, 'burnTime');
  pos(motor.propellantMass, 'propellantMass');
  pos(motor.diameter, 'diameter');
  pos(motor.length, 'length');
  nonNeg(motor.dryMass, 'dryMass');
  nonNeg(motor.totalMass, 'totalMass');
  nonNeg(motor.totalImpulse, 'totalImpulse');
  const wetErr = Math.abs(motor.totalMass - (motor.dryMass + motor.propellantMass));
  if (wetErr > 1e-9 * Math.max(1e-12, motor.totalMass)) {
    throw new Error(`motor validation: ${what} wet/dry/propellant identity violated (total ${motor.totalMass} vs dry+prop ${motor.dryMass + motor.propellantMass})`);
  }
  const curve = motor.thrustCurve;
  if (!Array.isArray(curve) || curve.length < 2) {
    throw new Error(`motor validation: ${what} thrust curve needs at least two points`);
  }
  for (let i = 0; i < curve.length; i++) {
    const p = curve[i];
    if (!p || !Number.isFinite(p.time) || !Number.isFinite(p.thrust) || p.thrust < 0) {
      throw new Error(`motor validation: ${what} thrust point ${i} must carry finite time and nonnegative thrust`);
    }
    if (i > 0 && !(p.time > curve[i - 1].time)) {
      throw new Error(`motor validation: ${what} thrust times must strictly increase (point ${i})`);
    }
  }
  if (curve[0].time !== 0) {
    throw new Error(`motor validation: ${what} thrust curve must start at t=0`);
  }
  if (Math.abs(curve[curve.length - 1].time - motor.burnTime) > 1e-9 * Math.max(1, motor.burnTime)) {
    throw new Error(`motor validation: ${what} thrust curve must end at burnTime`);
  }
  if (curve[0].thrust !== 0 || curve[curve.length - 1].thrust !== 0) {
    throw new Error(`motor validation: ${what} thrust curve endpoints must be zero (mass-flow continuity)`);
  }
  if (!(integrateThrustCurve(motor, motor.burnTime) > 0)) {
    throw new Error(`motor validation: ${what} thrust curve delivers no impulse`);
  }
}

/**
 * Returns instantaneous motor thrust at time t via linear interpolation
 */
export function getMotorThrustAt(motor: MotorSpec, t: number): number {
  if (t <= 0 || t >= motor.burnTime) return 0;

  const curve = motor.thrustCurve;
  if (curve.length === 0) return 0;

  for (let i = 0; i < curve.length - 1; i++) {
    const p1 = curve[i];
    const p2 = curve[i + 1];

    if (t >= p1.time && t <= p2.time) {
      const dt = p2.time - p1.time;
      if (dt <= 0) return p1.thrust;
      const factor = (t - p1.time) / dt;
      return p1.thrust + factor * (p2.thrust - p1.thrust);
    }
  }

  return 0;
}

/**
 * Authoritative total impulse (N*s) for the depletion law: the trapezoidal
 * integral of the supplied thrust curve. The certified nameplate totalImpulse
 * is retained for display and data-quality cross-checks, but depletion MUST
 * integrate the curve it differentiates. Degenerate curves throw — validated
 * motors (validateMotorSpec) always carry a positive integral, so generic
 * records cannot silently degrade to a discontinuous law (audit §5.2).
 */
export function getMotorImpulseTotal(motor: MotorSpec): number {
  const curveIntegral = integrateThrustCurve(motor, motor.burnTime);
  if (!Number.isFinite(curveIntegral) || curveIntegral <= 0) {
    throw new Error('motor depletion: thrust curve delivers no finite positive impulse — validate the motor record');
  }
  return curveIntegral;
}

/**
 * Trapezoidal integral of the piecewise-linear thrust curve over [0, t]
 * (clamped to the burn interval). The curve endpoints are zero thrust, so no
 * endpoint extrapolation is needed.
 */
export function integrateThrustCurve(motor: MotorSpec, t: number): number {
  const curve = motor.thrustCurve;
  if (!Array.isArray(curve) || curve.length < 2) return 0;
  const end = Math.min(Math.max(t, 0), motor.burnTime);
  let impulse = 0;
  for (let i = 0; i < curve.length - 1; i++) {
    const a = curve[i];
    const b = curve[i + 1];
    if (end <= a.time) break;
    const segEnd = Math.min(end, b.time);
    if (segEnd <= a.time) continue;
    const f = (segEnd - a.time) / Math.max(1e-12, b.time - a.time);
    const thrustEnd = a.thrust + f * (b.thrust - a.thrust);
    impulse += 0.5 * (a.thrust + thrustEnd) * (segEnd - a.time);
  }
  return impulse;
}

/**
 * Instantaneous propellant mass-flow rate (kg/s, nonpositive) from the
 * impulse-proportional law: dm/dt = -m_prop,total * F(t) / I_curve. Zero
 * outside the burn interval. This differentiates getMotorMassAt exactly on
 * the unsaturated interior (the denominator IS the curve integral).
 */
export function getMotorMassFlowAt(motor: MotorSpec, t: number): number {
  if (!(t >= 0) || t >= motor.burnTime) return 0;
  // getMotorImpulseTotal throws on degenerate curves: no silent linear rate.
  const total = getMotorImpulseTotal(motor);
  return -motor.propellantMass * getMotorThrustAt(motor, t) / total;
}

/**
 * Current motor mass and propellant remaining at time t (impulse-
 * proportional depletion on the curve integral: m_prop(t) = m_prop,total *
 * (1 - I(t)/I_curve)). Because I(BURN) == I_curve by construction, depletion
 * reaches exactly zero at burnout; the min/max guard is provably inactive
 * for validated curves (delivered/total stays in [0, 1]) and exists only
 * against floating-point overshoot at the boundary.
 */
export function getMotorMassAt(motor: MotorSpec, t: number): { currentMass: number; propellantRemaining: number } {
  if (t <= 0) {
    return { currentMass: motor.totalMass, propellantRemaining: motor.propellantMass };
  }

  const total = getMotorImpulseTotal(motor);
  // Curve-authoritative by construction: I(BURN) == total, so the interior
  // fraction reaches exactly zero at burnout with no clamp engagement.
  const delivered = integrateThrustCurve(motor, t);
  const propellantRemaining = motor.propellantMass * Math.min(1, Math.max(0, 1 - delivered / total));
  const currentMass = motor.dryMass + propellantRemaining;

  return { currentMass, propellantRemaining };
}
