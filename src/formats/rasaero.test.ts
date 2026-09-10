import { describe, it, expect } from 'vitest';
import { exportCdx1, exportAeroMatrix, METERS_TO_INCHES } from './rasaero';
import {
  RocketComponent,
  NoseconeComponent,
  BodyTubeComponent,
  TransitionComponent,
  TrapezoidFinSetComponent,
} from '../core/types';

/** Parses non-comment OML data rows back into numeric [xInches, dInches] pairs. */
function parseStations(cdx1: string): Array<[number, number]> {
  return cdx1
    .split('\n')
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => {
      const [x, d] = line.split(',').map((part) => Number.parseFloat(part));
      return [x, d] as [number, number];
    });
}

function fixtureComponents(): RocketComponent[] {
  return [
    {
      id: 'nose',
      name: 'Ogive Nose',
      type: 'nosecone',
      materialId: 'fiberglass',
      shape: 'ogive',
      length: 0.3,
      baseDiameter: 0.06,
      wallThickness: 0.002,
      isHollow: true,
    },
    {
      id: 'tube',
      name: 'Main Tube',
      type: 'bodytube',
      materialId: 'cardboard',
      length: 0.6,
      outerDiameter: 0.06,
      innerDiameter: 0.056,
    },
    {
      id: 'boat',
      name: 'Boattail',
      type: 'transition',
      materialId: 'fiberglass',
      length: 0.15,
      foreDiameter: 0.06,
      aftDiameter: 0.04,
      wallThickness: 0.002,
      isHollow: true,
    },
    {
      id: 'fins',
      name: 'Tail Fins',
      type: 'trapezoidfinset',
      materialId: 'balsa',
      finCount: 4,
      rootChord: 0.09,
      tipChord: 0.04,
      span: 0.05,
      sweepLength: 0.03,
      thickness: 0.003,
      crossSection: 'square',
      axialOffset: 0.45,
    },
    {
      id: 'payload',
      name: 'Altimeter Sled',
      type: 'masscomponent',
      materialId: 'aluminum',
      mass: 0.1,
      length: 0.12,
      axialOffset: 0.1,
    },
    {
      id: 'chute',
      name: 'Drogue',
      type: 'parachute',
      materialId: 'nylon',
      diameter: 0.4,
      cd: 0.8,
      mass: 0.025,
      axialOffset: 0.2,
    },
  ];
}

