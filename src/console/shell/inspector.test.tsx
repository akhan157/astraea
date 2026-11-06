/**
 * Inspector contract for the Airframe area: the motor-mount toggle on any
 * body tube, the solid-mount inner-diameter sentinel (exactly 0 m), and the
 * physics readout's tolerance of a Rust `null` CP/CNa.
 *
 * Ported from `components/PropertyInspector.test.tsx`.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { Tooltip } from 'radix-ui';
import { PartInspector } from './Inspector';
import { adoptProject, effectiveVehicle, useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { designOf } from '../design';
import { createProjectEnvelope } from '../../formats/projectJson';
import { useSessionStore } from '../../state/session';
import type { BodyTubeComponent, RocketComponent, StabilityAnalysis, TrapezoidFinSetComponent } from '../../core/types';
import { installTestEngine } from '../testFixtures';

const components = (): RocketComponent[] => useProjectStore.getState().project.vehicle.components;
const byId = <T extends RocketComponent>(id: string): T => components().find((c) => c.id === id) as T;

let teardown: () => void;

/**
 * Native stub: `stability` answers with one contribution per component, and
 * the body tubes are non-lifting (CP and CNa are Rust `null`, serialized as
 * JSON null exactly as the command sends them).
 */
function stubStability(): void {
  const vehicle = useProjectStore.getState().project.vehicle;
  const contributions = vehicle.components.map((c, i) => {
    const lifting = c.type === 'nosecone' || c.type === 'trapezoidfinset' || c.type === 'ellipticalfinset';
    return {
      id: c.id,
      name: c.name,
      type: c.type,
      mass: 0.2,
      cg: 0.1 + i * 0.1,
      cna: lifting ? 4 : null,
      cp: lifting ? 0.1 + i * 0.1 : null,
      axialStart: i * 0.1,
      axialEnd: i * 0.1 + 0.1,
    };
  });
  const analysis = {
    totalLength: 1.2,
    maxDiameter: 0.155,
    referenceDiameter: 0.155,
    totalMass: 12,
    cg: 0.7,
    cp: 1.0,
    staticMarginCalibers: 1.94,
    totalCNa: 20,
    isStable: true,
    isOverStable: false,
    contributions,
  } as unknown as StabilityAnalysis;
  teardown = installTestEngine(async (cmd: string) => (cmd === 'stability' ? analysis : {})).teardown;
}

beforeEach(() => {
  useProjectStore.getState().loadPreset('nasaStudent');
  stubStability();
});

afterEach(() => {
  teardown();
  cleanup();
});

function select(id: string) {
  useSessionStore.getState().setSelectedId(id);
  return render(<Tooltip.Provider delayDuration={250}><PartInspector /></Tooltip.Provider>);
}

/** The number input under a FieldRow whose label matches. */
function inputFor(label: string | RegExp): HTMLInputElement {
  const el = [...document.querySelectorAll('span')].find((s) => typeof label === 'string' ? s.textContent?.trim() === label : (label as RegExp).exec(s.textContent?.trim() ?? '') !== null);
  const input = el?.parentElement?.querySelector('input') as HTMLInputElement | null;
  if (!input) throw new Error(`No input rendered for ${String(label)}`);
  return input;
}

function applyEdits(): void {
  const apply = screen.queryByRole('button', { name: 'Apply staged edits' });
  if (apply) fireEvent.click(apply);
}

