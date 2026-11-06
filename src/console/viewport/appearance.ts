/**
 * Appearance rules for the 3D view: part colour and finish, section seams,
 * model bounds and the camera fit.
 *
 * Everything here is pure (data in, numbers out) so the look rules are covered
 * by unit tests instead of by staring at a screenshot. The geometry itself is
 * still whatever the native `layout` says — nothing here moves a part.
 */
import type { RocketVehicle, RocketComponent } from '../../core/types';
import type { Layout } from './Vehicle3D';
import { C } from '../kit/theme';

export interface PartAppearance {
  color: string;
  /** > 0 selects MeshPhysicalMaterial (a clearcoat finish). */
  clearcoat: number;
  metalness: number;
  roughness: number;
}

/** Colour of the selected part. Kept identical to the pre-existing accent. */
export const SELECTION_COLOR = C.accent;
/**
 * Multiplier applied to every other part while one part is selected (the
 * approved focus dim). Flat, this leaves the two palest shell tones at 2.8:1
 * against the accent — under a 3:1 floor — so the selected part also carries the
 * emissive lift below, and `selectionSeparation` measures the pair the material
 * actually renders rather than two flat swatches.
 */
export const SELECTION_DIM = 0.62;
/** Emissive strength of the selected part (approved design: 0.45). */
export const SELECTION_EMISSIVE = 0.45;
/** Fallback tone when a design carries neither a colour nor a known material. */
export const UNKNOWN_TONE = '#A7ACB3';
/** Seam ring colour: unlit near-black, so it reads as a joint in any light. */
export const SEAM_COLOR = '#050607';

/**
 * materialId → tone and surface finish. Fibreglass, carbon and the printed
 * plastics get a clearcoat; aluminium is metallic; cardboard and the woods stay
 * matte. The tones are deliberately low-chroma so a design colour always wins
 * the eye, but distinct enough that part boundaries still read.
 */
export const MATERIAL_APPEARANCE: Record<string, PartAppearance> = {
  fiberglass: { color: '#C3CBD3', clearcoat: 0.55, metalness: 0.05, roughness: 0.38 },
  carbonfiber: { color: '#2E3238', clearcoat: 0.7, metalness: 0.1, roughness: 0.32 },
  aluminum: { color: '#9BA3AC', clearcoat: 0, metalness: 0.9, roughness: 0.28 },
  cardboard: { color: '#A98A62', clearcoat: 0, metalness: 0, roughness: 0.85 },
  balsa: { color: '#C3A47A', clearcoat: 0, metalness: 0, roughness: 0.8 },
  plywood: { color: '#B08A5E', clearcoat: 0, metalness: 0, roughness: 0.75 },
  pla_3dprint: { color: '#7E8A93', clearcoat: 0.35, metalness: 0.05, roughness: 0.55 },
  abs_3dprint: { color: '#8A7F98', clearcoat: 0.35, metalness: 0.05, roughness: 0.55 },
  petg_3dprint: { color: '#7F9490', clearcoat: 0.45, metalness: 0.05, roughness: 0.45 },
};

/** Last resort per part type: the shell greys this view used before colours. */
const TYPE_APPEARANCE: Record<string, PartAppearance> = {
  nosecone: { color: '#C9CDD2', clearcoat: 0, metalness: 0.1, roughness: 0.6 },
  bodytube: { color: '#B7BCC2', clearcoat: 0, metalness: 0.1, roughness: 0.6 },
  transition: { color: '#9AA1A9', clearcoat: 0, metalness: 0.1, roughness: 0.6 },
  trapezoidfinset: { color: '#8E959D', clearcoat: 0, metalness: 0.1, roughness: 0.6 },
  ellipticalfinset: { color: '#8E959D', clearcoat: 0, metalness: 0.1, roughness: 0.6 },
  freeformfinset: { color: '#8E959D', clearcoat: 0, metalness: 0.1, roughness: 0.6 },
};
const UNKNOWN_APPEARANCE: PartAppearance = { color: UNKNOWN_TONE, clearcoat: 0, metalness: 0.1, roughness: 0.6 };

/**
 * A design colour, normalised to `#rrggbb`, or null when it is absent or not a
 * colour. Parsed here rather than handed to three: `new THREE.Color('nope')`
 * warns to the console and silently keeps the previous value.
 */
export function parsePartColor(value: string | undefined): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  const long = /^#([0-9a-f]{6})$/i.exec(text);
  if (long) return `#${long[1].toLowerCase()}`;
  return null;
}

/**
 * Colour source order: the design's own colour, then the material family, then
 * the part type. The finish follows the material even when the design sets the
 * colour, so a fibreglass tube painted cyan still looks like fibreglass.
 */
export function resolvePartAppearance(component: RocketComponent): PartAppearance {
  const own = parsePartColor(component.color);
  const family = MATERIAL_APPEARANCE[component.materialId];
  if (own) return { ...(family ?? UNKNOWN_APPEARANCE), color: own };
  return family ?? TYPE_APPEARANCE[component.type] ?? UNKNOWN_APPEARANCE;
}

