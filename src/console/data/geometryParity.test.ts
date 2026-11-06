/**
 * The two native rollups must describe the same vehicle.
 *
 * `stability` (legacy) publishes the axial extents and the per-part mass/CG as
 * its contributions; `aggregate_mass` is the model-independent geometry+mass
 * command the built-up (beta) layout falls back to when the selected aero
 * model publishes no breakdown. Those are two implementations in the core, so
 * this test pins them together for every shipped preset. The same comparison
 * covers the derived layouts, the camera silhouette/bounds and the motor
 * mount station, which are the surfaces the beta layout change touches.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH, PRESET_SPACEPORT_AMERICA } from '../../state/presets';
import { aggregateMassOf, stabilityOf } from '../../tauri/bridge';
import { stabilityBreakdown } from './adapter';
import { layoutFrom, layoutFromGeometry, motorAftStation } from '../viewport/Vehicle3D';
import { silhouettePoints } from '../viewport/framing';
import { sectionJoints, vehicleBounds } from '../viewport/appearance';
import { instantiateEngine, type EngineInstance } from '../../engine/core';
import { setTestEngine } from '../../engine';

let engine: EngineInstance;

beforeAll(async () => {
  engine = await instantiateEngine(readFileSync(fileURLToPath(new URL('../../engine/astraea_engine.wasm', import.meta.url))));
  setTestEngine((async (cmd: string, args?: Record<string, unknown>) => engine.call(cmd, args)) as never);
});
afterAll(() => setTestEngine(null));

const PRESETS = [
  ['Estes Alpha III', PRESET_ESTES_ALPHA],
  ['NASA Student Launch', PRESET_NASA_STUDENT_LAUNCH],
  ['Spaceport America', PRESET_SPACEPORT_AMERICA],
] as const;

describe.each(PRESETS)('%s rollup parity', (_name, vehicle) => {
  it('aggregate_mass stations, CG and mass equal the legacy layout parts', async () => {
    const mass = await aggregateMassOf(vehicle);
    const breakdown = stabilityBreakdown(await stabilityOf(vehicle), vehicle);
    expect(breakdown.parts.length).toBeGreaterThan(0);
    expect(mass.components).toHaveLength(breakdown.parts.length);

    const byId = new Map(mass.components.map((c) => [c.id, c]));
    for (const part of breakdown.parts) {
      const component = byId.get(part.id);
      expect(component, `aggregate_mass must publish '${part.id}'`).toBeDefined();
      expect(component!.axialStart).toBe(part.axialStart);
      expect(component!.axialEnd).toBe(part.axialEnd);
      expect(component!.globalCG).toBeCloseTo(part.cg, 12);
      expect(component!.mass).toBeCloseTo(part.mass, 12);
    }
    expect(mass.cg).toBeCloseTo(breakdown.cg.value, 12);
    expect(mass.totalMass).toBeCloseTo(breakdown.totalMass.value, 12);

    // The layouts the two sources produce are the same shape at the same stations.
    const fromModel = layoutFrom(breakdown);
    const fromGeometry = layoutFromGeometry(mass);
    expect(fromGeometry.length).toBe(fromModel.length);
    expect(fromGeometry.refR).toBe(fromModel.refR);
    expect(Object.keys(fromGeometry.parts).sort()).toEqual(Object.keys(fromModel.parts).sort());
    for (const id of Object.keys(fromModel.parts)) {
      expect(fromGeometry.parts[id].start).toBe(fromModel.parts[id].start);
      expect(fromGeometry.parts[id].end).toBe(fromModel.parts[id].end);
      expect(fromGeometry.parts[id].cg).toBeCloseTo(fromModel.parts[id].cg, 12);
      expect(fromGeometry.parts[id].mass).toBeCloseTo(fromModel.parts[id].mass, 12);
    }

    // Framing reads the same layout: silhouette points and bounds agree.
    const modelPoints = silhouettePoints(vehicle, fromModel, false);
    const geometryPoints = silhouettePoints(vehicle, fromGeometry, false);
    expect(geometryPoints).toHaveLength(modelPoints.length);
    expect(geometryPoints.length).toBeGreaterThan(2);
    for (let i = 0; i < modelPoints.length; i++) {
      expect(geometryPoints[i].x).toBeCloseTo(modelPoints[i].x, 9);
      expect(geometryPoints[i].y).toBeCloseTo(modelPoints[i].y, 9);
      expect(geometryPoints[i].z).toBeCloseTo(modelPoints[i].z, 9);
    }
    expect(vehicleBounds(vehicle, fromGeometry)).toEqual(vehicleBounds(vehicle, fromModel));
    expect(sectionJoints(vehicle, fromGeometry)).toEqual(sectionJoints(vehicle, fromModel));

    // The motor mount station resolves through the geometry layout, never the fallback.
    const mount = [...vehicle.components].reverse().find((c) => c.type === 'bodytube' && c.isMotorMount)
      ?? [...vehicle.components].reverse().find((c) => c.type === 'bodytube');
    expect(mount).toBeDefined();
    expect(motorAftStation(vehicle, fromGeometry)).toBe(fromGeometry.parts[mount!.id].end);
    // Without that part the station falls back to the layout end, and a vehicle
    // with no body tube has no station at all (no invented motor placement).
    expect(motorAftStation(vehicle, { ...fromGeometry, parts: {} })).toBe(fromGeometry.length);
    const noTube = { ...vehicle, components: vehicle.components.filter((c) => c.type !== 'bodytube') };
    expect(motorAftStation(noTube, fromGeometry)).toBeNull();
  });
});
