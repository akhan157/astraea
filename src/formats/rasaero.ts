/**
 * Astraea RASAero II (.cdx1) File Adapter
 * Outer-mold-line geometry export and aerodynamic matrix CSV export.
 *
 * RASAero II geometry is expressed in inches; Astraea component geometry
 * (src/core/types.ts) is stored in meters, so all OML stations are converted.
 */

import { RocketComponent } from '../core/types';

/** Meters to inches: RASAero II OML convention (1 in = 0.0254 m). */
export const METERS_TO_INCHES = 1 / 0.0254;

/** Decimal places used for inch stations in the OML export. */
export const OML_DECIMALS = 6;

export interface AeroMatrixRow {
  mach: number;
  aoaDeg: number;
  cdPowerOff: number;
  cdPowerOn: number;
  cna: number;
  cpX: number;
}

/**
 * Exports the vehicle outer mold line as plaintext RASAero II (.cdx1) stations.
 *
 * Components are consumed in assembly (nose-to-aft) order. Each component emits
 * exactly one station at its aft end, so the data-line count always equals the
 * component count: the nose tip is the implied origin (x = 0), the first
 * component is typically the nose cone and therefore emits its base station.
 *
 * Coordinates are in inches from the nose tip; diameters are in inches.
 * Comment lines start with '#'.
 *
 * Throws RangeError on non-finite or negative lengths/diameters of
 * outer-mold-line components (nose cone, body tube, transition); a negative
 * or NaN dimension would corrupt the station stream.
 */
export function exportCdx1(components: RocketComponent[]): string {
  const checkOmlDim = (dim: number, what: string, name: string) => {
    if (!Number.isFinite(dim) || dim < 0) {
      throw new RangeError(
        `exportCdx1: component '${name}' has a non-finite or negative ${what} (got ${dim})`
      );
    }
  };
  for (const component of components) {
    switch (component.type) {
      case 'nosecone':
        checkOmlDim(component.length, 'length', component.name);
        checkOmlDim(component.baseDiameter, 'base diameter', component.name);
        break;
      case 'bodytube':
        checkOmlDim(component.length, 'length', component.name);
        checkOmlDim(component.outerDiameter, 'outer diameter', component.name);
        break;
      case 'transition':
        checkOmlDim(component.length, 'length', component.name);
        checkOmlDim(component.foreDiameter, 'fore diameter', component.name);
        checkOmlDim(component.aftDiameter, 'aft diameter', component.name);
        break;
      default:
        // Fins, mass components, and parachutes co-locate on the OML and
        // never advance the station or change the running diameter.
        break;
    }
  }

  const lines = [
    '# Astraea RASAero II (.cdx1) outer mold line export',
    '# X station (inches from nose tip), Diameter (inches)',
    '# x = 0 is the nose tip; one station per component, in assembly order',
  ];

  let x = 0; // inches from nose tip
  let d = 0; // inches, running body diameter
  for (const component of components) {
    switch (component.type) {
      case 'nosecone':
        x += component.length;
        d = component.baseDiameter;
        break;
      case 'bodytube':
        x += component.length;
        d = component.outerDiameter;
        break;
      case 'transition':
        x += component.length;
        d = component.aftDiameter;
        break;
      case 'trapezoidfinset':
      case 'ellipticalfinset':
        // Fin root chord lies along the body tube: fins are co-located with
        // the airframe, so they emit a station at the current x without
        // advancing it (advancing would falsely lengthen the OML).
        break;
      case 'masscomponent':
        // Internal payload is co-located inside its tube: station without advance.
        break;
      case 'parachute':
        // Deployed canopy has no axial extent and is not part of the OML:
        // station without advance.
        break;
    }
    lines.push(
      `${(x * METERS_TO_INCHES).toFixed(OML_DECIMALS)}, ${(d * METERS_TO_INCHES).toFixed(OML_DECIMALS)}`,
    );
  }

  return lines.join('\n') + '\n';
}

/** One outer-mold-line station parsed from a .cdx1 file. */
export interface Cdx1Station {
  /** Axial station in inches from the nose tip. */
  xInches: number;
  /** Body diameter in inches at the station. */
  diameterInches: number;
}

/** Non-geometry content preserved from a .cdx1 document. */
export interface Cdx1FileMetadata {
  /** Comment lines ('#' stripped and trimmed) in file order. */
  commentLines: string[];
  /** Coordinate unit of the station stream. */
  unit: 'inches';
}

