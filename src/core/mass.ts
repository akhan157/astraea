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
 * Calculates mass and CG for a nosecone
 */
function computeNoseconeMass(comp: NoseconeComponent, materialDensity: number): { mass: number; localCG: number } {
  if (comp.massOverride !== undefined && comp.massOverride > 0) {
    const cg = comp.cgOverride !== undefined ? comp.cgOverride : comp.length * 0.55;
    return { mass: comp.massOverride, localCG: cg };
  }

  requireFinitePositive(comp.length, 'nosecone length');
  requireFinitePositive(comp.baseDiameter, 'nosecone baseDiameter');
  const r = comp.baseDiameter / 2;
  const l = comp.length;
  let volume: number;
  // Centroids measured from the component FRONT (tip), matching the axial
  // chain datum (globalCG = axialStart + localCG). A uniform solid cone has
  // its centroid at 3L/4 from the tip — never 2L/3 (the conical CP station).
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

  if (comp.isHollow && comp.wallThickness > 0 && comp.wallThickness < r) {
    // Hollow shell = outer solid minus a similar inner cavity seated at the
    // base: the cavity centroid sits at (l - lInner) + frac*lInner from the
    // tip, so the shell centroid moves forward of the solid value. Keeping
    // the outer centroid (the old behavior) is a demonstrable CG error.
    const rInner = r - comp.wallThickness;
    const lInner = Math.max(0.001, l - comp.wallThickness);
    const innerVolume = volume * Math.pow(rInner / r, 2) * (lInner / l);
    const cavityCG = (l - lInner) + centroidFrac * lInner;
    const shellVolume = Math.max(0.000001, volume - innerVolume);
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
  // A zero or negative wall (inner >= outer) is invalid geometry, not a
  // zero-mass tube: fail closed instead of Math.max-clamping to nominal.
  const rInner = comp.innerDiameter > 0 ? comp.innerDiameter / 2 : Math.max(0, rOuter - 0.0015);
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

  if (comp.isHollow && comp.wallThickness > 0) {
    const t = comp.wallThickness;
    const ir1 = Math.max(0, r1 - t);
    const ir2 = Math.max(0, r2 - t);
    const innerVol = (1 / 3) * Math.PI * l * (ir1 * ir1 + ir1 * ir2 + ir2 * ir2);
    volume = Math.max(0.000001, solidVol - innerVol);
  }

  // Frustum CG formula
  const denom = r1 * r1 + r1 * r2 + r2 * r2;
  const localCG = denom > 0 ? (l / 4) * ((r1 * r1 + 2 * r1 * r2 + 3 * r2 * r2) / denom) : l / 2;

  return { mass: volume * materialDensity, localCG: comp.cgOverride !== undefined ? comp.cgOverride : localCG };
}

/**
 * Calculates mass and CG for trapezoidal fin set
 */
function computeTrapezoidFinMass(comp: TrapezoidFinSetComponent, materialDensity: number): { mass: number; localCG: number } {
  if (comp.massOverride !== undefined && comp.massOverride > 0) {
    return { mass: comp.massOverride, localCG: comp.cgOverride !== undefined ? comp.cgOverride : comp.rootChord / 2 };
  }

  const finArea = 0.5 * (comp.rootChord + comp.tipChord) * comp.span;
  const volume = finArea * comp.thickness * comp.finCount;
  const mass = volume * materialDensity;

  // Longitudinal CG of trapezoid relative to root leading edge
  const cr = comp.rootChord;
  const ct = comp.tipChord;
  const s = comp.sweepLength;
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
    const material = STANDARD_MATERIALS[comp.materialId] || STANDARD_MATERIALS.cardboard;
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
        axialStart = lastBodyTubeStart + (comp.axialOffset || 0);
        break;
      }

      case 'ellipticalfinset': {
        const res = computeEllipticalFinMass(comp, material.density);
        mass = res.mass;
        localCG = res.localCG;
        length = comp.rootChord;
        axialStart = lastBodyTubeStart + (comp.axialOffset || 0);
        break;
      }

      case 'masscomponent': {
        mass = comp.mass;
        length = comp.length || 0.05;
        localCG = length / 2;
        axialStart = lastBodyTubeStart + (comp.axialOffset || 0);
        break;
      }

      case 'parachute': {
        mass = comp.mass;
        length = 0.05;
        localCG = length / 2;
        axialStart = lastBodyTubeStart + (comp.axialOffset || 0);
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
  const vehicleCG = totalMass > 0 ? totalMoment / totalMass : currentAxialX / 2;

  return {
    totalMass,
    cg: vehicleCG,
    totalLength: currentAxialX,
    maxDiameter: maxDiameter || referenceDiameter,
    referenceDiameter: referenceDiameter || 0.05,
    components: results,
  };
}
