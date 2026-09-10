/**
 * Blueprint SVG exporter tests.
 *
 * Acceptance contract: the exported standalone SVG is a dark-CAD side view
 * with exactly one shape per outer-mold-line body component (nose cone, body
 * tube, transition, fin set), dimension labels for lengths and diameters,
 * a total-length label, and a viewBox derived from vehicle length and the
 * widest feature.
 */
import { describe, it, expect } from 'vitest';
import { exportBlueprintSvg } from './blueprint';
import { RocketVehicle, RocketComponent } from '../core/types';

function vehicle(name: string, components: RocketComponent[]): RocketVehicle {
  return { id: 'v1', name, version: '1.0', author: 'test', components };
}

const AXIAL_VEHICLE = vehicle('Test & Rocket', [
  {
    id: 'nc1',
    name: 'Ogive Nose',
    type: 'nosecone',
    shape: 'ogive',
    length: 0.16,
    baseDiameter: 0.04,
    wallThickness: 0.002,
    isHollow: true,
    materialId: 'cardboard',
  },
  {
    id: 'bt1',
    name: 'Main Tube',
    type: 'bodytube',
    length: 0.5,
    outerDiameter: 0.04,
    innerDiameter: 0.038,
    materialId: 'cardboard',
  },
  {
    id: 'tr1',
    name: 'Boat Tail',
    type: 'transition',
    length: 0.05,
    foreDiameter: 0.04,
    aftDiameter: 0.03,
    wallThickness: 0.002,
    isHollow: true,
    materialId: 'cardboard',
  },
  {
    id: 'fn1',
    name: 'Tail Fins',
    type: 'trapezoidfinset',
    finCount: 3,
    rootChord: 0.09,
    tipChord: 0.04,
    span: 0.06,
    sweepLength: 0.03,
    thickness: 0.003,
    crossSection: 'square',
    axialOffset: 0.38,
    materialId: 'balsa',
  },
]);

const shapes = (svg: string): number => (svg.match(/class="bp-shape"/g) || []).length;
const fins = (svg: string): number => (svg.match(/class="bp-fin"/g) || []).length;

describe('vehicle blueprint SVG export', () => {
  it('emits a standalone dark-CAD SVG with one shape per body component', () => {
    const svg = exportBlueprintSvg(AXIAL_VEHICLE);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('.bp-bg{fill:#0b1420}'); // dark background style
    expect(shapes(svg)).toBe(3); // nose, body, transition
    expect(fins(svg)).toBe(1); // fin set renders a single side-view fin
    expect(shapes(svg) + fins(svg)).toBe(4); // one shape per body component
    expect(svg).toContain('Test &amp; Rocket'); // title is XML-escaped
  });

  it('labels component lengths, diameters, and total length', () => {
    const svg = exportBlueprintSvg(AXIAL_VEHICLE);
    expect(svg).toContain('0.16 m'); // nose length
    expect(svg).toContain('0.50 m'); // body length
    expect(svg).toContain('0.05 m'); // transition length
    expect(svg).toContain('Ø0.040 m'); // body diameter
    expect(svg).toContain('Span 0.06 m'); // fin span
    expect(svg).toContain('Total Length: 0.71 m'); // 0.16 + 0.50 + 0.05
  });

  it('computes the viewBox from vehicle length and widest feature', () => {
    const svg = exportBlueprintSvg(AXIAL_VEHICLE);
    // 900 px length budget + 2*20 px margins; symmetric vertically around the
    // max-extent half-height (0.02 m body + 0.06 m fin span = 0.08 m).
    expect(svg).toMatch(/viewBox="-20\.00 -1\d\d\.\d+ 940\.00 2\d\d\.\d+"/);
  });

  it('renders elliptical fin sets with a span label', () => {
    const v = vehicle('Elliptical', [
      {
        id: 'nc1',
        name: 'Nose',
        type: 'nosecone',
        shape: 'conical',
        length: 0.1,
        baseDiameter: 0.04,
        wallThickness: 0.002,
        isHollow: true,
        materialId: 'cardboard',
      },
      {
        id: 'bt1',
        name: 'Body',
        type: 'bodytube',
        length: 0.4,
        outerDiameter: 0.04,
        innerDiameter: 0.038,
        materialId: 'cardboard',
      },
      {
        id: 'fn1',
        name: 'Elliptical Fins',
        type: 'ellipticalfinset',
        finCount: 3,
        rootChord: 0.08,
        span: 0.05,
        thickness: 0.003,
        axialOffset: 0.3,
        materialId: 'balsa',
      },
    ]);
    const svg = exportBlueprintSvg(v);
    expect(fins(svg)).toBe(1);
    expect(shapes(svg)).toBe(2);
    expect(svg).toContain('Span 0.05 m');
    expect(svg).toContain('Total Length: 0.50 m');
  });

  it('draws no shapes for internal mass and parachute components', () => {
    const v = vehicle('Recovery', [
      {
        id: 'nc1',
        name: 'Nose',
        type: 'nosecone',
        shape: 'ogive',
        length: 0.1,
        baseDiameter: 0.04,
        wallThickness: 0.002,
        isHollow: true,
        materialId: 'cardboard',
      },
      {
        id: 'bt1',
        name: 'Body',
        type: 'bodytube',
        length: 0.4,
        outerDiameter: 0.04,
        innerDiameter: 0.038,
        materialId: 'cardboard',
      },
      {
        id: 'pc1',
        name: 'Chute',
        type: 'parachute',
        diameter: 0.4,
        cd: 0.8,
        mass: 0.025,
        axialOffset: 0.05,
        materialId: 'cardboard',
      },
      {
        id: 'mc1',
        name: 'Payload',
        type: 'masscomponent',
        mass: 0.1,
        length: 0.03,
        axialOffset: 0.2,
        materialId: 'aluminum',
      },
    ]);
    const svg = exportBlueprintSvg(v);
    expect(shapes(svg)).toBe(2); // nose + body only
    expect(fins(svg)).toBe(0);
    expect(svg).toContain('Total Length: 0.50 m');
  });

  it('throws on empty and fin-only vehicles', () => {
    expect(() => exportBlueprintSvg(vehicle('empty', []))).toThrow();
    expect(() =>
      exportBlueprintSvg(
        vehicle('fins only', [
          {
            id: 'fn1',
            name: 'Fins',
            type: 'trapezoidfinset',
            finCount: 3,
            rootChord: 0.09,
            tipChord: 0.04,
            span: 0.06,
            sweepLength: 0.03,
            thickness: 0.003,
            crossSection: 'square',
            axialOffset: 0.0,
            materialId: 'balsa',
          },
        ]),
      ),
    ).toThrow();
  });
});