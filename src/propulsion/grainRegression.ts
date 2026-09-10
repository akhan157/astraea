/**
 * Astraea Solid Propellant Grain Regression (geometry lane).
 *
 * Webbed sampling of BATES (cylindrical core) and star grains: at each burned
 * web depth the open port area, instantaneous burning surface, and remaining
 * propellant volume are computed from exact cylindrical geometry (BATES) or
 * the analytic star-perimeter approximation
 *     P = 2*pi*valleyRadius + 2*points*(outerRadius - valleyRadius)
 * (tip of each star point reaches the outer case). Web depth advances by
 * `webStep` meters per sample starting at zero; the burn-rate coefficient is
 * the constant linear burn rate (m/s) of the Saint-Robert's-law
 * r = a*Pc^n restricted to n = 0, i.e. the per-step time increment is
 * webStep/burnRateCoeff and the rate feeds chamberPressure directly.
 *
 * IMPORTANT: `burnRateCoeff` is a VALIDATED, time-axis-only input. The
 * geometry trace returned by regressBates/regressStar is a function of the
 * burned web depth only — portArea, burnArea and volumeRemaining are computed
 * purely from geometry and do NOT depend on burnRateCoeff. The coefficient
 * only maps web depth to a wall-clock time increment (webStep/burnRateCoeff);
 * it never alters the shape or scale of the geometry trace.
 *
 * SI throughout: meters, meters^2, meters^3, and (chamberPressure) Pa.
 * Fail-closed: every geometry/ballistics input is validated; non-finite or
 * non-positive values throw RangeError, and chamberPressure additionally
 * throws on a non-finite/overflow result.
 */

/** BATES (cylindrical core) grain geometry. */
export interface BatesGrain {
  outerDiameter: number; // m
  length: number; // m
  coreDiameter: number; // m, central bore diameter
  inhibitedEnds: boolean; // true: end faces coated, only the core surface burns
}

/** Star grain geometry; star points reach from the valley radius to the case. */
export interface StarGrain {
  outerDiameter: number; // m
  length: number; // m
  points: number; // number of star points, integer >= 3
  valleyRadius: number; // m, radius of the valley circle between star points
}

/** One geometry sample per burned web depth. */
export interface GrainRegressionTrace {
  webBurned: number[]; // m, per-sample burned web, starts at 0
  portArea: number[]; // m^2, open bore cross-section at that web
  burnArea: number[]; // m^2, instantaneous burning surface at that web
  volumeRemaining: number[]; // m^3, propellant volume left at that web
}

function requirePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`grain regression: ${name} must be finite and > 0, got ${value}`);
  }
}

/**
 * Web depths at which geometry is sampled: 0, webStep, 2*webStep, ... plus a
 * final sample clamped exactly onto the full web so the trace always reaches
 * burnout (remaining volume 0).
 */
function webSamples(maxWeb: number, webStep: number): number[] {
  const count = Math.max(1, Math.ceil(maxWeb / webStep));
  const samples: number[] = new Array(count + 1);
  for (let i = 0; i <= count; i++) {
    const w = i * webStep;
    samples[i] = w < maxWeb ? w : maxWeb;
  }
  return samples;
}

/**
 * Samples a Bates grain every `webStep` meters of burned web. The burning
 * surface is the bore lateral wall plus, unless the ends are inhibited, both
 * annular end faces; the outer surface is always case-bonded/inhibited. Full
 * web is (outerDiameter - coreDiameter)/2.
 *
 * @param burnRateCoeff constant linear burn rate in m/s (used for the
 *   per-step time increment webStep/burnRateCoeff and for chamberPressure)
 */
export function regressBates(
  grain: BatesGrain,
  webStep: number,
  burnRateCoeff: number,
): GrainRegressionTrace {
  requirePositive(webStep, 'webStep');
  requirePositive(burnRateCoeff, 'burnRateCoeff');
  requirePositive(grain.outerDiameter, 'grain.outerDiameter');
  requirePositive(grain.coreDiameter, 'grain.coreDiameter');
  requirePositive(grain.length, 'grain.length');
  if (grain.outerDiameter <= grain.coreDiameter) {
    throw new RangeError(
      `grain regression: outerDiameter must exceed coreDiameter, got ${grain.outerDiameter} <= ${grain.coreDiameter}`,
    );
  }

  const outerR = grain.outerDiameter / 2;
  const coreR = grain.coreDiameter / 2;
  const maxWeb = outerR - coreR;
  const ws = webSamples(maxWeb, webStep);
  const count = ws.length;

  const webBurned: number[] = new Array(count);
  const portArea: number[] = new Array(count);
  const burnArea: number[] = new Array(count);
  const volumeRemaining: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const w = ws[i];
    const coreRw = coreR + w;
    const portR2 = coreRw * coreRw;
    const annulusArea = Math.PI * (outerR * outerR - portR2);
    webBurned[i] = w;
    portArea[i] = Math.PI * portR2;
    burnArea[i] = 2 * Math.PI * coreRw * grain.length + (grain.inhibitedEnds ? 0 : 2 * annulusArea);
    volumeRemaining[i] = annulusArea * grain.length;
  }

  return { webBurned, portArea, burnArea, volumeRemaining };
}

