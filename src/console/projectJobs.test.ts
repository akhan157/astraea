// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { useProjectStore, exportableProject } from '../state/project';
import { useAnalysisStore } from '../state/analysis';
import { committedRun, consoleActions, currentRunKey, useConsoleJobs } from './store';
import { activeTestEngine, chunkLandings, consoleJobStub, flightResult, flightResultForRequest, stubEngine } from './testFixtures';
import type { LegacyRunInputs } from '../application/runInputs';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let teardown: () => void;
beforeEach(() => {
  teardown = stubEngine().teardown;
  useProjectStore.getState().newProject();
  useAnalysisStore.getState().reset();
  consoleJobStub();
});
afterEach(() => teardown());

for (const outcome of ['complete', 'reject'] as const) {
  it(`late flight ${outcome} cannot finish or error a newer project's running job`, async () => {
    const old = deferred<ReturnType<typeof flightResult>>();
    const current = deferred<ReturnType<typeof flightResult>>();
    const queued = [old, current];
    const base = activeTestEngine().invoke;
    const dispatched: Array<Record<string, unknown> | undefined> = [];
    activeTestEngine().invoke = (cmd, args, options) => {
      if (cmd !== 'simulate_flight') return base(cmd, args, options);
      dispatched.push(args);
      return queued.shift()!.promise;
    };
    const first = useConsoleJobs.getState().run();
    expect(useConsoleJobs.getState().jobs.running).toBe(true);
    useProjectStore.getState().newProject();
    expect(useConsoleJobs.getState().jobs.running).toBe(false);
    const second = useConsoleJobs.getState().run();
    const newToken = useAnalysisStore.getState().records.flight?.token;
    if (outcome === 'complete') old.resolve(flightResultForRequest(dispatched[0]));
    else old.reject(new Error('Project A failed'));
    await first;
    expect(useConsoleJobs.getState().jobs.running).toBe(true);
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    expect(useAnalysisStore.getState().records.flight?.token).toBe(newToken);
    expect(useAnalysisStore.getState().records.flight?.status).toBe('running');
    expect(exportableProject().cases).toEqual([]);
    current.resolve(flightResultForRequest(dispatched[1]));
    await second;
    expect(useConsoleJobs.getState().jobs.running).toBe(false);
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    expect(useAnalysisStore.getState().completed.flight?.token).toBe(newToken);
    expect(exportableProject().cases).toHaveLength(1);
  });

  it(`late ensemble ${outcome} cannot change the newer project's ensemble job`, async () => {
    const old = deferred<ReturnType<typeof chunkLandings>>();
    const current = deferred<ReturnType<typeof chunkLandings>>();
    const queued = [old, current];
    const base = activeTestEngine().invoke;
    activeTestEngine().invoke = (cmd, args, options) => cmd === 'run_ensemble_chunk'
      ? queued.shift()!.promise : base(cmd, args, options);
    useConsoleJobs.getState().runMonteCarlo(25);
    const oldAbort = useConsoleJobs.getState().mcAbort!;
    useProjectStore.getState().newProject();
    expect(oldAbort.signal.aborted).toBe(true);
    expect(useConsoleJobs.getState().jobs.mc).toBeNull();
    useConsoleJobs.getState().runMonteCarlo(25);
    const jobId = useConsoleJobs.getState().jobs.mc?.id;
    const token = useAnalysisStore.getState().records.ensemble?.token;
    if (outcome === 'complete') old.resolve(chunkLandings(0, 25));
    else old.reject(new Error('Project A failed'));
    // Let the old adapter settle its cancellation callbacks through the public job path.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useConsoleJobs.getState().jobs.mc?.id).toBe(jobId);
    expect(useConsoleJobs.getState().jobs.mc?.state).toBe('running');
    expect(useAnalysisStore.getState().records.ensemble?.status).toBe('running');
    expect(exportableProject().cases).toEqual([]);
    current.resolve(chunkLandings(0, 25));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useConsoleJobs.getState().jobs.mc?.state).toBe('done');
    expect(useAnalysisStore.getState().completed.ensemble?.token).toBe(token);
    expect(exportableProject().cases).toHaveLength(1);
  });
}

it('an edit made while a flight runs leaves the result bound to the dispatched inputs and shown as stale', async () => {
  const pending = deferred<ReturnType<typeof flightResult>>();
  const base = activeTestEngine().invoke;
  let dispatchedArgs: Record<string, unknown> | undefined;
  activeTestEngine().invoke = (cmd, args, options) => {
    if (cmd !== 'simulate_flight') return base(cmd, args, options);
    dispatchedArgs = args;
    return pending.promise;
  };
  const running = useConsoleJobs.getState().run();
  const dispatchedKey = useAnalysisStore.getState().records.flight!.inputKey;
  const dispatchedWind = (useAnalysisStore.getState().records.flight!.runInputs as LegacyRunInputs).engineOptions.windSpeedSurface;
  expect(currentRunKey()).toBe(dispatchedKey);
  consoleActions.setOptions({ windSpeedSurface: dispatchedWind + 7 }, 'Edit during run');
  expect(currentRunKey()).not.toBe(dispatchedKey);
  // A second request is refused while one is running, so no overlap is possible.
  await useConsoleJobs.getState().run();
  expect(useAnalysisStore.getState().records.flight!.inputKey).toBe(dispatchedKey);
  pending.resolve(flightResultForRequest(dispatchedArgs));
  await running;
  expect(committedRun()!.run!.inputKey).toBe(dispatchedKey);
  expect(committedRun()!.run!.inputKey).not.toBe(currentRunKey());
  const saved = exportableProject().cases;
  expect(saved).toHaveLength(1);
  expect((saved[0].inputs as LegacyRunInputs).engineOptions.windSpeedSurface).toBe(dispatchedWind);
  expect((saved[0].inputs as LegacyRunInputs).inputKey).toBe(dispatchedKey);
});

it('restarting an ensemble aborts the old one; its late chunks cannot alter the new job or leave a result', async () => {
  const old = deferred<ReturnType<typeof chunkLandings>>();
  const current = deferred<ReturnType<typeof chunkLandings>>();
  const queued = [old, current];
  const base = activeTestEngine().invoke;
  activeTestEngine().invoke = (cmd, args, options) => cmd === 'run_ensemble_chunk' ? queued.shift()!.promise : base(cmd, args, options);
  useConsoleJobs.getState().runMonteCarlo(25);
  const oldAbort = useConsoleJobs.getState().mcAbort!;
  useConsoleJobs.getState().runMonteCarlo(25);
  expect(oldAbort.signal.aborted).toBe(true);
  const jobId = useConsoleJobs.getState().jobs.mc!.id;
  const token = useAnalysisStore.getState().records.ensemble!.token;
  old.resolve(chunkLandings(0, 25));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(useConsoleJobs.getState().jobs.mc!.id).toBe(jobId);
  expect(useConsoleJobs.getState().jobs.mc!.state).toBe('running');
  expect(useAnalysisStore.getState().completed.ensemble).toBeNull();
  expect(exportableProject().cases).toEqual([]);
  current.resolve(chunkLandings(0, 25));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(useConsoleJobs.getState().jobs.mc!.state).toBe('done');
  expect(useAnalysisStore.getState().completed.ensemble!.token).toBe(token);
  expect(exportableProject().cases).toHaveLength(1);
});
