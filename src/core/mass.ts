/**
 * Astraea Mass & Center of Gravity Aggregator
 * Computes component volumes, material masses, and whole-vehicle CG & MOI.
 */

import {
  RocketVehicle,
  STANDARD_MATERIALS,
  NoseconeComponent,
  BodyTubeComponent,
  TransitionComponent,
  TrapezoidFinSetComponent,
  EllipticalFinSetComponent,
} from './types';

export interface ComponentMassResult {
  id: string;
  mass: number;         // kg
  localCG: number;      // meters from component front
  globalCG: number;     // meters from nose tip
  axialStart: number;   // meters from nose tip
  axialEnd: number;     // meters from nose tip
  length: number;       // meters
}

export interface VehicleMassRollup {
  totalMass: number;    // kg
  cg: number;           // meters from nose tip
  totalLength: number;  // meters
  maxDiameter: number;  // meters
  referenceDiameter: number; // meters (typically body tube diameter)
  components: ComponentMassResult[];
}

/**
 * Fail-closed geometry: nonfinite or nonpositive structural dimensions throw
 * rather than clamping into a silently nominal mass model (audit §4.3).
 */
function requireFinitePositive(value: number, what: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`vehicle geometry: ${what} must be finite and positive (got ${value})`);
  }
}

/**
 * Axial offset that fails closed on NaN (audit §5.4): `?? 0` keeps the
 * absent-offset default, but a present nonfinite offset throws instead of
 * hiding behind `|| 0`.
 */
function axialOffsetOf(comp: { axialOffset?: unknown }, id: string): number {
  const v = comp.axialOffset ?? 0;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`vehicle geometry: component '${id}' axialOffset must be finite (got ${String(comp.axialOffset)})`);
  }
  return v;
}
/**
 * Calculates mass and CG for a nosecone
 */
function computeNoseconeMass(comp: NoseconeComponent, materialDensity: number): { mass: number; localCG: number } {
  // Geometry validates BEFORE any override branch (audit §5.4): an override
  // replaces mass, never structural integrity for the axial chain.
  requireFinitePositive(comp.length, 'nosecone length');
  requireFinitePositive(comp.baseDiameter, 'nosecone baseDiameter');
  if (comp.cgOverride !== undefined && !Number.isFinite(comp.cgOverride)) {
    throw new Error(`vehicle geometry: nosecone cgOverride must be finite (got ${comp.cgOverride})`);
  }
  if (comp.massOverride !== undefined && comp.massOverride > 0) {
    const cg = comp.cgOverride !== undefined ? comp.cgOverride : comp.length * 0.55;
    return { mass: comp.massOverride, localCG: cg };
  }

  const r = comp.baseDiameter / 2;
  const l = comp.length;
  // Centroids measured from the component FRONT (tip), matching the axial
  // chain datum (globalCG = axialStart + localCG). A uniform solid cone has
  // its centroid at 3L/4 from the tip — never 2L/3 (the conical CP station).
  let volume: number;
  let centroidFrac: number;

  switch (comp.shape) {
    case 'conical':
      volume = (1 / 3) * Math.PI * r * r * l;
      centroidFrac = 0.75;
      break;
    case 'ogive':
      // Tangent ogive solid volume approximation ~ 0.57 * pi * r^2 * l
      volume = 0.57 * Math.PI * r * r * l;
      centroidFrac = 0.466;
      break;
    case 'parabolic':
      volume = 0.5 * Math.PI * r * r * l;
      centroidFrac = 0.5;
      break;
    case 'vonkarman':
    case 'elliptical':
    default:
      volume = 0.55 * Math.PI * r * r * l;
      centroidFrac = 0.5;
      break;
  }
  let localCG = centroidFrac * l;

  if (comp.isHollow) {
    // Invalid hollow walls fail closed (audit §5.4): a nonpositive,
    // nonfinite, or through-wall thickness must never silently select solid
    // geometry. The thin-wall model needs 0 < wall < r (which also bounds
    // wall < l for slender cones).
    const wall = comp.wallThickness;
    if (!Number.isFinite(wall) || !(wall > 0) || !(wall < r)) {
      throw new Error(`vehicle geometry: hollow nosecone needs 0 < wallThickness < radius (got ${wall} vs r=${r})`);
    }
    // Hollow shell = outer solid minus a similar inner cavity seated at the
    // base: the cavity centroid sits at (l - lInner) + frac*lInner from the
    // tip, so the shell centroid moves forward of the solid value. Keeping
    // the outer centroid (the old behavior) is a demonstrable CG error.
    const rInner = r - wall;
    const lInner = l - wall;
    if (!(lInner > 0)) {
      throw new Error('vehicle geometry: hollow nosecone wall leaves no cavity length');
    }
    const innerVolume = volume * Math.pow(rInner / r, 2) * (lInner / l);
    const cavityCG = (l - lInner) + centroidFrac * lInner;
    const shellVolume = volume - innerVolume;
    if (!(shellVolume > 0)) {
      throw new Error('vehicle geometry: hollow nosecone shell has no volume');
    }
    localCG = (volume * localCG - innerVolume * cavityCG) / shellVolume;
    volume = shellVolume;
  }

  const mass = volume * materialDensity;
  return { mass, localCG: comp.cgOverride !== undefined ? comp.cgOverride : localCG };
}

