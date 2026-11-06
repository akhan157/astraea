/**
 * Astraea Core Vehicle Specification Types
 * Normalized Axial Component Tree (Single Source of Truth)
 */

export type NoseconeShape = 'conical' | 'ogive' | 'parabolic' | 'vonkarman' | 'elliptical';

export type FinCrossSection = 'square' | 'rounded' | 'double_wedge' | 'airfoil';

export interface Material {
  id: string;
  name: string;
  density: number; // kg/m^3
  // Optional structural properties. Structural calculations fail closed when a
  // material lacks the value they need (see src/aero/finStructure.ts).
  youngsModulusGPa?: number; // Young's (elastic) modulus; flexural modulus for laminates
  yieldStrengthMPa?: number; // yield strength; flexural strength used as the failure proxy for brittle materials
}

export const STANDARD_MATERIALS: Record<string, Material> = {
  // Structural values from published datasheets:
  //   cardboard   – kraft liner / corrugated board structural proxy
  //   fiberglass  – NEMA G10/FR-4 flexural LW: 2.7 Msi, 55 kpsi
  //   carbonfiber – quasi-isotropic 0/90/+-45 laminate, 60% Vf (flexural modulus 50-75 GPa, strength 500-900 MPa)
  //   balsa       – USDA Wood Handbook @ 0.16 specific gravity (0.55 Msi MOE, 2.3 ksi MOR)
  //   plywood     – aircraft-grade birch, parallel to face grain (1.6 Msi, 10 ksi)
  //   aluminum    – 6061-T6 wrought (ASM/MatWeb)
  //   pla/abs/petg – bulk resin datasheet values; printed parts may run lower interlayer strength
  cardboard: { id: 'cardboard', name: 'Kraft Cardboard', density: 680, youngsModulusGPa: 5.0, yieldStrengthMPa: 8.0 },
  fiberglass: { id: 'fiberglass', name: 'G10 Fiberglass', density: 1850, youngsModulusGPa: 18.6, yieldStrengthMPa: 380 },
  carbonfiber: { id: 'carbonfiber', name: 'Carbon Fiber', density: 1550, youngsModulusGPa: 55.0, yieldStrengthMPa: 700 },
  balsa: { id: 'balsa', name: 'Balsa Wood', density: 160, youngsModulusGPa: 3.8, yieldStrengthMPa: 15.9 },
  plywood: { id: 'plywood', name: 'Aircraft Plywood', density: 680, youngsModulusGPa: 11.0, yieldStrengthMPa: 69 },
  aluminum: { id: 'aluminum', name: '6061-T6 Aluminum', density: 2700, youngsModulusGPa: 68.9, yieldStrengthMPa: 276 },
  pla_3dprint: { id: 'pla_3dprint', name: 'PLA 3D Print', density: 1250, youngsModulusGPa: 3.5, yieldStrengthMPa: 60 },
  abs_3dprint: { id: 'abs_3dprint', name: 'ABS 3D Print', density: 1040, youngsModulusGPa: 2.3, yieldStrengthMPa: 40 },
  petg_3dprint: { id: 'petg_3dprint', name: 'PETG 3D Print', density: 1270, youngsModulusGPa: 2.1, yieldStrengthMPa: 50 },
};

export type ComponentType =
  | 'nosecone'
  | 'bodytube'
  | 'transition'
  | 'trapezoidfinset'
  | 'ellipticalfinset'
  | 'freeformfinset'
  | 'masscomponent'
  | 'parachute';

export interface BaseComponent {
  id: string;
  name: string;
  type: ComponentType;
  materialId: string;
  massOverride?: number; // In kg, if specified overrides calculated material mass
  cgOverride?: number;   // In meters relative to component front
  color?: string;
  comment?: string;
}

export interface NoseconeComponent extends BaseComponent {
  type: 'nosecone';
  shape: NoseconeShape;
  length: number;          // meters
  baseDiameter: number;    // meters
  wallThickness: number;   // meters
  isHollow: boolean;
}

