/**
 * C12 — GPS-track ingest + landing back-cast (engine side; no UI).
 *
 * Parses handheld/avionics GPX tracks into the evidence pipeline's series
 * shapes, projects them to local ENU meters for comparison against
 * simulation outputs, and reports the measured touchdown against the
 * predicted dispersion (back-cast). All reported quantities are
 * descriptive: distance from the predicted mean in meters and in
 * mean-relative sigma radii, plus waiver-polygon containment through the
 * existing `containmentCheck`. No probabilistic compliance claim is made.
 */

import { XMLParser } from 'fast-xml-parser';
import type { AltitudeSample } from './altimetry';
import type { DispersionStatistics, LandingPoint } from '../sim/monteCarlo';
import { containmentCheck } from '../sim/waiverContainment';

/** One raw GPS fix in geographic coordinates. */
export interface GpsFix {
  /** Seconds since the track's first fix. */
  timeS: number;
  latDeg: number;
  lonDeg: number;
  /** Meters above sea level; null when the receiver logged no elevation. */
  eleM: number | null;
}

/** One GPS fix projected to local tangent-plane meters. */
export interface EnuFix {
  timeS: number;
  /** East of the projection origin, meters. */
  xM: number;
  /** North of the projection origin, meters. */
  yM: number;
  /** Meters above sea level; null when the receiver logged no elevation. */
  altM: number | null;
}

/** Measured touchdown extracted from a track, for back-cast comparison. */
export interface MeasuredTouchdown extends LandingPoint {
  timeS: number;
  altM: number | null;
}

/** Descriptive back-cast of a measured touchdown vs a prediction. */
export interface BackcastReport {
  /** Measured touchdown in prediction-local ENU meters. */
  measured: MeasuredTouchdown;
  /** Straight-line distance from the predicted mean, meters. */
  distanceFromMeanM: number;
  /** That distance in units of the predicted 1σ semi-major axis. */
  sigma1Radii: number | null;
  /** Waiver-polygon containment of the measured point; null when no polygon given. */
  insideWaiverPolygon: boolean | null;
}

export class InvalidGpxError extends Error {
  constructor(message: string) {
    super(`Invalid GPS track (.gpx): ${message}`);
    this.name = 'InvalidGpxError';
  }
}

const EARTH_RADIUS_M = 6371000;
const DEG_TO_RAD = Math.PI / 180;

/** Parse a GPX 1.0/1.1 document's first track segment into time-ordered fixes. */
export function parseGpxTrack(text: string): GpsFix[] {
  if (!text || text.trim() === '') {
    throw new InvalidGpxError('empty document');
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(text) as Record<string, unknown>;
  } catch (err) {
    throw new InvalidGpxError(`XML parse failed: ${(err as Error).message}`);
  }
  const gpx = doc.gpx as Record<string, unknown> | undefined;
  if (!gpx || typeof gpx !== 'object') throw new InvalidGpxError('missing root gpx element');
  const trk = asSingle(gpx.trk);
  if (!trk) throw new InvalidGpxError('no trk element — not a track log');
  const seg = asSingle(trk.trkseg);
  if (!seg) throw new InvalidGpxError('track has no trkseg points');
  const rawPoints = seg.trkpt;
  const points = (Array.isArray(rawPoints) ? rawPoints : [rawPoints]).filter(
    (p): p is Record<string, unknown> => !!p && typeof p === 'object'
  );
  if (points.length < 2) {
    throw new InvalidGpxError(`need at least 2 track points, found ${points.length}`);
  }

  const fixes: Array<GpsFix & { epochMs: number }> = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const lat = numAttr(p, 'lat');
    const lon = numAttr(p, 'lon');
    if (lat === null || lat < -90 || lat > 90) {
      throw new InvalidGpxError(`track point ${i} has invalid latitude '${stringAttr(p, 'lat')}'`);
    }
    if (lon === null || lon < -180 || lon > 180) {
      throw new InvalidGpxError(`track point ${i} has invalid longitude '${stringAttr(p, 'lon')}'`);
    }
    const timeRaw = typeof p.time === 'string' ? p.time : null;
    const epochMs = timeRaw === null ? Number.NaN : Date.parse(timeRaw);
    if (!Number.isFinite(epochMs)) {
      throw new InvalidGpxError(
        `track point ${i} needs a parseable ISO time for alignment (got '${String(p.time)}')`
      );
    }
    const eleRaw = p.ele;
    const ele = eleRaw === undefined || eleRaw === null ? null : Number(eleRaw);
    fixes.push({ epochMs, timeS: 0, latDeg: lat, lonDeg: lon, eleM: ele !== null && Number.isFinite(ele) ? ele : null });
  }
  const t0 = fixes[0].epochMs;
  return fixes.map((f) => ({
    timeS: (f.epochMs - t0) / 1000,
    latDeg: f.latDeg,
    lonDeg: f.lonDeg,
    eleM: f.eleM,
  }));
}

