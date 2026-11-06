/**
 * Workspace settings: the launcher and analysis inputs that live alongside
 * the vehicle in the project envelope. All values are canonical SI with
 * explicit frames; display conversion is presentation-only.
 */

import type { LaunchOptions, McEnsembleInput } from './caseResolver';

/** Site and time reference for weather and trajectory. */
export interface SiteSettings {
  /** Site latitude, decimal degrees (WGS84). */
  latDeg: number;
  /** Site longitude, decimal degrees (WGS84). */
  lonDeg: number;
  /** Launch altitude, meters above sea level. */
  altitudeASLM: number;
  /** Planned launch time, ISO-8601 with timezone. Null when unscheduled. */
  launchTimeISO: string | null;
}

export type EnsembleVersion = 'legacy-sequential-v1' | 'per-run-v2';

export interface EnsembleSettings {
  nRuns: number;
  seed: number;
  version: EnsembleVersion;
  windAzimuthDegSigma: number;
  railAngleDegSigma: number;
  impulsePctSigma: number;
}

/** Aero screening limits: criteria the UI evaluates, never the solver. */
export interface AeroLimits {
  minStaticMarginCal: number;
  flutterMarginPct: number;
  maxBoattailHalfAngleDeg: number;
}

export type ChargeMethodStatus = 'unreviewed' | 'approved' | 'rejected';

/**
 * Recovery overrides not derivable from the airframe tree. Charges stay
 * withheld until the method is approved; see src/recovery/charges.ts.
 */
export interface RecoverySettings {
  shearPinCount: number;
  chargeMethod: ChargeMethodStatus;
}

export interface Workspace {
  motorId: string;
  launch: LaunchOptions;
  site: SiteSettings;
  ensemble: EnsembleSettings;
  aeroLimits: AeroLimits;
  recovery: RecoverySettings;
}