describe('live size slider', () => {
  it('stages a dimension immediately without waiting for blur', () => {
    select('nsl-bt2');
    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1500' } });
    const draft = useProjectStore.getState().drafts.airframe.components['nsl-bt2'] as Partial<BodyTubeComponent>;
    expect(draft.length).toBeCloseTo(1.5);
    // The numeric field still shows the same value after the slider moves.
    expect(inputFor('Length').value).toContain('1,500');
  });

  it('keeps the pre-press window when the track is pressed away from the thumb', () => {
    select('nsl-bt2');
    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    const beforeMin = slider.getAttribute('min');
    const beforeMax = slider.getAttribute('max');

    fireEvent.pointerDown(slider);
    // A track press changes the value before focus/change settle. The window
    // must stay on the value that existed before the press.
    fireEvent.change(slider, { target: { value: '2800' } });
    fireEvent.focus(slider);

    expect(slider.getAttribute('min')).toBe(beforeMin);
    expect(slider.getAttribute('max')).toBe(beforeMax);
    // Fins slide with the aft end, so only the front-anchored main chute
    // (0.85 + 0.05 m) floors the tube. Previously the fins floored it at 1420.
    expect(beforeMin).toBe('900');
    expect(beforeMax).toBe('2900');
  });

  it('steps mass sliders in grams, not whole kilograms', () => {
    select('nsl-main');
    const slider = screen.getByRole('slider', { name: 'Packed mass slider' }) as HTMLInputElement;
    expect(Number(slider.getAttribute('step'))).toBeCloseTo(0.005, 9);
  });

  it('caps the inner diameter by the outer diameter and the outer diameter by the inner', () => {
    select('nsl-bt2');
    const inner = screen.getByRole('slider', { name: 'Inner diameter slider' }) as HTMLInputElement;
    const outer = screen.getByRole('slider', { name: 'Outer diameter slider' }) as HTMLInputElement;
    // 152 mm outer, 145 mm inner, 0.5 mm minimum wall.
    expect(Number(inner.max)).toBeLessThanOrEqual(151.5 + 1e-9);
    expect(Number(outer.min)).toBeGreaterThanOrEqual(145.5 - 1e-9);
  });

  it('caps a fin offset at the parent tube length minus the root chord', () => {
    select('nsl-fins');
    const offset = screen.getByRole('slider', { name: 'Position from tube front slider' }) as HTMLInputElement;
    // Parent booster tube 1.45 m, root chord 0.32 m.
    expect(Number(offset.max)).toBeLessThanOrEqual(1130 + 1e-9);
    expect(Number(offset.max)).toBeGreaterThanOrEqual(1100 - 1e-9);
  });

  it('floors a tube length at its front-anchored children; attached fins move with the aft end', () => {
    select('nsl-bt2');
    const length = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    // The fins keep their 30 mm aft margin as the tube shortens, so their floor
    // is 1.45 - 1.10 = 0.35 m. The main chute stays put and ends at 0.90 m.
    expect(Number(length.min)).toBeCloseTo(900, 9);
  });

  it('warns from the tube side when children already extend past its end', () => {
    useProjectStore.getState().stageComponents('airframe', 'nsl-bt2', { length: 0.5 } as Partial<BodyTubeComponent>);
    select('nsl-bt2');
    const notice = document.querySelector('[data-invalid-geometry="true"]');
    expect(notice?.textContent).toContain('High-Power Clipped Delta Fins');
    expect(notice?.textContent).toContain('Main Parachute (700ft AGL)');
  });

  it('warns when an existing fin offset already extends past its parent tube', () => {
    useProjectStore.getState().stageComponents('airframe', 'nsl-bt2', { length: 0.5 } as Partial<BodyTubeComponent>);
    select('nsl-fins');
    const notice = document.querySelector('[data-invalid-geometry="true"]');
    expect(notice?.textContent).toContain('920 mm past the end of Booster & Motor Section');
    // Focusing and leaving the field is not an edit: the offset stays where it was.
    const offset = inputFor('Position from tube front');
    fireEvent.focus(offset);
    fireEvent.blur(offset);
    expect(useProjectStore.getState().drafts.airframe.components['nsl-fins']).toBeUndefined();
  });

  it('gives optional dimensions a slider once they are entered', () => {
    select('nsl-bt2');
    fireEvent.click(screen.getByRole('button', { name: 'Add Rail guide diameter' }));
    expect(screen.getByRole('slider', { name: 'Rail guide diameter slider' })).toBeTruthy();
  });
});