/**
 * Project fixes to local ENU meters (equirectangular, adequate for
 * sub-100 km flight-test extents). Origin defaults to the first fix —
 * typically the pad — so (0, 0) is the launch point.
 */
export function gpsToEnu(
  fixes: readonly GpsFix[],
  origin?: { latDeg: number; lonDeg: number }
): { enu: EnuFix[]; origin: { latDeg: number; lonDeg: number } } {
  if (fixes.length === 0) throw new InvalidGpxError('cannot project an empty track');
  const ref = origin ?? { latDeg: fixes[0].latDeg, lonDeg: fixes[0].lonDeg };
  const cosLat = Math.cos(ref.latDeg * DEG_TO_RAD);
  const enu = fixes.map((f) => ({
    timeS: f.timeS,
    xM: (f.lonDeg - ref.lonDeg) * DEG_TO_RAD * EARTH_RADIUS_M * cosLat,
    yM: (f.latDeg - ref.latDeg) * DEG_TO_RAD * EARTH_RADIUS_M,
    altM: f.eleM,
  }));
  return { enu, origin: ref };
}

/** Altitude series of the fixes that carry elevation, for resample/align. */
export function gpsAltitudeSeries(enu: readonly EnuFix[]): AltitudeSample[] {
  return enu
    .filter((f) => f.altM !== null)
    .map((f) => ({ timeS: f.timeS, altitudeM: f.altM as number }));
}

/** Measured touchdown = the track's last fix (lowest receiver timestamp end). */
export function extractTouchdown(enu: readonly EnuFix[]): MeasuredTouchdown {
  if (enu.length === 0) throw new InvalidGpxError('cannot extract touchdown from an empty track');
  const last = enu[enu.length - 1];
  return { x: last.xM, y: last.yM, timeS: last.timeS, altM: last.altM };
}

/**
 * Back-cast a measured touchdown against a predicted dispersion:
 * descriptive distance metrics plus optional waiver-polygon containment.
 * `stats` come from the same run the comparison targets (pass the
 * run's own DispersionResult); sigma-relative figures are undefined for
 * degenerate (zero-spread) clouds.
 */
export function backcastTouchdown(
  measured: MeasuredTouchdown,
  stats: Pick<DispersionStatistics, 'mean' | 'sigma1'>,
  waiverPolygon?: ReadonlyArray<{ x: number; y: number }>
): BackcastReport {
  const dx = measured.x - stats.mean.x;
  const dy = measured.y - stats.mean.y;
  const distanceFromMeanM = Math.hypot(dx, dy);
  const sigma1Radii =
    Number.isFinite(stats.sigma1) && stats.sigma1 > 0 ? distanceFromMeanM / stats.sigma1 : null;
  const insideWaiverPolygon = waiverPolygon
    ? containmentCheck([measured], waiverPolygon).inside
    : null;
  return { measured, distanceFromMeanM, sigma1Radii, insideWaiverPolygon };
}
function asSingle(value: unknown): Record<string, unknown> | null {
  const item = Array.isArray(value) ? value[0] : value;
  return !!item && typeof item === 'object' ? (item as Record<string, unknown>) : null;
}

function stringAttr(node: Record<string, unknown>, name: string): string | null {
  const v = node[`@_${name}`] ?? node[name];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}


function numAttr(node: Record<string, unknown>, name: string): number | null {
  const raw = node[`@_${name}`] ?? node[name];
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? n : null;
}
