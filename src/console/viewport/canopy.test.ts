/**
 * P3: the parachute drawn during Flight playback. The open canopy comes only
 * from the run's recorded events and the engine's own drogue/main rule.
 */
import { describe, expect, it } from 'vitest';
import type { ParachuteComponent, RocketComponent } from '../../core/types';
import { canopyAt, canopyGeometry, canopyPoints } from './canopy';
import { envelopeRadius } from './framing';

const chute = (id: string, diameter: number, deployRole?: ParachuteComponent['deployRole']): ParachuteComponent => ({
  id, name: id, type: 'parachute', diameter, cd: 1, mass: 0.1, axialOffset: 0.1, materialId: 'cardboard', ...(deployRole ? { deployRole } : {}),
});
const TUBE: RocketComponent = { id: 't', name: 'T', type: 'bodytube', length: 1, outerDiameter: 0.1, innerDiameter: 0.097, materialId: 'cardboard' };
const EVENTS = [{ kind: 'rail_exit', t: 0.5 }, { kind: 'apogee_drogue', t: 11.6 }, { kind: 'main', t: 27.8 }, { kind: 'touchdown', t: 68.6 }];

describe('canopyAt', () => {
  const parts = [TUBE, chute('small', 0.6), chute('big', 2.4)];

  it('shows nothing before apogee, the drogue after it and the main after the main event', () => {
    expect(canopyAt(EVENTS, 5, parts)).toBeNull();
    expect(canopyAt(EVENTS, 11.6, parts)).toEqual({ role: 'drogue', diameterM: 0.6, name: 'small' });
    expect(canopyAt(EVENTS, 27.8, parts)).toEqual({ role: 'main', diameterM: 2.4, name: 'big' });
    expect(canopyAt(EVENTS, 60, parts)?.role).toBe('main');
  });

  it('follows declared roles, so a reordered pair draws the right canopy', () => {
    const swapped = [TUBE, chute('big', 2.4, 'main'), chute('small', 0.6, 'drogue')];
    expect(canopyAt(EVENTS, 15, swapped)?.diameterM).toBe(0.6);
    expect(canopyAt(EVENTS, 30, swapped)?.diameterM).toBe(2.4);
  });

  it('draws only what the run recorded and the design can name', () => {
    // No main event recorded: the drogue stays the drawn canopy.
    expect(canopyAt(EVENTS.filter((e) => e.kind !== 'main'), 40, parts)?.role).toBe('drogue');
    // No chute, no time, or a role clash: nothing is drawn.
    expect(canopyAt(EVENTS, 30, [TUBE])).toBeNull();
    expect(canopyAt(EVENTS, undefined, parts)).toBeNull();
    expect(canopyAt(EVENTS, 30, [TUBE, chute('a', 1, 'main'), chute('b', 1, 'main')])).toBeNull();
  });
});

describe('canopy geometry', () => {
  it('is to scale and clears the rocket in every attitude', () => {
    const r = envelopeRadius(1.485, 0.256);
    const g = canopyGeometry(2.4, r);
    expect(g.radius).toBeCloseTo(1.2, 9);
    // The rim sits above the pose-invariant sphere, so no pose pokes through.
    expect(g.rimY - g.radius).toBeCloseTo(r, 9);
    const points = canopyPoints(g, 8);
    expect(points).toHaveLength(9);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(g.rimY + g.radius, 9);
    expect(Math.max(...points.map((p) => Math.hypot(p.x, p.z)))).toBeCloseTo(1.2, 9);
  });
});
