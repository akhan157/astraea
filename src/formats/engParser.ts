/**
 * Astraea Rocket Motor File Adapters
 * RASP .eng thrust-curve parsing and RockSim .rse XML motor extraction.
 *
 * Both adapters DERIVE totalImpulse, avgThrust, maxThrust, and burnTime from
 * the tabulated thrust curve (trapezoidal integral / curve extrema). Header or
 * nameplate numbers beyond the identifier are never trusted for dynamics: the
 * .eng header's impulse/avg/peak columns are ignored, and the .rse
 * burn-time/avg-thrust/peak-thrust fields are treated as display data only.
 * Geometry and mass ARE taken from the file (mm -> m, g -> kg) and the record
 * is fail-closed validated via validateMotorSpec.
 */

import { XMLParser } from 'fast-xml-parser';
import {
  MotorSpec,
  ThrustPoint,
  validateMotorSpec,
  integrateThrustCurve,
  normalizeMotorId,
  impulseClassFor,
} from '../propulsion/motorDatabase';

export class InvalidRaspEngError extends Error {
  constructor(message: string) {
    super(`Invalid RASP .eng motor file: ${message}`);
    this.name = 'InvalidRaspEngError';
  }
}

export class InvalidRseFileError extends Error {
  constructor(message: string) {
    super(`Invalid RockSim .rse motor file: ${message}`);
    this.name = 'InvalidRseFileError';
  }
}

/** SI units carried between the raw-file layer and the motor-record finalizer. */
interface MotorParts {
  designation: string;
  manufacturer: string;
  diameter: number;      // meters
  length: number;        // meters
  propellantMass: number; // kg
  totalMass: number;     // kg
  points: ThrustPoint[];
}

type ErrorCtor = new (message: string) => Error;

/** Strict numeric token test: rejects partial parses like "8.8-6.06-14.2". */
function isNumberToken(token: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token);
}

/**
 * Shared curve sanity checks shared by both adapters: at least two points,
 * ignition at t=0, strictly increasing finite times, finite nonnegative
 * thrust, and zero-thrust endpoints (validateMotorSpec also requires these —
 * this layer produces the file-specific error class and message).
 */
function checkCurve(points: ThrustPoint[], Err: ErrorCtor): void {
  if (points.length < 2) {
    throw new Err('thrust curve needs at least two points');
  }
  if (points[0].time !== 0) {
    throw new Err('thrust curve must start at t=0');
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (!Number.isFinite(p.time) || !Number.isFinite(p.thrust) || p.thrust < 0) {
      throw new Err(`thrust point ${i} must carry finite time and nonnegative thrust`);
    }
    if (i > 0 && !(p.time > points[i - 1].time)) {
      throw new Err(`thrust times must strictly increase (point ${i})`);
    }
  }
  if (points[0].thrust !== 0 || points[points.length - 1].thrust !== 0) {
    throw new Err('thrust curve endpoints must be zero');
  }
  if (points[points.length - 1].time <= 0) {
    throw new Err('thrust curve must extend past t=0');
  }
}

/**
 * Builds the final MotorSpec from file-extracted parts. All impulse metrics
 * come from the curve: the trapezoidal integral (the same law depletion uses)
 * for totalImpulse, integral/burnTime for avgThrust, curve peak for maxThrust,
 * and the final curve time for burnTime. The record is then fail-closed
 * validated; validation failures (e.g. degenerate zero-impulse curves) surface
 * as the adapter's own error class with the validator's detail.
 */
function buildMotorSpec(parts: MotorParts, Err: ErrorCtor): MotorSpec {
  checkCurve(parts.points, Err);

  const motor: MotorSpec = {
    id: normalizeMotorId(parts.designation),
    designation: parts.designation,
    manufacturer: parts.manufacturer,
    impulseClass: '?',
    diameter: parts.diameter,
    length: parts.length,
    totalImpulse: 0,
    avgThrust: 0,
    maxThrust: 0,
    burnTime: parts.points[parts.points.length - 1].time,
    propellantMass: parts.propellantMass,
    totalMass: parts.totalMass,
    dryMass: parts.totalMass - parts.propellantMass,
    thrustCurve: parts.points,
  };

  const totalImpulse = integrateThrustCurve(motor, motor.burnTime);
  motor.totalImpulse = totalImpulse;
  motor.avgThrust = totalImpulse / motor.burnTime;
  motor.maxThrust = Math.max(...parts.points.map((p) => p.thrust));
  motor.impulseClass = impulseClassFor(totalImpulse);

  try {
    validateMotorSpec(motor);
  } catch (err) {
    throw new Err(`curve fails motor validation: ${(err as Error).message}`);
  }
  return motor;
}