/** Multiply a `#rrggbb` colour by `factor` in sRGB space, clamped. */
export function dimColor(color: string, factor = SELECTION_DIM): string {
  const hex = parsePartColor(color) ?? UNKNOWN_TONE;
  const channel = (i: number): string => {
    const value = Math.round(Math.min(255, Math.max(0, parseInt(hex.slice(i, i + 2), 16) * factor)));
    return value.toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/**
 * Final shell colour for a part. Hover never dims anything: only a real
 * selection does, and the selected part itself takes the accent.
 */
export function partTone(component: RocketComponent, look: { selected?: string | null; hovered?: string | null }): string {
  const selected = typeof look.selected === 'string' && look.selected !== '' ? look.selected : null;
  if (selected === component.id) return SELECTION_COLOR;
  const base = resolvePartAppearance(component).color;
  return selected !== null ? dimColor(base) : base;
}

/** WCAG relative luminance, for the selection-contrast test. */
export function relativeLuminance(color: string): number {
  const hex = parsePartColor(color) ?? UNKNOWN_TONE;
  const channel = (i: number): number => {
    const value = parseInt(hex.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The tone a selected part shows: the accent plus its own emissive lift,
 * combined in linear space the way the shader combines base colour and emissive
 * (tone mapping ignored, so this is the conservative, un-bloomed pair). Used by
 * `selectionSeparation` to keep the selection readable on every base tone.
 */
export function selectedTone(color = SELECTION_COLOR, emissive = SELECTION_EMISSIVE): string {
  const hex = parsePartColor(color) ?? SELECTION_COLOR;
  const linear = (value: number): number => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const channel = (i: number): string => {
    const value = Math.min(1, linear(parseInt(hex.slice(i, i + 2), 16) / 255) * (1 + emissive));
    const srgb = value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
    return Math.round(Math.min(1, Math.max(0, srgb)) * 255).toString(16).padStart(2, '0');
  };
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** Contrast between what a selected part shows and what a dimmed base tone shows. */
export function selectionSeparation(baseTone: string): number {
  return contrastRatio(selectedTone(), dimColor(baseTone));
}

/** Outer radius of a part that forms the hull, or null for internal parts. */
export function partRadius(component: RocketComponent): number | null {
  switch (component.type) {
    case 'nosecone': return component.baseDiameter / 2;
    case 'bodytube': return component.outerDiameter / 2;
    case 'transition': return Math.max(component.foreDiameter, component.aftDiameter) / 2;
    default: return null;
  }
}

export interface Seam { station: number; radius: number }

/**
 * Joints between consecutive hull parts: only where the two parts actually meet
 * axially and their radii agree within 2%, so a diameter step stays a step and
 * a nose tip or tail does not get a ring. Fins, mass and parachutes never
 * contribute.
 */
export function sectionJoints(vehicle: RocketVehicle, layout: Layout): Seam[] {
  const hull = vehicle.components
    .map((component) => ({ component, part: layout.parts[component.id], radius: partRadius(component) }))
    .filter((entry): entry is { component: RocketComponent; part: NonNullable<Layout['parts'][string]>; radius: number } =>
      entry.part !== undefined && entry.radius !== null)
    .sort((a, b) => a.part.start - b.part.start);
  const seams: Seam[] = [];
  for (let i = 1; i < hull.length; i++) {
    const before = hull[i - 1];
    const after = hull[i];
    if (Math.abs(before.part.end - after.part.start) > 1e-6) continue;
    const widest = Math.max(before.radius, after.radius);
    if (Math.abs(before.radius - after.radius) > 0.02 * widest) continue;
    seams.push({ station: after.part.start, radius: Math.min(before.radius, after.radius) * 1.004 });
  }
  return seams;
}

export interface Bounds { halfLength: number; radius: number }

/**
 * Box the camera has to frame: half the axial length, and the largest radial
 * extent including fin span. Internal parts do not count — they are not drawn
 * at rest. The box is used for the shadow frustum; the camera frames the
 * silhouette, which is a tighter target than the box.
 */
export function vehicleBounds(vehicle: RocketVehicle, layout: Layout): Bounds {
  let radius = layout.refR;
  for (const component of vehicle.components) {
    const hull = partRadius(component);
    if (hull !== null) radius = Math.max(radius, hull);
    const part = layout.parts[component.id];
    if (!part) continue;
    const root = layout.radiusAt(part.start);
    if (component.type === 'trapezoidfinset' || component.type === 'ellipticalfinset') {
      radius = Math.max(radius, root + component.span);
    } else if (component.type === 'freeformfinset') {
      const span = component.points.reduce((max, point) => Math.max(max, point.y), 0);
      radius = Math.max(radius, root + span);
    }
  }
  return { halfLength: Math.max(layout.length, 0.01) / 2, radius: Math.max(radius, 1e-3) };
}

