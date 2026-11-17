/**
 * K3 review, blocking 1: an applied drag calibration must never multiply the built-up default.
 *
 * A scale is fitted against the legacy drag tables. A project that holds one and made no explicit
 * drag choice therefore keeps flying the legacy tables (the scale applied, as before the default
 * existed); the choice is resolved at the dispatch boundary, never written into the project, so the
 * artifact's recorded fit identity does not move. An explicit choice always wins.
 *
 * Every test here fails on e613f8a, where the same project dispatched `flightDragSource: 'calibrated'`
 * with the scale on top.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { presetOf } from '../state/project';
import { createProjectEnvelope, readProject, writeProject } from '../formats/projectJson';
import { DEFAULT_WORKSPACE } from './workspace';
import { designOf } from '../console/design';
import { sixDofOptions } from '../console/data/adapter';
import { setTestEngine, type EngineInvoke } from '../engine';
import { simulateFlight } from '../tauri/bridge';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { captureRunInputs } from './runInputs';
import { fitDragScale } from '../evidence/dragFit';
import { buildLogProvenance } from '../evidence/logProvenance';
import { buildDragCalibration, type DragCalibration } from './dragCalibration';
import { LEGACY_FLIGHT_MODEL } from './flightModel';
import { AERO_MODEL_VERSION, type AeroModelSelection } from './aeroModel';
import type { RocketVehicle } from '../core/types';

afterEach(() => setTestEngine(null));

const SELECTION: AeroModelSelection = { modelId: 'aero-buildup', modelVersion: AERO_MODEL_VERSION, terms: { transonic: 'legacy' } };
const motorRecord = { id: 'aerotech_k550w', motor: CERTIFIED_MOTORS.aerotech_k550w, provenance: { source: 'certified' as const } };

/** A pre-provenance artifact: retained and applied under the legacy policy. */
const LEGACY_ARTIFACT = {
  scale: 0.9, fittedCd: 0.45, modelCd: 0.5, rmseN: 0.1, coastMassKg: 0.05,
  source: { fileName: 'legacy.csv', sha256Hex: 'f'.repeat(64), rowCount: 40 },
  window: { startS: 2, endS: 7, method: 'velocity-column', pointsUsed: 30, pointsExcluded: 10 },
  appliedAt: '2026-10-27T00:00:00.000Z',
} as DragCalibration;

/** A provenance artifact bound to the exact uncalibrated case `fitKey` names. */
async function provenanceArtifact(fitKey: string): Promise<DragCalibration> {
  const samples = Array.from({ length: 351 }, (_, i) => {
    const timeS = i / 50;
    return { timeS, altitudeM: 100 + 80 * timeS - 6 * timeS ** 2, velocityMs: 80 - 12 * timeS };
  });
  const fit = fitDragScale({
    log: samples, coastMassKg: 1, refAreaM2: 0.01, launchElevationM: 100,
    modelTelemetry: samples.filter((_, i) => i % 2 === 0).map((p) => ({ time: p.timeS, altitude: p.altitudeM, velocity: { z: p.velocityMs } })),
  });
  const side = {
    burnout: { earliestS: -1.1, latestS: -1, source: 'Controlled burnout' },
    recovery: { kind: 'first-event' as const, event: { earliestS: 7, latestS: 7.1, source: 'Controlled recovery' } },
    verticalMotion: { status: 'supported' as const, source: 'Controlled vertical' },
    constantMass: { status: 'supported' as const, source: 'Controlled mass' },
  };
  const log = await buildLogProvenance({ rawText: 'controlled fixture', fileName: 'controlled.csv', rowCount: samples.length });
  return buildDragCalibration(fit, log, '2026-10-28T00:00:00.000Z', LEGACY_FLIGHT_MODEL,
    { log: side, model: side }, fitKey, 'fnv1a32:01234567');
}

function project(opts: { calibration?: DragCalibration; choice?: RocketVehicle['flightDragSource'] } = {}) {
  const preset = presetOf('nasaStudent')!;
  const vehicle = { ...preset.vehicle, ...(opts.choice === undefined ? {} : { flightDragSource: opts.choice }) };
  const workspace = { ...DEFAULT_WORKSPACE, motorId: preset.motorId, launch: { ...DEFAULT_WORKSPACE.launch, ...preset.launch } };
  return {
    project: createProjectEnvelope({ vehicle, workspace, mission: preset.mission, ...(opts.calibration === undefined ? {} : { dragCalibration: opts.calibration }) }),
    mission: preset.mission,
  };
}

function seenOptions(): { seen: Array<Record<string, unknown>> } {
  const seen: Array<Record<string, unknown>> = [];
  setTestEngine((async (_cmd: string, args?: Record<string, unknown>) => {
    seen.push((args?.options ?? {}) as Record<string, unknown>);
    return {
      apogeeAltitude: 1, apogeeTime: 1, apogeePosition: { x: 0, y: 0, z: 0 }, maxVelocity: 1, maxMach: 0.1,
      maxAccelerationG: 1, burnoutAltitude: 1, burnoutVelocity: 1, burnoutTime: 1, railExitVelocity: 1,
      isRailExitSafe: true, weathercockAngleDeg: 0, landingPosition: { x: 0, y: 0, z: 0 }, landingDistance: 0,
      landingVelocity: 1, landingKineticEnergy: 1, isLandingSafe: true, isLandingVelocitySafe: true,
      terminated: true, terminationReason: 'touchdown', touchdownNominal: true, unsupportedHandling: 'documented',
      runManifest: {}, landingMass: 1, flightDuration: 1, validity: 'PASS', enveloped: true,
      offNominalExcursion: false, events: [], telemetry: [],
    } as never;
  }) as EngineInvoke);
  return { seen };
}

