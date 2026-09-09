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
 */
export function exportCdx1(components: RocketComponent[]): string {
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

/**
 * Exports the aerodynamic coefficient matrix as CSV for RASAero II ingestion.
 *
 * Header is exactly Mach,AoA,CD_power_off,CD_power_on,CNa,CP with one data row
 * per input row, in input order. Values are emitted verbatim (full double
 * precision), so the export round-trips the input numbers exactly.
 */
export function exportAeroMatrix(rows: AeroMatrixRow[]): string {
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