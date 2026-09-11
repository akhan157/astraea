/**
 * Astraea Solid Propellant Grain Regression (geometry lane).
 *
 * Webbed sampling of the analytic grain geometries (docs/grain-geometry-
 * survey.md, C10 build set): BATES (cylindrical core), star (analytic
 * perimeter approximation), end burner (constant disc), rod & tube (two
 * concentric circles), moon burner (offset circle, then circle∩case
 * crescent), and C-slot (grown core circle plus receding slot walls). At
 * each burned web depth the open port area, instantaneous burning surface,
 * and remaining propellant volume are computed from exact (piecewise)
 * analytic geometry. The star uses
 *     P = 2*pi*valleyRadius + 2*points*(outerRadius - valleyRadius)
 * (tip of each star point reaches the outer case). Web depth advances by
 * `webStep` meters per sample starting at zero; the burn-rate coefficient is
 * the constant linear burn rate (m/s) of the Saint-Robert's-law
 * r = a*Pc^n restricted to n = 0, i.e. the per-step time increment is
 * webStep/burnRateCoeff and the rate feeds chamberPressure directly.
 *
 * IMPORTANT: `burnRateCoeff` is a VALIDATED, time-axis-only input. The
 * geometry trace returned by the regress* functions is a function of the
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
 * Samples an end-burning grain every `webStep` meters of burned web. The
 * grain is a solid right cylinder whose aft face is the single burning
 * surface; the lateral surface and the other end face are inhibited. The
 * burning face is a disc of constant area pi*(outerDiameter/2)^2 for the
 * whole burn (a perfectly flat trace) and there is no port, so portArea is
 * zero at every sample. Full web is the grain length: the flame front
 * travels down the axis and the grain is consumed at w = length. This is
 * the Warp9-style long-burn geometry (AeroTech I49/G69/I59, sugar EX
 * motors): constant disc area is neutral and the web is the longest one a
 * grain can offer.
 *
 * @param outerDiameter grain diameter (m)
 * @param length grain length (m); equals the full web
 * @param webStep web sampling interval (m)
 * @param burnRateCoeff constant linear burn rate in m/s (used for the
 *   per-step time increment webStep/burnRateCoeff and for chamberPressure)
 */
export function regressEndBurner(
  outerDiameter: number,
  length: number,
  webStep: number,
  burnRateCoeff: number,
): GrainRegressionTrace {
  requirePositive(webStep, 'webStep');
  requirePositive(burnRateCoeff, 'burnRateCoeff');
  requirePositive(outerDiameter, 'outerDiameter');
  requirePositive(length, 'length');

  const outerR = outerDiameter / 2;
  const faceArea = Math.PI * outerR * outerR;
  const ws = webSamples(length, webStep);
  const count = ws.length;

  const webBurned: number[] = new Array(count);
  const portArea: number[] = new Array(count);
  const burnArea: number[] = new Array(count);
  const volumeRemaining: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const w = ws[i];
    webBurned[i] = w;
    portArea[i] = 0;
    burnArea[i] = faceArea;
    volumeRemaining[i] = faceArea * (length - w);
  }
  // The last sample IS burnout (webSamples clamps onto the full web): exact
  // zero in the model, so pin it against float cancellation noise.
  volumeRemaining[count - 1] = 0;

  return { webBurned, portArea, burnArea, volumeRemaining };
}

/**
 * Samples a rod-and-tube grain every `webStep` meters of burned web. A
 * case-bonded propellant tube burns on its inner bore (radius grows) while a
 * central solid rod burns on its outer surface (radius shrinks) — two
 * concentric circles regressing at the same linear rate; ends are inhibited
 * (lateral surfaces only). While the rod lasts the combined perimeter
 *     2*pi*L*((coreR + w) + (rodR - w)) = 2*pi*L*(coreR + rodR)
 * is exactly constant, so the burn is perfectly neutral, and the port is the
 * annular gap between bore and rod. Full web is
 * (outerDiameter - coreDiameter)/2: the tube reaches the case. rodDiameter
 * must not exceed the tube web (outerDiameter - coreDiameter) so that rod and
 * tube burn out together and the grain is fully consumed — matched webs, as
 * in Nakka's Paradigm.
 *
 * @param burnRateCoeff constant linear burn rate in m/s (per-step time
 *   increment webStep/burnRateCoeff; feeds chamberPressure)
 */
