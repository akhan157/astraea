import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { BodyTubeComponent, RocketVehicle, TrapezoidFinSetComponent, TransitionComponent } from '../../core/types';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import type { Layout } from './Vehicle3D';
import {
  MATERIAL_APPEARANCE, SELECTION_COLOR, SELECTION_DIM, SELECTION_EMISSIVE, dimColor, parsePartColor, partTone,
  resolvePartAppearance, contrastRatio, selectedTone, selectionSeparation, sectionJoints, vehicleBounds,
} from './appearance';

/** Layout for the NASA preset at its documented stations (0.65 / 1.40 / 1.52 / 2.97). */
function nasaLayout(): Layout {
  const parts = {
    'nsl-nc': { start: 0, end: 0.65, cg: 0.3, mass: 1.14 },
    'nsl-bt1': { start: 0.65, end: 1.4, cg: 1.0, mass: 2.27 },
    'nsl-trans': { start: 1.4, end: 1.52, cg: 1.46, mass: 0.455 },
    'nsl-bt2': { start: 1.52, end: 2.97, cg: 2.24, mass: 4.38 },
    'nsl-fins': { start: 2.62, end: 2.94, cg: 2.81, mass: 1.18 },
  };
  return { length: 2.97, parts, radiusAt: () => 0.076, refR: 0.076 };
}

/** The preset is typed as a union, so pick a concrete member before overriding a field. */
const bodyTube = (overrides: Partial<BodyTubeComponent> = {}): BodyTubeComponent => ({
  ...(PRESET_NASA_STUDENT_LAUNCH.components.find((c) => c.id === 'nsl-bt1') as BodyTubeComponent),
  ...overrides,
});
const nosecone = () => PRESET_NASA_STUDENT_LAUNCH.components.find((c) => c.id === 'nsl-nc')!;
const transition = () => PRESET_NASA_STUDENT_LAUNCH.components.find((c) => c.id === 'nsl-trans') as TransitionComponent;
const fins = () => PRESET_NASA_STUDENT_LAUNCH.components.find((c) => c.id === 'nsl-fins') as TrapezoidFinSetComponent;

describe('part colour source order', () => {
  it('accepts design hex colours and rejects everything else', () => {
    expect(parsePartColor('#06B6D4')).toBe('#06b6d4');
    expect(parsePartColor('#0af')).toBe('#00aaff');
    expect(parsePartColor('  #18181b ')).toBe('#18181b');
    for (const bad of ['', 'red', '#12345', '#gggggg', 'rgb(1,2,3)', undefined]) expect(parsePartColor(bad)).toBeNull();
  });

  it('lets the design colour win and keeps the material finish', () => {
    const nose = resolvePartAppearance(nosecone());
    expect(nose.color).toBe('#06b6d4');
    expect(nose.clearcoat).toBe(MATERIAL_APPEARANCE.fiberglass.clearcoat);
    expect(nose.roughness).toBe(MATERIAL_APPEARANCE.fiberglass.roughness);
  });

  it('derives a tone from the material when the design has no colour', () => {
    expect(resolvePartAppearance(bodyTube({ color: undefined, materialId: 'aluminum' }))).toEqual(MATERIAL_APPEARANCE.aluminum);
    expect(resolvePartAppearance({ ...fins(), color: undefined })).toEqual(MATERIAL_APPEARANCE.carbonfiber);
  });

  it('falls back to the part type, then to a matte neutral', () => {
    expect(resolvePartAppearance(bodyTube({ color: undefined, materialId: 'unobtainium' })).color).toBe('#B7BCC2');
    const unknownTransition = resolvePartAppearance(transition());
    expect(unknownTransition.color).toBe('#71717a');
    // A malformed colour falls through to the material instead of throwing.
    expect(resolvePartAppearance({ ...nosecone(), color: 'chartreuse!' }).color).toBe(MATERIAL_APPEARANCE.fiberglass.color);
  });
});

