/**
 * C3 Waiver-Containment Engine
 *
 * Post-simulation checks that answer "does this Monte Carlo landing cloud
 * stay inside the launch waiver?" — a free-form polygon containment gate, an
 * FAA-style waiver-cylinder check, KML export of the cloud and flight path,
 * and the forecast-wind hook (resolveForecastWinds, which lives in
 * weather.ts).
 *
 * Fail-closed contract: every entry point validates before computing and
 * throws rather than returning a silent bogus verdict. Empty landing clouds,
 * degenerate polygons, non-positive radii, and any non-finite coordinate are
 * rejected with TypeError/RangeError. Classification ambiguity resolves
 * toward "breach" except for points exactly on the polygon boundary, which
 * count as contained — a waiver area includes its boundary.
 */

import type { LandingPoint } from './monteCarlo';

/** Point pair shared by landing clouds and waiver polygons. */
interface Point2D {
  x: number;
  y: number;
}

/**
 * Rejects an empty landing cloud; per-point finiteness is checked by the
 * caller-specific loops so the error can name the offending index.
 */
function requireNonEmptyLandings(landings: readonly LandingPoint[], fn: string): void {
  if (landings === undefined || landings.length === 0) {
    throw new RangeError(`${fn}: landing cloud must be a non-empty array`);
  }
}

/**
 * Rejects an empty or non-finite landing. Also used for the apogee track,
 * which shares the x/y shape plus a z.
 */
function requireFinitePoint(p: Point2D, what: string, index: number): void {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) {
    throw new TypeError(`${what} ${index} must have finite x/y (got x=${p.x}, y=${p.y})`);
  }
}

function requireFinitePolygon(polygon: readonly Point2D[], fn: string): void {
  if (polygon === undefined || polygon.length < 3) {
    throw new RangeError(`${fn}: polygon must have at least 3 vertices (got ${polygon === undefined ? 'undefined' : polygon.length})`);
  }
  for (let i = 0; i < polygon.length; i++) {
    requireFinitePoint(polygon[i], `${fn}: polygon vertex`, i);
  }
}

/**
 * Point-in-polygon via even-odd ray casting on a horizontal ray.
 *
 * Boundary rule: the polygon is a closed region, so a point exactly on any
 * edge segment (verified by a zero cross product plus segment bounding box)
 * is contained. Vertices are covered by the same test. Self-intersecting
 * polygons are not refused but follow the raw even-odd winding of their
 * declared vertex order — callers wanting strict semantics should pass
 * simple polygons.
 */
function pointInPolygon(p: Point2D, polygon: readonly Point2D[]): boolean {
  let inside = false;
  let j = polygon.length - 1;
  for (let i = 0; i < polygon.length; i++) {
    const { x: xi, y: yi } = polygon[i];
    const { x: xj, y: yj } = polygon[j];
    // Inclusive edge: cross product relative to segment j -> i, within bounds.
    const cross = (xi - xj) * (p.y - yj) - (p.x - xj) * (yi - yj);
    if (
      cross === 0 &&
      p.x >= Math.min(xi, xj) &&
      p.x <= Math.max(xi, xj) &&
      p.y >= Math.min(yi, yj) &&
      p.y <= Math.max(yi, yj)
    ) {
      return true;
    }
    // Ray crossing test for a horizontal ray through p toward +x.
    if ((yi > p.y) !== (yj > p.y)) {
      const xIntersect = ((xj - xi) * (p.y - yi)) / (yj - yi) + xi;
      if (p.x < xIntersect) inside = !inside;
    }
    j = i;
  }
  return inside;
}

export interface ContainmentCheckResult {
  /**
   * True only when the ENTIRE cloud lies inside the polygon — the
   * conservative waiver gate (containmentPct === 1). A single breach fails
   * the gate.
   */
  inside: boolean;
  /** Fraction of landings contained by the polygon, in [0, 1]. */
  containmentPct: number;
  /** Landings outside the polygon, in input order. */
  breaching: LandingPoint[];
}

/**
 * Polygon containment of a Monte Carlo landing cloud (e.g.
 * `runMonteCarlo(...).landings`) against a waiver boundary. Fail-closed:
 * throws on an empty cloud, a polygon with fewer than 3 vertices, or any
 * non-finite coordinate.
 */
export function containmentCheck(
  landings: readonly LandingPoint[],
  polygon: readonly Point2D[]
): ContainmentCheckResult {
  requireNonEmptyLandings(landings, 'containmentCheck');
  requireFinitePolygon(polygon, 'containmentCheck');
  for (let i = 0; i < landings.length; i++) {
    requireFinitePoint(landings[i], 'containmentCheck: landing', i);
  }

  const breaching: LandingPoint[] = [];
  let insideCount = 0;
  for (const p of landings) {
    if (pointInPolygon(p, polygon)) {
      insideCount++;
    } else {
      breaching.push(p);
    }
  }
  return {
    inside: breaching.length === 0,
    containmentPct: insideCount / landings.length,
    breaching,
  };
}

export interface CylinderCheckResult {
  /**
   * Fraction of landings inside the horizontal radius, in [0, 1]. Collapses
   * to 0 when `apogeeM` exceeds `ceilingM`: a flight that punches through
   * the waiver ceiling breaches the cylinder no matter where it lands
   * (fail-closed).
   */
  insidePct: number;
  /** Maximum radial landing distance from the center, meters. */
  maxRadialM: number;
}

/**
 * Waiver-cylinder check: a circular horizontal containment radius around a
 * pad-center, with an optional altitude ceiling. `ceilingM` and `apogeeM`
 * are a paired constraint — pass both or neither; with both, an apogee
 * above the ceiling fails the check outright. Fail-closed on an empty
 * cloud, non-positive radius/ceiling, and non-finite values.
 */
