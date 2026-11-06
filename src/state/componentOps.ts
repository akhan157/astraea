/**
 * Pure vehicle-component operations for the part tree: add, remove, reorder.
 *
 * Each returns the next vehicle component list, or a refusal naming why; a
 * refusal never mutates anything (fail closed). The store wraps these in one
 * undoable project edit per operation.
 */
import type { ComponentType, RocketComponent } from '../core/types';

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
      return { id, name: 'Airframe Tube', type, length: 0.4, outerDiameter: d, innerDiameter: Math.max(0, d - 0.003), materialId: 'cardboard', color: '#ffffff' };
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

/** Append a new component of `type`; the new part becomes the selection. */
export function addComponentOp(components: readonly RocketComponent[], type: ComponentType, referenceDiameterM: number): ComponentOpResult {
  if (!ADDABLE_COMPONENTS.some((c) => c.type === type)) return { ok: false, reason: `Unknown component type '${String(type)}'.` };
  const added = defaultComponent(type, nextComponentId(components, type), referenceDiameterM);
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
