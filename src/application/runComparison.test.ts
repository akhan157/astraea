import { describe, expect, it } from 'vitest';
import { archivedValueDifferences, compareRunInputs, MAX_INPUT_DIFFERENCES } from './runComparison';
import { captureRunInputs, type RunInputs } from './runInputs';
import { readProject } from '../formats/projectJson';
import oldDocument from '../formats/__fixtures__/project-main-1.0.0.json';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';

function inputs() {
  const p = readProject(JSON.stringify(oldDocument));
  return structuredClone(captureRunInputs(p, { id: 'test-c6', motor: structuredClone(CERTIFIED_MOTORS.estes_c6), provenance: { source: 'import', sourceFile: 'synthetic.eng' } }, 'original', undefined));
}
const group = (a: RunInputs, b: RunInputs, index = 0) => compareRunInputs(a, b)![index];

describe('read-only archived input differences', () => {
  it('compares identical archives without mutating them or using incidental capture time/key', () => {
    const a = inputs(), b = structuredClone(a);
    b.capturedAt = '2026-10-27T00:00:00Z'; b.inputKey = 'different-label';
    const before = JSON.stringify([a, b]);
    expect(compareRunInputs(a, b)!.every(g => g.total === 0)).toBe(true);
    expect(JSON.stringify([a, b])).toBe(before);
  });
  it('ignores object key order but retains array order and missing/null/zero distinctions', () => {
    expect(archivedValueDifferences({ a: 1, b: 2 }, { b: 2, a: 1 }).total).toBe(0);
    expect(archivedValueDifferences([1, 2], [2, 1]).total).toBe(2);
    const d = archivedValueDifferences({}, { zero: 0, nil: null });
    expect(d.total).toBe(2);
    expect(d.rows.map(r => r.baseline)).toEqual(['absent (not zero or null)', 'absent (not zero or null)']);
    expect(d.rows.map(r => r.variant)).toEqual(['null', '0']);
  });
  it('treats inherited-looking missing JSON keys as absent', () => {
    const d = archivedValueDifferences({}, JSON.parse('{"__proto__":{"x":1},"constructor":null}'));
    expect(d.total).toBe(2);
    expect(d.rows.every(r => r.baseline === 'absent (not zero or null)')).toBe(true);
  });
  it('does not round away adjacent floating values', () => {
    expect(archivedValueDifferences(1, 1 + Number.EPSILON).rows[0]).toMatchObject({ baseline: '1', variant: '1.0000000000000002' });
  });
  it('returns unknown for missing original archives, not inferred defaults', () => {
    expect(compareRunInputs(undefined, inputs())).toBeNull();
    expect(compareRunInputs(inputs(), undefined)).toBeNull();
    expect(compareRunInputs()).toBeNull();
  });
  it('detects a same-label, same-input-key changed motor curve by actual content', () => {
    const a = inputs(), b = structuredClone(a);
    b.motorRecord.motor.thrustCurve[1].thrust += 0.125;
    const d = group(a, b);
    expect(d.total).toBe(1);
    expect(d.rows[0].path).toContain('["thrustCurve"][1]["thrust"]');
    expect(group(a, b, 3).total).toBe(0);
  });
  it.each(['vehicle', 'options', 'mechanics', 'scale', 'sampler'] as const)('reports archived %s changes', kind => {
    const a = inputs(), b = structuredClone(a);
    if (kind === 'vehicle') b.vehicle.components[0].massOverride = 0.5;
    if (kind === 'options') { b.engineOptions.railLength += 1; b.engineOptions.mainDeployAltitudeAGL += 2; }
    if (kind === 'mechanics') b.finShearModulusPa = 5e9;
    if (kind === 'scale') b.engineOptions.dragCdScale = 0.9;
    if (kind === 'sampler') b.ensemble = { ...b.context.workspace.ensemble, version: 'per-run-v2', seed: 1234, nRuns: 8 };
    expect(group(a, b).total).toBeGreaterThan(0);
  });
  it('keeps source-label/mission/weather/requested-setting changes separate from invocation', () => {
    const a = inputs(), b = structuredClone(a);
    b.motorRecord.motor.id = 'other-label'; b.motorRecord.provenance.sourceFile = 'same-curve-new-label.eng';
    b.context.mission.name = 'Other mission';
    b.context.workspace.ensemble.seed++;
    b.context.weather.push({ id: 'synthetic', kind: 'weather', source: 'synthetic-only', createdAt: '2026-10-26T00:00:00Z', data: [{ altitudeM: 10, speedMs: 99, directionFromDeg: 0, tempC: 15, pressureHpa: 1000 }] });
    // Vehicle's motor assignment has not changed; only the archive's motor label.
    expect(group(a, b).total).toBe(0);
    expect(group(a, b, 3).total).toBeGreaterThan(0);
    expect(group(a, b, 3).note).toMatch(/surface wind only/);
  });
  it('separates calibration provenance from the actual invoked scale', () => {
    const a = inputs();
    a.dragCalibration = { scale: 1, fittedCd: 0.5, modelCd: 0.5, rmseN: 0.1, coastMassKg: 0.05,
      source: { fileName: 'synthetic.csv', sha256Hex: 'unavailable', rowCount: 20 },
      window: { startS: 2, endS: 3, method: 'velocity-column', pointsUsed: 16, pointsExcluded: 4 }, appliedAt: '2026-10-26T00:00:00Z' };
    const b = structuredClone(a); b.dragCalibration!.source.fileName = 'renamed.csv';
    expect(group(a, b).total).toBe(0);
    expect(group(a, b, 2).rows[0].path).toContain('["source"]["fileName"]');
    expect(group(a, b, 2).note).toMatch(/not present applicability/);
  });
  it('reports v1 absence as declaration metadata, without inventing or changing invocation', () => {
    const a = inputs(); const { flightModel: _model, ...rest } = a;
    const old: RunInputs = { ...rest, version: 1 };
    expect(group(old, a).total).toBe(0);
    expect(group(old, a, 1).total).toBe(1);
    expect(group(old, a, 1).note).toMatch(/no original declaration/);
    expect(old).not.toHaveProperty('flightModel');
  });
  it('bounds rows and long cells with explicit omission disclosures', () => {
    const d = archivedValueDifferences(Array(120).fill(0), Array(120).fill(1));
    expect(d.total).toBe(120); expect(d.rows).toHaveLength(MAX_INPUT_DIFFERENCES); expect(d.omitted).toBe(20);
    const long = archivedValueDifferences('', 'x'.repeat(800)).rows[0].variant;
    expect(long.length).toBeLessThan(650); expect(long).toMatch(/full value in exported project archive/);
  });
});
