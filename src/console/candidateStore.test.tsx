// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useAnalysisStore } from '../state/analysis';
import { readProject, writeProject } from '../formats/projectJson';
import { exportableProject, useProjectStore } from '../state/project';
import { candidateInvocationMatches, committedRun, consoleActions, currentRunKey, useConsoleJobs } from './store';
import { useAnalysisFreshness, useFlightQualification, useFreshness } from './hooks';
import { installTestEngine, resetConsoleState } from './testFixtures';
import {
  CANDIDATE_VEHICLE, candidateProjectWithSha, candidateReport,
  candidateRollup,
} from '../application/candidate.fixture';
import { declarationVehicleSha256 } from '../application/candidate';
import { isCandidateFlightModel } from '../application/flightModel';
import { useSessionStore } from '../state/session';
import { candidateProfileReport, profileSelection, PROFILE_SOURCE_IDENTITY } from '../application/candidate.profile.fixture';

let teardown: (() => void) | null = null;

beforeEach(() => {
  resetConsoleState();
  useSessionStore.getState().setEnvironmentProfile(null);
  useAnalysisStore.getState().reset();
  useConsoleJobs.setState({ jobs: { running: false, runError: null, mc: null }, mcAbort: null, candidateAbort: null });
});
afterEach(() => { teardown?.(); teardown = null; });

async function candidateProject() {
  const sha = await declarationVehicleSha256(CANDIDATE_VEHICLE);
  const project = candidateProjectWithSha(sha);
  const legacy = structuredClone(project);
  delete legacy.flightModel;
  useProjectStore.getState().replaceProject(legacy, {});
  consoleActions.setFlightModel(project.flightModel!, 'Enable candidate model for test');
  useAnalysisStore.getState().reset();
  return project;
}

function installEngine(overrides: { candidate?: (args?: Record<string, unknown>, signal?: AbortSignal) => Promise<unknown> } = {}) {
  const calls: string[] = [];
  const installed = installTestEngine(async (cmd, args, options) => {
    calls.push(cmd);
    if (cmd === 'aggregate_mass') return candidateRollup();
    if (cmd === 'simulate_candidate') {
      if (overrides.candidate) return overrides.candidate(args, options?.signal);
      const report = candidateReport();
      const request = (args as { request?: { adapter?: { sourceIdentity?: string }, mechanicalSourceId?: string, environmentSourceId?: string, environment?: Record<string, unknown> } }).request;
      if (request !== undefined) {
        const source = request.adapter?.sourceIdentity ?? 'fixture';
        const identities = report.identities as Record<string, unknown>;
        identities.callerSourceIdentity = source;
        identities.geometryIdentity = `frontend-external-profile-SB1/1.0.0:${source}`;
        identities.mechanicalSourceId = request.mechanicalSourceId;
        identities.environmentSourceId = request.environmentSourceId;
        const axial = (request as { axial?: { providerId?: string, inputIdentity?: string } }).axial;
        if (axial?.providerId !== undefined) identities.axialProviderId = axial.providerId;
        if (axial?.inputIdentity !== undefined) identities.axialInputIdentity = axial.inputIdentity;
        (report.geometry as Record<string, unknown>).identity = `frontend-external-profile-SB1/1.0.0:${source}`;
        report.environment = { ...request.environment, environmentSourceId: request.environmentSourceId };
      }
      return report;
    }
    if (cmd === 'simulate_flight' || cmd === 'flight_summary' || cmd === 'stability' || cmd === 'aero_curves'
      || cmd === 'run_ensemble' || cmd === 'run_ensemble_chunk') {
      throw new Error(`legacy command ${cmd} must not run for a candidate selection`);
    }
    return {};
  });
  teardown = installed.teardown;
  return calls;
}

