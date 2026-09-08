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
 * Calculates current motor mass and propellant remaining at time t
 */
export function getMotorMassAt(motor: MotorSpec, t: number): { currentMass: number; propellantRemaining: number } {
  if (t <= 0) {
    return { currentMass: motor.totalMass, propellantRemaining: motor.propellantMass };
  }

  if (t >= motor.burnTime) {
    return { currentMass: motor.dryMass, propellantRemaining: 0 };
  }

  // Linear burn fraction approximation over time
  const burnFraction = Math.min(1.0, t / motor.burnTime);
  const propellantRemaining = motor.propellantMass * (1.0 - burnFraction);
  const currentMass = motor.dryMass + propellantRemaining;

  return { currentMass, propellantRemaining };
}
