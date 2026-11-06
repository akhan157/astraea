import { afterEach, describe, expect, it, vi } from 'vitest';
import { runEnsembleChunkRecorded, simulateFlightRecorded } from '../../tauri/bridge';
import { runFlight, runMonteCarlo, toFlightRun, MC_CHUNK_RUNS, type LaunchConfig } from './adapter';
import { chunkLandings, flightResult } from '../testFixtures';
import { PRESET_ESTES_ALPHA } from '../../state/presets';
import { CERTIFIED_MOTORS } from '../../propulsion/motorDatabase';
import type { EngineIdentity } from '../../engine/identity';

vi.mock('../../tauri/bridge', async (original) => ({
  ...await original<typeof import('../../tauri/bridge')>(),
  simulateFlightRecorded: vi.fn(), runEnsembleChunkRecorded: vi.fn(),
}));

const options: LaunchConfig = { railLength: 3, railElevationDeg: 85, railAzimuthDeg: 0, windSpeedSurface: 3, windAzimuthDeg: 0, finCantAngleDeg: 0, mainDeployAltitudeAGL: 200 };
const vehicle = PRESET_ESTES_ALPHA;
const motor = CERTIFIED_MOTORS.estes_c6;
const a: EngineIdentity = { kind: 'production-rust-wasm', sha256: 'a'.repeat(64) };
const b: EngineIdentity = { kind: 'production-rust-wasm', sha256: 'b'.repeat(64) };
afterEach(() => vi.resetAllMocks());

describe('result-bound engine metadata', () => {
  it('copies captured flight identity while direct legacy conversion remains unknown', async () => {
    vi.mocked(simulateFlightRecorded).mockResolvedValue({ value: flightResult({ runManifest: Object.assign({}, flightResult().runManifest!, { engineIdentity: 'untrusted version label' }) }), engineIdentity: a });
    const run = await runFlight(vehicle, motor, options, 'certified', 'inputs', 1);
    expect(run.engineIdentity).toBe(a);
    expect(run.manifest.engineIdentity).toContain(a.sha256);
    const legacy = toFlightRun(flightResult(), vehicle, 'certified', 'inputs', 1, 0);
    expect(legacy.engineIdentity).toBeUndefined();
    expect(legacy.manifest.engineIdentity).toMatch(/unknown.*legacy/);
  });

  const ensemble = () => runMonteCarlo({ vehicle, motor, options, nRuns: MC_CHUNK_RUNS * 2 }, new AbortController().signal);
  const chunks = (identities: EngineIdentity[]) => {
    let i = 0;
    vi.mocked(runEnsembleChunkRecorded).mockImplementation(async (_base, _sigmas, _n, _seed, start, end) => ({
      value: chunkLandings(start, end), engineIdentity: identities[i++],
    }));
  };

  it('records a consistent completed ensemble identity', async () => {
    chunks([a, a]);
    expect((await ensemble()).engineIdentity).toBe(a);
  });

  it('refuses to combine different known engine hashes or different backend kinds', async () => {
    chunks([a, b]);
    await expect(ensemble()).rejects.toThrow(/different engines.*no combined result/);
    chunks([a, { kind: 'test-engine', sha256: null }]);
    await expect(ensemble()).rejects.toThrow(/different engines/);
  });

  it('keeps an ensemble hash unknown if any chunk checksum is unavailable', async () => {
    chunks([a, { kind: 'production-rust-wasm', sha256: null }]);
    expect((await ensemble()).engineIdentity).toEqual({ kind: 'production-rust-wasm', sha256: null });
  });
});
