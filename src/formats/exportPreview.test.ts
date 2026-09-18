import { describe, it, expect } from 'vitest';
import {
  describeRktPreview,
  describeEngPreview,
  describeKmlPreview,
  describeStepPreview,
  describeStlPreview,
  buildKmlInputs,
  type KmlRunSnapshot,
} from './exportPreview';
import { PRESET_ESTES_ALPHA } from '../store/rocketStore';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { RocketVehicle } from '../core/types';
import type { SixDofTelemetryPoint } from '../sim/sixDofSimulator';

function point(x: number, y: number, z: number, time: number): SixDofTelemetryPoint {
  return {
    time,
    position: { x, y, z },
    velocity: { x: 0, y: 0, z: 0 },
    speed: 0,
    mach: 0,
    altitude: z,
    acceleration: 0,
    angularVelocity: { p: 0, q: 0, r: 0 },
    angleOfAttackDeg: 0,
    q: { w: 1, x: 0, y: 0, z: 0 },
    pitchDeg: 0,
    rollDeg: 0,
    yawDeg: 0,
    drag: 0,
    thrust: 0,
    mass: 1,
    dynamicPressure: 0,
  };
}

function committedRun(over: Partial<KmlRunSnapshot> = {}): KmlRunSnapshot {
  return {
    runKey: 'test-key',
    freshness: 'current',
    telemetry: [point(0, 0, 0, 0), point(10, 5, 0, 60)],
    ...over,
  };
}

function ellipticalVehicle(): RocketVehicle {
  return {
    ...PRESET_ESTES_ALPHA,
    id: 'elliptical-fixture',
    name: 'Elliptical Fixture',
    components: [
      ...PRESET_ESTES_ALPHA.components.slice(0, 2),
      {
        id: 'efins',
        name: 'Elliptical Fins',
        type: 'ellipticalfinset',
        materialId: 'balsa',
        finCount: 3,
        rootChord: 0.08,
        span: 0.04,
        thickness: 0.003,
        axialOffset: 0.2,
      },
    ],
  };
}

describe('describeRktPreview', () => {
  it('clears the Estes Alpha preset with lossy-field notes', () => {
    const preview = describeRktPreview(PRESET_ESTES_ALPHA);
    expect(preview.canExport).toBe(true);
    expect(preview.refused).toEqual([]);
    expect(preview.filename).toBe('estes-alpha-iii-replica.rkt');
    expect(preview.omissions.join('\n')).toMatch(/ids, materials, and colors/);
  });

  it('refuses elliptical fin sets instead of silently lossy export', () => {
    const preview = describeRktPreview(ellipticalVehicle());
    expect(preview.canExport).toBe(false);
    expect(preview.refused).toHaveLength(1);
    expect(preview.refused[0]).toContain('Elliptical Fins');
    expect(preview.refused[0]).toContain('trapezoid');
  });

  it('refuses attached hardware with no preceding body tube', () => {
    const vehicle: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      id: 'orphan-fixture',
      name: 'Orphan Fixture',
      components: [
        {
          id: 'chute',
          name: 'Lone Chute',
          type: 'parachute',
          materialId: 'nylon',
          diameter: 0.3,
          cd: 0.8,
          mass: 0.008,
          axialOffset: 0,
        },
      ],
    };
    const preview = describeRktPreview(vehicle);
    expect(preview.canExport).toBe(false);
    expect(preview.refused[0]).toContain('Lone Chute');
    expect(preview.refused[0]).toContain('body tube');
  });

  it('notes von Karman nosecones exporting as ogive', () => {
    const vehicle: RocketVehicle = {
      ...PRESET_ESTES_ALPHA,
      components: PRESET_ESTES_ALPHA.components.map((c) =>
        c.type === 'nosecone' ? { ...c, shape: 'vonkarman' as const } : c,
      ),
    };
    const preview = describeRktPreview(vehicle);
    expect(preview.canExport).toBe(true);
    expect(preview.omissions.join('\n')).toMatch(/ogive/);
  });
});

describe('describeEngPreview', () => {
  it('clears the Estes C6 with curve-authority notes', () => {
    const preview = describeEngPreview(CERTIFIED_MOTORS.estes_c6);
    expect(preview.canExport).toBe(true);
    expect(preview.filename).toBe('estes_c6.eng');
    expect(preview.omissions.join('\n')).toMatch(/sole authority/);
  });

  it('refuses records the validator rejects', () => {
    const preview = describeEngPreview({ ...CERTIFIED_MOTORS.estes_c6, thrustCurve: [] });
    expect(preview.canExport).toBe(false);
    expect(preview.refused).toHaveLength(1);
    expect(preview.refused[0]).toContain('at least two points');
  });

  it('names dropped bare-number designation tokens', () => {
    const preview = describeEngPreview({ ...CERTIFIED_MOTORS.estes_c6, designation: 'Custom 123' });
    expect(preview.canExport).toBe(true);
    expect(preview.omissions.join('\n')).toMatch(/123/);
    expect(preview.omissions.join('\n')).toMatch(/dropped/);
  });
});

