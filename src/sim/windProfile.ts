/**
 * Astraea Wind Profile CSV Reader (C5)
 *
 * Tolerant CSV parser for (altitude, speed, direction) wind-shear rows plus a
 * converter into the simulator's manual wind table (ManualWindTable in
 * src/sim/weather.ts).
 *
 * Conventions (must stay consistent with src/sim/weather.ts):
 *   - altitude in meters (MSL or AGL — units column optional, SI assumed),
 *   - speed in m/s,
 *   - direction METEOROLOGICAL degrees FROM north, clockwise, normalized to
 *     [0, 360).
 *
 * Tolerances: header aliases (alt/altitude/agl/z for altitude;
 * speed/wind/windSpeed/velocity for speed; dir/direction/azimuth/heading for
 * direction), an optional units column (SI values only — non-SI throws
 * rather than silently mis-scaling), comment lines starting with '#' and
 * blank lines are skipped, quoted cells accepted, and degree suffixes like
 * "270 deg" parse.
 *
 * Fails closed: missing/duplicate role columns, empty input, unparseable or
 * missing cells, negative speeds, wrong column counts, and unsupported units
 * all throw.
 */

import { ManualWindTable } from './weather';

/** One parsed CSV row, pre-conversion into the simulator layer shape. */
export interface WindProfileLayer {
  altitudeM: number;
  speedMs: number;
  directionFromDeg: number;
}

type ColumnRole = 'altitude' | 'speed' | 'direction' | 'units';

/** Header alias tables (static string keys: Record, per repo convention). */
const ALTITUDE_ALIASES: Record<string, true> = {
  alt: true,
  altitude: true,
  agl: true,
  z: true,
};

const SPEED_ALIASES: Record<string, true> = {
  speed: true,
  wind: true,
  windspeed: true,
  velocity: true,
};

const DIRECTION_ALIASES: Record<string, true> = {
  dir: true,
  direction: true,
  azimuth: true,
  heading: true,
};

const UNITS_ALIASES: Record<string, true> = {
  unit: true,
  units: true,
};

/** Recognized SI unit spellings per role (union across roles is accepted). */
const SI_UNITS_BY_ROLE: Record<ColumnRole, Record<string, true>> = {
  altitude: {
    m: true,
    meter: true,
    meters: true,
    metre: true,
    metres: true,
    asl: true,
    msl: true,
    agl: true,
    'm asl': true,
    'm msl': true,
    'm agl': true,
  },
  speed: {
    'm/s': true,
    ms: true,
    mps: true,
    'm s-1': true,
    'm.s-1': true,
    'meters per second': true,
    'metres per second': true,
  },
  direction: {
    deg: true,
    degs: true,
    degree: true,
    degrees: true,
    '°': true,
    'deg from north': true,
    'degrees from north': true,
    fromnorth: true,
    meteorological: true,
  },
  units: {},
};

/**
 * Header token normalization: strip quotes and parenthetical unit hints
 * ("altitude (m)" -> "altitude"), lowercase, drop remaining punctuation.
 */
function normalizeHeaderToken(raw: string): string {
  let token = raw.trim();
  if (token.startsWith('"') && token.endsWith('"') && token.length >= 2) {
    token = token.slice(1, -1);
  }
  token = token.replace(/\([^)]*\)/g, '');
  return token.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function columnRoleOf(token: string): ColumnRole | undefined {
  if (ALTITUDE_ALIASES[token]) return 'altitude';
  if (SPEED_ALIASES[token]) return 'speed';
  if (DIRECTION_ALIASES[token]) return 'direction';
  if (UNITS_ALIASES[token]) return 'units';
  return undefined;
}

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells.map((cell) => {
    if (cell.startsWith('"') && cell.endsWith('"') && cell.length >= 2) {
      return cell.slice(1, -1);
    }
    return cell;
  });
}

function parseNumberCell(cell: string, what: string, row: number): number {
  if (cell === '') {
    throw new Error(`wind profile CSV: row ${row} '${what}' is empty`);
  }
  const value = parseFloat(cell);
  if (!Number.isFinite(value)) {
    throw new Error(`wind profile CSV: row ${row} '${what}' is not a number (got '${cell}')`);
  }
  return value;
}

/** Meteorological direction wrap into [0, 360): 370 -> 10, -30 -> 330. */
function normalizeDirectionDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function isSupportedSiUnits(cell: string): boolean {
  const normalized = cell.trim().toLowerCase().replace(/\s+/g, ' ');
  if (normalized === '') return false;
  const parts = normalized.split(/[,;]/).map((part) => part.trim()).filter((part) => part !== '');
  if (parts.length === 0) return false;
  return parts.every((part) => {
    return (
      SI_UNITS_BY_ROLE.altitude[part] ||
      SI_UNITS_BY_ROLE.speed[part] ||
      SI_UNITS_BY_ROLE.direction[part] ||
      false
    );
  });
}