export interface Cdx1ParseResult {
  /** OML stations in file order, nose to aft. */
  stations: Cdx1Station[];
  metadata: Cdx1FileMetadata;
}

export class InvalidCdx1FileError extends Error {
  constructor(message: string) {
    super(`Invalid RASAero II (.cdx1) file: ${message}`);
    this.name = 'InvalidCdx1FileError';
  }
}

const CDX1_NUMBER_TOKEN_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/**
 * Parses a RASAero II (.cdx1) outer mold line back into OML stations plus
 * file metadata (reference/display geometry only — station rows do not
 * determine component part types, so no editable part fitting is invented
 * here; see docs/adapter-matrix.md row 8).
 *
 * Comment lines ('#'-prefixed) and blank lines are skipped anywhere in the
 * document; data rows are exactly two comma-separated numbers (station X in
 * inches from the nose tip, diameter in inches) and must be finite,
 * non-negative, and nose-to-aft non-decreasing in X — the ordering contract
 * exportCdx1 guarantees. A document with no content at all (no comment and
 * no data rows) is rejected.
 *
 * Throws InvalidCdx1FileError on malformed input.
 */
export function parseCdx1(text: string): Cdx1ParseResult {
  const lines = text.split(/\r\n|\r|\n/);
  const stations: Cdx1Station[] = [];
  const commentLines: string[] = [];
  let sawContent = false;

  const fail = (lineNo: number, detail: string): never => {
    throw new InvalidCdx1FileError(`line ${lineNo}: ${detail}`);
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const trimmed = lines[i].trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('#')) {
      commentLines.push(trimmed.slice(1).trim());
      sawContent = true;
      continue;
    }
    const parts = trimmed.split(',');
    if (parts.length !== 2) {
      fail(lineNo, `row '${trimmed}' must be exactly two comma-separated numbers (X inches, diameter inches)`);
    }
    const [xToken, dToken] = parts.map((p) => p.trim());
    for (const [what, token] of [
      ['station X', xToken],
      ['diameter', dToken],
    ] as const) {
      if (!CDX1_NUMBER_TOKEN_RE.test(token)) {
        fail(lineNo, `'${token}' is not a number (${what})`);
      }
    }
    const x = Number.parseFloat(xToken);
    const d = Number.parseFloat(dToken);
    if (!Number.isFinite(x) || !Number.isFinite(d)) {
      fail(lineNo, `station values must be finite (got x=${xToken}, diameter=${dToken})`);
    }
    if (x < 0) fail(lineNo, `station X must be non-negative (got ${xToken})`);
    if (d < 0) fail(lineNo, `diameter must be non-negative (got ${dToken})`);
    const prev = stations[stations.length - 1];
    if (prev && x < prev.xInches) {
      fail(lineNo, `station X ${xToken} precedes ${prev.xInches} — stations must be non-decreasing nose-to-aft`);
    }
    stations.push({ xInches: x, diameterInches: d });
    sawContent = true;
  }

  if (!sawContent) {
    throw new InvalidCdx1FileError('no OML station or comment content found');
  }

  return { stations, metadata: { commentLines, unit: 'inches' } };
}

/**
 * Exports the aerodynamic coefficient matrix as CSV for RASAero II ingestion.
 *
 * Header is exactly Mach,AoA,CD_power_off,CD_power_on,CNa,CP with one data row
 * per input row, in input order. Values are emitted verbatim (full double
 * precision), so the export round-trips the input numbers exactly.
 *
 * Throws RangeError on any non-finite matrix cell (NaN or ±Inf would emit
 * a CSV that RASAero II cannot parse).
 */
export function exportAeroMatrix(rows: AeroMatrixRow[]): string {
  for (const row of rows) {
    for (const [name, value] of [
      ['Mach', row.mach],
      ['AoA', row.aoaDeg],
      ['CD_power_off', row.cdPowerOff],
      ['CD_power_on', row.cdPowerOn],
      ['CNa', row.cna],
      ['CP', row.cpX],
    ] as const) {
      if (!Number.isFinite(value)) {
        throw new RangeError(`exportAeroMatrix: ${name} must be finite (got ${value})`);
      }
    }
  }
  const lines = ['Mach,AoA,CD_power_off,CD_power_on,CNa,CP'];
  for (const row of rows) {
    lines.push(
      [
        row.mach,
        row.aoaDeg,
        row.cdPowerOff,
        row.cdPowerOn,
        row.cna,
        row.cpX,
      ].join(','),
    );
  }
  return lines.join('\n') + '\n';
}