describe('explicit candidate Console journey', () => {
  it('dispatches one candidate request, records v3 inputs and never falls back to legacy', async () => {
    const calls = installEngine();
    await candidateProject();
    await useConsoleJobs.getState().run();
    expect(calls.filter((cmd) => cmd === 'simulate_candidate')).toHaveLength(1);
    expect(calls).not.toContain('simulate_flight');
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    const result = committedRun()?.candidate;
    expect(result?.contentIdentity.sha256).toBe('d'.repeat(64));
    expect(committedRun()?.engineIdentity?.kind).toBe('test-engine');
    expect(committedRun()?.engineIdentity?.sha256).toBeNull();
    const history = useAnalysisStore.getState().history;
    expect(history).toHaveLength(1);
    expect(history[0].runInputs?.version).toBe(3);
    const saved = exportableProject().cases;
    expect(saved).toHaveLength(1);
    expect(saved[0].candidateResult?.contentIdentity.sha256).toBe('d'.repeat(64));
    expect(saved[0].inputs?.version).toBe(3);
    expect(saved[0]).not.toHaveProperty('flightOutputs');
    const parsed = readProject(writeProject(exportableProject()));
    expect(parsed.cases[0].candidateResult?.termination).toBe('TimeLimit');
    expect(parsed.cases[0].inputs?.version).toBe(3);
  });

  it('keeps archived candidate cases through an undo/redo of the selection', async () => {
    installEngine();
    await candidateProject();
    await useConsoleJobs.getState().run();
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.flightModel).toBeUndefined();
    expect(exportableProject().cases[0].candidateResult).toBeDefined();
    useProjectStore.getState().redo();
    expect(isCandidateFlightModel(useProjectStore.getState().project.flightModel!)).toBe(true);
    expect(exportableProject().cases[0].candidateResult).toBeDefined();
  });

  it('loads candidate inputs without running and restores the explicit selection', async () => {
    installEngine();
    await candidateProject();
    await useConsoleJobs.getState().run();
    const parsed = readProject(writeProject(exportableProject()));
    const caseId = parsed.cases[0].id;
    useProjectStore.getState().replaceProject(parsed, {});
    useAnalysisStore.getState().reset();
    expect(useProjectStore.getState().loadSavedRun(caseId)).toBe(true);
    const model = useProjectStore.getState().project.flightModel;
    expect(model && isCandidateFlightModel(model)).toBe(true);
    expect(committedRun()).toBeNull();
    expect(useAnalysisStore.getState().history).toHaveLength(0);
  });

  it('preserves an active candidate admission when the palette ensemble action is refused', async () => {
    const calls: string[] = [];
    let releaseRollup: (value: unknown) => void = () => undefined;
    let markStarted: () => void = () => undefined;
    const rollupStarted = new Promise<void>((resolve) => { markStarted = resolve; });
    const installed = installTestEngine(async (cmd) => {
      calls.push(cmd);
      if (cmd === 'aggregate_mass') {
        markStarted();
        return new Promise((resolve) => { releaseRollup = resolve; });
      }
      if (cmd === 'simulate_candidate') return candidateReport();
      return {};
    });
    teardown = installed.teardown;
    await candidateProject();
    const first = useConsoleJobs.getState().run();
    await rollupStarted;
    const before = useConsoleJobs.getState();
    expect(before.jobs.running).toBe(true);
    expect(before.candidateAbort).not.toBeNull();
    expect(before.runToken).not.toBeNull();
    useConsoleJobs.getState().runMonteCarlo(3);
    const after = useConsoleJobs.getState();
    expect(after.jobs.running).toBe(true);
    expect(after.candidateAbort).toBe(before.candidateAbort);
    expect(after.runToken).toBe(before.runToken);
    expect(after.jobs.runError).toContain('unsupported by the selected experimental candidate contract');
    await useConsoleJobs.getState().run();
    expect(calls.filter((cmd) => cmd === 'aggregate_mass')).toHaveLength(1);
    expect(calls).not.toContain('run_ensemble');
    expect(calls).not.toContain('run_ensemble_chunk');
    releaseRollup(candidateRollup());
    await first;
  });

  it('refuses Monte Carlo and never calls a legacy ensemble command', async () => {
    const calls = installEngine();
    await candidateProject();
    useConsoleJobs.getState().runMonteCarlo(3);
    expect(calls).not.toContain('run_ensemble');
    expect(calls).not.toContain('run_ensemble_chunk');
    expect(useConsoleJobs.getState().jobs.runError).toMatch(/unsupported by the selected experimental candidate contract/);
  });

  it('surfaces a candidate engine error without appending a case', async () => {
    installEngine({ candidate: async () => { throw new Error('candidate contract refusal'); } });
    await candidateProject();
    await useConsoleJobs.getState().run();
    expect(useConsoleJobs.getState().jobs.runError).toContain('candidate contract refusal');
    expect(exportableProject().cases).toHaveLength(0);
    expect(committedRun()).toBeNull();
  });

  it('cancels the actual worker request and records no case', async () => {
    installEngine({ candidate: async (_args, signal) => {
      let rejectRequest: (error: Error) => void = () => undefined;
      const promise = new Promise<unknown>((_resolve, reject) => { rejectRequest = reject; });
      signal?.addEventListener('abort', () => rejectRequest(new Error('cancelled by test')), { once: true });
      return promise;
    } });
    await candidateProject();
    const running = useConsoleJobs.getState().run();
    await waitFor(() => expect(useConsoleJobs.getState().jobs.running).toBe(true));
    useConsoleJobs.getState().cancelRun();
    await running;
    expect(useConsoleJobs.getState().jobs.running).toBe(false);
    expect(useConsoleJobs.getState().jobs.runError).toContain('Cancelled');
    expect(exportableProject().cases).toHaveLength(0);
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    expect(useAnalysisStore.getState().records.flight?.status).not.toBe('running');
  });

  it('cancels before dispatch without starting a worker or recording a case', async () => {
    const calls = installEngine();
    await candidateProject();
    const running = useConsoleJobs.getState().run();
    useConsoleJobs.getState().cancelRun();
    await running;
    expect(calls.filter((cmd) => cmd === 'simulate_candidate')).toHaveLength(0);
    expect(exportableProject().cases).toHaveLength(0);
    expect(committedRun()).toBeNull();
    expect(useConsoleJobs.getState().jobs.runError).toContain('Cancelled');
  });

  it('offers one admission while an earlier candidate run is still starting', async () => {
    const calls: string[] = [];
    let release: (value: unknown) => void = () => undefined;
    let started: () => void = () => undefined;
    const workerStarted = new Promise<void>((resolve) => { started = resolve; });
    const installed = installTestEngine(async (cmd) => {
      calls.push(cmd);
      if (cmd === 'aggregate_mass') return candidateRollup();
      if (cmd === 'simulate_candidate') {
        started();
        return new Promise((resolve) => { release = resolve; });
      }
      return {};
    });
    teardown = installed.teardown;
    await candidateProject();
    const first = useConsoleJobs.getState().run();
    await workerStarted;
    await useConsoleJobs.getState().run();
    expect(calls.filter((cmd) => cmd === 'simulate_candidate')).toHaveLength(1);
    release(candidateReport());
    await first;
  });

  it('compares the exact retained invocation, not the colliding display key', async () => {
    installEngine();
    await candidateProject();
    await useConsoleJobs.getState().run();
    const record = useAnalysisStore.getState().completed.flight;
    expect(record).not.toBeNull();
    expect(candidateInvocationMatches(record)).toBe(true);
    const forged = structuredClone(record!);
    forged.runInputs = { ...record!.runInputs!, flightModel: { ...record!.runInputs!.flightModel, declarationVehicleSha256: 'e'.repeat(64) } } as typeof forged.runInputs;
    expect(candidateInvocationMatches(forged)).toBe(false);
    expect(record!.inputKey).toBe(currentRunKey());
  });

  it('refuses a profile run with surface wind, then dispatches the envelope and archives it', async () => {
    const seen: unknown[] = [];
    const calls = installEngine({ candidate: async (args) => {
      const envelope = (args as { request?: {
        schemaId?: string;
        candidate?: { adapter: { sourceIdentity: string }; mechanicalSourceId: string;
          environmentSourceId: string; axial: { providerId: string; inputIdentity: string } };
      } }).request;
      seen.push(envelope?.schemaId);
      if (envelope?.schemaId !== 'native-E1-profile-candidate-request/1.0.0' || envelope.candidate === undefined) {
        throw new Error('expected the E1 profile envelope');
      }
      // Report the provenance of the request the app actually dispatched.
      const request = envelope.candidate;
      const report = candidateProfileReport();
      const identities = report.identities as Record<string, unknown>;
      const geometry = `frontend-external-profile-SB1/1.0.0:${request.adapter.sourceIdentity}`;
      identities.callerSourceIdentity = request.adapter.sourceIdentity;
      identities.geometryIdentity = geometry;
      identities.mechanicalSourceId = request.mechanicalSourceId;
      identities.environmentSourceId = request.environmentSourceId;
      identities.axialProviderId = request.axial.providerId;
      identities.axialInputIdentity = request.axial.inputIdentity;
      (report.geometry as Record<string, unknown>).identity = geometry;
      return report;
    } });
    await candidateProject();
    act(() => { useSessionStore.getState().setEnvironmentProfile(profileSelection()); });

    // The engine refuses a profile combined with retained surface wind, so the
    // app refuses before dispatch instead of silently dropping the wind.
    await useConsoleJobs.getState().run();
    expect(useAnalysisStore.getState().completed.flight).toBeNull();
    expect(useConsoleJobs.getState().jobs.runError).toMatch(/surface wind/);
    expect(seen).toHaveLength(0);
    expect(calls).not.toContain('simulate_candidate');

    act(() => { consoleActions.setOptions({ windSpeedSurface: 0 }, 'Calm air for the profile run'); });
    await useConsoleJobs.getState().run();
    const record = useAnalysisStore.getState().completed.flight;
    expect(record).not.toBeNull();
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    expect(seen).toEqual(['native-E1-profile-candidate-request/1.0.0']);
    const request = (record!.runInputs as { candidateRequest?: Record<string, unknown> }).candidateRequest;
    expect(request).toMatchObject({ schemaId: 'native-E1-profile-candidate-request/1.0.0' });
    const result = (record!.payload as { result?: { profileEnvironment?: { profileSourceIdentity?: string }, compositionId?: string } }).result;
    expect(result?.compositionId).toBe('candidate-static-rate-profile-composition/1.0.0');
    expect(result?.profileEnvironment?.profileSourceIdentity).toBe(PROFILE_SOURCE_IDENTITY);
    expect(candidateInvocationMatches(record)).toBe(true);
    act(() => { useSessionStore.getState().setEnvironmentProfile(null); });
    expect(candidateInvocationMatches(record)).toBe(false);
  });

  it('marks a candidate result stale when the session E1 profile changes, without dispatching', async () => {
    const calls = installEngine();
    await candidateProject();
    await useConsoleJobs.getState().run();
    const record = useAnalysisStore.getState().completed.flight;
    expect(record).not.toBeNull();
    expect(candidateInvocationMatches(record)).toBe(true);
    // Loading an E1 profile changes the effective inputs: the stored result is
    // stale until rerun, and merely selecting a profile dispatches nothing.
    act(() => { useSessionStore.getState().setEnvironmentProfile(profileSelection()); });
    expect(candidateInvocationMatches(record)).toBe(false);
    const freshness = renderHook(() => useFreshness('flight'));
    expect(freshness.result.current.state).toBe('stale');
    freshness.unmount();
    expect(useAnalysisStore.getState().completed.flight).toBe(record);
    expect(useConsoleJobs.getState().jobs.running).toBe(false);
    expect(calls.filter((cmd) => cmd === 'simulate_candidate')).toHaveLength(1);
    act(() => { useSessionStore.getState().setEnvironmentProfile(null); });
    expect(candidateInvocationMatches(record)).toBe(true);
  });

  it('marks header, Flight and Build freshness stale while the forced key collides', async () => {
    installEngine();
    await candidateProject();
    await useConsoleJobs.getState().run();
    const key = currentRunKey();
    const record = useAnalysisStore.getState().completed.flight;
    expect(record).not.toBeNull();
    expect(record!.inputKey).toBe(key);
    const forged = structuredClone(record!);
    const capturedModel = record!.runInputs!.flightModel;
    if (capturedModel === undefined || !isCandidateFlightModel(capturedModel)) throw new Error('candidate model expected');
    forged.runInputs = {
      ...record!.runInputs!,
      flightModel: { ...capturedModel, horizonSeconds: capturedModel.horizonSeconds + 1 },
    } as typeof forged.runInputs;
    act(() => {
      useAnalysisStore.setState((state) => ({ completed: { ...state.completed, flight: forged } }));
    });
    expect(currentRunKey()).toBe(key);
    expect(forged.inputKey).toBe(key);
    const flightFreshness = renderHook(() => useFreshness('flight'));
    const analysisFreshness = renderHook(() => useAnalysisFreshness());
    const qualification = renderHook(() => useFlightQualification());
    expect(flightFreshness.result.current.state).toBe('stale');
    expect(analysisFreshness.result.current).toBe('stale');
    expect(qualification.result.current.status).toBe('stale');
    flightFreshness.unmount();
    analysisFreshness.unmount();
    qualification.unmount();
  });

});
