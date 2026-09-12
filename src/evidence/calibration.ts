/**
 * Drag-coefficient calibration from coast-phase flight data.
 *
 * Regression model: drag force D = 0.5 * rho * v^2 * A * Cd, fit by ordinary
 * least squares (through the origin) against the measured drag force
 * D_measured = mass * |accel| at each coast point.
 */

/** One sampled point of the unpowered coast phase. */
export interface CoastPoint {
  velocityMs: number;
  /** Air density, kg/m^3. */
  density: number;
  /** Instantaneous rocket mass, kg. */
  massKg: number;
  /** Reference (cross-sectional) area, m^2. */
  refAreaM2: number;
  /** Measured deceleration magnitude, m/s^2 (positive number). */
  accelMs2: number;
}

export interface CalibrationResult {
  /** Fitted effective drag coefficient, dimensionless. */
  cdCalibrated: number;
  /** Root-mean-square drag-force residual over usable points, N. */
  rmse: number;
}

/** Coast points below this speed are unreliable for drag fitting. */
export const MIN_VELOCITY_MS = 5;

/**
 * Fit the effective drag coefficient to coast-phase measurements.
 *
 * Points with velocityMs < MIN_VELOCITY_MS are rejected (drag is tiny there
 * and deceleration measurements are dominated by sensor noise).
 *
 * Throws on invalid input data: non-finite velocityMs, non-finite or
 * non-positive density/massKg/refAreaM2, non-finite or negative accelMs2, or
 * all-zero accelerometer readings (sensor-dead guard). Throws if no usable
 * points remain, or if the accumulated dynamic-pressure term is non-finite.
 */
export function calibrateCd(coastSegments: readonly CoastPoint[]): CalibrationResult {
  // Validate every input point before fitting: a NaN/Infinity density or a
  // dead accelerometer would silently poison the least-squares fit.
  let anyAccelNonZero = false;
  for (const p of coastSegments) {
    if (!Number.isFinite(p.velocityMs)) {
      throw new Error(`calibrateCd: velocityMs must be a finite number (got ${p.velocityMs})`);
    }
    if (!Number.isFinite(p.density) || !(p.density > 0)) {
      throw new Error(`calibrateCd: density must be a positive finite number (got ${p.density})`);
    }
    if (!Number.isFinite(p.massKg) || !(p.massKg > 0)) {
      throw new Error(`calibrateCd: massKg must be a positive finite number (got ${p.massKg})`);
    }
    if (!Number.isFinite(p.refAreaM2) || !(p.refAreaM2 > 0)) {
      throw new Error(`calibrateCd: refAreaM2 must be a positive finite number (got ${p.refAreaM2})`);
    }
    if (!Number.isFinite(p.accelMs2) || p.accelMs2 < 0) {
      throw new Error(`calibrateCd: accelMs2 must be a finite non-negative number (got ${p.accelMs2})`);
    }
    if (p.accelMs2 !== 0) {
      anyAccelNonZero = true;
    }
  }
  if (coastSegments.length > 0 && !anyAccelNonZero) {
    throw new Error('calibrateCd: all accelerometer readings are zero (sensor-dead guard)');
  }

  const usable: CoastPoint[] = [];
  for (const p of coastSegments) {
    if (p.velocityMs >= MIN_VELOCITY_MS) {
      usable.push(p);
    }
  }

  if (usable.length < 3) {
    throw new Error(`calibrateCd: need at least 3 usable coast points (got ${usable.length})`);
  }

  // Least squares through the origin: minimize sum (y_i - x_i * Cd)^2 where
  // x_i = q_i * A_i (dynamic-pressure term), y_i = m_i * |a_i| (drag force).
  let sumXX = 0;
  let sumXY = 0;
  for (const p of usable) {
    const x = dynamicPressureTerm(p);
    const y = Math.abs(p.accelMs2) * p.massKg;
    sumXX += x * x;
    sumXY += x * y;
  }

  if (!Number.isFinite(sumXX)) {
    throw new Error(
      'calibrateCd: non-finite dynamic-pressure sum (input magnitudes overflow the fit)',
    );
  }
  if (!(sumXX > 0)) {
    throw new Error('calibrateCd: degenerate coast points (zero dynamic-pressure term)');
  }

  const cd = sumXY / sumXX;

  let sumSquaredError = 0;
  for (const p of usable) {
    const x = dynamicPressureTerm(p);
    const y = Math.abs(p.accelMs2) * p.massKg;
    const residual = y - x * cd;
    sumSquaredError += residual * residual;
  }

  return {
    cdCalibrated: cd,
    rmse: Math.sqrt(sumSquaredError / usable.length),
  };
}

/** 0.5 * rho * v^2 * A — the dynamic-pressure term multiplying Cd. */
function dynamicPressureTerm(p: CoastPoint): number {
  return 0.5 * p.density * p.velocityMs * p.velocityMs * p.refAreaM2;
}