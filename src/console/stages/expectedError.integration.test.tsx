// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Tooltip } from 'radix-ui';
import { FlightInspector } from './Flight';
import { resetConsoleState, flightResult } from '../testFixtures';
import { consoleActions, designOf } from '../store';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { cohortError, cohortErrorOption } from '../data/cohortError.generated';
import { toFlightRun } from '../data/adapter';

beforeEach(() => resetConsoleState());
afterEach(cleanup);
it('keeps the committed run band when the live design changes', () => {
  const project = useProjectStore.getState().project;
  const vehicle = structuredClone(project.vehicle);
  vehicle.launchSite = { altitudeM: 0, temperatureC: 20 };
  vehicle.nozzleExitDiameter = 0.1;
  delete vehicle.flightDragSource;
  const raw = flightResult({ maxMach: 0.5, apogeeAltitude: 1000, runManifest: { ...flightResult().runManifest, axialDrag: 'calibrated build-up axial drag (alpha = 0)' } as never });
  const run = toFlightRun(raw, vehicle, 'certified', 'key', 1, 1);
  const design = designOf(project as never, project.mission);
  useAnalysisStore.setState(state => ({ completed: { ...state.completed, flight: { kind: 'flight', status: 'completed', inputKey: 'key', token: 1, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z', error: null, payload: { model: 'legacy', design, run, previous: null } } } }));
  render(<Tooltip.Provider><FlightInspector /></Tooltip.Provider>);
  const n = cohortError.subsonic[cohortErrorOption];
  const text = `Average apogee error ±${(cohortErrorOption === 'maximum' ? Math.ceil(n * 10) / 10 : n).toFixed(1)} % (dev. data, 8 rockets in this speed range; not a limit)`;
  expect(screen.getByText(text)).toBeTruthy();
  act(() => consoleActions.setVehicle({ launchSite: undefined, nozzleExitDiameter: undefined, flightDragSource: 'legacy' }, 'Edit'));
  expect(screen.getByText(text)).toBeTruthy();
});

it('shows the withheld message for a recorded run missing temperature', () => {
  const project = useProjectStore.getState().project;
  const vehicle = structuredClone(project.vehicle); delete vehicle.flightDragSource;
  const raw = flightResult({ runManifest: { ...flightResult().runManifest, axialDrag: 'calibrated build-up axial drag (alpha = 0)' } as never });
  const run = toFlightRun(raw, vehicle, 'certified', 'key', 1, 1);
  const design = designOf(project as never, project.mission);
  useAnalysisStore.setState(state => ({ completed: { ...state.completed, flight: { kind: 'flight', status: 'completed', inputKey: 'key', token: 1, startedAt: '2026-01-01T00:00:00.000Z', finishedAt: '2026-01-01T00:00:01.000Z', error: null, payload: { model: 'legacy', design, run, previous: null } } } }));
  render(<Tooltip.Provider><FlightInspector /></Tooltip.Provider>);
  expect(screen.getByText('No error band: site temperature not set.')).toBeTruthy();
});
it('shows no band line before any run', () => {
  render(<Tooltip.Provider><FlightInspector /></Tooltip.Provider>);
  expect(screen.queryByText(/(?:Average apogee error|No error band)/)).toBeNull();
});
