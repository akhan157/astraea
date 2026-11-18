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
  // The Estes example's "Local field" has no coordinates, and the panel now
  // refuses to fetch for the never-set placeholder: these transaction tests
  // set a real place first.
  consoleActions.setWorkspace({ site: { ...site, latDeg: 40.0, lonDeg: -105.0, launchTimeISO: LAUNCH } }, 'Launch time');
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

describe('weather location', () => {
  it('blocks the fetch while the coordinates are the never-set placeholder and offers the named site', () => {
    useProjectStore.getState().loadPreset('estesAlpha');
    render(<WeatherPanel />);
    const place = document.querySelector('[data-weather-place]');
    expect(place?.getAttribute('data-weather-place')).toBe('warn');
    expect(place?.textContent).toMatch(/Coordinates never set: 47\.6062° N, 122\.3321° W is Astraea’s placeholder \(Seattle, WA\), not your launch site, “Local field”/);
    expect(screen.getByRole('button', { name: 'Fetch sounding' }).hasAttribute('disabled')).toBe(true);
  });

  it('fetches for the example mission’s own site, named', () => {
    useProjectStore.getState().loadPreset('nasaStudent');
    expect(useProjectStore.getState().project.workspace.site).toMatchObject({ latDeg: 34.7304, lonDeg: -86.5861 });
    render(<WeatherPanel />);
    const place = document.querySelector('[data-weather-place]');
    expect(place?.getAttribute('data-weather-place')).toBe('ok');
    expect(place?.textContent).toBe('Weather for Huntsville, AL (34.7304° N, 86.5861° W), the mission’s launch site.');
  });

  it('warns when the coordinates name another place than the mission site, and one click fixes it with Undo', () => {
    useProjectStore.getState().loadPreset('spaceport');
    useProjectStore.setState({ mission: { ...useProjectStore.getState().mission, site: 'Huntsville, AL' } });
    render(<WeatherPanel />);
    const place = () => document.querySelector('[data-weather-place]');
    expect(place()?.textContent).toMatch(/These coordinates are Spaceport America, NM \(32\.9903° N, 106\.9697° W\), but the mission’s site is “Huntsville, AL”/);
    fireEvent.click(screen.getByRole('button', { name: /Use Huntsville, AL/ }));
    expect(useProjectStore.getState().project.workspace.site).toMatchObject({ latDeg: 34.7304, lonDeg: -86.5861 });
    expect(place()?.getAttribute('data-weather-place')).toBe('ok');
    act(() => useProjectStore.getState().undo());
    expect(useProjectStore.getState().project.workspace.site).toMatchObject({ latDeg: 32.9903, lonDeg: -106.9697 });
  });

  it('says when it cannot name the coordinates', () => {
    const site = useProjectStore.getState().project.workspace.site;
    act(() => consoleActions.setWorkspace({ site: { ...site, latDeg: -33.5, lonDeg: 151.2 } }, 'Weather location'));
    render(<WeatherPanel />);
    expect(document.querySelector('[data-weather-place]')?.textContent).toBe('Weather for 33.5000° S, 151.2000° E. Astraea can’t name this place, so check it is “Local field”.');
  });
});