export interface BodyTubeComponent extends BaseComponent {
  type: 'bodytube';
  length: number;          // meters
  outerDiameter: number;   // meters
  innerDiameter: number;   // meters
  isMotorMount?: boolean;
  /** Normalized id of the motor seated at this tube's aft (RockSim motor reference). */
  assignedMotorId?: string;
  /** Rail-guide button diameter, meters; absent = no rail guide. */
  railGuideDiameter?: number;
  /** Rail-guide button height above the tube surface, meters. */
  railGuideHeight?: number;
  /** Launch-lug inner diameter, meters; absent = no launch lug. */
  launchLugDiameter?: number;
  /** Launch-shoe frontal area, square meters; absent = no launch shoe. */
  launchShoeArea?: number;
}

export interface TransitionComponent extends BaseComponent {
  type: 'transition';
  length: number;          // meters
  foreDiameter: number;    // meters
  aftDiameter: number;     // meters
  wallThickness: number;   // meters
  isHollow: boolean;
}

/**
 * Fin airfoil sections the calibrated drag method defines. A section name is
 * independent of `crossSection` (the planform/thickness family) and overrides
 * the section the method would otherwise derive from it.
 */
export const AIRFOIL_SECTION_NAMES = [
  'Double Wedge',
  'Hexagonal',
  'Single Wedge',
  'Hexagonal Blunt Base',
  'Biconvex',
  'Subsonic NACA',
  'Rounded',
  'Square',
] as const;

export interface TrapezoidFinSetComponent extends BaseComponent {
  type: 'trapezoidfinset';
  finCount: number;        // e.g. 3 or 4
  rootChord: number;       // meters along body tube
  tipChord: number;        // meters
  span: number;            // meters (height perpendicular to body)
  sweepLength: number;     // meters (axial distance from root leading edge to tip leading edge)
  thickness: number;       // meters
  crossSection: FinCrossSection;
  axialOffset: number;     // meters from parent body tube front (usually placed near aft)
  /** Calibrated section name (see AIRFOIL_SECTION_NAMES); absent = derived from crossSection. */
  airfoilSection?: string;
  /** Leading-edge bevel depth, meters (the method's fx1); absent = 0. */
  leadingEdgeBevel?: number;
  /** Trailing-edge bevel depth, meters (the method's fx3, applied above Mach 1); absent = 0. */
  trailingEdgeBevel?: number;
  /** Leading-edge rounding radius, meters; absent = 0. */
  leadingEdgeRadius?: number;
}

export interface EllipticalFinSetComponent extends BaseComponent {
  type: 'ellipticalfinset';
  finCount: number;
  rootChord: number;       // meters
  span: number;            // meters
  thickness: number;       // meters
  axialOffset: number;     // meters from parent body tube front
}

/** One vertex of a freeform fin planform, meters (see FreeformFinSetComponent). */
export interface FinPoint {
  x: number;
  y: number;
}

/**
 * Fin set with an arbitrary planform (OpenRocket `freeformfinset`). `points`
 * is the planform of one fin as a polygon in the fin plane: x aft along the
 * body axis from the root leading edge, y outward from the body surface. The
 * first point is the root leading edge (0, 0), the last the root trailing edge
 * (rootChord, 0); every point between lies strictly outboard (y > 0) and the
 * polygon is simple with one material interval at every span station
 * (validated in `src/aero/finPlanform.ts`).
 */
export interface FreeformFinSetComponent extends BaseComponent {
  type: 'freeformfinset';
  finCount: number;
  points: FinPoint[];
  thickness: number;       // meters
  crossSection: FinCrossSection;
  axialOffset: number;     // meters from parent body tube front (root leading edge)
}