export const DEFAULT_WORKSPACE: Workspace = {
  motorId: 'estes_c6',
  launch: {
    railLengthM: 3.0,
    railElevationDeg: 85,
    railAzimuthDeg: 0,
    windSpeedMps: 3.0,
    windAzimuthDeg: 0,
    finCantDeg: 0,
    mainDeployAltitudeM: 300,
  },
  site: {
    latDeg: 47.6062,
    lonDeg: -122.3321,
    altitudeASLM: 0,
    launchTimeISO: null,
  },
  ensemble: {
    nRuns: 100,
    seed: 20260927,
    version: 'per-run-v2',
    windAzimuthDegSigma: 10,
    railAngleDegSigma: 1,
    impulsePctSigma: 5,
  },
  aeroLimits: {
    minStaticMarginCal: 1.0,
    flutterMarginPct: 20,
    maxBoattailHalfAngleDeg: 10,
  },
  recovery: {
    shearPinCount: 2,
    chargeMethod: 'unreviewed',
  },
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Field errors for workspace validation, keyed by dotted path. */
export type WorkspaceIssues = Record<string, string>;

function checkFinite(issues: WorkspaceIssues, path: string, value: unknown): void {
  if (!isFiniteNumber(value)) issues[path] = 'must be a finite number';
}

/** Fail-closed workspace validation: every field the engines consume. */
export function validateWorkspace(value: unknown): { workspace: Workspace; issues: WorkspaceIssues } {
  const issues: WorkspaceIssues = {};
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const pick = (section: string): Record<string, unknown> => {
    const s = raw[section];
    return typeof s === 'object' && s !== null ? (s as Record<string, unknown>) : {};
  };
  const motorId = typeof raw.motorId === 'string' && raw.motorId.length > 0 ? raw.motorId : DEFAULT_WORKSPACE.motorId;

  const l = pick('launch');
  const launch: LaunchOptions = {
    railLengthM: isFiniteNumber(l.railLengthM) ? l.railLengthM : DEFAULT_WORKSPACE.launch.railLengthM,
    railElevationDeg: isFiniteNumber(l.railElevationDeg) ? l.railElevationDeg : DEFAULT_WORKSPACE.launch.railElevationDeg,
    railAzimuthDeg: isFiniteNumber(l.railAzimuthDeg) ? l.railAzimuthDeg : DEFAULT_WORKSPACE.launch.railAzimuthDeg,
    windSpeedMps: isFiniteNumber(l.windSpeedMps) ? l.windSpeedMps : DEFAULT_WORKSPACE.launch.windSpeedMps,
    windAzimuthDeg: isFiniteNumber(l.windAzimuthDeg) ? l.windAzimuthDeg : DEFAULT_WORKSPACE.launch.windAzimuthDeg,
    finCantDeg: isFiniteNumber(l.finCantDeg) ? l.finCantDeg : DEFAULT_WORKSPACE.launch.finCantDeg,
    mainDeployAltitudeM: isFiniteNumber(l.mainDeployAltitudeM)
      ? l.mainDeployAltitudeM
      : DEFAULT_WORKSPACE.launch.mainDeployAltitudeM,
  };
  checkFinite(issues, 'launch.railLengthM', launch.railLengthM);
  if (launch.railLengthM <= 0) issues['launch.railLengthM'] = 'must be positive';
  if (launch.railElevationDeg < 0 || launch.railElevationDeg > 90) {
    issues['launch.railElevationDeg'] = 'must be within 0 to 90 deg from horizontal';
  }
  if (launch.windSpeedMps < 0) issues['launch.windSpeedMps'] = 'must not be negative';

  const s = pick('site');
  const site: SiteSettings = {
    latDeg: isFiniteNumber(s.latDeg) ? s.latDeg : DEFAULT_WORKSPACE.site.latDeg,
    lonDeg: isFiniteNumber(s.lonDeg) ? s.lonDeg : DEFAULT_WORKSPACE.site.lonDeg,
    altitudeASLM: isFiniteNumber(s.altitudeASLM) ? s.altitudeASLM : DEFAULT_WORKSPACE.site.altitudeASLM,
    launchTimeISO: typeof s.launchTimeISO === 'string' ? s.launchTimeISO : null,
  };
  if (site.latDeg < -90 || site.latDeg > 90) issues['site.latDeg'] = 'must be within -90 to 90 (WGS84)';
  if (site.lonDeg < -180 || site.lonDeg > 180) issues['site.lonDeg'] = 'must be within -180 to 180 (WGS84)';

  const e = pick('ensemble');
  const ensemble: EnsembleSettings = {
    nRuns: isFiniteNumber(e.nRuns) ? Math.round(e.nRuns) : DEFAULT_WORKSPACE.ensemble.nRuns,
    seed: isFiniteNumber(e.seed) ? Math.round(e.seed) : DEFAULT_WORKSPACE.ensemble.seed,
    version: e.version === 'legacy-sequential-v1' ? 'legacy-sequential-v1' : 'per-run-v2',
    windAzimuthDegSigma: isFiniteNumber(e.windAzimuthDegSigma)
      ? e.windAzimuthDegSigma
      : DEFAULT_WORKSPACE.ensemble.windAzimuthDegSigma,
    railAngleDegSigma: isFiniteNumber(e.railAngleDegSigma)
      ? e.railAngleDegSigma
      : DEFAULT_WORKSPACE.ensemble.railAngleDegSigma,
    impulsePctSigma: isFiniteNumber(e.impulsePctSigma)
      ? e.impulsePctSigma
      : DEFAULT_WORKSPACE.ensemble.impulsePctSigma,
  };
  if (ensemble.nRuns < 1 || ensemble.nRuns > 1000) issues['ensemble.nRuns'] = 'must be within 1 to 1000';
  if (ensemble.windAzimuthDegSigma < 0) issues['ensemble.windAzimuthDegSigma'] = 'must not be negative';
  if (ensemble.railAngleDegSigma < 0) issues['ensemble.railAngleDegSigma'] = 'must not be negative';
  if (ensemble.impulsePctSigma < 0) issues['ensemble.impulsePctSigma'] = 'must not be negative';

  const a = pick('aeroLimits');
  const aeroLimits: AeroLimits = {
    minStaticMarginCal: isFiniteNumber(a.minStaticMarginCal) ? a.minStaticMarginCal : DEFAULT_WORKSPACE.aeroLimits.minStaticMarginCal,
    flutterMarginPct: isFiniteNumber(a.flutterMarginPct) ? a.flutterMarginPct : DEFAULT_WORKSPACE.aeroLimits.flutterMarginPct,
    maxBoattailHalfAngleDeg: isFiniteNumber(a.maxBoattailHalfAngleDeg)
      ? a.maxBoattailHalfAngleDeg
      : DEFAULT_WORKSPACE.aeroLimits.maxBoattailHalfAngleDeg,
  };

  const r = pick('recovery');
  const recovery: RecoverySettings = {
    shearPinCount: isFiniteNumber(r.shearPinCount) ? Math.round(r.shearPinCount) : DEFAULT_WORKSPACE.recovery.shearPinCount,
    chargeMethod: r.chargeMethod === 'approved' || r.chargeMethod === 'rejected' ? r.chargeMethod : 'unreviewed',
  };
  if (recovery.shearPinCount < 0) issues['recovery.shearPinCount'] = 'must not be negative';

  return { workspace: { motorId, launch, site, ensemble, aeroLimits, recovery }, issues };
}

/** Ensemble block of the case resolver's McEnsembleInput for trajectory runs. */
export function toMcEnsembleInput(
  ensemble: EnsembleSettings,
  wind: McEnsembleInput['wind'],
): McEnsembleInput {
  return {
    nRuns: ensemble.nRuns,
    windAzimuthDegSigma: ensemble.windAzimuthDegSigma,
    railAngleDegSigma: ensemble.railAngleDegSigma,
    impulsePctSigma: ensemble.impulsePctSigma,
    wind,
  };
}

function strictObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Record<string, unknown>;
}

function strictNumber(section: Record<string, unknown>, section_: string, key: string): number {
  const v = section[key];
  if (!isFiniteNumber(v)) throw new Error(`${section_}.${key} must be a finite number`);
  return v;
}