export function waiverCylinderCheck(
  landings: readonly LandingPoint[],
  centerX: number,
  centerY: number,
  radiusM: number,
  ceilingM?: number,
  apogeeM?: number
): CylinderCheckResult {
  requireNonEmptyLandings(landings, 'waiverCylinderCheck');
  if (!Number.isFinite(centerX) || !Number.isFinite(centerY)) {
    throw new TypeError(
      `waiverCylinderCheck: center must be finite (got centerX=${centerX}, centerY=${centerY})`
    );
  }
  if (!Number.isFinite(radiusM) || radiusM <= 0) {
    throw new RangeError(`waiverCylinderCheck: radiusM must be a finite positive number (got ${radiusM})`);
  }
  const hasCeiling = ceilingM !== undefined;
  const hasApogee = apogeeM !== undefined;
  if (hasCeiling !== hasApogee) {
    throw new RangeError('waiverCylinderCheck: ceilingM and apogeeM must be provided together (or not at all)');
  }
  if (hasCeiling) {
    const ceil = ceilingM as number;
    const apo = apogeeM as number;
    if (!Number.isFinite(ceil) || ceil <= 0) {
      throw new RangeError(`waiverCylinderCheck: ceilingM must be a finite positive number (got ${ceilingM})`);
    }
    if (!Number.isFinite(apo) || apo <= 0) {
      throw new RangeError(`waiverCylinderCheck: apogeeM must be a finite positive number (got ${apogeeM})`);
    }
  }
  for (let i = 0; i < landings.length; i++) {
    requireFinitePoint(landings[i], 'waiverCylinderCheck: landing', i);
  }

  let insideCount = 0;
  let maxRadialM = 0;
  for (const p of landings) {
    const radial = Math.hypot(p.x - centerX, p.y - centerY);
    if (radial > maxRadialM) maxRadialM = radial;
    if (radial <= radiusM) insideCount++;
  }

  let insidePct = insideCount / landings.length;
  if (hasCeiling && (apogeeM as number) > (ceilingM as number)) {
    insidePct = 0;
  }
  return { insidePct, maxRadialM };
}

/** XML text escapes for safe interpolation into KML. */
const XML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/**
 * XML-escapes a string for safe interpolation into KML text or attribute
 * values. Applied to every interpolated value (names included), so generated
 * documents stay well-formed for arbitrary content.
 */
export function escapeXml(text: string): string {
  let out = '';
  for (const ch of text) {
    out += XML_ESCAPE[ch] ?? ch;
  }
  return out;
}

const KML_XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
const KML_NAMESPACE_2_2 = 'http://www.opengis.net/kml/2.2';

/** Fixed 6-decimal formatting; collapses -0 so coordinates stay canonical. */
function formatCoord(value: number): string {
  return (value === 0 ? 0 : value).toFixed(6);
}

/**
 * Serializes the landing cloud (and optional 3D apogee track) into a KML 2.2
 * document: one `<Placemark><Point>` per landing plus, when `apogeeTrack` is
 * given, a `<Placemark><LineString>` flight path with `absolute` altitude
 * mode.
 *
 * Coordinates are the simulation's local ENU frame (East = x, North = y,
 * Up = z, meters from the launch pad) — a georeferencing transform must be
 * applied by the consumer before the document is used against a globe.
 * Fail-closed: throws on an empty cloud, a non-empty-required apogeeTrack,
 * and any non-finite value.
 */
export function exportKml(
  landings: readonly LandingPoint[],
  apogeeTrack?: readonly { x: number; y: number; z: number }[]
): string {
  requireNonEmptyLandings(landings, 'exportKml');
  for (let i = 0; i < landings.length; i++) {
    requireFinitePoint(landings[i], 'exportKml: landing', i);
  }
  if (apogeeTrack !== undefined) {
    if (apogeeTrack.length === 0) {
      throw new RangeError('exportKml: apogeeTrack must be a non-empty array when provided');
    }
    for (let i = 0; i < apogeeTrack.length; i++) {
      const p = apogeeTrack[i];
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
        throw new TypeError(
          `exportKml: apogeeTrack point ${i} must have finite x/y/z (got x=${p.x}, y=${p.y}, z=${p.z})`
        );
      }
    }
  }

  const parts: string[] = [KML_XML_DECL];
  parts.push(`<kml xmlns="${KML_NAMESPACE_2_2}">`);
  parts.push('<Document>');
  parts.push(`<name>${escapeXml('Astraea Waiver Containment')}</name>`);

  for (let i = 0; i < landings.length; i++) {
    const p = landings[i];
    parts.push('  <Placemark>');
    parts.push(`    <name>${escapeXml(`Landing ${i + 1}`)}</name>`);
    parts.push('    <Point>');
    parts.push(`      <coordinates>${formatCoord(p.x)},${formatCoord(p.y)}</coordinates>`);
    parts.push('    </Point>');
    parts.push('  </Placemark>');
  }

  if (apogeeTrack !== undefined) {
    const coords = apogeeTrack
      .map((p) => `${formatCoord(p.x)},${formatCoord(p.y)},${formatCoord(p.z)}`)
      .join(' ');
    parts.push('  <Placemark>');
    parts.push('    <name>Flight path</name>');
    parts.push('    <LineString>');
    parts.push('      <altitudeMode>absolute</altitudeMode>');
    parts.push(`      <coordinates>${coords}</coordinates>`);
    parts.push('    </LineString>');
    parts.push('  </Placemark>');
  }

  parts.push('</Document>');
  parts.push('</kml>');
  return parts.join('\n');
}