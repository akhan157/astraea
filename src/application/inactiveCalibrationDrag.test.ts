/**
 * K3 review (commit 4), findings 1 and 3.
 *
 * 1. Only an ACTIVE drag calibration (its scale rides the runs) may force the legacy tables. A retained
 *    but inactive artifact (fit inputs or model binding no longer match, so its scale is excluded) is
 *    history: a project holding one must fly, key, capture and archive exactly like the same project
 *    without it, so removing that history can never move a run or its apogee.
 * 3. The vehicle a dispatch really flies is resolved once and reused for the engine request, the
 *    admission rule AND the recorded metadata: no recorded "built-up drag requested" for a flight that
 *    flew the legacy tables. These go through the real bridge (only the engine invoke is a test double).
 *
 * Every test here fails on edd5f88.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { presetOf } from '../state/project';
import { createProjectEnvelope } from '../formats/projectJson';
import { DEFAULT_WORKSPACE } from './workspace';
import { designOf } from '../console/design';
import { resolveRun } from '../console/store';
import { sixDofOptions, runFlight, runMonteCarlo } from '../console/data/adapter';
import { setTestEngine } from '../engine';
import { simulateFlight } from '../tauri/bridge';
import { CERTIFIED_MOTORS } from '../propulsion/motorDatabase';
import { captureRunInputs } from './runInputs';
import { stableStringify } from './caseResolver';
import { fitDragScale } from '../evidence/dragFit';
import { buildLogProvenance } from '../evidence/logProvenance';
import { buildDragCalibration, type DragCalibration } from './dragCalibration';
import { LEGACY_FLIGHT_MODEL } from './flightModel';
import { AERO_MODEL_VERSION, type AeroModelSelection } from './aeroModel';
import { chunkLandings, flightResultForRequest, installTestEngine } from '../console/testFixtures';
import type { RocketVehicle } from '../core/types';

afterEach(() => setTestEngine(null));

const SELECTION: AeroModelSelection = { modelId: 'aero-buildup', modelVersion: AERO_MODEL_VERSION, terms: { transonic: 'legacy' } };
const motorRecord = { id: 'aerotech_k550w', motor: CERTIFIED_MOTORS.aerotech_k550w, provenance: { source: 'certified' as const } };

/** A pre-provenance artifact: always active under the legacy policy. */
const ACTIVE_LEGACY = {
  scale: 0.9, fittedCd: 0.45, modelCd: 0.5, rmseN: 0.1, coastMassKg: 0.05,
  source: { fileName: 'legacy.csv', sha256Hex: 'f'.repeat(64), rowCount: 40 },
  window: { startS: 2, endS: 7, method: 'velocity-column', pointsUsed: 30, pointsExcluded: 10 },
  appliedAt: '2026-10-27T00:00:00.000Z',
} as DragCalibration;

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
  return buildDragCalibration(fit, log, '2026-10-28T00:00:00.000Z', LEGACY_FLIGHT_MODEL, { log: side, model: side }, fitKey, 'fnv1a32:01234567');
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

/** The engine invoke as a test double; everything above it (adapter, bridge, admission) is real. */
function engine() {
  const sent: Array<{ cmd: string; options: Record<string, unknown> }> = [];
  installTestEngine(async (cmd, args) => {
    const a = (args ?? {}) as Record<string, any>;
    if (cmd === 'simulate_flight') { sent.push({ cmd, options: a.options }); return flightResultForRequest(a); }
    if (cmd === 'run_ensemble_chunk') { sent.push({ cmd, options: a.req.options }); return chunkLandings(a.req.runStart, a.req.runEnd); }
    return {};
  });
  return sent;
}

