/**
 * Pure vehicle-component operations for the part tree: add, remove, reorder.
 *
 * Each returns the next vehicle component list, or a refusal naming why; a
 * refusal never mutates anything (fail closed). The store wraps these in one
 * undoable project edit per operation.
 */
import type { BodyTubeComponent, ComponentType, RocketComponent } from '../core/types';

export type ComponentOpResult =
  | { ok: true; components: RocketComponent[]; selectId: string | null }
  | { ok: false; reason: string };

/** Every component type the tree can add, with its menu label. */
export const ADDABLE_COMPONENTS: { type: ComponentType; label: string }[] = [
  { type: 'nosecone', label: 'Nose cone' },
  { type: 'bodytube', label: 'Body tube' },
  { type: 'transition', label: 'Transition (shoulder / boattail)' },
  { type: 'trapezoidfinset', label: 'Trapezoidal fin set' },
  { type: 'ellipticalfinset', label: 'Elliptical fin set' },
  { type: 'freeformfinset', label: 'Freeform fin set' },
  { type: 'parachute', label: 'Recovery parachute' },
  { type: 'masscomponent', label: 'Internal mass / avionics' }
];

/** Smallest unused `<type>-<n>` id, so new parts never collide with existing ones. */
export function nextComponentId(existing: readonly RocketComponent[], type: ComponentType): string {
  const taken = new Set(existing.map((c) => c.id));
  for (let n = 1; ; n += 1) {
    const id = `${type}-${n}`;
    if (!taken.has(id)) return id;
  }
}

/** Wall of the starter body tube (1.5 mm), used when no tube precedes it to copy. */
const STARTER_TUBE_WALL_M = 0.003;

/**
 * A starter component of `type`, sized from the vehicle's reference diameter
 * (metres). The values are editable starting points, not engine output.
 */
export function defaultComponent(type: ComponentType, id: string, referenceDiameterM: number): RocketComponent {
  const d = Number.isFinite(referenceDiameterM) && referenceDiameterM > 0 ? referenceDiameterM : 0.05;
  switch (type) {
    case 'nosecone':
      return { id, name: 'Ogive Nosecone', type, shape: 'ogive', length: 0.2, baseDiameter: d, wallThickness: 0.002, isHollow: true, materialId: 'pla_3dprint', color: '#38bdf8' };
    case 'bodytube':
      return { id, name: 'Airframe Tube', type, length: 0.4, outerDiameter: d, innerDiameter: Math.max(0, d - STARTER_TUBE_WALL_M), materialId: 'cardboard', color: '#ffffff' };
    case 'transition':
      return { id, name: 'Boattail Transition', type, length: 0.08, foreDiameter: d, aftDiameter: d * 0.85, wallThickness: 0.002, isHollow: true, materialId: 'aluminum', color: '#71717a' };
    case 'trapezoidfinset':
      return { id, name: 'Trapezoidal Fins', type, finCount: 3, rootChord: 0.1, tipChord: 0.04, span: 0.06, sweepLength: 0.04, thickness: 0.003, crossSection: 'rounded', axialOffset: 0.25, materialId: 'plywood', color: '#38bdf8' };
    case 'ellipticalfinset':
      return { id, name: 'Elliptical Fins', type, finCount: 3, rootChord: 0.1, span: 0.06, thickness: 0.003, axialOffset: 0.25, materialId: 'plywood', color: '#38bdf8' };
    case 'freeformfinset':
      return { id, name: 'Freeform Fins', type, finCount: 3, points: [{ x: 0, y: 0 }, { x: 0.04, y: 0.06 }, { x: 0.08, y: 0.06 }, { x: 0.1, y: 0 }], thickness: 0.003, crossSection: 'rounded', axialOffset: 0.25, materialId: 'plywood', color: '#38bdf8' };
    case 'parachute':
      return { id, name: 'Recovery Parachute', type, diameter: 0.45, cd: 0.8, mass: 0.025, axialOffset: 0.05, materialId: 'cardboard' };
    case 'masscomponent':
      return { id, name: 'Altimeter Bay Mass', type, mass: 0.05, length: 0.05, axialOffset: 0.05, materialId: 'cardboard' };
  }
}

/* ───────────── neighbour-aware placement for an appended part ───────────── */

const positive = (value: number | undefined): value is number => value !== undefined && Number.isFinite(value) && value > 0;

/** Diameter at the aft end of a hull part (nose, tube, transition); null for anything else. */
function aftDiameterOf(component: RocketComponent): number | null {
  switch (component.type) {
    case 'nosecone': return positive(component.baseDiameter) ? component.baseDiameter : null;
    case 'bodytube': return positive(component.outerDiameter) ? component.outerDiameter : null;
    case 'transition': return positive(component.aftDiameter) ? component.aftDiameter : null;
    default: return null;
  }
}

/** Aft diameter of the last hull part in the list: the one an appended hull part follows. */
function lastHullDiameter(components: readonly RocketComponent[]): number | null {
  for (let i = components.length - 1; i >= 0; i -= 1) {
    const d = aftDiameterOf(components[i]);
    if (d !== null) return d;
  }
  return null;
}

/**
 * The tube an appended child attaches to. The mass rollup places fins, mass
 * items and parachutes from the most recent body tube before them in the list
 * (`core/mass.ts` `lastBodyTubeStart`), and a new part is appended, so its
 * parent is the last body tube in the list.
 */