export interface MassComponent extends BaseComponent {
  type: 'masscomponent';
  mass: number;            // kg
  length: number;          // meters
  axialOffset: number;     // meters from parent body tube front
  /**
   * Bounding cross-section of an avionics sled or other carried load (Q3):
   * user-entered, meters. Absent = unknown (drawn schematically, never
   * guessed). v1: not carried by .ork/.rkt round-trips.
   */
  widthM?: number;
  /** Bounding cross-section height, meters (see widthM). */
  heightM?: number;
}

export interface ParachuteComponent extends BaseComponent {
  type: 'parachute';
  diameter: number;        // meters
  cd: number;              // drag coefficient, typically 0.8 - 1.5
  mass: number;            // kg
  axialOffset: number;     // meters from parent body tube front
  /**
   * User-entered packed envelope of the folded chute (Q2), meters. Absent =
   * missing: the chute is listed but excluded from clearance math and drawn
   * schematically, never sized by a physics-free heuristic. v1: not carried
   * by .ork/.rkt round-trips.
   */
  packedLengthM?: number;
  /** Packed envelope diameter, meters (see packedLengthM). */
  packedDiameterM?: number;
}

export type RocketComponent =
  | NoseconeComponent
  | BodyTubeComponent
  | TransitionComponent
  | TrapezoidFinSetComponent
  | EllipticalFinSetComponent
  | FreeformFinSetComponent
  | MassComponent
  | ParachuteComponent;

/**
 * Surface finishes the calibrated drag method knows, from smoothest to
 * roughest. Stored by name so a project stays readable without the engine's
 * roughness table.
 */
export const SURFACE_FINISH_NAMES = [
  'Smooth (Zero Roughness)',
  'Polished',
  'Sheet Metal',
  'Smooth Paint',
  'Camouflage Paint',
  'Rough Camouflage Paint',
  'Galvanized Metal',
  'Cast Iron (Very Rough)',
] as const;

export interface RocketVehicle {
  id: string;
  name: string;
  version: string;
  author: string;
  notes?: string;
  components: RocketComponent[];
  /** Launch site the vehicle flies from. Absent = sea level, standard day. */
  launchSite?: LaunchSite;
  /** Surface finish name (see SURFACE_FINISH_NAMES); absent = smooth/zero roughness. */
  surfaceFinish?: string;
  /** Force turbulent boundary-layer flow; absent = the method's laminar default. */
  forceTurbulentFlow?: boolean;
  /** Nozzle exit diameter, meters; absent = no sustainer nozzle. */
  nozzleExitDiameter?: number;
}

/**
 * Launch-site conditions. Altitude is the pad elevation ASL and feeds every
 * flight as the atmosphere's base altitude.
 */
export interface LaunchSite {
  /** meters above sea level */
  altitudeM: number;
}

export interface ComponentContribution {
  id: string;
  name: string;
  type: ComponentType;
  mass: number;          // kg
  cg: number;            // meters from nose tip
  cp?: number;           // meters from nose tip
  cna?: number;          // normal force derivative per radian
  axialStart: number;    // meters from nose tip
  axialEnd: number;      // meters from nose tip
}

export interface StabilityAnalysis {
  totalLength: number;            // meters
  maxDiameter: number;            // meters
  referenceDiameter: number;      // meters (typically body tube diameter)
  totalMass: number;              // kg
  cg: number;                     // meters from nose tip
  cp: number;                     // meters from nose tip
  staticMarginCalibers: number;   // (cp - cg) / refDiameter
  totalCNa: number;               // normal force derivative
  isStable: boolean;              // margin >= 1.0 caliber
  isOverStable: boolean;          // margin > 3.0 calibers (windcocking risk)
  contributions: ComponentContribution[];
  /** Set when the slope is unsupported: cp/margin are NaN and no verdict holds. */
  cpUnavailable?: string;
  /** Present only when the built-up provider produced the totals. */
  modelId?: string;
  modelVersion?: string;
  /** True when the totals have no labelled component breakdown under this model. */
  breakdownUnavailable?: boolean;
}