export function regressRodTube(
  outerDiameter: number,
  length: number,
  coreDiameter: number,
  rodDiameter: number,
  webStep: number,
  burnRateCoeff: number,
): GrainRegressionTrace {
  requirePositive(webStep, 'webStep');
  requirePositive(burnRateCoeff, 'burnRateCoeff');
  requirePositive(outerDiameter, 'outerDiameter');
  requirePositive(coreDiameter, 'coreDiameter');
  requirePositive(rodDiameter, 'rodDiameter');
  requirePositive(length, 'length');
  if (outerDiameter <= coreDiameter) {
    throw new RangeError(
      `grain regression: outerDiameter must exceed coreDiameter, got ${outerDiameter} <= ${coreDiameter}`,
    );
  }
  if (coreDiameter <= rodDiameter) {
    throw new RangeError(
      `grain regression: coreDiameter must exceed rodDiameter, got ${coreDiameter} <= ${rodDiameter}`,
    );
  }
  if (rodDiameter > outerDiameter - coreDiameter) {
    throw new RangeError(
      `grain regression: rodDiameter must fit in the tube web (<= outerDiameter - coreDiameter), got ${rodDiameter} > ${outerDiameter - coreDiameter}`,
    );
  }

  const outerR = outerDiameter / 2;
  const coreR = coreDiameter / 2;
  const rodR = rodDiameter / 2;
  const maxWeb = outerR - coreR;
  const ws = webSamples(maxWeb, webStep);
  const count = ws.length;

  const webBurned: number[] = new Array(count);
  const portArea: number[] = new Array(count);
  const burnArea: number[] = new Array(count);
  const volumeRemaining: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const w = ws[i];
    const boreR = coreR + w;
    const rodRem = Math.max(rodR - w, 0);
    const boreArea = Math.PI * boreR * boreR;
    const rodArea = Math.PI * rodRem * rodRem;
    webBurned[i] = w;
    portArea[i] = Math.min(boreArea - rodArea, Math.PI * outerR * outerR);
    burnArea[i] = 2 * Math.PI * (boreR + rodRem) * length;
    volumeRemaining[i] = (Math.PI * (outerR * outerR - boreR * boreR) + rodArea) * length;
  }
  // The last sample IS burnout (webSamples clamps onto the full web): exact
  // zero in the model, so pin it against float cancellation noise.
  volumeRemaining[count - 1] = 0;

  return { webBurned, portArea, burnArea, volumeRemaining };
}

/**
 * Samples a moon-burner (offset-core) grain every `webStep` meters of burned
 * web. The port is a circle of radius coreDiameter/2 whose center is offset
 * `offset` from the case axis. It regresses concentrically until it contacts
 * the case, then the case clips it and the leftover port rim is the arc of
 * the grown circle that lies inside the case (the crescent). The burn
 * surface is the port rim only, so the trace is progressive (2*pi*L*r) up to
 * the contact web and regressive (the shrinking inside-arc) after it — the
 * surveyed "hump". Approximation, documented: end faces are inhibited; the
 * exposed case arc and the corner slivers where the port circle crosses the
 * case carry no burning surface (they are gone-or-case the instant the
 * circle contacts the case). Full web is (outerDiameter/2 + offset -
 * coreDiameter/2): the far side of the case is consumed last. offset is
 * required to leave the initial port fully inside the case
 * (offset + coreDiameter/2 <= outerDiameter/2).
 *
 * @param burnRateCoeff constant linear burn rate in m/s (per-step time
 *   increment webStep/burnRateCoeff; feeds chamberPressure)
 */