/**
 * Parses a RASP .eng motor file (ThrustCurve/RASP88 layout).
 *
 * The header line is "<designation> <dia mm> <len mm> ... <prop mass kg>
 * <total mass kg>" with every non-identifier column in between (impulse, avg
 * thrust, peak thrust) ignored: only designation, geometry, and the two masses
 * are trusted from the header — impulse metrics come from the thrust curve.
 * Lines starting with ';' or '#' are comments; blank lines are skipped. Each
 * remaining line carries one or more "<time> <thrust>" pairs, SI seconds and
 * Newtons.
 */
export function parseRaspEng(text: string): MotorSpec {
  if (typeof text !== 'string') {
    throw new InvalidRaspEngError('input must be a string');
  }
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith(';') && !l.startsWith('#'));
  if (lines.length === 0) {
    throw new InvalidRaspEngError('no data lines (empty file or comments only)');
  }

  // Header: leading non-numeric tokens form the designation; numeric tokens
  // are [dia(mm), len(mm), ..., propMass(kg), totalMass(kg)] — intermediate
  // numbers (nameplate impulse/avg/peak) are deliberately ignored.
  const headerTokens = lines[0].split(/\s+/);
  const numericTokens = headerTokens.filter(isNumberToken);
  if (numericTokens.length < 4) {
    throw new InvalidRaspEngError(
      `header line needs at least 4 numbers (diameter mm, length mm, propellant mass kg, total mass kg); got ${numericTokens.length}`,
    );
  }
  const firstNumericIndex = headerTokens.indexOf(numericTokens[0]);
  const designation = headerTokens.slice(0, firstNumericIndex).join(' ').trim() || 'Unnamed Motor';

  const diameterMm = Number(numericTokens[0]);
  const lengthMm = Number(numericTokens[1]);
  const propellantMass = Number(numericTokens[numericTokens.length - 2]);
  const totalMass = Number(numericTokens[numericTokens.length - 1]);
  if (!(diameterMm > 0) || !(lengthMm > 0)) {
    throw new InvalidRaspEngError('diameter and length must be positive');
  }
  if (!(propellantMass > 0) || !(totalMass >= propellantMass)) {
    throw new InvalidRaspEngError('propellant mass must be positive and not exceed total mass');
  }

  const points: ThrustPoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const nums = lines[i].split(/\s+/).filter(isNumberToken).map(Number);
    if (nums.length === 0) {
      throw new InvalidRaspEngError(`thrust line ${i + 1} carries no numeric time/thrust pairs`);
    }
    if (nums.length % 2 !== 0) {
      throw new InvalidRaspEngError(`thrust line ${i + 1} has an odd number of values`);
    }
    for (let j = 0; j < nums.length; j += 2) {
      points.push({ time: nums[j], thrust: nums[j + 1] });
    }
  }

  return buildMotorSpec(
    {
      designation,
      manufacturer: 'RASP Import',
      diameter: diameterMm / 1000,
      length: lengthMm / 1000,
      propellantMass,
      totalMass,
      points,
    },
    InvalidRaspEngError,
  );
}

/**
 * Exports a validated MotorSpec as RASP .eng text in the exact dialect
 * parseRaspEng accepts (bidirectional round-trip contract). Header order:
 * designation, diameter (mm), length (mm), then the three nameplate impulse
 * columns (which the parser deliberately ignores — the curve stays the only
 * authority), then propellant and total mass (kg). Numeric tokens are emitted
 * as shortest round-trip strings, so the tabulated curve — and every metric
 * derived from it — is recovered exactly on re-import. Bare-number designation
 * tokens are dropped: the RASP name column cannot carry them without shifting
 * the geometry/mass columns.
 *
 * Fail-closed: the record is validateMotorSpec-gated first — this emitter
 * never produces a file the parser (or its validator) would reject.
 */