/**
 * Calculates mass and CG for a hollow body tube
 */
function computeBodyTubeMass(comp: BodyTubeComponent, materialDensity: number): { mass: number; localCG: number } {
  if (comp.massOverride !== undefined && comp.massOverride > 0) {
    return { mass: comp.massOverride, localCG: comp.cgOverride !== undefined ? comp.cgOverride : comp.length / 2 };
  }

  requireFinitePositive(comp.length, 'bodytube length');
  requireFinitePositive(comp.outerDiameter, 'bodytube outerDiameter');
  const rOuter = comp.outerDiameter / 2;
  // An absent inner diameter selects the default thin wall; a PRESENT one
  // must be finite and nonnegative (audit §5.4) — NaN/negative values must
  // never silently become a default wall. Zero/negative wall always throws.
  let rInner: number;
  if (comp.innerDiameter === undefined || comp.innerDiameter === null) {
    rInner = Math.max(0, rOuter - 0.0015);
  } else {
    if (!Number.isFinite(comp.innerDiameter) || comp.innerDiameter < 0) {
      throw new Error(`vehicle geometry: bodytube innerDiameter must be finite and nonnegative (got ${comp.innerDiameter})`);
    }
    rInner = comp.innerDiameter / 2;
  }
  if (!(rInner < rOuter)) {
    throw new Error(`vehicle geometry: bodytube innerDiameter must leave positive wall (got ${comp.innerDiameter} vs outer ${comp.outerDiameter})`);
  }
  const crossSectionArea = Math.PI * (rOuter * rOuter - rInner * rInner);
  const volume = crossSectionArea * comp.length;
  const tubeMass = volume * materialDensity;

  return { mass: tubeMass, localCG: comp.cgOverride !== undefined ? comp.cgOverride : comp.length / 2 };
}

/**
 * Calculates mass and CG for a conical transition (shoulder/boattail)
 */
function computeTransitionMass(comp: TransitionComponent, materialDensity: number): { mass: number; localCG: number } {
  if (comp.massOverride !== undefined && comp.massOverride > 0) {
    return { mass: comp.massOverride, localCG: comp.cgOverride !== undefined ? comp.cgOverride : comp.length / 2 };
  }

  requireFinitePositive(comp.length, 'transition length');
  if (!Number.isFinite(comp.foreDiameter) || comp.foreDiameter < 0) {
    throw new Error(`vehicle geometry: transition foreDiameter must be finite and nonnegative (got ${comp.foreDiameter})`);
  }
  if (!Number.isFinite(comp.aftDiameter) || comp.aftDiameter < 0) {
    throw new Error(`vehicle geometry: transition aftDiameter must be finite and nonnegative (got ${comp.aftDiameter})`);
  }
  if (!(comp.foreDiameter > 0 || comp.aftDiameter > 0)) {
    throw new Error('vehicle geometry: transition needs a positive diameter');
  }
  const r1 = comp.foreDiameter / 2;
  const r2 = comp.aftDiameter / 2;
  const l = comp.length;
  // Frustum solid volume
  const solidVol = (1 / 3) * Math.PI * l * (r1 * r1 + r1 * r2 + r2 * r2);
  let volume = solidVol;
  // Frustum CG from the fore face (audit: l/4 for a cone tapering aft,
  // l/2 for a cylinder — datum matches the axial chain).
  const denom = r1 * r1 + r1 * r2 + r2 * r2;
  let localCG = denom > 0 ? (l / 4) * ((r1 * r1 + 2 * r1 * r2 + 3 * r2 * r2) / denom) : l / 2;

  if (comp.isHollow) {
    // Invalid hollow walls fail closed; the cavity centroid follows the same
    // frustum fraction with inner radii (audit §5.4 — keeping the solid
    // centroid for a hollowed frustum is the same class of CG error as the
    // nosecone defect).
    const t = comp.wallThickness;
    if (!Number.isFinite(t) || !(t > 0) || !(t < Math.max(r1, r2))) {
      throw new Error(`vehicle geometry: hollow transition needs 0 < wallThickness < max radius (got ${t})`);
    }
    const ir1 = Math.max(0, r1 - t);
    const ir2 = Math.max(0, r2 - t);
    const innerVol = (1 / 3) * Math.PI * l * (ir1 * ir1 + ir1 * ir2 + ir2 * ir2);
    const shellVolume = solidVol - innerVol;
    if (!(shellVolume > 0)) {
      throw new Error('vehicle geometry: hollow transition shell has no volume');
    }
    const iDenom = ir1 * ir1 + ir1 * ir2 + ir2 * ir2;
    const cavityCG = iDenom > 0 ? (l / 4) * ((ir1 * ir1 + 2 * ir1 * ir2 + 3 * ir2 * ir2) / iDenom) : l / 2;
    localCG = (solidVol * localCG - innerVol * cavityCG) / shellVolume;
    volume = shellVolume;
  }

  return { mass: volume * materialDensity, localCG: comp.cgOverride !== undefined ? comp.cgOverride : localCG };
}

