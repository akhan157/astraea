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
}

export const STANDARD_MATERIALS: Record<string, Material> = {
  cardboard: { id: 'cardboard', name: 'Kraft Cardboard', density: 680 },
  fiberglass: { id: 'fiberglass', name: 'G10 Fiberglass', density: 1850 },
  carbonfiber: { id: 'carbonfiber', name: 'Carbon Fiber', density: 1550 },
  balsa: { id: 'balsa', name: 'Balsa Wood', density: 160 },
  plywood: { id: 'plywood', name: 'Aircraft Plywood', density: 680 },
  aluminum: { id: 'aluminum', name: '6061-T6 Aluminum', density: 2700 },
  pla_3dprint: { id: 'pla_3dprint', name: 'PLA 3D Print', density: 1250 },
  abs_3dprint: { id: 'abs_3dprint', name: 'ABS 3D Print', density: 1040 },
  petg_3dprint: { id: 'petg_3dprint', name: 'PETG 3D Print', density: 1270 },
};

export type ComponentType =
  | 'nosecone'
  | 'bodytube'
  | 'transition'
  | 'trapezoidfinset'
  | 'ellipticalfinset'
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
}

export interface TransitionComponent extends BaseComponent {
  type: 'transition';
  length: number;          // meters
  foreDiameter: number;    // meters
  aftDiameter: number;     // meters
  wallThickness: number;   // meters
  isHollow: boolean;
}

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
}

export interface EllipticalFinSetComponent extends BaseComponent {
  type: 'ellipticalfinset';
  finCount: number;
  rootChord: number;       // meters
  span: number;            // meters
  thickness: number;       // meters
  axialOffset: number;     // meters from parent body tube front
}

export interface MassComponent extends BaseComponent {
  type: 'masscomponent';
  mass: number;            // kg
  length: number;          // meters
  axialOffset: number;     // meters from parent body tube front
}

export interface ParachuteComponent extends BaseComponent {
  type: 'parachute';
  diameter: number;        // meters
  cd: number;              // drag coefficient, typically 0.8 - 1.5
  mass: number;            // kg
  axialOffset: number;     // meters from parent body tube front
}

export type RocketComponent =
  | NoseconeComponent
  | BodyTubeComponent
  | TransitionComponent
  | TrapezoidFinSetComponent
  | EllipticalFinSetComponent
  | MassComponent
  | ParachuteComponent;

export interface RocketVehicle {
  id: string;
  name: string;
  version: string;
  author: string;
  notes?: string;
  components: RocketComponent[];
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
}