/**
 * Parses wind-shear CSV text into WindProfileLayer rows in file order.
 *
 * The first non-blank, non-comment line is the header; its columns are
 * matched case-insensitively against the documented aliases with
 * parenthetical unit hints stripped. Unknown extra columns are tolerated.
 * Rows are validated (finite altitude/speed/direction, nonnegative speed,
 * exact column count, SI units when a units column is present) and directions
 * are normalized to [0, 360). Throws on empty input, missing/duplicated role
 * columns, or any invalid row.
 */
export function parseWindProfileCsv(text: string): WindProfileLayer[] {
  if (typeof text !== 'string') {
    throw new Error('wind profile CSV: input must be a string');
  }
  const lines = text.split(/\r?\n/);

  let headerIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    headerIndex = i;
    break;
  }
  if (headerIndex < 0) {
    throw new Error('wind profile CSV: no header row found');
  }

  const headerCells = splitCsvRow(lines[headerIndex]);
  let altitudeCol = -1;
  let speedCol = -1;
  let directionCol = -1;
  let unitsCol = -1;
  for (let col = 0; col < headerCells.length; col++) {
    const role = columnRoleOf(normalizeHeaderToken(headerCells[col]));
    if (role === undefined) continue;
    if (role === 'altitude' && altitudeCol < 0) altitudeCol = col;
    else if (role === 'speed' && speedCol < 0) speedCol = col;
    else if (role === 'direction' && directionCol < 0) directionCol = col;
    else if (role === 'units' && unitsCol < 0) unitsCol = col;
    else {
      throw new Error(
        `wind profile CSV: duplicate column role '${role}' in header`
      );
    }
  }
  if (altitudeCol < 0 || speedCol < 0 || directionCol < 0) {
    throw new Error(
      'wind profile CSV: header must include altitude, speed and direction columns (aliases: alt/altitude/agl/z, speed/wind/windSpeed/velocity, dir/direction/azimuth/heading)'
    );
  }

  const layers: WindProfileLayer[] = [];
  for (let i = headerIndex + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '' || line.startsWith('#')) continue;
    const cells = splitCsvRow(line);
    if (cells.length !== headerCells.length) {
      throw new Error(
        `wind profile CSV: row ${i + 1} has ${cells.length} columns, expected ${headerCells.length}`
      );
    }
    const altitude = parseNumberCell(cells[altitudeCol], 'altitude', i + 1);
    const speed = parseNumberCell(cells[speedCol], 'speed', i + 1);
    const direction = parseNumberCell(cells[directionCol], 'direction', i + 1);
    if (speed < 0) {
      throw new Error(`wind profile CSV: row ${i + 1} 'speed' must be nonnegative (got ${speed})`);
    }
    if (unitsCol >= 0 && !isSupportedSiUnits(cells[unitsCol])) {
      throw new Error(
        `wind profile CSV: row ${i + 1} unsupported units '${cells[unitsCol]}' (SI only: m, m/s, degrees from north)`
      );
    }
    layers.push({
      altitudeM: altitude,
      speedMs: speed,
      directionFromDeg: normalizeDirectionDeg(direction),
    });
  }
  if (layers.length === 0) {
    throw new Error('wind profile CSV: no data rows found');
  }
  return layers;
}

/**
 * Converts parsed CSV layers into the simulator's ManualWindTable shape,
 * sorted ascending by altitude. Duplicate altitudes throw. Temperature and
 * pressure are filled with the same nominal sea-level reference values the
 * manual wind rows use in TrajectoryStudio — windAtAltitude never reads them.
 */
export function toManualWindTable(layers: readonly WindProfileLayer[]): ManualWindTable {
  if (layers.length === 0) {
    throw new Error('wind profile: no layers to build a manual wind table from');
  }
  const sorted = [...layers].sort((a, b) => a.altitudeM - b.altitudeM);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].altitudeM === sorted[i - 1].altitudeM) {
      throw new Error(
        `wind profile: duplicate altitude ${sorted[i].altitudeM} m in wind layers`
      );
    }
  }
  return {
    layers: sorted.map((layer) => ({
      altitudeM: layer.altitudeM,
      speedMs: layer.speedMs,
      directionFromDeg: layer.directionFromDeg,
      tempC: 15,
      pressureHpa: 1013.25,
    })),
  };
}