function lastBodyTube(components: readonly RocketComponent[]): BodyTubeComponent | null {
  for (let i = components.length - 1; i >= 0; i -= 1) {
    const candidate = components[i];
    if (candidate.type === 'bodytube') return candidate;
  }
  return null;
}

function firstBodyTube(components: readonly RocketComponent[]): BodyTubeComponent | null {
  return components.find((c): c is BodyTubeComponent => c.type === 'bodytube') ?? null;
}

/** Root chord of the starter fin, for the aft-flush placement. */
function starterRootChord(component: RocketComponent): number {
  switch (component.type) {
    case 'trapezoidfinset':
    case 'ellipticalfinset':
      return component.rootChord;
    case 'freeformfinset':
      return component.points[component.points.length - 1]?.x ?? 0;
    default:
      return 0;
  }
}

/**
 * Packed extent the mass rollup gives an internal part (`core/mass.ts`: a
 * parachute without a packed length occupies 0.05 m), so "inside its tube"
 * means the same thing here as in the rollup and the inspector's bound check.
 */
function internalExtent(component: RocketComponent): number {
  if (component.type === 'parachute') return component.packedLengthM ?? 0.05;
  if (component.type === 'masscomponent') return component.length;
  return 0;
}

/**
 * A starter part fitted to the parts it joins. Only diameters and positions
 * follow the neighbours; lengths, chords and masses stay the starter values,
 * because a proportion invented here would change a flight nobody asked to
 * change.
 *
 * - Nose cone: the first body tube's diameter (it caps the airframe).
 * - Body tube: the diameter of the hull part before it, and the wall of the
 *   nearest tube before it when there is one.
 * - Transition: its fore end matches the hull part before it.
 * - Fin sets: flush with the aft end of their parent tube (offset = tube
 *   length − root chord, never negative), instead of a fixed 250 mm.
 * - Parachute and mass item: inside their parent tube, at the starter's 50 mm
 *   from its front when that fits, else pulled forward so their packed extent
 *   ends at the tube's aft end.
 *
 * With no neighbour to follow, the starter sized from the reference diameter
 * is returned unchanged.
 */
export function fittedComponent(components: readonly RocketComponent[], type: ComponentType, id: string, referenceDiameterM: number): RocketComponent {
  const starter = defaultComponent(type, id, referenceDiameterM);
  const parent = lastBodyTube(components);
  switch (starter.type) {
    case 'nosecone': {
      const first = firstBodyTube(components);
      return first !== null && positive(first.outerDiameter) ? { ...starter, baseDiameter: first.outerDiameter } : starter;
    }
    case 'bodytube': {
      const d = lastHullDiameter(components);
      if (d === null) return starter;
      const wall = parent !== null && parent.outerDiameter > parent.innerDiameter ? parent.outerDiameter - parent.innerDiameter : STARTER_TUBE_WALL_M;
      return { ...starter, outerDiameter: d, innerDiameter: Math.max(0, d - wall) };
    }
    case 'transition': {
      const d = lastHullDiameter(components);
      return d === null ? starter : { ...starter, foreDiameter: d, aftDiameter: d * 0.85 };
    }
    case 'trapezoidfinset':
    case 'ellipticalfinset':
    case 'freeformfinset': {
      if (parent === null || !positive(parent.length)) return starter;
      return { ...starter, axialOffset: Math.max(0, parent.length - starterRootChord(starter)) };
    }
    case 'parachute':
    case 'masscomponent': {
      if (parent === null || !positive(parent.length)) return starter;
      return { ...starter, axialOffset: Math.max(0, Math.min(starter.axialOffset, parent.length - internalExtent(starter))) };
    }
  }
}

/** Append a new component of `type`, fitted to its neighbours; the new part becomes the selection. */
export function addComponentOp(components: readonly RocketComponent[], type: ComponentType, referenceDiameterM: number): ComponentOpResult {
  if (!ADDABLE_COMPONENTS.some((c) => c.type === type)) return { ok: false, reason: `Unknown component type '${String(type)}'.` };
  const added = fittedComponent(components, type, nextComponentId(components, type), referenceDiameterM);
  return { ok: true, components: [...components, added], selectId: added.id };
}

/** Remove a component. The last remaining component is never removed. */
export function removeComponentOp(components: readonly RocketComponent[], id: string, selectedId: string | null): ComponentOpResult {
  const idx = components.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, reason: 'That part no longer exists.' };
  if (components.length <= 1) return { ok: false, reason: 'A vehicle needs at least one part; add another before removing this one.' };
  const next = components.filter((c) => c.id !== id);
  if (selectedId !== null && selectedId !== id && next.some((c) => c.id === selectedId)) return { ok: true, components: next, selectId: selectedId };
  return { ok: true, components: next, selectId: (next[Math.min(idx, next.length - 1)] ?? next[0]).id };
}

/** Move a component one step toward the nose (-1) or the tail (+1) of the list. */
export function moveComponentOp(components: readonly RocketComponent[], id: string, delta: -1 | 1): ComponentOpResult {
  const idx = components.findIndex((c) => c.id === id);
  if (idx < 0) return { ok: false, reason: 'That part no longer exists.' };
  const to = idx + delta;
  if (to < 0) return { ok: false, reason: 'That part is already first.' };
  if (to >= components.length) return { ok: false, reason: 'That part is already last.' };
  const next = [...components];
  [next[idx], next[to]] = [next[to], next[idx]];
  return { ok: true, components: next, selectId: id };
}
