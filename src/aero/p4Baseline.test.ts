/**
 * Pre-fix TS stability baseline writer for the P4 fin-station lane.
 *
 * Run at the lane base before the production edit with
 * `ASTRAEA_P4_WRITE_BASELINE=<path> vitest run src/aero/p4Baseline.test.ts`
 * to write the committed fixture `p4-stability-baseline-ts.json`. The fixture
 * anchors the acceptance (a) bit-identity proof for the TypeScript mirror:
 * designs whose fins sit on the last body component must reproduce it exactly.
 *
 * The default run also pins the committed vehicle JSON fixtures to the shipped
 * presets so a preset edit cannot drift away from the Rust fixture silently.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PRESET_ESTES_ALPHA, PRESET_NASA_STUDENT_LAUNCH, PRESET_SPACEPORT_AMERICA } from '../state/presets';
import { ARCAS_SHORT, ARCAS_LONG } from '../validation/arcas/arcas-vehicle';
import { computeRocketStability } from './barrowman';
import type { RocketVehicle } from '../core/types';

const FIXTURE_DIR = fileURLToPath(new URL('../../crates/astraea-engine/tests/fixtures/', import.meta.url));

function loadVehicle(name: string): RocketVehicle {
  return JSON.parse(new TextDecoder().decode(readFileSync(FIXTURE_DIR + name))) as RocketVehicle;
}

function geometryOf(vehicle: RocketVehicle) {
  return vehicle.components.map((c) => {
    const { name: _name, color: _color, notes: _notes, ...rest } = c as unknown as Record<string, unknown>;
    return rest;
  });
}

function record(vehicle: RocketVehicle) {
  const s = computeRocketStability(vehicle);
  return {
    totalCna: s.totalCNa,
    cp: s.cp,
    staticMarginCalibers: s.staticMarginCalibers,
    cg: s.cg,
    totalLength: s.totalLength,
    referenceDiameter: s.referenceDiameter,
    contributions: s.contributions
      .filter((c) => c.cna !== undefined && c.cp !== undefined)
      .map((c) => ({ id: c.id, cna: c.cna, cp: c.cp })),
  };
}

const DESIGNS: Array<[string, RocketVehicle, string]> = [
  ['alpha', PRESET_ESTES_ALPHA, 'unaffected: fins on the last body component (tube)'],
  ['nasa-sl', PRESET_NASA_STUDENT_LAUNCH, 'unaffected: fins on the last body component (booster tube)'],
  ['spaceport', PRESET_SPACEPORT_AMERICA, 'affected: boattail follows the fin set; root wholly on the tube'],
  ['arcas-short', ARCAS_SHORT, 'affected: root straddles tube/boattail (54.4% tube)'],
  ['arcas-long', ARCAS_LONG, 'affected: root straddles tube/boattail (54.4% tube)'],
];

describe('P4 pre-fix TS baseline', () => {
  it('vehicle JSON fixtures match the shipped presets (geometry)', () => {
    expect(geometryOf(loadVehicle('spaceport-vehicle.json'))).toEqual(geometryOf(PRESET_SPACEPORT_AMERICA));
    expect(geometryOf(loadVehicle('nasa-sl-vehicle.json'))).toEqual(geometryOf(PRESET_NASA_STUDENT_LAUNCH));
  });

  it('writes or skips', () => {
    const out = process.env.ASTRAEA_P4_WRITE_BASELINE;
    if (!out) {
      expect(true).toBe(true);
      return;
    }
    const doc = {
      note: 'Immutable pre-fix Barrowman stability baseline (TypeScript mirror) for the P4 fin-station lane. Generated before the production edit; unaffected designs must match bit-for-bit afterward.',
      baseCommit: 'be40032421b041b60118fbb9197b6ad1c1be2a69',
      designs: Object.fromEntries(
        DESIGNS.map(([id, vehicle, role]) => [id, { role, stability: record(vehicle) }]),
      ),
    };
    writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
  });
});
