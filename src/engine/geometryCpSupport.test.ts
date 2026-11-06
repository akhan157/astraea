/**
 * Geometry CP support on the shipped WebAssembly bytes through the real
 * bridge: a vehicle whose slopes cancel gets no CP/margin/verdict (the flight
 * engine refuses the same vehicle), while supported presets are unchanged.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH } from '../state/presets';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import type { RocketVehicle } from '../core/types';
import { simulateFlight, stabilityOf } from '../tauri/bridge';
import { instantiateEngine, type EngineInstance } from './core';
import { setTestEngine, type EngineInvoke } from './index';
import { answer } from '../copilot/assistant';
import { nativeEngine } from '../copilot/engine';

let engine: EngineInstance;
/** The raw engine reply of the last call, before the bridge qualifies it. */
let lastRaw: unknown;
beforeAll(async () => {
  engine = await instantiateEngine(readFileSync(fileURLToPath(new URL('./astraea_engine.wasm', import.meta.url))));
  setTestEngine((async (cmd: string, args?: Record<string, unknown>) => (lastRaw = engine.call(cmd, args))) as EngineInvoke);
});
afterAll(() => setTestEngine(null));

function finlessTailCone(aftFraction: number): RocketVehicle {
  const v = structuredClone(PRESET_ESTES_ALPHA);
  const tube = v.components.find((c) => c.type === 'bodytube');
  if (!tube || tube.type !== 'bodytube') throw new Error('preset without body tube');
  const d = tube.outerDiameter;
  v.components = v.components.filter((c) => !c.type.includes('fin'));
  v.components.splice(v.components.indexOf(tube) + 1, 0, { id: 'tail', name: 'Tail cone', type: 'transition', length: 0.06,
    foreDiameter: d, aftDiameter: aftFraction * d, wallThickness: 0.0002, isHollow: true, materialId: tube.materialId });
  return v;
}

describe('geometry CP support on shipped WASM', () => {
  it('withholds CP, margin and verdict exactly where the flight engine refuses the slope', async () => {
    const v = finlessTailCone(0.0005);
    const s = await stabilityOf(v);
    expect(s.cpUnavailable).toBeDefined();
    expect(s.cp).toBeNaN();
    expect(s.staticMarginCalibers).toBeNaN();
    expect([s.isStable, s.isOverStable]).toEqual([false, false]);
    expect(Math.abs(s.totalCNa)).toBeLessThan(1e-4);
    expect(s.contributions.find((c) => c.id === 'tail')?.cna).toBeLessThan(-1.9);
    await expect(simulateFlight(v, CERTIFIED_MOTORS.estes_c6, { railLength: 1, railElevationDeg: 85, railAzimuthDeg: 0,
      windSpeedSurface: 2, windAzimuthDeg: 0, finCantAngleDeg: 0, mainDeployAltitudeAGL: 50 })).rejects.toThrow(/unsupported total CNalpha/);
  });

  it('copilot keeps unsupported quantities unknown, retains modeled CG and offers no stability fix', async () => {
    const ctx = { vehicle: finlessTailCone(0.0005), engine: nativeEngine, flightCase: null };
    const explained = await answer('why is my rocket overstable', ctx);
    for (const label of ['Static margin', 'CP from nose tip']) {
      const quantity = explained.quantities!.find((q) => q.label === label)!.value;
      expect(quantity.value).toBeNaN();
      expect(quantity.confidence).toBe('Unknown');
      expect(quantity.confidenceReason).toContain('no margin or verdict');
    }
    const cg = explained.quantities!.find((q) => q.label === 'CG from nose tip')!.value;
    expect(Number.isFinite(cg.value)).toBe(true);
    expect(cg.confidence).toBe('Modeled');
    const suggestions = await answer('how do I fix it', ctx);
    for (const id of ['stability-low', 'stability-high']) {
      const check = suggestions.checks!.find((r) => r.id === id)!;
      expect(check.status).toBe('not-evaluated');
      expect(check.value).toBeUndefined();
      expect(check.message).toContain('no margin or verdict');
    }
    expect(suggestions.fixes?.filter((fix) => fix.checkId.startsWith('stability-')) ?? []).toEqual([]);
  });

  it('a supported but unstable finless vehicle keeps its engine CP and margin unchanged', async () => {
    const s = await stabilityOf(finlessTailCone(0.3));
    expect(s.cpUnavailable).toBeUndefined();
    expect(Number.isFinite(s.cp) && s.staticMarginCalibers < 0 && !s.isStable).toBe(true);
  });

  it.each([['Estes Alpha', PRESET_ESTES_ALPHA], ['NASA Student Launch', PRESET_NASA_STUDENT_LAUNCH]] as const)('%s preset passes through untouched', async (_n, preset) => {
    const qualified = await stabilityOf(preset);
    expect(qualified).toBe(lastRaw);
    expect(qualified.cpUnavailable).toBeUndefined();
  });
});