function strictInteger(section: Record<string, unknown>, section_: string, key: string): number {
  const v = strictNumber(section, section_, key);
  if (!Number.isInteger(v)) throw new Error(`${section_}.${key} must be an integer`);
  return v;
}

/**
 * Fail-closed workspace reader for stored documents. Unlike `validateWorkspace`
 * (a tolerant form helper that fills defaults while the user edits), a stored
 * workspace must carry every field with the right type and be within range;
 * anything else throws instead of being defaulted or repaired.
 */
export function parseWorkspace(value: unknown): Workspace {
  const raw = strictObject(value, 'workspace');
  if (typeof raw.motorId !== 'string' || raw.motorId.length === 0) {
    throw new Error('workspace.motorId must be a non-empty string');
  }

  const l = strictObject(raw.launch, 'workspace.launch');
  const launch: LaunchOptions = {
    railLengthM: strictNumber(l, 'launch', 'railLengthM'),
    railElevationDeg: strictNumber(l, 'launch', 'railElevationDeg'),
    railAzimuthDeg: strictNumber(l, 'launch', 'railAzimuthDeg'),
    windSpeedMps: strictNumber(l, 'launch', 'windSpeedMps'),
    windAzimuthDeg: strictNumber(l, 'launch', 'windAzimuthDeg'),
    finCantDeg: strictNumber(l, 'launch', 'finCantDeg'),
    mainDeployAltitudeM: strictNumber(l, 'launch', 'mainDeployAltitudeM'),
  };
  if (launch.railLengthM <= 0) throw new Error('launch.railLengthM must be positive');
  if (launch.railElevationDeg < 0 || launch.railElevationDeg > 90) {
    throw new Error('launch.railElevationDeg must be within 0 to 90 deg from horizontal');
  }
  if (launch.windSpeedMps < 0) throw new Error('launch.windSpeedMps must not be negative');

  const s = strictObject(raw.site, 'workspace.site');
  const launchTimeISO = s.launchTimeISO;
  if (launchTimeISO !== null && typeof launchTimeISO !== 'string') {
    throw new Error('site.launchTimeISO must be a string or null');
  }
  const site: SiteSettings = {
    latDeg: strictNumber(s, 'site', 'latDeg'),
    lonDeg: strictNumber(s, 'site', 'lonDeg'),
    altitudeASLM: strictNumber(s, 'site', 'altitudeASLM'),
    launchTimeISO,
  };
  if (site.latDeg < -90 || site.latDeg > 90) throw new Error('site.latDeg must be within -90 to 90 (WGS84)');
  if (site.lonDeg < -180 || site.lonDeg > 180) throw new Error('site.lonDeg must be within -180 to 180 (WGS84)');

  const e = strictObject(raw.ensemble, 'workspace.ensemble');
  if (e.version !== 'legacy-sequential-v1' && e.version !== 'per-run-v2') {
    throw new Error("ensemble.version must be 'legacy-sequential-v1' or 'per-run-v2'");
  }
  const ensemble: EnsembleSettings = {
    nRuns: strictInteger(e, 'ensemble', 'nRuns'),
    seed: strictInteger(e, 'ensemble', 'seed'),
    version: e.version,
    windAzimuthDegSigma: strictNumber(e, 'ensemble', 'windAzimuthDegSigma'),
    railAngleDegSigma: strictNumber(e, 'ensemble', 'railAngleDegSigma'),
    impulsePctSigma: strictNumber(e, 'ensemble', 'impulsePctSigma'),
  };
  if (ensemble.nRuns < 1 || ensemble.nRuns > 1000) throw new Error('ensemble.nRuns must be within 1 to 1000');
  if (ensemble.windAzimuthDegSigma < 0) throw new Error('ensemble.windAzimuthDegSigma must not be negative');
  if (ensemble.railAngleDegSigma < 0) throw new Error('ensemble.railAngleDegSigma must not be negative');
  if (ensemble.impulsePctSigma < 0) throw new Error('ensemble.impulsePctSigma must not be negative');

  const a = strictObject(raw.aeroLimits, 'workspace.aeroLimits');
  const aeroLimits: AeroLimits = {
    minStaticMarginCal: strictNumber(a, 'aeroLimits', 'minStaticMarginCal'),
    flutterMarginPct: strictNumber(a, 'aeroLimits', 'flutterMarginPct'),
    maxBoattailHalfAngleDeg: strictNumber(a, 'aeroLimits', 'maxBoattailHalfAngleDeg'),
  };

  const r = strictObject(raw.recovery, 'workspace.recovery');
  if (r.chargeMethod !== 'unreviewed' && r.chargeMethod !== 'approved' && r.chargeMethod !== 'rejected') {
    throw new Error("recovery.chargeMethod must be 'unreviewed', 'approved' or 'rejected'");
  }
  const recovery: RecoverySettings = {
    shearPinCount: strictInteger(r, 'recovery', 'shearPinCount'),
    chargeMethod: r.chargeMethod,
  };
  if (recovery.shearPinCount < 0) throw new Error('recovery.shearPinCount must not be negative');

  return { motorId: raw.motorId, launch, site, ensemble, aeroLimits, recovery };
}