export function regressMoonBurner(
  outerDiameter: number,
  length: number,
  coreDiameter: number,
  offset: number,
  webStep: number,
  burnRateCoeff: number,
): GrainRegressionTrace {
  requirePositive(webStep, 'webStep');
  requirePositive(burnRateCoeff, 'burnRateCoeff');
  requirePositive(outerDiameter, 'outerDiameter');
  requirePositive(coreDiameter, 'coreDiameter');
  requirePositive(offset, 'offset');
  requirePositive(length, 'length');
  if (outerDiameter <= coreDiameter) {
    throw new RangeError(
      `grain regression: outerDiameter must exceed coreDiameter, got ${outerDiameter} <= ${coreDiameter}`,
    );
  }
  const outerR = outerDiameter / 2;
  const coreR = coreDiameter / 2;
  if (offset + coreR > outerR) {
    throw new RangeError(
      `grain regression: offset + coreDiameter/2 must not exceed outerDiameter/2 (port starts inside the case), got ${offset} + ${coreR} > ${outerR}`,
    );
  }

  const maxWeb = outerR + offset - coreR;
  const ws = webSamples(maxWeb, webStep);
  const count = ws.length;

  const webBurned: number[] = new Array(count);
  const portArea: number[] = new Array(count);
  const burnArea: number[] = new Array(count);
  const volumeRemaining: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const w = ws[i];
    const r = coreR + w; // grown port radius
    const contactWeb = outerR - offset - coreR; // case contact at r = outerR - offset
    const free = w <= contactWeb;
    let rimArc: number;
    let lensArea: number;
    if (free) {
      rimArc = 2 * Math.PI * r;
      lensArea = Math.PI * r * r;
    } else {
      // Circle of radius r, center offset d from the case center, clipped by
      // the case circle of radius outerR. Let sigma be the half-angle of the
      // port rim arc that lies OUTSIDE the case. sin^2(sigma/2) = (1+C)/2
      // with C = cos of the inside half-angle, evaluated in asin form:
      // acos is ill-conditioned at the tangency (C -> -1) and would inflate
      // a 1-ulp roundoff into a macroscopic arc error on the first contact
      // sample. Rim = (2*pi - 2*sigma)*r, and the crescent lens uses the
      // inside half-angle (pi - sigma).
      const cosCut = (r * r + offset * offset - outerR * outerR) / (2 * offset * r);
      const sigmaHalved = Math.asin(Math.sqrt(Math.max(0, (1 + Math.max(-1, Math.min(1, cosCut))) / 2)));
      const sigma = 2 * sigmaHalved;
      rimArc = 2 * r * (Math.PI - sigma);
      // Lens area of the two-circle intersection (crescent): standard
      // closed form, clamped for tangency numerics.
      const a1 = r * r * (Math.PI - sigma);
      const a2 =
        outerR *
        outerR *
        Math.acos(Math.max(-1, Math.min(1, (offset * offset + outerR * outerR - r * r) / (2 * offset * outerR))));
      const a3 =
        0.5 *
        Math.sqrt(
          Math.max(0, (-offset + r + outerR) * (offset + r - outerR) * (offset - r + outerR) * (offset + r + outerR)),
        );
      lensArea = a1 + a2 - a3;
    }
    webBurned[i] = w;
    portArea[i] = Math.min(lensArea, Math.PI * outerR * outerR);
    burnArea[i] = rimArc * length;
    volumeRemaining[i] = Math.max(0, Math.PI * outerR * outerR - portArea[i]) * length;
  }
  // The last sample IS burnout (webSamples clamps onto the full web): exact
  // zero in the model, so pin it against float cancellation noise.
  volumeRemaining[count - 1] = 0;

  return { webBurned, portArea, burnArea, volumeRemaining };
}