describe('describeKmlPreview', () => {
  it('refuses without a committed run', () => {
    const preview = describeKmlPreview(null, 'estes-alpha-iii-replica');
    expect(preview.canExport).toBe(false);
    expect(preview.refused[0]).toContain('Flight Sim');
  });

  it('clears a run with a published payload and resolves touchdown inputs', () => {
    const run = committedRun();
    const preview = describeKmlPreview(run, 'estes-alpha-iii-replica');
    expect(preview.canExport).toBe(true);
    expect(preview.filename).toBe('estes-alpha-iii-replica-containment.kml');
    expect(preview.omissions.join('\n')).toMatch(/ENU/);
    expect(preview.omissions.join('\n')).toMatch(/freeze at click time/);
    const inputs = buildKmlInputs(run);
    expect(inputs.landings).toEqual([{ x: 10, y: 5 }]);
    expect(inputs.apogeeTrack).toHaveLength(2);
    expect(inputs.apogeeTrack[1]).toEqual({ x: 10, y: 5, z: 0 });
  });

  it('labels a stale committed run as a frozen snapshot but still exports', () => {
    const preview = describeKmlPreview(committedRun({ freshness: 'stale' }), 'slug');
    expect(preview.canExport).toBe(true);
    expect(preview.omissions.join('\n')).toMatch(/STALE/);
    expect(preview.omissions.join('\n')).toMatch(/frozen snapshot/);
  });

  it('refuses a committed run whose telemetry payload has not been published', () => {
    const preview = describeKmlPreview(committedRun({ telemetry: [] }), 'slug');
    expect(preview.canExport).toBe(false);
    expect(preview.refused[0]).toContain('test-key');
    expect(preview.refused[0]).toMatch(/payload/);
    expect(() => buildKmlInputs(committedRun({ telemetry: [] }))).toThrow(/no telemetry/);
  });

  it('refuses a structurally invalid published payload at input build time', () => {
    expect(() =>
      buildKmlInputs(committedRun({ telemetry: [{ time: 0 }] })),
    ).toThrow(/not a published track point/);
  });
});

describe('describeStepPreview', () => {
  it('clears the preset as OML-only with skipped-hardware notes', () => {
    const preview = describeStepPreview(PRESET_ESTES_ALPHA);
    expect(preview.canExport).toBe(true);
    expect(preview.filename).toBe('estes-alpha-iii-replica.step');
    expect(preview.omissions.join('\n')).toMatch(/Outer mold line only/);
    expect(preview.omissions.join('\n')).toMatch(/12" Parachute/);
  });

  it('carries the tessellator refusal for bodyless vehicles', () => {
    const preview = describeStepPreview({
      ...PRESET_ESTES_ALPHA,
      id: 'mass-only',
      name: 'Mass Only',
      components: [
        {
          id: 'sled',
          name: 'Sled',
          type: 'masscomponent',
          materialId: 'aluminum',
          mass: 0.1,
          length: 0.1,
          axialOffset: 0,
        },
      ],
    });
    expect(preview.canExport).toBe(false);
    expect(preview.refused).toHaveLength(1);
  });
});

describe('describeStlPreview', () => {
  it('clears the preset with the SI-metres convention note', () => {
    const preview = describeStlPreview(PRESET_ESTES_ALPHA);
    expect(preview.canExport).toBe(true);
    expect(preview.filename).toBe('estes-alpha-iii-replica.stl');
    expect(preview.omissions.join('\n')).toMatch(/SI metres/);
  });

  it('carries the tessellator refusal for fin sets before any tube', () => {
    const preview = describeStlPreview({
      ...PRESET_ESTES_ALPHA,
      id: 'fin-first',
      name: 'Fin First',
      components: [
        {
          id: 'fins',
          name: 'Early Fins',
          type: 'trapezoidfinset',
          materialId: 'balsa',
          finCount: 3,
          rootChord: 0.07,
          tipChord: 0.03,
          span: 0.05,
          sweepLength: 0.03,
          thickness: 0.002,
          crossSection: 'square',
          axialOffset: 0,
        },
      ],
    });
    expect(preview.canExport).toBe(false);
    expect(preview.refused[0]).toContain('Early Fins');
  });
});