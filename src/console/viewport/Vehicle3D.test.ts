/**
 * Tessellation and fin-bevel rules for the 3D view. These are geometry
 * construction rules, not rendering: they run without a GPU so a later edit
 * that re-facets the silhouette or grows a fin planform fails here instead of
 * being noticed on a screenshot.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { EllipticalFinSetComponent, FreeformFinSetComponent, NoseconeComponent, TrapezoidFinSetComponent } from '../../core/types';
import { PRESET_NASA_STUDENT_LAUNCH } from '../../state/presets';
import {
  BODY_RADIAL_SEGMENTS, NOSE_PROFILE_SAMPLES, NOSE_RADIAL_SEGMENTS, SEAM_TUBULAR_SEGMENTS,
  cosineStations, finBevel, finExtrudeGeometry, noseLatheGeometry, noseProfile,
} from './Vehicle3D';

const nose = (): NoseconeComponent => PRESET_NASA_STUDENT_LAUNCH.components.find((c) => c.id === 'nsl-nc') as NoseconeComponent;
const fins = (): TrapezoidFinSetComponent => PRESET_NASA_STUDENT_LAUNCH.components.find((c) => c.id === 'nsl-fins') as TrapezoidFinSetComponent;
/** The preset's overall length; the profile's y origin only needs a fixed frame. */
const L = 2.97;

describe('tessellation constants', () => {
  it('keeps the approved surface counts', () => {
    expect(BODY_RADIAL_SEGMENTS).toBe(128);
    expect(NOSE_RADIAL_SEGMENTS).toBe(128);
    expect(NOSE_PROFILE_SAMPLES).toBe(128);
    expect(SEAM_TUBULAR_SEGMENTS).toBe(160);
  });
});

describe('cosineStations', () => {
  it('spans 0 to 1 exactly, in order', () => {
    const stations = cosineStations(128);
    expect(stations).toHaveLength(129);
    expect(stations[0]).toBe(0);
    expect(stations[stations.length - 1]).toBe(1);
    for (let i = 1; i < stations.length; i++) expect(stations[i]).toBeGreaterThan(stations[i - 1]);
  });

  it('spends its samples at the tip and the shoulder', () => {
    const stations = cosineStations(128);
    const tipGap = stations[1] - stations[0];
    const shoulderGap = stations[128] - stations[127];
    const middleGap = stations[65] - stations[64];
    expect(tipGap).toBeLessThan(middleGap * 0.1);
    expect(shoulderGap).toBeLessThan(middleGap * 0.1);
    // Symmetric: the tip and shoulder get the same treatment.
    expect(shoulderGap).toBeCloseTo(tipGap, 12);
  });
});

describe('nose profile', () => {
  it('keeps the tip and shoulder endpoints and is monotone in x', () => {
    const c = nose();
    const points = noseProfile(c, 0, c.length, L);
    expect(points).toHaveLength(NOSE_PROFILE_SAMPLES + 1);
    // Tip: clamped to a drawable radius, at station 0 (world y = L).
    expect(points[0].x).toBeCloseTo(0.0004, 12);
    expect(points[0].y).toBeCloseTo(L, 12);
    // Shoulder: the authored base radius, at station `length`.
    expect(points[points.length - 1].x).toBeCloseTo(c.baseDiameter / 2, 10);
    expect(points[points.length - 1].y).toBeCloseTo(L - c.length, 10);
    for (let i = 1; i < points.length; i++) {
      expect(points[i].y).toBeLessThan(points[i - 1].y);
      expect(points[i].x).toBeGreaterThanOrEqual(0);
    }
  });

  it('draws a 128-segment lathe without holes or zero-length normals', () => {
    const c = nose();
    const geo = noseLatheGeometry(c, 0, c.length, L);
    // LatheGeometry is an indexed (rings + 1) x (radial + 1) grid; the index
    // count is the triangle budget: one quad (two triangles) per cell.
    expect(geo.getAttribute('position').count).toBe((NOSE_PROFILE_SAMPLES + 1) * (NOSE_RADIAL_SEGMENTS + 1));
    expect(geo.index?.count).toBe(NOSE_PROFILE_SAMPLES * NOSE_RADIAL_SEGMENTS * 6);
    // Every normal must be unit length: the last lathe ring (the shoulder)
    // otherwise keeps an unnormalised tangent and shades black.
    const normal = geo.getAttribute('normal');
    for (let i = 0; i < normal.count; i++) {
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      expect(length).toBeCloseTo(1, 5);
    }
    geo.dispose();
  });
});