/**
 * Samples a C-slot ("C" grain) every `webStep` meters of burned web. The
 * grain is a case-bonded cylinder of radius outerDiameter/2 with a circular
 * core (coreDiameter) and a rectangular slot of width slotWidth cut through
 * from the core to the case along one radius — the AeroTech hobbyline
 * "slotted" geometry. Model, per docs/grain-geometry-survey.md (lines and
 * circular arcs): the core circle grows and the slot walls recede as
 * parallel lines. In the exact parallel-curve construction the convex
 * corner-rounding arcs of the survey's verbal model are absorbed: the grown
 * core circle swallows the mouth corners and the case clips the wall ends,
 * so the burning perimeter is the grown core circle minus its slot mouth,
 * plus the two slot walls
 *     P(w) = (2*pi - 2*theta)*rho + 2*(sqrt(R^2-h^2) - sqrt(rho^2-h^2))
 * with rho = coreR + w, h = slotWidth/2 + w, sin(theta) = h/rho, R =
 * outerRadius. Ends are inhibited; slotWidth must be smaller than
 * coreDiameter (the slot opens out of the core circle). Character surveyed
 * from TRF: a small ignition spike then a continuous (mildly regressive)
 * decrease for thick-web hobby grains. Full web is (outerDiameter -
 * coreDiameter)/2.
 *
 * @param burnRateCoeff constant linear burn rate in m/s (per-step time
 *   increment webStep/burnRateCoeff; feeds chamberPressure)
 */
export function regressCSlot(
  outerDiameter: number,
  length: number,
  coreDiameter: number,
  slotWidth: number,
  webStep: number,
  burnRateCoeff: number,
): GrainRegressionTrace {
  requirePositive(webStep, 'webStep');
  requirePositive(burnRateCoeff, 'burnRateCoeff');
  requirePositive(outerDiameter, 'outerDiameter');
  requirePositive(coreDiameter, 'coreDiameter');
  requirePositive(slotWidth, 'slotWidth');
  requirePositive(length, 'length');
  if (coreDiameter >= outerDiameter) {
    throw new RangeError(
      `grain regression: coreDiameter must be smaller than outerDiameter, got ${coreDiameter} >= ${outerDiameter}`,
    );
  }
  if (slotWidth >= coreDiameter) {
    throw new RangeError(
      `grain regression: slotWidth must be smaller than coreDiameter, got ${slotWidth} >= ${coreDiameter}`,
    );
  }

  const outerR = outerDiameter / 2;
  const coreR = coreDiameter / 2;
  const slotHalf = slotWidth / 2;
  const maxWeb = outerR - coreR;
  const ws = webSamples(maxWeb, webStep);
  const count = ws.length;

  const webBurned: number[] = new Array(count);
  const portArea: number[] = new Array(count);
  const burnArea: number[] = new Array(count);
  const volumeRemaining: number[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const w = ws[i];
    const rho = coreR + w; // grown core radius
    const h = slotHalf + w; // grown slot half-width
    const xCore = Math.sqrt(rho * rho - h * h); // wall inner end on the grown core
    const xWall = Math.sqrt(outerR * outerR - h * h); // wall outer end on the case
    const theta = Math.asin(Math.min(1, h / rho));
    webBurned[i] = w;
    burnArea[i] = (2 * (Math.PI - 2 * theta) * rho + 2 * (xWall - xCore)) * length;
    // Area of the open region (grown core disc UNION widened slot, clipped
    // to the case): disc area plus the slot wedge beyond the mouth minus the
    // mouth chamfer where disc and slot overlap. Cancels to exactly pi*R^2
    // at burnout.
    const port =
      Math.PI * rho * rho +
      h * xWall +
      outerR * outerR * Math.asin(Math.min(1, h / outerR)) -
      h * xCore -
      rho * rho * theta;
    portArea[i] = Math.min(port, Math.PI * outerR * outerR);
    volumeRemaining[i] = Math.max(0, Math.PI * outerR * outerR - portArea[i]) * length;
  }
  // The last sample IS burnout (webSamples clamps onto the full web): exact
  // zero in the model, so pin it against float cancellation noise.
  volumeRemaining[count - 1] = 0;

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