/**
 * Calculates mass and CG for trapezoidal fin set
 */
function computeTrapezoidFinMass(comp: TrapezoidFinSetComponent, materialDensity: number): { mass: number; localCG: number } {
  if (comp.massOverride !== undefined && comp.massOverride > 0) {
    return { mass: comp.massOverride, localCG: comp.cgOverride !== undefined ? comp.cgOverride : comp.rootChord / 2 };
  }

  // Longitudinal CG of trapezoid relative to root leading edge
  const cr = comp.rootChord;
  const ct = comp.tipChord;
  const s = comp.sweepLength;
  requireFinitePositive(cr, 'fin rootChord');
  if (!Number.isFinite(ct) || ct < 0) {
    throw new Error(`vehicle geometry: fin tipChord must be finite and nonnegative (got ${ct})`);
  }
  requireFinitePositive(comp.span, 'fin span');
  requireFinitePositive(comp.thickness, 'fin thickness');
  if (!Number.isInteger(comp.finCount) || comp.finCount < 1) {
    throw new Error(`vehicle geometry: finCount must be a positive integer (got ${comp.finCount})`);
  }
  if (!Number.isFinite(s) || s < 0) {
    throw new Error(`vehicle geometry: fin sweepLength must be finite and nonnegative (got ${s})`);
  }
  const finArea = 0.5 * (cr + ct) * comp.span;
  const volume = finArea * comp.thickness * comp.finCount;
  const mass = volume * materialDensity;

  const denom = 3 * (cr + ct);
  const localCG = denom > 0 ? (cr * cr + cr * ct + ct * ct + (cr + 2 * ct) * s) / denom : cr / 2;

  return { mass, localCG: comp.cgOverride !== undefined ? comp.cgOverride : localCG };
}

/**
 * Calculates mass and CG for elliptical fin set
 */
function computeEllipticalFinMass(comp: EllipticalFinSetComponent, materialDensity: number): { mass: number; localCG: number } {
  if (comp.massOverride !== undefined && comp.massOverride > 0) {
    return { mass: comp.massOverride, localCG: comp.cgOverride !== undefined ? comp.cgOverride : comp.rootChord / 2 };
  }

  // Quarter ellipse area = (pi / 4) * rootChord * span
  requireFinitePositive(comp.rootChord, 'fin rootChord');
  requireFinitePositive(comp.span, 'fin span');
  requireFinitePositive(comp.thickness, 'fin thickness');
  if (!Number.isInteger(comp.finCount) || comp.finCount < 1) {
    throw new Error(`vehicle geometry: finCount must be a positive integer (got ${comp.finCount})`);
  }
  const finArea = (Math.PI / 4) * comp.rootChord * comp.span;
  const volume = finArea * comp.thickness * comp.finCount;
  const mass = volume * materialDensity;
  const localCG = (4 / (3 * Math.PI)) * comp.rootChord;

  return { mass, localCG: comp.cgOverride !== undefined ? comp.cgOverride : localCG };
}

/**
 * Aggregates all components into an axial chain and calculates total mass and CG.
 */
