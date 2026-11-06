/**
 * Parent-tube axial bounds for inspector sliders. The engine places fin sets,
 * mass items and parachutes relative to the most recent body tube before them
 * (`core/mass.ts` `lastBodyTubeStart`), so the inspector caps their offset with
 * the same rule instead of inventing a second one.
 *
 * Tube-length edits also move fin sets with the tube's aft end: the anchor
 * helpers below capture the length and fin offsets at gesture start and turn a
 * new length into one atomic patch list. Parachutes and mass items stay
 * front-anchored.
 */
import type {
  BodyTubeComponent,
  EllipticalFinSetComponent,
  FreeformFinSetComponent,
  RocketComponent,
  TrapezoidFinSetComponent,
} from '../../core/types';
import { freeformExtents } from '../../aero/finPlanform';

type FinSetComponent = TrapezoidFinSetComponent | EllipticalFinSetComponent | FreeformFinSetComponent;

export interface ParentAxialBounds {
  parent: BodyTubeComponent;
  /** Child extent measured from its axial offset (the part attached to the tube). */
  extent: number;
  /** Largest axial offset that keeps the child's extent inside the parent. */
  offsetMax: number;
}

/** The nearest body tube before this component, or null when none precedes it. */
export function parentTubeOf(components: readonly RocketComponent[], index: number): BodyTubeComponent | null {
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = components[i];
    if (candidate.type === 'bodytube') return candidate;
  }
  return null;
}

/**
 * Axial extent of a tube child from its offset datum. Fins use the root chord:
 * swept tips legitimately overhang a tube's aft end. The parachute uses the
 * same packed length as the mass rollup (`packedLengthM ?? 0.05`).
 */
export function childAxialExtent(component: RocketComponent): number {
  switch (component.type) {
    case 'trapezoidfinset':
    case 'ellipticalfinset':
      return component.rootChord;
    case 'freeformfinset':
      return freeformExtents(component.points).rootChord;
    case 'masscomponent':
      return component.length;
    case 'parachute':
      return component.packedLengthM ?? 0.05;
    default:
      return 0;
  }
}

export function parentAxialBounds(
  components: readonly RocketComponent[],
  index: number,
  component: RocketComponent,
): ParentAxialBounds | null {
  const parent = parentTubeOf(components, index);
  if (parent === null) return null;
  const extent = childAxialExtent(component);
  return { parent, extent, offsetMax: Math.max(0, parent.length - extent) };
}

export interface TubeChildEnd {
  component: RocketComponent;
  /** Axial end measured from the tube's front. */
  end: number;
}

/** Children whose parent is the tube at `tubeIndex`, with their axial ends. */
export function tubeChildEnds(components: readonly RocketComponent[], tubeIndex: number): TubeChildEnd[] {
  const tube = components[tubeIndex];
  if (tube === undefined || tube.type !== 'bodytube') return [];
  const ends: TubeChildEnd[] = [];
  for (let i = 0; i < components.length; i += 1) {
    const component = components[i];
    if (component.type !== 'trapezoidfinset'
      && component.type !== 'ellipticalfinset'
      && component.type !== 'freeformfinset'
      && component.type !== 'masscomponent'
      && component.type !== 'parachute') continue;
    if (parentTubeOf(components, i)?.id !== tube.id) continue;
    ends.push({ component, end: component.axialOffset + childAxialExtent(component) });
  }
  return ends;
}

/* ───────────── aft-anchored tube-length edits ───────────── */

function isFinSet(component: RocketComponent): component is FinSetComponent {
  return component.type === 'trapezoidfinset'
    || component.type === 'ellipticalfinset'
    || component.type === 'freeformfinset';
}

/** Fin sets whose parent is the tube at `tubeIndex`, in component order. */
function tubeFinSets(components: readonly RocketComponent[], tubeIndex: number): FinSetComponent[] {
  const tube = components[tubeIndex];
  if (tube === undefined || tube.type !== 'bodytube') return [];
  const fins: FinSetComponent[] = [];
  for (let i = 0; i < components.length; i += 1) {
    const component = components[i];
    if (isFinSet(component) && parentTubeOf(components, i)?.id === tube.id) fins.push(component);
  }
  return fins;
}

export interface TubeAnchor {
  /** Tube length at gesture start, metres. */
  length: number;
  /** Fin offsets at gesture start, so every step shifts from the same base. */
  fins: Array<{ id: string; axialOffset: number }>;
}

/**
 * Snapshot of what a tube-length gesture preserves: the length the drag
 * started from and the axial offset of every fin set attached to the tube.
 */
export function captureTubeAnchor(components: readonly RocketComponent[], tubeIndex: number): TubeAnchor | null {
  const tube = components[tubeIndex];
  if (tube === undefined || tube.type !== 'bodytube') return null;
  return {
    length: tube.length,
    fins: tubeFinSets(components, tubeIndex).map((fin) => ({ id: fin.id, axialOffset: fin.axialOffset })),
  };
}

/**
 * Smallest length that keeps the tube's children valid after the anchored
 * edit. Front-anchored children (mass, parachute) stay put, so their end is the
 * floor. Fin sets slide with the aft end, so their floor is the length at which
 * the leading edge reaches the tube front: `length - axialOffset`, which equals
 * root chord plus the fin's current aft margin.
 */
export function tubeLengthFloor(components: readonly RocketComponent[], tubeIndex: number): number {
  const tube = components[tubeIndex];
  if (tube === undefined || tube.type !== 'bodytube') return 0;
  let floor = 0;
  for (let i = 0; i < components.length; i += 1) {
    const component = components[i];
    if (!isFinSet(component) && component.type !== 'masscomponent' && component.type !== 'parachute') continue;
    if (parentTubeOf(components, i)?.id !== tube.id) continue;
    const term = isFinSet(component)
      ? tube.length - component.axialOffset
      : component.axialOffset + childAxialExtent(component);
    if (term > floor) floor = term;
  }
  return floor;
}

/**
 * Patches that set the tube length and move every attached fin set by the same
 * delta, keeping each fin's distance from the tube's aft end. The delta is
 * measured from the gesture-start anchor, so repeated steps cannot drift.
 */
export function tubeLengthPatches(
  components: readonly RocketComponent[],
  tubeIndex: number,
  anchor: TubeAnchor,
  nextLength: number,
): Array<{ id: string; patch: Partial<RocketComponent> }> {
  const tube = components[tubeIndex];
  if (tube === undefined || tube.type !== 'bodytube') return [];
  const patches: Array<{ id: string; patch: Partial<RocketComponent> }> = [{ id: tube.id, patch: { length: nextLength } }];
  const delta = nextLength - anchor.length;
  // Always re-derive every fin offset from the anchor. A drag can return to the
  // start length after moving away (delta 0) while the fins still carry the
  // previous step's offset; skipping them here would break the aft margin.
  const live = new Map(tubeFinSets(components, tubeIndex).map((fin) => [fin.id, fin.axialOffset]));
  for (const fin of anchor.fins) {
    const currentOffset = live.get(fin.id);
    if (currentOffset === undefined) continue;
    const target = fin.axialOffset + delta;
    if (currentOffset === target) continue;
    patches.push({ id: fin.id, patch: { axialOffset: target } });
  }
  return patches;
}