describe('fin bevel', () => {
  it('stays within the approved bevel limits', () => {
    const b = finBevel(0.0048);
    // 0.25 x 4.8 mm = 1.2 mm, capped at 0.6 mm.
    expect(b.bevelSize).toBeCloseTo(0.0006, 12);
    expect(b.bevelSize).toBeLessThanOrEqual(0.0006);
    expect(b.bevelSize).toBeLessThanOrEqual(0.25 * 0.0048);
    expect(b.bevelSegments).toBeGreaterThanOrEqual(2);
    expect(b.bevelSegments).toBeLessThanOrEqual(3);
    // A thin fin gets a proportionally thinner round, never a zero depth.
    const thin = finBevel(0.0008);
    expect(thin.bevelSize).toBeCloseTo(0.0002, 12);
    expect(thin.depth).toBeGreaterThan(0);
  });

  it('keeps the trapezoid planform exactly on the authored span and chord (the bevel must not grow it)', () => {
    const c = fins();
    const root = 0.076;
    const geo = finExtrudeGeometry(c, root);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const spanLo = root * 0.995;
    const chord = Math.max(c.rootChord, c.sweepLength + c.tipChord);
    expect(Math.abs(box.min.x - spanLo)).toBeLessThan(1e-6);
    expect(Math.abs(box.max.x - (spanLo + c.span))).toBeLessThan(1e-6);
    expect(Math.abs(box.min.y - -chord)).toBeLessThan(1e-6);
    expect(Math.abs(box.max.y)).toBeLessThan(1e-6);
    // The round is in the faces, not the thickness: same depth, still centred.
    expect(box.max.z - box.min.z).toBeCloseTo(c.thickness, 6);
    expect(box.max.z + box.min.z).toBeCloseTo(0, 9);
    geo.dispose();
  });

  it('keeps an arbitrary freeform planform exact', () => {
    const freeform: FreeformFinSetComponent = {
      id: 'ff', name: 'freeform', type: 'freeformfinset', finCount: 3, materialId: 'carbonfiber',
      thickness: 0.003, crossSection: 'square', axialOffset: 0.4,
      points: [{ x: 0, y: 0 }, { x: 0.05, y: 0.12 }, { x: 0.14, y: 0.11 }, { x: 0.16, y: 0 }, { x: 0, y: 0 }],
    };
    const root = 0.05;
    const geo = finExtrudeGeometry(freeform, root);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    const spanLo = root * 0.995;
    const span = 0.12;
    const chord = 0.16;
    expect(Math.abs(box.min.x - spanLo)).toBeLessThan(1e-6);
    expect(Math.abs(box.max.x - (spanLo + span))).toBeLessThan(1e-6);
    expect(Math.abs(box.min.y - -chord)).toBeLessThan(1e-6);
    expect(Math.abs(box.max.y)).toBeLessThan(1e-6);
    geo.dispose();
  });

  it('smooths normals across the bevel and keeps the flat faces flat', () => {
    const geo = finExtrudeGeometry(fins(), 0.076);
    const position = geo.getAttribute('position');
    const normal = geo.getAttribute('normal');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let smoothed = 0;
    let caps = 0;
    for (let f = 0; f < position.count; f += 3) {
      a.fromBufferAttribute(position, f);
      b.fromBufferAttribute(position, f + 1);
      c.fromBufferAttribute(position, f + 2);
      const face = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
      if (Math.abs(face.z) > 0.9999) {
        // A cap triangle: every one of its vertex normals is the face normal.
        caps++;
        for (let v = 0; v < 3; v++) {
          const n = new THREE.Vector3().fromBufferAttribute(normal, f + v);
          expect(n.distanceTo(face)).toBeLessThan(1e-6);
        }
        continue;
      }
      for (let v = 0; v < 3; v++) {
        const n = new THREE.Vector3().fromBufferAttribute(normal, f + v);
        if (Math.abs(n.dot(face)) < 0.99999) smoothed++;
      }
    }
    // Caps exist and are flat; the bevel carries smoothed normals.
    expect(caps).toBeGreaterThan(0);
    expect(smoothed).toBeGreaterThan(0);
    geo.dispose();
  });

  it('turns an elliptical planform into the same half-ellipse outline', () => {
    const elliptical: EllipticalFinSetComponent = {
      id: 'el', name: 'elliptical', type: 'ellipticalfinset', finCount: 4, materialId: 'carbonfiber',
      rootChord: 0.2, span: 0.1, thickness: 0.003, axialOffset: 0.4,
    };
    const root = 0.05;
    const geo = finExtrudeGeometry(elliptical, root);
    geo.computeBoundingBox();
    const box = geo.boundingBox!;
    expect(Math.abs(box.min.x - root * 0.995)).toBeLessThan(1e-6);
    expect(Math.abs(box.max.x - (root * 0.995 + elliptical.span))).toBeLessThan(1e-6);
    expect(Math.abs(box.min.y - -elliptical.rootChord)).toBeLessThan(1e-6);
    expect(Math.abs(box.max.y)).toBeLessThan(1e-6);
    geo.dispose();
  });

  it('stays finite for a zero or near-zero thickness', () => {
    for (const thickness of [0, 1e-6]) {
      const b = finBevel(thickness);
      for (const value of Object.values(b)) expect(Number.isFinite(value)).toBe(true);
      const geo = finExtrudeGeometry({
        id: 'thin', name: 'thin', type: 'ellipticalfinset', finCount: 3, materialId: 'balsa',
        rootChord: 0.1, span: 0.05, thickness, axialOffset: 0.2,
      }, 0.03);
      const position = geo.getAttribute('position');
      const normal = geo.getAttribute('normal');
      for (let i = 0; i < position.count * 3; i++) expect(Number.isFinite(position.array[i])).toBe(true);
      for (let i = 0; i < normal.count * 3; i++) expect(Number.isFinite(normal.array[i])).toBe(true);
      geo.dispose();
    }
  });
});
