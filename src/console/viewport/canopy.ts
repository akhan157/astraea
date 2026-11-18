/**
 * The parachute open at a moment of flight playback (P3 polish): after the run's
 * recorded drogue event the drogue's canopy, after its main event the main's.
 *
 * Which chute is the drogue and which the main comes from the same rule the
 * engine flew (`sim/parachuteRoles.ts`), and the open moments come only from
 * the run's own recorded events, so the drawing never shows a canopy the run
 * did not deploy. The drawing is schematic in placement (the canopy sits above
 * the rocket on lines to its middle); only the diameter is to scale.
 */
import type { RocketComponent } from '../../core/types';
import { resolveRecoveryChutes } from '../../sim/parachuteRoles';
import type { Vector } from './framing';

export interface OpenCanopy {
  role: 'drogue' | 'main';
  /** Canopy diameter, metres (to scale in the drawing). */
  diameterM: number;
  name: string;
}

/** The canopy open at playback time `t`, or null before the first deployment or with no chute. */
export function canopyAt(
  events: readonly { kind: string; t: number }[],
  t: number | null | undefined,
  components: readonly RocketComponent[],
): OpenCanopy | null {
  if (t === null || t === undefined || !Number.isFinite(t)) return null;
  const chutes = resolveRecoveryChutes(components);
  if (!chutes.ok) return null;
  const main = events.find((e) => e.kind === 'main');
  if (main !== undefined && t >= main.t && chutes.main !== null) {
    return { role: 'main', diameterM: chutes.main.diameter, name: chutes.main.name };
  }
  const drogue = events.find((e) => e.kind === 'apogee_drogue');
  if (drogue !== undefined && t >= drogue.t && chutes.drogue !== null) {
    return { role: 'drogue', diameterM: chutes.drogue.diameter, name: chutes.drogue.name };
  }
  return null;
}

/** Shroud lines drawn from the rocket's middle to the canopy rim. */
export const CANOPY_LINES = 8;

export interface CanopyGeometry {
  /** Canopy radius, metres. */
  radius: number;
  /** Height of the canopy rim above the rocket's middle, metres. */
  rimY: number;
}

/**
 * Where the canopy is drawn, relative to the rocket's middle (the pose pivot),
 * in world axes (up = +Y). The rim sits one canopy radius above the sphere that
 * contains the rocket in every attitude, so no pose can poke through it.
 */
export function canopyGeometry(diameterM: number, envelopeRadiusM: number): CanopyGeometry {
  const radius = Math.max(diameterM, 1e-3) / 2;
  return { radius, rimY: envelopeRadiusM + radius };
}

/** Points on the drawn canopy (rim ring and dome top), relative to the rocket's middle, for framing. */
export function canopyPoints(geometry: CanopyGeometry, samples = 16): Vector[] {
  const points: Vector[] = [{ x: 0, y: geometry.rimY + geometry.radius, z: 0 }];
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    points.push({ x: Math.cos(a) * geometry.radius, y: geometry.rimY, z: Math.sin(a) * geometry.radius });
  }
  return points;
}
