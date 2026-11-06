/**
 * Wind profiles held in the project envelope as weather snapshots, so a
 * manual table or a fetched sounding survives navigation, Save/Open and file
 * export instead of living only in the Weather panel's component state.
 *
 * The project carries at most one manual and one forecast snapshot, under
 * fixed ids. An empty profile removes its snapshot rather than storing an
 * empty array.
 */

import type { ProjectEnvelope, ProjectSnapshot } from '../formats/projectJson';
import type { WindLayer } from '../sim/weather';

export type WeatherProfileKind = 'manual' | 'forecast';

export const WEATHER_SNAPSHOT_IDS: Readonly<Record<WeatherProfileKind, string>> = {
  manual: 'weather-manual',
  forecast: 'weather-forecast',
};

/** The stored layers for one profile kind, or an empty list when none is stored. */
export function weatherLayers(project: ProjectEnvelope, kind: WeatherProfileKind): WindLayer[] {
  const snap = project.snapshots.find((s) => s.id === WEATHER_SNAPSHOT_IDS[kind] && s.kind === 'weather');
  return snap ? (snap.data as WindLayer[]) : [];
}

/** The stored snapshot for one profile kind, when any. */
export function weatherSnapshot(project: ProjectEnvelope, kind: WeatherProfileKind): ProjectSnapshot | null {
  return project.snapshots.find((s) => s.id === WEATHER_SNAPSHOT_IDS[kind] && s.kind === 'weather') ?? null;
}

/**
 * Replace one profile's snapshot, keeping every other snapshot in place.
 * Layers with any non-finite field are refused: the envelope reader rejects
 * them, so storing one would make the project unsavable.
 */
export function withWeatherProfile(
  project: ProjectEnvelope,
  kind: WeatherProfileKind,
  layers: ReadonlyArray<WindLayer>,
  source: string,
  createdAt: string = new Date().toISOString(),
): ProjectEnvelope {
  for (const [i, layer] of layers.entries()) {
    for (const field of ['altitudeM', 'speedMs', 'directionFromDeg', 'tempC', 'pressureHpa'] as const) {
      if (!Number.isFinite(layer[field])) {
        throw new Error(`wind layer ${i + 1} ${field} must be a finite number`);
      }
    }
  }
  const id = WEATHER_SNAPSHOT_IDS[kind];
  const rest = project.snapshots.filter((s) => s.id !== id);
  if (layers.length === 0) return { ...project, snapshots: rest };
  const snapshot: ProjectSnapshot = {
    id,
    kind: 'weather',
    createdAt,
    source,
    data: layers.map((l) => ({ ...l })),
  };
  return { ...project, snapshots: [...rest, snapshot] };
}
