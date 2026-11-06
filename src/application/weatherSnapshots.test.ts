import { describe, expect, it } from 'vitest';
import { readProject, writeProject } from '../formats/projectJson';
import { useProjectStore } from '../state/project';
import type { WindLayer } from '../sim/weather';
import { weatherLayers, weatherSnapshot, withWeatherProfile } from './weatherSnapshots';

const LAYERS: WindLayer[] = [
  { altitudeM: 0, speedMs: 3, directionFromDeg: 270, tempC: 15, pressureHpa: 1013.25 },
  { altitudeM: 500, speedMs: 7.5, directionFromDeg: 280, tempC: 11.75, pressureHpa: 954.6 },
];

const base = () => useProjectStore.getState().project;

describe('weather snapshots', () => {
  it('stores a profile and survives the envelope writer and reader', () => {
    const project = withWeatherProfile(base(), 'manual', LAYERS, 'manual', '2026-10-18T00:00:00.000Z');
    const reopened = readProject(writeProject(project));
    expect(weatherLayers(reopened, 'manual')).toEqual(LAYERS);
    expect(weatherSnapshot(reopened, 'manual')).toMatchObject({ kind: 'weather', source: 'manual' });
    expect(weatherLayers(reopened, 'forecast')).toEqual([]);
  });

  it('keeps manual and forecast profiles independent', () => {
    let project = withWeatherProfile(base(), 'manual', LAYERS, 'manual');
    project = withWeatherProfile(project, 'forecast', [LAYERS[1]], 'open-meteo');
    project = withWeatherProfile(project, 'manual', [LAYERS[0]], 'manual');
    expect(weatherLayers(project, 'manual')).toEqual([LAYERS[0]]);
    expect(weatherLayers(project, 'forecast')).toEqual([LAYERS[1]]);
    expect(project.snapshots.filter((s) => s.kind === 'weather')).toHaveLength(2);
  });

  it('removes the snapshot for an empty profile', () => {
    const project = withWeatherProfile(base(), 'forecast', LAYERS, 'open-meteo');
    expect(withWeatherProfile(project, 'forecast', [], 'open-meteo').snapshots).toEqual(base().snapshots);
  });

  it('refuses a non-finite layer instead of storing an unsavable project', () => {
    const bad = [{ ...LAYERS[0], speedMs: Number.NaN }];
    expect(() => withWeatherProfile(base(), 'manual', bad, 'manual')).toThrow(/speedMs/);
  });

  it('does not alias the caller layers', () => {
    const layers = LAYERS.map((l) => ({ ...l }));
    const project = withWeatherProfile(base(), 'manual', layers, 'manual');
    layers[0].speedMs = 99;
    expect(weatherLayers(project, 'manual')[0].speedMs).toBe(3);
  });
});