describe('RASAero II (.cdx1) Outer Mold Line Exporter', () => {
  it('round-trips station count against component count', () => {
    const components = fixtureComponents();
    const cdx1 = exportCdx1(components);

    const stations = parseStations(cdx1);
    expect(stations.length).toBe(components.length);

    const commentLines = cdx1
      .split('\n')
      .filter((line) => line.length > 0 && line.startsWith('#'));
    expect(commentLines.length).toBeGreaterThan(0);
  });

  it('emits stations in inches from the nose tip, one per component', () => {
    const cdx1 = exportCdx1(fixtureComponents());
    const stations = parseStations(cdx1);

    // Co-located items (fins, internal payload, parachute) emit stations
    // without advancing x, so total OML length stays exact.
    const expected = [
      [0.3, 0.06],
      [0.9, 0.06],
      [1.05, 0.04],
      [1.05, 0.04],
      [1.05, 0.04],
      [1.05, 0.04],
    ].map(([xM, dM]) => [xM * METERS_TO_INCHES, dM * METERS_TO_INCHES] as [number, number]);

    expect(stations.length).toBe(expected.length);
    stations.forEach(([x, d], i) => {
      expect(x).toBeCloseTo(expected[i][0], 4);
      expect(d).toBeCloseTo(expected[i][1], 4);
    });
    // Axial stations are strictly non-decreasing.
    for (let i = 1; i < stations.length; i++) {
      expect(stations[i][0]).toBeGreaterThanOrEqual(stations[i - 1][0]);
    }
  });

  it('emits only header comments for an empty component list', () => {
    const cdx1 = exportCdx1([]);
    expect(parseStations(cdx1).length).toBe(0);
    expect(cdx1.trim().split('\n').every((line) => line.startsWith('#'))).toBe(true);
  });

  it('throws on non-finite or negative OML lengths and diameters', () => {
    const badNose = fixtureComponents();
    badNose[0] = { ...(badNose[0] as NoseconeComponent), length: Number.NaN };
    expect(() => exportCdx1(badNose)).toThrow(/non-finite or negative/);

    const badTube = fixtureComponents();
    badTube[1] = { ...(badTube[1] as BodyTubeComponent), outerDiameter: Number.POSITIVE_INFINITY };
    expect(() => exportCdx1(badTube)).toThrow(/non-finite or negative/);

    const badTransition = fixtureComponents();
    badTransition[2] = { ...(badTransition[2] as TransitionComponent), foreDiameter: -0.02 };
    expect(() => exportCdx1(badTransition)).toThrow(/non-finite or negative/);

    const badNoseDia = fixtureComponents();
    badNoseDia[0] = { ...(badNoseDia[0] as NoseconeComponent), baseDiameter: Number.NEGATIVE_INFINITY };
    expect(() => exportCdx1(badNoseDia)).toThrow(/non-finite or negative/);
  });

  it('ignores co-located non-OML dimensions (fins, mass, parachute)', () => {
    const components = fixtureComponents();
    // Fin root chord and mass length never enter the OML station stream.
    components[3] = { ...(components[3] as TrapezoidFinSetComponent), rootChord: -0.09 };
    components[4] = { ...(components[4] as NoseconeComponent), length: Number.NaN };
    const stations = parseStations(exportCdx1(components));
    expect(stations).toHaveLength(components.length);
    for (const [, d] of stations) {
      expect(Number.isFinite(d)).toBe(true);
    }
  });
});

describe('RASAero II Aerodynamic Matrix (.csv) Exporter', () => {
  const rows = [
    { mach: 0.3, aoaDeg: 0, cdPowerOff: 0.42, cdPowerOn: 0.45, cna: 3.1, cpX: 0.62 },
    { mach: 0.8, aoaDeg: 5, cdPowerOff: 0.55, cdPowerOn: 0.58, cna: 3.4, cpX: 0.6 },
    { mach: 1.5, aoaDeg: 10, cdPowerOff: 0.71, cdPowerOn: 0.74, cna: 3.2, cpX: 0.55 },
  ];

  it('emits the exact header and one data row per input row', () => {
    const csv = exportAeroMatrix(rows);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('Mach,AoA,CD_power_off,CD_power_on,CNa,CP');
    expect(lines.length).toBe(rows.length + 1);
  });

  it('round-trips every numeric value in row order', () => {
    const csv = exportAeroMatrix(rows);
    const dataLines = csv.trim().split('\n').slice(1);
    expect(dataLines.length).toBe(rows.length);
    dataLines.forEach((line, i) => {
      const values = line.split(',').map((v) => Number.parseFloat(v));
      const expected = [
        rows[i].mach,
        rows[i].aoaDeg,
        rows[i].cdPowerOff,
        rows[i].cdPowerOn,
        rows[i].cna,
        rows[i].cpX,
      ];
      values.forEach((value, j) => expect(value).toBeCloseTo(expected[j], 10));
    });
  });

  it('emits only the header for an empty row list', () => {
    const csv = exportAeroMatrix([]);
    expect(csv.trim()).toBe('Mach,AoA,CD_power_off,CD_power_on,CNa,CP');
  });

  it('throws on non-finite matrix cells', () => {
    const bad = [
      { ...rows[0], mach: Number.NaN },
      { ...rows[0], aoaDeg: Number.POSITIVE_INFINITY },
      { ...rows[0], cdPowerOff: Number.NaN },
      { ...rows[0], cdPowerOn: Number.NEGATIVE_INFINITY },
      { ...rows[0], cna: Number.NaN },
      { ...rows[0], cpX: Number.NaN },
    ];
    for (const row of bad) {
      expect(() => exportAeroMatrix([row])).toThrow(/must be finite/);
    }
  });
});