describe.each([
  ['a legacy artifact (no provenance)', async () => LEGACY_ARTIFACT],
  ['a provenance artifact bound to the stored vehicle', async () => {
    const key = designOf(project().project, project().mission).calibrationFitInputKey;
    if (key === null) throw new Error('the controlled case did not key');
    return provenanceArtifact(key);
  }],
] as const)('an applied calibration, %s, with no explicit drag choice', (_name, make) => {
  it('stays active, resolves the legacy tables in the design, and writes nothing into the project', async () => {
    const artifact = await make();
    const { project: p, mission } = project({ calibration: artifact });
    const design = designOf(p, mission);
    expect(design.calibrationApplicability.status).toBe('active');
    expect(design.options.dragCdScale).toBe(artifact.scale);
    expect(design.vehicle.flightDragSource).toBe('legacy');
    expect(p.vehicle.flightDragSource).toBeUndefined();
    // The recorded fit identity is computed on the stored vehicle and has not moved.
    expect(design.calibrationFitInputKey).toBe(designOf(project().project, project().mission).calibrationFitInputKey);
  });

  it('dispatches the legacy tables with the scale applied, never the built-up default', async () => {
    const artifact = await make();
    const { project: p, mission } = project({ calibration: artifact });
    const design = designOf(p, mission);
    const { seen } = seenOptions();
    await simulateFlight(design.vehicle, CERTIFIED_MOTORS[design.motorId], sixDofOptions(design.options));
    expect(seen[0]).not.toHaveProperty('flightDragSource');
    expect(seen[0].dragCdScale).toBe(artifact.scale);
    // A caller that passes the raw stored vehicle with the scale gets the same dispatch (bridge safety net).
    await simulateFlight(p.vehicle, CERTIFIED_MOTORS[design.motorId], sixDofOptions(design.options));
    expect(seen[1]).not.toHaveProperty('flightDragSource');
    expect(seen[1].dragCdScale).toBe(artifact.scale);
  });

  it('archives what it flew, and the archive loads', async () => {
    const artifact = await make();
    const { project: p, mission } = project({ calibration: artifact });
    const design = designOf(p, mission);
    const full = { ...p, motorRecords: [motorRecord] };
    const inputs = captureRunInputs(full, motorRecord, 'key', design.dragCalibration, undefined, undefined, sixDofOptions(design.options));
    // K3 review (commit 5): the archive keeps the user's DECLARATION (no choice); what was flown (legacy tables,
    // the scale) is in the engine options and is re-derived from declaration + archived calibration on load.
    // Old meaning: the archived vehicle carried the resolved 'legacy', which "Load saved inputs" then restored,
    // changing the vehicle's fit key and deactivating a provenance-bearing calibration.
    expect(inputs.vehicle.flightDragSource).toBeUndefined();
    expect(inputs.engineOptions).not.toHaveProperty('flightDragSource');
    expect(inputs.engineOptions.dragCdScale).toBe(artifact.scale);
    expect(inputs.dragCalibration?.scale).toBe(artifact.scale);
    const doc = JSON.parse(writeProject(full)) as Record<string, any>;
    doc.cases = [{ id: 'case-1', kind: 'flight', createdAt: '2026-11-15T00:00:00.000Z', motorRecordId: motorRecord.id, inputs: structuredClone(inputs), summary: { inputKey: 'key' } }];
    expect(() => readProject(JSON.stringify(doc))).not.toThrow();
    // A built-up option cannot be smuggled in next to a held scale: nothing derives it.
    doc.cases[0].inputs.engineOptions.flightDragSource = 'calibrated';
    expect(() => readProject(JSON.stringify(doc))).toThrow(/flightDragSource is not derived/);
  });
});

describe('explicit choices keep their meaning with a held calibration', () => {
  it("'legacy' dispatches no drag option and the scale", () => {
    const { project: p, mission } = project({ calibration: LEGACY_ARTIFACT, choice: 'legacy' });
    const design = designOf(p, mission);
    const { seen } = seenOptions();
    return simulateFlight(design.vehicle, CERTIFIED_MOTORS[design.motorId], sixDofOptions(design.options)).then(() => {
      expect(seen[0]).not.toHaveProperty('flightDragSource');
      expect(seen[0].dragCdScale).toBe(LEGACY_ARTIFACT.scale);
    });
  });

  it("the old explicit 'calibrated' opt-in still flies built-up drag with the scale on top (its old, explicit meaning)", async () => {
    const { project: p, mission } = project({ calibration: LEGACY_ARTIFACT, choice: 'calibrated' });
    const design = designOf(p, mission);
    expect(design.vehicle.flightDragSource).toBe('calibrated');
    const { seen } = seenOptions();
    await simulateFlight(design.vehicle, CERTIFIED_MOTORS[design.motorId], sixDofOptions(design.options), SELECTION);
    expect(seen[0].flightDragSource).toBe('calibrated');
    expect(seen[0].dragCdScale).toBe(LEGACY_ARTIFACT.scale);
  });
});

describe('with no calibration the default is unchanged', () => {
  it('dispatches the built-up default, and a scale of exactly 1 is not a calibration', async () => {
    const { project: p, mission } = project();
    const design = designOf(p, mission);
    expect(design.vehicle).toBe(p.vehicle);
    const { seen } = seenOptions();
    await simulateFlight(design.vehicle, CERTIFIED_MOTORS[design.motorId], sixDofOptions(design.options));
    await simulateFlight(p.vehicle, CERTIFIED_MOTORS[design.motorId], { ...sixDofOptions(design.options), dragCdScale: 1 });
    expect(seen[0].flightDragSource).toBe('calibrated');
    expect(seen[1].flightDragSource).toBe('calibrated');
  });
});