describe('selection and hover legibility', () => {
  const tones = [
    ...Object.values(MATERIAL_APPEARANCE).map((a) => a.color),
    '#C9CDD2', '#B7BCC2', '#9AA1A9', '#8E959D', '#06b6d4', '#18181b', '#71717a', '#ef4444', '#f59e0b',
  ];

  it('keeps the selected part above 3:1 against every dimmed base tone', () => {
    // The pair the materials render: the selected part is the accent *plus* its
    // emissive lift, everything else is its tone times the focus dim.
    expect(SELECTION_DIM).toBe(0.62);
    expect(SELECTION_EMISSIVE).toBe(0.45);
    for (const tone of tones) expect(selectionSeparation(tone)).toBeGreaterThanOrEqual(3);
    // Flat, without the lift, the two palest shell tones sit just under 3:1 —
    // which is why the lift is part of the rule and not a cosmetic extra.
    expect(contrastRatio(SELECTION_COLOR, dimColor('#C3CBD3'))).toBeLessThan(3);
    expect(selectedTone()).not.toBe(SELECTION_COLOR);
  });

  it('dims only the non-selected parts, and only while something is selected', () => {
    const body = bodyTube();
    expect(partTone(body, {})).toBe('#18181b');
    // Amendment B: a hover never dims the rest of the rocket.
    expect(partTone(body, { hovered: 'nsl-fins' })).toBe('#18181b');
    expect(partTone(body, { hovered: body.id })).toBe('#18181b');
    // An empty pick (a click on nothing) is not a selection.
    expect(partTone(body, { selected: '' })).toBe('#18181b');
    expect(partTone(body, { selected: null })).toBe('#18181b');
    // With a selection, the chosen part takes the accent and the others dim.
    expect(partTone(body, { selected: 'nsl-fins' })).toBe(dimColor('#18181b'));
    expect(partTone(fins(), { selected: 'nsl-fins' })).toBe(SELECTION_COLOR);
    expect(dimColor('#18181b')).toBe('#0f0f11');
  });

  it('applies the dim in exactly one place: the shell material', () => {
    // Markers, the motor overlay and the ghost outline never route through
    // partTone, so the selection dim cannot reach them.
    const source = new TextDecoder().decode(readFileSync(new URL('./Vehicle3D.tsx', import.meta.url).pathname));
    expect(source.match(/partTone\(/g)?.length).toBe(1);
    expect(source.includes('dimColor(')).toBe(false);
    expect(source.match(/<Marker[^>]*color=\{C\.(cg|cp)\}/g)?.length).toBe(2);
    expect(source).toMatch(/<Motor [^>]*\/>/);
    expect(source).toMatch(/meshBasicMaterial color=\{C\.changed\} wireframe/);
  });
});

describe('section seams', () => {
  const layout = nasaLayout();

  it('marks exactly the three hull joints of the NASA preset', () => {
    const seams = sectionJoints(PRESET_NASA_STUDENT_LAUNCH, layout);
    expect(seams.map((s) => Number(s.station.toFixed(4)))).toEqual([0.65, 1.4, 1.52]);
    for (const seam of seams) expect(seam.radius).toBeCloseTo(0.076 * 1.004, 6);
  });

  it('skips a diameter step, a gap and a single-part vehicle', () => {
    const stepVehicle: RocketVehicle = { ...PRESET_NASA_STUDENT_LAUNCH, components: [{ ...nosecone(), baseDiameter: 0.152 } as never, bodyTube({ outerDiameter: 0.1 })] };
    const stepLayout: Layout = {
      length: 1.4, refR: 0.076,
      parts: { 'nsl-nc': { start: 0, end: 0.65, cg: 0, mass: 0 }, 'nsl-bt1': { start: 0.65, end: 1.4, cg: 0, mass: 0 } },
      radiusAt: () => 0.076,
    };
    expect(sectionJoints(stepVehicle, stepLayout)).toEqual([]);

    const gapLayout: Layout = { ...stepLayout, parts: { ...stepLayout.parts, 'nsl-bt1': { start: 0.8, end: 1.4, cg: 0, mass: 0 } } };
    expect(sectionJoints(PRESET_NASA_STUDENT_LAUNCH, gapLayout)).toEqual([]);

    const single: RocketVehicle = { ...PRESET_NASA_STUDENT_LAUNCH, components: [bodyTube()] };
    expect(sectionJoints(single, { ...layout, parts: { 'nsl-bt1': layout.parts['nsl-bt1'] } })).toEqual([]);
  });

  it('never treats a fin set as a hull joint', () => {
    const stations = sectionJoints(PRESET_NASA_STUDENT_LAUNCH, layout).map((s) => s.station);
    expect(stations.some((s) => Math.abs(s - 2.62) < 1e-6 || Math.abs(s - 2.94) < 1e-6)).toBe(false);
  });
});

describe('model bounds include the fins', () => {
  it('measures the NASA preset at its real dimensions', () => {
    const bounds = vehicleBounds(PRESET_NASA_STUDENT_LAUNCH, nasaLayout());
    expect(bounds.halfLength).toBeCloseTo(1.485, 6);
    expect(bounds.radius).toBeCloseTo(0.256, 6); // 0.076 body + 0.18 fin span
  });

  it('takes the widest hull radius when it exceeds the reference diameter', () => {
    const wide: RocketVehicle = { ...PRESET_NASA_STUDENT_LAUNCH, components: [bodyTube({ outerDiameter: 0.3 })] };
    const layout: Layout = { length: 0.75, refR: 0.076, parts: { 'nsl-bt1': { start: 0, end: 0.75, cg: 0, mass: 0 } }, radiusAt: () => 0.076 };
    expect(vehicleBounds(wide, layout).radius).toBeCloseTo(0.15, 6);
  });

  it('uses a freeform fin set’s own span', () => {
    const freeform: RocketVehicle = {
      ...PRESET_NASA_STUDENT_LAUNCH,
      components: [{
        id: 'ff', name: 'Freeform', type: 'freeformfinset', materialId: 'fiberglass', finCount: 3, thickness: 0.003,
        crossSection: 'square', axialOffset: 1, points: [{ x: 0, y: 0 }, { x: 0.2, y: 0.22 }, { x: 0.3, y: 0 }],
      }],
    };
    const layout: Layout = { length: 2, refR: 0.076, parts: { ff: { start: 1, end: 1.3, cg: 0, mass: 0 } }, radiusAt: () => 0.076 };
    expect(vehicleBounds(freeform, layout).radius).toBeCloseTo(0.296, 6);
  });
});

describe('colour helpers', () => {
  it('dim stays inside the sRGB gamut and stays ordered', () => {
    expect(dimColor('#ffffff')).toBe('#9e9e9e');
    expect(dimColor('#ffffff', 0.55)).toBe('#8c8c8c');
    expect(dimColor('#000000')).toBe('#000000');
    expect(dimColor('#06b6d4', 1)).toBe('#06b6d4');
    expect(dimColor('#06b6d4', 0)).toBe('#000000');
    expect(dimColor('not-a-colour')).toBe(dimColor('#A7ACB3'));
  });
});