export function aggregateVehicleMass(vehicle: RocketVehicle): VehicleMassRollup {
  let currentAxialX = 0;
  let lastBodyTubeStart = 0;
  let maxDiameter = 0;
  let referenceDiameter = 0.05; // default 50mm
  const results: ComponentMassResult[] = [];
  if (!vehicle || !Array.isArray(vehicle.components) || vehicle.components.length === 0) {
    throw new Error('vehicle geometry: vehicle has no components — mass rollup is undefined');
  }
  for (const comp of vehicle.components) {
    const material = STANDARD_MATERIALS[comp.materialId];
    if (!material) {
      throw new Error(
        `vehicle geometry: unknown materialId '${comp.materialId}' (known: ${Object.keys(STANDARD_MATERIALS).join(', ')})`
      );
    }
    if (!Number.isFinite(material.density) || material.density <= 0) {
      throw new Error(`vehicle geometry: material '${comp.materialId}' has nonpositive density`);
    }
    let mass = 0;
    let localCG = 0;
    let axialStart = currentAxialX;
    let length = 0;

    switch (comp.type) {
      case 'nosecone': {
        const res = computeNoseconeMass(comp, material.density);
        mass = res.mass;
        localCG = res.localCG;
        length = comp.length;
        axialStart = currentAxialX;
        currentAxialX += comp.length;
        if (comp.baseDiameter > maxDiameter) maxDiameter = comp.baseDiameter;
        referenceDiameter = comp.baseDiameter;
        break;
      }

      case 'bodytube': {
        const res = computeBodyTubeMass(comp, material.density);
        mass = res.mass;
        localCG = res.localCG;
        length = comp.length;
        axialStart = currentAxialX;
        lastBodyTubeStart = currentAxialX;
        currentAxialX += comp.length;
        if (comp.outerDiameter > maxDiameter) maxDiameter = comp.outerDiameter;
        referenceDiameter = comp.outerDiameter;
        break;
      }

      case 'transition': {
        const res = computeTransitionMass(comp, material.density);
        mass = res.mass;
        localCG = res.localCG;
        length = comp.length;
        axialStart = currentAxialX;
        currentAxialX += comp.length;
        const compMaxD = Math.max(comp.foreDiameter, comp.aftDiameter);
        if (compMaxD > maxDiameter) maxDiameter = compMaxD;
        break;
      }

      case 'trapezoidfinset': {
        const res = computeTrapezoidFinMass(comp, material.density);
        mass = res.mass;
        localCG = res.localCG;
        length = comp.rootChord;
        axialStart = lastBodyTubeStart + axialOffsetOf(comp, comp.id);
        break;
      }

      case 'ellipticalfinset': {
        const res = computeEllipticalFinMass(comp, material.density);
        mass = res.mass;
        localCG = res.localCG;
        length = comp.rootChord;
        axialStart = lastBodyTubeStart + axialOffsetOf(comp, comp.id);
        break;
      }

      case 'masscomponent': {
        requireFinitePositive(comp.mass, `masscomponent '${comp.id}' mass`);
        const compLength = comp.length ?? 0.05;
        requireFinitePositive(compLength, `masscomponent '${comp.id}' length`);
        mass = comp.mass;
        length = compLength;
        localCG = length / 2;
        axialStart = lastBodyTubeStart + axialOffsetOf(comp, comp.id);
        break;
      }

      case 'parachute': {
        requireFinitePositive(comp.mass, `parachute '${comp.id}' mass`);
        requireFinitePositive(comp.diameter, `parachute '${comp.id}' diameter`);
        requireFinitePositive(comp.cd, `parachute '${comp.id}' cd`);
        mass = comp.mass;
        length = 0.05;
        localCG = length / 2;
        axialStart = lastBodyTubeStart + axialOffsetOf(comp, comp.id);
        break;
      }
    }

    const globalCG = axialStart + localCG;

    results.push({
      id: comp.id,
      mass,
      localCG,
      globalCG,
      axialStart,
      axialEnd: axialStart + length,
      length,
    });
  }

  const totalMass = results.reduce((sum, r) => sum + r.mass, 0);
  const totalMoment = results.reduce((sum, r) => sum + r.mass * r.globalCG, 0);
  // Every component mass is validated positive above: a nonpositive total is
  // unreachable through valid inputs, and falls closed instead of halving
  // the vehicle length as a nominal CG.
  if (!(totalMass > 0)) {
    throw new Error('vehicle geometry: total mass must be positive');
  }
  const vehicleCG = totalMoment / totalMass;

  return {
    totalMass,
    cg: vehicleCG,
    totalLength: currentAxialX,
    maxDiameter: maxDiameter || referenceDiameter,
    referenceDiameter: referenceDiameter || 0.05,
    components: results,
  };
}
