// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WeatherPanel } from './WeatherPanel';
import { weatherSnapshot } from '../../application/weatherSnapshots';
import { useProjectStore } from '../../state/project';
import { useAnalysisStore } from '../../state/analysis';
import { consoleActions } from '../store';
import type { WindLayer } from '../../sim/weather';

const LAUNCH = '2026-10-24T14:56:00Z';
const MANUAL: WindLayer = { altitudeM: 0, speedMs: 7, directionFromDeg: 90, tempC: 15, pressureHpa: 1013 };
const PRIOR_FORECAST: WindLayer = { ...MANUAL, speedMs: 9 };
const RESPONSE = {
  utc_offset_seconds: 0,
  hourly: {
    time: ['2026-10-22T00:00', '2026-10-24T15:00'],
    temperature_1000hPa: [99, 18],
    wind_speed_1000hPa: [99, 12],
    wind_direction_1000hPa: [0, 270],
  },
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T14:56:00Z'));
  useProjectStore.getState().loadPreset('estesAlpha');
  useAnalysisStore.getState().reset();
  const site = useProjectStore.getState().project.workspace.site;
  consoleActions.setWorkspace({ site: { ...site, launchTimeISO: LAUNCH } }, 'Launch time');
  consoleActions.setWeatherProfile('manual', [MANUAL], 'manual', 'Manual winds');
  consoleActions.setWeatherProfile('forecast', [PRIOR_FORECAST], 'prior forecast', 'Prior forecast');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('forecast result transaction', () => {
  it('does not attach a late response to a changed launch time or replace prior profiles', async () => {
    let finish!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => { finish = resolve; });
    vi.stubGlobal('fetch', () => pending);
    const before = useProjectStore.getState().project;
    render(<WeatherPanel />);
    const fetchButton = screen.getByRole('button', { name: 'Fetch sounding' });
    fireEvent.click(fetchButton);
    expect(fetchButton.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Weather launch time'), { target: { value: '2026-10-25T14:56' } });
    await act(async () => { finish(new Response(JSON.stringify(RESPONSE), { status: 200 })); });
    await waitFor(() => expect(fetchButton.hasAttribute('disabled')).toBe(false));
    const after = useProjectStore.getState().project;
    expect(after.workspace.site.launchTimeISO).toBe('2026-10-25T14:56:00Z');
    expect(weatherSnapshot(after, 'forecast')).toEqual(weatherSnapshot(before, 'forecast'));
    expect(weatherSnapshot(after, 'manual')).toEqual(weatherSnapshot(before, 'manual'));
    expect(screen.queryByRole('alert')).not.toBeNull();
  });

  it('preserves both existing profiles when the service refuses the request', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve(new Response(JSON.stringify(RESPONSE), { status: 503 })));
    const before = useProjectStore.getState().project;
    render(<WeatherPanel />);
    const fetchButton = screen.getByRole('button', { name: 'Fetch sounding' });
    fireEvent.click(fetchButton);
    await waitFor(() => expect(fetchButton.hasAttribute('disabled')).toBe(false));
    const after = useProjectStore.getState().project;
    expect(after.workspace.site).toEqual(before.workspace.site);
    expect(weatherSnapshot(after, 'forecast')).toEqual(weatherSnapshot(before, 'forecast'));
    expect(weatherSnapshot(after, 'manual')).toEqual(weatherSnapshot(before, 'manual'));
    expect(screen.queryByRole('alert')).not.toBeNull();
  });
});
