/**
 * Mission intent: the name, launch-site label and target apogee the design is
 * judged against. They live in the project document so a saved project reopens
 * with the goal it was saved with. SI throughout; the site label is free text
 * (coordinates are `Workspace.site`).
 */

export interface Mission {
  name: string;
  /** Human launch-site label, e.g. "Huntsville, AL". */
  site: string;
  /** Target apogee above the launch site, meters. */
  targetApogeeM: number;
}

export const DEFAULT_MISSION: Mission = {
  name: 'Untitled mission',
  site: 'Unspecified site',
  targetApogeeM: 1000,
};

/** Fail-closed reader for a stored mission: every field present and typed. */
export function parseMission(value: unknown): Mission {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('mission must be an object');
  }
  const raw = value as Record<string, unknown>;
  if (typeof raw.name !== 'string') throw new Error('mission.name must be a string');
  if (typeof raw.site !== 'string') throw new Error('mission.site must be a string');
  const target = raw.targetApogeeM;
  if (typeof target !== 'number' || !Number.isFinite(target) || target <= 0) {
    throw new Error('mission.targetApogeeM must be a positive finite number');
  }
  return { name: raw.name, site: raw.site, targetApogeeM: target };
}