describe('finding 1: an inactive calibration is history and changes no physics', () => {
  const inactive: Array<[string, () => Promise<DragCalibration>, string]> = [
    ['fit inputs no longer match', () => provenanceArtifact('deadbeef'), 'fit-inputs'],
    ['model binding is foreign', async () => {
      const key = designOf(project().project, project().mission).calibrationFitInputKey!;
      const artifact = await provenanceArtifact(key);
      return { ...artifact, fitProvenance: { ...artifact.fitProvenance!, flightModelBinding: { ...artifact.fitProvenance!.flightModelBinding, modelId: 'candidate-sb1' } } } as DragCalibration;
    }, 'flight-model'],
  ];

  describe.each(inactive)('artifact whose %s', (_name, make, reason) => {
    it('is inactive, carries no scale and does not force the legacy tables', async () => {
      const { project: p, mission } = project({ calibration: await make() });
      const design = designOf(p, mission);
      expect(design.calibrationApplicability).toMatchObject({ status: 'inactive', reason });
      expect(design.dragCalibration).toBeUndefined();
      expect(design.options.dragCdScale).toBeUndefined();
      expect(design.vehicle.flightDragSource).toBeUndefined();
    });

    it('keys, dispatches and archives exactly like the same project without the artifact', async () => {
      const artifact = await make();
      const withArtifact = project({ calibration: artifact });
      const without = project();
      const dA = designOf(withArtifact.project, withArtifact.mission);
      const dB = designOf(without.project, without.mission);

      // run identity
      expect(resolveRun(withArtifact.project, {}, dA)!.inputKey).toBe(resolveRun(without.project, {}, dB)!.inputKey);

      // dispatch: the same request, built-up default included
      const sent = engine();
      await simulateFlight(dA.vehicle, CERTIFIED_MOTORS[dA.motorId], sixDofOptions(dA.options));
      await simulateFlight(dB.vehicle, CERTIFIED_MOTORS[dB.motorId], sixDofOptions(dB.options));
      expect(stableStringify(sent[0].options)).toBe(stableStringify(sent[1].options));
      expect(sent[0].options.flightDragSource).toBe('calibrated');
      expect(sent[0].options).not.toHaveProperty('dragCdScale');

      // capture and archive
      const a = captureRunInputs({ ...withArtifact.project, motorRecords: [motorRecord] }, motorRecord, 'k', dA.dragCalibration, undefined, undefined, sixDofOptions(dA.options));
      const b = captureRunInputs({ ...without.project, motorRecords: [motorRecord] }, motorRecord, 'k', dB.dragCalibration, undefined, undefined, sixDofOptions(dB.options));
      expect({ ...a, capturedAt: '' }).toEqual({ ...b, capturedAt: '' });
      expect(a.engineOptions.flightDragSource).toBe('calibrated');
      expect(a.vehicle.flightDragSource).toBeUndefined();
    });

    it('removing the retained history does not move the key or the dispatch', async () => {
      const artifact = await make();
      const before = project({ calibration: artifact });
      const after = project();
      const kBefore = resolveRun(before.project, {}, designOf(before.project, before.mission))!.inputKey;
      const kAfter = resolveRun(after.project, {}, designOf(after.project, after.mission))!.inputKey;
      expect(kBefore).toBe(kAfter);
    });
  });

  it('an ACTIVE legacy artifact still stays on the legacy tables (the commit-3 rule is unchanged)', () => {
    const { project: p, mission } = project({ calibration: ACTIVE_LEGACY });
    const design = designOf(p, mission);
    expect(design.calibrationApplicability.status).toBe('active');
    expect(design.vehicle.flightDragSource).toBe('legacy');
    expect(design.options.dragCdScale).toBe(ACTIVE_LEGACY.scale);
    const sent = engine();
    return simulateFlight(design.vehicle, CERTIFIED_MOTORS[design.motorId], sixDofOptions(design.options)).then(() => {
      expect(sent[0].options).not.toHaveProperty('flightDragSource');
      expect(sent[0].options.dragCdScale).toBe(ACTIVE_LEGACY.scale);
    });
  });
});

describe('finding 3: metadata, admission and dispatch use the one resolved vehicle (real bridge)', () => {
  it('a raw vehicle with an active scale flies legacy, and the run records legacy, not "built-up requested"', async () => {
    const { project: p, mission } = project({ calibration: ACTIVE_LEGACY });
    const design = designOf(p, mission); // active artifact: scale in options, resolved vehicle legacy
    const raw = p.vehicle;               // the caller passes the STORED vehicle (no drag choice)
    const sent = engine();
    const run = await runFlight(raw, CERTIFIED_MOTORS[design.motorId], design.options, 'certified', 'k', 1, undefined, ACTIVE_LEGACY);
    expect(sent[0].options).not.toHaveProperty('flightDragSource');
    expect(sent[0].options.dragCdScale).toBe(ACTIVE_LEGACY.scale);
    // metadata equals the explicit-legacy run's: nothing says built-up drag was requested
    const explicit = await runFlight({ ...raw, flightDragSource: 'legacy' }, CERTIFIED_MOTORS[design.motorId], design.options, 'certified', 'k', 1, undefined, ACTIVE_LEGACY);
    expect(run.physicsOptions).toBeUndefined();
    expect(run.physicsOptions).toEqual(explicit.physicsOptions);
    expect(run.summary.apogee.reason).toBe(explicit.summary.apogee.reason);
    expect(run.summary.apogee.reason).not.toMatch(/built-up/i);
  });

  it('admission uses the same resolved vehicle: a selection with a legacy dispatch is refused before the engine', async () => {
    const { project: p, mission } = project({ calibration: ACTIVE_LEGACY });
    const design = designOf(p, mission);
    const sent = engine();
    await expect(runFlight(p.vehicle, CERTIFIED_MOTORS[design.motorId], design.options, 'certified', 'k', 1, undefined, ACTIVE_LEGACY, undefined, SELECTION))
      .rejects.toThrow(/flight coefficients still come from the legacy path/);
    expect(sent).toHaveLength(0);
  });

  it('a raw vehicle with an active scale: the ensemble flies legacy and records no built-up physics option', async () => {
    const { project: p, mission } = project({ calibration: ACTIVE_LEGACY });
    const design = designOf(p, mission);
    const sent = engine();
    const dispersion = await runMonteCarlo({ vehicle: p.vehicle, motor: CERTIFIED_MOTORS[design.motorId], options: design.options, nRuns: 4, seed: 7, dragCalibration: ACTIVE_LEGACY }, new AbortController().signal);
    expect(sent.length).toBeGreaterThan(0);
    for (const call of sent) {
      expect(call.options).not.toHaveProperty('flightDragSource');
      expect(call.options.dragCdScale).toBe(ACTIVE_LEGACY.scale);
    }
    expect(dispersion.physicsOptions).toBeUndefined();
  });

  it('control: no calibration, the default still dispatches and records the built-up drag', async () => {
    const { project: p, mission } = project();
    const design = designOf(p, mission);
    const sent = engine();
    const run = await runFlight(p.vehicle, CERTIFIED_MOTORS[design.motorId], design.options, 'certified', 'k', 1);
    expect(sent[0].options.flightDragSource).toBe('calibrated');
    expect(run.physicsOptions).toEqual({ flightDragSource: 'calibrated' });
  });
});
