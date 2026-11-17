/**
 * The built-up flight drag refusal matrix (Gate 1 §4.1, review amendment 3).
 *
 * Every combination of aero-model selection × vehicle opt-in keeps a pre-run
 * refusal except the one pairing the bundle unlocks: a usable built-up model
 * plus the vehicle's `flightDragSource`. A refusal dispatches nothing, so no
 * case, archive or engine call can exist behind it.
 */
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from '@testing-library/react';
import { useProjectStore } from '../state/project';
import { useAnalysisStore } from '../state/analysis';
import { AERO_MODEL_VERSION, AERO_MODEL_VERSION_METHOD_ONLY } from '../application/aeroModel';
import type { AeroModelSelection } from '../application/aeroModel';
import { consoleActions, useConsoleJobs } from './store';
import { consoleJobStub, resetConsoleState, stubEngine, type Invocation } from './testFixtures';

const BETA: AeroModelSelection = Object.freeze({
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: Object.freeze({ transonic: 'legacy' }),
});
const DEFECTIVE: AeroModelSelection = Object.freeze({
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION_METHOD_ONLY,
  terms: Object.freeze({ transonic: 'legacy' }),
});
const NOT_A_PAIR: AeroModelSelection = Object.freeze({
  modelId: 'aero-buildup',
  modelVersion: AERO_MODEL_VERSION,
  terms: Object.freeze({ transonic: 'buildup' }),
});

let teardown: () => void;
let calls: Invocation[];

beforeEach(() => {
  const stub = stubEngine();
  teardown = stub.teardown;
  calls = stub.calls;
  resetConsoleState();
  consoleJobStub();
});
afterEach(() => teardown());

function withSelection(selection: AeroModelSelection | undefined): void {
  useProjectStore.getState().commitStructural('Selection', (project) => {
    const { aeroModel: _removed, ...rest } = project;
    return selection === undefined ? rest : { ...rest, aeroModel: selection };
  });
}

function withFlightDrag(on: boolean): void {
  act(() => consoleActions.setVehicle({ flightDragSource: on ? 'calibrated' : undefined }, 'Flight drag'));
}

async function run(): Promise<void> {
  await act(async () => { await useConsoleJobs.getState().run(); });
}

const flights = () => calls.filter((c) => c.cmd === 'simulate_flight');
const chunks = () => calls.filter((c) => c.cmd === 'run_ensemble_chunk');

describe('built-up flight drag refusal matrix', () => {
  it('row 1: no selection and no opt-in flies as before, with no drag-source option', async () => {
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    expect(flights()).toHaveLength(1);
    expect((flights()[0].args?.options as Record<string, unknown>)).not.toHaveProperty('flightDragSource');
  });

  // K3: rows 1 and 3 above are the explicit legacy choice (resetConsoleState pins it): "no opt-in"
  // used to mean the legacy flight. The rows below are the new default, with no drag choice at all.
  it('row 1 (default): no selection and no drag choice flies the built-up drag, with no selection needed', async () => {
    resetConsoleState({ defaultFlightDrag: true });
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    expect(flights()).toHaveLength(1);
    expect((flights()[0].args?.options as Record<string, unknown>).flightDragSource).toBe('calibrated');
  });

  it('row 3 (default): a selection with no drag choice is admitted and flies the built-up drag', async () => {
    resetConsoleState({ defaultFlightDrag: true });
    withSelection(BETA);
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    expect(flights()).toHaveLength(1);
    expect((flights()[0].args?.options as Record<string, unknown>).flightDragSource).toBe('calibrated');
  });

  it('row 2: the opt-in without a selection refuses and dispatches nothing', async () => {
    withFlightDrag(true);
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toBe(
      'Built-up flight drag is on, but the built-up aero model is not selected. '
        + 'Turn on "Use built-up aero model (beta)" in Aero, or turn built-up flight drag off.',
    );
    expect(flights()).toHaveLength(0);
    expect(useAnalysisStore.getState().history).toHaveLength(0);
    expect((useProjectStore.getState().project.cases ?? []).length).toBe(0);
  });

  it('row 3: a selection without the opt-in keeps the existing refusal byte for byte', async () => {
    withSelection(BETA);
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toBe(
      'aero-buildup 1.1.0 drives stability and aero panels in this build; '
        + 'flight coefficients still come from the legacy path. Turn the beta aero model off to fly.',
    );
    expect(flights()).toHaveLength(0);
  });

  it('row 4: a usable selection plus the opt-in flies and sends the drag source', async () => {
    withSelection(BETA);
    withFlightDrag(true);
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toBeNull();
    expect(flights()).toHaveLength(1);
    expect((flights()[0].args?.options as Record<string, unknown>).flightDragSource).toBe('calibrated');
  });

  it('row 6: a defective pair is refused with its own reason', async () => {
    withSelection(DEFECTIVE);
    withFlightDrag(true);
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toContain('never implemented the legacy-transonic composition');
    expect(useConsoleJobs.getState().jobs.runError).toContain('Built-up flight drag cannot use this selection');
    expect(flights()).toHaveLength(0);
  });

  it('row 8: an unusable version/term pair is refused with its own reason', async () => {
    withSelection(NOT_A_PAIR);
    withFlightDrag(true);
    await run();
    expect(useConsoleJobs.getState().jobs.runError).toContain("with term 'buildup' is not a usable pair in this build");
    expect(useConsoleJobs.getState().jobs.runError).toContain('built-up flight drag cannot use it');
    expect(flights()).toHaveLength(0);
  });

  it('applies the same gate to Monte Carlo and sends the drag source per chunk', async () => {
    withFlightDrag(true);
    act(() => useConsoleJobs.getState().runMonteCarlo(4));
    expect(useConsoleJobs.getState().jobs.runError).toContain('the built-up aero model is not selected');
    expect(chunks()).toHaveLength(0);

    withSelection(BETA);
    act(() => useConsoleJobs.getState().runMonteCarlo(4));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(chunks().length).toBeGreaterThan(0);
    expect((chunks()[0].args?.req as { options: Record<string, unknown> }).options.flightDragSource).toBe('calibrated');
  });
});
