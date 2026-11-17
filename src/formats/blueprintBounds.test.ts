// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { exportBlueprintSvg } from './blueprint';
import { PRESET_DESIGNS } from '../state/project';
import type { RocketVehicle, RocketComponent } from '../core/types';

const tube: RocketComponent = { id: 'tube', name: 'tube', type: 'bodytube', length: 1, outerDiameter: 0.1, innerDiameter: 0.09, materialId: 'cardboard' };
const fin: RocketComponent = { id: 'fin', name: 'fin', type: 'trapezoidfinset', finCount: 3, rootChord: 0.4, tipChord: 0.3, span: 0.3, sweepLength: 0.8, thickness: 0.003, crossSection: 'square', axialOffset: 0.9, materialId: 'balsa' };
const transition: RocketComponent = { id: 'tr', name: 'tr', type: 'transition', length: 0.2, foreDiameter: 0.1, aftDiameter: 0.3, wallThickness: 0.002, isHollow: true, materialId: 'cardboard' };
const v = (name: string, components: RocketComponent[]): RocketVehicle => ({ id: name, name, version: '1', author: 'test', components });
const cases = [
  ...Object.values(PRESET_DESIGNS).map(p => p.vehicle),
  v('no fins', [tube, transition]),
  v('fins beyond body', [tube, fin]),
  v('long', [{ ...tube, length: 100 }]),
  v('short', [{ ...tube, length: 0.001, outerDiameter: 0.001, innerDiameter: 0.0009 }]),
  v('elliptical', [tube, { id: 'e', name: 'e', type: 'ellipticalfinset', finCount: 3, rootChord: 0.2, span: 0.3, thickness: 0.003, axialOffset: 0.9, materialId: 'balsa' }]),
  v('freeform', [tube, { id: 'f', name: 'f', type: 'freeformfinset', finCount: 3, points: [{ x: 0, y: 0 }, { x: 0.2, y: 0.3 }, { x: 0.4, y: 0 }], thickness: 0.003, crossSection: 'square', axialOffset: 0.9, materialId: 'balsa' }]),
];

describe('blueprint drawing bounds', () => {
  it.each(cases)('contains all geometry and text for $name', vehicle => {
    const doc = new DOMParser().parseFromString(exportBlueprintSvg(vehicle), 'image/svg+xml');
    const svg = doc.documentElement;
    const [vx, vy, vw, vh] = svg.getAttribute('viewBox')!.split(/\s+/).map(Number);
    const point = (x: number, y: number, el: Element) => {
      expect(x, el.outerHTML).toBeGreaterThanOrEqual(vx - 0.01);
      expect(x, el.outerHTML).toBeLessThanOrEqual(vx + vw + 0.01);
      expect(y, el.outerHTML).toBeGreaterThanOrEqual(vy - 0.01);
      expect(y, el.outerHTML).toBeLessThanOrEqual(vy + vh + 0.01);
    };
    const num = (el: Element, key: string) => Number(el.getAttribute(key));
    for (const el of Array.from(svg.querySelectorAll('rect,polygon,path,line,text'))) {
      if (el.tagName === 'rect') {
        const x = num(el, 'x'), y = num(el, 'y');
        point(x, y, el); point(x + num(el, 'width'), y + num(el, 'height'), el);
      } else if (el.tagName === 'line') {
        point(num(el, 'x1'), num(el, 'y1'), el); point(num(el, 'x2'), num(el, 'y2'), el);
      } else if (el.tagName === 'text') {
        const x = num(el, 'x'), y = num(el, 'y');
        const total = el.getAttribute('class') === 'bp-total';
        const halfWidth = (el.textContent?.length ?? 0) * (total ? 9 : 8) / 2;
        point(x - halfWidth, y - (total ? 15 : 13), el);
        point(x + halfWidth, y + 4, el);
      } else {
        // All paths emitted here use absolute M/L/C/Q commands. Control points
        // conservatively bound Bézier curves as well as their endpoints.
        const raw = el.getAttribute(el.tagName === 'path' ? 'd' : 'points')!;
        const nums = (raw.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        expect(nums.length % 2).toBe(0);
        for (let i = 0; i < nums.length; i += 2) point(nums[i], nums[i + 1], el);
      }
    }
  });
});