describe('motor mount flag', () => {
  it('binds the toggle to the store on a mount tube', () => {
    select('nsl-bt2');
    expect(screen.getByRole('radio', { name: 'Yes' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'No' }));
    applyEdits();
    expect(byId<BodyTubeComponent>('nsl-bt2').isMotorMount).toBe(false);
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    applyEdits();
    expect(byId<BodyTubeComponent>('nsl-bt2').isMotorMount).toBe(true);
  });

  it('shows the toggle on a tube that is not flagged, so a mount can be added', () => {
    expect(byId<BodyTubeComponent>('nsl-bt1').isMotorMount).toBeUndefined();
    select('nsl-bt1');
    expect(screen.getByRole('radio', { name: 'Yes' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('radio', { name: 'Yes' }));
    applyEdits();
    expect(byId<BodyTubeComponent>('nsl-bt1').isMotorMount).toBe(true);
  });
});

describe('solid-mount inner diameter', () => {
  it('commits a typed 0 as exactly 0 m, the solid-mount sentinel', () => {
    select('nsl-bt2');
    const input = inputFor('Inner diameter');
    fireEvent.change(input, { target: { value: '0' } });
    fireEvent.blur(input);
    applyEdits();
    expect(byId<BodyTubeComponent>('nsl-bt2').innerDiameter).toBe(0);
    // Explicitly not the old 0.001 floor: 0 is the sentinel the engine reads.
    expect(byId<BodyTubeComponent>('nsl-bt2').innerDiameter).not.toBe(0.001);
  });
});

describe('physics readout with a Rust null CP/CNa', () => {
  it('renders mass and CG for a non-lifting part and hides the CP/CNa rows', () => {
    // The legacy panel crashed on body-tube selection in the native shell:
    // `!== undefined` let a null through to `.toFixed`.
    select('nsl-bt1');
    expect(screen.getByText('Mass')).toBeTruthy();
    expect(screen.getByText('CG from nose')).toBeTruthy();
    expect(screen.queryByText('CP from nose')).toBeNull();
    expect(screen.queryByText('CNα share')).toBeNull();
  });
});

describe('launch hardware', () => {
  it('adds, stages and clears rail hardware and a launch shoe', () => {
    select('nsl-bt1');
    expect(byId<BodyTubeComponent>('nsl-bt1').railGuideDiameter).toBeUndefined();

    fireEvent.click(screen.getByRole('button', { name: 'Add Rail guide diameter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Rail guide height' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Launch lug diameter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Launch shoe area' }));
    applyEdits();

    const tube = byId<BodyTubeComponent>('nsl-bt1');
    expect(tube.railGuideDiameter).toBeCloseTo(0.006);
    expect(tube.railGuideHeight).toBeCloseTo(0.004);
    expect(tube.launchLugDiameter).toBeCloseTo(0.008);
    expect(tube.launchShoeArea).toBeCloseTo(0.0009);
    expect(screen.getByText('Launch shoe area').closest('[title]')?.getAttribute('title')).toContain('m²');

    fireEvent.click(screen.getByRole('button', { name: 'Clear Rail guide diameter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear Launch shoe area' }));
    applyEdits();

    expect(byId<BodyTubeComponent>('nsl-bt1').railGuideDiameter).toBeUndefined();
    expect(byId<BodyTubeComponent>('nsl-bt1').launchShoeArea).toBeUndefined();
    expect(Object.hasOwn(byId('nsl-bt1'), 'railGuideDiameter')).toBe(false);
    expect(Object.hasOwn(byId('nsl-bt1'), 'launchShoeArea')).toBe(false);
  });
});

describe('fin airfoil inputs', () => {
  it('selects a section and adds edge geometry', () => {
    select('nsl-fins');
    const section = screen.getByLabelText('Airfoil section') as HTMLSelectElement;
    expect(section.value).toBe('');
    expect([...section.options].map((option) => option.value)).toContain('Subsonic NACA');

    fireEvent.change(section, { target: { value: 'Subsonic NACA' } });
    applyEdits();
    expect(byId<TrapezoidFinSetComponent>('nsl-fins').airfoilSection).toBe('Subsonic NACA');

    fireEvent.click(screen.getByRole('button', { name: 'Add Leading-edge bevel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Trailing-edge bevel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Leading-edge radius' }));
    applyEdits();

    const fins = byId<TrapezoidFinSetComponent>('nsl-fins');
    expect(fins.leadingEdgeBevel).toBeCloseTo(0.001);
    expect(fins.trailingEdgeBevel).toBeCloseTo(0.001);
    expect(fins.leadingEdgeRadius).toBeCloseTo(0.001);

    fireEvent.change(screen.getByLabelText('Airfoil section'), { target: { value: '' } });
    applyEdits();
    expect(byId<TrapezoidFinSetComponent>('nsl-fins').airfoilSection).toBeUndefined();
  });
});

describe('aft-anchored fins', () => {
  const draftLength = (id: string): number | undefined =>
    (useProjectStore.getState().drafts.airframe.components[id] as { length?: number } | undefined)?.length;
  const draftOffset = (id: string): number | undefined =>
    (useProjectStore.getState().drafts.airframe.components[id] as { axialOffset?: number } | undefined)?.axialOffset;
  const previewPart = (id: string): RocketComponent | undefined =>
    effectiveVehicle('airframe').components.find((c) => c.id === id);
  const previewLength = (id: string): number => {
    const part = previewPart(id);
    return part !== undefined && 'length' in part ? part.length : NaN;
  };
  const previewOffset = (id: string): number => {
    const part = previewPart(id);
    return part !== undefined && 'axialOffset' in part ? part.axialOffset : NaN;
  };
  const adoptSynthetic = (components: RocketComponent[]): void => {
    adoptProject(createProjectEnvelope({
      vehicle: { id: 'synthetic', name: 'Synthetic', version: '1', author: 'test', components },
    }));
  };

  it('moves NSL fins with the tube aft end when the length is typed', () => {
    select('nsl-bt2');
    const length = inputFor('Length');
    fireEvent.change(length, { target: { value: '1,000' } });
    fireEvent.blur(length);

    expect(draftLength('nsl-bt2')).toBeCloseTo(1.0, 12);
    expect(draftOffset('nsl-fins')).toBeCloseTo(0.65, 12);
    // The 30 mm aft margin at 1.45 m is preserved, so the root trailing edge
    // sits 30 mm forward of the new aft end rather than snapping flush.
    expect(previewOffset('nsl-fins')).toBeCloseTo(0.65, 12);
    expect(previewOffset('nsl-fins') + 0.32).toBeCloseTo(1.0 - 0.03, 9);
  });

  it('anchors scrubbed length steps to the gesture-start length', () => {
    select('nsl-bt2');
    const input = inputFor('Length');
    const wrapper = input.parentElement as HTMLElement;
    const unit = wrapper.querySelector('span[title="Drag to scrub"]') as HTMLElement;
    const proto = HTMLElement.prototype as unknown as { setPointerCapture?: (id: number) => void };
    const previous = proto.setPointerCapture;
    proto.setPointerCapture = () => undefined;
    try {
      fireEvent.pointerDown(unit, { clientX: 1000, pointerId: 1 });
      // 4 px per 1 mm step: -400 px stages 1350 mm from the 1450 mm start.
      fireEvent.pointerMove(unit, { clientX: 600, pointerId: 1 });
      expect(previewLength('nsl-bt2')).toBeCloseTo(1.35, 12);
      expect(previewOffset('nsl-fins')).toBeCloseTo(1.0, 12);
      // The next move is measured from the same start, not from the last step.
      fireEvent.pointerMove(unit, { clientX: -800, pointerId: 1 });
      expect(previewLength('nsl-bt2')).toBeCloseTo(1.0, 12);
      expect(previewOffset('nsl-fins')).toBeCloseTo(0.65, 12);
      fireEvent.pointerUp(unit, { pointerId: 1 });
    } finally {
      if (previous === undefined) delete proto.setPointerCapture;
      else proto.setPointerCapture = previous;
    }
  });

  it('keeps the fin offset anchored across a whole slider drag and ends without drift', () => {
    select('nsl-bt2');
    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    expect(Number(slider.min)).toBeCloseTo(900, 9);
    fireEvent.pointerDown(slider);
    for (let mm = 1440; mm >= 1000; mm -= 10) {
      fireEvent.change(slider, { target: { value: String(mm) } });
      const length = previewLength('nsl-bt2');
      expect(previewOffset('nsl-fins') + 0.32).toBeCloseTo(length - 0.03, 9);
    }
    fireEvent.pointerUp(slider);
    expect(previewLength('nsl-bt2')).toBeCloseTo(1.0, 12);
    expect(previewOffset('nsl-fins')).toBeCloseTo(0.65, 12);

    // Two changes in one batch must both read the gesture anchor, not a stale
    // intermediate length.
    fireEvent.pointerDown(slider);
    act(() => {
      fireEvent.change(slider, { target: { value: '1200' } });
      fireEvent.change(slider, { target: { value: '1250' } });
    });
    fireEvent.pointerUp(slider);
    expect(previewLength('nsl-bt2')).toBeCloseTo(1.25, 12);
    expect(previewOffset('nsl-fins')).toBeCloseTo(0.9, 12);
  });

  it('returns the fins to the anchor offset when a drag comes back to the start length', () => {
    select('nsl-bt2');
    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    fireEvent.pointerDown(slider);
    fireEvent.change(slider, { target: { value: '1000' } });
    expect(previewOffset('nsl-fins')).toBeCloseTo(0.65, 12);
    // Back to the exact gesture-start length without releasing: the early
    // "delta is zero" shortcut used to leave the fins at the 1000 mm offset.
    fireEvent.change(slider, { target: { value: '1450' } });
    expect(previewLength('nsl-bt2')).toBeCloseTo(1.45, 12);
    expect(previewOffset('nsl-fins')).toBeCloseTo(1.1, 12);
    expect(previewOffset('nsl-fins') + 0.32).toBeCloseTo(1.45 - 0.03, 12);
    fireEvent.pointerUp(slider);
  });

  it('slides the fins when the length is nudged with the arrow keys', () => {
    select('nsl-bt2');
    const length = inputFor('Length');
    fireEvent.focus(length);
    for (let i = 0; i < 50; i += 1) fireEvent.keyDown(length, { key: 'ArrowDown' });
    fireEvent.blur(length);
    expect(previewLength('nsl-bt2')).toBeCloseTo(1.4, 12);
    expect(previewOffset('nsl-fins')).toBeCloseTo(1.05, 12);
  });

  it('restores the fins when the length is reverted or discarded', () => {
    select('nsl-bt2');
    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '1000' } });
    expect(previewOffset('nsl-fins')).toBeCloseTo(0.65, 12);

    // The revert controls compare against a committed run, so give the
    // inspector one built from the pre-edit project.
    const store = useProjectStore.getState();
    const committedDesign = designOf(store.project, store.mission, store.shearPa, undefined, store.motors);
    act(() => {
      const analysis = useAnalysisStore.getState();
      const token = analysis.start('flight', 'revert-test');
      analysis.resolve('flight', token, { model: 'legacy', design: committedDesign, run: {} });
    });

    fireEvent.click(screen.getByRole('button', { name: 'Revert Length' }));
    expect(previewLength('nsl-bt2')).toBeCloseTo(1.45, 12);
    expect(previewOffset('nsl-fins')).toBeCloseTo(1.1, 12);

    fireEvent.change(slider, { target: { value: '1000' } });
    expect(previewOffset('nsl-fins')).toBeCloseTo(0.65, 12);
    fireEvent.click(screen.getByRole('button', { name: 'Discard staged edits' }));
    expect(Object.keys(useProjectStore.getState().drafts.airframe.components)).toHaveLength(0);
    expect(previewOffset('nsl-fins')).toBeCloseTo(1.1, 12);
  });

  it('moves every fin set on the tube, including freeform, and leaves front-anchored children alone', () => {
    adoptSynthetic([
      { id: 'nc', name: 'Nose', type: 'nosecone', shape: 'ogive', length: 0.4, baseDiameter: 0.1, wallThickness: 0.002, isHollow: true, materialId: 'fiberglass', color: '#ffffff' },
      { id: 't1', name: 'Main tube', type: 'bodytube', length: 1.45, outerDiameter: 0.152, innerDiameter: 0.145, materialId: 'fiberglass', color: '#18181b' },
      { id: 'fa', name: 'Trapezoid fins', type: 'trapezoidfinset', finCount: 4, rootChord: 0.32, tipChord: 0.12, span: 0.18, sweepLength: 0.18, thickness: 0.0048, crossSection: 'airfoil', axialOffset: 1.1, materialId: 'carbonfiber', color: '#06b6d4' },
      { id: 'fb', name: 'Freeform fins', type: 'freeformfinset', finCount: 3, points: [{ x: 0, y: 0 }, { x: 0.1, y: 0.1 }, { x: 0.3, y: 0 }], thickness: 0.004, crossSection: 'rounded', axialOffset: 0.4, materialId: 'carbonfiber', color: '#06b6d4' },
      { id: 'm', name: 'Ballast', type: 'masscomponent', mass: 0.2, length: 0.1, axialOffset: 0.1, materialId: 'aluminum', color: '#71717a' },
      { id: 'ch', name: 'Chute', type: 'parachute', diameter: 0.5, cd: 1.2, mass: 0.1, axialOffset: 0.2, packedLengthM: 0.05, materialId: 'cardboard', color: '#ffffff' },
      { id: 't2', name: 'Aft tube', type: 'bodytube', length: 0.5, outerDiameter: 0.1, innerDiameter: 0.09, materialId: 'fiberglass', color: '#18181b' },
      { id: 'fc', name: 'Aft fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.3, tipChord: 0.1, span: 0.12, sweepLength: 0.1, thickness: 0.004, crossSection: 'rounded', axialOffset: 0.1, materialId: 'carbonfiber', color: '#06b6d4' },
    ]);
    select('t1');
    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    // Front-anchored children end at 0.20 m (mass) and 0.25 m (chute); the
    // freeform fin at 0.40 m with a 0.30 m root floors the tube at 1.05 m.
    expect(Number(slider.min)).toBeCloseTo(1050, 9);
    fireEvent.change(slider, { target: { value: '1050' } });

    expect(draftLength('t1')).toBeCloseTo(1.05, 12);
    expect(draftOffset('fa')).toBeCloseTo(0.7, 12);
    expect(draftOffset('fb')).toBeCloseTo(0, 9);
    expect(draftOffset('m')).toBeUndefined();
    expect(draftOffset('ch')).toBeUndefined();
    expect(draftOffset('fc')).toBeUndefined();
    expect(useProjectStore.getState().drafts.airframe.components['t2']).toBeUndefined();
    // Each fin keeps its own distance from the aft end.
    expect(previewOffset('fa') + 0.32).toBeCloseTo(1.05 - 0.03, 9);
    expect(previewOffset('fb') + 0.3).toBeCloseTo(1.05 - 0.75, 9);
  });

  it('floors a fin-only tube at the root chord and keeps a flush fin flush', () => {
    adoptSynthetic([
      { id: 't', name: 'Tube', type: 'bodytube', length: 1.0, outerDiameter: 0.1, innerDiameter: 0.09, materialId: 'fiberglass', color: '#18181b' },
      { id: 'f', name: 'Flush fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.32, tipChord: 0.1, span: 0.1, sweepLength: 0.05, thickness: 0.004, crossSection: 'rounded', axialOffset: 0.68, materialId: 'carbonfiber', color: '#06b6d4' },
    ]);
    select('t');
    const input = inputFor('Length');
    // Typing below the floor clamps to the root chord: 0.32 m.
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.blur(input);
    expect(draftLength('t')).toBeCloseTo(0.32, 12);
    expect(draftOffset('f')).toBeCloseTo(0, 9);
    // A fin that started flush ends flush.
    expect(previewOffset('f') + 0.32).toBeCloseTo(0.32, 12);

    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '500' } });
    expect(draftLength('t')).toBeCloseTo(0.5, 12);
    expect(draftOffset('f')).toBeCloseTo(0.18, 12);
    expect(previewOffset('f') + 0.32).toBeCloseTo(0.5, 12);
  });

  it('floors the tube at its current length when a fin sits at the tube front', () => {
    adoptSynthetic([
      { id: 't', name: 'Tube', type: 'bodytube', length: 1.0, outerDiameter: 0.1, innerDiameter: 0.09, materialId: 'fiberglass', color: '#18181b' },
      { id: 'f', name: 'Front fins', type: 'trapezoidfinset', finCount: 3, rootChord: 0.2, tipChord: 0.08, span: 0.1, sweepLength: 0.05, thickness: 0.004, crossSection: 'rounded', axialOffset: 0, materialId: 'carbonfiber', color: '#06b6d4' },
    ]);
    select('t');
    const slider = screen.getByRole('slider', { name: 'Length slider' }) as HTMLInputElement;
    expect(Number(slider.min)).toBeCloseTo(1000, 9);
  });
});