/**
 * Samples a star grain every `webStep` meters of burned web using the
 * analytic perimeter approximation
 *     P(w) = 2*pi*(valleyRadius + w) + 2*points*(outerRadius - valleyRadius - w)
 * i.e. a circle expanding from the valley radius plus N radial point sides
 * eroding toward the case at the same rate. The bore cross-section is
 * approximated as the circle of radius (valleyRadius + w). Full web is
 * (outerDiameter/2 - valleyRadius): the star points reach the case at
 * ignition and the grain is consumed when the circle reaches the case.
 *
 * @param burnRateCoeff constant linear burn rate in m/s (per-step time
 *   increment webStep/burnRateCoeff; feeds chamberPressure)
 */
export function regressStar(
  grain: StarGrain,
  webStep: number,
  burnRateCoeff: number,
): GrainRegressionTrace {
  requirePositive(webStep, 'webStep');
  requirePositive(burnRateCoeff, 'burnRateCoeff');
  requirePositive(grain.outerDiameter, 'grain.outerDiameter');
  requirePositive(grain.length, 'grain.length');
  requirePositive(grain.valleyRadius, 'grain.valleyRadius');
  if (!Number.isInteger(grain.points) || grain.points < 3) {
    throw new RangeError(`grain regression: points must be an integer >= 3, got ${grain.points}`);
  }

  const outerR = grain.outerDiameter / 2;
  if (outerR <= grain.valleyRadius) {
    throw new RangeError(
      `grain regression: outerDiameter/2 must exceed valleyRadius, got ${outerR} <= ${grain.valleyRadius}`,
    );
  }
  const maxWeb = outerR - grain.valleyRadius;
  const ws = webSamples(maxWeb, webStep);
  const count = ws.length;

  const webBurned: number[] = new Array(count);
  const portArea: number[] = new Array(count);
  const burnArea: number[] = new Array(count);
  const volumeRemaining: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const w = ws[i];
    const burnedR = grain.valleyRadius + w;
    const portR2 = burnedR * burnedR;
    const perimeter = 2 * Math.PI * burnedR + 2 * grain.points * (outerR - burnedR);
    webBurned[i] = w;
    portArea[i] = Math.PI * portR2;
    burnArea[i] = perimeter * grain.length;
    volumeRemaining[i] = Math.PI * (outerR * outerR - portR2) * grain.length;
  }

  return { webBurned, portArea, burnArea, volumeRemaining };
}

/**
 * Equilibrium chamber pressure (Pa) of the quasi-steady mass balance
 * m_dot = rho * A_b * r, Pc = m_dot * c* / A_t. The mass flow is open-closed:
 * burn rate r is supplied as the instantaneous linear regression rate.
 *
 * @param burnArea burning surface area (m^2)
 * @param burnRate linear burn rate (m/s) at that surface
 * @param propDensity propellant density (kg/m^3)
 * @param cstar characteristic velocity c* (m/s)
 * @param throatArea nozzle throat area (m^2)
 */
export function chamberPressure(
  burnArea: number,
  burnRate: number,
  propDensity: number,
  cstar: number,
  throatArea: number,
): number {
  requirePositive(burnArea, 'burnArea');
  requirePositive(burnRate, 'burnRate');
  requirePositive(propDensity, 'propDensity');
  requirePositive(cstar, 'cstar');
  requirePositive(throatArea, 'throatArea');
  const massFlow = propDensity * burnArea * burnRate; // kg/s
  const pc = (massFlow * cstar) / throatArea; // Pa
  // Fail-closed on the result, not just the inputs: an intermediate overflow
  // (finite inputs, non-finite product) or an over-wide pressure must throw
  // rather than silently emit an incoherent value.
  if (!Number.isFinite(pc) || pc <= 0) {
    throw new RangeError(
      `grain regression: chamberPressure produced a non-finite or non-positive result (${pc} Pa) from finite positive inputs`,
    );
  }
  return pc;
}