export function exportToEng(motor: MotorSpec): string {
  validateMotorSpec(motor);

  const number = (v: number): string => String(v);
  const designationTokens = motor.designation.trim().split(/\s+/).filter((t) => !isNumberToken(t));
  const designation = designationTokens.join(' ') || 'Unnamed Motor';
  const header = [
    designation,
    number(motor.diameter * 1000),
    number(motor.length * 1000),
    number(motor.totalImpulse),
    number(motor.avgThrust),
    number(motor.maxThrust),
    number(motor.propellantMass),
    number(motor.totalMass),
  ].join(' ');
  const curveLines = motor.thrustCurve.map((p) => `${number(p.time)} ${number(p.thrust)}`);
  return [header, ...curveLines, ''].join('\n');
}

/** Reads a scalar field by any of several spellings (kebab/camel/lowercase). */
function readField(node: Record<string, unknown>, ...names: string[]): unknown {
  for (const name of names) {
    const want = name.toLowerCase().replace(/[-_]/g, '');
    const key = Object.keys(node).find((k) => k.toLowerCase().replace(/[-_]/g, '') === want);
    if (key !== undefined) {
      const v = node[key];
      if (v !== undefined && v !== null && v !== '') return v;
    }
  }
  return undefined;
}

function asNumber(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/** Recursively harvests {time, thrust} records from the <data> tree. */
function collectDataPoints(node: unknown, out: ThrustPoint[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectDataPoints(item, out);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  const time = asNumber(rec.time);
  const thrust = asNumber(rec.thrust);
  if (time !== undefined && thrust !== undefined) {
    out.push({ time, thrust });
    return;
  }
  for (const val of Object.values(rec)) collectDataPoints(val, out);
}

/**
 * Parses a RockSim .rse motor file (XML).
 *
 * Expected layout: <rocket-engine-data> with <manufacturer>, <code>,
 * <diameter> (mm), <length> (mm), <init-weight> (g), <prop-weight> (g) and a
 * <data> block of <data-point> entries carrying <time> (s) and <thrust> (N).
 * Tag spellings are normalized (kebab/camel both accepted); burn-time, avg-
 * thrust, and peak-thrust fields are display data only — impulse metrics are
 * derived from the curve, exactly as in the .eng adapter.
 */
export function parseRseXml(text: string): MotorSpec {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new InvalidRseFileError('input must be a non-empty string');
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = new XMLParser({ ignoreAttributes: true }).parse(text);
  } catch (err) {
    throw new InvalidRseFileError(`XML parse failed: ${(err as Error).message}`);
  }

  const root = (parsed['rocket-engine-data'] ?? parsed) as Record<string, unknown> | undefined;
  if (!root || typeof root !== 'object') {
    throw new InvalidRseFileError('missing <rocket-engine-data> root element');
  }
  const node = root as Record<string, unknown>;

  const manufacturer = String(readField(node, 'manufacturer') ?? 'Unknown').trim();
  const code = String(readField(node, 'code') ?? '').trim();
  const designation =
    [manufacturer !== 'Unknown' && manufacturer !== '' ? manufacturer : null, code]
      .filter((s): s is string => !!s)
      .join(' ')
      .trim() || 'Unnamed Motor';

  const diameterMm = asNumber(readField(node, 'diameter'));
  const lengthMm = asNumber(readField(node, 'length'));
  const initWeightG = asNumber(readField(node, 'init-weight', 'initweight', 'total-mass', 'totalmass'));
  const propWeightG = asNumber(readField(node, 'prop-weight', 'propweight', 'propellant-weight'));
  if (diameterMm === undefined || lengthMm === undefined || !(diameterMm > 0) || !(lengthMm > 0)) {
    throw new InvalidRseFileError('diameter and length must be present and positive (mm)');
  }
  if (initWeightG === undefined || propWeightG === undefined || !(propWeightG > 0) || !(initWeightG >= propWeightG)) {
    throw new InvalidRseFileError('init-weight and prop-weight must be present, positive, and ordered (g)');
  }

  const points: ThrustPoint[] = [];
  collectDataPoints(readField(node, 'data'), points);

  return buildMotorSpec(
    {
      designation,
      manufacturer,
      diameter: diameterMm / 1000,
      length: lengthMm / 1000,
      propellantMass: propWeightG / 1000,
      totalMass: initWeightG / 1000,
      points,
    },
    InvalidRseFileError,
  );
}